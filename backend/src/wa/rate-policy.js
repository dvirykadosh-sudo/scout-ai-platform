// שלב 58 – מנגנון Anti-Ban: כל ההחלטות "האם מותר לשלוח עכשיו" נמצאות כאן, כפונקציות טהורות (בלי מסד נתונים).
// העקרונות: קצב אנושי (השהיות אקראיות), מכסות לדקה/שעה/יום, חימום מספר חדש, שעות שקט, ועצירה אחרי כישלונות.
// אין שיטה שמבטלת לגמרי את הסיכון לחסימה של וואטסאפ. המנגנון רק מקטין אותו.
import { hmToMinutes, ilParts } from "./il-time.js";
import { z } from "zod";

export const DEFAULTS = Object.freeze({
  enabled: true,
  minGapSec: 8,
  maxGapSec: 22,
  perCharMs: 35,
  maxPerMinute: 3,
  maxPerHour: 40,
  maxPerDay: 150,
  perContactCooldownSec: 45,
  quietFrom: "22:00",
  quietTo: "07:00",
  pauseShabbat: false,
  warmup: true,
  breakerFails: 4,
  breakerPauseMin: 30,
  botEnabled: false,
  botGroups: false,
  maxQueue: 500,
});

const hm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "שעה בפורמט HH:MM");
/** תקרות קשיחות: גם אדמין לא יכול להגדיר קצב מסוכן במיוחד. */
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    minGapSec: z.number().int().min(3).max(300),
    maxGapSec: z.number().int().min(3).max(600),
    perCharMs: z.number().int().min(0).max(120),
    maxPerMinute: z.number().int().min(1).max(10),
    maxPerHour: z.number().int().min(1).max(200),
    maxPerDay: z.number().int().min(1).max(1000),
    perContactCooldownSec: z.number().int().min(0).max(3600),
    quietFrom: hm,
    quietTo: hm,
    pauseShabbat: z.boolean(),
    warmup: z.boolean(),
    breakerFails: z.number().int().min(2).max(20),
    breakerPauseMin: z.number().int().min(5).max(720),
    botEnabled: z.boolean(),
    botGroups: z.boolean(),
    maxQueue: z.number().int().min(10).max(1000),
  })
  .partial()
  .refine((s) => s.minGapSec === undefined || s.maxGapSec === undefined || s.maxGapSec >= s.minGapSec, { message: "ההשהיה המרבית קטנה מהמינימלית", path: ["maxGapSec"] });

/** מיזוג ברירות מחדל עם ההגדרות השמורות (ערכים לא תקינים נופלים חזרה לברירת מחדל). */
export function mergeSettings(stored = {}) {
  const out = { ...DEFAULTS };
  for (const [k, v] of Object.entries(stored || {})) if (k in DEFAULTS && typeof v === typeof DEFAULTS[k]) out[k] = v;
  if (out.maxGapSec < out.minGapSec) out.maxGapSec = out.minGapSec;
  return out;
}

/** האם הרגע הנתון בשעות שקט (בשעון ישראל). תומך בחלון שחוצה חצות (22:00–07:00). */
export function inQuietHours(nowMs, s) {
  const from = hmToMinutes(s.quietFrom), to = hmToMinutes(s.quietTo);
  if (Number.isNaN(from) || Number.isNaN(to) || from === to) return false;
  const m = ilParts(nowMs).minutes;
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/** שבת בקירוב: שישי 16:00 עד שבת 20:00 בשעון ישראל. אפשר להשבית בהגדרות. */
export function inShabbat(nowMs) {
  const { weekday, minutes } = ilParts(nowMs);
  return (weekday === 5 && minutes >= 16 * 60) || (weekday === 6 && minutes < 20 * 60);
}

/** מכסה יומית בפועל. בחימום: 25 ביום הראשון, 40, 60, 80, ואז המכסה המלאה. */
export function dailyCap(s, firstSendAtMs, nowMs) {
  if (!s.warmup || !firstSendAtMs) return s.warmup ? Math.min(s.maxPerDay, 25) : s.maxPerDay;
  const day = Math.floor((nowMs - firstSendAtMs) / 86_400_000);
  const ramp = [25, 40, 60, 80][day];
  return ramp ? Math.min(s.maxPerDay, ramp) : s.maxPerDay;
}

/**
 * ההשהיה עד ההודעה הבאה: אקראית בין min ל-max, ועוד זמן "הקלדה" לפי אורך ההודעה.
 * spam=true (אותה הודעה נשלחה להרבה אנשים) מאריך ב-80%.
 */
export function gapMs(s, textLen = 0, rand = Math.random, spam = false) {
  const base = (s.minGapSec + rand() * (s.maxGapSec - s.minGapSec)) * 1000;
  const typing = Math.min(8000, textLen * s.perCharMs);
  return Math.round((base + typing) * (spam ? 1.8 : 1));
}

/** זמן ההקלדה שהגשר ידמה לפני השליחה (קצר מההשהיה, בין 0.8 ל-6 שניות). */
export const typingMs = (s, textLen, rand = Math.random) => Math.round(Math.min(6000, 800 + textLen * s.perCharMs * (0.6 + rand() * 0.6)));

/** כמה זמן עד סוף שעות השקט (מילישניות), לחישוב "נסו שוב בעוד". */
function untilQuietEnds(nowMs, s) {
  const to = hmToMinutes(s.quietTo);
  const m = ilParts(nowMs).minutes;
  const diff = (to - m + 1440) % 1440 || 1440;
  return diff * 60_000;
}

/**
 * ההחלטה המרכזית. state: { now, nextAllowedAt, breakerUntil, counts:{minute,hour,day}, firstSendAt }.
 * job: { priority }. תשובות לפונים (priority<=2) לא נחסמות בשעות שקט, אבל כן בשאר המגבלות.
 * מחזיר { allowed, reason, retryInMs }.
 */
export function decide(s, state, job = { priority: 5 }) {
  const { now } = state;
  if (!s.enabled) return { allowed: false, reason: "paused", retryInMs: 60_000 };
  if (state.breakerUntil && state.breakerUntil > now) return { allowed: false, reason: "breaker", retryInMs: Math.min(state.breakerUntil - now, 120_000) };
  const reply = (job.priority ?? 5) <= 2;
  if (!reply && inQuietHours(now, s)) return { allowed: false, reason: "quiet", retryInMs: Math.min(untilQuietEnds(now, s), 300_000) };
  if (!reply && s.pauseShabbat && inShabbat(now)) return { allowed: false, reason: "shabbat", retryInMs: 300_000 };
  if (state.nextAllowedAt && state.nextAllowedAt > now) return { allowed: false, reason: "gap", retryInMs: state.nextAllowedAt - now };
  if (state.counts.minute >= s.maxPerMinute) return { allowed: false, reason: "minute", retryInMs: 15_000 };
  if (state.counts.hour >= s.maxPerHour) return { allowed: false, reason: "hour", retryInMs: 60_000 };
  if (state.counts.day >= dailyCap(s, state.firstSendAt, now)) return { allowed: false, reason: "day", retryInMs: 300_000 };
  return { allowed: true, reason: "ok", retryInMs: 0 };
}

/** הסבר בעברית לסיבת ההמתנה, לתצוגה בלוח. */
export const REASON_TEXT = {
  ok: "מוכן לשליחה",
  paused: "השליחה מושהית בהגדרות",
  breaker: "נעצר זמנית אחרי כשלונות רצופים",
  quiet: "שעות שקט",
  shabbat: "שבת",
  gap: "מחכה להשהיה בין הודעות",
  minute: "הגענו למכסת הדקה",
  hour: "הגענו למכסת השעה",
  day: "הגענו למכסה היומית",
  cooldown: "ממתין להפסקה בין הודעות לאותו איש קשר",
  bridge: "אין גשר מחובר",
};

/** אחרי כשלון: זמן ההמתנה לניסיון הבא (דקות, מוכפל בכל ניסיון). */
export const retryDelayMs = (attempt) => Math.min(60, 2 ** attempt) * 60_000;

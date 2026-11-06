// שלב 58 – תזמון אוטומטי: כללים שבועיים ותזכורות לפני פעולות מלוח השנה, וניקוי תקופתי.
// הכללים רק יוצרים משימות בתור (עם מפתח כפילות), ולכן הרצה כפולה בטוחה. השליחה עצמה עוברת ב-queue.js.
import { z } from "zod";
import * as repo from "./repo.js";
import { enqueueMany, sweep } from "./queue.js";
import { loadSettings } from "./settings.js";
import { hebrewDate, hmToMinutes, ilParts, ilToUtc, DAY_NAMES } from "./il-time.js";
import { renderTemplate, valuesFor, validateTemplate } from "./templates.js";
import { upcomingForUser, addDays } from "./site-data.js";

const CATCHUP_MS = 3 * 3_600_000; // כלל שבועי שהוחמץ (השרת ישן) ירוץ עד 3 שעות באיחור, לא יותר
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);
const body = z.string().min(1).max(4000).refine((b) => validateTemplate(b).ok, { message: "התבנית לא תקינה (משתנה לא מוכר או ריקה)" });

export const ruleSchemas = {
  weekly: z.object({ weekday: z.number().int().min(0).max(6), time: hhmm, contactIds: z.array(z.number().int()).min(1).max(60), body, rsvp: z.boolean().optional(), eventTitle: z.string().max(80).optional(), eventOffsetDays: z.number().int().min(0).max(7).default(0) }),
  before_activity: z.object({ hoursBefore: z.number().int().min(1).max(72), body, alsoContactIds: z.array(z.number().int()).max(30).default([]) }),
};
export const RULE_KINDS = Object.keys(ruleSchemas);

/** תיאור קצר של כלל בעברית, לתצוגה ברשימה. */
export function describeRule(r) {
  const c = r.config;
  if (r.kind === "weekly") return `כל יום ${DAY_NAMES[c.weekday]} ב-${c.time} ל-${c.contactIds.length} אנשי קשר${c.rsvp ? " (עם אישור הגעה)" : ""}`;
  return `${c.hoursBefore} שעות לפני כל פעולה ביומן, למדריך עצמו${c.alsoContactIds?.length ? ` ול-${c.alsoContactIds.length} נוספים` : ""}`;
}

const idsToContacts = (db, ids) => ids.map((id) => repo.getContact(db, id)).filter((c) => c && !c.optedOut);

/** כלל שבועי: ביום ובשעה שנקבעו, שולח לרשימה. */
function runWeekly(db, settings, rule, nowMs) {
  const c = rule.config;
  const today = ilParts(nowMs);
  if (today.weekday !== c.weekday) return 0;
  const at = ilToUtc(today.date, c.time);
  if (Number.isNaN(at) || nowMs < at || nowMs - at > CATCHUP_MS) return 0;
  if (rule.lastRunAt && Date.parse(rule.lastRunAt) >= at) return 0;
  const eventDate = addDays(today.date, c.eventOffsetDays ?? 0);
  const extra = { date: hebrewDate(eventDate), day: DAY_NAMES[ilParts(ilToUtc(eventDate, "12:00")).weekday], event: c.eventTitle || "", time: c.time };
  const eventKey = c.rsvp ? `rule:${rule.id}:${eventDate}` : undefined;
  const contacts = idsToContacts(db, c.contactIds);
  const out = enqueueMany(db, settings, contacts, (ct) => renderTemplate(c.rsvp ? `${c.body}\n\nאישור הגעה: השיבו 1 = מגיע/ה, 2 = לא מגיע/ה, 3 = אולי` : c.body, valuesFor(ct, extra)), { runAtMs: nowMs, source: "rule", ruleId: rule.id, eventKey, eventTitle: c.eventTitle || rule.name, expectsRsvp: !!c.rsvp, dedupeKey: `rule:${rule.id}:${today.date}`, createdBy: "rule" });
  repo.touchRule(db, rule.id, new Date(nowMs).toISOString());
  return out.created.length;
}

/** תזכורת לפני פעולה: לכל אירוע ביומן של מדריך שמחובר לאיש קשר, N שעות לפני. */
function runBeforeActivity(db, settings, rule, nowMs) {
  const c = rule.config;
  const today = ilParts(nowMs).date;
  let created = 0;
  const users = db.prepare("SELECT DISTINCT user_id FROM wa_contacts WHERE user_id IS NOT NULL AND opted_out = 0").all().map((r) => r.user_id);
  const extraContacts = idsToContacts(db, c.alsoContactIds ?? []);
  for (const userId of users) {
    for (const s of upcomingForUser(db, userId, { fromDate: today, days: 4, limit: 20 })) {
      if (!s.time || Number.isNaN(hmToMinutes(s.time))) continue;
      const start = ilToUtc(s.date, s.time);
      if (!(nowMs >= start - c.hoursBefore * 3_600_000 && nowMs < start)) continue;
      const days = Math.max(0, Math.round((Date.parse(`${s.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000));
      const extra = { activity: s.title || "פעולה", event: s.title || "", date: hebrewDate(s.date), day: DAY_NAMES[ilParts(start).weekday], time: s.time, place: "", note: s.note || "", daysUntil: String(days), battalion: s.group_label || "" };
      const owners = repo.contactsByUser(db, userId);
      const out = enqueueMany(db, settings, [...owners, ...extraContacts], (ct) => renderTemplate(c.body, valuesFor(ct, { ...extra, battalion: extra.battalion || ct.battalion })), { runAtMs: nowMs, source: "reminder", ruleId: rule.id, dedupeKey: `rem:${rule.id}:${s.id}`, priority: 4, createdBy: "rule" });
      created += out.created.length;
    }
  }
  if (created) repo.touchRule(db, rule.id, new Date(nowMs).toISOString());
  return created;
}

/** מריץ את כל הכללים הפעילים. מחזיר כמה משימות נוצרו. */
export function runRules(db, nowMs = Date.now()) {
  const settings = loadSettings(db);
  let created = 0;
  for (const rule of repo.listRules(db)) {
    if (!rule.enabled) continue;
    try {
      created += rule.kind === "weekly" ? runWeekly(db, settings, rule, nowMs) : runBeforeActivity(db, settings, rule, nowMs);
    } catch (e) {
      repo.insertLog(db, { status: "rule_error", detail: `כלל "${rule.name}": ${e?.message ?? e}`, source: "rule" });
    }
  }
  return created;
}

/** פעימה אחת: ניקוי + כללים. */
export function tick(db, nowMs = Date.now()) {
  sweep(db, nowMs);
  return runRules(db, nowMs);
}

/** מפעיל את הפעימות כל 30 שניות (לא מחזיק את התהליך חי). מחזיר פונקציית עצירה. */
export function startWaScheduler(db, everyMs = 30_000) {
  const timer = setInterval(() => {
    try { tick(db); } catch (e) { console.error("wa scheduler:", e?.message ?? e); }
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

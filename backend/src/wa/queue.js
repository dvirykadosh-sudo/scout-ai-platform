// שלב 58 – תור ההודעות: יצירת משימות, חכירה לגשר אחת-אחת בקצב מבוקר, סיום, ניסיון חוזר וניקוי.
// ההחלטה "מתי מותר לשלוח" נמצאת ב-rate-policy.js; כאן רק מחברים אותה למסד.
import { cleanText, MAX_BODY } from "./templates.js";
import { decide, gapMs, retryDelayMs, typingMs } from "./rate-policy.js";
import { numKv, setNumKv } from "./settings.js";
import * as repo from "./repo.js";
import { waHint } from "./phone.js";

const LEASE_MS = 90_000; // כמה זמן הגשר מחזיק משימה לפני שהיא חוזרת לתור
const iso = (ms) => new Date(ms).toISOString();
const MAX_AGE_REPLY_PRIORITY = 2;

/** מוסיף משימה לתור. מחזיר { ok, id } או { ok:false, reason } (למשל: הוסר מהרשימה, התור מלא, כפילות). */
export function enqueue(db, settings, { contact, waId, name, body, runAtMs = Date.now(), source = "manual", ruleId, eventKey, eventTitle, expectsRsvp, dedupeKey, priority = 5, createdBy }) {
  const text = cleanText(body);
  if (!text) return { ok: false, reason: "empty" };
  if (String(body).length > MAX_BODY) return { ok: false, reason: "too_long" };
  const to = contact?.waId ?? waId;
  if (!to) return { ok: false, reason: "no_recipient" };
  if (contact?.optedOut && source !== "bot-optout") return { ok: false, reason: "opted_out" };
  if (repo.queuedCount(db) >= settings.maxQueue) return { ok: false, reason: "queue_full" };
  try {
    const id = repo.insertJob(db, { contactId: contact?.id, waId: to, contactName: contact?.name ?? name, body: text, runAt: iso(runAtMs), source, ruleId, eventKey, eventTitle, expectsRsvp, dedupeKey, priority, createdBy });
    return { ok: true, id };
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message)) && dedupeKey) return { ok: false, reason: "duplicate" };
    throw e;
  }
}

/** שולח אותה הודעה (או תבנית שנוצרת לכל נמען) לכמה אנשי קשר. render(contact) מחזיר { text, missing }. */
export function enqueueMany(db, settings, contacts, render, opts) {
  const created = [], skipped = [];
  for (const c of contacts) {
    const r = render(c);
    if (r.missing?.length) { skipped.push({ name: c.name, reason: `חסר ערך עבור: ${r.missing.map((m) => `{{${m}}}`).join(", ")}` }); continue; }
    const out = enqueue(db, settings, { ...opts, contact: c, body: r.text, dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${c.id}` : undefined });
    if (out.ok) created.push(out.id);
    else skipped.push({ name: c.name, reason: REASON_HE[out.reason] ?? out.reason });
  }
  return { created, skipped };
}
const REASON_HE = { empty: "הודעה ריקה", too_long: "הודעה ארוכה מדי", no_recipient: "אין נמען", opted_out: "הוסר מהרשימה", queue_full: "התור מלא", duplicate: "כבר נשלחה" };

/** מצב הקצב הנוכחי (מונים, השהיה, עצירה) לפי המסד. */
function paceState(db, nowMs) {
  return { now: nowMs, nextAllowedAt: numKv(db, "next_allowed_at"), breakerUntil: numKv(db, "breaker_until"), counts: repo.sentCounts(db, nowMs), firstSendAt: numKv(db, "first_send_at") };
}

/** מחזיר חכירות שפג תוקפן לתור (הגשר נפל באמצע שליחה). לא נחשב כשלון של איש הקשר. */
export function releaseExpired(db, nowMs = Date.now()) {
  let n = 0;
  for (const j of repo.expiredLeases(db, iso(nowMs))) {
    const final = j.attempts >= j.maxAttempts;
    if (final) repo.markFailed(db, j.id, "הגשר לא דיווח תוצאה");
    else repo.requeue(db, j.id, iso(nowMs + 30_000), "הגשר לא דיווח תוצאה");
    repo.insertLog(db, { jobId: j.id, contactName: j.contactName, hint: waHint(j.waId), status: final ? "failed" : "lease_expired", detail: "הגשר לא דיווח תוצאה", source: j.source });
    n++;
  }
  return n;
}

/**
 * הגשר שואל "יש מה לשלוח?". מחזיר לכל היותר משימה אחת, ורק כשהקצב מאפשר.
 * תוצאה: { job } או { job:null, retryInMs, reason }.
 */
export function leaseNext(db, settings, { bridgeId, nowMs = Date.now(), rand = Math.random }) {
  releaseExpired(db, nowMs);
  const state = paceState(db, nowMs);
  const cands = repo.dueJobs(db, iso(nowMs), 12);
  if (!cands.length) return { job: null, retryInMs: 4000, reason: "empty" };
  let blocked = null;
  for (const j of cands) {
    const d = decide(settings, state, j);
    if (!d.allowed) { blocked ??= d; if (["breaker", "paused", "minute", "hour", "day", "gap"].includes(d.reason)) break; continue; }
    if (j.contactId && j.priority > MAX_AGE_REPLY_PRIORITY && settings.perContactCooldownSec > 0) {
      const last = repo.contactLastSent(db, j.contactId);
      if (last && nowMs - Date.parse(last) < settings.perContactCooldownSec * 1000) { blocked ??= { reason: "cooldown", retryInMs: 5000 }; continue; }
    }
    if (!repo.leaseJob(db, j.id, iso(nowMs + LEASE_MS), bridgeId)) continue;
    return { job: { id: j.id, to: j.waId, text: j.body, typingMs: typingMs(settings, (j.body || "").length, rand) } };
  }
  return { job: null, retryInMs: Math.max(1500, Math.min(blocked?.retryInMs ?? 4000, 60_000)), reason: blocked?.reason ?? "empty" };
}

/**
 * הגשר מדווח תוצאה. מחזיר { ok:false, code } אם המשימה לא שייכת לו או לא בחכירה.
 * onBreaker נקרא כשהעצירה האוטומטית מופעלת (להתראה לאדמין).
 */
export function completeJob(db, settings, { jobId, bridgeId, ok, error, permanent, nowMs = Date.now(), rand = Math.random, onBreaker }) {
  const raw = db.prepare("SELECT * FROM wa_jobs WHERE id = ?").get(jobId);
  if (!raw) return { ok: false, code: "not_found" };
  if (raw.status !== "leased" || raw.bridge_id !== bridgeId) return { ok: false, code: "not_leased" };
  const job = repo.jobOut(raw);
  const log = (status, detail) => repo.insertLog(db, { jobId, contactName: job.contactName, hint: waHint(job.waId), status, detail, source: job.source });
  if (ok) {
    repo.markSent(db, jobId);
    if (!numKv(db, "first_send_at")) setNumKv(db, "first_send_at", nowMs);
    const spam = repo.sameBodyRecipients(db, job.body, iso(nowMs - 600_000)) >= 5;
    setNumKv(db, "next_allowed_at", nowMs + gapMs(settings, (job.body || "").length, rand, spam));
    setNumKv(db, "fails", 0);
    log("sent", spam ? "נשלח (הושהה יותר כי אותו טקסט נשלח להרבה אנשים)" : null);
    return { ok: true, status: "sent" };
  }
  const msg = String(error || "שגיאה לא ידועה").slice(0, 200);
  const final = !!permanent || job.attempts >= job.maxAttempts;
  if (final) repo.markFailed(db, jobId, msg);
  else repo.requeue(db, jobId, iso(nowMs + retryDelayMs(job.attempts)), msg);
  log(final ? "failed" : "retry", msg);
  // כשלון של מספר שלא קיים בוואטסאפ הוא בעיה של איש הקשר ולא של החיבור, ולכן לא נספר לעצירה האוטומטית
  if (!permanent) {
    const fails = numKv(db, "fails") + 1;
    setNumKv(db, "fails", fails);
    if (fails >= settings.breakerFails) {
      setNumKv(db, "breaker_until", nowMs + settings.breakerPauseMin * 60_000);
      setNumKv(db, "fails", 0);
      repo.insertLog(db, { status: "breaker", detail: `עצירה אוטומטית ל-${settings.breakerPauseMin} דקות אחרי ${fails} כשלונות רצופים` });
      onBreaker?.(settings.breakerPauseMin, fails);
    }
  }
  return { ok: true, status: final ? "failed" : "retry" };
}

/** ניקוי תקופתי: חכירות שפגו, גוף הודעות ישנות (30 יום), שורות ישנות (90 יום), יומן (180 יום), הודעות נכנסות (14 יום). */
export function sweep(db, nowMs = Date.now()) {
  const released = releaseExpired(db, nowMs);
  const day = 86_400_000;
  repo.purgeJobs(db, iso(nowMs - 30 * day), iso(nowMs - 90 * day));
  repo.purgeLog(db, iso(nowMs - 180 * day));
  repo.purgeInbox(db, iso(nowMs - 14 * day));
  return { released };
}

/** תמונת מצב לממשק: ספירות, ההשהיה הבאה, עצירה, מכסות. */
export function overview(db, settings, nowMs = Date.now()) {
  const st = paceState(db, nowMs);
  const d = decide(settings, st, { priority: 5 });
  return { counts: repo.countByStatus(db), queued: repo.queuedCount(db), sent: st.counts, nextAllowedInMs: Math.max(0, st.nextAllowedAt - nowMs), breakerUntil: st.breakerUntil > nowMs ? iso(st.breakerUntil) : null, reason: d.reason, retryInMs: d.retryInMs };
}

/** ביטול העצירה האוטומטית ידנית. */
export const clearBreaker = (db) => { setNumKv(db, "breaker_until", 0); setNumKv(db, "fails", 0); };

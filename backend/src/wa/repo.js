// שלב 58 – גישה לנתוני הוואטסאפ. רק SQL: בלי החלטות עסקיות, בלי בדיקות הרשאה.
// כל הקלט נכנס כפרמטרים. המרת שורות לאובייקטים נעשית כאן כדי ששאר הקוד לא יכיר שמות עמודות.

const now = () => new Date().toISOString();
const one = (db, sql, ...p) => db.prepare(sql).get(...p) ?? null;
const all = (db, sql, ...p) => db.prepare(sql).all(...p);
const run = (db, sql, ...p) => db.prepare(sql).run(...p);
const like = (q) => `%${String(q).replace(/[\\%_]/g, "\\$&")}%`;

// ───────────── הגדרות ומצב קבוע (key/value) ─────────────
export const kvGet = (db, key) => one(db, "SELECT value FROM wa_settings WHERE key = ?", key)?.value ?? null;
export const kvSet = (db, key, value) => run(db, "INSERT INTO wa_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, String(value));
export const kvDel = (db, key) => run(db, "DELETE FROM wa_settings WHERE key = ?", key);
export const storedSettings = (db) => {
  try { return JSON.parse(kvGet(db, "settings") || "{}"); } catch { return {}; }
};

// ───────────── גשרים ─────────────
const bridgeOut = (r) => r && { id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, lastSeenAt: r.last_seen_at, lastState: r.last_state, phoneHint: r.phone_hint, version: r.version, revokedAt: r.revoked_at };
export const insertBridge = (db, { name, tokenHash, by }) => Number(run(db, "INSERT INTO wa_bridges (name, token_hash, created_by, created_at) VALUES (?,?,?,?)", name, tokenHash, by ?? null, now()).lastInsertRowid);
export const findBridgeByHash = (db, hash) => bridgeOut(one(db, "SELECT * FROM wa_bridges WHERE token_hash = ? AND revoked_at IS NULL", hash));
export const listBridges = (db) => all(db, "SELECT * FROM wa_bridges ORDER BY id DESC").map(bridgeOut);
export const activeBridgeCount = (db) => one(db, "SELECT COUNT(*) AS c FROM wa_bridges WHERE revoked_at IS NULL").c;
export const revokeBridge = (db, id) => run(db, "UPDATE wa_bridges SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now(), id).changes;
export const touchBridge = (db, id, { state, phoneHint, version }) =>
  run(db, "UPDATE wa_bridges SET last_seen_at = ?, last_state = COALESCE(?, last_state), phone_hint = COALESCE(?, phone_hint), version = COALESCE(?, version) WHERE id = ?", now(), state ?? null, phoneHint ?? null, version ?? null, id);

// ───────────── אנשי קשר ─────────────
export const contactOut = (r) => r && { id: r.id, kind: r.kind, name: r.name, waId: r.wa_id, battalion: r.battalion || "", role: r.role || "", audience: r.audience, userId: r.user_id, optedOut: !!r.opted_out, botAllowed: !!r.bot_allowed, note: r.note || "", createdAt: r.created_at };
export function listContacts(db, { kind, audience, q } = {}) {
  const w = [], p = [];
  if (kind) { w.push("kind = ?"); p.push(kind); }
  if (audience) { w.push("audience = ?"); p.push(audience); }
  if (q) { w.push("(name LIKE ? ESCAPE '\\' OR battalion LIKE ? ESCAPE '\\')"); p.push(like(q), like(q)); }
  return all(db, `SELECT * FROM wa_contacts ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY kind, name LIMIT 500`, ...p).map(contactOut);
}
export const getContact = (db, id) => contactOut(one(db, "SELECT * FROM wa_contacts WHERE id = ?", id));
export const getContactByWaId = (db, waId) => contactOut(one(db, "SELECT * FROM wa_contacts WHERE wa_id = ?", waId));
export const contactsByUser = (db, userId) => all(db, "SELECT * FROM wa_contacts WHERE user_id = ? AND kind = 'person' AND opted_out = 0", userId).map(contactOut);
export const countContacts = (db) => one(db, "SELECT COUNT(*) AS c FROM wa_contacts").c;
export function insertContact(db, c) {
  const t = now();
  return Number(run(db, "INSERT INTO wa_contacts (kind, name, wa_id, battalion, role, audience, user_id, opted_out, bot_allowed, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", c.kind, c.name, c.waId, c.battalion || null, c.role || null, c.audience, c.userId ?? null, c.optedOut ? 1 : 0, c.botAllowed ? 1 : 0, c.note || null, t, t).lastInsertRowid);
}
export function updateContact(db, id, c) {
  return run(db, "UPDATE wa_contacts SET name = ?, battalion = ?, role = ?, audience = ?, user_id = ?, opted_out = ?, bot_allowed = ?, note = ?, updated_at = ? WHERE id = ?", c.name, c.battalion || null, c.role || null, c.audience, c.userId ?? null, c.optedOut ? 1 : 0, c.botAllowed ? 1 : 0, c.note || null, now(), id).changes;
}
export const setOptedOut = (db, id, v) => run(db, "UPDATE wa_contacts SET opted_out = ?, updated_at = ? WHERE id = ?", v ? 1 : 0, now(), id).changes;
export const deleteContact = (db, id) => run(db, "DELETE FROM wa_contacts WHERE id = ?", id).changes;

// ───────────── תבניות ─────────────
const tplOut = (r) => r && { id: r.id, name: r.name, category: r.category, body: r.body, updatedAt: r.updated_at };
export const listTemplates = (db) => all(db, "SELECT * FROM wa_templates ORDER BY category, name").map(tplOut);
export const getTemplate = (db, id) => tplOut(one(db, "SELECT * FROM wa_templates WHERE id = ?", id));
export const countTemplates = (db) => one(db, "SELECT COUNT(*) AS c FROM wa_templates").c;
export function insertTemplate(db, t) {
  const n = now();
  return Number(run(db, "INSERT INTO wa_templates (name, category, body, created_at, updated_at) VALUES (?,?,?,?,?)", t.name, t.category, t.body, n, n).lastInsertRowid);
}
export const updateTemplate = (db, id, t) => run(db, "UPDATE wa_templates SET name = ?, category = ?, body = ?, updated_at = ? WHERE id = ?", t.name, t.category, t.body, now(), id).changes;
export const deleteTemplate = (db, id) => run(db, "DELETE FROM wa_templates WHERE id = ?", id).changes;

// ───────────── תור ההודעות ─────────────
export const jobOut = (r) => r && { id: r.id, contactId: r.contact_id, waId: r.wa_id, contactName: r.contact_name, body: r.body, status: r.status, priority: r.priority, runAt: r.run_at, attempts: r.attempts, maxAttempts: r.max_attempts, error: r.error, source: r.source, ruleId: r.rule_id, eventKey: r.event_key, eventTitle: r.event_title, expectsRsvp: !!r.expects_rsvp, createdBy: r.created_by, createdAt: r.created_at, sentAt: r.sent_at };
export function insertJob(db, j) {
  return Number(run(db, "INSERT INTO wa_jobs (contact_id, wa_id, contact_name, body, status, priority, run_at, max_attempts, source, rule_id, event_key, event_title, expects_rsvp, dedupe_key, created_by, created_at) VALUES (?,?,?,?, 'queued', ?,?,?,?,?,?,?,?,?,?,?)",
    j.contactId ?? null, j.waId, j.contactName ?? null, j.body, j.priority ?? 5, j.runAt, j.maxAttempts ?? 3, j.source ?? "manual", j.ruleId ?? null, j.eventKey ?? null, j.eventTitle ?? null, j.expectsRsvp ? 1 : 0, j.dedupeKey ?? null, j.createdBy ?? null, now()).lastInsertRowid);
}
export const getJob = (db, id) => jobOut(one(db, "SELECT * FROM wa_jobs WHERE id = ?", id));
export function listJobs(db, { status, contactId, source, eventKey, limit = 100, offset = 0 } = {}) {
  const w = [], p = [];
  if (status) { w.push(`status IN (${status.split(",").map(() => "?").join(",")})`); p.push(...status.split(",")); }
  if (contactId) { w.push("contact_id = ?"); p.push(contactId); }
  if (source) { w.push("source = ?"); p.push(source); }
  if (eventKey) { w.push("event_key = ?"); p.push(eventKey); }
  return all(db, `SELECT * FROM wa_jobs ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, Math.min(limit, 500), offset).map(jobOut);
}
/** משימות שהגיע זמנן, לפי עדיפות ואז סדר יצירה. */
export const dueJobs = (db, nowIso, limit = 10) => all(db, "SELECT * FROM wa_jobs WHERE status = 'queued' AND run_at <= ? ORDER BY priority, run_at, id LIMIT ?", nowIso, limit).map(jobOut);
export const leaseJob = (db, id, untilIso, bridgeId) => run(db, "UPDATE wa_jobs SET status = 'leased', lease_until = ?, bridge_id = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'", untilIso, bridgeId, id).changes;
export const markSent = (db, id) => run(db, "UPDATE wa_jobs SET status = 'sent', sent_at = ?, lease_until = NULL, error = NULL WHERE id = ?", now(), id).changes;
export const markFailed = (db, id, error) => run(db, "UPDATE wa_jobs SET status = 'failed', lease_until = NULL, error = ? WHERE id = ?", String(error ?? "").slice(0, 300), id).changes;
export const requeue = (db, id, runAtIso, error) => run(db, "UPDATE wa_jobs SET status = 'queued', lease_until = NULL, bridge_id = NULL, run_at = ?, error = ? WHERE id = ?", runAtIso, String(error ?? "").slice(0, 300), id).changes;
export const expiredLeases = (db, nowIso) => all(db, "SELECT * FROM wa_jobs WHERE status = 'leased' AND lease_until < ?", nowIso).map(jobOut);
export const cancelJob = (db, id) => run(db, "UPDATE wa_jobs SET status = 'cancelled', lease_until = NULL WHERE id = ? AND status IN ('queued','failed')", id).changes;
export const retryJob = (db, id, runAtIso) => run(db, "UPDATE wa_jobs SET status = 'queued', attempts = 0, error = NULL, run_at = ? WHERE id = ? AND status = 'failed'", runAtIso, id).changes;
export const skipJob = (db, id, why) => run(db, "UPDATE wa_jobs SET status = 'skipped', error = ? WHERE id = ? AND status = 'queued'", why, id).changes;
export const queuedCount = (db) => one(db, "SELECT COUNT(*) AS c FROM wa_jobs WHERE status IN ('queued','leased')").c;
export const countByStatus = (db) => Object.fromEntries(all(db, "SELECT status, COUNT(*) AS c FROM wa_jobs GROUP BY status").map((r) => [r.status, r.c]));
export function sentCounts(db, nowMs) {
  const c = (ms) => one(db, "SELECT COUNT(*) AS c FROM wa_jobs WHERE status = 'sent' AND sent_at >= ?", new Date(nowMs - ms).toISOString()).c;
  return { minute: c(60_000), hour: c(3_600_000), day: c(86_400_000) };
}
export const contactLastSent = (db, contactId) => one(db, "SELECT MAX(sent_at) AS t FROM wa_jobs WHERE status = 'sent' AND contact_id = ?", contactId)?.t ?? null;
/** כמה אנשים שונים קיבלו (או עומדים לקבל) בדיוק את אותו טקסט ב-10 הדקות האחרונות: סימן ל"ספאם". */
export const sameBodyRecipients = (db, body, sinceIso) => one(db, "SELECT COUNT(DISTINCT wa_id) AS c FROM wa_jobs WHERE body = ? AND status IN ('sent','leased') AND COALESCE(sent_at, created_at) >= ?", body, sinceIso).c;
export const pendingRsvpJob = (db, contactId, sinceIso) => jobOut(one(db, "SELECT * FROM wa_jobs WHERE contact_id = ? AND expects_rsvp = 1 AND status = 'sent' AND sent_at >= ? ORDER BY sent_at DESC LIMIT 1", contactId, sinceIso));
export const purgeJobs = (db, bodyBeforeIso, rowBeforeIso) => {
  run(db, "UPDATE wa_jobs SET body = NULL WHERE created_at < ? AND body IS NOT NULL AND status IN ('sent','failed','cancelled','skipped')", bodyBeforeIso);
  return run(db, "DELETE FROM wa_jobs WHERE created_at < ? AND status IN ('sent','failed','cancelled','skipped')", rowBeforeIso).changes;
};

// ───────────── יומן ─────────────
export const insertLog = (db, l) => run(db, "INSERT INTO wa_log (at, job_id, contact_name, wa_hint, status, detail, source) VALUES (?,?,?,?,?,?,?)", now(), l.jobId ?? null, l.contactName ?? null, l.hint ?? null, l.status, l.detail ? String(l.detail).slice(0, 300) : null, l.source ?? null);
export function listLog(db, { status, q, limit = 100, offset = 0 } = {}) {
  const w = [], p = [];
  if (status) { w.push("status = ?"); p.push(status); }
  if (q) { w.push("(contact_name LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')"); p.push(like(q), like(q)); }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const total = one(db, `SELECT COUNT(*) AS c FROM wa_log ${where}`, ...p).c;
  const rows = all(db, `SELECT * FROM wa_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, Math.min(limit, 1000), offset);
  return { total, rows: rows.map((r) => ({ id: r.id, at: r.at, jobId: r.job_id, contactName: r.contact_name, hint: r.wa_hint, status: r.status, detail: r.detail, source: r.source })) };
}
export const purgeLog = (db, beforeIso) => run(db, "DELETE FROM wa_log WHERE at < ?", beforeIso).changes;
/** מספר הודעות לפי יום וסטטוס, לגרף. */
export const statsByDay = (db, sinceIso) => all(db, "SELECT substr(at, 1, 10) AS day, status, COUNT(*) AS c FROM wa_log WHERE at >= ? AND status IN ('sent','failed') GROUP BY day, status ORDER BY day", sinceIso);

// ───────────── כללי אוטומציה ─────────────
const ruleOut = (r) => {
  if (!r) return null;
  let config = {};
  try { config = JSON.parse(r.config); } catch { /* שורה פגומה: ללא הגדרות */ }
  return { id: r.id, name: r.name, kind: r.kind, enabled: !!r.enabled, config, lastRunAt: r.last_run_at, createdBy: r.created_by, createdAt: r.created_at };
};
export const listRules = (db) => all(db, "SELECT * FROM wa_rules ORDER BY id DESC").map(ruleOut);
export const getRule = (db, id) => ruleOut(one(db, "SELECT * FROM wa_rules WHERE id = ?", id));
export const countRules = (db) => one(db, "SELECT COUNT(*) AS c FROM wa_rules").c;
export const insertRule = (db, r) => Number(run(db, "INSERT INTO wa_rules (name, kind, enabled, config, created_by, created_at) VALUES (?,?,?,?,?,?)", r.name, r.kind, r.enabled ? 1 : 0, JSON.stringify(r.config), r.createdBy ?? null, now()).lastInsertRowid);
export const updateRule = (db, id, r) => run(db, "UPDATE wa_rules SET name = ?, enabled = ?, config = ? WHERE id = ?", r.name, r.enabled ? 1 : 0, JSON.stringify(r.config), id).changes;
export const touchRule = (db, id, iso) => run(db, "UPDATE wa_rules SET last_run_at = ? WHERE id = ?", iso, id);
export const deleteRule = (db, id) => run(db, "DELETE FROM wa_rules WHERE id = ?", id).changes;

// ───────────── אישורי הגעה ─────────────
export const setRsvp = (db, eventKey, contactId, answer) => run(db, "INSERT INTO wa_rsvp (event_key, contact_id, answer, at) VALUES (?,?,?,?) ON CONFLICT(event_key, contact_id) DO UPDATE SET answer = excluded.answer, at = excluded.at", eventKey, contactId, answer, now());
/** סיכום לאירוע: לכל מי ששלחנו לו הודעת אישור (גם אם עוד לא ענה). */
export function rsvpSummary(db, eventKey) {
  const rows = all(db, `SELECT c.id, c.name, c.battalion, r.answer, r.at FROM (SELECT DISTINCT contact_id FROM wa_jobs WHERE event_key = ? AND expects_rsvp = 1 AND status = 'sent') j
    JOIN wa_contacts c ON c.id = j.contact_id LEFT JOIN wa_rsvp r ON r.contact_id = c.id AND r.event_key = ? ORDER BY c.name`, eventKey, eventKey);
  const out = { yes: 0, no: 0, maybe: 0, none: 0, people: rows.map((r) => ({ id: r.id, name: r.name, battalion: r.battalion || "", answer: r.answer || null, at: r.at || null })) };
  for (const r of rows) out[r.answer || "none"]++;
  return out;
}
export const rsvpEvents = (db) => all(db, "SELECT event_key AS key, MAX(event_title) AS title, MAX(sent_at) AS lastSent, COUNT(DISTINCT contact_id) AS sent FROM wa_jobs WHERE expects_rsvp = 1 AND event_key IS NOT NULL AND status = 'sent' GROUP BY event_key ORDER BY lastSent DESC LIMIT 30");

// ───────────── הודעות נכנסות ─────────────
export const insertInbox = (db, i) => run(db, "INSERT OR IGNORE INTO wa_inbox (msg_id, at, contact_id, is_group, text, handled) VALUES (?,?,?,?,?,?)", i.msgId ?? null, now(), i.contactId ?? null, i.isGroup ? 1 : 0, i.text ?? null, i.handled ?? null).changes;
export const inboxSeen = (db, msgId) => !!(msgId && one(db, "SELECT 1 AS x FROM wa_inbox WHERE msg_id = ?", msgId));
export const listInbox = (db, { contactId, limit = 100 } = {}) =>
  all(db, `SELECT i.*, c.name FROM wa_inbox i LEFT JOIN wa_contacts c ON c.id = i.contact_id ${contactId ? "WHERE i.contact_id = ?" : ""} ORDER BY i.id DESC LIMIT ?`, ...(contactId ? [contactId] : []), Math.min(limit, 300))
    .map((r) => ({ id: r.id, at: r.at, contactId: r.contact_id, contactName: r.name || "", isGroup: !!r.is_group, text: r.text || "", handled: r.handled || "" }));
export const botRepliesSince = (db, contactId, sinceIso) => one(db, "SELECT COUNT(*) AS c FROM wa_jobs WHERE contact_id = ? AND source = 'bot' AND created_at >= ?", contactId, sinceIso).c;
export const purgeInbox = (db, beforeIso) => run(db, "DELETE FROM wa_inbox WHERE at < ?", beforeIso).changes;

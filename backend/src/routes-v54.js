// שלב 54 (423–452): ניטור ואמינות, דגלי תכונות, חיפוש חכם, כיסוי המאגר, תגובות, שביעות רצון, חותמות איכות ואומדן עלות.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { optionalAuth, signToken } from "./auth.js";
import { backupDirFor, createBackup, listBackups } from "./backup.js";
import { DEFAULT_PRICES, estimateCost } from "./cost.js";
import { rowToActivity } from "./activities.js";
import { maintenanceMessage } from "./ops.js";
import { smartSearch } from "./smart-search.js";
import { GRADES } from "./shared/constants.js";
import { guestDailyCap } from "./guest-limits.js";

const nowIso = () => new Date().toISOString();
const sha = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
const pageOk = (p) => (typeof p === "string" && /^\/[\w\-./%~]*$/.test(p) ? p.slice(0, 120) : "");
export const EMOJIS = ["👍", "❤️", "💡", "🔥", "👏"];
const VITAL_LIMITS = { LCP: [2500, 4000, 60000], FCP: [1800, 3000, 60000], INP: [200, 500, 30000], CLS: [0.1, 0.25, 10], TTFB: [800, 1800, 60000] };
const PKG = (() => { try { return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")); } catch { return {}; } })();
const GRADE_KEYS = GRADES;

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/** מכריע אם דגל פעיל עבור נושא (משתמש או כתובת): התפלגות יציבה לפי גיבוב. */
export function flagOn(row, subject) {
  if (!row || !row.enabled) return false;
  if (row.percent >= 100) return true;
  if (row.percent <= 0) return false;
  return parseInt(sha(`${row.key}|${subject}`).slice(0, 6), 16) % 100 < row.percent;
}

/** מפת כיסוי: ערך מוביל × כיתה, עם הפערים הבולטים. */
export function coverageMatrix(activities) {
  const gradeOf = (ag) => GRADE_KEYS.find((g) => new RegExp(`כיתה\\s*${g.replace("'", "['׳]?")}(?![א-ת])`).test(ag)) || null;
  const cells = new Map();
  const totals = new Map();
  for (const a of activities) {
    const v = String(a.leadingValue || "").trim() || "ללא ערך";
    const g = gradeOf(a.ageGroup || "");
    totals.set(v, (totals.get(v) || 0) + 1);
    if (g) { const k = `${v}|${g}`; cells.set(k, (cells.get(k) || 0) + 1); }
  }
  const values = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([v]) => v);
  const gradesUsed = GRADE_KEYS.slice(0, 10);
  const matrix = values.map((v) => ({ value: v, total: totals.get(v), counts: Object.fromEntries(gradesUsed.map((g) => [g, cells.get(`${v}|${g}`) || 0])) }));
  const gaps = [];
  for (const row of matrix) for (const g of gradesUsed) if (row.counts[g] === 0) gaps.push({ value: row.value, grade: g, weight: row.total });
  gaps.sort((a, b) => b.weight - a.weight || GRADE_KEYS.indexOf(a.grade) - GRADE_KEYS.indexOf(b.grade));
  const gradeTotals = Object.fromEntries(gradesUsed.map((g) => [g, matrix.reduce((s, r) => s + r.counts[g], 0)]));
  const thin = gradesUsed.filter((g) => gradeTotals[g] === 0);
  return { grades: gradesUsed, matrix, gradeTotals, gaps: gaps.slice(0, 8).map(({ value, grade }) => ({ value, grade, text: `אין פעולה בערך "${value}" לכיתה ${grade}` })), emptyGrades: thin, activities: activities.length };
}

export function registerV54Routes(app, { db, dbFile, limiter, fail, requireUser, requireAdmin, audit, mailer, config, bootedAt }) {
  const F = (res, status, code, message) => res.status(status).json(fail(code, message));
  const ip = (req) => req.ip || "";
  const subjectOf = (req) => { const u = optionalAuth(req); return u ? `u${u.id}` : `i${sha(ip(req)).slice(0, 10)}`; };
  const lightLim = limiter(60_000, 30);

  // ───── 429: לכידת שגיאות מהדפדפן ─────
  const errBody = z.object({ message: z.string().max(600), stack: z.string().max(3000).optional(), page: z.string().max(200).optional() });
  app.post("/api/client-error", lightLim, guestDailyCap({ label: "client-error", max: 60, guestsOnly: false, message: "יותר מדי דיווחי שגיאה מהכתובת הזו היום." }), (req, res) => {
    const b = errBody.safeParse(req.body ?? {});
    if (!b.success) return F(res, 400, "VALIDATION", "בקשה לא תקינה");
    const clean = (s) => String(s || "").replace(/https?:\/\/[^\s)]+/g, (u) => { try { return new URL(u).pathname; } catch { return "url"; } }).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>");
    const message = clean(b.data.message).slice(0, 300);
    const stack = clean(b.data.stack).slice(0, 1500);
    const frame = (stack.split("\n").find((l) => /\bat\b|@/.test(l)) || "").trim().replace(/\d+/g, "#");
    const sig = sha(message.replace(/\d+/g, "#") + frame).slice(0, 12);
    const u = optionalAuth(req);
    const recent = db.prepare("SELECT COUNT(*) AS c FROM client_errors WHERE sig = ? AND created_at > ?").get(sig, new Date(Date.now() - 3600_000).toISOString()).c;
    if (recent < 8) db.prepare("INSERT INTO client_errors (sig, message, stack, page, ua, user_id, created_at) VALUES (?,?,?,?,?,?,?)").run(sig, message, stack, pageOk(b.data.page), String(req.headers["user-agent"] || "").slice(0, 140), u?.id ?? null, nowIso());
    db.prepare("DELETE FROM client_errors WHERE id NOT IN (SELECT id FROM client_errors ORDER BY id DESC LIMIT 4000)").run();
    res.status(204).end();
  });

  // ───── 430: מדדי ביצועים אמיתיים ─────
  let vitalsN = 0;
  const vitalBody = z.object({ metric: z.enum(["LCP", "FCP", "INP", "CLS", "TTFB"]), value: z.number().finite(), page: z.string().max(200).optional() });
  app.post("/api/vitals", lightLim, guestDailyCap({ label: "vitals", max: 400, guestsOnly: false, message: "יותר מדי מדידות מהכתובת הזו היום." }), (req, res) => {
    const arr = Array.isArray(req.body?.metrics) ? req.body.metrics.slice(0, 6) : [req.body];
    let saved = 0;
    for (const m of arr) {
      const v = vitalBody.safeParse(m ?? {});
      if (!v.success) continue;
      const [, , max] = VITAL_LIMITS[v.data.metric];
      if (v.data.value < 0 || v.data.value > max) continue;
      db.prepare("INSERT INTO web_vitals (metric, value, page, at) VALUES (?,?,?,?)").run(v.data.metric, v.data.value, pageOk(v.data.page), nowIso());
      saved++;
    }
    if (++vitalsN % 100 === 0) db.prepare("DELETE FROM web_vitals WHERE at < ? OR id NOT IN (SELECT id FROM web_vitals ORDER BY id DESC LIMIT 20000)").run(new Date(Date.now() - 30 * 86400_000).toISOString());
    res.status(saved ? 202 : 400).json(saved ? { saved } : fail("VALIDATION", "אין מדדים תקינים"));
  });

  // ───── 431: דף סטטוס ציבורי ─────
  app.get("/api/status", (req, res) => {
    const t0 = process.hrtime.bigint();
    let dbOk = true;
    try { db.prepare("SELECT 1").get(); } catch { dbOk = false; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    let last = null;
    try { last = listBackups(backupDirFor(dbFile))[0]?.createdAt ?? null; } catch { /* ignore */ }
    res.json({
      ok: dbOk, version: PKG.version || "1", startedAt: bootedAt?.toISOString?.() ?? null, uptimeSec: Math.round(process.uptime()), time: nowIso(),
      db: { ok: dbOk, latencyMs: Math.round(ms * 10) / 10 }, lastBackupAt: last, ai: !!config.ai?.key, email: !!mailer?.hasTransport, maintenance: maintenanceMessage(db) || null,
    });
  });

  // ───── 434: דגלי תכונות ─────
  app.get("/api/flags", (req, res) => {
    const subj = subjectOf(req);
    const out = {};
    for (const r of db.prepare("SELECT * FROM feature_flags").all()) out[r.key] = flagOn(r, subj);
    res.set("Cache-Control", "no-store").json({ flags: out });
  });

  // ───── 435: הארכת התחברות ─────
  app.post("/api/auth/extend", requireUser(), limiter(60_000, 12), (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!u) return F(res, 401, "UNAUTHORIZED", "נדרשת התחברות");
    const token = signToken(u, req.user.sid);
    audit(db, u.username, "session.extend", {});
    res.json({ token });
  });

  // ───── 444: חיפוש חכם ─────
  app.get("/api/search/smart", (req, res) => {
    const q = String(req.query.q || "").slice(0, 100);
    if (q.trim().length < 2) return F(res, 400, "VALIDATION", "כתבו לפחות שתי אותיות");
    const acts = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);
    res.json(smartSearch(acts, q));
  });

  // ───── 446: מפת כיסוי ─────
  app.get("/api/coverage", (req, res) => {
    const acts = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);
    res.json(coverageMatrix(acts));
  });

  // ───── 447: תגובות אימוג'י ─────
  const reactionsOf = (id, uid) => {
    const counts = Object.fromEntries(EMOJIS.map((e) => [e, 0]));
    for (const r of db.prepare("SELECT emoji, COUNT(*) AS c FROM reactions WHERE activity_id = ? GROUP BY emoji").all(id)) if (r.emoji in counts) counts[r.emoji] = r.c;
    const mine = uid ? db.prepare("SELECT emoji FROM reactions WHERE activity_id = ? AND user_id = ?").all(id, uid).map((r) => r.emoji) : [];
    return { emojis: EMOJIS, counts, mine, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  };
  const published = (id) => db.prepare("SELECT id FROM activities WHERE id = ? AND status = 'PUBLISHED'").get(id);
  app.get("/api/reactions/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !published(id)) return F(res, 404, "NOT_FOUND", "הפעולה לא נמצאה");
    res.json(reactionsOf(id, optionalAuth(req)?.id));
  });
  app.put("/api/reactions/:id", requireUser(), limiter(60_000, 40), (req, res) => {
    const id = Number(req.params.id);
    const emoji = String(req.body?.emoji || "");
    if (!Number.isInteger(id) || !published(id)) return F(res, 404, "NOT_FOUND", "הפעולה לא נמצאה");
    if (!EMOJIS.includes(emoji)) return F(res, 400, "VALIDATION", "תגובה לא מוכרת");
    const had = db.prepare("SELECT 1 FROM reactions WHERE user_id = ? AND activity_id = ? AND emoji = ?").get(req.user.id, id, emoji);
    if (had) db.prepare("DELETE FROM reactions WHERE user_id = ? AND activity_id = ? AND emoji = ?").run(req.user.id, id, emoji);
    else db.prepare("INSERT INTO reactions (user_id, activity_id, emoji, created_at) VALUES (?,?,?,?)").run(req.user.id, id, emoji, nowIso());
    res.json(reactionsOf(id, req.user.id));
  });

  // ───── 448: סקר שביעות רצון ─────
  app.get("/api/nps/due", requireUser(), (req, res) => {
    const u = db.prepare("SELECT created_at FROM users WHERE id = ?").get(req.user.id);
    const old = Date.now() - Date.parse(u?.created_at || nowIso()) >= 2 * 86400_000;
    const last = db.prepare("SELECT created_at FROM nps_responses WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(req.user.id);
    const quiet = !last || Date.now() - Date.parse(last.created_at) >= 14 * 86400_000;
    res.json({ due: old && quiet });
  });
  app.post("/api/nps", requireUser(), limiter(60_000, 6), (req, res) => {
    const b = z.object({ score: z.number().int().min(0).max(10), comment: z.string().trim().max(500).default("") }).safeParse(req.body ?? {});
    if (!b.success) return F(res, 400, "VALIDATION", "דרגו מ-0 עד 10");
    db.prepare("INSERT INTO nps_responses (user_id, score, comment, dismissed, created_at) VALUES (?,?,?,0,?)").run(req.user.id, b.data.score, b.data.comment, nowIso());
    res.status(201).json({ ok: true });
  });
  app.post("/api/nps/dismiss", requireUser(), (req, res) => {
    db.prepare("INSERT INTO nps_responses (user_id, score, comment, dismissed, created_at) VALUES (?,NULL,'',1,?)").run(req.user.id, nowIso());
    res.json({ ok: true });
  });

  // ───── 450: אומדן עלות ─────
  const priceMap = z.record(z.string().trim().min(1).max(30), z.number().min(0).max(10000));
  const minePrices = (uid) => { try { return JSON.parse(db.prepare("SELECT prices_json FROM user_prices WHERE user_id = ?").get(uid)?.prices_json || "{}"); } catch { return {}; } };
  app.get("/api/me/prices", requireUser(), (req, res) => res.json({ defaults: DEFAULT_PRICES, mine: minePrices(req.user.id) }));
  app.put("/api/me/prices", requireUser(), (req, res) => {
    const b = priceMap.safeParse(req.body?.prices ?? {});
    if (!b.success || Object.keys(b.data).length > 60) return F(res, 400, "VALIDATION", "רשימת מחירים לא תקינה");
    db.prepare("INSERT INTO user_prices (user_id, prices_json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET prices_json = excluded.prices_json").run(req.user.id, JSON.stringify(b.data));
    res.json({ mine: b.data });
  });
  app.post("/api/cost/estimate", limiter(60_000, 40), (req, res) => {
    const b = z.object({ equipment: z.string().max(3000).default(""), groupSize: z.number().int().min(1).max(300).optional(), activityId: z.number().int().optional() }).safeParse(req.body ?? {});
    if (!b.success) return F(res, 400, "VALIDATION", "בקשה לא תקינה");
    let { equipment, groupSize } = b.data;
    if (b.data.activityId) {
      const a = db.prepare("SELECT equipment, group_size FROM activities WHERE id = ? AND status = 'PUBLISHED'").get(b.data.activityId);
      if (!a) return F(res, 404, "NOT_FOUND", "הפעולה לא נמצאה");
      equipment = equipment || a.equipment;
      groupSize = groupSize ?? a.group_size;
    }
    const u = optionalAuth(req);
    res.json(estimateCost({ equipment, groupSize: groupSize ?? 20, mine: u ? minePrices(u.id) : {} }));
  });

  // ───── אדמין (קטע security, כמו בשלב 52) ─────
  const A = "/api/admin/security";
  app.get(`${A}/errors`, requireAdmin(), (req, res) => {
    const since = new Date(Date.now() - Math.min(90, Number(req.query.days) || 14) * 86400_000).toISOString();
    const rows = db.prepare(`SELECT sig, message, MAX(page) AS page, COUNT(*) AS count, MAX(created_at) AS lastAt, MIN(created_at) AS firstAt, MAX(stack) AS stack, COUNT(DISTINCT user_id) AS users FROM client_errors WHERE created_at > ? GROUP BY sig ORDER BY count DESC, lastAt DESC LIMIT 50`).all(since);
    res.json({ groups: rows, total: rows.reduce((s, r) => s + r.count, 0) });
  });
  app.delete(`${A}/errors`, requireAdmin(), (req, res) => { db.prepare("DELETE FROM client_errors").run(); res.json({ ok: true }); });
  app.get(`${A}/vitals`, requireAdmin(), (req, res) => {
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const out = [];
    for (const [metric, [good, poor]] of Object.entries(VITAL_LIMITS)) {
      const vals = db.prepare("SELECT value FROM web_vitals WHERE metric = ? AND at > ?").all(metric, since).map((r) => r.value);
      const p75 = pct(vals, 0.75);
      out.push({ metric, samples: vals.length, p50: pct(vals, 0.5), p75, good, poor, rating: p75 == null ? null : p75 <= good ? "good" : p75 <= poor ? "needs" : "poor" });
    }
    const slow = db.prepare("SELECT page, COUNT(*) AS n, AVG(value) AS avg FROM web_vitals WHERE metric = 'LCP' AND at > ? AND page != '' GROUP BY page HAVING n >= 1 ORDER BY avg DESC LIMIT 5").all(since).map((r) => ({ page: r.page, samples: r.n, avg: Math.round(r.avg) }));
    res.json({ metrics: out, slowPages: slow });
  });
  app.get(`${A}/flags`, requireAdmin(), (req, res) => res.json({ flags: db.prepare("SELECT key, enabled, percent, note, updated_at AS updatedAt FROM feature_flags ORDER BY key").all().map((r) => ({ ...r, enabled: !!r.enabled })) }));
  app.put(`${A}/flags/:key`, requireAdmin(), (req, res) => {
    const key = String(req.params.key);
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(key)) return F(res, 400, "VALIDATION", "שם דגל: אותיות לועזיות קטנות, ספרות, מקף או קו תחתון");
    const b = z.object({ enabled: z.boolean().default(true), percent: z.number().int().min(0).max(100).default(100), note: z.string().trim().max(120).default("") }).safeParse(req.body ?? {});
    if (!b.success) return F(res, 400, "VALIDATION", "אחוז בין 0 ל-100");
    db.prepare("INSERT INTO feature_flags (key, enabled, percent, note, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, percent = excluded.percent, note = excluded.note, updated_at = excluded.updated_at").run(key, b.data.enabled ? 1 : 0, b.data.percent, b.data.note, nowIso());
    audit(db, req.user.username, "flag.set", { key, enabled: b.data.enabled, percent: b.data.percent });
    res.json({ ok: true });
  });
  app.delete(`${A}/flags/:key`, requireAdmin(), (req, res) => {
    const r = db.prepare("DELETE FROM feature_flags WHERE key = ?").run(String(req.params.key));
    if (!r.changes) return F(res, 404, "NOT_FOUND", "הדגל לא נמצא");
    audit(db, req.user.username, "flag.delete", { key: req.params.key });
    res.json({ ok: true });
  });

  // ───── 432: תרגיל שחזור יבש ─────
  app.post(`${A}/drill`, requireAdmin(), limiter(60_000, 5), (req, res) => {
    const dir = backupDirFor(dbFile);
    let list = listBackups(dir);
    let created = false;
    if (!list.length) {
      if (req.body?.createIfMissing === false) return res.json({ ok: false, status: "no-backup", warnings: ["אין גיבוי לבדיקה. צרו גיבוי ונסו שוב."] });
      createBackup(db, dir);
      list = listBackups(dir);
      created = true;
    }
    const b = list[0];
    const file = path.join(dir, b.name);
    let probe;
    const warnings = [];
    try {
      probe = new DatabaseSync(file, { readOnly: true });
      const integrity = probe.prepare("PRAGMA integrity_check").all().map((r) => Object.values(r)[0]).join(",");
      const tables = ["users", "activities", "write_docs", "ratings", "runs", "audit_log"].map((t) => {
        let bk = null, live = null;
        try { bk = probe.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c; } catch { warnings.push(`בגיבוי חסרה הטבלה ${t}`); }
        try { live = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c; } catch { /* ignore */ }
        return { table: t, backup: bk, live, diff: bk != null && live != null ? live - bk : null };
      });
      const ageHours = Math.round(((Date.now() - Date.parse(b.createdAt)) / 3600_000) * 10) / 10;
      if (ageHours > 48) warnings.push(`הגיבוי האחרון בן ${Math.round(ageHours)} שעות`);
      if (tables.some((t) => t.backup === 0 && t.live > 0 && t.table !== "audit_log")) warnings.push("בגיבוי יש טבלה ריקה שבמסד החי יש בה נתונים");
      const ok = integrity === "ok" && !tables.some((t) => t.backup == null);
      audit(db, req.user.username, "backup.drill", { name: b.name, ok });
      res.json({ ok, status: ok ? "pass" : "fail", created, backup: { name: b.name, size: b.size, createdAt: b.createdAt, ageHours }, integrity, tables, warnings });
    } catch (e) {
      res.json({ ok: false, status: "fail", backup: { name: b.name }, integrity: String(e.message || e).slice(0, 120), tables: [], warnings });
    } finally { try { probe?.close(); } catch { /* ignore */ } }
  });

  // ───── 448: דוח שביעות רצון ─────
  app.get(`${A}/nps`, requireAdmin(), (req, res) => {
    const rows = db.prepare("SELECT score, comment, created_at AS at FROM nps_responses WHERE score IS NOT NULL ORDER BY id DESC LIMIT 500").all();
    const n = rows.length;
    const prom = rows.filter((r) => r.score >= 9).length, det = rows.filter((r) => r.score <= 6).length;
    const dismissed = db.prepare("SELECT COUNT(*) AS c FROM nps_responses WHERE dismissed = 1").get().c;
    res.json({ responses: n, dismissed, nps: n ? Math.round(((prom - det) / n) * 100) : null, promoters: prom, passives: n - prom - det, detractors: det, average: n ? Math.round((rows.reduce((s, r) => s + r.score, 0) / n) * 10) / 10 : null, comments: rows.filter((r) => r.comment).slice(0, 20).map((r) => ({ score: r.score, comment: r.comment, at: r.at })) });
  });

  // ───── 449: חותמת איכות של הצוות ─────
  app.get(`${A}/stamps`, requireAdmin(), (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 60);
    const rows = db.prepare("SELECT id, title, leading_value AS value, verified_at AS verifiedAt, verified_by AS verifiedBy, verified_note AS note FROM activities WHERE status = 'PUBLISHED' AND (? = '' OR title LIKE ? ESCAPE '\\') ORDER BY (verified_at IS NULL), id DESC LIMIT 60").all(q, `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    res.json({ items: rows, stamped: db.prepare("SELECT COUNT(*) AS c FROM activities WHERE status = 'PUBLISHED' AND verified_at IS NOT NULL").get().c });
  });
  app.put(`${A}/stamps/:id`, requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    const b = z.object({ verified: z.boolean(), note: z.string().trim().max(160).default("") }).safeParse(req.body ?? {});
    if (!b.success) return F(res, 400, "VALIDATION", "בקשה לא תקינה");
    if (!db.prepare("SELECT id FROM activities WHERE id = ? AND status = 'PUBLISHED'").get(id)) return F(res, 404, "NOT_FOUND", "הפעולה לא נמצאה");
    if (b.data.verified) db.prepare("UPDATE activities SET verified_by = ?, verified_at = ?, verified_note = ? WHERE id = ?").run(req.user.username, nowIso(), b.data.note, id);
    else db.prepare("UPDATE activities SET verified_by = NULL, verified_at = NULL, verified_note = NULL WHERE id = ?").run(id);
    audit(db, req.user.username, b.data.verified ? "activity.stamp" : "activity.unstamp", { id });
    res.json({ ok: true });
  });
}

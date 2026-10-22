// נקודות קצה של אבטחה ופרטיות, רעיונות 91–100: יומן כניסות, מבקרים, חסימות, הגדרות,
// סיכום אבטחה, ייצוא, פרטיות ואישור תנאים.
import { z } from "zod";
import { effectiveStaff } from "./accounts.js";
import { audit, nowIso } from "./db.js";
import {
  FLAG_TEXT,
  SETTING_DEFAULTS,
  TERMS_VERSION,
  countryName,
  invalidateBlocks,
  normalizeTarget,
  passwordProblems,
  purgeOld,
  readSettings,
  writeSettings,
} from "./security.js";

const optText = (n) => z.string().trim().max(n).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
const csv = (header, rows) => `﻿${[header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n")}`;

export function registerSecurityRoutes(app, { db, limiter, fail, requireUser, requireAdmin }) {
  // ───── 100. דף פרטיות ואישור תנאים ─────
  app.get("/api/privacy-info", (req, res) => {
    const st = readSettings(db);
    res.json({ termsVersion: TERMS_VERSION, retentionDays: st.ipRetentionDays, visitorIpMode: st.visitorIpMode, passwordMaxAgeDays: st.passwordMaxAgeDays });
  });
  app.post("/api/me/terms", requireUser({ allowMustChange: true }), (req, res) => {
    z.object({ accept: z.literal(true) }).parse(req.body ?? {});
    db.prepare("UPDATE users SET terms_accepted_at = ?, terms_version = ? WHERE id = ?").run(nowIso(), TERMS_VERSION, req.user.id);
    audit(db, req.user.username, "terms.accepted", { version: TERMS_VERSION });
    res.json({ ok: true });
  });

  // ───── 97. בדיקת חוזק סיסמה (לרמז בזמן הקלדה) ─────
  app.post("/api/auth/password-check", limiter(60_000, 40), (req, res) => {
    const v = z.object({ password: z.string().max(200), username: optText(60) }).parse(req.body ?? {});
    const problems = passwordProblems(v.password, { username: v.username || "" });
    res.json({ ok: problems.length === 0, problems, enforced: readSettings(db).strictPasswords === 1 });
  });

  // ───── 93. מחיקת ה-IP שלי ─────
  const purgeUserIp = (userId) => {
    const a = db.prepare("UPDATE access_log SET ip = NULL, ip_hash = NULL WHERE user_id = ?").run(userId).changes;
    const b = db.prepare("UPDATE auth_sessions SET ip = NULL WHERE user_id = ?").run(userId).changes;
    return a + b;
  };
  app.post("/api/me/purge-ip", requireUser(), (req, res) => {
    const n = purgeUserIp(req.user.id);
    audit(db, req.user.username, "privacy.purge_ip", { rows: n, self: true });
    res.json({ cleared: n });
  });
  app.post("/api/admin/users/:id/purge-ip", requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    const t = db.prepare("SELECT username, role FROM users WHERE id = ?").get(id);
    if (!t) return res.status(404).json(fail("NOT_FOUND", "המשתמש לא נמצא"));
    if (req.user.staff !== "SUPER" && t.role === "ADMIN") return res.status(403).json(fail("FORBIDDEN_ROLE", "אפשר לנהל רק חשבונות של מדריכים"));
    const n = purgeUserIp(id);
    audit(db, req.user.username, "privacy.purge_ip", { rows: n, user: t.username });
    res.json({ cleared: n });
  });

  // ───── 91. יומן כניסות ─────
  const accessQuery = (q) => {
    const w = [];
    const a = [];
    if (q.kind) (w.push("kind = ?"), a.push(q.kind));
    if (q.user) (w.push("username LIKE ?"), a.push(`%${q.user}%`));
    if (q.ip) (w.push("ip LIKE ?"), a.push(`%${q.ip}%`));
    if (q.country) (w.push("country = ?"), a.push(q.country.toUpperCase()));
    if (q.flag) w.push("flag IS NOT NULL AND flag != ''");
    if (q.from) (w.push("at >= ?"), a.push(q.from));
    if (q.to) (w.push("at <= ?"), a.push(`${q.to}T23:59:59.999Z`));
    return { where: w.length ? ` WHERE ${w.join(" AND ")}` : "", args: a };
  };
  const accessSchema = z.object({
    kind: z.enum(["login", "login_fail", "logout", "register", "visit"]).optional(),
    user: optText(60),
    ip: optText(45),
    country: optText(5),
    flag: z.enum(["1"]).optional(),
    from: day.optional(),
    to: day.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  });
  const accessRow = (r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    username: r.username || "",
    ip: r.ip || "",
    country: r.country || "",
    countryName: countryName(r.country),
    device: r.device || "",
    page: r.page || "",
    flags: r.flag ? r.flag.split(",").map((f) => FLAG_TEXT[f] || f) : [],
    note: r.note || "",
  });
  app.get("/api/admin/access", requireAdmin(), (req, res) => {
    const q = accessSchema.parse(req.query);
    const { where, args } = accessQuery(q);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM access_log${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM access_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, q.limit, q.offset);
    res.json({ total, items: rows.map(accessRow), ipMode: readSettings(db).visitorIpMode });
  });
  app.get("/api/admin/access.csv", requireAdmin(), (req, res) => {
    const q = accessSchema.parse(req.query);
    const { where, args } = accessQuery(q);
    const rows = db.prepare(`SELECT * FROM access_log${where} ORDER BY id DESC LIMIT 5000`).all(...args).map(accessRow);
    audit(db, req.user.username, "access.export", { rows: rows.length });
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="access-log.csv"' }).send(csv(["id", "at", "kind", "user", "ip", "country", "device", "page", "flags", "note"], rows.map((r) => [r.id, r.at, r.kind, r.username, r.ip, r.countryName, r.device, r.page, r.flags.join("; "), r.note])));
  });

  // ───── 94. מבקרים ─────
  app.get("/api/admin/visitors", requireAdmin(), (req, res) => {
    const days = z.coerce.number().int().min(1).max(90).default(14).parse(req.query.days);
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const perDay = db
      .prepare("SELECT substr(at,1,10) AS day, COUNT(DISTINCT ip_hash) AS unique_visitors, COUNT(DISTINCT CASE WHEN username IS NOT NULL THEN username END) AS logged FROM access_log WHERE kind = 'visit' AND at >= ? GROUP BY day ORDER BY day")
      .all(from)
      .map((r) => ({ day: r.day, unique: r.unique_visitors, loggedIn: r.logged }));
    const total = db.prepare("SELECT COUNT(DISTINCT ip_hash) AS c FROM access_log WHERE kind = 'visit' AND at >= ?").get(from).c;
    const countries = db.prepare("SELECT country, COUNT(DISTINCT ip_hash) AS c FROM access_log WHERE kind = 'visit' AND at >= ? GROUP BY country ORDER BY c DESC LIMIT 12").all(from).map((r) => ({ country: r.country || "", name: countryName(r.country), count: r.c }));
    const pages = db.prepare("SELECT page, COUNT(*) AS c FROM access_log WHERE kind = 'visit' AND page IS NOT NULL AND at >= ? GROUP BY page ORDER BY c DESC LIMIT 10").all(from).map((r) => ({ page: r.page, count: r.c }));
    res.json({ days, total, perDay, countries, pages });
  });

  // ───── 95. חסימות ─────
  app.get("/api/admin/blocks", requireAdmin(), (req, res) => {
    res.json(db.prepare("SELECT id, target, note, created_by AS createdBy, created_at AS createdAt, expires_at AS expiresAt FROM ip_blocks WHERE expires_at IS NULL OR expires_at > ? ORDER BY id DESC").all(nowIso()));
  });
  app.post("/api/admin/blocks", requireAdmin(), (req, res) => {
    const v = z.object({ target: z.string().trim().min(3).max(60), note: optText(120), hours: z.number().int().min(1).max(24 * 365).optional() }).parse(req.body ?? {});
    const t = normalizeTarget(v.target);
    if (!t) return res.status(400).json(fail("BAD_IP", "כתובת לא תקינה. כתבו כתובת IP או טווח כמו 203.0.113.0/24"));
    const mine = String(req.ip).replace(/^::ffff:/, "");
    const own = (() => {
      try {
        // לא חוסמים את עצמנו בטעות
        return t === mine || (t.includes("/") && normalizeTarget(mine) && isIn(t, mine));
      } catch {
        return false;
      }
    })();
    if (own) return res.status(400).json(fail("SELF_BLOCK", "זו הכתובת שלכם, והחסימה הייתה מנתקת אתכם מהאתר"));
    try {
      db.prepare("INSERT INTO ip_blocks (target, note, created_by, created_at, expires_at) VALUES (?,?,?,?,?)").run(t, v.note || null, req.user.username, nowIso(), v.hours ? new Date(Date.now() + v.hours * 3600_000).toISOString() : null);
    } catch {
      return res.status(409).json(fail("EXISTS", "הכתובת כבר חסומה"));
    }
    invalidateBlocks(db);
    audit(db, req.user.username, "block.add", { target: t, hours: v.hours ?? null });
    res.status(201).json({ ok: true, target: t });
  });
  app.delete("/api/admin/blocks/:id", requireAdmin(), (req, res) => {
    const b = db.prepare("SELECT target FROM ip_blocks WHERE id = ?").get(Number(req.params.id));
    if (!b) return res.status(404).json(fail("NOT_FOUND", "החסימה לא נמצאה"));
    db.prepare("DELETE FROM ip_blocks WHERE id = ?").run(Number(req.params.id));
    invalidateBlocks(db);
    audit(db, req.user.username, "block.remove", { target: b.target });
    res.json({ ok: true });
  });

  // ───── 93+96+97. הגדרות פרטיות ואבטחה ─────
  app.get("/api/admin/security/settings", requireAdmin(), (req, res) => res.json({ ...readSettings(db), defaults: SETTING_DEFAULTS }));
  app.put("/api/admin/security/settings", requireAdmin(), (req, res) => {
    if (effectiveStaff({ role: req.user.role, staff_role: req.user.staff }) !== "SUPER") return res.status(403).json(fail("FORBIDDEN_ROLE", "רק אדמין ראשי משנה הגדרות אבטחה"));
    const v = z
      .object({
        ipRetentionDays: z.number().int().min(7).max(365).optional(),
        visitorIpMode: z.enum(["raw", "hashed"]).optional(),
        strictPasswords: z.union([z.literal(0), z.literal(1)]).optional(),
        passwordMaxAgeDays: z.number().int().min(0).max(730).optional(),
        autoBlockAfter: z.number().int().min(0).max(1000).optional(),
      })
      .refine((o) => o.autoBlockAfter === undefined || o.autoBlockAfter === 0 || o.autoBlockAfter >= 5, { message: "חסימה אוטומטית: 0 לכיבוי, או לפחות 5 כשלונות" })
      .parse(req.body ?? {});
    writeSettings(db, v);
    audit(db, req.user.username, "security.settings", v);
    res.json(readSettings(db));
  });
  app.post("/api/admin/security/purge", requireAdmin(), (req, res) => {
    const out = purgeOld(db);
    audit(db, req.user.username, "privacy.purge", out);
    res.json(out);
  });

  // ───── 98. סיכום אבטחה ושימוש ─────
  app.get("/api/admin/security/overview", requireAdmin(), (req, res) => {
    const days = 14;
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const one = (sql, ...a) => db.prepare(sql).get(...a).c;
    const series = (sql) => db.prepare(sql).all(from);
    const perDay = {};
    const add = (rows, key) => rows.forEach((r) => ((perDay[r.day] ??= { day: r.day, newUsers: 0, logins: 0, failures: 0, visitors: 0 })[key] = r.c));
    add(series("SELECT substr(created_at,1,10) AS day, COUNT(*) AS c FROM users WHERE created_at >= ? GROUP BY day"), "newUsers");
    add(series("SELECT substr(at,1,10) AS day, COUNT(*) AS c FROM access_log WHERE kind = 'login' AND at >= ? GROUP BY day"), "logins");
    add(series("SELECT substr(at,1,10) AS day, COUNT(*) AS c FROM access_log WHERE kind = 'login_fail' AND at >= ? GROUP BY day"), "failures");
    add(series("SELECT substr(at,1,10) AS day, COUNT(DISTINCT ip_hash) AS c FROM access_log WHERE kind = 'visit' AND at >= ? GROUP BY day"), "visitors");
    const dayList = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10));
    res.json({
      days: dayList.map((d) => perDay[d] ?? { day: d, newUsers: 0, logins: 0, failures: 0, visitors: 0 }),
      totals: {
        users: one("SELECT COUNT(*) AS c FROM users"),
        activeDevices: one("SELECT COUNT(*) AS c FROM auth_sessions WHERE revoked_at IS NULL AND last_seen_at > ?", new Date(Date.now() - 30 * 86400_000).toISOString()),
        flagged: one("SELECT COUNT(*) AS c FROM access_log WHERE flag IS NOT NULL AND flag != '' AND at >= ?", from),
        blocks: one("SELECT COUNT(*) AS c FROM ip_blocks WHERE expires_at IS NULL OR expires_at > ?", nowIso()),
        adminsWithout2fa: one("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN' AND disabled = 0 AND totp_enabled = 0"),
        withoutTerms: one("SELECT COUNT(*) AS c FROM users WHERE terms_version IS NULL OR terms_version != ?", TERMS_VERSION),
      },
      countries: db.prepare("SELECT country, COUNT(*) AS c FROM access_log WHERE kind = 'login' AND at >= ? GROUP BY country ORDER BY c DESC LIMIT 8").all(from).map((r) => ({ country: r.country || "", name: countryName(r.country), count: r.c })),
      recentFlags: db.prepare("SELECT * FROM access_log WHERE flag IS NOT NULL AND flag != '' ORDER BY id DESC LIMIT 8").all().map(accessRow),
    });
  });

  // ───── 99. ייצוא משתמשים ─────
  app.get("/api/admin/users/export.csv", requireAdmin(), (req, res) => {
    const rows = db.prepare("SELECT * FROM users WHERE (? = 'SUPER' OR role = 'INSTRUCTOR') ORDER BY id").all(req.user.staff ?? "SUPER");
    audit(db, req.user.username, "users.export", { rows: rows.length });
    res
      .set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="users.csv"' })
      .send(
        csv(
          ["id", "username", "displayName", "role", "staffRole", "status", "email", "emailVerified", "phone", "phoneVerified", "twoFactor", "termsAccepted", "createdAt", "lastLoginAt"],
          rows.map((u) => [u.id, u.username, u.display_name || "", u.role, u.role === "ADMIN" ? u.staff_role || "SUPER" : "", u.disabled ? "מושבת" : "פעיל", u.email || "", u.email_verified_at ? "כן" : "לא", u.phone || "", u.phone_verified_at ? "כן" : "לא", u.totp_enabled ? "כן" : "לא", u.terms_version === TERMS_VERSION ? "כן" : "לא", u.created_at, u.last_login_at || ""]),
        ),
      );
  });
}

// בדיקה אם כתובת בטווח (לא לחסום את עצמנו)
function isIn(range, ip) {
  const [addr, bits] = range.split("/");
  const toNum = (s) => {
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
    return m ? ((Number(m[1]) << 24) | (Number(m[2]) << 16) | (Number(m[3]) << 8) | Number(m[4])) >>> 0 : null;
  };
  const a = toNum(addr);
  const b = toNum(ip);
  if (a === null || b === null) return false;
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

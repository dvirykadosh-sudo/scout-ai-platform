// שלב 52 (367–387): הזמנות והרשמה מבוקרת, ייבוא משתמשים, אבטחת חשבון אישית ובקרות מנהל.
import crypto from "node:crypto";
import { z } from "zod";
import { hashSecret } from "./accounts.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { config, DEFAULT_ADMIN_PASSWORD } from "./config.js";
import { audit, nowIso } from "./db.js";

// ───────────── הגדרות הרשמה (טבלת settings, מפתחות reg.*) ─────────────
const REG_DEFAULTS = { code: "", approval: "0", domains: "", dailyCap: "0", reserved: "" };
export const regSettings = (db) => {
  const out = { ...REG_DEFAULTS };
  for (const r of db.prepare("SELECT key, value FROM settings WHERE key LIKE 'reg.%'").all()) {
    const k = r.key.slice(4);
    if (k in out) out[k] = r.value;
  }
  return { code: out.code, approval: out.approval === "1", domains: out.domains.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean), dailyCap: Number(out.dailyCap) || 0, reserved: out.reserved.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) };
};
export const effectiveSignupCode = (db) => regSettings(db).code || config.signupCode;

const BUILTIN_RESERVED = ["admin", "administrator", "root", "support", "system", "moderator", "staff", "owner", "webmaster", "מנהל", "אדמין", "מערכת", "תמיכה", "צוות", "מחולל"];
export function isReservedName(db, name) {
  const n = String(name).toLowerCase().replace(/[^a-z0-9֐-׿]/g, "");
  return [...BUILTIN_RESERVED, ...regSettings(db).reserved].some((r) => n === r || (r.length >= 4 && n.startsWith(r) && /^[0-9]*$/.test(n.slice(r.length))));
}
export const emailDomainOk = (db, email) => {
  const d = regSettings(db).domains;
  if (!d.length) return true;
  const dom = String(email || "").split("@")[1]?.toLowerCase();
  return !!dom && d.includes(dom);
};
export const dailyCapReached = (db) => {
  const cap = regSettings(db).dailyCap;
  if (!cap) return false;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  return db.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND role = 'INSTRUCTOR'").get(since).c >= cap;
};

// ───────────── הזמנות ─────────────
const inviteHash = (code) => hashSecret(`invite|${String(code).replace(/[\s-]/g, "").toUpperCase()}`);
export function findInvite(db, code) {
  if (!code || String(code).length < 6) return null;
  const r = db.prepare("SELECT * FROM invites WHERE code_hash = ?").get(inviteHash(code));
  if (!r || r.revoked_at || r.uses >= r.max_uses || Date.parse(r.expires_at) < Date.now()) return null;
  return r;
}
export const consumeInvite = (db, id) => db.prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?").run(id);
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newInviteCode = () => Array.from(crypto.randomBytes(10), (b) => ALPHA[b % ALPHA.length]).join("");

// ───────────── מכשיר חדש ─────────────
export const ipPrefix = (ip) => {
  const s = String(ip || "").replace(/^::ffff:/, "");
  return s.includes(":") ? s.split(":").slice(0, 3).join(":") : s.split(".").slice(0, 2).join(".");
};
export function isNewDevice(db, userId, device, ip) {
  const prior = db.prepare("SELECT device, ip FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").all(userId);
  return prior.length > 0 && !prior.some((p) => p.device === device && ipPrefix(p.ip) === ipPrefix(ip));
}

// ───────────── ציון אבטחה אישי ─────────────
export function securityScore(db, u) {
  const sessions = db.prepare("SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL").get(u.id).c;
  const codes = u.backup_codes ? JSON.parse(u.backup_codes).length : 0;
  const pwAgeDays = Math.floor((Date.now() - Date.parse(u.password_changed_at || u.created_at)) / 86400_000);
  const items = [
    { key: "2fa", label: "אימות דו-שלבי פעיל", points: 30, ok: !!u.totp_enabled, action: "הפעילו אימות דו-שלבי באזור האבטחה" },
    { key: "contact", label: "מייל או טלפון מאומתים (לשחזור חשבון)", points: 20, ok: !!(u.email_verified_at || u.phone_verified_at), action: "הוסיפו מייל או טלפון ואמתו אותם" },
    { key: "password", label: "הסיסמה הוחלפה בחצי השנה האחרונה", points: 20, ok: pwAgeDays <= 180, action: "החליפו סיסמה" },
    { key: "sessions", label: "עד 3 מכשירים מחוברים", points: 10, ok: sessions <= 3, action: "נתקו מכשירים שאתם לא משתמשים בהם" },
    { key: "backup", label: "יש קודי גיבוי לאימות דו-שלבי", points: 10, ok: !!u.totp_enabled && codes >= 3, action: u.totp_enabled ? "צרו קודי גיבוי חדשים" : "קודם הפעילו אימות דו-שלבי" },
    { key: "recovery", label: "יש מייל לשחזור סיסמה", points: 10, ok: !!u.email, action: "הוסיפו כתובת מייל" },
  ];
  const score = items.reduce((s, i) => s + (i.ok ? i.points : 0), 0);
  return { score, level: score >= 80 ? "חזק" : score >= 50 ? "בינוני" : "חלש", items, sessions, passwordAgeDays: pwAgeDays };
}

export function registerAccountV52Routes(app, { db, mailer, limiter, fail, requireUser, requireAdmin }) {
  const superOnly = (req, res) => {
    if (req.user.staff && req.user.staff !== "SUPER") { res.status(403).json(fail("FORBIDDEN_ROLE", "הפעולה הזו שמורה לאדמין הראשי")); return false; }
    return true;
  };

  // ── הגדרות הרשמה ──
  app.get("/api/admin/security/registration", requireAdmin(), (_req, res) => {
    const r = regSettings(db);
    res.json({ codeOverride: !!r.code, codeSet: !!(r.code || config.signupCode), approval: r.approval, domains: r.domains, dailyCap: r.dailyCap, reserved: r.reserved, builtinReserved: BUILTIN_RESERVED });
  });
  app.put("/api/admin/security/registration", requireAdmin(), limiter(60_000, 30), (req, res) => {
    if (!superOnly(req, res)) return;
    const v = z.object({ approval: z.boolean().optional(), domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "דומיין לא תקין")).max(20).optional(), dailyCap: z.number().int().min(0).max(1000).optional(), reserved: z.array(z.string().trim().min(2).max(30)).max(50).optional(), newCode: z.string().trim().min(6, "קוד הרשמה: לפחות 6 תווים").max(60).optional(), clearCode: z.boolean().optional() }).parse(req.body ?? {});
    const set = (k, val) => db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`reg.${k}`, String(val));
    if (v.approval !== undefined) set("approval", v.approval ? "1" : "0");
    if (v.domains) set("domains", v.domains.join(","));
    if (v.dailyCap !== undefined) set("dailyCap", v.dailyCap);
    if (v.reserved) set("reserved", v.reserved.join(",").toLowerCase());
    if (v.newCode) set("code", v.newCode);
    if (v.clearCode) set("code", "");
    audit(db, req.user.username, "registration.settings", { approval: v.approval, domains: v.domains?.length, dailyCap: v.dailyCap, codeChanged: !!v.newCode || !!v.clearCode });
    res.json({ ok: true });
  });

  // ── הזמנות ──
  app.get("/api/admin/security/invites", requireAdmin(), (_req, res) => {
    const rows = db.prepare("SELECT id, label, hint, max_uses, uses, expires_at, created_by, created_at, revoked_at FROM invites ORDER BY id DESC LIMIT 100").all();
    res.json(rows.map((r) => ({ id: r.id, label: r.label, hint: r.hint, maxUses: r.max_uses, uses: r.uses, expiresAt: r.expires_at, createdBy: r.created_by, createdAt: r.created_at, status: r.revoked_at ? "revoked" : Date.parse(r.expires_at) < Date.now() ? "expired" : r.uses >= r.max_uses ? "used" : "active" })));
  });
  app.post("/api/admin/security/invites", requireAdmin(), limiter(60_000, 30), (req, res) => {
    const v = z.object({ label: z.string().trim().min(2, "תנו שם להזמנה").max(60), maxUses: z.number().int().min(1).max(200).default(1), days: z.number().int().min(1).max(60).default(7) }).parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM invites WHERE revoked_at IS NULL AND uses < max_uses AND expires_at > ?").get(nowIso()).c >= 100) return res.status(409).json(fail("LIMIT", "יש יותר מדי הזמנות פעילות. בטלו ישנות"));
    const code = newInviteCode();
    db.prepare("INSERT INTO invites (label, code_hash, hint, max_uses, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?)").run(v.label, inviteHash(code), code.slice(-3), v.maxUses, new Date(Date.now() + v.days * 86400_000).toISOString(), req.user.username, nowIso());
    audit(db, req.user.username, "invite.create", { label: v.label, maxUses: v.maxUses, days: v.days });
    res.status(201).json({ code, note: "הקוד מוצג פעם אחת בלבד. שמרו או שלחו אותו עכשיו." });
  });
  app.delete("/api/admin/security/invites/:id", requireAdmin(), (req, res) => {
    const r = db.prepare("UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(nowIso(), Number(req.params.id));
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "ההזמנה לא נמצאה"));
    audit(db, req.user.username, "invite.revoke", { id: Number(req.params.id) });
    res.json({ ok: true });
  });
  // ציבורי: בדיקת קוד לדף ההצטרפות (בלי לחשוף כלום מלבד שם ההזמנה)
  app.get("/api/auth/invite/:code", limiter(60_000, 20), (req, res) => {
    const i = findInvite(db, req.params.code);
    res.json(i ? { valid: true, label: i.label } : { valid: false });
  });

  // ── תור אישור הרשמות ──
  app.get("/api/admin/security/pending", requireAdmin(), (_req, res) => {
    res.json(db.prepare("SELECT id, username, display_name AS displayName, email, created_at AS createdAt FROM users WHERE pending_approval = 1 ORDER BY id").all());
  });
  app.post("/api/admin/security/pending/:id", requireAdmin(), limiter(60_000, 60), (req, res) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ? AND pending_approval = 1").get(Number(req.params.id));
    if (!u) return res.status(404).json(fail("NOT_FOUND", "אין בקשה כזו"));
    if (approve) db.prepare("UPDATE users SET pending_approval = 0, disabled = 0 WHERE id = ?").run(u.id);
    else db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
    audit(db, req.user.username, approve ? "registration.approve" : "registration.reject", { id: u.id, username: u.username });
    if (approve && u.email && mailer?.hasTransport) { try { mailer.enqueue("החשבון שלכם אושר", `<p dir="rtl">שלום ${String(u.display_name || u.username).replace(/[<>&]/g, "")}, ההרשמה שלכם למחולל הפעולות אושרה. אפשר להתחבר.</p>`, u.email); } catch {} }
    res.json({ ok: true });
  });

  // ── ייבוא משתמשים ──
  app.post("/api/admin/security/import-users", requireAdmin(), limiter(60 * 60_000, 10), async (req, res) => {
    const v = z.object({ rows: z.array(z.object({ displayName: z.string().trim().min(2).max(60), username: z.string().trim().max(30).optional(), email: z.string().trim().max(120).optional() })).min(1, "אין שורות לייבוא").max(100, "עד 100 משתמשים בכל פעם") }).parse(req.body ?? {});
    const created = [];
    const skipped = [];
    for (const [i, row] of v.rows.entries()) {
      let uname = (row.username || row.displayName).replace(/\s+/g, ".").replace(/[^A-Za-z0-9_.֐-׿-]/g, "").slice(0, 26);
      if (uname.length < 3) { skipped.push({ row: i + 1, reason: "שם משתמש קצר מדי" }); continue; }
      if (isReservedName(db, uname)) { skipped.push({ row: i + 1, reason: "שם משתמש שמור" }); continue; }
      let final = uname;
      for (let n = 2; db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(final) && n < 50; n++) final = `${uname.slice(0, 26)}${n}`;
      const email = row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) ? row.email.toLowerCase() : null;
      const temp = crypto.randomBytes(8).toString("base64url");
      db.prepare("INSERT INTO users (username, password_hash, role, must_change_pw, created_at, display_name, email, password_changed_at) VALUES (?,?,?,?,?,?,?,?)").run(final, await hashPassword(temp), "INSTRUCTOR", 1, nowIso(), row.displayName, email, nowIso());
      created.push({ username: final, displayName: row.displayName, email, tempPassword: temp });
    }
    audit(db, req.user.username, "users.import", { created: created.length, skipped: skipped.length });
    res.status(201).json({ created, skipped });
  });

  // ── חשבונות לא פעילים ──
  app.get("/api/admin/security/inactive", requireAdmin(), (req, res) => {
    const days = Math.max(30, Math.min(730, Number(req.query.days) || 180));
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const rows = db.prepare("SELECT id, username, display_name AS displayName, last_login_at AS lastLoginAt, created_at AS createdAt FROM users WHERE role = 'INSTRUCTOR' AND disabled = 0 AND COALESCE(last_login_at, created_at) < ? ORDER BY COALESCE(last_login_at, created_at) LIMIT 200").all(since);
    res.json({ days, users: rows });
  });
  app.post("/api/admin/security/inactive/disable", requireAdmin(), limiter(60_000, 10), (req, res) => {
    if (!superOnly(req, res)) return;
    const v = z.object({ ids: z.array(z.number().int()).min(1).max(200) }).parse(req.body ?? {});
    let n = 0;
    for (const id of v.ids) n += db.prepare("UPDATE users SET disabled = 1 WHERE id = ? AND role = 'INSTRUCTOR' AND disabled = 0").run(id).changes;
    audit(db, req.user.username, "users.disable_inactive", { count: n });
    res.json({ disabled: n });
  });

  // ── חשבון זמני עם תאריך תפוגה ──
  app.post("/api/admin/security/expiry", requireAdmin(), limiter(60_000, 60), (req, res) => {
    const v = z.object({ id: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין").nullable() }).parse(req.body ?? {});
    const u = db.prepare("SELECT id, role, username FROM users WHERE id = ?").get(v.id);
    if (!u) return res.status(404).json(fail("NOT_FOUND", "המשתמש לא נמצא"));
    if (u.role === "ADMIN") return res.status(403).json(fail("FORBIDDEN_ROLE", "תפוגה מוגדרת רק לחשבונות מדריכים"));
    db.prepare("UPDATE users SET expires_at = ? WHERE id = ?").run(v.date ? `${v.date}T23:59:59.999Z` : null, u.id);
    audit(db, req.user.username, "user.expiry", { id: u.id, date: v.date });
    res.json({ ok: true });
  });
  app.get("/api/admin/security/expiring", requireAdmin(), (_req, res) => {
    res.json(db.prepare("SELECT id, username, display_name AS displayName, expires_at AS expiresAt FROM users WHERE expires_at IS NOT NULL ORDER BY expires_at LIMIT 200").all());
  });

  // ── ניתוק כולם ──
  app.post("/api/admin/security/revoke-all", requireAdmin(), limiter(60 * 60_000, 5), (req, res) => {
    if (!superOnly(req, res)) return;
    const v = z.object({ includeAdmins: z.boolean().default(false) }).parse(req.body ?? {});
    const r = db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id != ? ${v.includeAdmins ? "" : "AND user_id IN (SELECT id FROM users WHERE role != 'ADMIN')"}`).run(nowIso(), req.user.id);
    audit(db, req.user.username, "security.revoke_all", { sessions: r.changes, includeAdmins: v.includeAdmins });
    res.json({ revoked: Number(r.changes) });
  });

  // ── נעילות ──
  app.get("/api/admin/security/lockouts", requireAdmin(), (_req, res) => {
    const rows = db.prepare("SELECT key, count, locked_until AS lockedUntil, last_at AS lastAt FROM login_attempts WHERE count > 0 AND last_at > ? ORDER BY last_at DESC LIMIT 100").all(new Date(Date.now() - 24 * 3600_000).toISOString());
    res.json(rows.map((r) => ({ key: r.key, who: r.key.split("|")[0], count: r.count, locked: !!r.lockedUntil && Date.parse(r.lockedUntil) > Date.now(), lockedUntil: r.lockedUntil, lastAt: r.lastAt })));
  });
  app.post("/api/admin/security/lockouts/release", requireAdmin(), limiter(60_000, 30), (req, res) => {
    const { key } = z.object({ key: z.string().min(1).max(300) }).parse(req.body ?? {});
    const r = db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
    audit(db, req.user.username, "lockout.release", { who: key.split("|")[0] });
    res.json({ released: Number(r.changes) });
  });

  // ── דוח הקשחה ──
  app.get("/api/admin/security/hardening", requireAdmin(), (req, res) => {
    const checks = [];
    const add = (key, label, ok, detail, sev = "warn") => checks.push({ key, label, ok, detail: ok ? "" : detail, severity: ok ? "ok" : sev });
    const admins = db.prepare("SELECT username, totp_enabled, password_changed_at, created_at, last_login_at FROM users WHERE role = 'ADMIN' AND disabled = 0").all();
    const no2fa = admins.filter((a) => !a.totp_enabled);
    add("admin2fa", "לכל האדמינים יש אימות דו-שלבי", no2fa.length === 0, `חסר ל: ${no2fa.map((a) => a.username).join(", ")}`, "high");
    add("jwt", "JWT_SECRET ארוך ומוגדר", config.isProd ? (process.env.JWT_SECRET || "").length >= 24 : true, "הסוד קצר או חסר. החליפו בערך אקראי של 32 תווים ומעלה", "high");
    add("adminpw", "סיסמת האדמין אינה ברירת מחדל", !(config.isProd && config.admin.password === DEFAULT_ADMIN_PASSWORD), "שנו את סיסמת האדמין", "high");
    add("signup", "ההרשמה מוגנת בקוד או בהזמנה", !!(effectiveSignupCode(db)) || regSettings(db).approval, "ההרשמה פתוחה לכולם בלי קוד ובלי אישור", "high");
    add("https", "האתר נגיש ב-HTTPS", !config.isProd || req.secure || req.headers["x-forwarded-proto"] === "https", "הבקשה הגיעה ללא HTTPS", "high");
    add("smtp", "שליחת מייל מוגדרת (שחזור סיסמה והתראות)", !!mailer?.hasTransport, "אין שרת מייל. משתמשים לא יוכלו לשחזר סיסמה במייל");
    add("strict", "חסימת סיסמאות נפוצות לכולם", readStrict(db), "אפשר להפעיל 'סיסמאות נפוצות נחסמות' בהגדרות האבטחה");
    const stale = admins.filter((a) => Date.now() - Date.parse(a.password_changed_at || a.created_at) > 365 * 86400_000);
    add("adminpwage", "סיסמאות אדמין הוחלפו בשנה האחרונה", stale.length === 0, `ישנות: ${stale.map((a) => a.username).join(", ")}`);
    const dormant = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN' AND disabled = 0 AND COALESCE(last_login_at, created_at) < ?").get(new Date(Date.now() - 90 * 86400_000).toISOString()).c;
    add("dormant", "אין אדמינים לא פעילים מעל 90 יום", dormant === 0, `${dormant} אדמינים לא התחברו 90 יום. שקלו להשעות`);
    add("audit", "יומן הביקורת תקין (שרשרת גיבוב)", auditIntact(db), "נמצאה אי-התאמה ביומן הביקורת", "high");
    const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
    res.json({ score, checks });
  });

  // ── אבטחה אישית ──
  app.get("/api/me/security-score", requireUser({ allowMustChange: true }), (req, res) => {
    res.json(securityScore(db, db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)));
  });
  app.get("/api/me/login-history", requireUser({ allowMustChange: true }), (req, res) => {
    const rows = db.prepare("SELECT at, kind, country, device FROM access_log WHERE user_id = ? AND kind IN ('login','register') ORDER BY id DESC LIMIT 20").all(req.user.id);
    const sessions = db.prepare("SELECT created_at AS at, device, method, new_device AS newDevice FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(req.user.id);
    res.json({ logins: rows, sessions: sessions.map((s) => ({ ...s, newDevice: !!s.newDevice })) });
  });
  app.get("/api/me/security-events", requireUser({ allowMustChange: true }), (req, res) => {
    const rows = db.prepare("SELECT at, action FROM audit_log WHERE actor = ? ORDER BY id DESC LIMIT 200").all(req.user.username);
    const labels = { "login.fail": "ניסיון כניסה שנכשל", "login.locked": "החשבון ננעל זמנית", "login.newdevice": "כניסה ממכשיר חדש", "password.change": "החלפת סיסמה", "password.reset": "איפוס סיסמה", "2fa.enable": "הפעלת אימות דו-שלבי", "2fa.disable": "ביטול אימות דו-שלבי", "contact.updated": "עדכון פרטי קשר", register: "הרשמה" };
    const ev = rows.filter((r) => labels[r.action] || /^(login|password|2fa|session|magic)/.test(r.action)).slice(0, 30).map((r) => ({ at: r.at, action: r.action, label: labels[r.action] || r.action }));
    res.json({ events: ev });
  });

  // ── מחיקת החשבון שלי (הייצוא קיים כבר: GET /api/me/export) ──
  app.post("/api/me/delete", requireUser(), limiter(60 * 60_000, 5), async (req, res) => {
    const v = z.object({ password: z.string().min(1).max(200), confirm: z.string(), activities: z.enum(["keep", "archive"]).default("keep") }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (u.role === "ADMIN") return res.status(403).json(fail("ADMIN_DELETE", "חשבון אדמין נמחק רק על ידי אדמין ראשי אחר"));
    if (v.confirm !== "מחיקה") return res.status(400).json(fail("CONFIRM", 'כדי לאשר, כתבו את המילה "מחיקה"'));
    if (!(await verifyPassword(v.password, u.password_hash))) return res.status(400).json(fail("BAD_PASSWORD", "הסיסמה שגויה"));
    db.exec("BEGIN");
    try {
      if (v.activities === "archive") db.prepare("UPDATE activities SET status = 'ARCHIVED', owner_id = NULL, updated_at = ? WHERE owner_id = ?").run(nowIso(), u.id);
      else db.prepare("UPDATE activities SET owner_id = NULL WHERE owner_id = ?").run(u.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      return res.status(409).json(fail("IN_USE", "לא ניתן למחוק כרגע. פנו למנהל המערכת"));
    }
    audit(db, u.username, "me.delete", { activities: v.activities });
    res.json({ ok: true });
  });
}

function readStrict(db) {
  const r = db.prepare("SELECT value FROM settings WHERE key = 'sec.strictPasswords'").get();
  return r?.value === "1";
}
function auditIntact(db) {
  try {
    const rows = db.prepare("SELECT hash, prev_hash FROM audit_log WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 200").all();
    for (let i = 0; i < rows.length - 1; i++) if (rows[i].prev_hash !== rows[i + 1].hash) return false;
    return true;
  } catch {
    return false;
  }
}

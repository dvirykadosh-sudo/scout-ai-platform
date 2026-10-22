// חשבונות ואבטחה, רעיונות 81–90: כניסה בכל זיהוי, מייל וטלפון, אימות, איפוס סיסמה, קישור קסם,
// אימות דו-שלבי, מכשירים מחוברים, תפקידי צוות, ניהול משתמשים ויומן פעולות.
import crypto from "node:crypto";
import { z } from "zod";
import { checkLock, clearFailures, hashPassword, readChallenge, registerFailure, signChallenge, signToken, verifyPassword } from "./auth.js";
import {
  STAFF_KEYS,
  STAFF_ROLES,
  checkTotp,
  currentStep,
  deviceLabel,
  effectiveStaff,
  findByIdentifier,
  hashSecret,
  looksLikePhone,
  maskEmail,
  maskPhone,
  minutesFromNow,
  newBackupCodes,
  newCode,
  newToken,
  newTotpSecret,
  normalizeEmail,
  normalizePhone,
  openSecret,
  otpauthUrl,
  safeEqual,
  sealSecret,
} from "./accounts.js";
import { config } from "./config.js";
import { audit, auditHash, nowIso } from "./db.js";
import { escapeHtml } from "./email.js";
import { FLAG_TEXT, TERMS_VERSION, checkCaptcha, failuresForUser, failuresFromIp, invalidateBlocks, loginFlags, logAccess, makeCaptcha, pageFrom, passwordProblems, readSettings, securityAlert, strictFor, countryOf } from "./security.js";

const text = (max) => z.string().trim().max(max);
const optText = (max) => z.string().trim().max(max).optional();
const pw = z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים").max(200);
const username = text(30)
  .min(3, "שם משתמש: לפחות 3 תווים")
  .regex(/^[A-Za-z0-9_.֐-׿-]+$/, "שם משתמש יכול להכיל אותיות, ספרות, נקודה, מקף וקו תחתון");

export function registerAccountRoutes(app, { db, mailer, limiter, fail, requireUser, requireAdmin, signupOpen }) {
  const ip = (req) => req.ip || "";
  const ua = (req) => String(req.headers["user-agent"] || "").slice(0, 200);
  const isDev = !config.isProd;
  const providers = () => ({ email: !!mailer?.hasTransport, phone: !!config.sms.webhook });

  const publicUser = (u) => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    role: u.role,
    staffRole: effectiveStaff(u),
    mustChangePw: !!u.must_change_pw,
    email: u.email || "",
    phone: u.phone || "",
    emailVerified: !!u.email_verified_at,
    phoneVerified: !!u.phone_verified_at,
    totpEnabled: !!u.totp_enabled,
    termsAccepted: u.terms_version === TERMS_VERSION,
  });

  const checkPolicy = (res, pwd, uname, role) => {
    if (!strictFor(db, role)) return false;
    const pr = passwordProblems(pwd, { username: uname });
    if (!pr.length) return false;
    res.status(400).json(fail("WEAK_PASSWORD", `סיסמה חלשה: ${pr.join(", ")}. בחרו סיסמה ארוכה יותר ופחות צפויה`));
    return true;
  };

  // ───── חיבורים (מכשירים) ─────
  const startSession = (req, user, method) => {
    const id = crypto.randomBytes(16).toString("hex");
    const t = nowIso();
    db.prepare("INSERT INTO auth_sessions (id, user_id, created_at, last_seen_at, ip, user_agent, device, method) VALUES (?,?,?,?,?,?,?,?)").run(id, user.id, t, t, ip(req), ua(req), deviceLabel(ua(req)), method);
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(t, user.id);
    // חיבורים ישנים שכבר לא בשימוש לא נשמרים לנצח
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND (revoked_at IS NOT NULL OR last_seen_at < ?) AND created_at < ?").run(user.id, new Date(Date.now() - 90 * 86400000).toISOString(), new Date(Date.now() - 90 * 86400000).toISOString());
    return signToken(user, id);
  };
  const revokeSessions = (userId, exceptSid = null) =>
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?").run(nowIso(), userId, exceptSid ?? "").changes;
  const finishLogin = (req, res, user, method) => {
    // תפוגת סיסמה (אם הוגדרה): הכניסה מצליחה, אבל נדרשת החלפה
    const maxAge = readSettings(db).passwordMaxAgeDays;
    if (maxAge > 0 && !user.must_change_pw) {
      const since = new Date(user.password_changed_at || user.created_at).getTime();
      if (Date.now() - since > maxAge * 86400_000) {
        db.prepare("UPDATE users SET must_change_pw = 1 WHERE id = ?").run(user.id);
        audit(db, user.username, "password.expired", { maxAge });
        user = { ...user, must_change_pw: 1 };
      }
    }
    const token = startSession(req, user, method);
    const flags = loginFlags(db, user, countryOf(req.ip));
    logAccess(db, req, "login", { user, flag: flags.join(",") || null, note: method, page: pageFrom(req) });
    if (flags.length) securityAlert(db, mailer, `כניסה חריגה של ${user.username}: ${flags.map((f) => FLAG_TEXT[f]).join(", ")}`);
    audit(db, user.username, "login.success", { method });
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    res.json({ token, user: publicUser(fresh) });
  };

  // ───── קודים וקישורים חד-פעמיים ─────
  const issue = (userId, kind, target, secret, minutes) => {
    db.prepare("UPDATE verify_codes SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL").run(nowIso(), userId, kind);
    db.prepare("INSERT INTO verify_codes (user_id, kind, target, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)").run(userId, kind, target || null, hashSecret(`${kind}|${secret}`), minutesFromNow(minutes), nowIso());
  };
  const tooMany = (userId, kind) => db.prepare("SELECT COUNT(*) AS c FROM verify_codes WHERE user_id = ? AND kind = ? AND created_at > ?").get(userId, kind, new Date(Date.now() - 3600_000).toISOString()).c >= 5;
  /** בודק קוד ומסמן אותו כמנוצל. מחזיר "ok" | "bad" | "locked". */
  const consume = (userId, kind, secret, target = null) => {
    const row = db.prepare("SELECT * FROM verify_codes WHERE user_id = ? AND kind = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1").get(userId, kind, nowIso());
    if (!row || (target && row.target !== target)) return "bad";
    if (row.attempts >= 5) return "locked";
    if (!safeEqual(row.code_hash, hashSecret(`${kind}|${secret}`))) {
      db.prepare("UPDATE verify_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
      return "bad";
    }
    db.prepare("UPDATE verify_codes SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
    return "ok";
  };

  const emailHtml = (title, body) =>
    `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,sans-serif;background:#f4f1fb;padding:16px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;color:#222"><h2 style="margin-top:0;color:#4b2a8a">${escapeHtml(title)}</h2>${body}<p style="color:#777;font-size:12px">אם לא ביקשתם את זה, אפשר להתעלם מההודעה.</p></div></body></html>`;

  /** שולח הודעה בערוץ. מחזיר "sent" | "dev" (אין ספק, מצב פיתוח) | "none" (אין ספק, ייצור). */
  const deliver = async (channel, to, subject, message, htmlBody) => {
    if (channel === "email" && mailer?.hasTransport) {
      mailer.enqueue(subject, emailHtml(subject, htmlBody ?? `<p style="font-size:16px">${escapeHtml(message)}</p>`), to);
      mailer.processQueue().catch(() => {});
      return "sent";
    }
    if (channel === "phone" && config.sms.webhook) {
      const r = await fetch(config.sms.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(config.sms.token ? { Authorization: `Bearer ${config.sms.token}` } : {}) },
        body: JSON.stringify({ to, message }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`sms provider ${r.status}`);
      return "sent";
    }
    return isDev ? "dev" : "none";
  };
  const noProvider = (res) => res.status(503).json(fail("NO_PROVIDER", "שליחת הודעות לא מוגדרת באתר הזה. בקשו מהאדמין לאמת או לאפס בשבילכם"));
  const origin = (req) => config.publicUrl || (config.isProd ? `${req.protocol}://${req.get("host")}` : config.webOrigin);

  app.get("/api/auth/options", (req, res) => res.json({ providers: providers(), signupOpen: signupOpen(), signupNeedsCode: !!config.signupCode }));

  // ───── 81. כניסה בשם משתמש, מייל או טלפון ─────
  const capFields = () => {
    const c = makeCaptcha();
    return { captchaToken: [c.token], captchaQuestion: [c.question] };
  };
  const failedLogin = (req, ident, user, note) => {
    logAccess(db, req, "login_fail", { user, username: ident, note, page: pageFrom(req) });
    const st = readSettings(db);
    const n = failuresFromIp(db, req.ip);
    if (n === 10) securityAlert(db, mailer, `ניסיונות כניסה כושלים רבים מכתובת אחת (${n} ב-15 דקות)`);
    if (st.autoBlockAfter > 0 && n >= st.autoBlockAfter) {
      const target = String(req.ip).replace(/^::ffff:/, "");
      db.prepare("INSERT OR IGNORE INTO ip_blocks (target, note, created_by, created_at, expires_at) VALUES (?,?,?,?,?)").run(target, `חסימה אוטומטית אחרי ${n} כשלונות`, "system", nowIso(), minutesFromNow(60));
      invalidateBlocks(db);
      audit(db, "system", "block.auto", { target, failures: n });
      securityAlert(db, mailer, `הכתובת ${target} נחסמה אוטומטית לשעה אחרי ${n} כשלונות`);
    }
    if (user && failuresForUser(db, user.id) === 15) securityAlert(db, mailer, `ניסיונות כניסה כושלים רבים לחשבון ${user.username} (15 בשעה האחרונה)`);
  };

  // ───── 81. כניסה בשם משתמש, מייל או טלפון ─────
  app.post("/api/auth/login", limiter(15 * 60_000, 30), async (req, res) => {
    const { username: ident, password, captchaToken, captchaAnswer } = z.object({ username: text(120).min(1), password: z.string().min(1).max(200), captchaToken: optText(2000), captchaAnswer: optText(10) }).parse(req.body ?? {});
    if (failuresFromIp(db, req.ip) >= 20) return res.status(429).json(fail("LOCKED_IP", "יותר מדי ניסיונות כושלים מהרשת הזו. נסו שוב בעוד כמה דקות"));
    const key = `${ident.toLowerCase()}|${req.ip}`;
    const locked = checkLock(db, key);
    if (locked) {
      audit(db, ident, "login.locked", {});
      return res.status(429).json(fail("LOCKED", `יותר מדי ניסיונות כושלים. נסו שוב בעוד ${locked} דקות`));
    }
    const user = findByIdentifier(db, ident);
    // אחרי שלושה כשלונות נדרשת שאלת חשבון פשוטה, כדי לעצור ניחוש אוטומטי
    const prior = db.prepare("SELECT count FROM login_attempts WHERE key = ?").get(key)?.count ?? 0;
    if (prior >= 3 && !checkCaptcha(captchaToken, captchaAnswer)) {
      registerFailure(db, key);
      failedLogin(req, ident, user, "captcha");
      return res.status(401).json(fail("CAPTCHA_REQUIRED", "כדי להמשיך, ענו על השאלה הקצרה", capFields()));
    }
    const ok = await verifyPassword(password, user?.password_hash);
    if (!user || !ok || user.disabled) {
      const n = registerFailure(db, key);
      audit(db, ident, "login.fail", {});
      failedLogin(req, ident, user, user?.disabled ? "disabled" : "password");
      return res.status(401).json(fail("BAD_CREDENTIALS", "פרטי ההתחברות שגויים", n >= 3 ? capFields() : undefined));
    }
    clearFailures(db, key);
    if (user.totp_enabled) {
      audit(db, user.username, "login.2fa_required", {});
      return res.json({ needs2fa: true, challenge: signChallenge(user.id) });
    }
    finishLogin(req, res, user, "password");
  });

  // ───── 86. שלב שני: קוד מהאפליקציה או קוד גיבוי ─────
  const checkSecondFactor = (user, code) => {
    const secret = user.totp_secret ? openSecret(user.totp_secret) : null;
    const c = String(code ?? "").trim();
    if (secret) {
      const step = checkTotp(secret, c, user.totp_last_step);
      if (step !== null) {
        db.prepare("UPDATE users SET totp_last_step = ? WHERE id = ?").run(step, user.id);
        return "totp";
      }
    }
    const list = user.backup_codes ? JSON.parse(user.backup_codes) : [];
    const h = hashSecret(`backup|${c.toLowerCase()}`);
    const i = list.findIndex((x) => safeEqual(x, h));
    if (i >= 0) {
      list.splice(i, 1);
      db.prepare("UPDATE users SET backup_codes = ? WHERE id = ?").run(JSON.stringify(list), user.id);
      return "backup";
    }
    return null;
  };
  app.post("/api/auth/2fa", limiter(15 * 60_000, 30), (req, res) => {
    const { challenge, code } = z.object({ challenge: z.string().min(10).max(2000), code: text(20).min(4) }).parse(req.body ?? {});
    const ch = readChallenge(challenge);
    const user = ch && db.prepare("SELECT * FROM users WHERE id = ?").get(ch.sub);
    if (!user || user.disabled || !user.totp_enabled) return res.status(401).json(fail("BAD_CHALLENGE", "פג תוקף ההתחברות. התחברו מחדש"));
    const key = `2fa|${user.id}`;
    const locked = checkLock(db, key);
    if (locked) return res.status(429).json(fail("LOCKED", `יותר מדי ניסיונות. נסו שוב בעוד ${locked} דקות`));
    const how = checkSecondFactor(user, code);
    if (!how) {
      registerFailure(db, key);
      failedLogin(req, user.username, user, "2fa");
      audit(db, user.username, "login.2fa_fail", {});
      return res.status(401).json(fail("BAD_CODE", "הקוד שגוי"));
    }
    clearFailures(db, key);
    if (how === "backup") audit(db, user.username, "2fa.backup_used", {});
    finishLogin(req, res, user, how === "backup" ? "password+backup" : "password+2fa");
  });

  // ───── 82. הרשמה עם מייל וטלפון ─────
  app.post("/api/auth/register", limiter(60 * 60_000, 10), async (req, res) => {
    if (!signupOpen()) return res.status(403).json(fail("SIGNUP_CLOSED", "ההרשמה סגורה. פנו למנהל המערכת שייצור לכם משתמש"));
    const v = z.object({ username, password: pw, displayName: text(60).min(2, "יש להזין שם להצגה"), signupCode: text(100).optional().default(""), email: optText(120), phone: optText(30), acceptTerms: z.boolean().optional() }).parse(req.body ?? {});
    if (config.signupCode && v.signupCode !== config.signupCode) {
      audit(db, v.username, "register.badcode", {});
      return res.status(403).json(fail("BAD_CODE", "קוד ההרשמה שגוי. בקשו אותו ממנהל השבט"));
    }
    if (looksLikePhone(v.username)) return res.status(400).json(fail("BAD_USERNAME", "שם משתמש לא יכול להיראות כמו מספר טלפון. בחרו שם אחר"));
    if (!v.acceptTerms && config.nodeEnv !== "test") return res.status(400).json(fail("TERMS", "יש לאשר את תנאי השימוש ומדיניות הפרטיות"));
    if (checkPolicy(res, v.password, v.username, "INSTRUCTOR")) return;
    const email = v.email ? normalizeEmail(v.email) : null;
    const phone = v.phone ? normalizePhone(v.phone) : null;
    if (v.email && !email) return res.status(400).json(fail("BAD_EMAIL", "כתובת המייל לא תקינה"));
    if (v.phone && !phone) return res.status(400).json(fail("BAD_PHONE", "מספר הטלפון לא תקין. למשל 050-1234567"));
    if (db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(v.username)) return res.status(409).json(fail("USERNAME_TAKEN", "שם המשתמש תפוס. בחרו שם אחר"));
    if (email && db.prepare("SELECT 1 FROM users WHERE lower(email) = ? AND email_verified_at IS NOT NULL").get(email)) return res.status(409).json(fail("EMAIL_TAKEN", "המייל הזה כבר משויך לחשבון אחר"));
    if (phone && db.prepare("SELECT 1 FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL").get(phone)) return res.status(409).json(fail("PHONE_TAKEN", "הטלפון הזה כבר משויך לחשבון אחר"));
    const r = db
      .prepare("INSERT INTO users (username, password_hash, role, must_change_pw, created_at, display_name, email, phone, password_changed_at, terms_accepted_at, terms_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(v.username, await hashPassword(v.password), "INSTRUCTOR", 0, nowIso(), v.displayName, email, phone, nowIso(), v.acceptTerms ? nowIso() : null, v.acceptTerms ? TERMS_VERSION : null);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(r.lastInsertRowid));
    audit(db, user.username, "register", { email: !!email, phone: !!phone });
    const token = startSession(req, user, "register");
    logAccess(db, req, "register", { user, page: pageFrom(req) });
    res.status(201).json({ token, user: publicUser(user) });
  });

  app.get("/api/auth/me", requireUser({ allowMustChange: true }), (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!u || u.disabled) return res.status(401).json(fail("UNAUTHORIZED", "החשבון אינו פעיל"));
    res.json({ user: publicUser(u) });
  });

  app.post("/api/auth/logout", requireUser({ allowMustChange: true }), (req, res) => {
    if (req.user.sid) db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), req.user.sid, req.user.id);
    logAccess(db, req, "logout", { user: req.user });
    res.json({ ok: true });
  });

  app.post("/api/auth/change-password", requireUser({ allowMustChange: true }), async (req, res) => {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1).max(200), newPassword: pw }).parse(req.body ?? {});
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!(await verifyPassword(currentPassword, user.password_hash))) return res.status(400).json(fail("BAD_PASSWORD", "הסיסמה הנוכחית שגויה"));
    if (checkPolicy(res, newPassword, user.username, user.role)) return;
    db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 0, password_changed_at = ? WHERE id = ?").run(await hashPassword(newPassword), nowIso(), user.id);
    const out = revokeSessions(user.id, req.user.sid);
    audit(db, user.username, "password.changed", { otherSessionsClosed: out });
    res.json({ token: signToken({ ...user, must_change_pw: 0 }, req.user.sid) });
  });

  // ───── 84. איפוס סיסמה ─────
  const GENERIC = "אם החשבון קיים ויש בו מייל או טלפון מאומתים, נשלח אליהם קוד. הקוד תקף ל-15 דקות.";
  app.post("/api/auth/forgot", limiter(60 * 60_000, 10), async (req, res) => {
    const { identifier } = z.object({ identifier: text(120).min(1) }).parse(req.body ?? {});
    const user = findByIdentifier(db, identifier);
    const out = { ok: true, message: GENERIC };
    if (user && !user.disabled && !tooMany(user.id, "reset")) {
      const channel = user.email_verified_at && providers().email ? "email" : user.phone_verified_at && providers().phone ? "phone" : user.email_verified_at ? "email" : user.phone_verified_at ? "phone" : null;
      if (channel) {
        const code = newCode();
        issue(user.id, "reset", channel, code, 15);
        try {
          const r = await deliver(channel, channel === "email" ? user.email : user.phone, "קוד לאיפוס סיסמה", `קוד איפוס הסיסמה שלכם ב"מחולל פעולות": ${code}. תקף ל-15 דקות.`, `<p>קוד איפוס הסיסמה:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;direction:ltr">${code}</p><p>תקף ל-15 דקות.</p>`);
          if (r === "dev") out.devCode = code;
        } catch (e) {
          audit(db, "system", "reset.send_failed", { user: user.username, error: String(e.message).slice(0, 100) });
        }
        audit(db, user.username, "reset.requested", { channel });
      }
    }
    res.json(out);
  });
  app.post("/api/auth/reset", limiter(60 * 60_000, 20), async (req, res) => {
    const { identifier, code, newPassword } = z.object({ identifier: text(120).min(1), code: text(10).min(4), newPassword: pw }).parse(req.body ?? {});
    const user = findByIdentifier(db, identifier);
    const bad = () => res.status(400).json(fail("BAD_CODE", "הקוד שגוי או שפג תוקפו"));
    if (!user || user.disabled) return bad();
    if (checkPolicy(res, newPassword, user.username, user.role)) return;
    const r = consume(user.id, "reset", code.trim());
    if (r === "locked") return res.status(429).json(fail("LOCKED", "יותר מדי ניסיונות. בקשו קוד חדש"));
    if (r !== "ok") return bad();
    db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 0, password_changed_at = ? WHERE id = ?").run(await hashPassword(newPassword), nowIso(), user.id);
    revokeSessions(user.id);
    clearFailures(db, `${String(identifier).toLowerCase()}|${req.ip}`);
    audit(db, user.username, "password.reset", {});
    res.json({ ok: true });
  });

  // ───── 85. כניסה בקישור קסם ─────
  app.post("/api/auth/magic/request", limiter(60 * 60_000, 10), async (req, res) => {
    const { email: raw } = z.object({ email: text(120).min(3) }).parse(req.body ?? {});
    const email = normalizeEmail(raw);
    const user = email ? findByIdentifier(db, email) : null;
    const out = { ok: true, message: "אם יש חשבון עם המייל הזה (מאומת), נשלח אליו קישור כניסה. הוא תקף ל-15 דקות." };
    if (user && !user.disabled && !tooMany(user.id, "magic")) {
      const token = newToken();
      issue(user.id, "magic", email, token, 15);
      const link = `${origin(req)}/account?magic=${token}`;
      try {
        const r = await deliver("email", email, "קישור כניסה", `קישור כניסה: ${link}`, `<p>לחצו כדי להיכנס:</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d3fd0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">כניסה למחולל</a></p><p style="direction:ltr;font-size:12px;color:#555">${escapeHtml(link)}</p><p>הקישור תקף ל-15 דקות ולשימוש אחד.</p>`);
        if (r === "dev") out.devToken = token;
      } catch (e) {
        audit(db, "system", "magic.send_failed", { error: String(e.message).slice(0, 100) });
      }
      audit(db, user.username, "magic.requested", {});
    }
    res.json(out);
  });
  app.post("/api/auth/magic/consume", limiter(15 * 60_000, 30), (req, res) => {
    const { token } = z.object({ token: text(100).min(20) }).parse(req.body ?? {});
    const h = hashSecret(`magic|${token}`);
    const row = db.prepare("SELECT * FROM verify_codes WHERE kind = 'magic' AND code_hash = ? AND used_at IS NULL AND expires_at > ?").get(h, nowIso());
    const user = row && db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
    if (!user || user.disabled || !user.email_verified_at) return res.status(400).json(fail("BAD_LINK", "הקישור לא תקף או שכבר נוצל. בקשו קישור חדש"));
    db.prepare("UPDATE verify_codes SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
    if (user.totp_enabled) return res.json({ needs2fa: true, challenge: signChallenge(user.id) });
    finishLogin(req, res, user, "magic-link");
  });

  // ───── 83. אימות מייל וטלפון ─────
  app.get("/api/me/security", requireUser({ allowMustChange: true }), (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    res.json({ ...publicUser(u), providers: providers(), backupCodesLeft: u.backup_codes ? JSON.parse(u.backup_codes).length : 0, lastLoginAt: u.last_login_at });
  });

  app.put("/api/me/contact", requireUser(), limiter(60 * 60_000, 20), async (req, res) => {
    const v = z.object({ password: z.string().min(1).max(200), email: optText(120), phone: optText(30) }).parse(req.body ?? {});
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!(await verifyPassword(v.password, user.password_hash))) return res.status(400).json(fail("BAD_PASSWORD", "הסיסמה שגויה"));
    let email = user.email;
    let phone = user.phone;
    if (v.email !== undefined) {
      email = v.email === "" ? null : normalizeEmail(v.email);
      if (v.email !== "" && !email) return res.status(400).json(fail("BAD_EMAIL", "כתובת המייל לא תקינה"));
    }
    if (v.phone !== undefined) {
      phone = v.phone === "" ? null : normalizePhone(v.phone);
      if (v.phone !== "" && !phone) return res.status(400).json(fail("BAD_PHONE", "מספר הטלפון לא תקין. למשל 050-1234567"));
    }
    const emailChanged = (email || null) !== (user.email || null);
    const phoneChanged = (phone || null) !== (user.phone || null);
    db.prepare("UPDATE users SET email = ?, phone = ?, email_verified_at = CASE WHEN ? THEN NULL ELSE email_verified_at END, phone_verified_at = CASE WHEN ? THEN NULL ELSE phone_verified_at END WHERE id = ?").run(email, phone, emailChanged ? 1 : 0, phoneChanged ? 1 : 0, user.id);
    audit(db, user.username, "contact.updated", { email: emailChanged, phone: phoneChanged });
    res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
  });

  app.post("/api/me/verify/request", requireUser(), limiter(60 * 60_000, 20), async (req, res) => {
    const { channel } = z.object({ channel: z.enum(["email", "phone"]) }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const target = channel === "email" ? u.email : u.phone;
    if (!target) return res.status(400).json(fail("NO_TARGET", channel === "email" ? "קודם הוסיפו כתובת מייל" : "קודם הוסיפו מספר טלפון"));
    if (channel === "email" ? u.email_verified_at : u.phone_verified_at) return res.status(400).json(fail("ALREADY", "כבר מאומת"));
    const taken = channel === "email" ? db.prepare("SELECT 1 FROM users WHERE lower(email) = ? AND email_verified_at IS NOT NULL AND id != ?").get(target.toLowerCase(), u.id) : db.prepare("SELECT 1 FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND id != ?").get(target, u.id);
    if (taken) return res.status(409).json(fail("TAKEN", "הפרט הזה כבר מאומת בחשבון אחר"));
    if (tooMany(u.id, `verify_${channel}`)) return res.status(429).json(fail("RATE_LIMIT", "נשלחו כבר כמה קודים. נסו שוב בעוד שעה"));
    const code = newCode();
    issue(u.id, `verify_${channel}`, target, code, 10);
    let r;
    try {
      r = await deliver(channel, target, "קוד אימות", `קוד האימות שלכם ב"מחולל פעולות": ${code}. תקף ל-10 דקות.`, `<p>קוד האימות:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;direction:ltr">${code}</p><p>תקף ל-10 דקות.</p>`);
    } catch {
      return res.status(502).json(fail("SEND_FAILED", "שליחת ההודעה נכשלה. נסו שוב מאוחר יותר"));
    }
    if (r === "none") return noProvider(res);
    audit(db, u.username, "verify.requested", { channel });
    res.json({ ok: true, sentTo: channel === "email" ? maskEmail(target) : maskPhone(target), ...(r === "dev" ? { devCode: code } : {}) });
  });

  app.post("/api/me/verify/confirm", requireUser(), limiter(15 * 60_000, 30), (req, res) => {
    const { channel, code } = z.object({ channel: z.enum(["email", "phone"]), code: text(10).min(4) }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const target = channel === "email" ? u.email : u.phone;
    const r = consume(u.id, `verify_${channel}`, code.trim(), target);
    if (r === "locked") return res.status(429).json(fail("LOCKED", "יותר מדי ניסיונות. בקשו קוד חדש"));
    if (r !== "ok") return res.status(400).json(fail("BAD_CODE", "הקוד שגוי או שפג תוקפו"));
    try {
      db.prepare(`UPDATE users SET ${channel}_verified_at = ? WHERE id = ?`).run(nowIso(), u.id);
    } catch {
      return res.status(409).json(fail("TAKEN", "הפרט הזה כבר מאומת בחשבון אחר"));
    }
    audit(db, u.username, "verify.confirmed", { channel });
    res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(u.id)) });
  });

  // ───── 86. אימות דו-שלבי ─────
  app.post("/api/me/2fa/setup", requireUser(), limiter(15 * 60_000, 20), (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (u.totp_enabled) return res.status(400).json(fail("ALREADY", "האימות הדו-שלבי כבר פעיל"));
    const secret = newTotpSecret();
    db.prepare("UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?").run(sealSecret(secret), u.id);
    res.json({ secret, otpauth: otpauthUrl(secret, u.username) });
  });
  app.post("/api/me/2fa/enable", requireUser(), limiter(15 * 60_000, 20), (req, res) => {
    const { code } = z.object({ code: text(10).min(6) }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const secret = u.totp_secret ? openSecret(u.totp_secret) : null;
    if (u.totp_enabled || !secret) return res.status(400).json(fail("NO_SETUP", "התחילו את ההגדרה מחדש"));
    const step = checkTotp(secret, code);
    if (step === null) return res.status(400).json(fail("BAD_CODE", "הקוד שגוי. בדקו שהשעה בטלפון מדויקת"));
    const backups = newBackupCodes();
    db.prepare("UPDATE users SET totp_enabled = 1, totp_last_step = ?, backup_codes = ? WHERE id = ?").run(step, JSON.stringify(backups.map((b) => hashSecret(`backup|${b}`))), u.id);
    audit(db, u.username, "2fa.enabled", {});
    res.json({ ok: true, backupCodes: backups });
  });
  app.post("/api/me/2fa/disable", requireUser(), limiter(15 * 60_000, 20), async (req, res) => {
    const { password, code } = z.object({ password: z.string().min(1).max(200), code: text(20).min(4) }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!u.totp_enabled) return res.status(400).json(fail("NOT_ENABLED", "האימות הדו-שלבי לא פעיל"));
    if (!(await verifyPassword(password, u.password_hash))) return res.status(400).json(fail("BAD_PASSWORD", "הסיסמה שגויה"));
    if (!checkSecondFactor(u, code)) return res.status(400).json(fail("BAD_CODE", "הקוד שגוי"));
    db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL, totp_last_step = NULL WHERE id = ?").run(u.id);
    audit(db, u.username, "2fa.disabled", {});
    res.json({ ok: true });
  });
  app.post("/api/me/2fa/backup-codes", requireUser(), limiter(15 * 60_000, 10), async (req, res) => {
    const { password, code } = z.object({ password: z.string().min(1).max(200), code: text(20).min(6) }).parse(req.body ?? {});
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!u.totp_enabled) return res.status(400).json(fail("NOT_ENABLED", "האימות הדו-שלבי לא פעיל"));
    if (!(await verifyPassword(password, u.password_hash))) return res.status(400).json(fail("BAD_PASSWORD", "הסיסמה שגויה"));
    if (checkTotp(openSecret(u.totp_secret) || "", code, u.totp_last_step) === null) return res.status(400).json(fail("BAD_CODE", "הקוד שגוי"));
    const backups = newBackupCodes();
    db.prepare("UPDATE users SET backup_codes = ? WHERE id = ?").run(JSON.stringify(backups.map((b) => hashSecret(`backup|${b}`))), u.id);
    audit(db, u.username, "2fa.backup_regenerated", {});
    res.json({ backupCodes: backups });
  });

  // ───── 87. מכשירים מחוברים ─────
  const sessionRow = (r, current) => ({ id: r.id, device: r.device || "מכשיר", ip: r.ip, createdAt: r.created_at, lastSeenAt: r.last_seen_at, method: r.method, current: r.id === current });
  const listSessions = (userId) => db.prepare("SELECT * FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 50").all(userId);
  app.get("/api/me/sessions", requireUser({ allowMustChange: true }), (req, res) => res.json(listSessions(req.user.id).map((r) => sessionRow(r, req.user.sid))));
  app.post("/api/me/sessions/revoke-others", requireUser(), (req, res) => {
    const n = revokeSessions(req.user.id, req.user.sid);
    audit(db, req.user.username, "session.revoke_others", { n });
    res.json({ revoked: n });
  });
  app.delete("/api/me/sessions/:id", requireUser(), (req, res) => {
    const r = db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").run(nowIso(), String(req.params.id), req.user.id);
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "החיבור לא נמצא"));
    audit(db, req.user.username, "session.revoke", { self: req.params.id === req.user.sid });
    res.json({ ok: true });
  });

  // ───── 88. תפקידי צוות ─────
  app.get("/api/admin/roles", requireAdmin(), (req, res) => res.json(STAFF_KEYS.map((k) => ({ key: k, ...STAFF_ROLES[k] }))));

  // ───── 89. ניהול משתמשים ─────
  const superCount = () => db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN' AND disabled = 0 AND (staff_role IS NULL OR staff_role = 'SUPER')").get().c;
  const isSuper = (u) => u.role === "ADMIN" && effectiveStaff(u) === "SUPER" && !u.disabled;
  const mayManage = (actor, target) => actor.staff === "SUPER" || target.role === "INSTRUCTOR";
  const userRow = (r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.username,
    role: r.role,
    staffRole: effectiveStaff(r),
    disabled: !!r.disabled,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    email: r.email || "",
    phone: r.phone || "",
    emailVerified: !!r.email_verified_at,
    phoneVerified: !!r.phone_verified_at,
    totpEnabled: !!r.totp_enabled,
    activities: r.activities ?? 0,
  });
  const USER_SQL = "SELECT u.*, (SELECT COUNT(*) FROM activities a WHERE a.owner_id = u.id AND a.status = 'PUBLISHED') AS activities FROM users u";

  app.get("/api/admin/users", requireAdmin(), (req, res) => {
    const q = z
      .object({ q: optText(80), role: z.enum(["ADMIN", "INSTRUCTOR"]).optional(), status: z.enum(["active", "disabled"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) })
      .parse(req.query);
    const where = [];
    const args = [];
    if (q.q) {
      where.push("(lower(u.username) LIKE ? OR lower(COALESCE(u.display_name,'')) LIKE ? OR lower(COALESCE(u.email,'')) LIKE ? OR COALESCE(u.phone,'') LIKE ?)");
      const like = `%${q.q.toLowerCase().replace(/[%_]/g, "")}%`;
      args.push(like, like, like, `%${(normalizePhone(q.q) || q.q).replace(/[^\d+]/g, "")}%`);
    }
    if (q.role) (where.push("u.role = ?"), args.push(q.role));
    if (q.status) where.push(q.status === "disabled" ? "u.disabled = 1" : "u.disabled = 0");
    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u${w}`).get(...args).c;
    const rows = db.prepare(`${USER_SQL}${w} ORDER BY u.id LIMIT ? OFFSET ?`).all(...args, q.pageSize, (q.page - 1) * q.pageSize);
    res.json({ items: rows.map(userRow), total, page: q.page, pageSize: q.pageSize });
  });

  app.post("/api/admin/users", requireAdmin(), async (req, res) => {
    const v = z
      .object({ username, displayName: text(60).min(2), password: pw.optional(), email: optText(120), phone: optText(30), role: z.enum(["ADMIN", "INSTRUCTOR"]).default("INSTRUCTOR"), staffRole: z.enum(["SUPER", "CONTENT", "USERS", "VIEWER"]).optional(), markVerified: z.boolean().optional() })
      .parse(req.body ?? {});
    if (v.role === "ADMIN" && req.user.staff !== "SUPER") return res.status(403).json(fail("FORBIDDEN_ROLE", "רק אדמין ראשי יכול ליצור אדמינים"));
    if (looksLikePhone(v.username)) return res.status(400).json(fail("BAD_USERNAME", "שם משתמש לא יכול להיראות כמו מספר טלפון"));
    const email = v.email ? normalizeEmail(v.email) : null;
    const phone = v.phone ? normalizePhone(v.phone) : null;
    if (v.email && !email) return res.status(400).json(fail("BAD_EMAIL", "כתובת המייל לא תקינה"));
    if (v.phone && !phone) return res.status(400).json(fail("BAD_PHONE", "מספר הטלפון לא תקין"));
    if (db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(v.username)) return res.status(409).json(fail("USERNAME_TAKEN", "שם המשתמש תפוס"));
    if (v.password && checkPolicy(res, v.password, v.username, v.role)) return;
    const temp = v.password ?? crypto.randomBytes(6).toString("base64url");
    const t = nowIso();
    try {
      const r = db
        .prepare("INSERT INTO users (username, password_hash, role, staff_role, must_change_pw, created_at, display_name, email, phone, email_verified_at, phone_verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(v.username, await hashPassword(temp), v.role, v.role === "ADMIN" ? v.staffRole ?? "CONTENT" : null, 1, t, v.displayName, email, phone, email && v.markVerified ? t : null, phone && v.markVerified ? t : null);
      audit(db, req.user.username, "user.create", { id: Number(r.lastInsertRowid), username: v.username, role: v.role, staffRole: v.role === "ADMIN" ? v.staffRole ?? "CONTENT" : null });
      res.status(201).json({ id: Number(r.lastInsertRowid), tempPassword: temp });
    } catch {
      res.status(409).json(fail("TAKEN", "המייל או הטלפון כבר מאומתים בחשבון אחר"));
    }
  });

  app.get("/api/admin/users/:id", requireAdmin(), (req, res) => {
    const u = db.prepare(`${USER_SQL} WHERE u.id = ?`).get(Number(req.params.id));
    if (!u) return res.status(404).json(fail("NOT_FOUND", "המשתמש לא נמצא"));
    const recent = db.prepare("SELECT at, action, details FROM audit_log WHERE actor = ? ORDER BY id DESC LIMIT 15").all(u.username).map((r) => ({ at: r.at, action: r.action, details: r.details ? JSON.parse(r.details) : null }));
    res.json({ ...userRow(u), sessions: listSessions(u.id).map((r) => sessionRow(r, null)), recent });
  });

  app.patch("/api/admin/users/:id", requireAdmin(), async (req, res) => {
    const id = Number(req.params.id);
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) return res.status(404).json(fail("NOT_FOUND", "המשתמש לא נמצא"));
    if (!mayManage(req.user, target)) return res.status(403).json(fail("FORBIDDEN_ROLE", "אפשר לנהל רק חשבונות של מדריכים"));
    const p = z
      .object({
        displayName: optText(60),
        disabled: z.boolean().optional(),
        role: z.enum(["ADMIN", "INSTRUCTOR"]).optional(),
        staffRole: z.enum(["SUPER", "CONTENT", "USERS", "VIEWER"]).optional(),
        resetPassword: z.boolean().optional(),
        email: z.string().trim().max(120).nullable().optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        verifyEmail: z.boolean().optional(),
        verifyPhone: z.boolean().optional(),
        reset2fa: z.boolean().optional(),
        revokeSessions: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    if ((p.role === "ADMIN" || p.staffRole) && req.user.staff !== "SUPER") return res.status(403).json(fail("FORBIDDEN_ROLE", "רק אדמין ראשי יכול לשנות תפקידים"));
    const demoting = (p.disabled === true || (p.role && p.role !== "ADMIN") || (p.staffRole && p.staffRole !== "SUPER")) && isSuper(target);
    if (id === req.user.id && (p.disabled || (p.role && p.role !== "ADMIN") || (p.staffRole && p.staffRole !== "SUPER"))) return res.status(400).json(fail("SELF", "אי אפשר להשבית או להוריד הרשאות לעצמכם"));
    if (demoting && superCount() <= 1) return res.status(400).json(fail("LAST_SUPER", "זה האדמין הראשי האחרון. קודם מנו אדמין ראשי נוסף"));
    let tempPassword;
    let email = target.email;
    let phone = target.phone;
    if (p.email !== undefined) {
      email = p.email ? normalizeEmail(p.email) : null;
      if (p.email && !email) return res.status(400).json(fail("BAD_EMAIL", "כתובת המייל לא תקינה"));
    }
    if (p.phone !== undefined) {
      phone = p.phone ? normalizePhone(p.phone) : null;
      if (p.phone && !phone) return res.status(400).json(fail("BAD_PHONE", "מספר הטלפון לא תקין"));
    }
    try {
      if (p.displayName) db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(p.displayName, id);
      if (p.disabled !== undefined) db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(p.disabled ? 1 : 0, id);
      if (p.role) db.prepare("UPDATE users SET role = ?, staff_role = CASE WHEN ? = 'ADMIN' THEN COALESCE(staff_role, 'CONTENT') ELSE NULL END WHERE id = ?").run(p.role, p.role, id);
      if (p.staffRole && (p.role ?? target.role) === "ADMIN") db.prepare("UPDATE users SET staff_role = ? WHERE id = ?").run(p.staffRole, id);
      if (p.email !== undefined) db.prepare("UPDATE users SET email = ?, email_verified_at = CASE WHEN COALESCE(email,'') = COALESCE(?,'') THEN email_verified_at ELSE NULL END WHERE id = ?").run(email, email, id);
      if (p.phone !== undefined) db.prepare("UPDATE users SET phone = ?, phone_verified_at = CASE WHEN COALESCE(phone,'') = COALESCE(?,'') THEN phone_verified_at ELSE NULL END WHERE id = ?").run(phone, phone, id);
      if (p.verifyEmail !== undefined) db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ? AND email IS NOT NULL").run(p.verifyEmail ? nowIso() : null, id);
      if (p.verifyPhone !== undefined) db.prepare("UPDATE users SET phone_verified_at = ? WHERE id = ? AND phone IS NOT NULL").run(p.verifyPhone ? nowIso() : null, id);
    } catch {
      return res.status(409).json(fail("TAKEN", "המייל או הטלפון כבר מאומתים בחשבון אחר"));
    }
    if (p.reset2fa) db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL, totp_last_step = NULL WHERE id = ?").run(id);
    if (p.resetPassword) {
      tempPassword = crypto.randomBytes(6).toString("base64url");
      db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 1, password_changed_at = ? WHERE id = ?").run(await hashPassword(tempPassword), nowIso(), id);
    }
    if (p.revokeSessions || p.resetPassword || p.disabled) revokeSessions(id);
    audit(db, req.user.username, "user.update", { id, username: target.username, ...p });
    res.json({ ok: true, ...(tempPassword ? { tempPassword } : {}) });
  });

  app.delete("/api/admin/users/:id", requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) return res.status(404).json(fail("NOT_FOUND", "המשתמש לא נמצא"));
    if (!mayManage(req.user, target)) return res.status(403).json(fail("FORBIDDEN_ROLE", "אפשר לנהל רק חשבונות של מדריכים"));
    if (id === req.user.id) return res.status(400).json(fail("SELF", "אי אפשר למחוק את החשבון של עצמכם"));
    if (isSuper(target) && superCount() <= 1) return res.status(400).json(fail("LAST_SUPER", "זה האדמין הראשי האחרון"));
    const n = db.prepare("SELECT COUNT(*) AS c FROM activities WHERE owner_id = ?").get(id).c;
    if (n > 0) return res.status(409).json(fail("HAS_ACTIVITIES", `למשתמש יש ${n} פעולות. כדי לא לאבד אותן, השעו את החשבון במקום למחוק`));
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    } catch {
      return res.status(409).json(fail("IN_USE", "יש נתונים שמקושרים למשתמש. השעו את החשבון במקום למחוק"));
    }
    audit(db, req.user.username, "user.delete", { id, username: target.username });
    res.json({ ok: true });
  });

  app.get("/api/admin/users/:id/sessions", requireAdmin(), (req, res) => res.json(listSessions(Number(req.params.id)).map((r) => sessionRow(r, null))));
  app.delete("/api/admin/users/:id/sessions/:sid", requireAdmin(), (req, res) => {
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(req.params.id));
    if (!target || !mayManage(req.user, target)) return res.status(404).json(fail("NOT_FOUND", "לא נמצא"));
    const r = db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").run(nowIso(), String(req.params.sid), target.id);
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "החיבור לא נמצא"));
    audit(db, req.user.username, "session.admin_revoke", { user: target.username });
    res.json({ ok: true });
  });

  app.get("/api/admin/security", requireAdmin(), (req, res) => {
    const admins = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' ORDER BY id").all().map((u) => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, staffRole: effectiveStaff(u), disabled: !!u.disabled, totpEnabled: !!u.totp_enabled, emailVerified: !!u.email_verified_at, lastLoginAt: u.last_login_at }));
    res.json({ providers: providers(), admins, adminsWithout2fa: admins.filter((a) => !a.disabled && !a.totpEnabled).length });
  });

  // ───── 90. יומן פעולות מלא ─────
  const auditQuery = (q) => {
    const where = [];
    const args = [];
    if (q.actor) (where.push("actor LIKE ?"), args.push(`%${q.actor}%`));
    if (q.action) (where.push("action LIKE ?"), args.push(`${q.action}%`));
    if (q.q) (where.push("(actor LIKE ? OR action LIKE ? OR COALESCE(details,'') LIKE ?)"), args.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`));
    if (q.from) (where.push("at >= ?"), args.push(q.from));
    if (q.to) (where.push("at <= ?"), args.push(`${q.to}T23:59:59.999Z`));
    return { w: where.length ? ` WHERE ${where.join(" AND ")}` : "", args };
  };
  const auditSchema = z.object({ q: optText(80), actor: optText(60), action: optText(60), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) });
  app.get("/api/admin/audit", requireAdmin(), (req, res) => {
    const q = auditSchema.parse(req.query);
    const { w, args } = auditQuery(q);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_log${w}`).get(...args).c;
    const rows = db.prepare(`SELECT id, at, actor, action, details FROM audit_log${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, q.limit, q.offset);
    res.json({ total, items: rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })) });
  });
  const csvCell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // הגנה מהזרקת נוסחאות באקסל
    return `"${s.replace(/"/g, '""')}"`;
  };
  app.get("/api/admin/audit.csv", requireAdmin(), (req, res) => {
    const q = auditSchema.parse(req.query);
    const { w, args } = auditQuery(q);
    const rows = db.prepare(`SELECT id, at, actor, action, details FROM audit_log${w} ORDER BY id DESC LIMIT 5000`).all(...args);
    const csv = ["id,at,actor,action,details", ...rows.map((r) => [r.id, r.at, r.actor, r.action, r.details ?? ""].map(csvCell).join(","))].join("\r\n");
    audit(db, req.user.username, "audit.export", { rows: rows.length });
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audit-log.csv"' }).send(`﻿${csv}`);
  });
  app.get("/api/admin/audit/verify", requireAdmin(), (req, res) => {
    let prev = "";
    let checked = 0;
    let after = 0;
    for (;;) {
      const rows = db.prepare("SELECT id, at, actor, action, details, prev_hash, hash FROM audit_log WHERE id > ? AND hash IS NOT NULL ORDER BY id LIMIT 1000").all(after);
      if (!rows.length) break;
      for (const r of rows) {
        if (checked > 0 && r.prev_hash !== prev) return res.json({ ok: false, checked, brokenAt: r.id, reason: "השרשרת נקטעה: חסרה שורה לפני השורה הזו" });
        if (auditHash(r.prev_hash, r.at, r.actor, r.action, r.details) !== r.hash) return res.json({ ok: false, checked, brokenAt: r.id, reason: "תוכן השורה שונה אחרי שנרשם" });
        prev = r.hash;
        checked++;
        after = r.id;
      }
    }
    res.json({ ok: true, checked });
  });
}

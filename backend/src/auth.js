import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { audit, nowIso } from "./db.js";
import { effectiveStaff, staffMayDo } from "./accounts.js";
import { passwordProblems } from "./security.js";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Compared against when the user doesn't exist, so timing doesn't reveal valid usernames.
// שלב 63: באותו מחיר (cost) כמו סיסמאות אמיתיות, אחרת חשבון לא קיים נבדק מהר יותר מחשבון קיים. מחושב פעם אחת, לא חוסם את הטעינה.
let dummyHash = null;
const dummy = () => (dummyHash ||= bcrypt.hash("dummy-password-for-timing", config.bcryptCost));

export const hashPassword = (pw) => bcrypt.hash(pw, config.bcryptCost);
export const timingDummyRounds = async () => bcrypt.getRounds(await dummy());
export const verifyPassword = async (pw, hash) => bcrypt.compare(pw, hash || (await dummy())).then((ok) => ok && !!hash);

/** אימות אסימון מול המפתח הנוכחי, ואם הוגדר JWT_SECRET_PREVIOUS גם מולו (החלפת מפתח בלי לנתק את כולם). */
export function verifyJwt(token, opts = { algorithms: ["HS256"] }) {
  try {
    return jwt.verify(token, config.jwtSecret, opts);
  } catch (e) {
    if (!config.jwtSecretPrevious) throw e;
    return jwt.verify(token, config.jwtSecretPrevious, opts);
  }
}

export function signToken(user, sid) {
  const expiresIn = user.role === "ADMIN" ? `${config.tokenHours}h` : `${config.instructorTokenDays}d`;
  return jwt.sign({ sub: user.id, username: user.username, role: user.role, mustChangePw: !!user.must_change_pw, ...(sid ? { sid } : {}) }, config.jwtSecret, { expiresIn });
}

/** אסימון קצר לשלב האימות הדו-שלבי, בלי הרשאות אחרות. */
// שלב 64 (ממצא 28): לכל אסימון אתגר יש jti. אחרי כניסה מוצלחת הוא "נשרף", ולא ניתן להשתמש בו שוב גם אם הועתק (התוקף נשאר 5 דקות).
const burned = new Map();
export const signChallenge = (userId, purpose = "2fa") => jwt.sign({ sub: userId, purpose, jti: crypto.randomUUID() }, config.jwtSecret, { expiresIn: "5m" });
export function readChallenge(token, purpose = "2fa") {
  try {
    const p = verifyJwt(String(token));
    if (p.purpose !== purpose) return null;
    if (p.jti && burned.has(p.jti)) return null;
    return p;
  } catch {
    return null;
  }
}
/** מסמן אסימון אתגר כמנוצל. נקרא אחרי אימות דו-שלבי מוצלח. */
export function burnChallenge(p) {
  if (!p?.jti) return;
  const now = Date.now();
  burned.set(p.jti, now + 6 * 60_000);
  if (burned.size > 500) for (const [k, exp] of burned) if (exp < now) burned.delete(k);
}

export function ensureAdmin(db) {
  const exists = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (exists) return false;
  // שלב 63: במסד חדש בפרודקשן לא יוצרים אדמין עם סיסמה חלשה (admin123, 12345678...). זו הדלת הראשית לאתר.
  if (config.isProd) {
    const bad = passwordProblems(config.admin.password, { username: config.admin.username });
    if (bad.length) {
      console.error(`לא ניתן ליצור את חשבון האדמין הראשון: ADMIN_PASSWORD חלשה (${bad.join(", ")}). הגדירו סיסמה ארוכה וחזקה ב-Render ← Environment.`);
      process.exit(1);
    }
  }
  const hash = bcrypt.hashSync(config.admin.password, config.bcryptCost);
  db.prepare("INSERT INTO users (username, password_hash, role, must_change_pw, created_at) VALUES (?,?,?,?,?)").run(
    config.admin.username,
    hash,
    "ADMIN",
    config.isProd ? 1 : 0,
    nowIso(),
  );
  audit(db, "system", "admin.created", { username: config.admin.username });
  return true;
}

/**
 * קורא את האסימון ומאמת אותו מול מסד הנתונים: החיבור לא בוטל, החשבון לא מושעה,
 * והתפקיד נלקח מהמסד (ולכן הורדת הרשאות חלה מיד).
 */
function readToken(req) {
  if (req._tok !== undefined) return req._tok;
  const header = req.headers.authorization || "";
  let out = null;
  if (header.startsWith("Bearer ")) {
    try {
      const p = verifyJwt(header.slice(7));
      if (p.purpose) throw new Error("not a session token");
      const db = req.db;
      if (!db) out = p;
      else {
        const u = db.prepare("SELECT id, username, role, staff_role, disabled, must_change_pw, expires_at FROM users WHERE id = ?").get(p.sub);
        let live = !!u && !u.disabled && !(u.expires_at && Date.parse(u.expires_at) < Date.now());
        if (live && p.sid) {
          const s = db.prepare("SELECT revoked_at, last_seen_at FROM auth_sessions WHERE id = ? AND user_id = ?").get(p.sid, p.sub);
          live = !!s && !s.revoked_at;
          if (live && Date.now() - new Date(s.last_seen_at).getTime() > 60_000) db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), p.sid);
        }
        if (live) out = { sub: u.id, username: u.username, role: u.role, staff: effectiveStaff(u), mustChangePw: !!u.must_change_pw, sid: p.sid };
      }
    } catch {
      out = null;
    }
  }
  req._tok = out;
  return out;
}

const unauthorized = (res, message) => res.status(401).json({ error: { code: "UNAUTHORIZED", message } });

/** Requires any signed-in user (admin or instructor). */
export function requireUser({ allowMustChange = false } = {}) {
  return (req, res, next) => {
    const p = readToken(req);
    if (!p) return unauthorized(res, "נדרשת התחברות");
    if (p.mustChangePw && !allowMustChange) {
      return res.status(403).json({ error: { code: "MUST_CHANGE_PASSWORD", message: "יש להחליף סיסמה לפני המשך" } });
    }
    req.user = { id: p.sub, username: p.username, role: p.role, staff: p.staff ?? (p.role === "ADMIN" ? "SUPER" : null), sid: p.sid };
    next();
  };
}

/** Requires a valid admin token. תפקידי צוות מוגבלים לפי הנתיב (ראו staffMayDo). */
export function requireAdmin(opts = {}) {
  const base = requireUser(opts);
  return (req, res, next) =>
    base(req, res, () => {
      if (req.user.role !== "ADMIN") return unauthorized(res, "נדרשת התחברות אדמין");
      if (!staffMayDo(req.user.staff, req.method, req.originalUrl.split("?")[0])) {
        return res.status(403).json({ error: { code: "FORBIDDEN_ROLE", message: "התפקיד שלכם לא כולל הרשאה לפעולה הזו" } });
      }
      next();
    });
}

/** Signed-in user if a valid token was sent, otherwise null. Never rejects. */
export function optionalAuth(req) {
  const p = readToken(req);
  return p && !p.mustChangePw ? { id: p.sub, username: p.username, role: p.role } : null;
}

export function optionalUser(req) {
  return readToken(req)?.username ?? null;
}

export function checkLock(db, key) {
  const r = db.prepare("SELECT locked_until FROM login_attempts WHERE key = ?").get(key);
  if (!r?.locked_until) return 0;
  const ms = new Date(r.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export function registerFailure(db, key, { max = MAX_FAILS, minutes = LOCK_MINUTES } = {}) {
  const r = db.prepare("SELECT count, locked_until, last_at FROM login_attempts WHERE key = ?").get(key);
  const expired = r?.locked_until && new Date(r.locked_until).getTime() <= Date.now();
  // שלב 63: מונה ברמת חשבון מתאפס אחרי שעה בלי ניסיונות, כדי שכשלונות ישנים לא יצטברו לנצח
  const stale = r?.last_at && Date.now() - new Date(r.last_at).getTime() > 60 * 60_000 && !r.locked_until;
  const count = (expired || stale ? 0 : r?.count || 0) + 1;
  const lockedUntil = count >= max ? new Date(Date.now() + minutes * 60000).toISOString() : null;
  db.prepare(
    `INSERT INTO login_attempts (key, count, locked_until, last_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET count=excluded.count, locked_until=excluded.locked_until, last_at=excluded.last_at`,
  ).run(key, count, lockedUntil, nowIso());
  return count;
}

export const clearFailures = (db, key) => db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);

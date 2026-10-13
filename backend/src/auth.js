import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { audit, nowIso } from "./db.js";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Compared against when the user doesn't exist, so timing doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 4);

export const hashPassword = (pw) => bcrypt.hash(pw, config.bcryptCost);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash || DUMMY_HASH).then((ok) => ok && !!hash);

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role, mustChangePw: !!user.must_change_pw }, config.jwtSecret, {
    expiresIn: `${config.tokenHours}h`,
  });
}

export function ensureAdmin(db) {
  const exists = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (exists) return false;
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

/** Express middleware factory: requires a valid admin token. */
export function requireAdmin({ allowMustChange = false } = {}) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    try {
      const p = jwt.verify(token, config.jwtSecret);
      if (p.role !== "ADMIN") throw new Error("role");
      if (p.mustChangePw && !allowMustChange) {
        return res.status(403).json({ error: { code: "MUST_CHANGE_PASSWORD", message: "יש להחליף סיסמה לפני המשך" } });
      }
      req.user = { id: p.sub, username: p.username, role: p.role };
      next();
    } catch {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "נדרשת התחברות אדמין" } });
    }
  };
}

export function optionalUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), config.jwtSecret).username;
  } catch {
    return null;
  }
}

export function checkLock(db, key) {
  const r = db.prepare("SELECT locked_until FROM login_attempts WHERE key = ?").get(key);
  if (!r?.locked_until) return 0;
  const ms = new Date(r.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export function registerFailure(db, key) {
  const r = db.prepare("SELECT count, locked_until FROM login_attempts WHERE key = ?").get(key);
  const expired = r?.locked_until && new Date(r.locked_until).getTime() <= Date.now();
  const count = (expired ? 0 : r?.count || 0) + 1;
  const lockedUntil = count >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
  db.prepare(
    `INSERT INTO login_attempts (key, count, locked_until, last_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET count=excluded.count, locked_until=excluded.locked_until, last_at=excluded.last_at`,
  ).run(key, count, lockedUntil, nowIso());
  return count;
}

export const clearFailures = (db, key) => db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);

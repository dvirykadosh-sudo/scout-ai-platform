// אבטחה ופרטיות, רעיונות 91–100: יומן כניסות ומבקרים, מדינה לפי IP, מחיקה אוטומטית,
// חסימות והתראות, קפצ'ה פשוטה, מדיניות סיסמאות והגדרות.
import crypto from "node:crypto";
import { createRequire } from "node:module";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { deviceLabel, hashSecret, safeEqual } from "./accounts.js";
import { notify } from "./notify.js";
import { nowIso } from "./db.js";

const require = createRequire(import.meta.url);
let geo = null;
try {
  geo = require("geoip-country");
} catch {
  /* החבילה לא מותקנת: המדינה לא תוצג */
}

export const TERMS_VERSION = "2026-10";

// ───────────── הגדרות ─────────────

export const SETTING_DEFAULTS = {
  ipRetentionDays: 90, // כמה ימים נשמרים יומן כניסות, מבקרים וחיבורים
  visitorIpMode: "raw", // raw: IP מלא | hashed: רק גיבוב, בלי הכתובת
  strictPasswords: 0, // 1: סיסמאות נפוצות נחסמות לכולם (לצוות הניהול תמיד)
  passwordMaxAgeDays: 0, // 0: בלי תפוגה
  autoBlockAfter: 0, // 0: כבוי. מספר כשלונות מאותו IP ב-15 דקות לחסימה אוטומטית של שעה
};
const settingsCache = new WeakMap();
export const readSettings = (db) => {
  const c = settingsCache.get(db);
  if (c && Date.now() - c.at < 10_000) return c.v;
  const out = { ...SETTING_DEFAULTS };
  for (const r of db.prepare("SELECT key, value FROM settings WHERE key LIKE 'sec.%'").all()) {
    const k = r.key.slice(4);
    if (k in out) out[k] = typeof SETTING_DEFAULTS[k] === "number" ? Number(r.value) : r.value;
  }
  settingsCache.set(db, { at: Date.now(), v: out });
  return out;
};
export const writeSettings = (db, patch) => {
  settingsCache.delete(db);
  for (const [k, v] of Object.entries(patch)) {
    if (k in SETTING_DEFAULTS) db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`sec.${k}`, String(v));
  }
};

// ───────────── כתובות ─────────────

export const cleanIp = (ip) => String(ip || "").replace(/^::ffff:/, "");
export const ipHash = (ip) => hashSecret(`ip|${cleanIp(ip)}`).slice(0, 16);
const isPrivate = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip) || ip === "::1" || ip === "" || /^f[cd]/i.test(ip);

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["he"], { type: "region" });
  } catch {
    return null;
  }
})();
export function countryOf(ip) {
  const c = cleanIp(ip);
  if (isPrivate(c)) return "LOCAL";
  try {
    return geo?.lookup(c)?.country || "";
  } catch {
    return "";
  }
}
export const countryName = (code) => (code === "LOCAL" ? "רשת פנימית" : code ? regionNames?.of(code) || code : "לא ידוע");

// ───────────── חסימות ─────────────

const v4 = (s) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m || m.slice(1).some((x) => Number(x) > 255)) return null;
  return ((Number(m[1]) << 24) | (Number(m[2]) << 16) | (Number(m[3]) << 8) | Number(m[4])) >>> 0;
};
/** מנרמל קלט של אדמין: כתובת IP בודדת או טווח IPv4 (a.b.c.d/n). מחזיר null אם לא תקין. */
export function normalizeTarget(raw) {
  const t = cleanIp(String(raw).trim());
  if (/^[0-9a-f:]+$/i.test(t) && t.includes(":") && t.length <= 45) return t.toLowerCase();
  const [addr, bits] = t.split("/");
  if (v4(addr) === null) return null;
  if (bits === undefined) return addr;
  const n = Number(bits);
  return Number.isInteger(n) && n >= 8 && n <= 32 ? `${addr}/${n}` : null;
}
const matches = (target, ip) => {
  if (!target.includes("/")) return target === ip;
  const [addr, bits] = target.split("/");
  const a = v4(addr);
  const b = v4(ip);
  if (a === null || b === null) return false;
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
};
const blockCache = new WeakMap();
export const invalidateBlocks = (db) => blockCache.delete(db);
export function isBlocked(db, ip) {
  let c = blockCache.get(db);
  if (!c || Date.now() - c.at > 10_000) {
    c = { at: Date.now(), list: db.prepare("SELECT target FROM ip_blocks WHERE expires_at IS NULL OR expires_at > ?").all(nowIso()).map((r) => r.target) };
    blockCache.set(db, c);
  }
  const x = cleanIp(ip).toLowerCase();
  return c.list.some((t) => matches(t, x));
}

// ───────────── יומן ─────────────

const flagText = { new_country: "כניסה ממדינה חדשה", odd_hour: "כניסה בשעה חריגה", many_failures: "ניסיונות כושלים רבים" };
export const FLAG_TEXT = flagText;

export function logAccess(db, req, kind, { user = null, username = null, flag = null, note = null, page = null } = {}) {
  const raw = cleanIp(req.ip);
  const mode = readSettings(db).visitorIpMode;
  const ua = String(req.headers["user-agent"] || "").slice(0, 200);
  const r = db
    .prepare("INSERT INTO access_log (at, kind, user_id, username, ip, ip_hash, country, user_agent, device, page, flag, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(nowIso(), kind, user?.id ?? null, user?.username ?? username ?? null, mode === "hashed" ? null : raw, ipHash(raw), countryOf(raw), ua, deviceLabel(ua), page, flag, note);
  return Number(r.lastInsertRowid);
}

export const pageFrom = (req) => {
  const p = String(req.headers["x-page"] || "").slice(0, 100);
  return /^\/[A-Za-z0-9\-_./%~]*$/.test(p) ? p : null;
};

/** התראת אבטחה לאדמינים הראשיים (באתר, ובמייל אם הוגדר), בלי לחזור על אותה הודעה בתוך שעה. */
export function securityAlert(db, mailer, text) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  if (db.prepare("SELECT 1 FROM notifications WHERE kind = 'security' AND text = ? AND created_at > ?").get(text.slice(0, 300), since)) return false;
  for (const u of db.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND disabled = 0 AND (staff_role IS NULL OR staff_role = 'SUPER')").all()) notify(db, u.id, "security", text, "/admin");
  try {
    if (config.smtp.adminEmail && mailer?.hasTransport) mailer.enqueue("התראת אבטחה במחולל הפעולות", `<p dir="rtl">${text.replace(/[<>&]/g, "")}</p>`);
  } catch {
    /* לא מפילים בקשה בגלל מייל */
  }
  return true;
}

const israelHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date())) % 24;

/** דגלי חשד לכניסה מוצלחת. */
export function loginFlags(db, user, country) {
  const flags = [];
  if (country && country !== "LOCAL") {
    const prior = db.prepare("SELECT COUNT(*) AS c, SUM(country = ?) AS same FROM access_log WHERE kind = 'login' AND user_id = ? AND country IS NOT NULL AND country != '' AND country != 'LOCAL'").get(country, user.id);
    if (prior.c > 0 && !prior.same) flags.push("new_country");
  }
  const h = israelHour();
  if (user.role === "ADMIN" && h >= 1 && h < 5) flags.push("odd_hour");
  return flags;
}

/** כמה כשלונות בכניסה היו מהכתובת הזו בחלון זמן. */
export const failuresFromIp = (db, ip, minutes = 15) => db.prepare("SELECT COUNT(*) AS c FROM access_log WHERE kind = 'login_fail' AND ip_hash = ? AND at > ?").get(ipHash(ip), new Date(Date.now() - minutes * 60_000).toISOString()).c;
export const failuresForUser = (db, userId, minutes = 60) => db.prepare("SELECT COUNT(*) AS c FROM access_log WHERE kind = 'login_fail' AND user_id = ? AND at > ?").get(userId, new Date(Date.now() - minutes * 60_000).toISOString()).c;

// ───────────── מחיקה אוטומטית ─────────────

export function purgeOld(db, days = readSettings(db).ipRetentionDays) {
  const cut = new Date(Date.now() - days * 86400_000).toISOString();
  const run = (sql, ...a) => db.prepare(sql).run(...a).changes;
  const out = {
    access: run("DELETE FROM access_log WHERE at < ?", cut),
    visitors: run("DELETE FROM sessions WHERE last_seen < ?", cut),
    devices: run("DELETE FROM auth_sessions WHERE COALESCE(revoked_at, last_seen_at) < ?", cut),
    codes: run("DELETE FROM verify_codes WHERE created_at < ?", new Date(Date.now() - 7 * 86400_000).toISOString()),
    blocks: run("DELETE FROM ip_blocks WHERE expires_at IS NOT NULL AND expires_at < ?", nowIso()),
  };
  return out;
}

// ───────────── קפצ'ה פשוטה ─────────────

export function makeCaptcha() {
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  const plus = crypto.randomInt(0, 2) === 0;
  const answer = plus ? a + b : Math.max(a, b) - Math.min(a, b);
  const x = plus ? a : Math.max(a, b);
  const y = plus ? b : Math.min(a, b);
  const token = jwt.sign({ purpose: "captcha", h: hashSecret(`captcha|${answer}`) }, config.jwtSecret, { expiresIn: "10m" });
  return { token, question: `כמה זה ${x} ${plus ? "ועוד" : "פחות"} ${y}?` };
}
export function checkCaptcha(token, answer) {
  try {
    const p = jwt.verify(String(token), config.jwtSecret);
    return p.purpose === "captcha" && safeEqual(p.h, hashSecret(`captcha|${String(answer).trim()}`));
  } catch {
    return false;
  }
}

// ───────────── מדיניות סיסמאות ─────────────

const COMMON = new Set(
  [
    "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "12345678", "123456789", "1234567890", "11111111", "00000000", "qwerty123", "qwertyuiop", "abc12345", "abcd1234", "iloveyou", "welcome1", "welcome123", "admin123", "admin1234", "administrator", "letmein123", "changeme", "changeme123", "israel123", "israel2020", "israel2024", "israel2025", "israel2026", "scouts123", "tzofim123", "maoz1234", "maoz2026", "shevet123", "madrich123", "monkey123", "dragon123", "football1", "baseball1", "sunshine1", "princess1", "superman1", "asdfghjkl", "zxcvbnm123", "1q2w3e4r", "1qaz2wsx", "q1w2e3r4", "aa123456", "a1234567", "a123456789", "abc123456", "123123123", "123456abc", "password!", "password2026", "summer2026", "winter2026",
  ].map((x) => x.toLowerCase()),
);
/** רשימת בעיות בסיסמה. ריקה אם הסיסמה סבירה. */
export function passwordProblems(pw, { username = "" } = {}) {
  const out = [];
  const p = String(pw || "");
  const low = p.toLowerCase();
  if (p.length < 8) out.push("הסיסמה קצרה מ-8 תווים");
  if (COMMON.has(low) || /^(password|passw0rd|qwerty|admin|welcome|letmein|israel|scouts|tzofim|maoz|shevet)\d{0,6}[!@#.]?$/i.test(p)) out.push("זו סיסמה נפוצה שקל לנחש");
  if (/^(.)\1+$/.test(p)) out.push("הסיסמה היא אותו תו שוב ושוב");
  if (/^(0123456789|1234567890|123456789|12345678|abcdefgh|abcdefghi)/i.test(p) && p.length <= 12) out.push("הסיסמה היא רצף פשוט");
  if (username && username.length >= 3 && low.includes(username.toLowerCase())) out.push("הסיסמה כוללת את שם המשתמש");
  if (p.length >= 8 && !/\d/.test(p) && !/[^A-Za-z֐-׿]/.test(p)) out.push("כדאי להוסיף ספרה או סימן");
  return out;
}
export const strictFor = (db, role) => role === "ADMIN" || readSettings(db).strictPasswords === 1;

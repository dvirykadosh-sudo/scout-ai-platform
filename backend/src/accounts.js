// עזרי חשבונות: זיהוי לפי מייל או טלפון, קודי אימות, אימות דו-שלבי (TOTP), תפקידי צוות.
import crypto from "node:crypto";
import { config } from "./config.js";

// ───────────── מייל וטלפון ─────────────

export const normalizeEmail = (s) => {
  const e = String(s ?? "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : null;
};

/** מספר ישראלי או בינלאומי לצורה +9725XXXXXXXX. מחזיר null אם לא נראה כמו טלפון. */
export const normalizePhone = (s) => {
  let t = String(s ?? "").trim();
  if (!/^[+\d][\d\s\-().]*$/.test(t)) return null;
  const plus = t.startsWith("+");
  t = t.replace(/\D/g, "");
  if (!plus && t.startsWith("00")) t = t.slice(2);
  else if (!plus && t.startsWith("0")) t = `972${t.slice(1)}`;
  else if (!plus && t.length === 9) t = `972${t}`;
  return /^\d{9,15}$/.test(t) ? `+${t}` : null;
};

export const looksLikePhone = (s) => normalizePhone(s) !== null && !/[A-Za-z֐-׿]/.test(String(s));
export const maskEmail = (e) => (e ? e.replace(/^(.).*(@.*)$/, "$1***$2") : "");
export const maskPhone = (p) => (p ? `${p.slice(0, 4)}***${p.slice(-3)}` : "");

/** מוצא משתמש לפי שם משתמש, מייל מאומת או טלפון מאומת. */
export function findByIdentifier(db, raw) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (id.includes("@")) {
    const e = normalizeEmail(id);
    return e ? db.prepare("SELECT * FROM users WHERE lower(email) = ? AND email_verified_at IS NOT NULL").get(e) ?? null : null;
  }
  if (looksLikePhone(id)) {
    const p = normalizePhone(id);
    const byPhone = db.prepare("SELECT * FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL").get(p);
    if (byPhone) return byPhone;
  }
  return db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(id) ?? null;
}

// ───────────── קודים ─────────────

const hmac = (v) => crypto.createHmac("sha256", config.jwtSecret).update(String(v)).digest("hex");
export const hashSecret = hmac;
export const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
export const newToken = () => crypto.randomBytes(32).toString("base64url");
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const minutesFromNow = (m) => new Date(Date.now() + m * 60_000).toISOString();

// ───────────── TOTP (RFC 6238) ─────────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};
export const base32Decode = (s) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of String(s).replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function totpAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
export const currentStep = (now = Date.now()) => Math.floor(now / 30_000);

/** מחזיר את מספר ה-step שהתאים (כדי למנוע שימוש חוזר), או null. חלון של ±1 (30 שניות לכל כיוון). */
export function checkTotp(secret, code, lastStep = null, now = Date.now()) {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const cur = currentStep(now);
  for (const step of [cur, cur - 1, cur + 1]) {
    if (lastStep !== null && lastStep !== undefined && step <= lastStep) continue;
    if (safeEqual(totpAt(secret, step), c)) return step;
  }
  return null;
}
export const otpauthUrl = (secret, username) =>
  `otpauth://totp/${encodeURIComponent(`מחולל פעולות:${username}`)}?secret=${secret}&issuer=${encodeURIComponent("מחולל פעולות")}&algorithm=SHA1&digits=6&period=30`;

// הסוד נשמר מוצפן במסד הנתונים (AES-256-GCM), כך שגיבוי שדלף לא חושף את מפתחות ה-2FA
const key = () => crypto.createHash("sha256").update(`totp:${config.jwtSecret}`).digest();
export function sealSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function openSecret(sealed) {
  try {
    const [iv, tag, enc] = String(sealed).split(".").map((x) => Buffer.from(x, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const newBackupCodes = (n = 10) => Array.from({ length: n }, () => `${crypto.randomBytes(2).toString("hex")}-${crypto.randomBytes(2).toString("hex")}`);

// ───────────── תפקידי צוות ─────────────

export const STAFF_ROLES = {
  SUPER: { label: "אדמין ראשי", desc: "הרשאה מלאה: משתמשים, תפקידים, הגדרות, גיבויים ותוכן." },
  CONTENT: { label: "מנהל תוכן", desc: "מאגר הפעולות: אישורים, דגלים, איחוד כפילויות, הודעות ומשובים. בלי משתמשים, גיבויים ויומנים." },
  USERS: { label: "מנהל משתמשים", desc: "חשבונות של מדריכים: יצירה, השעיה, איפוס סיסמה ואימות. לא נוגע באדמינים ובתוכן." },
  VIEWER: { label: "צופה בלבד", desc: "קריאה בלבד של נתוני התוכן והסטטיסטיקות. בלי משתמשים, יומנים וגיבויים." },
};
export const STAFF_KEYS = Object.keys(STAFF_ROLES);
export const effectiveStaff = (u) => (u?.role === "ADMIN" ? (STAFF_KEYS.includes(u.staff_role) ? u.staff_role : "SUPER") : null);

const SECTION = (path) => path.replace(/^\/api\/admin\//, "").split(/[/?.]/)[0];
const USER_SECTIONS = new Set(["users", "audit", "logs", "sessions", "security", "roles", "access", "visitors", "blocks"]);
const SENSITIVE = new Set([...USER_SECTIONS, "backups"]);

/** האם תפקיד צוות רשאי לבצע בקשת אדמין. נקרא מ-requireAdmin. */
export function staffMayDo(staff, method, path) {
  if (staff === "SUPER" || !staff) return true;
  const sec = SECTION(path);
  const read = method === "GET" || method === "HEAD";
  if (staff === "VIEWER") return read && !SENSITIVE.has(sec);
  if (staff === "CONTENT") return !SENSITIVE.has(sec);
  if (staff === "USERS") return USER_SECTIONS.has(sec) || (read && sec === "stats");
  return false;
}

// ───────────── מכשיר מתוך User-Agent ─────────────

export function deviceLabel(ua) {
  const s = String(ua || "");
  const os = /Windows/i.test(s) ? "Windows" : /Android/i.test(s) ? "Android" : /iPhone|iPad|iOS/i.test(s) ? "iOS" : /Mac OS X|Macintosh/i.test(s) ? "Mac" : /Linux/i.test(s) ? "Linux" : "מכשיר לא מזוהה";
  const br = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "דפדפן";
  return `${br} ב-${os}`;
}

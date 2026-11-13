// שמירת הנתונים מחוץ ל-Render החינמי: צילום של מסד הנתונים נשמר במאגר פרטי ב-GitHub (חינם, בלי כרטיס אשראי)
// ומשוחזר אוטומטית כשהשרת עולה בלי קובץ נתונים. הגדרה: DATA_REPO=בעלים/שם-מאגר ו-DATA_TOKEN (טוקן עם הרשאת Contents: Read and write).
//
// שלב 64:
//  - הצילום מוצפן (AES-256-GCM) לפני ההעלאה. ההצפנה גם חותמת: קובץ שנוסה לשנות לא ישוחזר.
//    המפתח: BACKUP_KEY אם הוגדר (מומלץ, ערך קבוע שלא מחליפים), אחרת נגזר מ-JWT_SECRET. בשחזור מנסים גם את JWT_SECRET ואת JWT_SECRET_PREVIOUS.
//  - צילום ישן (דחוס בלי הצפנה) עדיין משוחזר, והשמירה הבאה כבר מוצפנת.
//  - לפני שמחליפים קובץ נתונים בודקים שהוא מסד SQLite תקין. קובץ פגום לא נכתב.
//  - אם השחזור נכשל (שגיאת רשת, מפתח לא מתאים, קובץ פגום) השרת עולה, אבל לא דורס את הגיבוי הקיים במסד ריק. מופיעה אזהרה באדמין.
//  - שינויים של "רעש" (ביקורים, יומני גישה) לא גורמים להעלאה בכל דקה: הם נשמרים לכל היותר אחת לחצי שעה. שינוי אמיתי נשמר תוך כשתי דקות.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

/** מצב השמירה, להצגה בלוח האדמין ובבדיקת התקינות. */
export const persistState = {
  configured: false,
  lastGoodAt: null,
  lastSavedAt: null,
  lastAttemptAt: null,
  lastError: null,
  saves: 0,
  failStreak: 0, // כמה שמירות נכשלו ברצף
  encrypted: null, // האם הצילום האחרון שנשמר מוצפן
  keySource: null, // "BACKUP_KEY" | "JWT_SECRET" | null
  restore: null, // תוצאת השחזור האחרון
  blocked: null, // סיבה שבגללה אסור לשמור (כדי לא לדרוס גיבוי טוב במסד ריק)
};
let handle = null;
export const persistHandle = () => handle;
export function persistHealthy(now = Date.now(), startedAt = now) {
  if (!persistState.configured) return true;
  if (persistState.blocked) return false;
  const ref = persistState.lastGoodAt ?? startedAt;
  return now - ref < 15 * 60_000;
}

/** טבלאות שמשתנות בכל ביקור. שינוי בהן בלבד לא מצדיק העלאה תכופה. */
export const NOISE_TABLES = ["sessions", "access_log", "page_counts", "web_vitals", "client_errors", "login_attempts"];

const cfg = (env) => ({
  repo: env.DATA_REPO || "",
  token: env.DATA_TOKEN || "",
  branch: env.DATA_BRANCH || "main",
  file: env.DATA_FILE || "scout.db.gz",
  api: (env.DATA_API_URL || "https://api.github.com").replace(/\/+$/, ""),
});
export const persistConfigured = (env = process.env) => Boolean(cfg(env).repo && cfg(env).token);

const headers = (c, accept) => ({ Authorization: `Bearer ${c.token}`, Accept: accept, "User-Agent": "maoz-activity-generator", "X-GitHub-Api-Version": "2022-11-28" });
const url = (c) => `${c.api}/repos/${c.repo}/contents/${encodeURIComponent(c.file)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── הצפנה ─────
const MAGIC = Buffer.from("MZB1");
const secretsOf = (env) => [
  ["BACKUP_KEY", env.BACKUP_KEY],
  ["JWT_SECRET", env.JWT_SECRET],
  ["JWT_SECRET_PREVIOUS", env.JWT_SECRET_PREVIOUS],
].filter(([, s]) => typeof s === "string" && s.length >= 16);
const keyFor = (secret, salt) => Buffer.from(crypto.hkdfSync("sha256", secret, salt, "maoz-backup-v1", 32));

/** מצפין צילום דחוס. בלי מפתח (סביבת בדיקה) מחזיר אותו כמו שהוא. */
export function sealBackup(gz, env = process.env) {
  const first = secretsOf(env)[0];
  if (!first) return { buf: gz, encrypted: false, source: null };
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFor(first[1], salt), iv);
  c.setAAD(MAGIC);
  const enc = Buffer.concat([c.update(gz), c.final()]);
  return { buf: Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]), encrypted: true, source: first[0] };
}

/** פותח קובץ שהורד: מוצפן (MZB1) או ישן (gzip). זורק שגיאה עם code: LOCKED / BAD. */
export function openBackup(buf, env = process.env) {
  if (buf.length > 4 && buf.subarray(0, 4).equals(MAGIC)) {
    if (buf.length < 4 + 16 + 12 + 16 + 1) throw Object.assign(new Error("הקובץ קצר מדי"), { code: "BAD" });
    const salt = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), enc = buf.subarray(48);
    const keys = secretsOf(env);
    for (const [name, secret] of keys) {
      try {
        const d = crypto.createDecipheriv("aes-256-gcm", keyFor(secret, salt), iv);
        d.setAAD(MAGIC);
        d.setAuthTag(tag);
        return { gz: Buffer.concat([d.update(enc), d.final()]), encrypted: true, source: name };
      } catch {
        /* מפתח אחר */
      }
    }
    throw Object.assign(new Error(keys.length ? "אף מפתח לא פותח את הגיבוי (BACKUP_KEY / JWT_SECRET / JWT_SECRET_PREVIOUS)" : "הגיבוי מוצפן ואין מפתח"), { code: "LOCKED" });
  }
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return { gz: buf, encrypted: false, source: null };
  throw Object.assign(new Error("פורמט לא מוכר"), { code: "BAD" });
}

/** בדיקה קלה שהקובץ הוא מסד SQLite תקין, לפני שמחליפים בו את קובץ הנתונים. */
export function checkSqliteFile(buf) {
  if (buf.length < 4096 || buf.subarray(0, 15).toString("latin1") !== "SQLite format 3") throw new Error("הקובץ אינו מסד SQLite");
  const tmp = path.join(os.tmpdir(), `scout-chk-${process.pid}-${Date.now()}.db`);
  fs.writeFileSync(tmp, buf);
  let d;
  try {
    d = new DatabaseSync(tmp, { readOnly: true });
    if (d.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("הקובץ פגום");
    if (!d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n) throw new Error("במסד אין טבלאות");
  } finally {
    try { d?.close(); } catch { /* ignore */ }
    fs.rmSync(tmp, { force: true });
  }
}

/** כשאין קובץ נתונים מקומי, מנסה להוריד את הצילום האחרון.
 *  מחזיר: off | exists | none | restored | error | locked | invalid. בכל תוצאה חוץ מהראשונות והאחרונות השמירה נחסמת. */
export async function restoreIfMissing(dbFile, { env = process.env, fetchFn = fetch, log = console.log, retries = 3, waitMs = 2000 } = {}) {
  const c = cfg(env);
  if (!c.repo || !c.token || dbFile === ":memory:") return "off";
  persistState.blocked = null;
  const done = (status, block) => {
    persistState.restore = status;
    if (block) persistState.blocked = block;
    return status;
  };
  if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) return done("exists");
  let lastErr = "";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetchFn(`${url(c)}?ref=${encodeURIComponent(c.branch)}`, { headers: headers(c, "application/vnd.github.raw+json") });
      if (r.status === 404) {
        log("שמירת נתונים: עדיין אין צילום שמור, מתחילים ממסד חדש");
        return done("none");
      }
      if (r.status >= 500 || r.status === 429) throw Object.assign(new Error(`GitHub ${r.status}`), { retry: true });
      if (!r.ok) {
        lastErr = `GitHub ${r.status}`;
        break;
      }
      const { gz, encrypted } = openBackup(Buffer.from(await r.arrayBuffer()), env);
      const data = zlib.gunzipSync(gz);
      checkSqliteFile(data);
      fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
      const part = `${dbFile}.restoring`;
      fs.writeFileSync(part, data);
      fs.renameSync(part, dbFile);
      log(`שמירת נתונים: שוחזר מסד נתונים (${Math.round(data.length / 1024)}KB${encrypted ? ", מוצפן" : ", צילום ישן לא מוצפן"})`);
      return done("restored");
    } catch (e) {
      lastErr = e.message;
      if (e.code === "LOCKED") {
        log(`שמירת נתונים: ${e.message}. לא דורסים את הגיבוי.`);
        return done("locked", `הגיבוי ב-GitHub מוצפן ולא ניתן לפתוח אותו: ${e.message}`);
      }
      if (e.code === "BAD" || /SQLite|פגום|אין טבלאות|incorrect header|unexpected end|invalid/i.test(e.message)) {
        log(`שמירת נתונים: הגיבוי שהורד אינו תקין (${e.message}). לא דורסים את הגיבוי.`);
        return done("invalid", `הגיבוי ב-GitHub אינו תקין: ${e.message}`);
      }
      if (attempt < retries) await sleep(waitMs * attempt);
    }
  }
  log(`שמירת נתונים: השחזור נכשל (${lastErr}). לא שומרים צילום חדש כדי לא לדרוס את הגיבוי הקיים.`);
  return done("error", `השחזור מ-GitHub נכשל (${lastErr})`);
}

/** בודק כל דקה אם המסד השתנה, ושומר צילום. שינוי אמיתי: לכל היותר אחת ל-2 דקות; שינוי ברעש בלבד: אחת לחצי שעה. שומר גם בכיבוי השרת. */
export function startPersist(db, dbFile, { env = process.env, fetchFn = fetch, log = console.log, pollMs = 60_000, minGapMs = 120_000, noiseGapMs = 1_800_000 } = {}) {
  const c = cfg(env);
  if (!c.repo || !c.token || dbFile === ":memory:") return null;
  persistState.configured = true;
  persistState.keySource = secretsOf(env)[0]?.[0] ?? null;
  let lastHash = null, lastMeaning = null, sha = null, lastPush = 0, busy = false, dirty = false;
  const snapshot = () => {
    const tmp = path.join(os.tmpdir(), `scout-snap-${process.pid}-${Date.now()}.db`);
    const tmp2 = `${tmp}.m`;
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      const raw = fs.readFileSync(tmp);
      // טביעת אצבע של הנתונים האמיתיים בלבד (בלי טבלאות הרעש)
      let meaning;
      try {
        fs.copyFileSync(tmp, tmp2);
        const d = new DatabaseSync(tmp2);
        for (const t of NOISE_TABLES) {
          try { d.exec(`DELETE FROM ${t}`); } catch { /* אין טבלה כזו */ }
        }
        d.exec("VACUUM");
        d.close();
        meaning = crypto.createHash("sha1").update(fs.readFileSync(tmp2)).digest("hex");
      } catch {
        meaning = null;
      }
      return { raw, meaning };
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(tmp2, { force: true });
    }
  };
  const getSha = async () => {
    const r = await fetchFn(`${url(c)}?ref=${encodeURIComponent(c.branch)}`, { headers: headers(c, "application/vnd.github+json") });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return (await r.json()).sha;
  };
  const put = async (content) => {
    const body = () => JSON.stringify({ message: `גיבוי ${new Date().toISOString()}`, content: content.toString("base64"), branch: c.branch, ...(sha ? { sha } : {}) });
    let r = await fetchFn(url(c), { method: "PUT", headers: { ...headers(c, "application/vnd.github+json"), "Content-Type": "application/json" }, body: body() });
    if (r.status === 409 || r.status === 422) {
      sha = await getSha();
      r = await fetchFn(url(c), { method: "PUT", headers: { ...headers(c, "application/vnd.github+json"), "Content-Type": "application/json" }, body: body() });
    }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    sha = (await r.json()).content?.sha ?? sha;
  };
  const push = async ({ force = false, override = false } = {}) => {
    if (busy) return false;
    if (persistState.blocked && !override) {
      persistState.lastError = persistState.blocked;
      return false;
    }
    busy = true;
    try {
      persistState.lastAttemptAt = new Date().toISOString();
      const { raw, meaning } = snapshot();
      const hash = crypto.createHash("sha1").update(raw).digest("hex");
      if (hash === lastHash && !dirty) {
        persistState.lastGoodAt = Date.now();
        return false;
      }
      const meaningChanged = dirty || meaning === null || meaning !== lastMeaning;
      const gap = meaningChanged ? minGapMs : noiseGapMs;
      if (!force && Date.now() - lastPush < gap) {
        // רק רעש השתנה: הנתונים החשובים שמורים, אז השמירה נחשבת תקינה
        if (!meaningChanged) persistState.lastGoodAt = Date.now();
        return false;
      }
      if (sha === null) sha = await getSha();
      const sealed = sealBackup(zlib.gzipSync(raw), env);
      await put(sealed.buf);
      lastHash = hash;
      lastMeaning = meaning;
      dirty = false;
      lastPush = Date.now();
      persistState.lastGoodAt = Date.now();
      persistState.lastSavedAt = new Date().toISOString();
      persistState.lastError = null;
      persistState.failStreak = 0;
      persistState.encrypted = sealed.encrypted;
      persistState.keySource = sealed.source;
      persistState.saves += 1;
      if (override) persistState.blocked = null;
      log(`שמירת נתונים: נשמר צילום חדש${sealed.encrypted ? " (מוצפן)" : ""}`);
      return true;
    } catch (e) {
      dirty = true;
      persistState.failStreak += 1;
      persistState.lastError = e.message;
      log(`שמירת נתונים: השמירה נכשלה (${e.message})`);
      return false;
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void push(), pollMs);
  timer.unref?.();
  const flush = async () => {
    clearInterval(timer);
    while (busy) await new Promise((r) => setTimeout(r, 100));
    return push({ force: true });
  };
  setTimeout(() => void push({ force: true }), 15_000).unref?.();
  handle = { push, flush };
  return handle;
}

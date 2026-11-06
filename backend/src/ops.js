// תפעול: מצב תחזוקה, היסטוריית מדדים, התראות במייל, גיבוי שבועי מוצפן למייל, ושחזור מקובץ.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { persistHealthy, persistState } from "./persist.js";
import { sendWeeklyReportIfDue } from "./routes-pilot.js";

export const getSet = (db, key, def = "") => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? def;
export const putSet = (db, key, value) => db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));

export const maintenanceMessage = (db) => getSet(db, "maintenance", "");

/** במצב תחזוקה נחסמות רק פעולות כתיבה של גולשים. כניסה, ניהול ובדיקות תקינות נשארים פתוחים. */
export function maintenanceGuard(db) {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (!req.path.startsWith("/api") || req.path.startsWith("/api/auth/") || req.path.startsWith("/api/admin/") || req.path.startsWith("/api/health")) return next();
    const m = maintenanceMessage(db);
    if (!m) return next();
    res.status(503).json({ error: { code: "MAINTENANCE", message: m } });
  };
}

export function recordSample(db, dbFile) {
  const n = (t) => {
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    } catch {
      return null;
    }
  };
  let bytes = null;
  try {
    if (dbFile !== ":memory:") bytes = fs.statSync(dbFile).size;
  } catch {
    /* ignore */
  }
  const day = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO system_samples (day, db_bytes, users, activities, write_docs) VALUES (?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET db_bytes=excluded.db_bytes, users=excluded.users, activities=excluded.activities, write_docs=excluded.write_docs").run(day, bytes, n("users"), n("activities"), n("write_docs"));
  db.prepare("DELETE FROM system_samples WHERE day < ?").run(new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10));
}

/** 245: מגבלת GitHub לקובץ היא 100MB, ולכן מתריעים הרבה לפני. */
export const DB_WARN_BYTES = 50 * 1024 * 1024;

// ───── גיבוי מוצפן ─────
export function encryptBackup(buf, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(zlib.gzipSync(buf)), c.final()]);
  return Buffer.concat([Buffer.from("MAOZB1"), salt, iv, c.getAuthTag(), enc]);
}
export function decryptBackup(file, passphrase) {
  if (file.subarray(0, 6).toString() !== "MAOZB1") throw new Error("לא קובץ גיבוי של האתר");
  const salt = file.subarray(6, 22), iv = file.subarray(22, 34), tag = file.subarray(34, 50);
  const d = crypto.createDecipheriv("aes-256-gcm", crypto.scryptSync(passphrase, salt, 32), iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(file.subarray(50)), d.final()]));
}

function snapshotFile(db) {
  const tmp = path.join(os.tmpdir(), `scout-ops-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    return fs.readFileSync(tmp);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** שולח גיבוי מוצפן למייל של האדמין, פעם בשבוע. דורש SMTP, ADMIN_EMAIL ו-BACKUP_PASSPHRASE. */
export async function mailBackupIfDue(db, mailer, config, { force = false } = {}) {
  const pass = process.env.BACKUP_PASSPHRASE || "";
  const to = config.smtp.adminEmail;
  if (!mailer?.hasTransport || !to || pass.length < 8) return { sent: false, reason: "לא מוגדר (SMTP_HOST, ADMIN_EMAIL, BACKUP_PASSPHRASE)" };
  const last = Number(getSet(db, "lastBackupMail", "0"));
  if (!force && Date.now() - last < 7 * 86400000) return { sent: false, reason: "נשלח לאחרונה" };
  const file = encryptBackup(snapshotFile(db), pass);
  if (file.length > 20 * 1024 * 1024) return { sent: false, reason: "הקובץ גדול מדי למייל" };
  const name = `maoz-backup-${new Date().toISOString().slice(0, 10)}.maozb`;
  await mailer.sendNow({ to, subject: "גיבוי שבועי של מחולל הפעולות", html: `<p dir="rtl">מצורף גיבוי מוצפן. לפתיחה: <code>node deploy/decrypt-backup.mjs ${name} הסיסמה</code></p>`, attachments: [{ filename: name, content: file }] });
  putSet(db, "lastBackupMail", Date.now());
  return { sent: true };
}

/** התראות במייל: שמירה חיצונית תקועה, או מסד גדול מדי. פעם אחת לכל תקלה. */
export function startOps({ db, dbFile, config, mailer }) {
  let alerted = { persist: false, size: false };
  const tick = async () => {
    try {
      recordSample(db, dbFile);
      const to = config.smtp.adminEmail;
      const stuck = persistState.configured && !persistHealthy(Date.now(), Date.now() - 20 * 60_000);
      if (stuck && !alerted.persist) {
        alerted.persist = true;
        if (to && mailer?.hasTransport) mailer.enqueue("התראה: שמירת הנתונים תקועה", '<p dir="rtl">השמירה ל-GitHub לא הצליחה כבר יותר מרבע שעה. בדקו את הטוקן ב-Render. עד לתיקון, נתונים חדשים עלולים ללכת לאיבוד באיתחול.</p>', to);
      }
      if (!stuck) alerted.persist = false;
      let bytes = 0;
      try {
        bytes = fs.statSync(dbFile).size;
      } catch {
        /* ignore */
      }
      if (bytes > DB_WARN_BYTES && !alerted.size) {
        alerted.size = true;
        if (to && mailer?.hasTransport) mailer.enqueue("התראה: מסד הנתונים גדל מאוד", `<p dir="rtl">המסד הגיע ל-${Math.round(bytes / 1048576)}MB. שמירה ב-GitHub מוגבלת ל-100MB. מומלץ לנקות נתונים ישנים או לעבור לאחסון אחר.</p>`, to);
      }
      if (bytes <= DB_WARN_BYTES) alerted.size = false;
      await mailBackupIfDue(db, mailer, config).catch(() => {});
      sendWeeklyReportIfDue(db, mailer, config);
    } catch {
      /* ops best effort */
    }
  };
  const t = setInterval(tick, 5 * 60_000);
  t.unref();
  setTimeout(tick, 30_000).unref();
  return { tick };
}

// ───── שחזור ─────
export function validateBackupFile(buf) {
  if (buf.length < 4096 || buf.subarray(0, 15).toString("latin1") !== "SQLite format 3") throw new Error("הקובץ אינו בסיס נתונים של האתר");
  const tmp = path.join(os.tmpdir(), `scout-val-${process.pid}-${Date.now()}.db`);
  fs.writeFileSync(tmp, buf);
  let d;
  try {
    d = new DatabaseSync(tmp, { readOnly: true });
    if (d.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("הקובץ פגום");
    const tables = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    for (const t of ["users", "activities", "settings"]) if (!tables.has(t)) throw new Error(`חסרה טבלה ${t}: זה לא גיבוי של האתר`);
    if (d.prepare("SELECT COUNT(*) AS n FROM users").get().n < 1) throw new Error("בקובץ אין משתמשים");
  } finally {
    try { d?.close(); } catch { /* ignore */ }
    fs.rmSync(tmp, { force: true });
  }
}
export const pendingPath = (dbPath) => `${dbPath}.restore`;
/** נקרא באתחול, לפני פתיחת המסד: מחליף את המסד בקובץ השחזור שהועלה. */
export function applyPendingRestore(dbPath) {
  const p = pendingPath(dbPath);
  if (!fs.existsSync(p)) return false;
  try {
    for (const ext of ["", "-wal", "-shm"]) {
      if (fs.existsSync(dbPath + ext)) fs.renameSync(dbPath + ext, `${dbPath}.before-restore${ext}`);
    }
    fs.renameSync(p, dbPath);
    return true;
  } catch (e) {
    console.error("שחזור נכשל:", e.message);
    return false;
  }
}

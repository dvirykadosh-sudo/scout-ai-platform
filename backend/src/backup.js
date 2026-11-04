import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export const BACKUP_NAME = /^scout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d+)?\.db$/;

export const backupDirFor = (dbFile = config.dbPath) => config.backupDir || path.join(path.dirname(path.resolve(dbFile)), "backups");

export function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => BACKUP_NAME.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Consistent online snapshot of the database (safe while the server is running). */
export function createBackup(db, dir, keep = config.backupKeep) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  let name = `scout-${stamp}.db`;
  for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = `scout-${stamp}-${i}.db`;
  const file = path.join(dir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // keep only the newest `keep` files
  for (const old of listBackups(dir).slice(Math.max(1, keep))) fs.rmSync(path.join(dir, old.name), { force: true });
  const st = fs.statSync(file);
  return { name, size: st.size, createdAt: st.mtime.toISOString() };
}

/** Backup at start-up (if the last one is old) and then on a timer. */
export function startBackupSchedule(db, dir, everyHours = config.backupEveryHours) {
  if (!everyHours || everyHours <= 0) return null;
  const run = () => {
    try {
      const b = createBackup(db, dir);
      console.log(`[גיבוי] נשמר ${b.name}`);
    } catch (e) {
      console.error("[גיבוי] נכשל:", e.message);
    }
  };
  const last = listBackups(dir)[0];
  if (!last || Date.now() - new Date(last.createdAt).getTime() > everyHours * 3600_000) run();
  const t = setInterval(run, everyHours * 3600_000);
  t.unref();
  return t;
}

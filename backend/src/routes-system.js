// מצב המערכת לאדמין: גודל מסד, ספירות, מצב שמירת הנתונים, גיבוי להורדה, ובדיקת תקינות לניטור חיצוני.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { persistHandle, persistHealthy, persistState } from "./persist.js";

export const startedAt = new Date();

export function registerSystemRoutes(app, { db, dbFile, config, fail, requireAdmin, audit }) {
  let integrity = "לא נבדק";
  try {
    integrity = db.prepare("PRAGMA quick_check").get()?.quick_check ?? "לא ידוע";
  } catch (e) {
    integrity = `שגיאה: ${e.message}`;
  }
  const count = (t) => {
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    } catch {
      return null;
    }
  };

  // בדיקה לניטור חיצוני (למשל UptimeRobot): נכשלת אם שמירת הנתונים תקועה יותר מרבע שעה.
  app.get("/api/health/data", (req, res) => {
    const ok = integrity === "ok" && persistHealthy(Date.now(), startedAt.getTime());
    res.status(ok ? 200 : 503).json({ ok, integrity, persist: persistState.configured ? (persistHealthy(Date.now(), startedAt.getTime()) ? "ok" : "stuck") : "off" });
  });

  app.get("/api/admin/system", requireAdmin(), (req, res) => {
    let dbBytes = null;
    try {
      if (dbFile !== ":memory:") dbBytes = fs.statSync(dbFile).size;
    } catch {
      /* ignore */
    }
    const warnings = [];
    if (dbBytes && dbBytes > 50 * 1024 * 1024) warnings.push(`מסד הנתונים גדול (${Math.round(dbBytes / 1048576)}MB). שמירה ב-GitHub מוגבלת ל-100MB.`);
    if (config.isProd && !persistState.configured && !process.env.RENDER_DISK_PATH && !String(dbFile).startsWith("/data")) warnings.push("אין שמירת נתונים חיצונית: בהפעלה מחדש של השרת הנתונים עלולים להימחק (ראו deploy/FREE.md).");
    if (persistState.configured && !persistHealthy(Date.now(), startedAt.getTime())) warnings.push("שמירת הנתונים תקועה. בדקו את הטוקן של GitHub ב-Render.");
    if (persistState.lastError) warnings.push(`השמירה האחרונה נכשלה: ${persistState.lastError}`);
    if (integrity !== "ok") warnings.push(`בדיקת תקינות מסד הנתונים: ${integrity}`);
    if (!config.signupCode) warnings.push("לא הוגדר SIGNUP_CODE, ההרשמה סגורה.");
    res.json({
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      dbBytes,
      integrity,
      counts: { users: count("users"), activities: count("activities"), writeDocs: count("write_docs") },
      persist: { ...persistState },
      warnings,
    });
  });

  app.post("/api/admin/persist/save", requireAdmin(), async (req, res) => {
    const h = persistHandle();
    if (!h) return res.status(400).json(fail("NO_PERSIST", "שמירת הנתונים החיצונית לא מוגדרת"));
    const saved = await h.push({ force: true });
    audit(db, req.user.username, "persist.save", { saved });
    res.json({ saved, state: { ...persistState } });
  });

  // גיבוי טרי שיורד ישר למחשב, בלי לשמור עותק בשרת (בשרת החינמי עותקים בשרת נמחקים)
  app.get("/api/admin/backup/download", requireAdmin(), (req, res) => {
    const tmp = path.join(os.tmpdir(), `scout-dl-${process.pid}-${Date.now()}.db`);
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    } catch (e) {
      return res.status(500).json(fail("BACKUP", `יצירת הגיבוי נכשלה: ${e.message}`));
    }
    audit(db, req.user.username, "backup.downloadFresh", {});
    const name = `maoz-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.db`;
    res.download(tmp, name, () => fs.rm(tmp, { force: true }, () => {}));
  });
}

// מצב המערכת לאדמין: גודל מסד, ספירות, מצב שמירת הנתונים, גיבוי להורדה, ובדיקת תקינות לניטור חיצוני.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { persistHandle, persistHealthy, persistState, verifyRemoteBackup } from "./persist.js";
import { aiConfigured, sharedRouter } from "./ai-router.js";
import { aiBudgetState } from "./ai-budget.js";
import { recentServerErrors } from "./server-errors.js";
import { schemaVersion, SCHEMA_VERSION } from "./db.js";
import { configWarnings } from "./config.js";

export const startedAt = new Date();

export function registerSystemRoutes(app, { db, dbFile, config, fail, requireAdmin, audit, mailer, limiter }) {
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
    res.status(ok ? 200 : 503).json({ ok, integrity, persist: persistState.configured ? (persistState.blocked ? "blocked" : persistHealthy(Date.now(), startedAt.getTime()) ? "ok" : "stuck") : "off" });
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
    if (persistState.blocked) warnings.push(`שמירת הנתונים עצורה כדי לא לדרוס את הגיבוי הקיים: ${persistState.blocked}. תקנו את הסיבה (טוקן, BACKUP_KEY או JWT_SECRET_PREVIOUS) והפעילו מחדש את השרת. אם אתם בטוחים שרוצים להתחיל ממסד חדש, השתמשו ב"שמירה עכשיו" עם אישור.`);
    else if (persistState.configured && !persistHealthy(Date.now(), startedAt.getTime())) warnings.push("שמירת הנתונים תקועה. בדקו את הטוקן של GitHub ב-Render.");
    if (persistState.failStreak >= 3) warnings.push(`${persistState.failStreak} שמירות ברצף ל-GitHub נכשלו. עד שזה יסתדר, נתונים חדשים עלולים ללכת לאיבוד בהפעלה מחדש.`);
    if (persistState.verifyOk === false) warnings.push(`בדיקת השחזור של הגיבוי ב-GitHub נכשלה: ${persistState.verifyError}. ייתכן שלא תהיה אפשרות לשחזר את האתר אחרי הפעלה מחדש.`);
    if (aiBudgetState().blocked > 0) warnings.push(`תקרת ה-AI היומית (${aiBudgetState().cap}) הוצתה. מי שביקש עזרת AI קיבל את המחולל המקומי. אפשר להגדיל ב-AI_DAILY_CAP.`);
    if (persistState.lastError && !persistState.blocked) warnings.push(`השמירה האחרונה נכשלה: ${persistState.lastError}`);
    if (persistState.configured && persistState.encrypted === false) warnings.push("הצילום ששמור ב-GitHub אינו מוצפן (אין JWT_SECRET או BACKUP_KEY בסביבה).");
    if (persistState.configured && persistState.keySource === "JWT_SECRET" && !process.env.BACKUP_KEY) warnings.push("הצילום ב-GitHub מוצפן במפתח שנגזר מ-JWT_SECRET. כדי שהחלפת JWT_SECRET לא תנעל את הגיבוי, הגדירו ב-Render גם BACKUP_KEY (מחרוזת אקראית של 32 תווים ומעלה, ולא מחליפים אותה אחר כך).");
    if (integrity !== "ok") warnings.push(`בדיקת תקינות מסד הנתונים: ${integrity}`);
    warnings.push(...configWarnings());
    // שלב 63: אם הבקשה של האדמין עצמו עברה דרך כמה שרתי ביניים ולא הוגדר TRUST_PROXY, ייתכן שהשרת רואה כתובת של שרת ביניים
    {
      const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
      const cf = String(req.headers["cf-connecting-ip"] || "").trim();
      if (config.isProd && !process.env.TRUST_PROXY && !config.clientIpHeader && (xff.length >= 2 || (cf && cf !== req.ip))) {
        warnings.push(`השרת רואה אצלכם את הכתובת ${req.ip}, אבל בכותרות מופיעות כתובות נוספות (X-Forwarded-For: ${xff.join(", ") || "-"}${cf ? `, CF-Connecting-IP: ${cf}` : ""}). ייתכן שהגבלות הקצב חלות על שרת ביניים. פתחו את "איזו כתובת השרת רואה אצלי" והגדירו TRUST_PROXY.`);
      }
    }
    res.json({
      // שלב 63: איזו כתובת השרת רואה אצל מי שפתח את העמוד. אם זו לא הכתובת שלכם, ההגבלות לפי כתובת חלות על שרת ביניים.
      clientIp: {
        seen: req.ip,
        forwardedFor: String(req.headers["x-forwarded-for"] || ""),
        trustProxy: config.trustProxy,
        headerOverride: config.clientIpHeader || "",
        cfConnectingIp: String(req.headers["cf-connecting-ip"] || ""),
        trueClientIp: String(req.headers["true-client-ip"] || ""),
      },
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      dbBytes,
      integrity,
      counts: { users: count("users"), activities: count("activities"), writeDocs: count("write_docs") },
      persist: { ...persistState },
      schema: { version: schemaVersion(db), expected: SCHEMA_VERSION },
      ai: { ...aiBudgetState(), configured: aiConfigured(), providers: sharedRouter().status() },
      serverErrors: recentServerErrors(),
      warnings,
    });
  });

  // שלב 64: בדיקת שחזור ידנית של הגיבוי שב-GitHub (מורידה, פותחת, ובודקת שהמסד תקין. לא נוגעת במסד החי)
  app.post("/api/admin/persist/verify", requireAdmin(), async (req, res) => {
    if (!persistState.configured) return res.status(400).json(fail("NOT_CONFIGURED", "השמירה ב-GitHub לא מוגדרת"));
    const r = await verifyRemoteBackup();
    audit(db, req.user.username, "persist.verify", { ok: r.ok });
    res.json(r);
  });

  // שלב 65 (ממצא 62): מייל בדיקה. הנמען קבוע: המייל של האדמין עצמו (או כתובת האדמין שהוגדרה), כדי שלא ישמש כמשגר לכתובות אחרות
  app.post("/api/admin/mail/test", requireAdmin(), limiter ? limiter(10 * 60_000, 5) : (_q, _s, next) => next(), async (req, res) => {
    if (!mailer?.hasTransport) return res.status(400).json(fail("NO_MAIL", "אין ספק מייל מוגדר. הגדירו SMTP_HOST, MAIL_RELAY_URL או RESEND_API_KEY ב-Environment (ראו SMTP-SETUP.md)."));
    const own = db.prepare("SELECT email FROM users WHERE id = ? AND email_verified_at IS NOT NULL").get(req.user.id)?.email;
    const to = String(own || config.smtp?.adminEmail || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) return res.status(400).json(fail("NO_TARGET", "אין כתובת מייל לשלוח אליה. אשרו מייל בחשבון שלכם (הגדרות חשבון), או הגדירו ADMIN_EMAIL ב-Environment."));
    const masked = to.replace(/^(.).*(@.*)$/, "$1***$2");
    try {
      const r = await mailer.sendNow({ to, subject: "בדיקת מייל - מחולל פעולות", html: `<p dir="rtl" style="font-size:16px">אם הגעתם לכאן, שליחת המיילים באתר עובדת (ערוץ: ${mailer.mode}).</p>` });
      audit(db, req.user.username, "mail.test", { ok: true, mode: r.mode });
      res.json({ ok: true, mode: r.mode, to: masked });
    } catch (e) {
      audit(db, req.user.username, "mail.test", { ok: false, code: e.code });
      res.status(502).json(fail("MAIL_FAILED", `השליחה נכשלה: ${e.message}${e.hint ? ` — ${e.hint}` : ""}`));
    }
  });

  // שלב 66 (ממצא 91): שאלות שמעוז לא ידע לענות עליהן (לפי כמות, מאוחדות). רק לאדמין
  app.get("/api/admin/eagle/unanswered", requireAdmin(), (req, res) => {
    res.set("Cache-Control", "no-store");
    const items = db.prepare("SELECT id, q, count, first_at AS firstAt, last_at AS lastAt FROM eagle_unanswered ORDER BY count DESC, last_at DESC LIMIT 100").all();
    res.json({ items, logging: process.env.EAGLE_LOG_UNANSWERED !== "0" });
  });
  app.delete("/api/admin/eagle/unanswered/:id", requireAdmin(), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json(fail("BAD_REQUEST", "מזהה לא תקין"));
    db.prepare("DELETE FROM eagle_unanswered WHERE id = ?").run(id);
    res.json({ ok: true });
  });
  app.delete("/api/admin/eagle/unanswered", requireAdmin(), (req, res) => {
    const n = db.prepare("DELETE FROM eagle_unanswered").run().changes;
    audit(db, req.user.username, "eagle.unanswered.clear", { n });
    res.json({ ok: true, removed: n });
  });

  app.post("/api/admin/persist/save", requireAdmin(), async (req, res) => {
    const h = persistHandle();
    if (!h) return res.status(400).json(fail("NO_PERSIST", "שמירת הנתונים החיצונית לא מוגדרת"));
    // כשהשמירה עצורה (כדי לא לדרוס גיבוי טוב) נדרש אישור מפורש: { override: true }
    const override = req.body?.override === true;
    if (persistState.blocked && !override) return res.status(409).json(fail("PERSIST_BLOCKED", `השמירה עצורה: ${persistState.blocked}. אם בכל זאת רוצים לשמור את המסד הנוכחי במקום הגיבוי הקיים, צריך אישור מפורש.`));
    const saved = await h.push({ force: true, override });
    audit(db, req.user.username, "persist.save", { saved, override });
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

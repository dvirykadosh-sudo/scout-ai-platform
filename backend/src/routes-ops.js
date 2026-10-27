// שלב 37 (221–250): תחזוקה, היסטוריה, שחזור, גיבוי מוצפן, לוח צוות.
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import { z } from "zod";
import { DB_WARN_BYTES, getSet, maintenanceMessage, mailBackupIfDue, pendingPath, putSet, validateBackupFile } from "./ops.js";

export function registerOpsRoutes(app, { db, dbFile, config, mailer, fail, requireUser, requireAdmin, audit, limiter }) {
  const lim = limiter(60_000, 60);

  // 246: מצב תחזוקה
  app.get("/api/admin/maintenance", requireAdmin(), (req, res) => res.json({ message: maintenanceMessage(db) }));
  app.put("/api/admin/maintenance", requireAdmin(), (req, res) => {
    const { message } = z.object({ message: z.string().trim().max(200) }).parse(req.body ?? {});
    putSet(db, "maintenance", message);
    audit(db, req.user.username, "maintenance", { on: !!message });
    res.json({ message });
  });

  // 241: היסטוריה (עד 90 ימים) ומצב הגיבוי למייל
  app.get("/api/admin/system/history", requireAdmin(), (req, res) => {
    const rows = db.prepare("SELECT day, db_bytes AS dbBytes, users, activities, write_docs AS writeDocs FROM system_samples ORDER BY day DESC LIMIT 90").all().reverse();
    res.json({
      rows,
      warnBytes: DB_WARN_BYTES,
      mailBackup: { configured: !!(mailer?.hasTransport && config.smtp.adminEmail && (process.env.BACKUP_PASSPHRASE || "").length >= 8), last: Number(getSet(db, "lastBackupMail", "0")) || null },
    });
  });
  // 242: שליחת גיבוי מוצפן למייל עכשיו
  app.post("/api/admin/backup/mail", requireAdmin(), limiter(60 * 60_000, 6), async (req, res) => {
    try {
      const r = await mailBackupIfDue(db, mailer, config, { force: true });
      if (!r.sent) return res.status(400).json(fail("NO_MAIL", `לא נשלח: ${r.reason}`));
      audit(db, req.user.username, "backup.mailed", {});
      res.json({ sent: true });
    } catch (e) {
      res.status(502).json(fail("MAIL", `השליחה נכשלה: ${e.message}`));
    }
  });

  // 243: שחזור מקובץ. הקובץ נבדק ונשמר, והחלפה בפועל נעשית באתחול הבא (השרת מופעל מחדש אוטומטית ב-Render).
  app.post("/api/admin/restore", requireAdmin(), limiter(60 * 60_000, 5), express.raw({ type: "application/octet-stream", limit: "60mb" }), (req, res) => {
    if (decodeURIComponent(String(req.headers["x-confirm"] || "")) !== "שחזור") return res.status(400).json(fail("CONFIRM", 'כדי לשחזר יש לאשר במילה "שחזור"'));
    if (dbFile === ":memory:") return res.status(400).json(fail("NO_FILE", "אין קובץ מסד להחלפה בהרצה הזו"));
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      validateBackupFile(buf);
    } catch (e) {
      return res.status(400).json(fail("BAD_BACKUP", e.message));
    }
    fs.writeFileSync(pendingPath(dbFile), buf);
    audit(db, req.user.username, "restore.staged", { bytes: buf.length });
    res.json({ staged: true, restarting: !!req.app.get("restartOnRestore") });
    if (req.app.get("restartOnRestore")) setTimeout(() => process.exit(0), 1500).unref();
  });

  // 221: לוח צוות
  const evZ = z.object({ title: z.string().trim().min(1).max(120), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ageGroup: z.string().trim().max(40).default(""), docId: z.number().int().positive().optional(), note: z.string().trim().max(200).default("") });
  const evOut = (r) => ({ id: r.id, userId: r.user_id, leader: r.leader, title: r.title, date: r.date, ageGroup: r.age_group, docId: r.doc_id, note: r.note });
  app.get("/api/team/events", requireUser(), lim, (req, res) => {
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const rows = db.prepare("SELECT * FROM team_events WHERE date >= ? ORDER BY date, id LIMIT 300").all(from);
    res.json(rows.map((r) => ({ ...evOut(r), mine: r.user_id === req.user.id })));
  });
  app.post("/api/team/events", requireUser(), lim, (req, res) => {
    const v = evZ.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM team_events WHERE user_id = ? AND date >= ?").get(req.user.id, new Date().toISOString().slice(0, 10)).c >= 60) return res.status(409).json(fail("LIMIT", "יש כבר 60 פעולות קרובות ברשימה שלך"));
    let docId = null;
    if (v.docId) docId = db.prepare("SELECT id FROM write_docs WHERE id = ? AND owner_id = ?").get(v.docId, req.user.id)?.id ?? null;
    const u = db.prepare("SELECT display_name, username FROM users WHERE id = ?").get(req.user.id);
    const r = db.prepare("INSERT INTO team_events (user_id, leader, title, date, age_group, doc_id, note, created_at) VALUES (?,?,?,?,?,?,?,?)").run(req.user.id, u.display_name || u.username, v.title, v.date, v.ageGroup, docId, v.note, new Date().toISOString());
    res.status(201).json(evOut(db.prepare("SELECT * FROM team_events WHERE id = ?").get(Number(r.lastInsertRowid))));
  });
  app.delete("/api/team/events/:id", requireUser(), lim, (req, res) => {
    const r = db.prepare("SELECT * FROM team_events WHERE id = ?").get(Number(req.params.id));
    if (!r) return res.status(404).json(fail("NOT_FOUND", "הרשומה לא נמצאה"));
    if (r.user_id !== req.user.id && req.user.role !== "ADMIN") return res.status(403).json(fail("FORBIDDEN", "אפשר למחוק רק רשומה שלך"));
    db.prepare("DELETE FROM team_events WHERE id = ?").run(r.id);
    res.json({ ok: true });
  });
  // 222: הודעה למחליף, עם התוכנית אם צורפה
  app.get("/api/team/events/:id/substitute", requireUser(), lim, (req, res) => {
    const r = db.prepare("SELECT * FROM team_events WHERE id = ?").get(Number(req.params.id));
    if (!r || r.user_id !== req.user.id) return res.status(404).json(fail("NOT_FOUND", "הרשומה לא נמצאה"));
    let plan = "";
    if (r.doc_id) {
      const d = db.prepare("SELECT title, blocks_json FROM write_docs WHERE id = ? AND owner_id = ?").get(r.doc_id, req.user.id);
      if (d) plan = "\n\nהתוכנית:\n" + JSON.parse(d.blocks_json).map((b, i) => `${i + 1}. ${b.title || "שלב"}${b.minutes ? ` (${b.minutes} דק')` : ""}${b.text ? `: ${String(b.text).replace(/[*#>|]/g, "").split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 160)}` : ""}`).join("\n");
    }
    res.json({ text: `היי! אני לא יכול/ה להעביר את הפעולה "${r.title}" ב-${r.date}${r.age_group ? ` (${r.age_group})` : ""}. תוכל/י להחליף אותי?${r.note ? `\nהערה: ${r.note}` : ""}${plan}\n\nתודה רבה! ${r.leader}` });
  });
}

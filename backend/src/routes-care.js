// נקודות קצה לסבב ז' (פריטים 34–42): בטיחות, התאמות נגישות, דיווחים, התראות, אחסון, דוח, ייצוא נתונים, דומות.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getActivity, rowToActivity, updateActivity } from "./activities.js";
import { buildReport, reportCsv, safetyAddition, safetyReview, similarActivities } from "./care.js";
import { listBackups, backupDirFor } from "./backup.js";
import { audit, nowIso } from "./db.js";
import { isRealDate, israelToday } from "./organizer.js";
import { notify, notifyAdmins } from "./notify.js";

const text = (max) => z.string().trim().max(max);
export const FLAG_REASONS = { age: "לא מתאים לגיל", content: "תוכן בעייתי או לא ראוי", mistake: "שגיאה או חוסר בפעולה", safety: "בעיית בטיחות", other: "אחר" };

const flagSchema = z.object({ reason: z.enum(Object.keys(FLAG_REASONS)), note: text(300).default("") });
const resolveSchema = z.object({ action: z.enum(["dismiss", "resolved", "archive"]) });
const readSchema = z.object({ ids: z.array(z.number().int()).max(100).optional(), all: z.boolean().optional() });

const addDays = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export function registerCareRoutes(app, { db, dbFile, limiter, fail, requireUser, requireAdmin, optionalAuth, canManage, forbidden, saveVersion }) {
  const notFound = (res, m = "הפעולה לא נמצאה") => res.status(404).json(fail("NOT_FOUND", m));

  // ── 34. בטיחות ──
  app.get("/api/activities/:id/safety", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    res.json({ ...safetyReview(a), addition: safetyAddition(a) });
  });
  app.post("/api/activities/:id/safety/apply", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id), { includeArchived: true });
    if (!a) return notFound(res);
    if (!canManage(req.user, a)) return forbidden(res);
    const add = safetyAddition(a);
    if (!add) return res.status(409).json(fail("NOTHING", "אין הנחיות חסרות להוסיף"));
    saveVersion(a.id, a, req.user.username, "לפני הוספת הערות בטיחות");
    updateActivity(db, a.id, { ...a, safetyNotes: `${a.safetyNotes} ${add}`.trim().slice(0, 1000) });
    audit(db, req.user.username, "activity.safetyApply", { id: a.id });
    res.json(getActivity(db, a.id, { includeArchived: true }));
  });

  // ── 36. דיווח על פעולה ──
  app.get("/api/flag-reasons", (req, res) => res.json(Object.entries(FLAG_REASONS).map(([id, label]) => ({ id, label }))));
  app.post("/api/activities/:id/flags", limiter(15 * 60_000, 10), (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    const v = flagSchema.parse(req.body ?? {});
    const who = optionalAuth(req);
    db.prepare("INSERT INTO flags (activity_id, reason, note, reporter_id, status, created_at) VALUES (?,?,?,?,'OPEN',?)").run(a.id, v.reason, v.note || null, who?.id ?? null, nowIso());
    notifyAdmins(db, "flag", `דיווח על "${a.title}": ${FLAG_REASONS[v.reason]}`, "/admin");
    if (a.ownerId && a.ownerId !== who?.id) notify(db, a.ownerId, "flag", `מישהו דיווח על בעיה בפעולה שלך "${a.title}": ${FLAG_REASONS[v.reason]}`, `/library/${a.id}`);
    audit(db, who?.username, "flag.add", { id: a.id, reason: v.reason });
    res.status(201).json({ ok: true });
  });
  app.get("/api/admin/flags", requireAdmin(), (req, res) => {
    const status = req.query.status === "ALL" ? null : "OPEN";
    const rows = db
      .prepare(`SELECT f.*, a.title, a.status AS a_status, COALESCE(u.display_name, u.username) AS reporter FROM flags f JOIN activities a ON a.id = f.activity_id LEFT JOIN users u ON u.id = f.reporter_id ${status ? "WHERE f.status = 'OPEN'" : ""} ORDER BY f.id DESC LIMIT 200`)
      .all();
    res.json(rows.map((r) => ({ id: r.id, activityId: r.activity_id, title: r.title, activityStatus: r.a_status, reason: r.reason, reasonLabel: FLAG_REASONS[r.reason] ?? r.reason, note: r.note || "", reporter: r.reporter || "אורח", status: r.status, resolution: r.resolution, createdAt: r.created_at })));
  });
  app.post("/api/admin/flags/:id/resolve", requireAdmin(), (req, res) => {
    const f = db.prepare("SELECT * FROM flags WHERE id = ?").get(Number(req.params.id));
    if (!f) return notFound(res, "הדיווח לא נמצא");
    const { action } = resolveSchema.parse(req.body ?? {});
    if (action === "archive") db.prepare("UPDATE activities SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").run(nowIso(), f.activity_id);
    db.prepare("UPDATE flags SET status = 'CLOSED', resolution = ?, resolved_by = ?, resolved_at = ? WHERE activity_id = ? AND status = 'OPEN' AND (id = ? OR ? = 'archive')").run(action, req.user.username, nowIso(), f.activity_id, f.id, action);
    audit(db, req.user.username, "flag.resolve", { id: f.id, action });
    res.json({ ok: true });
  });

  // ── 37. התראות ──
  app.get("/api/me/notifications", requireUser(), (req, res) => {
    const items = db.prepare("SELECT id, kind, text, link, read, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30").all(req.user.id);
    res.json({ unread: db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0").get(req.user.id).c, items: items.map((n) => ({ ...n, read: !!n.read })) });
  });
  app.post("/api/me/notifications/read", requireUser(), (req, res) => {
    const v = readSchema.parse(req.body ?? {});
    if (v.all) db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.user.id);
    else for (const id of v.ids ?? []) db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(id, req.user.id);
    res.json({ ok: true });
  });

  // ── 38. מצב האחסון ──
  app.get("/api/admin/storage", requireAdmin(), (req, res) => {
    const memory = dbFile === ":memory:";
    const abs = memory ? ":memory:" : path.resolve(dbFile);
    const onRender = !!process.env.RENDER;
    const diskRoots = [process.env.PERSISTENT_DISK_PATH, "/data", "/var/data"].filter(Boolean);
    const persistent = !memory && (!onRender || diskRoots.some((r) => abs.startsWith(r + "/") || abs === r));
    let size = null;
    try {
      if (!memory) size = fs.statSync(abs).size;
    } catch {
      /* file not there yet */
    }
    const backups = listBackups(backupDirFor(dbFile));
    res.json({
      dbPath: abs,
      sizeBytes: size,
      onRender,
      persistent,
      backups: backups.length,
      lastBackup: backups[0]?.createdAt ?? backups[0]?.modifiedAt ?? null,
      warning: persistent ? "" : "המסד נשמר על דיסק זמני. בכל הפעלה מחדש של השרת הנתונים יימחקו. כדי לשמור אותם צריך דיסק קבוע (ראו DEPLOY.md), או להוריד גיבוי באופן קבוע.",
    });
  });

  // ── 40. דוח תקופתי ──
  const reportRange = (q) => {
    const to = isRealDate(String(q.to)) ? String(q.to) : israelToday();
    const from = isRealDate(String(q.from)) ? String(q.from) : addDays(to, -90);
    return from <= to ? { from, to } : { from: to, to: from };
  };
  app.get("/api/admin/report", requireAdmin(), (req, res) => {
    const { from, to } = reportRange(req.query);
    res.json(buildReport(db, from, to));
  });
  app.get("/api/admin/report.csv", requireAdmin(), (req, res) => {
    const { from, to } = reportRange(req.query);
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="report-${from}-${to}.csv"` }).send(reportCsv(buildReport(db, from, to)));
  });

  // ── 41. ייצוא כל הנתונים שלי ──
  app.get("/api/me/export", requireUser(), (req, res) => {
    const id = req.user.id;
    const u = db.prepare("SELECT username, display_name AS displayName, role, created_at AS createdAt FROM users WHERE id = ?").get(id);
    const data = {
      exportedAt: nowIso(),
      user: u,
      activities: db.prepare("SELECT * FROM activities WHERE owner_id = ? ORDER BY id").all(id).map(rowToActivity),
      runs: db.prepare("SELECT activity_id AS activityId, ran_on AS ranOn, group_label AS groupLabel, worked, change_next AS changeNext, notes, engagement, timing FROM runs WHERE user_id = ? ORDER BY ran_on").all(id),
      schedule: db.prepare("SELECT activity_id AS activityId, title, date, time, duration_min AS durationMin, group_label AS groupLabel, note, remind_days AS remindDays FROM schedule WHERE user_id = ? ORDER BY date").all(id),
      notes: db.prepare("SELECT activity_id AS activityId, body, created_at AS createdAt FROM activity_notes WHERE user_id = ? ORDER BY id").all(id),
      collections: db.prepare("SELECT c.name, (SELECT group_concat(ci.activity_id) FROM collection_items ci WHERE ci.collection_id = c.id) AS activityIds FROM collections c WHERE c.owner_id = ?").all(id),
      style: (() => {
        const s = db.prepare("SELECT style_json FROM users WHERE id = ?").get(id)?.style_json;
        return s ? JSON.parse(s) : null;
      })(),
    };
    audit(db, req.user.username, "me.export", {});
    res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="my-scout-data.json"', "Cache-Control": "no-store" }).send(JSON.stringify(data, null, 2));
  });

  // ── 42. פעולות דומות ──
  app.get("/api/activities/:id/similar", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    res.json(similarActivities(db, a));
  });
}



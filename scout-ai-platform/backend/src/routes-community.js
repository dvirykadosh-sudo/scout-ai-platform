// סבב ח' (פריטים 43–50): תגיות אישיות, בקשות נושאים, היכל התהילה, פעולות ששכחתי, איחוד כפילויות, הודעות שבט.
import { z } from "zod";
import { getActivity } from "./activities.js";
import { audit, nowIso } from "./db.js";
import { notify, notifyAdmins } from "./notify.js";

const tagSchema = z.object({ tags: z.array(z.string().trim().min(1).max(24)).max(8) });
const reqSchema = z.object({ text: z.string().trim().min(5, "כתבו לפחות 5 תווים").max(200) });
const resolveSchema = z.object({ status: z.enum(["DONE", "DISMISSED"]), activityId: z.number().int().optional() });
const annSchema = z.object({ text: z.string().trim().min(3).max(300) });
const mergeSchema = z.object({ intoId: z.number().int() });

const brief = (r) => ({ id: r.id, title: r.title, ageGroup: r.age_group, durationMin: r.duration_min });
const PUBLIC = "a.status = 'PUBLISHED'";

export function registerCommunityRoutes(app, { db, limiter, fail, requireUser, requireAdmin, optionalAuth }) {
  const notFound = (res, m = "לא נמצא") => res.status(404).json(fail("NOT_FOUND", m));

  // ── 43. תגיות אישיות ──
  app.get("/api/me/tags", requireUser(), (req, res) => {
    res.json(db.prepare("SELECT tag, COUNT(*) AS count FROM activity_tags WHERE user_id = ? GROUP BY tag ORDER BY count DESC, tag").all(req.user.id));
  });
  app.get("/api/me/tagged", requireUser(), (req, res) => {
    const tag = String(req.query.tag || "");
    const rows = db.prepare(`SELECT a.* FROM activity_tags t JOIN activities a ON a.id = t.activity_id WHERE t.user_id = ? AND t.tag = ? AND a.status != 'ARCHIVED' ORDER BY a.id DESC`).all(req.user.id, tag);
    res.json(rows.map(brief));
  });
  app.get("/api/activities/:id/tags", requireUser(), (req, res) => {
    res.json(db.prepare("SELECT tag FROM activity_tags WHERE user_id = ? AND activity_id = ? ORDER BY tag").all(req.user.id, Number(req.params.id)).map((r) => r.tag));
  });
  app.put("/api/activities/:id/tags", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res, "הפעולה לא נמצאה");
    const { tags } = tagSchema.parse(req.body ?? {});
    const clean = [...new Set(tags.map((t) => t.replace(/\s+/g, " ")))];
    db.prepare("DELETE FROM activity_tags WHERE user_id = ? AND activity_id = ?").run(req.user.id, a.id);
    for (const t of clean) db.prepare("INSERT INTO activity_tags (user_id, activity_id, tag) VALUES (?,?,?)").run(req.user.id, a.id, t);
    res.json(clean.sort());
  });

  // ── 44. בקשות נושאים ──
  const requestRows = (uid) =>
    db
      .prepare(
        `SELECT r.*, COALESCE(u.display_name, u.username) AS author,
                (SELECT COUNT(*) FROM topic_votes v WHERE v.request_id = r.id) AS votes,
                EXISTS(SELECT 1 FROM topic_votes v WHERE v.request_id = r.id AND v.user_id = ?) AS voted
         FROM topic_requests r JOIN users u ON u.id = r.user_id WHERE r.status != 'DISMISSED' ORDER BY (r.status = 'OPEN') DESC, votes DESC, r.id DESC LIMIT 100`,
      )
      .all(uid ?? 0)
      .map((r) => ({ id: r.id, text: r.text, author: r.author, status: r.status, activityId: r.activity_id, votes: r.votes, voted: !!r.voted, createdAt: r.created_at }));
  app.get("/api/requests", (req, res) => res.json(requestRows(optionalAuth(req)?.id)));
  app.post("/api/requests", requireUser(), limiter(60 * 60_000, 10), (req, res) => {
    const { text } = reqSchema.parse(req.body ?? {});
    const id = db.prepare("INSERT INTO topic_requests (user_id, text, created_at) VALUES (?,?,?)").run(req.user.id, text, nowIso()).lastInsertRowid;
    db.prepare("INSERT INTO topic_votes (request_id, user_id) VALUES (?,?)").run(id, req.user.id);
    notifyAdmins(db, "request", `בקשה חדשה לנושא: ${text}`, "/requests");
    res.status(201).json({ id: Number(id) });
  });
  app.post("/api/requests/:id/vote", requireUser(), (req, res) => {
    const r = db.prepare("SELECT id FROM topic_requests WHERE id = ? AND status = 'OPEN'").get(Number(req.params.id));
    if (!r) return notFound(res, "הבקשה לא נמצאה");
    const had = db.prepare("SELECT 1 FROM topic_votes WHERE request_id = ? AND user_id = ?").get(r.id, req.user.id);
    if (had) db.prepare("DELETE FROM topic_votes WHERE request_id = ? AND user_id = ?").run(r.id, req.user.id);
    else db.prepare("INSERT INTO topic_votes (request_id, user_id) VALUES (?,?)").run(r.id, req.user.id);
    res.json({ voted: !had, votes: db.prepare("SELECT COUNT(*) AS c FROM topic_votes WHERE request_id = ?").get(r.id).c });
  });
  app.post("/api/admin/requests/:id/resolve", requireAdmin(), (req, res) => {
    const r = db.prepare("SELECT * FROM topic_requests WHERE id = ?").get(Number(req.params.id));
    if (!r) return notFound(res, "הבקשה לא נמצאה");
    const v = resolveSchema.parse(req.body ?? {});
    db.prepare("UPDATE topic_requests SET status = ?, activity_id = ? WHERE id = ?").run(v.status, v.activityId ?? null, r.id);
    if (v.status === "DONE") notify(db, r.user_id, "request", `הבקשה שלך "${r.text}" טופלה`, v.activityId ? `/library/${v.activityId}` : "/requests");
    audit(db, req.user.username, "request.resolve", { id: r.id, status: v.status });
    res.json({ ok: true });
  });

  // ── 45. היכל התהילה ──
  app.get("/api/hall", (req, res) => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const sinceDay = since.slice(0, 10);
    res.json({
      topRated: db.prepare(`SELECT a.*, ROUND(AVG(r.stars),1) AS average, COUNT(*) AS count FROM ratings r JOIN activities a ON a.id = r.activity_id WHERE ${PUBLIC} AND r.created_at >= ? GROUP BY a.id ORDER BY average DESC, count DESC, a.id LIMIT 5`).all(since).map((r) => ({ ...brief(r), average: r.average, count: r.count })),
      mostRun: db.prepare(`SELECT a.*, COUNT(*) AS runs FROM runs r JOIN activities a ON a.id = r.activity_id WHERE ${PUBLIC} AND r.ran_on >= ? GROUP BY a.id ORDER BY runs DESC, a.id LIMIT 5`).all(sinceDay).map((r) => ({ ...brief(r), runs: r.runs })),
      newest: db.prepare(`SELECT a.* FROM activities a WHERE ${PUBLIC} AND a.is_seed = 0 ORDER BY a.id DESC LIMIT 5`).all().map(brief),
    });
  });

  // ── 49. פעולות ששכחתי ──
  app.get("/api/me/forgotten", requireUser(), (req, res) => {
    const days = Math.min(365, Math.max(14, Number(req.query.days) || 60));
    const cut = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = db
      .prepare(
        `SELECT a.*, (SELECT MAX(ran_on) FROM runs r WHERE r.activity_id = a.id AND r.user_id = ?) AS last_run
         FROM activities a WHERE a.owner_id = ? AND a.status = 'PUBLISHED'
           AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.activity_id = a.id AND r.user_id = ? AND r.ran_on >= ?)
         ORDER BY last_run IS NOT NULL, last_run, a.id DESC LIMIT 10`,
      )
      .all(req.user.id, req.user.id, req.user.id, cut);
    res.json({ days, items: rows.map((r) => ({ ...brief(r), lastRun: r.last_run })) });
  });

  // ── 48. איחוד כפילויות (אדמין) ──
  app.post("/api/admin/activities/:id/merge", requireAdmin(), (req, res) => {
    const from = getActivity(db, Number(req.params.id), { includeArchived: true });
    const { intoId } = mergeSchema.parse(req.body ?? {});
    const into = getActivity(db, intoId);
    if (!from || !into) return notFound(res, "הפעולה לא נמצאה");
    if (from.id === into.id) return res.status(400).json(fail("BAD_REQUEST", "אי אפשר לאחד פעולה עם עצמה"));
    const moved = {};
    db.exec("BEGIN");
    try {
      for (const [t, col] of [["runs", "activity_id"], ["ratings", "activity_id"], ["activity_notes", "activity_id"], ["feedback", "activity_id"]]) {
        moved[t] = db.prepare(`UPDATE ${t} SET ${col} = ? WHERE ${col} = ?`).run(into.id, from.id).changes;
      }
      db.prepare("INSERT OR IGNORE INTO collection_items (collection_id, activity_id, added_at) SELECT collection_id, ?, added_at FROM collection_items WHERE activity_id = ?").run(into.id, from.id);
      db.prepare("DELETE FROM collection_items WHERE activity_id = ?").run(from.id);
      db.prepare("INSERT OR IGNORE INTO activity_tags (user_id, activity_id, tag) SELECT user_id, ?, tag FROM activity_tags WHERE activity_id = ?").run(into.id, from.id);
      db.prepare("DELETE FROM activity_tags WHERE activity_id = ?").run(from.id);
      db.prepare("UPDATE activities SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").run(nowIso(), from.id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    if (from.ownerId && from.ownerId !== into.ownerId) notify(db, from.ownerId, "merge", `הפעולה "${from.title}" אוחדה עם "${into.title}"`, `/library/${into.id}`);
    audit(db, req.user.username, "activity.merge", { from: from.id, into: into.id });
    res.json({ ok: true, moved, intoId: into.id });
  });

  // ── 50. הודעות שבט ──
  app.get("/api/announcements", (req, res) => {
    res.json(db.prepare("SELECT id, text, author, created_at AS createdAt FROM announcements WHERE active = 1 ORDER BY id DESC LIMIT 3").all());
  });
  app.post("/api/admin/announcements", requireAdmin(), (req, res) => {
    const { text } = annSchema.parse(req.body ?? {});
    const id = db.prepare("INSERT INTO announcements (text, author, created_at) VALUES (?,?,?)").run(text, req.user.username, nowIso()).lastInsertRowid;
    audit(db, req.user.username, "announcement.add", { id: Number(id) });
    res.status(201).json({ id: Number(id) });
  });
  app.delete("/api/admin/announcements/:id", requireAdmin(), (req, res) => {
    const r = db.prepare("UPDATE announcements SET active = 0 WHERE id = ?").run(Number(req.params.id));
    if (!r.changes) return notFound(res);
    res.json({ ok: true });
  });
}

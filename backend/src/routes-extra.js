// נקודות קצה לסבב ג': התאמות, נושאים, הערות, אוספים, אישור, משוב ותובנות.
import { z } from "zod";
import { adaptActivity, CONDITIONS } from "./adapt.js";
import { getActivity, insertActivity, rowToActivity } from "./activities.js";
import { audit, nowIso } from "./db.js";
import { suggestTopics } from "./topics.js";

const text = (max) => z.string().trim().max(max);

export const getSetting = (db, key, def = "") => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? def;
export const setSetting = (db, key, value) => db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));

/** Status for a new activity: waits for approval when the admin turned that on (admins are never held). */
export const newActivityStatus = (db, who) => (getSetting(db, "requireApproval") === "1" && who?.role !== "ADMIN" ? "PENDING" : "PUBLISHED");

export function registerExtraRoutes(app, { db, limiter, fail, requireUser, requireAdmin, optionalAuth, optionalUser }) {
  const notFound = (res, msg = "הפעולה לא נמצאה") => res.status(404).json(fail("NOT_FOUND", msg));
  const canManage = (user, a) => user.role === "ADMIN" || (!a.isSeed && a.ownerId === user.id);

  // ── 11. התאמה לתנאים ──
  app.get("/api/adapt/conditions", (req, res) => res.json(Object.entries(CONDITIONS).map(([key, c]) => ({ key, label: c.label }))));
  app.post("/api/activities/:id/adapt", limiter(15 * 60_000, 40), (req, res) => {
    const src = getActivity(db, Number(req.params.id));
    if (!src) return notFound(res);
    const { condition } = z.object({ condition: z.enum(Object.keys(CONDITIONS)) }).parse(req.body ?? {});
    const who = optionalAuth(req);
    const copy = adaptActivity(src, condition);
    const id = insertActivity(db, { ...src, ...copy, isSeed: false, ownerId: who?.id ?? null, status: newActivityStatus(db, who) });
    audit(db, optionalUser(req), "activity.adapt", { from: src.id, id, condition });
    res.status(201).json(getActivity(db, id));
  });

  // ── 13. נושאים לפי חגים ועונה ──
  app.get("/api/topics/suggest", (req, res) => {
    const d = req.query.date ? new Date(`${String(req.query.date)}T12:00:00Z`) : new Date();
    if (Number.isNaN(d.getTime())) return res.status(400).json(fail("VALIDATION", "תאריך לא תקין"));
    res.json(suggestTopics(d, Number(req.query.days) || 45));
  });

  // ── 16. הערות בין מדריכים (למחוברים בלבד) ──
  app.get("/api/activities/:id/notes", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    if (!getActivity(db, id)) return notFound(res);
    const rows = db.prepare("SELECT id, user_id AS userId, author_name AS author, body, created_at AS createdAt FROM activity_notes WHERE activity_id = ? ORDER BY id DESC LIMIT 100").all(id);
    res.json(rows);
  });
  app.post("/api/activities/:id/notes", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const id = Number(req.params.id);
    if (!getActivity(db, id)) return notFound(res);
    const { body } = z.object({ body: text(600).min(2, "ההערה קצרה מדי") }).parse(req.body ?? {});
    const u = db.prepare("SELECT display_name, username FROM users WHERE id = ?").get(req.user.id);
    const name = u?.display_name || u?.username || req.user.username;
    const r = db.prepare("INSERT INTO activity_notes (activity_id, user_id, author_name, body, created_at) VALUES (?,?,?,?,?)").run(id, req.user.id, name, body, nowIso());
    res.status(201).json({ id: Number(r.lastInsertRowid), userId: req.user.id, author: name, body, createdAt: nowIso() });
  });
  app.delete("/api/notes/:nid", requireUser(), (req, res) => {
    const n = db.prepare("SELECT * FROM activity_notes WHERE id = ?").get(Number(req.params.nid));
    if (!n) return notFound(res, "ההערה לא נמצאה");
    const a = getActivity(db, n.activity_id);
    if (n.user_id !== req.user.id && !(a && canManage(req.user, a))) return res.status(403).json(fail("FORBIDDEN", "אפשר למחוק רק הערות שכתבתם, או הערות על פעולה שלכם"));
    db.prepare("DELETE FROM activity_notes WHERE id = ?").run(n.id);
    res.json({ ok: true });
  });

  // ── 17. אוספים אישיים ──
  const loadCollections = (userId) => {
    const cols = db.prepare("SELECT id, name, created_at AS createdAt FROM collections WHERE owner_id = ? ORDER BY id DESC").all(userId);
    const items = db.prepare(
      `SELECT ci.collection_id AS cid, a.id, a.title, a.duration_min AS durationMin FROM collection_items ci JOIN activities a ON a.id = ci.activity_id
       WHERE ci.collection_id IN (SELECT id FROM collections WHERE owner_id = ?) AND a.status != 'ARCHIVED' ORDER BY ci.added_at`,
    ).all(userId);
    return cols.map((c) => ({ ...c, items: items.filter((i) => i.cid === c.id).map(({ id, title, durationMin }) => ({ id, title, durationMin })) }));
  };
  const ownCollection = (req, res) => {
    const c = db.prepare("SELECT * FROM collections WHERE id = ?").get(Number(req.params.cid));
    if (!c || c.owner_id !== req.user.id) {
      notFound(res, "האוסף לא נמצא");
      return null;
    }
    return c;
  };
  app.get("/api/me/collections", requireUser(), (req, res) => res.json(loadCollections(req.user.id)));
  app.post("/api/me/collections", requireUser(), (req, res) => {
    const { name } = z.object({ name: text(80).min(2, "שם האוסף קצר מדי") }).parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM collections WHERE owner_id = ?").get(req.user.id).c >= 50) return res.status(409).json(fail("LIMIT", "אפשר עד 50 אוספים"));
    const r = db.prepare("INSERT INTO collections (owner_id, name, created_at) VALUES (?,?,?)").run(req.user.id, name, nowIso());
    res.status(201).json({ id: Number(r.lastInsertRowid), name, items: [] });
  });
  app.delete("/api/collections/:cid", requireUser(), (req, res) => {
    const c = ownCollection(req, res);
    if (!c) return;
    db.prepare("DELETE FROM collections WHERE id = ?").run(c.id);
    res.json({ ok: true });
  });
  app.post("/api/collections/:cid/items", requireUser(), (req, res) => {
    const c = ownCollection(req, res);
    if (!c) return;
    const { activityId } = z.object({ activityId: z.coerce.number().int().positive() }).parse(req.body ?? {});
    if (!getActivity(db, activityId)) return notFound(res);
    db.prepare("INSERT OR IGNORE INTO collection_items (collection_id, activity_id, added_at) VALUES (?,?,?)").run(c.id, activityId, nowIso());
    res.status(201).json({ ok: true });
  });
  app.delete("/api/collections/:cid/items/:aid", requireUser(), (req, res) => {
    const c = ownCollection(req, res);
    if (!c) return;
    db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND activity_id = ?").run(c.id, Number(req.params.aid));
    res.json({ ok: true });
  });

  // ── 18. אישור לפני כניסה למאגר המשותף ──
  app.get("/api/admin/settings", requireAdmin(), (req, res) => res.json({ requireApproval: getSetting(db, "requireApproval") === "1" }));
  app.put("/api/admin/settings", requireAdmin(), (req, res) => {
    const { requireApproval } = z.object({ requireApproval: z.boolean() }).parse(req.body ?? {});
    setSetting(db, "requireApproval", requireApproval ? "1" : "0");
    audit(db, optionalUser(req), "settings.approval", { requireApproval });
    res.json({ requireApproval });
  });
  app.get("/api/admin/pending", requireAdmin(), (req, res) => {
    res.json(db.prepare("SELECT * FROM activities WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 200").all().map(rowToActivity));
  });
  const decide = (status, action) => (req, res) => {
    const id = Number(req.params.id);
    const r = db.prepare("SELECT status FROM activities WHERE id = ?").get(id);
    if (!r || r.status !== "PENDING") return notFound(res, "אין פעולה שממתינה לאישור עם המספר הזה");
    db.prepare("UPDATE activities SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
    audit(db, optionalUser(req), action, { id });
    res.json({ ok: true, status });
  };
  app.post("/api/admin/activities/:id/approve", requireAdmin(), decide("PUBLISHED", "activity.approve"));
  app.post("/api/admin/activities/:id/reject", requireAdmin(), decide("ARCHIVED", "activity.reject"));

  // ── 23. משוב אנונימי מחניכים ──
  const fbSchema = z.object({
    rating: z.coerce.number().int().min(1, "בחרו דירוג").max(5),
    liked: text(200).default(""),
    more: z.enum(["yes", "maybe", "no"]).default("maybe"),
  });
  app.post("/api/activities/:id/feedback", limiter(60 * 60_000, 30), (req, res) => {
    const id = Number(req.params.id);
    if (!getActivity(db, id)) return notFound(res);
    const f = fbSchema.parse(req.body ?? {});
    // no name, no IP and no user are stored: the form is anonymous
    db.prepare("INSERT INTO feedback (activity_id, rating, liked, more, created_at) VALUES (?,?,?,?,?)").run(id, f.rating, f.liked, f.more, nowIso());
    res.status(201).json({ ok: true });
  });
  app.get("/api/activities/:id/feedback", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    if (!canManage(req.user, a)) return res.status(403).json(fail("FORBIDDEN", "המשוב גלוי רק ליוצר הפעולה ולאדמין"));
    const rows = db.prepare("SELECT id, rating, liked, more, created_at AS createdAt FROM feedback WHERE activity_id = ? ORDER BY id DESC LIMIT 300").all(a.id);
    const dist = [1, 2, 3, 4, 5].map((n) => rows.filter((r) => r.rating === n).length);
    res.json({
      count: rows.length,
      average: rows.length ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : 0,
      distribution: dist,
      more: { yes: rows.filter((r) => r.more === "yes").length, maybe: rows.filter((r) => r.more === "maybe").length, no: rows.filter((r) => r.more === "no").length },
      comments: rows.filter((r) => r.liked).map((r) => ({ id: r.id, text: r.liked, rating: r.rating, createdAt: r.createdAt })),
    });
  });
  app.delete("/api/feedback/:fid", requireUser(), (req, res) => {
    const f = db.prepare("SELECT * FROM feedback WHERE id = ?").get(Number(req.params.fid));
    if (!f) return notFound(res, "התגובה לא נמצאה");
    const a = getActivity(db, f.activity_id);
    if (!a || !canManage(req.user, a)) return res.status(403).json(fail("FORBIDDEN", "אין הרשאה"));
    db.prepare("DELETE FROM feedback WHERE id = ?").run(f.id);
    res.json({ ok: true });
  });

  // ── 20. תובנות לאדמין ──
  app.get("/api/admin/insights", requireAdmin(), (req, res) => {
    const published = db.prepare("SELECT id, title, leading_value AS value, created_at AS createdAt FROM activities WHERE status = 'PUBLISHED'").all();
    const runsBy = Object.fromEntries(db.prepare("SELECT activity_id AS id, COUNT(*) AS c FROM runs GROUP BY activity_id").all().map((r) => [r.id, r.c]));
    const values = {};
    for (const a of published) values[a.value] = (values[a.value] || 0) + 1;
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = Date.now() - i * 7 * 86400000;
      const start = end - 7 * 86400000;
      return { weekStart: new Date(start).toISOString().slice(0, 10), created: published.filter((a) => a.createdAt >= new Date(start).toISOString() && a.createdAt < new Date(end).toISOString()).length };
    }).reverse();
    const fb = db.prepare("SELECT COUNT(*) AS c, AVG(rating) AS avg FROM feedback").get();
    res.json({
      published: published.length,
      pending: db.prepare("SELECT COUNT(*) AS c FROM activities WHERE status = 'PENDING'").get().c,
      values: Object.entries(values).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
      weeks,
      instructors: db
        .prepare(
          `SELECT COALESCE(u.display_name, u.username) AS name,
                  (SELECT COUNT(*) FROM activities a WHERE a.owner_id = u.id AND a.status = 'PUBLISHED') AS activities,
                  (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id) AS runs
           FROM users u WHERE u.role = 'INSTRUCTOR' ORDER BY activities DESC, runs DESC LIMIT 10`,
        )
        .all(),
      neverRun: published.filter((a) => !runsBy[a.id]).slice(0, 8).map(({ id, title }) => ({ id, title })),
      mostRun: published.filter((a) => runsBy[a.id]).sort((a, b) => runsBy[b.id] - runsBy[a.id]).slice(0, 5).map((a) => ({ id: a.id, title: a.title, runs: runsBy[a.id] })),
      feedback: { count: fb.c, average: fb.c ? Math.round(fb.avg * 10) / 10 : 0 },
    });
  });
}

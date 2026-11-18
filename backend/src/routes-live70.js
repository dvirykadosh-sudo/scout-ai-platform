// שלב 70: עריכת צוות בעורך. הזמנת עורכים למסמך, ונוכחות חיה (SSE) עם "מי נמצא באיזה שלב".
// הרשאות: עורך מוזמן יכול לקרוא ולשמור (דרך GET/PUT הרגילים של המסמך). מחיקה, שיתוף, ייצוא והזמנות נשארים לבעלים.
import { z } from "zod";
import { audit, nowIso } from "./db.js";
import { notify } from "./notify.js";
import { createLiveDocs } from "./lux-presence.js";

export const MAX_EDITORS = 4;
const CID = /^[a-f0-9]{16}$/;
const focusBody = z.object({ cid: z.string().regex(CID), block: z.string().max(24).nullable(), editing: z.boolean().default(false) }).strict();

export function registerLive70Routes(app, { db, limiter, fail, requireUser }) {
  const live = app.locals.liveDocs ?? (app.locals.liveDocs = createLiveDocs());
  const lim = limiter(60_000, 120);
  const inviteLim = limiter(15 * 60_000, 40);
  const idOf = (req) => Number(req.params.id);
  const nameOf = (id) => db.prepare("SELECT COALESCE(display_name, username) AS n FROM users WHERE id = ?").get(id)?.n || "מדריך/ה";

  /** בעלים או עורך מוזמן. null אם אין הרשאה (או אין מסמך): תמיד אותה תשובה 404, כדי לא לחשוף מסמכים של אחרים. */
  const access = (docId, uid) => {
    const d = db.prepare("SELECT id, owner_id, title FROM write_docs WHERE id = ?").get(docId);
    if (!d) return null;
    if (d.owner_id === uid) return { d, role: "owner" };
    return db.prepare("SELECT 1 FROM write_doc_editors WHERE doc_id = ? AND user_id = ?").get(docId, uid) ? { d, role: "editor" } : null;
  };
  const notFound = (res) => res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));

  const editorsOf = (docId) => db.prepare("SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS displayName FROM write_doc_editors e JOIN users u ON u.id = e.user_id WHERE e.doc_id = ? ORDER BY e.added_at, u.id").all(docId);

  app.get("/api/write/docs/:id/editors", requireUser(), lim, (req, res) => {
    const a = access(idOf(req), req.user.id);
    if (!a) return notFound(res);
    const editors = editorsOf(a.d.id);
    res.json({ role: a.role, max: MAX_EDITORS, owner: { name: nameOf(a.d.owner_id) }, editors: editors.map((e) => ({ id: e.id, displayName: e.displayName, ...(a.role === "owner" ? { username: e.username } : {}) })) });
  });

  app.post("/api/write/docs/:id/editors", requireUser(), inviteLim, (req, res) => {
    const a = access(idOf(req), req.user.id);
    if (!a) return notFound(res);
    if (a.role !== "owner") return res.status(403).json(fail("FORBIDDEN", "רק מי שיצר את המסמך מזמין עורכים"));
    const v = z.object({ username: z.string().trim().min(1, "יש להזין שם משתמש").max(60) }).strict().safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", v.error.issues[0]?.message || "שם המשתמש אינו תקין"));
    const u = db.prepare("SELECT id, username, disabled FROM users WHERE lower(username) = lower(?)").get(v.data.username);
    if (!u || u.disabled) return res.status(404).json(fail("NO_USER", "לא נמצא משתמש פעיל בשם הזה. בקשו מהמדריך/ה לוודא את שם המשתמש"));
    if (u.id === a.d.owner_id) return res.status(400).json(fail("SELF", "המשתמש הזה כבר הבעלים של המסמך"));
    if (db.prepare("SELECT COUNT(*) AS c FROM write_doc_editors WHERE doc_id = ?").get(a.d.id).c >= MAX_EDITORS) return res.status(409).json(fail("LIMIT", `אפשר עד ${MAX_EDITORS} עורכים במסמך`));
    const r = db.prepare("INSERT OR IGNORE INTO write_doc_editors (doc_id, user_id, added_by, added_at) VALUES (?,?,?,?)").run(a.d.id, u.id, req.user.username, nowIso());
    if (r.changes) {
      notify(db, u.id, "collab", `${nameOf(req.user.id)} הזמין/ה אותך לערוך יחד את "${a.d.title || "מסמך ללא שם"}"`, `/write/${a.d.id}`);
      audit(db, req.user.username, "write.editor.add", { id: a.d.id, user: u.username });
    }
    res.status(201).json({ editors: editorsOf(a.d.id).map((e) => ({ id: e.id, displayName: e.displayName, username: e.username })) });
  });

  app.delete("/api/write/docs/:id/editors/:userId", requireUser(), lim, (req, res) => {
    const a = access(idOf(req), req.user.id);
    if (!a) return notFound(res);
    const target = Number(req.params.userId);
    if (!Number.isInteger(target)) return res.status(400).json(fail("BAD_REQUEST", "משתמש לא תקין"));
    if (a.role !== "owner" && target !== req.user.id) return res.status(403).json(fail("FORBIDDEN", "אפשר להסיר רק את עצמך"));
    const r = db.prepare("DELETE FROM write_doc_editors WHERE doc_id = ? AND user_id = ?").run(a.d.id, target);
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "העורך לא נמצא"));
    live.kickUser(a.d.id, target);
    audit(db, req.user.username, "write.editor.remove", { id: a.d.id, user: target });
    res.json({ ok: true });
  });

  /** מסמכים של אחרים שהוזמנתי לערוך (לרשימת "שותפו איתי") */
  app.get("/api/write/editing", requireUser(), lim, (req, res) => {
    const rows = db.prepare("SELECT d.id, d.title, d.updated_at AS updatedAt, COALESCE(u.display_name, u.username) AS owner FROM write_doc_editors e JOIN write_docs d ON d.id = e.doc_id JOIN users u ON u.id = d.owner_id WHERE e.user_id = ? ORDER BY d.updated_at DESC, d.id DESC LIMIT 100").all(req.user.id);
    res.json(rows.map((r) => ({ id: r.id, title: r.title || "מסמך ללא שם", owner: r.owner, updatedAt: r.updatedAt })));
  });

  // ───── חיבור חי (SSE) ─────
  app.get("/api/write/docs/:id/live", requireUser(), limiter(60_000, 40), (req, res) => {
    const cid = String(req.query.cid || "");
    const a = CID.test(cid) ? access(idOf(req), req.user.id) : null;
    if (!a) return notFound(res);
    if (live.check(a.d.id, cid) === "full") return res.status(409).json(fail("FULL", "יש כבר מספר מקסימלי של מחוברים במסמך"));
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const left = live.join(a.d.id, cid, res, { userId: req.user.id, name: nameOf(req.user.id), owner: a.role === "owner" });
    req.on("close", left);
  });

  app.post("/api/write/docs/:id/live/focus", requireUser(), limiter(60_000, 240), (req, res) => {
    const a = access(idOf(req), req.user.id);
    if (!a) return notFound(res);
    const v = focusBody.safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "העדכון אינו תקין"));
    if (!live.focus(a.d.id, v.data.cid, req.user.id, v.data)) return res.status(409).json(fail("NOT_CONNECTED", "אין חיבור פעיל למסמך"));
    res.json({ ok: true });
  });
}

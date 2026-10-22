// עוזר הכתיבה, פריטים 61–70: נקודות קצה.
import crypto from "node:crypto";
import { z } from "zod";
import { getActivity, rowToActivity } from "./activities.js";
import { analyze } from "./assist.js";
import { TEMPLATES, buildScript, gearFromDraft, inspireFrom, parseReflection, swapOptions } from "./assist2.js";
import { TRAITS, TRAIT_IDS } from "./assist-balance.js";
import { audit, nowIso } from "./db.js";
import { GEAR_GROUPS } from "./gear.js";
import { notify } from "./notify.js";
import { isRealDate, israelToday } from "./organizer.js";
import { AGE_GROUPS, METHOD_NAMES } from "./shared/constants.js";

const text20k = z.string().max(20000).default("");
const textOnly = z.object({ text: text20k });
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const draftSchema = z.object({
  id: z.number().int().min(1).optional(),
  text: z.string().trim().min(1, "אין מה לשמור").max(20000),
  title: z.string().trim().max(120).optional(),
  ageGroup: z.enum(AGE_GROUPS).optional(),
});
const commentSchema = z.object({
  name: z.string().trim().max(40).default(""),
  text: z.string().trim().min(2, "כתבו תגובה").max(500),
  quote: z.string().trim().max(200).default(""),
});
const groupSchema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(60),
  size: z.number().int().min(1).max(200).nullable().optional(),
  traits: z.array(z.enum(TRAIT_IDS)).max(TRAIT_IDS.length).default([]),
});
const scheduleSchema = z.object({
  text: z.string().min(10).max(20000),
  date: z.string().refine(isRealDate, "תאריך לא תקין"),
  time: z.union([z.string().regex(timeRe, "שעה לא תקינה"), z.literal("")]).default(""),
  groupLabel: z.string().trim().max(60).default(""),
  title: z.string().trim().max(120).optional(),
  activityId: z.number().int().min(1).optional(),
  remindDays: z.number().int().min(0).max(14).nullable().optional(),
});
const reflectSaveSchema = z.object({
  text: z.string().trim().min(5, "כתבו כמה משפטים").max(4000),
  draftId: z.number().int().min(1).optional(),
  activityId: z.number().int().min(1).optional(),
  ranOn: z.string().refine(isRealDate, "תאריך לא תקין").optional(),
  groupLabel: z.string().trim().max(60).default(""),
});

const firstLine = (t) => (String(t).split("\n").find((l) => l.trim()) || "").trim().replace(/^#+\s*/, "").slice(0, 80);
const groupRow = (r) => ({ id: r.id, name: r.name, size: r.size ?? null, traits: JSON.parse(r.traits_json || "[]") });
const commentRow = (c) => ({ id: c.id, authorName: c.author_name, quote: c.quote || "", body: c.body, resolved: !!c.resolved, createdAt: c.created_at });

export function registerAssist2Routes(app, { db, limiter, fail, requireUser, optionalAuth }) {
  const notFound = (res, what = "לא נמצא") => res.status(404).json(fail("NOT_FOUND", what));
  const published = () => db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);

  // 61. החלפת שיטה
  app.post("/api/assist/swap", limiter(60_000, 40), (req, res) => {
    const v = z.object({ text: text20k, method: z.enum(METHOD_NAMES) }).parse(req.body ?? {});
    res.json(swapOptions(v.text, v.method));
  });

  // 63. השראה מהמאגר
  app.post("/api/assist/inspire", limiter(60_000, 40), (req, res) => {
    const v = z.object({ text: text20k, stage: z.number().int().min(0).max(4).optional() }).parse(req.body ?? {});
    res.json(inspireFrom(published(), v.text, v.stage));
  });

  // 65. תבניות
  app.get("/api/assist/templates", (req, res) => res.json(TEMPLATES));

  // 66. ציוד מול הארון
  app.post("/api/assist/gear", limiter(60_000, 60), (req, res) => {
    const v = z.object({ text: text20k, have: z.array(z.enum(GEAR_GROUPS.map((g) => g.id))).max(GEAR_GROUPS.length).default([]), extra: z.string().trim().max(200).default("") }).parse(req.body ?? {});
    res.json(gearFromDraft(v.text, v.have, v.extra));
  });

  // 68. תסריט
  app.post("/api/assist/script", limiter(60_000, 40), (req, res) => res.json(buildScript(textOnly.parse(req.body ?? {}).text)));

  // 69. ניתוח הערות אחרי פעולה
  app.post("/api/assist/reflect", limiter(60_000, 40), (req, res) => {
    res.json(parseReflection(z.object({ text: z.string().max(4000).default("") }).parse(req.body ?? {}).text));
  });

  // 70. תכונות קבוצה
  app.get("/api/assist/traits", (req, res) => res.json(TRAITS));

  // ───── 67. הוספה ליומן מהטיוטה ─────
  app.post("/api/assist/schedule", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const v = scheduleSchema.parse(req.body ?? {});
    if (v.activityId && !getActivity(db, v.activityId)) return notFound(res, "הפעולה לא נמצאה");
    if (db.prepare("SELECT COUNT(*) AS c FROM schedule WHERE user_id = ?").get(req.user.id).c >= 500) return res.status(409).json(fail("LIMIT", "אפשר עד 500 אירועים ביומן. מחקו ישנים"));
    const a = analyze(v.text);
    const title = (v.title || a.title || "").trim();
    if (title.length < 2) return res.status(400).json(fail("NO_TITLE", "צריך כותרת. כתבו אותה בשורה הראשונה."));
    const gear = gearFromDraft(v.text);
    const prep = a.checklist.filter((c) => !c.done && c.id !== "stages").map((c) => c.label);
    const note = [gear.suggestedLine, prep.length ? `להשלים: ${prep.join(", ")}` : "", a.planB.length ? `יש ${a.planB.length} תוכניות ב'` : ""].filter(Boolean).join(" · ").slice(0, 300);
    const minutes = Math.max(5, Math.min(600, a.totalMinutes || 45));
    const r = db
      .prepare("INSERT INTO schedule (user_id, activity_id, title, date, time, duration_min, group_label, note, remind_days, dismissed, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)")
      .run(req.user.id, v.activityId ?? null, title, v.date, v.time || null, minutes, v.groupLabel || null, note || null, v.remindDays ?? 2, nowIso());
    audit(db, req.user.username, "assist.schedule", { id: Number(r.lastInsertRowid), date: v.date });
    res.status(201).json({ id: Number(r.lastInsertRowid), title, date: v.date, time: v.time, durationMin: minutes, note, prep });
  });

  // ───── 64. טיוטות בענן, שיתוף ותגובות ─────
  const myDraft = (id, userId) => db.prepare("SELECT * FROM assist_drafts WHERE id = ? AND owner_id = ?").get(id, userId);
  const draftOut = (d, extra = {}) => ({ id: d.id, title: d.title, text: d.text, ageGroup: d.age_group || "", shareToken: d.share_token || null, updatedAt: d.updated_at, ...extra });

  app.get("/api/assist/drafts", requireUser(), (req, res) => {
    const rows = db
      .prepare(
        `SELECT d.*, (SELECT COUNT(*) FROM assist_comments c WHERE c.draft_id = d.id AND c.resolved = 0) AS open_c
         FROM assist_drafts d WHERE d.owner_id = ? ORDER BY d.updated_at DESC, d.id DESC LIMIT 50`,
      )
      .all(req.user.id);
    res.json(rows.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updated_at, shared: !!d.share_token, openComments: d.open_c })));
  });

  app.post("/api/assist/drafts", requireUser(), limiter(15 * 60_000, 120), (req, res) => {
    const v = draftSchema.parse(req.body ?? {});
    const title = v.title || firstLine(v.text) || "טיוטה ללא שם";
    const t = nowIso();
    if (v.id) {
      const prev = myDraft(v.id, req.user.id);
      if (!prev) return notFound(res, "הטיוטה לא נמצאה");
      // 75. שומרים את הנוסח הקודם כגרסה (עד 30 אחרונות)
      if (prev.text !== v.text) {
        db.prepare("INSERT INTO assist_draft_versions (draft_id, text, note, saved_at) VALUES (?,?,?,?)").run(prev.id, prev.text, "לפני עדכון", t);
        db.prepare("DELETE FROM assist_draft_versions WHERE draft_id = ? AND id NOT IN (SELECT id FROM assist_draft_versions WHERE draft_id = ? ORDER BY id DESC LIMIT 30)").run(prev.id, prev.id);
      }
      db.prepare("UPDATE assist_drafts SET title=?, text=?, age_group=?, updated_at=? WHERE id=? AND owner_id=?").run(title, v.text, v.ageGroup ?? null, t, v.id, req.user.id);
      return res.json(draftOut(myDraft(v.id, req.user.id)));
    }
    if (db.prepare("SELECT COUNT(*) AS c FROM assist_drafts WHERE owner_id = ?").get(req.user.id).c >= 50) return res.status(409).json(fail("LIMIT", "אפשר לשמור עד 50 טיוטות בענן. מחקו ישנות"));
    const r = db.prepare("INSERT INTO assist_drafts (owner_id, title, text, age_group, created_at, updated_at) VALUES (?,?,?,?,?,?)").run(req.user.id, title, v.text, v.ageGroup ?? null, t, t);
    res.status(201).json(draftOut(myDraft(Number(r.lastInsertRowid), req.user.id)));
  });

  app.get("/api/assist/drafts/:id", requireUser(), (req, res) => {
    const d = myDraft(Number(req.params.id), req.user.id);
    if (!d) return notFound(res, "הטיוטה לא נמצאה");
    res.json(draftOut(d, { comments: db.prepare("SELECT * FROM assist_comments WHERE draft_id = ? ORDER BY id").all(d.id).map(commentRow) }));
  });

  app.delete("/api/assist/drafts/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM assist_drafts WHERE id = ? AND owner_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "הטיוטה לא נמצאה");
    res.json({ ok: true });
  });

  app.post("/api/assist/drafts/:id/share", requireUser(), (req, res) => {
    const { enable } = z.object({ enable: z.boolean() }).parse(req.body ?? {});
    const d = myDraft(Number(req.params.id), req.user.id);
    if (!d) return notFound(res, "הטיוטה לא נמצאה");
    const token = enable ? d.share_token || crypto.randomBytes(18).toString("base64url") : null;
    db.prepare("UPDATE assist_drafts SET share_token = ? WHERE id = ?").run(token, d.id);
    audit(db, req.user.username, enable ? "assist.share-on" : "assist.share-off", { id: d.id });
    res.json({ shareToken: token });
  });

  app.patch("/api/assist/comments/:id", requireUser(), (req, res) => {
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body ?? {});
    const r = db.prepare("UPDATE assist_comments SET resolved = ? WHERE id = ? AND draft_id IN (SELECT id FROM assist_drafts WHERE owner_id = ?)").run(resolved ? 1 : 0, Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "התגובה לא נמצאה");
    res.json({ ok: true });
  });

  app.delete("/api/assist/comments/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM assist_comments WHERE id = ? AND draft_id IN (SELECT id FROM assist_drafts WHERE owner_id = ?)").run(Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "התגובה לא נמצאה");
    res.json({ ok: true });
  });

  // תצוגה ציבורית של טיוטה משותפת (מי שיש לו את הקישור)
  const byToken = (token) => (/^[A-Za-z0-9_-]{16,64}$/.test(token) ? db.prepare("SELECT d.*, COALESCE(u.display_name, u.username) AS owner_name FROM assist_drafts d JOIN users u ON u.id = d.owner_id WHERE d.share_token = ?").get(token) : null);

  app.get("/api/assist/shared/:token", limiter(60_000, 60), (req, res) => {
    const d = byToken(String(req.params.token));
    if (!d) return notFound(res, "הקישור לא פעיל");
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    res.json({ title: d.title, text: d.text, ownerName: d.owner_name, updatedAt: d.updated_at, comments: db.prepare("SELECT * FROM assist_comments WHERE draft_id = ? ORDER BY id").all(d.id).map(commentRow) });
  });

  app.post("/api/assist/shared/:token/comments", limiter(15 * 60_000, 20), (req, res) => {
    const d = byToken(String(req.params.token));
    if (!d) return notFound(res, "הקישור לא פעיל");
    const v = commentSchema.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM assist_comments WHERE draft_id = ?").get(d.id).c >= 100) return res.status(409).json(fail("LIMIT", "הגענו למספר התגובות המרבי בטיוטה הזו"));
    const author = v.name || optionalAuth(req)?.displayName || "אורח";
    const r = db.prepare("INSERT INTO assist_comments (draft_id, author_name, quote, body, resolved, created_at) VALUES (?,?,?,?,0,?)").run(d.id, author, v.quote || null, v.text, nowIso());
    notify(db, d.owner_id, "assist-comment", `${author} הגיב/ה על הטיוטה "${d.title}"`, `/assistant?draft=${d.id}`);
    res.status(201).json(commentRow(db.prepare("SELECT * FROM assist_comments WHERE id = ?").get(Number(r.lastInsertRowid))));
  });

  // ───── 69. שמירת הערות אחרי פעולה ─────
  app.post("/api/assist/reflections", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const v = reflectSaveSchema.parse(req.body ?? {});
    if (v.draftId && !myDraft(v.draftId, req.user.id)) return notFound(res, "הטיוטה לא נמצאה");
    let act = null;
    if (v.activityId) {
      act = getActivity(db, v.activityId);
      if (!act || (act.status !== "PUBLISHED" && act.ownerId !== req.user.id && req.user.role !== "ADMIN")) return notFound(res, "הפעולה לא נמצאה");
    }
    const parsed = parseReflection(v.text);
    const ranOn = v.ranOn || israelToday();
    const r = db
      .prepare("INSERT INTO assist_reflections (user_id, draft_id, activity_id, ran_on, group_label, body, parsed_json, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(req.user.id, v.draftId ?? null, act?.id ?? null, ranOn, v.groupLabel || null, v.text, JSON.stringify(parsed), nowIso());
    if (act) {
      db.prepare("INSERT INTO runs (activity_id, user_id, ran_on, group_label, worked, change_next, notes, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
        act.id,
        req.user.id,
        ranOn,
        v.groupLabel || null,
        parsed.worked.join(" ").slice(0, 1000) || null,
        [...parsed.change, ...parsed.ideas].join(" ").slice(0, 1000) || null,
        [...parsed.timing, ...parsed.group, ...parsed.other].join(" ").slice(0, 1000) || null,
        nowIso(),
      );
    }
    audit(db, req.user.username, "assist.reflection", { id: Number(r.lastInsertRowid), activityId: act?.id ?? null });
    res.status(201).json({ id: Number(r.lastInsertRowid), ranOn, parsed, linkedToActivity: !!act });
  });

  app.get("/api/assist/reflections", requireUser(), (req, res) => {
    const draftId = Number(req.query.draftId) || null;
    const rows = draftId
      ? db.prepare("SELECT * FROM assist_reflections WHERE user_id = ? AND draft_id = ? ORDER BY id DESC LIMIT 20").all(req.user.id, draftId)
      : db.prepare("SELECT * FROM assist_reflections WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(req.user.id);
    res.json(rows.map((r) => ({ id: r.id, ranOn: r.ran_on, groupLabel: r.group_label || "", body: r.body, parsed: JSON.parse(r.parsed_json), draftId: r.draft_id, activityId: r.activity_id })));
  });

  // ───── 70. פרופילי קבוצה ─────
  app.get("/api/me/assist-groups", requireUser(), (req, res) => {
    res.json(db.prepare("SELECT * FROM assist_groups WHERE user_id = ? ORDER BY id").all(req.user.id).map(groupRow));
  });

  app.post("/api/me/assist-groups", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const v = groupSchema.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM assist_groups WHERE user_id = ?").get(req.user.id).c >= 20) return res.status(409).json(fail("LIMIT", "אפשר עד 20 קבוצות. מחקו ישנות"));
    const r = db.prepare("INSERT INTO assist_groups (user_id, name, size, traits_json, created_at) VALUES (?,?,?,?,?)").run(req.user.id, v.name, v.size ?? null, JSON.stringify([...new Set(v.traits)]), nowIso());
    res.status(201).json(groupRow(db.prepare("SELECT * FROM assist_groups WHERE id = ?").get(Number(r.lastInsertRowid))));
  });

  app.put("/api/me/assist-groups/:id", requireUser(), (req, res) => {
    const v = groupSchema.parse(req.body ?? {});
    const r = db.prepare("UPDATE assist_groups SET name=?, size=?, traits_json=? WHERE id=? AND user_id=?").run(v.name, v.size ?? null, JSON.stringify([...new Set(v.traits)]), Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "הקבוצה לא נמצאה");
    res.json(groupRow(db.prepare("SELECT * FROM assist_groups WHERE id = ?").get(Number(req.params.id))));
  });

  app.delete("/api/me/assist-groups/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM assist_groups WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "הקבוצה לא נמצאה");
    res.json({ ok: true });
  });
}

// עוזר הכתיבה, פריטים 71–80: נקודות קצה.
import { z } from "zod";
import { getActivity } from "./activities.js";
import { buildBookletDocx } from "./docx.js";
import { draftAsActivity, growthPath, inclusionCheck, lineDiff, parentsPack, stationCards } from "./assist3.js";
import { analyzeSample, DEFAULT_STYLE, styleSchema } from "./style.js";
import { audit, nowIso } from "./db.js";
import { isRealDate, israelToday } from "./organizer.js";
import { AGE_GROUPS, GRADES, METHOD_NAMES } from "./shared/constants.js";

const text20k = z.string().max(20000).default("");
const STATUSES = ["planned", "writing", "ready", "done"];
const dateStr = z.string().refine(isRealDate, "תאריך לא תקין");

const boardCell = z.object({
  grade: z.enum(GRADES),
  week: dateStr,
  title: z.string().trim().min(2, "כתבו שם לפעולה").max(120),
  value: z.string().trim().max(160).default(""),
  status: z.enum(STATUSES).default("planned"),
  note: z.string().trim().max(300).default(""),
  draftId: z.number().int().min(1).nullable().optional(),
  activityId: z.number().int().min(1).nullable().optional(),
});

/** ראשון של השבוע שבו נופל התאריך (השבוע בישראל מתחיל ביום ראשון). */
export function weekStart(s) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const normValue = (v) => String(v || "").replace(/[֑-ׇ"'״׳]/g, "").trim();

export function registerAssist3Routes(app, { db, limiter, fail, requireUser, optionalAuth }) {
  const notFound = (res, what = "לא נמצא") => res.status(404).json(fail("NOT_FOUND", what));
  const myDraft = (id, userId) => db.prepare("SELECT * FROM assist_drafts WHERE id = ? AND owner_id = ?").get(id, userId);

  // ───── 71. למידת הסגנון שלי מהטיוטה ─────
  const savedStyle = (userId) => {
    const raw = userId ? db.prepare("SELECT style_json FROM users WHERE id = ?").get(userId)?.style_json : null;
    try {
      return styleSchema.parse(raw ? JSON.parse(raw) : undefined);
    } catch {
      return DEFAULT_STYLE;
    }
  };
  const styleDiff = (cur, next) => Object.keys(next).filter((k) => cur[k] !== next[k]);

  app.post("/api/assist/learn-style", limiter(60_000, 30), (req, res) => {
    const { text } = z.object({ text: text20k }).parse(req.body ?? {});
    const r = analyzeSample(text);
    if (!r.ok) return res.json(r);
    const who = optionalAuth(req);
    const current = savedStyle(who?.id);
    res.json({ ...r, signedIn: !!who, current: { tone: current.tone, address: current.address, length: current.length, detail: current.detail, slang: current.slang }, changes: styleDiff(current, r.suggested) });
  });

  app.put("/api/assist/learn-style", requireUser(), limiter(15 * 60_000, 30), (req, res) => {
    const { text } = z.object({ text: z.string().min(40, "הטיוטה קצרה מדי ללמידה").max(20000) }).parse(req.body ?? {});
    const r = analyzeSample(text);
    if (!r.ok) return res.status(400).json(fail("TOO_SHORT", r.reason));
    const cur = savedStyle(req.user.id);
    const style = styleSchema.parse({ ...cur, ...r.suggested, sample: text.slice(0, 12000) });
    db.prepare("UPDATE users SET style_json = ? WHERE id = ?").run(JSON.stringify(style), req.user.id);
    audit(db, req.user.username, "assist.learn-style", { changes: styleDiff(cur, r.suggested) });
    res.json({ style: { tone: style.tone, address: style.address, length: style.length, detail: style.detail, slang: style.slang }, traits: r.traits });
  });

  // ───── 73. הכלה ─────
  app.post("/api/assist/inclusion", limiter(60_000, 40), (req, res) => {
    res.json(inclusionCheck(z.object({ text: text20k }).parse(req.body ?? {}).text));
  });

  // ───── 74. חבילת הורים ─────
  app.post("/api/assist/parents", limiter(60_000, 40), (req, res) => {
    const v = z
      .object({
        text: z.string().min(20, "הטיוטה קצרה מדי").max(20000),
        ageGroup: z.enum(AGE_GROUPS).optional(),
        date: z.union([dateStr, z.literal("")]).default(""),
        time: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).default(""),
        place: z.string().trim().max(60).default(""),
      })
      .parse(req.body ?? {});
    const who = optionalAuth(req);
    res.json(parentsPack(v.text, { ageGroup: v.ageGroup, author: who?.displayName || who?.username || "", date: v.date, time: v.time, place: v.place }));
  });

  // ───── 79. כרטיסי תחנות ─────
  app.post("/api/assist/stations", limiter(60_000, 40), (req, res) => {
    const v = z.object({ text: text20k, count: z.number().int().min(2).max(8).default(4) }).parse(req.body ?? {});
    res.json(stationCards(v.text, v.count));
  });

  // ───── 75. היסטוריית גרסאות של טיוטה בענן ─────
  app.get("/api/assist/drafts/:id/versions", requireUser(), (req, res) => {
    const d = myDraft(Number(req.params.id), req.user.id);
    if (!d) return notFound(res, "הטיוטה לא נמצאה");
    const rows = db.prepare("SELECT * FROM assist_draft_versions WHERE draft_id = ? ORDER BY id DESC LIMIT 30").all(d.id);
    res.json(rows.map((v) => ({ id: v.id, savedAt: v.saved_at, note: v.note || "", diff: lineDiff(v.text, d.text) })));
  });

  app.get("/api/assist/drafts/:id/versions/:vid", requireUser(), (req, res) => {
    const d = myDraft(Number(req.params.id), req.user.id);
    const v = d && db.prepare("SELECT * FROM assist_draft_versions WHERE id = ? AND draft_id = ?").get(Number(req.params.vid), d.id);
    if (!v) return notFound(res, "הגרסה לא נמצאה");
    res.json({ id: v.id, savedAt: v.saved_at, text: v.text, diff: lineDiff(v.text, d.text) });
  });

  app.post("/api/assist/drafts/:id/versions/:vid/restore", requireUser(), (req, res) => {
    const d = myDraft(Number(req.params.id), req.user.id);
    const v = d && db.prepare("SELECT * FROM assist_draft_versions WHERE id = ? AND draft_id = ?").get(Number(req.params.vid), d.id);
    if (!v) return notFound(res, "הגרסה לא נמצאה");
    const t = nowIso();
    if (d.text !== v.text) db.prepare("INSERT INTO assist_draft_versions (draft_id, text, note, saved_at) VALUES (?,?,?,?)").run(d.id, d.text, "לפני שחזור", t);
    db.prepare("UPDATE assist_drafts SET text = ?, updated_at = ? WHERE id = ?").run(v.text, t, d.id);
    audit(db, req.user.username, "assist.restore", { id: d.id, version: v.id });
    res.json({ id: d.id, text: v.text });
  });

  // ───── 76. לוח תכנון לפי שכבות ─────
  app.get("/api/assist/board", requireUser(), (req, res) => {
    const q = z.object({ from: dateStr.optional(), weeks: z.coerce.number().int().min(1).max(12).default(8) }).parse(req.query);
    const start = weekStart(q.from || israelToday());
    const weeks = Array.from({ length: q.weeks }, (_, i) => addDays(start, i * 7));
    const rows = db.prepare("SELECT * FROM assist_board WHERE user_id = ? AND week >= ? AND week <= ? ORDER BY week").all(req.user.id, weeks[0], weeks[weeks.length - 1]);
    const cells = rows.map((r) => ({ grade: r.grade, week: r.week, title: r.title, value: r.value || "", status: r.status, note: r.note || "", draftId: r.draft_id, activityId: r.activity_id }));
    const warnings = [];
    for (const g of GRADES) {
      const mine = cells.filter((c) => c.grade === g);
      if (!mine.length) continue;
      for (let i = 0; i < mine.length; i++) {
        for (let j = i + 1; j < mine.length; j++) {
          const gap = (Date.parse(mine[j].week) - Date.parse(mine[i].week)) / (7 * 86400000);
          if (gap <= 3 && normValue(mine[i].value) && normValue(mine[i].value) === normValue(mine[j].value)) warnings.push(`בשכבה ${g} הערך "${mine[i].value}" חוזר בשבועות ${mine[i].week} ו-${mine[j].week}.`);
        }
      }
      const empty = weeks.length - mine.length;
      if (empty >= Math.ceil(weeks.length / 2)) warnings.push(`בשכבה ${g} אין פעולה מתוכננת ב-${empty} שבועות מתוך ${weeks.length}.`);
    }
    res.json({ from: weeks[0], weeks, grades: GRADES, statuses: STATUSES, cells, warnings: warnings.slice(0, 10) });
  });

  app.put("/api/assist/board/cell", requireUser(), limiter(15 * 60_000, 200), (req, res) => {
    const v = boardCell.parse(req.body ?? {});
    const week = weekStart(v.week);
    if (v.draftId && !myDraft(v.draftId, req.user.id)) return notFound(res, "הטיוטה לא נמצאה");
    if (v.activityId && !getActivity(db, v.activityId)) return notFound(res, "הפעולה לא נמצאה");
    const exists = db.prepare("SELECT id FROM assist_board WHERE user_id = ? AND grade = ? AND week = ?").get(req.user.id, v.grade, week);
    if (!exists && db.prepare("SELECT COUNT(*) AS c FROM assist_board WHERE user_id = ?").get(req.user.id).c >= 400) return res.status(409).json(fail("LIMIT", "אפשר עד 400 תאים בלוח. מחקו ישנים"));
    db.prepare(
      `INSERT INTO assist_board (user_id, grade, week, title, value, status, note, draft_id, activity_id, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, grade, week) DO UPDATE SET title=excluded.title, value=excluded.value, status=excluded.status, note=excluded.note, draft_id=excluded.draft_id, activity_id=excluded.activity_id, updated_at=excluded.updated_at`,
    ).run(req.user.id, v.grade, week, v.title, v.value || null, v.status, v.note || null, v.draftId ?? null, v.activityId ?? null, nowIso());
    res.json({ grade: v.grade, week, title: v.title, value: v.value, status: v.status, note: v.note, draftId: v.draftId ?? null, activityId: v.activityId ?? null });
  });

  app.delete("/api/assist/board/cell", requireUser(), (req, res) => {
    const q = z.object({ grade: z.enum(GRADES), week: dateStr }).parse(req.query);
    const r = db.prepare("DELETE FROM assist_board WHERE user_id = ? AND grade = ? AND week = ?").run(req.user.id, q.grade, weekStart(q.week));
    if (!r.changes) return notFound(res, "התא לא נמצא");
    res.json({ ok: true });
  });

  // ───── 78. חוברת מטיוטות ופעולות ─────
  app.post("/api/assist/booklet", requireUser(), limiter(15 * 60_000, 20), async (req, res) => {
    const v = z
      .object({
        draftIds: z.array(z.number().int().min(1)).max(40).default([]),
        activityIds: z.array(z.number().int().min(1)).max(40).default([]),
        title: z.string().trim().max(120).default(""),
        ageGroup: z.enum(AGE_GROUPS).optional(),
      })
      .parse(req.body ?? {});
    if (v.draftIds.length + v.activityIds.length === 0) return res.status(400).json(fail("EMPTY", "בחרו לפחות טיוטה או פעולה אחת"));
    const author = req.user.username;
    const list = [];
    for (const id of v.draftIds) {
      const d = myDraft(id, req.user.id);
      if (d) list.push(draftAsActivity(d.text, { ageGroup: d.age_group || v.ageGroup || "", author }));
    }
    for (const id of v.activityIds) {
      const a = getActivity(db, id);
      if (a && (a.status === "PUBLISHED" || a.ownerId === req.user.id || req.user.role === "ADMIN")) list.push(a);
    }
    if (!list.length) return notFound(res, "לא נמצאו פריטים לחוברת");
    const buf = await buildBookletDocx(
      list.map(({ analysis, ...a }) => a),
      v.title,
    );
    audit(db, req.user.username, "assist.booklet", { items: list.length });
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": 'attachment; filename="booklet.docx"' });
    res.send(buf);
  });

  // ───── 80. מסלול צמיחה ─────
  app.get("/api/assist/growth", requireUser(), (req, res) => {
    const uid = req.user.id;
    const one = (sql, ...args) => db.prepare(sql).get(...args).c;
    const owned = db.prepare("SELECT methods_json, tags_json, conclusion_note FROM activities WHERE owner_id = ? AND status != 'ARCHIVED'").all(uid);
    const used = new Set();
    for (const r of owned) {
      try {
        for (const m of JSON.parse(r.methods_json)) if (METHOD_NAMES.includes(m.name)) used.add(m.name);
      } catch {
        /* שורה פגומה */
      }
    }
    const reflections = one("SELECT COUNT(*) AS c FROM assist_reflections WHERE user_id = ?", uid);
    const reflectionsLinked = one("SELECT COUNT(*) AS c FROM assist_reflections WHERE user_id = ? AND activity_id IS NOT NULL", uid);
    const runs = one("SELECT COUNT(*) AS c FROM runs WHERE user_id = ?", uid);
    res.json(
      growthPath({
        activities: owned.length,
        completeActivities: owned.filter((r) => !(JSON.parse(r.tags_json || "[]") || []).includes("טיוטה")).length,
        withPlanB: owned.filter((r) => /תוכנית ב/.test(r.conclusion_note || "")).length,
        reflections,
        runs: Math.max(0, runs - reflectionsLinked),
        commentsReceived: one("SELECT COUNT(*) AS c FROM assist_comments c JOIN assist_drafts d ON d.id = c.draft_id WHERE d.owner_id = ?", uid),
        methodsUsed: [...used],
      }),
    );
  });
}

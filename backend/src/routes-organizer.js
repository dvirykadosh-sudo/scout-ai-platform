// נקודות קצה לסבב ה"ו (פריטים 25–33): חיפוש מתקדם, מה יש בארון, מצב מהיר, יומן ותזכורות,
// שיתוף עריכה, ווטסאפ, ומדריך חדש.
import { z } from "zod";
import { getActivity, rowToActivity, suggestTerms } from "./activities.js";
import { audit, nowIso } from "./db.js";
import { GEAR_GROUPS, matchCupboard } from "./gear.js";
import {
  GLOSSARY,
  NEWBIE_JOURNEY,
  SCHEDULE_SELECT,
  WHATSAPP_MODES,
  brief,
  buildIcs,
  computeReminders,
  israelToday,
  isRealDate,
  newbieTips,
  quickPick,
  scheduleRow,
  whatsappText,
} from "./organizer.js";
import { AGE_GROUPS } from "./shared/constants.js";
import { KIND_IDS } from "./kinds.js";
import { notify } from "./notify.js";
import { config } from "./config.js";

const text = (max) => z.string().trim().max(max);
const GEAR_IDS = GEAR_GROUPS.map((g) => g.id);
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const cupboardSchema = z.object({
  have: z.array(z.enum(GEAR_IDS)).max(GEAR_IDS.length).default([]),
  extra: text(200).default(""),
  age: z.enum(AGE_GROUPS).optional(),
  maxMinutes: z.coerce.number().int().min(5).max(300).optional(),
  kind: z.enum(KIND_IDS).optional(),
  allowMissing: z.coerce.number().int().min(0).max(3).default(1),
});

const quickSchema = z.object({
  age: z.enum(AGE_GROUPS).optional(),
  minutes: z.coerce.number().int().min(5).max(180).optional(),
  minimalGear: z.enum(["1"]).optional(),
  energetic: z.enum(["1"]).optional(),
  skip: z.string().regex(/^\d{1,9}(,\d{1,9}){0,49}$/).optional(),
  seed: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

const scheduleBase = z.object({
  activityId: z.number().int().min(1).nullable().optional(),
  title: text(120).optional(),
  date: z.string().refine(isRealDate, "תאריך לא תקין"),
  time: z.union([z.string().regex(timeRe, "שעה לא תקינה"), z.literal("")]).optional(),
  durationMin: z.number().int().min(5).max(600).nullable().optional(),
  groupLabel: text(60).optional(),
  note: text(300).optional(),
  remindDays: z.number().int().min(0).max(14).nullable().optional(),
});
const scheduleCreate = scheduleBase.refine((v) => v.activityId || (v.title && v.title.length >= 2), { message: "בחרו פעולה מהמאגר או כתבו שם לאירוע", path: ["title"] });

const waSchema = z.object({
  mode: z.enum(["staff", "kids", "parents", "full"]).default("staff"),
  date: z.string().refine((s) => s === "" || isRealDate(s), "תאריך לא תקין").default(""),
  time: z.union([z.string().regex(timeRe), z.literal("")]).default(""),
  place: text(60).default(""),
});

export function registerOrganizerRoutes(app, { db, limiter, fail, requireUser, optionalAuth, canOwn, isCollaborator }) {
  const notFound = (res, what = "הפעולה לא נמצאה") => res.status(404).json(fail("NOT_FOUND", what));
  const published = () => db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);

  // ── 25. השלמה אוטומטית בחיפוש ──
  app.get("/api/search/suggest", (req, res) => res.json(suggestTerms(db, String(req.query.q || ""))));

  // ── 26. מה יש בארון ──
  app.get("/api/gear", (req, res) => res.json(GEAR_GROUPS.map(({ id, label }) => ({ id, label }))));
  app.post("/api/by-equipment", limiter(15 * 60_000, 120), (req, res) => {
    const v = cupboardSchema.parse(req.body ?? {});
    let rows = published();
    if (v.age) rows = rows.filter((a) => a.ageGroup === v.age || a.ageGroup.split(" - ")[0] === v.age.split(" - ")[0]);
    if (v.maxMinutes) rows = rows.filter((a) => a.durationMin <= v.maxMinutes);
    if (v.kind) rows = rows.filter((a) => a.kind === v.kind);
    const all = rows.map((a) => ({ a, m: matchCupboard(a.equipment, v.have, v.extra) }));
    const fits = all.filter((x) => x.m.missing.length <= v.allowMissing).sort((x, y) => x.m.missing.length - y.m.missing.length || x.a.durationMin - y.a.durationMin || x.a.id - y.a.id);
    // מה כדאי להשיג: פריט שחסר בפעולות שחסר להן רק הוא
    const unlock = new Map();
    for (const x of all) if (x.m.missing.length === 1) unlock.set(x.m.missing[0], (unlock.get(x.m.missing[0]) || 0) + 1);
    res.json({
      total: fits.length,
      items: fits.slice(0, 30).map((x) => brief(x.a, { missing: x.m.missing, optionalMissing: x.m.optionalMissing, ready: x.m.missing.length === 0 })),
      unlocks: [...unlock.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0], "he")).slice(0, 5).map(([item, count]) => ({ item, count })),
    });
  });

  // ── 27. מצב מהיר ──
  app.get("/api/quick", limiter(15 * 60_000, 200), (req, res) => {
    const q = quickSchema.parse(req.query);
    res.json(
      quickPick(db, {
        age: q.age,
        minutes: q.minutes,
        minimalGear: q.minimalGear === "1",
        energetic: q.energetic === "1",
        skip: q.skip ? q.skip.split(",").map(Number) : [],
        seed: q.seed,
        userId: optionalAuth(req)?.id ?? null,
      }),
    );
  });

  // ── 28, 29. יומן ותזכורות ──
  const mySchedule = (id, userId) => db.prepare(`${SCHEDULE_SELECT} WHERE s.id = ? AND s.user_id = ?`).get(id, userId);

  app.get("/api/me/schedule", requireUser(), (req, res) => {
    const from = isRealDate(String(req.query.from)) ? String(req.query.from) : "0000-01-01";
    const to = isRealDate(String(req.query.to)) ? String(req.query.to) : "9999-12-31";
    const rows = db.prepare(`${SCHEDULE_SELECT} WHERE s.user_id = ? AND s.date >= ? AND s.date <= ? ORDER BY s.date, s.time, s.id LIMIT 500`).all(req.user.id, from, to);
    res.json(rows.map(scheduleRow));
  });

  app.post("/api/me/schedule", requireUser(), limiter(15 * 60_000, 120), (req, res) => {
    const v = scheduleCreate.parse(req.body ?? {});
    if (v.activityId && !getActivity(db, v.activityId)) return notFound(res);
    if (db.prepare("SELECT COUNT(*) AS c FROM schedule WHERE user_id = ?").get(req.user.id).c >= 500) return res.status(409).json(fail("LIMIT", "אפשר עד 500 אירועים ביומן. מחקו ישנים"));
    const r = db
      .prepare("INSERT INTO schedule (user_id, activity_id, title, date, time, duration_min, group_label, note, remind_days, dismissed, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)")
      .run(req.user.id, v.activityId ?? null, v.title || null, v.date, v.time || null, v.durationMin ?? null, v.groupLabel || null, v.note || null, v.remindDays ?? null, nowIso());
    audit(db, req.user.username, "schedule.add", { id: Number(r.lastInsertRowid), date: v.date });
    res.status(201).json(scheduleRow(mySchedule(Number(r.lastInsertRowid), req.user.id)));
  });

  app.patch("/api/me/schedule/:id", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const cur = mySchedule(id, req.user.id);
    if (!cur) return notFound(res, "האירוע לא נמצא");
    const p = scheduleBase.partial().parse(req.body ?? {});
    if (p.activityId && !getActivity(db, p.activityId)) return notFound(res);
    const next = {
      activity_id: p.activityId !== undefined ? p.activityId : cur.activity_id,
      title: p.title !== undefined ? p.title || null : cur.title,
      date: p.date ?? cur.date,
      time: p.time !== undefined ? p.time || null : cur.time,
      duration_min: p.durationMin !== undefined ? p.durationMin : cur.duration_min,
      group_label: p.groupLabel !== undefined ? p.groupLabel || null : cur.group_label,
      note: p.note !== undefined ? p.note || null : cur.note,
      remind_days: p.remindDays !== undefined ? p.remindDays : cur.remind_days,
    };
    if (!next.activity_id && !(next.title && next.title.length >= 2)) return res.status(400).json(fail("VALIDATION", "בחרו פעולה מהמאגר או כתבו שם לאירוע"));
    // שינוי תאריך או תזכורת מחזיר את התזכורת לפעולה
    const reset = p.date !== undefined || p.remindDays !== undefined;
    db.prepare("UPDATE schedule SET activity_id=?, title=?, date=?, time=?, duration_min=?, group_label=?, note=?, remind_days=?, dismissed = CASE WHEN ? THEN 0 ELSE dismissed END WHERE id=? AND user_id=?").run(
      next.activity_id ?? null, next.title, next.date, next.time, next.duration_min ?? null, next.group_label, next.note, next.remind_days ?? null, reset ? 1 : 0, id, req.user.id,
    );
    res.json(scheduleRow(mySchedule(id, req.user.id)));
  });

  app.delete("/api/me/schedule/:id", requireUser(), (req, res) => {
    const r = db.prepare("DELETE FROM schedule WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "האירוע לא נמצא");
    res.json({ ok: true });
  });

  app.get("/api/me/reminders", requireUser(), (req, res) => {
    const today = isRealDate(String(req.query.today)) ? String(req.query.today) : israelToday();
    res.json({ today, items: computeReminders(db, req.user.id, today) });
  });

  app.post("/api/me/reminders/:id/dismiss", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const cur = mySchedule(id, req.user.id);
    if (!cur) return notFound(res, "התזכורת לא נמצאה");
    // "הוכן" סוגר רק את תזכורת ההכנה, ו"תועד" סוגר גם את התזכורת לתעד
    const level = req.body?.type === "log" ? 2 : 1;
    db.prepare("UPDATE schedule SET dismissed = MAX(dismissed, ?) WHERE id = ?").run(level, id);
    res.json({ ok: true });
  });

  app.get("/api/me/schedule.ics", requireUser(), (req, res) => {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const rows = db.prepare(`${SCHEDULE_SELECT} WHERE s.user_id = ? AND s.date >= ? ORDER BY s.date, s.time LIMIT 500`).all(req.user.id, from).map(scheduleRow);
    const origin = config.publicUrl || `${req.protocol}://${req.get("host")}`;
    res
      .set({ "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="shevet-maoz-schedule.ics"', "Cache-Control": "no-store" })
      .send(buildIcs(rows, { origin }));
  });

  // ── 30. שיתוף עריכה ──
  const collabRows = (id) =>
    db
      .prepare("SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS displayName, c.added_by AS addedBy, c.added_at AS addedAt FROM activity_collaborators c JOIN users u ON u.id = c.user_id WHERE c.activity_id = ? ORDER BY c.added_at")
      .all(id);

  app.get("/api/activities/:id/access", (req, res) => {
    const a = getActivity(db, Number(req.params.id), { includeArchived: true });
    if (!a) return notFound(res);
    const user = optionalAuth(req);
    const owner = !!user && canOwn(user, a);
    const collab = !!user && !owner && isCollaborator(user, a);
    const last = db.prepare("SELECT actor, at FROM audit_log WHERE action = 'activity.update' AND details LIKE ? ORDER BY id DESC LIMIT 1").get(`{"id":${a.id},%`);
    res.json({
      canEdit: owner || collab,
      canDelete: owner,
      isOwner: owner,
      isCollaborator: collab,
      collaborators: owner || collab ? collabRows(a.id) : [],
      lastEditor: last ? { name: last.actor, at: last.at } : null,
    });
  });

  app.post("/api/activities/:id/collaborators", requireUser(), limiter(15 * 60_000, 60), (req, res) => {
    const a = getActivity(db, Number(req.params.id), { includeArchived: true });
    if (!a) return notFound(res);
    if (!canOwn(req.user, a)) return res.status(403).json(fail("FORBIDDEN", "רק מי שיצר את הפעולה (או אדמין) מוסיף שותפים לעריכה"));
    if (a.isSeed) return res.status(400).json(fail("SEED", "פעולה מובנית של המערכת לא משותפת לעריכה. שכפלו אותה קודם"));
    const { username } = z.object({ username: text(60).min(1, "יש להזין שם משתמש") }).parse(req.body ?? {});
    const u = db.prepare("SELECT id, username, disabled FROM users WHERE lower(username) = lower(?)").get(username);
    if (!u || u.disabled) return res.status(404).json(fail("NO_USER", "לא נמצא משתמש פעיל בשם הזה. בקשו מהמדריך/ה לוודא את שם המשתמש"));
    if (u.id === a.ownerId || u.id === req.user.id) return res.status(400).json(fail("SELF", "המשתמש הזה כבר הבעלים של הפעולה"));
    if (db.prepare("SELECT COUNT(*) AS c FROM activity_collaborators WHERE activity_id = ?").get(a.id).c >= 5) return res.status(409).json(fail("LIMIT", "אפשר עד 5 שותפים לעריכה בפעולה"));
    db.prepare("INSERT OR IGNORE INTO activity_collaborators (activity_id, user_id, added_by, added_at) VALUES (?,?,?,?)").run(a.id, u.id, req.user.username, nowIso());
    notify(db, u.id, "collab", `${req.user.username} שיתף/ה איתך את הפעולה "${a.title}" לעריכה`, `/library/${a.id}`);
    audit(db, req.user.username, "collab.add", { id: a.id, user: u.username });
    res.status(201).json(collabRows(a.id));
  });

  app.delete("/api/activities/:id/collaborators/:userId", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id), { includeArchived: true });
    if (!a) return notFound(res);
    const uid = Number(req.params.userId);
    // הבעלים מסיר שותף, ושותף יכול לעזוב בעצמו
    if (!canOwn(req.user, a) && uid !== req.user.id) return res.status(403).json(fail("FORBIDDEN", "אין הרשאה להסיר שותף"));
    db.prepare("DELETE FROM activity_collaborators WHERE activity_id = ? AND user_id = ?").run(a.id, uid);
    audit(db, req.user.username, "collab.remove", { id: a.id, userId: uid });
    res.json(collabRows(a.id));
  });

  app.get("/api/me/shared", requireUser(), (req, res) => {
    const rows = db
      .prepare("SELECT a.* FROM activities a JOIN activity_collaborators c ON c.activity_id = a.id WHERE c.user_id = ? AND a.status != 'ARCHIVED' ORDER BY a.updated_at DESC LIMIT 100")
      .all(req.user.id);
    res.json(rows.map(rowToActivity));
  });

  // ── 31. ווטסאפ ──
  app.get("/api/activities/:id/whatsapp", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    const v = waSchema.parse(req.query);
    res.json({ modes: WHATSAPP_MODES, mode: v.mode, text: whatsappText(a, v) });
  });

  // ── 33. מדריך חדש ──
  app.get("/api/newbie/guide", (req, res) => res.json({ journey: NEWBIE_JOURNEY, glossary: GLOSSARY }));
  app.get("/api/activities/:id/newbie", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    res.json(newbieTips(a));
  });
}

// שלב 74: נקודות הקצה של מחולל הפעולות והמאגר (ציון איכות, התאמה לגיל, יעד מדיד, כפילויות, בטיחות מורחבת, פרטיות, נגישות,
// התאמה לכמה תנאים, פעולה לשכבה אחרת, השוואה, הבדלי גרסאות, חיפושים שמורים בשרת, מה עבד לי, מגוון, כיסוי חגים).
// הלוגיקה נמצאת ב-lab74.js, ב-access-tags.js וב-privacy-scan.js. כאן רק הרשאות, אימות קלט ושמירה.
import { z } from "zod";
import { getActivity, insertActivity, searchActivities, snapshotOf, updateActivity } from "./activities.js";
import { apportion } from "./ai.js";
import { audit, nowIso } from "./db.js";
import { newActivityStatus } from "./routes-extra.js";
import { AGE_GROUPS } from "./shared/constants.js";
import { listQuerySchema } from "./validate.js";
import { ACCESS_TAGS, accessTags } from "./access-tags.js";
import { privacyScan, redactActivity } from "./privacy-scan.js";
import { isRealDate, israelToday } from "./organizer.js";
import { adaptMany, ageAdaptedStages, ageFit, compareActivities, conditionList, diversity, findDuplicates, holidayCoverage, importReport, measurableGoal, qualityReport, safetyScan, snapshotDiff, tagSuggestions, workedForMe } from "./lab74.js";

const text = (max) => z.string().trim().max(max);
const MAX_SAVED = 20;

const dupBody = z
  .object({
    title: text(120).min(2, "יש להזין שם לפעולה"),
    leadingValue: text(160).default(""),
    tags: z.array(text(40)).max(20).default([]),
    stages: z.array(z.object({ content: z.string().max(3000) }).strict()).max(5).default([]),
    exceptId: z.number().int().min(1).optional(),
  })
  .strict();

const importReportBody = z
  .object({
    title: text(120).min(1),
    ageGroup: text(60).default(""),
    leadingValue: text(160).default(""),
    equipment: text(500).default(""),
    safetyNotes: text(1000).default(""),
    stages: z.array(z.object({ name: text(60), minutes: z.coerce.number().int().min(0).max(180), content: z.string().max(3000) }).strict()).min(1).max(5),
  })
  .strict();

const adaptBody = z.object({ conditions: z.array(z.string().max(20)).min(1).max(3) }).strict();
const forGroupBody = z
  .object({
    ageGroup: z.enum(AGE_GROUPS, { error: "יש לבחור שכבת גיל מהרשימה" }),
    participants: z.coerce.number().int().min(1).max(200).optional(),
    durationMin: z.coerce.number().int().min(5).max(180).optional(),
    title: text(120).optional(),
  })
  .strict();
const savedBody = z.object({ name: text(40).min(1, "יש לתת שם לחיפוש"), qs: text(500) }).strict();
const savedImportBody = z.object({ items: z.array(savedBody).max(8) }).strict();

/** מנרמל מחרוזת חיפוש: רק מסננים תקינים של המאגר, בלי עמוד, בלי מזהים ובלי שדות זרים. מחזיר { qs, filters } או null. */
export function normalizeSavedQuery(qs) {
  const sp = new URLSearchParams(String(qs ?? "").replace(/^\?/, ""));
  const obj = {};
  for (const [k, v] of sp) if (!["page", "pageSize", "ids", "since"].includes(k)) obj[k] = v;
  const r = listQuerySchema.safeParse(obj);
  if (!r.success || !Object.keys(r.data).length) return null;
  const clean = new URLSearchParams(Object.entries(r.data).map(([k, v]) => [k, String(v)])).toString();
  return { qs: clean, filters: r.data };
}

export function registerLab74Routes(app, { db, limiter, fail, requireUser, optionalAuth, canManage, forbidden, saveVersion }) {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    qs TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, qs)
  );
  CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, id);`);

  const lim = limiter(60_000, 90);
  const limWrite = limiter(15 * 60_000, 60);
  const notFound = (res, m = "הפעולה לא נמצאה") => res.status(404).json(fail("NOT_FOUND", m));
  const load = (req, res, opts) => {
    const a = getActivity(db, Number(req.params.id), opts);
    if (!a) notFound(res);
    return a;
  };

  // ממוצע הציון של 60 הפעולות האחרונות במאגר, לצורך השוואה. נשמר בזיכרון עד שהמאגר משתנה.
  let avgCache = { key: "", at: 0, value: null };
  const libraryAverage = () => {
    const m = db.prepare("SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM activities WHERE status = 'PUBLISHED'").get();
    const key = `${m.c}|${m.u}`;
    if (avgCache.key === key && Date.now() - avgCache.at < 5 * 60_000) return avgCache.value;
    const rows = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED' ORDER BY id DESC LIMIT 60").all();
    const scores = rows.map((r) => qualityReport(getActivity(db, r.id)).overall);
    const value = scores.length >= 5 ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null;
    avgCache = { key, at: Date.now(), value };
    return value;
  };

  // ── 1, 2. ציון איכות מפורט ו"למה הפעולה הזאת" ──
  app.get("/api/activities/:id/quality-report", lim, (req, res) => {
    const a = load(req, res);
    if (!a) return;
    const rat = db.prepare("SELECT COUNT(*) AS c, AVG(stars) AS avg FROM ratings WHERE activity_id = ?").get(a.id);
    const runCount = db.prepare("SELECT COUNT(*) AS c FROM runs WHERE activity_id = ?").get(a.id).c;
    res.json(qualityReport(a, { libraryAverage: libraryAverage(), rating: { count: rat.c, average: rat.c ? Math.round(rat.avg * 10) / 10 : 0 }, runCount }));
  });

  // ── 3. כפילויות לפני שמירה ──
  app.post("/api/activities/check-duplicate", limiter(15 * 60_000, 120), (req, res) => {
    const v = dupBody.parse(req.body ?? {});
    res.set("Cache-Control", "no-store").json(findDuplicates(db, v, { exceptId: v.exceptId ?? null }));
  });

  // ── 5. התאמה לגיל ──
  app.get("/api/activities/:id/age-fit", lim, (req, res) => {
    const a = load(req, res);
    if (a) res.json(ageFit(a));
  });

  // ── 6. יעד חינוכי מדיד ──
  app.get("/api/activities/:id/goal", lim, (req, res) => {
    const a = load(req, res);
    if (a) res.json(measurableGoal(a));
  });

  // ── 7. התאמה לכמה תנאים ──
  app.get("/api/adapt/conditions-all", (req, res) => res.json(conditionList()));
  app.post("/api/activities/:id/adapt-multi", limWrite, (req, res) => {
    const src = load(req, res);
    if (!src) return;
    const { conditions } = adaptBody.parse(req.body ?? {});
    let copy;
    try {
      copy = adaptMany(src, conditions);
    } catch (e) {
      return res.status(e.status || 400).json(fail("VALIDATION", e.message));
    }
    const who = optionalAuth(req);
    const { applied, trimmed, ...fields } = copy;
    const id = insertActivity(db, { ...src, ...fields, isSeed: false, ownerId: who?.id ?? null, status: newActivityStatus(db, who) });
    audit(db, who?.username, "activity.adaptMulti", { from: src.id, id, conditions });
    res.status(201).json({ ...getActivity(db, id), adaptation: { applied, trimmed } });
  });

  // ── 9. סריקת בטיחות מורחבת ──
  app.get("/api/activities/:id/safety-scan", lim, (req, res) => {
    const a = load(req, res);
    if (a) res.json(safetyScan(a));
  });
  app.post("/api/activities/:id/safety-scan/apply", requireUser(), limWrite, (req, res) => {
    const a = load(req, res, { includeArchived: true });
    if (!a) return;
    if (!canManage(req.user, a)) return forbidden(res);
    const { addition } = safetyScan(a);
    if (!addition) return res.status(409).json(fail("NOTHING", "אין הנחיות חסרות להוסיף"));
    saveVersion(a.id, a, req.user.username, "לפני הוספת הנחיות מסריקת הבטיחות");
    updateActivity(db, a.id, { ...a, safetyNotes: `${a.safetyNotes} ${addition}`.trim().slice(0, 1000) });
    audit(db, req.user.username, "activity.safetyScanApply", { id: a.id });
    res.json(getActivity(db, a.id, { includeArchived: true }));
  });

  // ── 19. תגיות נגישות ──
  app.get("/api/access-tags", (req, res) => res.json(ACCESS_TAGS.map(({ id, label }) => ({ id, label }))));
  app.get("/api/activities/:id/access-tags", lim, (req, res) => {
    const a = load(req, res);
    if (a) res.json(accessTags(a));
  });

  // ── 20. סריקת פרטיות והסרה ──
  app.get("/api/activities/:id/privacy", requireUser(), lim, (req, res) => {
    const a = load(req, res, { includeArchived: true });
    if (!a) return;
    if (!canManage(req.user, a)) return forbidden(res);
    res.set("Cache-Control", "no-store").json(privacyScan(a));
  });
  app.post("/api/activities/:id/privacy/redact", requireUser(), limWrite, (req, res) => {
    const a = load(req, res, { includeArchived: true });
    if (!a) return;
    if (!canManage(req.user, a)) return forbidden(res);
    const { patch, changed } = redactActivity(a);
    if (!changed) return res.status(409).json(fail("NOTHING", "לא נמצא מה להסיר אוטומטית"));
    saveVersion(a.id, a, req.user.username, "לפני הסרת פרטים אישיים");
    updateActivity(db, a.id, { ...a, ...patch });
    audit(db, req.user.username, "activity.privacyRedact", { id: a.id, fields: changed });
    res.json(getActivity(db, a.id, { includeArchived: true }));
  });

  // ── 10. הצעות תגיות אישיות ──
  app.get("/api/activities/:id/tag-suggestions", requireUser(), lim, (req, res) => {
    const a = load(req, res);
    if (!a) return;
    const mine = db.prepare("SELECT tag, COUNT(*) AS count FROM activity_tags WHERE user_id = ? GROUP BY tag ORDER BY count DESC, tag LIMIT 40").all(req.user.id);
    const current = db.prepare("SELECT tag FROM activity_tags WHERE user_id = ? AND activity_id = ?").all(req.user.id, a.id).map((r) => r.tag);
    res.set("Cache-Control", "no-store").json(tagSuggestions(a, mine, { current }));
  });

  // ── 11. חיפושים שמורים בחשבון ──
  const savedRow = (r, fresh) => ({ id: r.id, name: r.name, qs: r.qs, createdAt: r.created_at, lastSeenAt: r.last_seen_at, fresh });
  const freshCount = (row) => {
    const n = normalizeSavedQuery(row.qs);
    return n ? searchActivities(db, { ...n.filters, since: row.last_seen_at, page: 1, pageSize: 1 }).total : 0;
  };
  app.get("/api/me/saved-searches", requireUser(), lim, (req, res) => {
    const rows = db.prepare("SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(req.user.id, MAX_SAVED);
    res.set("Cache-Control", "no-store").json(rows.map((r) => savedRow(r, freshCount(r))));
  });
  const addSaved = (userId, name, qs) => {
    const n = normalizeSavedQuery(qs);
    if (!n) return { error: "החיפוש ריק או לא תקין" };
    const had = db.prepare("SELECT * FROM saved_searches WHERE user_id = ? AND qs = ?").get(userId, n.qs);
    if (had) return { row: had, existing: true };
    if (db.prepare("SELECT COUNT(*) AS c FROM saved_searches WHERE user_id = ?").get(userId).c >= MAX_SAVED) return { error: `אפשר לשמור עד ${MAX_SAVED} חיפושים`, limit: true };
    const t = nowIso();
    const id = db.prepare("INSERT INTO saved_searches (user_id, name, qs, last_seen_at, created_at) VALUES (?,?,?,?,?)").run(userId, name, n.qs, t, t).lastInsertRowid;
    return { row: db.prepare("SELECT * FROM saved_searches WHERE id = ?").get(Number(id)) };
  };
  app.post("/api/me/saved-searches", requireUser(), limWrite, (req, res) => {
    const v = savedBody.parse(req.body ?? {});
    const r = addSaved(req.user.id, v.name, v.qs);
    if (r.error) return res.status(r.limit ? 409 : 400).json(fail(r.limit ? "LIMIT" : "VALIDATION", r.error));
    res.status(r.existing ? 200 : 201).json(savedRow(r.row, 0));
  });
  app.post("/api/me/saved-searches/import", requireUser(), limWrite, (req, res) => {
    const { items } = savedImportBody.parse(req.body ?? {});
    let added = 0;
    let skipped = 0;
    for (const it of items) {
      const r = addSaved(req.user.id, it.name, it.qs);
      if (r.row && !r.existing) added++;
      else skipped++;
    }
    res.json({ added, skipped });
  });
  app.post("/api/me/saved-searches/:id/seen", requireUser(), lim, (req, res) => {
    const r = db.prepare("UPDATE saved_searches SET last_seen_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "החיפוש לא נמצא");
    res.json({ ok: true });
  });
  app.delete("/api/me/saved-searches/:id", requireUser(), lim, (req, res) => {
    const r = db.prepare("DELETE FROM saved_searches WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    if (!r.changes) return notFound(res, "החיפוש לא נמצא");
    res.json({ ok: true });
  });

  // ── 12. מה עבד לי ──  ── 4. מגוון ──
  app.get("/api/me/worked", requireUser(), lim, (req, res) => {
    res.set("Cache-Control", "no-store").json(workedForMe(db, req.user.id, { limit: Math.min(50, Math.max(1, Number(req.query.limit) || 30)) }));
  });
  app.get("/api/me/diversity", requireUser(), lim, (req, res) => {
    res.set("Cache-Control", "no-store").json(diversity(db, req.user.id, { days: Math.min(365, Math.max(14, Number(req.query.days) || 90)) }));
  });

  // ── 13. השוואה ──
  app.get("/api/compare", lim, (req, res) => {
    const raw = String(req.query.ids ?? "");
    if (!/^\d{1,9}(,\d{1,9}){1,2}$/.test(raw)) return res.status(400).json(fail("VALIDATION", "בחרו שתיים או שלוש פעולות להשוואה"));
    const ids = [...new Set(raw.split(",").map(Number))];
    const r = compareActivities(db, ids);
    if (r.items.length < 2) return notFound(res, "אחת הפעולות לא נמצאה");
    res.json(r);
  });

  // ── 14. אותה פעולה לשכבה אחרת, עם התאמה ──
  app.post("/api/activities/:id/for-group", limWrite, (req, res) => {
    const src = load(req, res);
    if (!src) return;
    const v = forGroupBody.parse(req.body ?? {});
    const groupSize = v.participants ?? src.groupSize;
    const durationMin = v.durationMin ?? src.durationMin;
    if (v.ageGroup === src.ageGroup && groupSize === src.groupSize && durationMin === src.durationMin) return res.status(400).json(fail("VALIDATION", "לא שונה שום דבר: בחרו שכבה, גודל קבוצה או אורך אחרים"));
    let stages = src.stages;
    if (durationMin !== src.durationMin) {
      const mins = apportion(stages.map((s) => s.minutes), durationMin);
      stages = stages.map((s, i) => ({ ...s, minutes: mins[i] }));
    }
    if (v.ageGroup !== src.ageGroup) stages = ageAdaptedStages(stages, v.ageGroup).stages;
    let draft = { ...src, ageGroup: v.ageGroup, groupSize, durationMin, stages };
    const cond = groupSize !== src.groupSize ? (groupSize <= 8 ? "few" : groupSize >= 35 ? "many" : null) : null;
    if (cond) {
      const m = adaptMany(draft, [cond]);
      draft = { ...draft, equipment: m.equipment, safetyNotes: m.safetyNotes, stages: m.stages };
    }
    const who = optionalAuth(req);
    const id = insertActivity(db, {
      ...draft,
      title: (v.title || `${src.title} (ל${v.ageGroup})`).slice(0, 120),
      tags: [...new Set([...src.tags, "התאמה לשכבה אחרת"])].slice(0, 20),
      isSeed: false,
      ownerId: who?.id ?? null,
      status: newActivityStatus(db, who),
    });
    audit(db, who?.username, "activity.forGroup", { from: src.id, id, age: v.ageGroup, size: groupSize, minutes: durationMin });
    res.status(201).json(getActivity(db, id));
  });

  // ── 15. הבדלי גרסאות, שורה אחרי שורה ──
  app.get("/api/activities/:id/versions/diff", requireUser(), lim, (req, res) => {
    const a = load(req, res, { includeArchived: true });
    if (!a) return;
    if (!canManage(req.user, a)) return forbidden(res);
    const snap = (ref) => {
      if (ref === "current") return { id: "current", label: "הנוכחית", at: a.updatedAt, snapshot: snapshotOf(a) };
      if (!/^\d{1,9}$/.test(String(ref))) return null;
      const v = db.prepare("SELECT * FROM activity_versions WHERE id = ? AND activity_id = ?").get(Number(ref), a.id);
      return v ? { id: v.id, label: v.note || "גרסה", at: v.saved_at, snapshot: JSON.parse(v.snapshot_json) } : null;
    };
    const from = snap(String(req.query.from ?? ""));
    const to = snap(String(req.query.to ?? "current"));
    if (!from || !to) return notFound(res, "הגרסה לא נמצאה");
    res.json({ from: { id: from.id, label: from.label, at: from.at }, to: { id: to.id, label: to.label, at: to.at }, ...snapshotDiff(from.snapshot, to.snapshot) });
  });

  // ── 16. דוח ייבוא ──
  app.post("/api/activities/import-report", limiter(15 * 60_000, 120), (req, res) => {
    res.set("Cache-Control", "no-store").json(importReport(db, importReportBody.parse(req.body ?? {})));
  });

  // ── 17. כיסוי חגים במאגר ──
  app.get("/api/holidays/coverage", lim, (req, res) => {
    const days = Math.min(120, Math.max(14, Number(req.query.days) || 90));
    const today = isRealDate(String(req.query.from)) ? String(req.query.from) : israelToday();
    res.json(holidayCoverage(db, new Date(`${today}T12:00:00Z`), days));
  });
}

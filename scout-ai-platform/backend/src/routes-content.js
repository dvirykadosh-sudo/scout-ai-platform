// נקודות קצה לסבב ה': ערכים, אתגרי חינוך, סיפורים, שאלות, סיכום, משחקי חימום, תוכנית לכמה שכבות, בדיקת מבנה והצעות אחרי הפעלה.
import { z } from "zod";
import { getActivity, updateActivity } from "./activities.js";
import { audit } from "./db.js";
import { buildMultiPlan } from "./plan.js";
import { reviewActivity } from "./quality.js";
import { multiPlanSchema } from "./validate.js";
import {
  STORIES,
  WARMUP_CATEGORIES,
  activitySummary,
  addStoryToStage,
  challengeList,
  discussionQuestions,
  learnFromRuns,
  pickWarmups,
  storyList,
  suggestAfterRun,
  valueList,
} from "./content.js";

const addStorySchema = z.object({ storyId: z.string().min(1).max(40), stage: z.coerce.number().int().min(0).max(4).default(0) });

export function registerContentRoutes(app, { db, limiter, fail, requireUser, optionalAuth, canManage, forbidden, saveVersion, runRow }) {
  const notFound = (res) => res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));

  // ── 14. ערכים ──
  app.get("/api/values", (req, res) => res.json(valueList()));

  // ── 17. אתגרי חינוך ──
  app.get("/api/challenges", (req, res) => res.json(challengeList()));

  // ── 18. סיפורים ──
  app.get("/api/stories", (req, res) => res.json(storyList(typeof req.query.value === "string" ? req.query.value : "")));
  app.post("/api/activities/:id/add-story", requireUser(), (req, res) => {
    const id = Number(req.params.id);
    const a = getActivity(db, id, { includeArchived: true });
    if (!a) return notFound(res);
    if (!canManage(req.user, a)) return forbidden(res);
    const v = addStorySchema.parse(req.body ?? {});
    const story = STORIES.find((s) => s.id === v.storyId);
    if (!story) return res.status(404).json(fail("NOT_FOUND", "הסיפור לא נמצא"));
    saveVersion(id, a, req.user.username, "לפני הוספת סיפור");
    updateActivity(db, id, { ...a, stages: addStoryToStage(a, story, v.stage) });
    audit(db, req.user.username, "activity.addStory", { id, story: story.id, stage: v.stage });
    res.json(getActivity(db, id, { includeArchived: true }));
  });

  // ── 19, 20, 23. כלים על פעולה קיימת (גלויים לכל מי שרואה את הפעולה) ──
  app.get("/api/activities/:id/questions", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    res.json(discussionQuestions(a));
  });
  app.get("/api/activities/:id/summary", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    res.json(activitySummary(a));
  });
  app.get("/api/activities/:id/review", (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    res.json(reviewActivity(a));
  });

  // ── 24. משחקי חימום ומעבר ──
  app.get("/api/warmups", (req, res) => {
    const category = WARMUP_CATEGORIES.includes(String(req.query.category)) ? String(req.query.category) : undefined;
    const n = Math.max(1, Math.min(Number(req.query.n) || 3, 8));
    const seed = Number(req.query.seed) || 1;
    const energetic = req.query.energetic === "1" ? true : req.query.energetic === "0" ? false : undefined;
    res.json({ categories: WARMUP_CATEGORIES, items: pickWarmups({ category, n, seed, energetic, noEquipment: req.query.noEquipment === "1" }) });
  });

  // ── 15. תוכנית לכמה שכבות ──
  app.post("/api/plan/multi", limiter(15 * 60_000, 60), (req, res) => {
    res.json(buildMultiPlan(db, multiPlanSchema.parse(req.body ?? {})));
  });

  // ── 21, 22. הצעות אחרי הפעלה, ומה עבד אצלך ──
  app.get("/api/activities/:id/run-suggestions", requireUser(), (req, res) => {
    const a = getActivity(db, Number(req.params.id));
    if (!a) return notFound(res);
    const last = db.prepare("SELECT * FROM runs WHERE activity_id = ? AND user_id = ? ORDER BY ran_on DESC, id DESC LIMIT 1").get(a.id, req.user.id);
    res.json({ items: suggestAfterRun(last ? runRow(last) : null, a) });
  });
  app.get("/api/me/learned", requireUser(), (req, res) => res.json(learnFromRuns(db, req.user.id)));
}

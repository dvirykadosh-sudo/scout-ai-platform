// נקודות קצה לסבב ד': סוגי פעולה, יצירה בלי נושא, הצעות לשבוע, מה חסר, הצעות מנהל,
// "פעולה כמו זו", שדרוג לשיא, קיצור ומאגר רעיונות לשיאים.
import { z } from "zod";
import { apportion } from "./ai.js";
import { getActivity, insertActivity } from "./activities.js";
import { audit } from "./db.js";
import { AGE_GROUPS, ROLES } from "./shared/constants.js";
import { styleSchema } from "./style.js";
import {
  computeGaps,
  generateKinded,
  KIND_IDS,
  KINDS,
  kindList,
  PEAK_CATEGORIES,
  PEAK_IDEAS,
  shortenActivity,
  surprise,
  upgradeToPeak,
  weekSuggestions,
  yearMix,
  TOPIC_BANK,
  pickFrom,
} from "./kinds.js";
import { getSetting, newActivityStatus, setSetting } from "./routes-extra.js";

const text = (max) => z.string().trim().max(max);

const quickSchema = z.object({
  topic: text(120).optional(),
  value: text(120).optional(),
  kind: z.enum(KIND_IDS).optional(),
  ageGroup: z.enum(AGE_GROUPS).default("כיתה ו' - מעורב"),
  participants: z.coerce.number().int().min(1).max(200).default(20),
  minutes: z.coerce.number().int().min(10).max(180).optional(),
  instructor: text(60).optional(),
  tribe: text(60).default("שבט מעוז"),
  battalion: text(60).default(""),
  role: z.enum(ROLES).default("מדריך"),
  seedText: text(600).optional(),
  surprise: z.boolean().default(false),
  style: styleSchema,
});

const featuredSchema = z.object({
  items: z
    .array(
      z.object({
        topic: text(120).min(2, "יש להזין נושא"),
        value: text(120).default(""),
        kind: z.enum(KIND_IDS).default("content"),
        note: text(200).default(""),
      }),
    )
    .max(6, "עד 6 הצעות"),
});

const similarSchema = z.object({ topic: text(120).optional(), value: text(120).optional(), style: styleSchema.optional() });
const shortenSchema = z.object({ minutes: z.coerce.number().int().min(10).max(60).default(20) });

export function registerKindRoutes(app, { db, limiter, fail, requireAdmin, optionalAuth, optionalUser, saveGenerated }) {
  const notFound = (res) => res.status(404).json(fail("NOT_FOUND", "הפעולה לא נמצאה"));
  const displayName = (who) => (who ? db.prepare("SELECT COALESCE(display_name, username) AS n FROM users WHERE id = ?").get(who.id)?.n : null);

  app.get("/api/kinds", (req, res) => res.json(kindList()));

  // ── 8. תמהיל שנתי מומלץ ──
  app.get("/api/year-mix", (req, res) => {
    const who = optionalAuth(req);
    res.json(yearMix(db, who?.id ?? null));
  });

  // ── 7. מה חסר לי ──
  app.get("/api/me/gaps", (req, res) => {
    const who = optionalAuth(req);
    res.json(computeGaps(db, who?.id ?? null));
  });

  // ── 2. מה לעשות השבוע ──
  app.get("/api/suggest/week", (req, res) => {
    const who = optionalAuth(req);
    res.json({ items: weekSuggestions(db, who?.id ?? null) });
  });

  // ── 1, 3, 4. פעולה מהירה: בלי נושא (הפתעה), או רק סוג וגיל ──
  const quickInput = (b, who) => {
    const pick = b.topic ? null : surprise(db, who?.id ?? null, { kind: b.kind });
    const kindId = b.kind || pick?.kind || "content";
    const k = KINDS[kindId];
    const kindTotal = k.methods.reduce((s, m) => s + m.minutes, 0);
    const total = b.minutes ?? kindTotal;
    const mins = total === kindTotal ? k.methods.map((m) => m.minutes) : apportion(k.methods.map((m) => m.minutes), total);
    const topic = b.topic || pick.topic;
    return {
      kind: kindId,
      topic,
      value: b.value || pick?.value || "",
      ageGroup: b.ageGroup,
      participants: b.participants,
      tribe: b.tribe,
      battalion: b.battalion,
      instructor: b.instructor || displayName(who) || "מדריך/ה",
      role: b.role,
      methods: k.methods.map((m, i) => ({ name: m.name, minutes: mins[i] })),
      activeScouting: k.scouting,
      energeticMode: k.energetic,
      seedText: b.seedText,
      style: b.style,
    };
  };

  app.post("/api/activities/quick", limiter(15 * 60_000, 20), async (req, res) => {
    const b = quickSchema.parse(req.body ?? {});
    const who = optionalAuth(req);
    const input = quickInput(b, who);
    const g = await generateKinded(input);
    const saved = saveGenerated(input, g, req, b.surprise || !b.topic ? "activity.surprise" : "activity.quick");
    res.status(201).json({ ...saved, why: b.topic ? undefined : { topic: input.topic, kind: input.kind } });
  });

  // נושא אקראי לכפתור "הציעו לי נושא" באשף
  app.get("/api/topics/random", (req, res) => {
    const who = optionalAuth(req);
    const kind = KIND_IDS.includes(String(req.query.kind)) ? String(req.query.kind) : undefined;
    const { topic, value } = surprise(db, who?.id ?? null, { kind });
    res.json({ topic, value });
  });

  // ── 13. מאגר רעיונות לשיאים ──
  app.get("/api/peak-ideas", (req, res) => res.json({ categories: PEAK_CATEGORIES, items: PEAK_IDEAS }));

  // ── 10. פעולה כמו זו: אותו סוג, אותו גיל ואותן שיטות, נושא אחר ──
  app.post("/api/activities/:id/similar", limiter(15 * 60_000, 20), async (req, res) => {
    const src = getActivity(db, Number(req.params.id));
    if (!src) return notFound(res);
    const b = similarSchema.parse(req.body ?? {});
    const who = optionalAuth(req);
    const used = new Set([src.title]);
    const pick = pickFrom(
      TOPIC_BANK.filter((t) => !used.has(t.topic) && t.value !== src.leadingValue),
      Date.now() % 100000,
    );
    const input = {
      kind: src.kind || "content",
      topic: b.topic || pick.topic,
      value: b.value || (b.topic ? "" : pick.value),
      ageGroup: src.ageGroup,
      participants: src.groupSize,
      tribe: src.tribe,
      battalion: src.battalion || "",
      instructor: displayName(who) || src.instructor || "מדריך/ה",
      role: src.instructorRole || "מדריך",
      methods: src.methods.length ? src.methods : KINDS[src.kind || "content"].methods,
      activeScouting: src.activeScouting,
      energeticMode: src.energeticMode,
      style: b.style ?? styleSchema.parse(undefined),
    };
    const g = await generateKinded(input);
    const saved = saveGenerated(input, g, req, "activity.similar");
    audit(db, optionalUser(req), "activity.similar.from", { from: src.id, id: saved.id });
    res.status(201).json(saved);
  });

  // ── 11. הפוך לפעולת שיא ──
  app.post("/api/activities/:id/upgrade-peak", limiter(15 * 60_000, 40), (req, res) => {
    const src = getActivity(db, Number(req.params.id));
    if (!src) return notFound(res);
    const who = optionalAuth(req);
    const copy = upgradeToPeak(src);
    const id = insertActivity(db, { ...src, ...copy, isSeed: false, ownerId: who?.id ?? null, status: newActivityStatus(db, who) });
    audit(db, optionalUser(req), "activity.upgrade-peak", { from: src.id, id });
    res.status(201).json(getActivity(db, id));
  });

  // ── 12. קצר לי את זה ──
  app.post("/api/activities/:id/shorten", limiter(15 * 60_000, 40), (req, res) => {
    const src = getActivity(db, Number(req.params.id));
    if (!src) return notFound(res);
    const { minutes } = shortenSchema.parse(req.body ?? {});
    if (src.durationMin <= 10) return res.status(422).json(fail("TOO_SHORT", "הפעולה כבר קצרה: 10 דקות או פחות"));
    const who = optionalAuth(req);
    const copy = shortenActivity(src, minutes);
    const id = insertActivity(db, { ...src, ...copy, isSeed: false, ownerId: who?.id ?? null, status: newActivityStatus(db, who) });
    audit(db, optionalUser(req), "activity.shorten", { from: src.id, id, minutes: copy.durationMin });
    res.status(201).json(getActivity(db, id));
  });

  // ── 9. הצעות ממנהל השבט ──
  const readFeatured = () => {
    try {
      const v = JSON.parse(getSetting(db, "featured", "[]"));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  app.get("/api/featured", (req, res) => res.json({ items: readFeatured() }));
  app.put("/api/admin/featured", requireAdmin(), (req, res) => {
    const { items } = featuredSchema.parse(req.body ?? {});
    setSetting(db, "featured", JSON.stringify(items));
    audit(db, req.user.username, "featured.update", { count: items.length });
    res.json({ items });
  });
}

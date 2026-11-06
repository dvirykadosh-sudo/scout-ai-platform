// השלמות לעורך (רעיונות 188–200 לפי רשימת המשתמש): תחנות, תוכנית גיבוי, ציון מוכנות,
// מתודות שבט שאדמין מנהל, ומשוב קצר על תכונות.
import { z } from "zod";
import { requireAdmin } from "./auth.js";
import { audit, nowIso } from "./db.js";
import { optionalUser } from "./auth.js";
import { KINDS, metaDefaults } from "./routes-write.js";
import { KIND_LABEL } from "./routes-write-export.js";
import { readability } from "./routes-write-more.js";
import { gapsOf } from "./write-suggest.js";

const words = (t) => (String(t || "").match(/\S+/g) || []).length;

/** 188: סבב תחנות. כל קבוצה עוברת בכל תחנה; כולל זמן מעבר. */
export function stationPlan({ total, stations, transition = 1 }) {
  const n = Math.max(1, stations);
  const moves = n - 1;
  const usable = total - moves * transition;
  if (usable < n) return { ok: false, reason: `אין מספיק זמן ל-${n} תחנות עם מעברים של ${transition} דקות. הקטינו את מספר התחנות או הגדילו את הזמן.` };
  const per = Math.floor(usable / n);
  const spare = usable - per * n;
  const rows = Array.from({ length: n }, (_, i) => ({ round: i + 1, minutes: per + (i < spare ? 1 : 0) }));
  let t = 0;
  const schedule = rows.map((r) => {
    const from = t;
    t += r.minutes + (r.round < n ? transition : 0);
    return { round: r.round, from, to: from + r.minutes, minutes: r.minutes };
  });
  return { ok: true, perStation: per, spare, transition, rounds: n, schedule, text: `סבב תחנות: ${n} תחנות, ${per}${spare ? `-${per + 1}` : ""} דקות בכל תחנה, ${transition} דקות מעבר.\n${schedule.map((s) => `- סבב ${s.round}: דקה ${s.from} עד ${s.to}`).join("\n")}` };
}

const OUTDOOR = ["שטח", "מגרש", "חוץ", "ריצה", "רצים", "מירוץ", "תופסת", "מחבואים", "טיול", "מסלול", "חולות", "חורשה", "גינה"];
const RAIN_ALT = { שטח: "אולם או כיתה", מגרש: "אולם או כיתה", חוץ: "בפנים", ריצה: "הליכה מהירה או משחק ישיבה", רצים: "הולכים", מירוץ: "מירוץ זוגות בישיבה או משימה מהירה על דף", תופסת: "משחק תופסת דמיוני במקום", מחבואים: "מחבואים של חפץ בחדר", טיול: "סיור בתוך המבנה", מסלול: "מסלול משימות בחדר", חולות: "חדר", חורשה: "חדר", גינה: "חדר" };

/** 189: תוכנית גיבוי לפי תנאי. כללים פשוטים על מילות מפתח בטקסט. */
export function backupPlan(doc, condition) {
  const general = {
    rain: ["לבדוק מראש איזה חדר או אולם פנוי", "לקצר מעברים בין מקומות", "להכין גרסה בלי תנועה מחוץ למבנה"],
    heat: ["לעבור לצל ולהשתמש בשעות הקרירות", "לשתות מים כל 10 דקות", "להקטין את הפעילות הגופנית ולהגדיל משחקי ישיבה", "להחזיק מים וכובעים לכולם"],
    room: ["לפצל לקבוצות קטנות בתחנות", "לבחור משחקים שלא דורשים מקום", "לסדר את החדר מראש"],
    large: ["לחלק לקבוצות של 6 עד 8 עם מדריך לכל קבוצה", "להכין תחנות במקום פעילות אחת לכולם", "להכין ציוד לפי מספר הקבוצות"],
  }[condition];
  const stages = [];
  for (const b of doc.blocks) {
    const text = `${b.title}\n${b.text}`;
    const hits = OUTDOOR.filter((w) => text.includes(w));
    const tips = [];
    if (condition === "rain" && hits.length) tips.push(...hits.slice(0, 3).map((w) => `"${w}": להעביר ל${RAIN_ALT[w]}`));
    if (condition === "heat" && hits.length) tips.push("לקצר את הזמן הפעיל ולהוסיף הפסקת שתייה באמצע");
    if (condition === "room" && /כדור|ריצה|מירוץ|רצים|חבלים/.test(text)) tips.push("להחליף בגרסה בלי ריצה או לצמצם לשטח קטן");
    if (condition === "large" && /כל אחד|כל חניך/.test(text)) tips.push("להחליף ל'כל קבוצה' כדי לחסוך זמן");
    if (tips.length) stages.push({ blockId: b.id, label: b.title || KIND_LABEL[b.kind], tips });
  }
  const label = { rain: "גשם", heat: "חום", room: "חדר קטן", large: "קבוצה גדולה" }[condition];
  const text = [`## תוכנית גיבוי: ${label}`, ...general.map((g) => `- ${g}`), ...stages.map((s) => `- בשלב "${s.label}": ${s.tips.join("; ")}`)].join("\n");
  return { condition, general, stages, text };
}

/** 190: ציון מוכנות. */
export function readiness(doc) {
  const meta = metaDefaults(doc.meta ?? {});
  const blocks = doc.blocks;
  const items = [];
  const add = (label, points, max, hint = "") => items.push({ label, points: Math.round(points), max, ok: points >= max, hint: points >= max ? "" : hint });
  add("יש שם לפעולה", doc.title?.trim() ? 5 : 0, 5, "תנו שם לפעולה");
  add("נבחרה שכבה", meta.ageGroup ? 5 : 0, 5, "בחרו שכבה");
  add("הוגדר משך מתוכנן", meta.minutes ? 5 : 0, 5, "הגדירו משך בדקות");
  const filled = blocks.filter((b) => words(b.text) >= 12).length;
  add("כל השלבים כתובים", blocks.length ? (20 * filled) / blocks.length : 0, 20, `${blocks.length - filled} שלבים עדיין קצרים מדי`);
  const kinds = new Set(blocks.map((b) => b.kind));
  add("יש פתיחה וסיכום", (kinds.has("open") ? 5 : 0) + (kinds.has("close") ? 5 : 0), 10, "חסר שלב פתיחה או סיכום");
  const sum = blocks.reduce((s, b) => s + (b.minutes || 0), 0);
  const diff = meta.minutes ? Math.abs(sum - meta.minutes) : null;
  add("הזמנים מסתכמים למשך המתוכנן", diff === null || !sum ? 0 : diff <= 5 ? 15 : Math.max(0, 15 - diff), 15, diff === null ? "הגדירו משך מתוכנן" : `ההפרש הוא ${diff} דקות`);
  add("הציוד רשום", meta.equipment.length || meta.gear.length ? 5 : 0, 5, "רשמו את הציוד ב'הציוד שלי'");
  add("ביקורת עצמית", Math.min(15, (15 * meta.review.length) / 8), 15, `${8 - Math.min(8, meta.review.length)} שאלות עוד לא סומנו`);
  const done = blocks.filter((b) => b.done).length;
  add("שלבים מסומנים כמוכנים", blocks.length ? (10 * done) / blocks.length : 0, 10, "סמנו 'השלב מוכן' בכל שלב שסיימתם");
  const issues = readability(doc).issues.length;
  add("אין בעיות קריאוּת", Math.max(0, 10 - issues * 2), 10, `${issues} נקודות לשיפור בבדיקת הקריאוּת`);
  const score = items.reduce((s, i) => s + i.points, 0);
  const gaps = gapsOf(doc).gaps.length;
  return { score, label: score >= 85 ? "מוכן להעברה" : score >= 60 ? "כמעט מוכן" : "צריך עוד עבודה", items, openGaps: gaps };
}

export function registerWriteFinalRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  const blockZ = z.object({ id: z.string().trim().min(1).max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default(""), done: z.boolean().optional() });
  const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60) });
  const nd = (d) => ({ title: d.title, meta: metaDefaults(d.meta ?? {}), blocks: d.blocks.map((b) => ({ ...b, done: !!b.done })) });

  app.post("/api/write/stations", requireUser(), lim, (req, res) => {
    const v = z.object({ total: z.number().int().min(5).max(480), stations: z.number().int().min(1).max(12), transition: z.number().int().min(0).max(10).default(1) }).parse(req.body ?? {});
    res.json(stationPlan(v));
  });
  app.post("/api/write/backup-plan", requireUser(), lim, (req, res) => {
    const v = docZ.extend({ condition: z.enum(["rain", "heat", "room", "large"]) }).parse(req.body ?? {});
    res.json(backupPlan(nd(v), v.condition));
  });
  app.post("/api/write/readiness", requireUser(), lim, (req, res) => res.json(readiness(nd(docZ.parse(req.body ?? {})))));

  // ── 192: מתודות שבט שהאדמין מוסיף ──
  const methodZ = z.object({ name: z.string().trim().min(2, "יש להזין שם").max(40), category: z.enum(["game", "talk", "take"]), line: z.string().trim().min(5, "תיאור קצר מדי").max(400), steps: z.array(z.string().trim().min(1).max(200)).max(6).default([]) });
  app.get("/api/write/tribe-methods", requireUser(), (req, res) => {
    res.json(db.prepare("SELECT id, name, category, line, steps_json, created_by FROM write_tribe_methods ORDER BY name").all().map((r) => ({ id: r.id, name: r.name, category: r.category, line: r.line, steps: JSON.parse(r.steps_json), createdBy: r.created_by })));
  });
  app.post("/api/admin/write-methods", requireAdmin(), (req, res) => {
    const v = methodZ.parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM write_tribe_methods").get().c >= 100) return res.status(409).json(fail("LIMIT", "אפשר עד 100 מתודות שבט"));
    if (db.prepare("SELECT 1 FROM write_tribe_methods WHERE lower(name) = lower(?)").get(v.name)) return res.status(409).json(fail("DUP", "מתודה בשם הזה כבר קיימת"));
    const r = db.prepare("INSERT INTO write_tribe_methods (name, category, line, steps_json, created_by, created_at) VALUES (?,?,?,?,?,?)").run(v.name, v.category, v.line, JSON.stringify(v.steps), req.user.username, nowIso());
    audit(db, req.user.username, "write.method.add", { id: Number(r.lastInsertRowid) });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.delete("/api/admin/write-methods/:id", requireAdmin(), (req, res) => {
    const r = db.prepare("DELETE FROM write_tribe_methods WHERE id = ?").run(Number(req.params.id));
    if (!r.changes) return res.status(404).json(fail("NOT_FOUND", "המתודה לא נמצאה"));
    res.json({ ok: true });
  });

  // ── 199: משוב קצר על תכונה ──
  app.post("/api/feedback/feature", limiter(60 * 60_000, 40), (req, res) => {
    const v = z.object({ feature: z.string().regex(/^[a-z0-9-]{2,40}$/, "תכונה לא מוכרת"), vote: z.union([z.literal(1), z.literal(-1)]), comment: z.string().trim().max(300).default("") }).parse(req.body ?? {});
    const user = optionalUser(req);
    if (user) db.prepare("DELETE FROM feature_feedback WHERE feature = ? AND username = ?").run(v.feature, user);
    db.prepare("INSERT INTO feature_feedback (feature, vote, comment, username, created_at) VALUES (?,?,?,?,?)").run(v.feature, v.vote, v.comment, user, nowIso());
    res.status(201).json({ ok: true });
  });
  app.get("/api/admin/feature-feedback", requireAdmin(), (req, res) => {
    res.json(db.prepare("SELECT feature, vote, comment, created_at AS createdAt FROM feature_feedback WHERE comment != '' ORDER BY id DESC LIMIT 50").all());
  });
}

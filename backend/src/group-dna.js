// שלב 70: "ה-DNA של הקבוצה". מחשב מהיומן הפרטי של המדריך (יומן הפעלות) ומהמשוב האנונימי של החניכים מה מתאים לקבוצה:
// רמת אנרגיה מועדפת, מתודות שעובדות, נקודות תורפה וכיוון זמן. הכול חישוב מקומי ופשוט (ממוצעים וספירות), בלי AI ובלי שמות.
// הנתונים פרטיים: מחושבים רק למדריך המחובר, מתוך הרישומים שלו, ולא נשמרים בשום מקום (נגזרים בכל בקשה).
import crypto from "node:crypto";

export const MIN_RATED = 3; // כמה הפעלות עם דירוג השתתפות צריך כדי להציג פרופיל
const DAY = 86_400_000;
const WINDOW_DAYS = 400;

const parseJson = (s, fb) => {
  try {
    const v = JSON.parse(s);
    return v ?? fb;
  } catch {
    return fb;
  }
};
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n) => Math.round(n * 10) / 10;

const FAIL_THEMES = [
  ["talk", "יותר מדי דיבור והסברים", /הסבר|דיבור|הרצא|הקשבה|ארוך מדי|משעמ/],
  ["noise", "קשב ורעש", /רעש|ריכוז|קשב|הפרע|צעק|בלגן|מפריע/],
  ["time", "ניהול זמן", /זמן|נגמר|מיהר|התארך|נמשך/],
  ["groups", "חלוקה לקבוצות ושיתוף פעולה", /חלוק|קבוצות|צוותים|שיתוף|ריב/],
  ["transition", "מעברים בין שלבים", /מעבר|מעברים|ארגון|סידור/],
  ["gear", "ציוד והכנה", /ציוד|חסר|הכנה/],
];
const WIN_THEMES = [
  ["move", "תנועה ומשחק פעיל", /תנועה|ריצה|משחק|תחרות|אנרגי/],
  ["story", "סיפור ודיון", /סיפור|דיון|שיחה|שאלות/],
  ["create", "יצירה ועשייה", /יצירה|בנייה|ציור|פרויקט/],
  ["team", "עבודת צוות", /צוות|ביחד|שיתוף|קבוצות/],
];
const TIMING_TEXT = { long: "הפעולות נוטות להימשך יותר מדי, עדיף קצר ומדויק", short: "הפעולות נוטות להיגמר מוקדם, אפשר להוסיף שלב" };

const themes = (rows, field, defs) =>
  defs
    .map(([id, label, re]) => ({ id, label, n: rows.filter((r) => re.test(r[field] || "")).length }))
    .filter((t) => t.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

/**
 * חישוב טהור. כל שורה: {engagement: 1..3|null, timing, energetic: 0|1, value, methods: string[], worked, changeNext}.
 * @returns {object} פרופיל. ready=false כשאין עדיין מספיק הפעלות עם דירוג השתתפות.
 */
export function computeDna(rows) {
  const rated = rows.filter((r) => r.engagement >= 1 && r.engagement <= 3);
  const high = rated.filter((r) => r.energetic === 1).map((r) => r.engagement);
  const calm = rated.filter((r) => r.energetic !== 1).map((r) => r.engagement);
  let pref = null;
  if (high.length >= 2 && calm.length >= 2) {
    const d = avg(high) - avg(calm);
    pref = d >= 0.4 ? "high" : d <= -0.4 ? "calm" : "mixed";
  }
  const byMethod = new Map();
  for (const r of rated) for (const m of new Set(r.methods)) byMethod.set(m, [...(byMethod.get(m) ?? []), r.engagement]);
  const scored = [...byMethod].map(([name, xs]) => ({ name, n: xs.length, avg: r1(avg(xs)) }));
  const winMethods = scored.filter((m) => m.n >= 2 && m.avg >= 2.4).sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 3);
  const weakMethods = scored.filter((m) => m.n >= 2 && m.avg <= 1.6).sort((a, b) => a.avg - b.avg || b.n - a.n).slice(0, 3);
  const timed = rows.filter((r) => r.timing);
  const share = (k) => (timed.length >= 3 ? timed.filter((r) => r.timing === k).length / timed.length : 0);
  const timing = timed.length < 3 ? null : share("long") >= 0.4 ? "long" : share("short") >= 0.4 ? "short" : "ok";
  const winThemes = themes(rows.filter((r) => !r.engagement || r.engagement >= 2), "worked", WIN_THEMES);
  const failThemes = themes(rows, "changeNext", FAIL_THEMES);
  const byValue = new Map();
  for (const r of rated) if (r.value) byValue.set(r.value, [...(byValue.get(r.value) ?? []), r.engagement]);
  const values = [...byValue].map(([name, xs]) => ({ name, n: xs.length, avg: r1(avg(xs)) })).filter((v) => v.n >= 2 && v.avg >= 2.4).sort((a, b) => b.avg - a.avg).slice(0, 2);

  const ready = rated.length >= MIN_RATED;
  const parts = [];
  if (pref === "high") parts.push("מעדיפה פעולות אנרגטיות ותנועתיות");
  else if (pref === "calm") parts.push("מגיבה טוב יותר לפעולות רגועות (שיחה, סיפור, יצירה)");
  else if (pref === "mixed") parts.push("מגיבה דומה לפעולות אנרגטיות ורגועות");
  if (winMethods.length) parts.push(`מתודות שעבדו: ${winMethods.map((m) => m.name).join(", ")}`);
  if (weakMethods.length) parts.push(`פחות עבדו: ${weakMethods.map((m) => m.name).join(", ")}`);
  if (winThemes.length) parts.push(`מה שהמדריך רשם שעבד: ${winThemes.map((t) => t.label).join(", ")}`);
  if (failThemes.length) parts.push(`נקודות תורפה: ${failThemes.map((t) => t.label).join(", ")}`);
  if (timing && timing !== "ok") parts.push(TIMING_TEXT[timing]);
  const hint = ready && parts.length ? `פרופיל הקבוצה (מהיומן הפרטי של המדריך): ${parts.join("; ")}.` : "";
  return {
    ready,
    runs: rows.length,
    rated: rated.length,
    confidence: rated.length >= 12 ? "high" : rated.length >= 6 ? "medium" : "low",
    energy: { pref, highN: high.length, calmN: calm.length, highAvg: r1(avg(high)), calmAvg: r1(avg(calm)) },
    winMethods,
    weakMethods,
    timing,
    winThemes,
    failThemes,
    values,
    hint,
    sig: hint ? crypto.createHash("sha1").update(hint).digest("hex").slice(0, 8) : "",
  };
}

/** הקבוצות ביומן של המדריך (לפי תווית), עם כמה הפעלות ודירוגים לכל אחת */
export function listGroups(db, uid) {
  return db
    .prepare("SELECT MIN(group_label) AS label, COUNT(*) AS runs, SUM(CASE WHEN engagement IS NOT NULL THEN 1 ELSE 0 END) AS rated FROM runs WHERE user_id = ? AND TRIM(group_label) <> '' GROUP BY lower(TRIM(group_label)) ORDER BY runs DESC, label LIMIT 12")
    .all(uid)
    .map((g) => ({ label: clean(g.label), runs: g.runs, rated: g.rated }));
}

/** DNA של מדריך. group = "" -> כל ההפעלות; אחרת רק הפעלות עם אותה תווית קבוצה. null אם אין יומן בכלל. */
export function dnaFor(db, uid, group = "", now = Date.now()) {
  const since = new Date(now - WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const g = clean(group).toLowerCase();
  const rows = db
    .prepare(
      "SELECT r.group_label, r.engagement, r.timing, r.worked, r.change_next, a.energetic_mode, a.leading_value, a.methods_json FROM runs r JOIN activities a ON a.id = r.activity_id WHERE r.user_id = ? AND r.ran_on >= ? ORDER BY r.ran_on DESC, r.id DESC LIMIT 300",
    )
    .all(uid, since)
    .filter((r) => !g || clean(r.group_label).toLowerCase() === g)
    .map((r) => ({
      engagement: r.engagement ?? null,
      timing: r.timing ?? null,
      energetic: r.energetic_mode ? 1 : 0,
      value: clean(r.leading_value),
      methods: parseJson(r.methods_json, []).map((m) => clean(typeof m === "string" ? m : m?.name)).filter(Boolean),
      worked: r.worked || "",
      changeNext: r.change_next || "",
    }));
  const dna = computeDna(rows);
  // משוב אנונימי של חניכים על הפעולות שהמדריך עצמו יצר (לא לפי קבוצה: אין בו תווית קבוצה). מוצג רק מ-5 משובים.
  if (!g) {
    const k = db.prepare("SELECT COUNT(*) AS c, AVG(f.rating) AS a, SUM(CASE WHEN f.more = 'yes' THEN 1 ELSE 0 END) AS y FROM feedback f JOIN activities a ON a.id = f.activity_id WHERE a.owner_id = ? AND f.created_at >= ?").get(uid, `${since}T00:00:00`);
    dna.kids = k.c >= 5 ? { count: k.c, avg: r1(k.a), wantMore: Math.round((k.y / k.c) * 100) } : null;
  } else dna.kids = null;
  return dna;
}

/** הערכת התאמה של תוצאת RAG לפרופיל: מכפיל ציון (1 = בלי שינוי). משפיע רק על הסדר בין תוצאות שוות-כיסוי. */
export function dnaFactor(hit, dna) {
  if (!dna?.ready) return 1;
  let f = 1;
  const pref = dna.energy?.pref;
  if (pref === "high" && hit.energetic === 1) f *= 1.25;
  if (pref === "high" && hit.energetic === 0) f *= 0.9;
  if (pref === "calm" && hit.energetic === 0) f *= 1.2;
  if (pref === "calm" && hit.energetic === 1) f *= 0.85;
  const hay = `${hit.title || ""} ${hit.meta || ""} ${hit.snippet || ""}`;
  if (dna.winMethods.some((m) => hay.includes(m.name))) f *= 1.2;
  if (dna.weakMethods.some((m) => hay.includes(m.name))) f *= 0.8;
  return f;
}

/** שורה להוספה להנחיית ה-AI. ריקה כשאין פרופיל. הקלט הוא נתונים בלבד, וההנחיה אומרת לא לבטל בטיחות. */
export const dnaSystemLine = (dna) => (dna?.ready && dna.hint ? `\n${dna.hint}\nכוונו את ההצעות והדוגמאות לפרופיל הזה, בלי לציין שיש לכם פרופיל, ובלי לוותר על כללי הבטיחות.` : "");

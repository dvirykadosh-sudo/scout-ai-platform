// בטיחות, פעולות דומות ודוח תקופתי לאדמין.
import { rowToActivity } from "./activities.js";

// ───────────────────────── 34. הערות בטיחות אוטומטיות ─────────────────────────

const RISKS = [
  { id: "running", label: "ריצה ותנועה מהירה", re: /רצ|ריצה|מירוץ|תופסת|מרדף|קופצים/, cover: /גבולות|גזרה|אות עצירה|לא רצים/, suggestion: "להגדיר גבולות גזרה ואות עצירה לפני שמתחילים, להסיר שעונים וצמידים, ולוודא שאין מכשולים בשטח." },
  { id: "contact", label: "מגע פיזי", re: /מגע|דחיפה|היאבקות|נוגעים|חיבוק|מושכים|מרימים/, cover: /מגע|הסכמה/, suggestion: "לקבוע מראש מה מותר במגע, להפסיק מיד אם חניך לא רוצה, ולתת חלופה בלי מגע." },
  { id: "blindfold", label: "כיסוי עיניים", re: /כיסוי עיניים|כיסויי עיניים|עיניים עצומות|עיוור/, cover: /מלווה|מוביל|הולכים לאט/, suggestion: "לכל חניך עם כיסוי עיניים יש מלווה צמוד, הולכים לאט, וחניך שלא רוצה מקבל תפקיד אחר." },
  { id: "water", label: "מים", re: /בריכה|נחל|חוף|שפריצ|בלוני מים|משחקי מים|ים המלח/, cover: /מציל|שחייה|מוסמך/, suggestion: "לוודא נוכחות מציל או מבוגר מוסמך, ולא להיכנס למים עמוקים." },
  { id: "fire", label: "אש ונרות", re: /מדורה|נרות|נר\b|גפרור|להבה|אש /, cover: /מטף|דלי|מרחק|מבוגר אחראי/, suggestion: "מבוגר אחראי ליד האש, מרחק בטוח, ודלי מים או מטף זמינים." },
  { id: "height", label: "גובה וטיפוס", re: /גובה|טיפוס|מטפסים|גג|סולם|עץ /, cover: /ציוד בטיחות|מוסמך|לא מטפסים/, suggestion: "לטפס רק עם ציוד בטיחות והדרכה מוסמכת, או לוותר על הטיפוס." },
  { id: "sharp", label: "כלים חדים", re: /סכין|מסור|פטיש|גרזן|מחט|סכינים/, cover: /מבוגר|צמודה/, suggestion: "כלים חדים רק בהדרכה צמודה של מבוגר, ואחרי הסבר על אחזקה בטוחה." },
  { id: "dark", label: "חושך ולילה", re: /חושך|בלילה|לילה|פנסים/, cover: /ספירה|לבד|פנס/, suggestion: "תאורה מספקת, ספירת חניכים לפני ואחרי, ואף אחד לא יוצא לבד." },
  { id: "outside", label: "יציאה מהמועדון", re: /יוצאים|טיול|ברחוב|כביש|חוצים|מחוץ למועדון/, cover: /ספירה|מלווים|אישור הורים|כביש/, suggestion: "מלווה בקדמת הקבוצה ומלווה בסופה, ספירה בכל מעבר, ואישור הורים ליציאה." },
  { id: "photos", label: "צילום וטלפונים", re: /צילום|מצלמ|סרטון|וידאו|רשתות|אינסטגרם|טיקטוק/, cover: /רשות|אישור הורים|פרטיות/, suggestion: "לבקש רשות לפני צילום, ולא לפרסם תמונות של חניכים בלי אישור הורים." },
  { id: "food", label: "אוכל וממתקים", re: /אוכל|ממתק|ממתקים|עוגה|שוקולד|בישול|לאכול|חטיף/, cover: /אלרגי/, suggestion: "לשאול מראש על אלרגיות ורגישויות, ולא לתת אוכל בלי אישור." },
  { id: "sensitive", label: "נושא רגיש", re: /אלימות|בריונות|הקנטה|מוות|שכול|גירוש|משפחה|גוף|מראה חיצוני|התעללות/, cover: /רגיש|לדלג|לא מזכירים|הנהגה/, suggestion: "להזהיר מראש שאפשר לדלג, לא להצביע על חניך, ולדעת למי בהנהגת השבט פונים אם מישהו נפגע." },
];

export function safetyReview(a) {
  const notes = a.safetyNotes || "";
  const risks = [];
  for (const r of RISKS) {
    const found = a.stages.filter((s) => r.re.test(s.content)).map((s) => s.name);
    if (!found.length && !r.re.test(a.equipment || "")) continue;
    risks.push({ id: r.id, label: r.label, stages: found, suggestion: r.suggestion, covered: r.cover.test(notes) });
  }
  const missing = risks.filter((r) => !r.covered);
  return { risks, missingCount: missing.length, ok: missing.length === 0 };
}

/** הטקסט שמצטרף להערות הבטיחות: ההנחיות שעוד לא מופיעות בהן. */
export function safetyAddition(a) {
  const missing = safetyReview(a).risks.filter((r) => !r.covered);
  if (!missing.length) return "";
  let add = missing.map((r) => `${r.label}: ${r.suggestion}`).join(" ");
  const room = 1000 - (a.safetyNotes || "").length - 1;
  if (add.length > room) add = add.slice(0, Math.max(0, room)).replace(/\s\S*$/, "");
  return add;
}

// ───────────────────────── 42. פעולות דומות וכפילויות ─────────────────────────

const STOP = new Set(["של", "על", "עם", "את", "אל", "הם", "היא", "הוא", "אנחנו", "כל", "או", "גם", "לא", "כי", "אם", "זה", "זו", "אין", "יש", "פעולה", "פעולת", "מדריך", "חניכים", "קבוצה", "דקות"]);
const tokens = (s) => new Set(String(s || "").replace(/[^א-ת\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));
const sig = (a) => new Set([...tokens(a.title), ...tokens(a.title), ...tokens(a.leadingValue), ...tokens(a.tags.join(" ")), ...tokens(a.stages[1]?.content)]);

export function jaccard(x, y) {
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  const all = x.size + y.size - both;
  return all ? both / all : 0;
}

export function similarActivities(db, a, n = 5) {
  const mine = sig(a);
  const out = [];
  for (const r of db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED' AND id != ?").all(a.id)) {
    const b = rowToActivity(r);
    const score = jaccard(mine, sig(b));
    if (score >= 0.08) out.push({ id: b.id, title: b.title, ageGroup: b.ageGroup, durationMin: b.durationMin, leadingValue: b.leadingValue, score: Math.round(score * 100) / 100, nearDuplicate: score >= 0.6 });
  }
  return out.sort((p, q) => q.score - p.score || p.id - q.id).slice(0, n);
}

// ───────────────────────── 40. דוח תקופתי ─────────────────────────

export function buildReport(db, from, to) {
  const f = `${from}T00:00:00.000Z`;
  const t = `${to}T23:59:59.999Z`;
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const created = all("SELECT status, COUNT(*) AS c FROM activities WHERE created_at >= ? AND created_at <= ? AND is_seed = 0 GROUP BY status", f, t);
  const sum = (s) => created.find((x) => x.status === s)?.c ?? 0;
  const ratings = one("SELECT COUNT(*) AS c, AVG(stars) AS avg FROM ratings WHERE created_at >= ? AND created_at <= ?", f, t);
  return {
    from,
    to,
    totals: {
      created: created.reduce((s, x) => s + x.c, 0),
      published: sum("PUBLISHED"),
      pending: sum("PENDING"),
      archived: sum("ARCHIVED"),
      runs: one("SELECT COUNT(*) AS c FROM runs WHERE ran_on >= ? AND ran_on <= ?", from, to).c,
      ratings: ratings.c,
      averageRating: ratings.c ? Math.round(ratings.avg * 10) / 10 : 0,
      feedback: one("SELECT COUNT(*) AS c FROM feedback WHERE created_at >= ? AND created_at <= ?", f, t).c,
      openFlags: one("SELECT COUNT(*) AS c FROM flags WHERE status = 'OPEN'").c,
    },
    instructors: all(
      `SELECT COALESCE(u.display_name, u.username) AS name,
              (SELECT COUNT(*) FROM activities a WHERE a.owner_id = u.id AND a.created_at >= ? AND a.created_at <= ? AND a.is_seed = 0) AS created,
              (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id AND r.ran_on >= ? AND r.ran_on <= ?) AS runs
       FROM users u WHERE u.disabled = 0 ORDER BY runs DESC, created DESC, name`,
      f, t, from, to,
    ).filter((x) => x.created || x.runs),
    kinds: all("SELECT COALESCE(kind, 'other') AS kind, COUNT(*) AS c FROM activities WHERE created_at >= ? AND created_at <= ? AND is_seed = 0 GROUP BY kind ORDER BY c DESC", f, t),
    mostRun: all("SELECT a.id, a.title, COUNT(*) AS runs FROM runs r JOIN activities a ON a.id = r.activity_id WHERE r.ran_on >= ? AND r.ran_on <= ? GROUP BY a.id ORDER BY runs DESC, a.id LIMIT 5", from, to),
    topRated: all("SELECT a.id, a.title, ROUND(AVG(r.stars), 1) AS average, COUNT(*) AS count FROM ratings r JOIN activities a ON a.id = r.activity_id WHERE r.created_at >= ? AND r.created_at <= ? GROUP BY a.id HAVING count >= 1 ORDER BY average DESC, count DESC, a.id LIMIT 5", f, t),
  };
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function reportCsv(r) {
  const rows = [
    ["דוח תקופתי", r.from, r.to],
    [],
    ["מדד", "ערך"],
    ["פעולות חדשות", r.totals.created],
    ["פורסמו", r.totals.published],
    ["ממתינות לאישור", r.totals.pending],
    ["נמחקו", r.totals.archived],
    ["הפעלות שתועדו", r.totals.runs],
    ["דירוגים", r.totals.ratings],
    ["דירוג ממוצע", r.totals.averageRating],
    ["משובי חניכים", r.totals.feedback],
    ["דיווחים פתוחים", r.totals.openFlags],
    [],
    ["מדריך", "פעולות שנוצרו", "הפעלות"],
    ...r.instructors.map((i) => [i.name, i.created, i.runs]),
    [],
    ["הפעולות שהופעלו הכי הרבה", "הפעלות"],
    ...r.mostRun.map((x) => [x.title, x.runs]),
  ];
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

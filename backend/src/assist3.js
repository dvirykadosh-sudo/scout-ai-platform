// עוזר הכתיבה, פריטים 71–80: ציון מוכנות, בדיקת הכלה, חבילת הורים, כרטיסי תחנות,
// הפיכת טיוטה לפעולה (לחוברת), השוואת גרסאות ומסלול צמיחה. הכול דטרמיניסטי.
import { METHOD_NAMES } from "./shared/constants.js";
import { activitySummary } from "./content.js";
import { analyze, draftToStages, lineAfter, norm, words } from "./assist.js";
import { whatsappText } from "./organizer.js";

const sentences = (s) =>
  String(s || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

// ───────────── 72. ציון מוכנות ─────────────

/** a = תוצאת analyze. target = משך מתוכנן בדקות (לא חובה). */
export function readiness(a, target) {
  const done = (id) => !!a.checklist.find((c) => c.id === id)?.done;
  const parts = [];
  const add = (id, label, max, points, fix) => parts.push({ id, label, max, points: Math.max(0, Math.min(max, points)), ok: points >= max, fix });

  add("title", "כותרת", 5, done("title") ? 5 : 0, "כתבו כותרת קצרה בשורה הראשונה.");
  const filled = a.stages.filter((s) => s.filled).length;
  add("stages", "חמשת השלבים", 25, filled * 5, a.missingStages.length ? `חסרים שלבים: ${a.missingStages.join(", ")}.` : "");
  let tp = 0;
  const sum = a.totalMinutes || 0;
  if (target && sum) tp = Math.abs(sum - target) / target <= 0.15 ? 10 : Math.abs(sum - target) / target <= 0.3 ? 5 : 0;
  else if (sum) tp = 8;
  add("time", "זמנים", 10, tp, sum ? `סך הזמנים הוא ${sum} דקות${target ? ` ומתוכננות ${target}` : ""}. קרבו אותם.` : "כתבו כמה דקות לכל חלק.");
  add("value", "ערך שמגיע לדיון ולסיכום", 10, a.value ? (a.value.linked ? 10 : 5) : 0, a.value ? "הוסיפו משפט חיבור בסיכום." : "כתבו שורה 'המטרה: ...'.");
  add("equipment", "ציוד", 5, done("equipment") ? 5 : 0, 'כתבו שורה "ציוד: ..." גם אם אין ציוד.');
  add("safety", "בטיחות", 8, done("safety") ? 8 : 0, 'כתבו שורה "בטיחות: ..." עם גבולות גזרה ומקום בטוח.');
  add("question", "שאלה לדיון", 7, done("question") ? 7 : 0, "הוסיפו שאלה פתוחה אחת.");
  const bal = a.balance.verdict;
  add("balance", "איזון בין שיטות", 8, bal === "balanced" ? 8 : bal === "few" ? 4 : bal === "none" ? 0 : 3, a.balance.tip || "הוסיפו שיטה אחת.");
  add("planb", "תוכנית ב'", 7, a.planB.length ? 7 : 0, 'השתמשו ב"הרצה יבשה" והוסיפו לפחות תוכנית ב\' אחת.');
  add("placeholders", "בלי מקומות ריקים", 5, a.placeholders.length ? 0 : 5, `מלאו: ${a.placeholders.join(" ")}.`);
  add("wording", "ניסוח", 7, a.notes.length === 0 ? 7 : a.notes.length <= 2 ? 4 : 0, `יש ${a.notes.length} הערות בשוליים. עברו עליהן.`);
  add("age", "שכבת גיל", 3, done("age") && !(a.age && a.age.issues.length) ? 3 : 0, a.age?.issues.length ? a.age.issues[0].why : "ציינו שכבת גיל.");

  const score = a.words === 0 ? 0 : parts.reduce((s, p) => s + p.points, 0);
  const level = score >= 85 ? "מוכנה להפעלה" : score >= 65 ? "כמעט מוכנה" : score >= 40 ? "בדרך" : "טיוטה ראשונה";
  const next = a.words === 0 ? [] : parts.filter((p) => !p.ok && p.fix).sort((x, y) => y.max - y.points - (x.max - x.points)).slice(0, 3).map((p) => ({ label: p.label, gain: p.max - p.points, fix: p.fix }));
  return { score, level, parts: parts.map(({ id, label, max, points, ok }) => ({ id, label, max, points, ok })), next };
}

// ───────────── 73. בדיקת הכלה ─────────────

const INCLUSION = [
  { id: "gender", re: /בנים\s+(?:נגד|מול)\s+בנות|בנות\s+(?:נגד|מול)\s+בנים|חלוקה לבנים ולבנות/, why: "חלוקה לפי מגדר מרחיקה חניכים שלא מזדהים איתה ומחזקת פערים.", fix: "חלקו לפי חודש לידה, צבע חולצה או הגרלה." },
  { id: "eliminate", re: /נפסל|יוצא מהמשחק|מודח|יושב בצד/, why: "מי שנפסל יושב ומחכה, ודווקא מי שהכי צריך תנועה או שייכות נשאר בחוץ.", fix: "במקום לפסול, תנו משימה חדשה: שופט, מנהל תחנה או מעבר לקבוצה אחרת." },
  { id: "physical", re: /רצים|ריצה|קופצים|מטפסים|מירוץ/, absent: /מי שלא יכול|תפקיד חלופי|בקצב שלו|חלופה|שופט|מתעד|הליכה/, why: "משימה פיזית בלי חלופה מוציאה חניכים עם מגבלה, פציעה או כושר נמוך.", fix: "הוסיפו חלופה: מי שלא רץ יכול ללכת או לקבל תפקיד של שופט או מתעד." },
  { id: "exposure", re: /כל אחד מספר על (?:המשפחה|ההורים|הבית|הכסף)|מספרים על (?:המשפחה|ההורים|הבית)|מי שאין לו/, why: "שיתוף אישי בכוח חושף חניכים שהמצב בבית שלהם מורכב.", fix: "תנו לבחור אם לשתף, או לשתף על דמות מהסיפור במקום על עצמם." },
  { id: "reading", re: /קוראים בקול|כל אחד קורא|קריאה בקול/, absent: /מתנדבים|מי שמעדיף|מקריא|אפשר לדלג/, why: "קריאה בקול מביכה חניכים עם קושי בקריאה.", fix: "בקשו מתנדבים, או שהמדריך מקריא." },
  { id: "phone", re: /טלפון חכם|אפליקציה|קוד QR|מצלמים/, absent: /אם יש|מי שאין|מודפס|טלפון אחד/, why: "לא לכל חניך יש טלפון או חבילת גלישה.", fix: "טלפון אחד לכל קבוצה, או הכינו גרסה מודפסת." },
  { id: "cost", re: /(?:להביא|יביאו) (?:כסף|מצלמה|תלבושת)|בתשלום|עולה כסף/, why: "דרישה להביא דבר שעולה כסף מפלה בין חניכים.", fix: "הכינו את הציוד בשבט ואל תדרשו מהחניכים להביא." },
  { id: "touch", re: /אוחזים ידיים|חיבוק|עולים על הגב|מגע פיזי/, absent: /בלי מגע|מי שלא נוח|אפשר לדלג/, why: "מגע פיזי לא נוח לכל חניך.", fix: "הוסיפו: מי שלא נוח לו, עושה בלי מגע." },
  { id: "loud", re: /צועקים|שואגים|קולי קולות/, absent: /פינה שקטה|בלי צעקות|בשקט|אוזניות/, why: "רעש חזק קשה לחניכים עם רגישות לרעש.", fix: "אפשרו לסמן בתנועה במקום בקול, או לצאת לפינה שקטה." },
];

export function inclusionCheck(raw) {
  const t = norm(raw);
  const flags = [];
  for (const r of INCLUSION) {
    const m = t.match(r.re);
    if (!m) continue;
    if (r.absent && r.absent.test(t)) continue;
    flags.push({ id: r.id, phrase: m[0], why: r.why, fix: r.fix, line: `התאמה: ${r.fix}` });
  }
  return { ok: flags.length === 0, checked: INCLUSION.length, flags: flags.slice(0, 8) };
}

// ───────────── טיוטה כפעולה (74, 78, 79) ─────────────

/** "שהחניכים יבינו שאחריות היא בחירה" הופך ל"אחריות היא בחירה", כדי שיישמע טוב בהודעה ובחוברת. */
const cleanValue = (v) => {
  const c = String(v || "").trim().replace(/^ש?ה?חניכים\s+(?:יבינו|ילמדו|ירגישו|יחוו|יכירו|יגלו)\s+ש?/, "").replace(/[.\s]+$/, "");
  return (c.length >= 3 ? c : String(v || "").trim()).slice(0, 160);
};

export function draftAsActivity(raw, { ageGroup = "", author = "", groupSize = 20 } = {}) {
  const { analysis, stages } = draftToStages(raw);
  const energetic = analysis.methods.some((m) => m.name === "משחק תחרות" || m.name === "משחק הדמייה");
  const total = stages.reduce((s, x) => s + x.minutes, 0);
  const title = analysis.title || "פעולה ללא כותרת";
  return {
    id: 0,
    title,
    durationMin: total,
    author,
    instructor: author,
    instructorRole: "מדריך",
    tribe: "שבט מעוז",
    battalion: "",
    ageGroup: ageGroup || "כיתה ז' - מעורב",
    groupSize,
    leadingValue: cleanValue(lineAfter(raw, ["ערך", "מטרה"])) || title,
    equipment: lineAfter(raw, ["ציוד"]).slice(0, 500) || "לא צוין ציוד",
    safetyNotes: lineAfter(raw, ["בטיחות"]).slice(0, 1000) || "לא צוינו הערות בטיחות",
    conclusionNote: analysis.planB.join("\n"),
    activeScouting: false,
    energeticMode: energetic,
    tags: [],
    methods: analysis.methods.map((m) => ({ name: m.name, minutes: Math.max(1, Math.round(total / Math.max(1, analysis.methods.length))) })),
    stages,
    analysis,
  };
}

// ───────────── 74. חבילת הורים ─────────────

export function parentsPack(raw, { ageGroup = "", author = "", date = "", time = "", place = "" } = {}) {
  const a = draftAsActivity(raw, { ageGroup, author });
  const t = norm(raw);
  const bring = ["בקבוק מים"];
  if (a.energeticMode || /(?:מירוץ|רצים|תחנות|תופסת|בתנועה)/.test(t)) bring.push("נעליים סגורות ובגדים שנוח לזוז בהם");
  if (/(?:בחוץ|מדורה|טיול|לילה)/.test(t)) bring.push("בגד חם");
  const eq = lineAfter(raw, ["להביא"]);
  if (eq) bring.push(eq.slice(0, 80));
  const summary = activitySummary(a);
  return {
    title: a.title,
    parents: `${whatsappText(a, { mode: "parents" })}\n\nמה כדאי להביא: ${[...new Set(bring)].join(", ")}.`,
    kids: whatsappText(a, { mode: "kids", date, time, place }),
    staff: whatsappText(a, { mode: "staff", date, time, place }),
    leaderSummary: summary.leader,
    bring: [...new Set(bring)],
  };
}

// ───────────── 79. כרטיסי תחנות ─────────────

const STATION_TASKS = [
  ["תחנת דילמה", (t) => `קראו את הסיטואציה שעל הכרטיס סביב "${t}". אין תשובה נכונה: החליטו יחד מה עושים, ורשמו משפט אחד שמסביר למה.`],
  ["תחנת שיתוף פעולה", (t) => `בנו יחד מגדל או מבנה מהחומרים שבתחנה, כך שכל חבר בקבוצה מניח לפחות חלק אחד. אחר כך אמרו איך זה קשור ל"${t}".`],
  ["תחנת הדמייה", (t) => `שחקו סצנה של דקה על "${t}" עם תפקידים שהוגרלו. אחרי הסצנה, אמרו מה הרגשתם בתפקיד.`],
  ["תחנת חידה", (t) => `פתרו את החידה שעל הכרטיס. התשובה היא מילה שקשורה ל"${t}". רק כשכולם מסכימים, ממשיכים.`],
  ["תחנת התבוננות", (t) => `התבוננו בשקט בתמונה או בחפץ שבתחנה למשך דקה, וכל אחד כותב מילה אחת על "${t}". קראו את המילים יחד.`],
  ["תחנת יצירה", (t) => `ציירו בשיתוף פעולה סמל לקבוצה שמבטא את "${t}", ועל כל חבר להוסיף קו או צבע.`],
  ["תחנת אתגר", (t) => `משימה גופנית קצרה ובטוחה: כל הקבוצה צריכה לעבור את המסלול כשכל אחד מוביל קטע אחד. ספרו מה הקשר ל"${t}".`],
  ["תחנת שיתוף", (t) => `בסבב, כל אחד אומר משפט אחד על מה שהוא יודע על "${t}", ומותר לדלג. חבר אחד רושם.`],
];

const topicOf = (title) => String(title || "").replace(/^(?:פעולה|פעולת|דילמה|רגע|תנועה|צופיות|היכרות|סיפור)\s+(?:על|בנושא|סביב|של|ו)?\s*/, "").trim() || "הנושא";

export function stationCards(raw, count = 4) {
  const a = analyze(raw);
  const topic = topicOf(a.title);
  const gameMin = a.stages[1].minutes || 18;
  const explicit = [...String(raw || "").matchAll(/^\s*(?:\d+[.)]\s*)?תחנה\s*(\d+|[א-ת]['׳]?)\s*[:\-–]\s*(.+)$/gm)].map((m) => ({ label: m[1], task: m[2].trim() }));
  const useExplicit = explicit.length >= 2;
  const n = useExplicit ? Math.min(explicit.length, 10) : Math.max(2, Math.min(8, count));
  const perStation = Math.max(2, Math.floor(gameMin / n) - 1);
  const safety = lineAfter(raw, ["בטיחות"]);
  const cards = Array.from({ length: n }, (_, i) => {
    const e = useExplicit ? explicit[i] : null;
    const tpl = STATION_TASKS[i % STATION_TASKS.length];
    return {
      n: i + 1,
      title: e ? `תחנה ${e.label}` : `תחנה ${i + 1}: ${tpl[0].replace(/^תחנת /, "")}`,
      task: e ? e.task : tpl[1](topic),
      minutes: perStation,
      safety: i === 0 || /גופני|רצ|מסלול/.test(e?.task || tpl[1](topic)) ? safety || "שמרו על מרחק, בלי דחיפות" : "",
    };
  });
  return {
    explicit: useExplicit,
    topic,
    rotation: `כל קבוצה נשארת בתחנה ${perStation} דקות. כשהמדריך מסמן, עוברים לתחנה הבאה בכיוון השעון. בסוף כולם חוזרים למעגל אחד.`,
    cards,
  };
}

// ───────────── 75. השוואת גרסאות ─────────────

export function lineDiff(oldText, newText) {
  const oldLines = String(oldText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const newLines = String(newText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const added = newLines.filter((l) => !oldSet.has(l));
  const removed = oldLines.filter((l) => !newSet.has(l));
  return { added: added.length, removed: removed.length, wordsBefore: words(oldText), wordsAfter: words(newText), addedSample: added.slice(0, 3), removedSample: removed.slice(0, 3) };
}

// ───────────── 80. מסלול צמיחה ─────────────

export const MILESTONES = [
  { id: "first", label: "פעולה ראשונה שנשמרה במאגר", hint: 'כתבו פעולה בעוזר ולחצו "שמירה במאגר".', need: (s) => s.activities >= 1, points: 10 },
  { id: "complete", label: "פעולה עם חמשת השלבים", hint: "השלימו את כל השלבים כך שלא תישמר כטיוטה.", need: (s) => s.completeActivities >= 1, points: 15 },
  { id: "five", label: "חמש פעולות שכתבתם", hint: "כתבו עוד פעולות. כל אחת מקרבת.", need: (s) => s.activities >= 5, points: 20 },
  { id: "planb", label: "פעולה עם תוכנית ב'", hint: 'השתמשו ב"הרצה יבשה" והוסיפו תוכנית ב\'.', need: (s) => s.withPlanB >= 1, points: 10 },
  { id: "run", label: "תיעוד הפעלה אחת", hint: 'אחרי הפעולה, לחצו "אחרי הפעולה" וספרו איך הלך.', need: (s) => s.reflections + s.runs >= 1, points: 15 },
  { id: "runs3", label: "שלושה תיעודים אחרי פעולה", hint: "תיעוד קבוע הוא מה שהופך מדריך למנוסה.", need: (s) => s.reflections + s.runs >= 3, points: 15 },
  { id: "shared", label: "שיתוף טיוטה וקבלת תגובה", hint: 'שתפו טיוטה בקישור ובקשו ממדריך אחר להגיב.', need: (s) => s.commentsReceived >= 1, points: 10 },
  { id: "methods5", label: "חמש שיטות הדרכה שונות", hint: "נסו שיטה שעוד לא השתמשתם בה.", need: (s) => s.methodsUsed.length >= 5, points: 15 },
  { id: "methods9", label: "תשע שיטות הדרכה שונות", hint: "הרחיבו את הרפרטואר שלכם לעוד שיטות.", need: (s) => s.methodsUsed.length >= 9, points: 15 },
];

const LEVELS = [
  [0, "מדריך בתחילת הדרך"],
  [20, "כותב מתמיד"],
  [50, "מדריך מנוסה"],
  [90, "מדריך מוביל"],
];

/** s = { activities, completeActivities, withPlanB, reflections, runs, commentsReceived, methodsUsed[] } */
export function growthPath(s) {
  const milestones = MILESTONES.map((m) => ({ id: m.id, label: m.label, hint: m.hint, points: m.points, done: !!m.need(s) }));
  const points = milestones.filter((m) => m.done).reduce((t, m) => t + m.points, 0);
  const max = MILESTONES.reduce((t, m) => t + m.points, 0);
  const idx = LEVELS.reduce((best, [min], i) => (points >= min ? i : best), 0);
  const nextLevel = LEVELS[idx + 1] || null;
  const next = milestones.find((m) => !m.done) || null;
  const unused = METHOD_NAMES.filter((n) => !s.methodsUsed.includes(n));
  return {
    points,
    max,
    level: LEVELS[idx][1],
    nextLevel: nextLevel ? { name: nextLevel[1], pointsNeeded: nextLevel[0] - points } : null,
    milestones,
    next,
    tryMethods: unused.slice(0, 3),
    stats: { activities: s.activities, runs: s.reflections + s.runs, methodsUsed: s.methodsUsed.length },
  };
}

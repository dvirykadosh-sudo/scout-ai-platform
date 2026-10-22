// עוזר כתיבה: מקבל טקסט חופשי של מדריך ומסדר אותו (כותרת, שלבים, מתודות, זמנים),
// בודק מה חסר, ומציע המשך כשנתקעים. הניתוח דטרמיניסטי (מילות מפתח), בלי מודל שפה.
import { METHODS, MIDOT, STAGE_NAMES } from "./shared/constants.js";
import { applyFixes, checkQuality } from "./quality.js";
import { methodBalance, placeholdersIn, profileCheck } from "./assist-balance.js";

const STAGE_KEYS = [
  ["פתיחה", "פותחים", "מתחילים", "נפגשים", "ברוכים", "היכרות", "חימום", "סבב שמות", "מעגל פתיחה", "מציגים את הנושא", "מתכנסים"],
  ["משחק", "תחרות", "מירוץ", "תחנות", "תופסת", "אתגר", "חוקי המשחק", "הצגה", "סיפור", "ציר זמן", "מחלקים לקבוצות", "נקודות"],
  ["צופיות", "מעשי", "בונים", "קשר", "מצפן", "מפה", "חבל", "מדורה", "עזרה ראשונה", "מיומנות", "תרגול", "עשייה"],
  ["דיון", "שאלה", "שיחה", "דילמה", "מה הרגשנו", "מה חשבתם", "למה", "איך זה קשור", "שיתוף", "מעגל שיח"],
  ["סיכום", "מסכמים", "לסיום", "מסיימים", "מחויבות", "מסקנה", "ניקח איתנו", "שיר סיום", "מעגל סיום", "נסיים"],
];
// כותרות מפורשות שמדריך עשוי לכתוב (מופיעות בתחילת שורה קצרה)
const HEADER_RES = [
  /^(?:\d+[.)]\s*)?(?:#+\s*)?(?:פתיחה|פתיחת הפעולה|חיבור והזנקה)(?:\s*[:\-–(].*)?$/,
  /^(?:\d+[.)]\s*)?(?:#+\s*)?(?:ציר זמן|ציר זמן\/משחק|משחק|הפעילות המרכזית|שיא הפעולה|הגוף)(?:\s*[:\-–(].*)?$/,
  /^(?:\d+[.)]\s*)?(?:#+\s*)?(?:זמן צופיות(?: מעשי)?|צופיות מעשית|צופיות|חלק מעשי|מעשי)(?:\s*[:\-–(].*)?$/,
  /^(?:\d+[.)]\s*)?(?:#+\s*)?(?:דיון|שיחה|עומק ערכי|שאלות לדיון)(?:\s*[:\-–(].*)?$/,
  /^(?:\d+[.)]\s*)?(?:#+\s*)?(?:סיכום|סגירה|סיום|הפנמה ומחויבות)(?:\s*[:\-–(].*)?$/,
];

const METHOD_KEYS = {
  "משחק תחרות": ["משחק", "תחרות", "מירוץ", "תופסת", "נקודות", "קבוצות מתחרות"],
  "עשייה": ["בונים", "מכינים", "יוצרים", "מייצרים", "כרזה", "מתקן", "פרויקט", "מבצע"],
  "ייצוג": ["מייצגים", "מציגים עמדה", "כל קבוצה מייצגת", "עמדה של"],
  "הבעה יצירתית": ["מציירים", "מצייר", "כותבים שיר", "פסל גוף", "דרמה", "הצגה", "שיר", "קולאז'"],
  "השראה": ["סיפור", "משל", "דמות", "מקריאים", "מספר לכם", "קטע", "סרטון"],
  "חשיבה משותפת": ["מחליטים יחד", "פותרים יחד", "הקבוצה מחליטה", "מתכננים יחד", "סיעור מוחות", "פתרון משותף"],
  "דיון בשאלה": ["דיון", "שאלה", "שואלים", "מה דעתכם", "למה לדעתכם", "מה הרגשתם"],
  "שיתוף": ["משתפים", "שיתוף", "כל אחד מספר", "סבב", "מי רוצה לספר", "משפט אחד"],
  "משחק הדמייה": ["הדמיה", "הדמייה", "תרחיש", "תפקידים", "מדמים", "מצב אמיתי"],
  "התבוננות": ["מתבוננים", "התבוננות", "שקט", "הליכה בשקט", "שמים לב", "מסתכלים"],
  "הסבר": ["מסבירים", "הסבר", "מציג", "מלמדים", "מידע", "רקע"],
  "פירוק": ["מפרקים", "פירוק", "גורמים", "תוצאות", "מרכיבים", "מנתחים"],
};

export const norm = (s) => String(s || "").replace(/[֑-ׇ]/g, "").replace(/["'״׳]/g, "");
export const words = (s) => (norm(s).match(/[א-תa-zA-Z0-9]+/g) || []).length;
export const has = (t, k) => t.includes(norm(k));

function minutesIn(text) {
  let total = 0;
  for (const m of norm(text).matchAll(/(\d{1,3})\s*(?:דקות|דקה|דק)/g)) total += Math.min(Number(m[1]), 180);
  return total;
}

function splitParagraphs(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) out.push(cur.join("\n"));
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}

function classify(par) {
  const t = norm(par);
  const scores = STAGE_KEYS.map((keys) => keys.reduce((s, k) => s + (has(t, k) ? 1 : 0), 0));
  scores[3] += (t.match(/\?/g) || []).length * 1.5;
  const best = Math.max(...scores);
  return { best, index: best > 0 ? scores.indexOf(best) : -1 };
}

/** פירוק טקסט חופשי: כותרת + תוכן לכל אחד מחמשת השלבים + "אחר". */
export function parseDraft(raw) {
  const text = String(raw || "").replace(/\r/g, "").slice(0, 20000);
  const lines = text.split("\n");
  const firstIdx = lines.findIndex((l) => l.trim());
  let title = "";
  let rest = lines;
  if (firstIdx >= 0) {
    const first = lines[firstIdx].trim().replace(/^#+\s*/, "").replace(/^(?:כותרת|שם הפעולה|נושא)\s*[:\-–]\s*/, "");
    const isHeader = HEADER_RES.some((r) => r.test(first));
    if (!isHeader && first.length <= 80 && !/[.?!]$/.test(first)) {
      title = first;
      rest = lines.slice(firstIdx + 1);
    }
  }
  const stages = STAGE_NAMES.map(() => []);
  const other = [];
  // שורות מטא ("ציוד: ...", "בטיחות: ...") אינן חלק מתוכן שלב
  const META_RE = /^ה?(?:ציוד|בטיחות|ערך|מטרה|שכבה|שכבת גיל|גיל|משך|זמן כולל|התאמה|התאמות|תוכנית ב['׳]?)(?:\s*\([^)]*\))?\s*[:\-–]/;
  rest = rest.filter((l) => {
    if (META_RE.test(l.trim())) {
      other.push(l.trim());
      return false;
    }
    return true;
  });
  const headerAt = (l) => {
    const s = norm(l).trim().replace(/^\*+|\*+$/g, "");
    // שורה ארוכה נחשבת כותרת רק אם היא מתחילה במילת שלב ואחריה נקודתיים ("פתיחה: מתכנסים...")
    const cand = s.length <= 60 ? s : (s.match(/^[^:\-–]{1,30}[:\-–]/)?.[0] ?? "");
    return cand ? HEADER_RES.findIndex((r) => r.test(cand)) : -1;
  };
  const anyHeader = rest.some((l) => headerAt(l) >= 0);
  let mode = "explicit";
  if (anyHeader) {
    let cur = -1;
    for (const l of rest) {
      const h = headerAt(l);
      if (h >= 0) {
        cur = h;
        const after = l.replace(/^.*?[:\-–]\s*/, "");
        if (after && after !== l && !HEADER_RES.some((r) => r.test(after.trim()))) stages[cur].push(after.trim());
        continue;
      }
      if (!l.trim()) continue;
      (cur >= 0 ? stages[cur] : other).push(l.trim());
    }
  } else {
    mode = "guessed";
    const pars = splitParagraphs(rest);
    let last = 0;
    pars.forEach((p, i) => {
      const c = classify(p);
      // בלי ראיה ברורה: ממשיכים באותו שלב או מתקדמים לפי המיקום
      let idx = c.index;
      if (idx < 0) idx = Math.max(last, Math.min(4, Math.floor((i * 5) / Math.max(1, pars.length))));
      stages[idx].push(p);
      last = idx;
    });
  }
  return { title, mode: text.trim() ? mode : "empty", stages: stages.map((a) => a.join("\n").trim()), other: other.join("\n").trim() };
}

export function analyze(raw, opts = {}) {
  const d = parseDraft(raw);
  const all = norm(raw);
  const total = words(raw);
  const stageInfo = STAGE_NAMES.map((name, i) => {
    const content = d.stages[i];
    const mins = minutesIn(content);
    return { name, content, words: words(content), minutes: mins || null, filled: words(content) >= 4 };
  });

  const methods = [];
  for (const m of METHODS) {
    const keys = METHOD_KEYS[m.name] || [];
    const hit = keys.find((k) => has(all, k)) || (has(all, m.name) ? m.name : null);
    if (hit) methods.push({ name: m.name, evidence: hit, count: keys.filter((k) => has(all, k)).length + (has(all, m.name) ? 1 : 0) });
  }
  methods.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "he"));

  const sumMinutes = stageInfo.reduce((s, x) => s + (x.minutes || 0), 0);
  const check = [
    { id: "title", label: "כותרת לפעולה", done: !!d.title, hint: "שורה ראשונה קצרה, בלי נקודה בסופה." },
    { id: "value", label: "ערך או מטרה", done: /(?:ערך|מטרה|רוצים להקנות|רוצה שהחניכים|שהחניכים יבינו|שיבינו)/.test(all), hint: 'כתבו משפט כמו "המטרה: שהחניכים יבינו ש...".' },
    { id: "age", label: "שכבת גיל", done: /(?:כיתה|שכבת|שכבה|בני נוער|גיל)/.test(all), hint: 'למשל "לשכבה ז׳" או "לכיתות ה׳-ו׳".' },
    { id: "time", label: "זמנים", done: sumMinutes > 0, hint: 'ציינו כמה דקות לכל חלק, למשל "10 דקות".' },
    { id: "equipment", label: "ציוד", done: /(?:ציוד|צריך להביא|להביא|דפים|עטים|כדור|חבל|טוש|קונוס)/.test(all), hint: 'כתבו שורה "ציוד: ..." גם אם אין צורך בציוד.' },
    { id: "safety", label: "בטיחות", done: /(?:בטיחות|זהירות|גבולות גזרה|מלווה|בטוח|לשמור על)/.test(all), hint: "במשחק תנועתי או באש חשוב להגדיר גבולות ולוודא שטח בטוח." },
    { id: "question", label: "שאלה לדיון", done: /\?/.test(String(raw)), hint: "שאלה פתוחה אחת טובה שווה יותר מחמש שאלות סגורות." },
    { id: "stages", label: "כל חמשת השלבים", done: stageInfo.every((s) => s.filled), hint: "פתיחה, משחק, צופיות מעשית, דיון וסיכום." },
  ];

  const missingStages = stageInfo.filter((s) => !s.filled).map((s) => s.name);
  const nudges = [];
  if (total === 0) nudges.push("אפשר להתחיל מכל מקום: כותרת, רעיון למשחק, או משפט על מה רוצים שהחניכים ירגישו. אני אסדר.");
  else {
    if (!d.title) nudges.push("עוד אין כותרת. שורה ראשונה קצרה תהפוך לשם הפעולה.");
    const big = stageInfo.find((s) => total >= 60 && s.words / total > 0.6);
    if (big) nudges.push(`רוב הטקסט נמצא בשלב "${big.name}". כדאי לוודא שיש מקום גם לשאר השלבים.`);
    if (stageInfo[1].filled && !stageInfo[3].filled) nudges.push("יש חוויה אבל אין דיון. בלי שיחה אחריה, הערך לא נקשר למה שקרה.");
    if (stageInfo[3].filled && !/\?/.test(String(raw))) nudges.push("בדיון חסרה שאלה ברורה. נסחו אותה כשאלה פתוחה.");
    if (total > 40 && sumMinutes === 0) nudges.push("אין עדיין זמנים. בלי הם קשה לדעת אם הפעולה נכנסת בשעה.");
    if (sumMinutes > 0 && (sumMinutes < 30 || sumMinutes > 120)) nudges.push(`סך הזמנים שציינתם הוא ${sumMinutes} דקות. בדקו שזה מתאים לפעולה שלכם.`);
    if (!methods.length && total > 25) nudges.push("לא זיהיתי שיטת הדרכה ברורה. נסו לכתוב מה החניכים עושים: משחקים, מדברים, בונים, מתבוננים.");
    const first = check.find((c) => !c.done && ["value", "equipment", "safety"].includes(c.id));
    if (first && total > 30) nudges.push(`חסר: ${first.label}. ${first.hint}`);
  }

  const value = valueLink(raw, d, stageInfo);
  if (value && !value.linked && total > 40) nudges.push(value.suggestion);
  const age = ageCheck(raw, opts.ageGroup);
  if (age && age.issues.length) nudges.push(`לשכבה ${age.grade}: ${age.issues[0].why}`);
  const planB = String(raw || "").split("\n").map((l) => l.trim()).filter((l) => /^תוכנית ב['׳]?/.test(norm(l)));
  const placeholders = placeholdersIn(raw);
  const balance = methodBalance(methods);
  const base = { stages: stageInfo, methods, totalMinutes: sumMinutes || null };
  const profile = profileCheck(raw, base, opts.profile);
  const front = placeholders.length ? [`נשארו ${placeholders.length} מקומות למלא בסוגריים מרובעים, למשל ${placeholders[0]}.`] : [];
  const back = [];
  if (total > 40 && (balance.verdict === "no-doing" || balance.verdict === "no-talking" || balance.verdict === "too-much-receiving")) back.push(balance.tip);
  if (profile && profile.tips.length) back.push(`לקבוצה שלכם: ${profile.tips[0].tip}`);
  const allNudges = [...front, ...nudges, ...back];
  return {
    title: d.title,
    mode: d.mode,
    value,
    age,
    planB,
    notes: marginNotes(raw),
    placeholders,
    balance,
    profile,
    words: total,
    stages: stageInfo,
    other: d.other,
    methods: methods.slice(0, 6),
    totalMinutes: sumMinutes || null,
    checklist: check,
    progress: Math.round((check.filter((c) => c.done).length / check.length) * 100),
    missingStages,
    nudges: allNudges.slice(0, 4),
  };
}

// ───────────── "אני תקוע": המשך מוצע ─────────────

const STARTERS = [
  { label: "מתחילים מהרגש", text: "אני רוצה שבסוף הפעולה החניכים ירגישו ש..." },
  { label: "מתחילים מהמשחק", text: "הרעיון למשחק המרכזי: כל קבוצה מקבלת משימה, ובסוף..." },
  { label: "מתחילים מבעיה", text: "הבעיה שאני רואה בקבוצה כרגע היא..., ולכן הפעולה תעסוק ב..." },
];

const NEXT = [
  (t) => [
    { label: "סבב קצר", text: `פתיחה: מתכנסים במעגל, ובסבב קצר כל אחד אומר מילה אחת על "${t}". 5 דקות.` },
    { label: "שאלה מפתיעה", text: `פתיחה: שואלים "מי פעם נתקל בנושא ${t}?", ומי שכן עובר לצד השני של החדר. מסבירים מה רואים. 5 דקות.` },
    { label: "סיפור פתיחה", text: `פתיחה: מספרים סיפור קצר שמסתיים באמצע, ומשאירים את הסוף למשחק. 7 דקות.` },
  ],
  (t) => [
    { label: "משחק קבוצות", text: `משחק: מחלקים לקבוצות, וכל קבוצה מקבלת משימה שקשורה ל"${t}". הקבוצה שסיימה ראשונה מסבירה איך החליטה. 20 דקות.` },
    { label: "תחנות", text: `משחק: ארבע תחנות, ובכל אחת סיטואציה אחרת של "${t}". כל קבוצה מחליטה מה עושים ומנמקת. 25 דקות.` },
    { label: "הדמיה", text: `משחק: מדמים מצב אמיתי של "${t}" עם תפקידים מחולקים מראש, ואחרי שלוש דקות עוצרים ומחליפים תפקידים. 20 דקות.` },
  ],
  (t) => [
    { label: "משימה מעשית", text: `זמן צופיות מעשי: בזוגות, כל זוג מכין משהו קטן ביד שקשור ל"${t}", ומציג בשני משפטים. 15 דקות.` },
    { label: "אתגר מיומנות", text: `זמן צופיות מעשי: מלמדים מיומנות אחת (קשר, מפה או עזרה ראשונה) ומחברים אותה לנושא. 15 דקות.` },
  ],
  (t) => [
    { label: "שאלה פתוחה", text: `דיון: מה הרגשת כשהיה לך קשה בנושא "${t}"? קודם בזוגות ואחר כך במליאה. 12 דקות.` },
    { label: "דילמה", text: `דיון: נציג דילמה מהמשחק ונשאל מה היית עושה במקומם, ולמה. 12 דקות.` },
    { label: "מהמשחק לחיים", text: `דיון: איפה זה קורה לנו בשבט, בכיתה או בבית? איזה צעד קטן אפשר לעשות השבוע? 10 דקות.` },
  ],
  (t) => [
    { label: "משפט מחויבות", text: `סיכום: כל חניך אומר משפט אחד שהוא לוקח איתו מהפעולה על "${t}". 5 דקות.` },
    { label: "חיבור לערך", text: `סיכום: המדריך מחבר בשני משפטים בין מה שקרה לבין הערך, ומסיימים בשיר או בצעקה שבטית. 5 דקות.` },
  ],
];

function methodTips(analysisObj, stageIdx) {
  const used = new Set(analysisObj.methods.map((m) => m.name));
  const wanted = [["שיתוף", "השראה"], ["משחק תחרות", "משחק הדמייה"], ["עשייה", "התבוננות"], ["דיון בשאלה", "שיתוף"], ["שיתוף", "הסבר"]][stageIdx];
  return wanted
    .filter((n) => !used.has(n))
    .map((n) => {
      const m = METHODS.find((x) => x.name === n);
      return { name: n, why: m.whenToUse, example: m.example };
    });
}

/** הצעות המשך לפי המצב הנוכחי. פעולה מקומית, עובדת גם בלי מודל. */
export function helpFor(raw) {
  const a = analyze(raw);
  if (a.words === 0) return { where: "start", message: "אפשר להתחיל מכל כיוון. בחרו משפט פתיחה, והמשיכו בהמשך בעצמכם.", suggestions: STARTERS, methodTips: [], source: "builtin" };
  const topic = a.title || "הנושא";
  const firstMissing = a.stages.findIndex((s) => !s.filled);
  if (firstMissing < 0) {
    const open = a.checklist.filter((c) => !c.done && c.id !== "stages");
    return {
      where: "polish",
      message: open.length ? `כל השלבים כתובים. מה שנשאר: ${open.map((c) => c.label).join(", ")}.` : "הפעולה נראית שלמה. אפשר לייצא ל-PDF או לשמור במאגר.",
      suggestions: open.slice(0, 3).map((c) => ({ label: c.label, text: c.hint })),
      methodTips: [],
      source: "builtin",
    };
  }
  return {
    where: STAGE_NAMES[firstMissing],
    message: `כתבתם את מה שלפני, ועוד לא כתבתם את שלב "${STAGE_NAMES[firstMissing]}". הנה כמה כיוונים. אפשר לקחת אחד ולשנות אותו לשלכם.`,
    suggestions: NEXT[firstMissing](topic),
    methodTips: methodTips(a, firstMissing),
    source: "builtin",
  };
}

/** בנייה של שלבי פעולה מטיוטה, להמרה לפעולה שמורה. */
export function draftToStages(raw) {
  const a = analyze(raw);
  const given = a.stages.map((s) => s.minutes);
  const defaults = [8, 18, 14, 12, 8];
  const stages = a.stages.map((s, i) => ({
    name: s.name,
    minutes: given[i] || defaults[i],
    layer: ["חיבור והזנקה", "חוויה משותפת", "מיומנות ואמון", "עומק ערכי", "הפנמה ומחויבות"][i],
    content: s.filled ? s.content.slice(0, 3000) : "(שלב להשלמה)",
  }));
  return { analysis: a, stages };
}

export function lineAfter(raw, labels) {
  for (const l of String(raw || "").split("\n")) {
    const m = l.trim().match(new RegExp(`^ה?(?:${labels.join("|")})\\s*[:\\-–]\\s*(.+)$`));
    if (m) return m[1].trim();
  }
  return "";
}


// ───────────── 52. הערות בשוליים ─────────────

const VAGUE = [
  { re: /נדבר על זה|נשוחח על זה|נעלה את זה/g, why: "לא ברור מה עושים בפועל", fix: 'כתבו את השאלה עצמה, למשל "מה הרגשת כש...?"' },
  { re: /וכו['׳]|וכדומה|וכיוצא בזה/g, why: "המדריך שמחליף אתכם לא יידע מה התכוונתם", fix: "פרטו את הדוגמאות" },
  { re: /כל מיני|משהו כזה|דברים כאלה|בערך/g, why: "ניסוח מעורפל", fix: "תנו דוגמה או מספר" },
  { re: /(?:^|\s)(?:לדבר|לשוחח) (?:על|עם)/g, why: "לשון כללית. מה אומרים?", fix: "כתבו מה המדריך אומר, במשפט אחד" },
];

/** הערות בשוליים: ניסוחים משרדיים, מעורפלים או ארוכים, עם מיקום בטקסט והצעה. */
export function marginNotes(raw) {
  const text = String(raw || "");
  const out = [];
  const q = checkQuality([{ label: "טיוטה", text }]);
  for (const i of q.issues) {
    if (i.index == null || i.index < 0) continue;
    out.push({ start: i.index, end: i.index + i.phrase.replace(/…$/, "").length, phrase: i.phrase, why: i.why, fix: i.fix || null, kind: i.fix ? "style" : "long" });
  }
  for (const v of VAGUE) {
    for (const m of text.matchAll(v.re)) out.push({ start: m.index, end: m.index + m[0].length, phrase: m[0].trim(), why: v.why, fix: null, hint: v.fix, kind: "vague" });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 10);
}

// ───────────── 53. ניסוח מחדש (מקומי) ─────────────

function splitLong(sentence) {
  const w = sentence.split(/\s+/);
  if (w.length <= 22) return sentence;
  const mid = Math.floor(w.length / 2);
  // מחפשים נקודת חיתוך טבעית (פסיק או "ו" ) קרובה לאמצע
  for (let d = 0; d < 8; d++) {
    for (const i of [mid + d, mid - d]) {
      if (i > 5 && i < w.length - 4 && /,$/.test(w[i - 1])) return `${w.slice(0, i).join(" ").replace(/,$/, ".")} ${w.slice(i).join(" ")}`;
      if (i > 5 && i < w.length - 4 && /^ו[א-ת]/.test(w[i])) return `${w.slice(0, i).join(" ")}. ${w[i].slice(1)} ${w.slice(i + 1).join(" ")}`.replace(/\s+/g, " ");
    }
  }
  return sentence;
}

const HUMOR = ["(ומי שחושב שזה קל, מוזמן לנסות.)", "(אל תדאגו, אף אחד לא יפסל על מבוכה.)", "(כן, זה יהיה רועש. וזה בסדר.)"];

/** ניסוח מחדש בלי מודל: תיקון ניסוחים משרדיים, קיצור משפטים ארוכים, ובמצב הומור הערה קלילה. */
export function rewriteLocal(text, mode = "alive") {
  let out = applyFixes(String(text || "").trim());
  out = out.split(/(?<=[.!?])\s+/).map(splitLong).join(" ");
  if (mode === "shorter") out = out.split(/(?<=[.!?])\s+/).slice(0, Math.max(1, Math.ceil(out.split(/(?<=[.!?])\s+/).length * 0.7))).join(" ");
  if (mode === "humor") out = `${out} ${HUMOR[out.length % HUMOR.length]}`;
  return out;
}

// ───────────── 57. חיבור לערך ולמידות ─────────────

const STOP = new Set(["שהחניכים", "החניכים", "שהם", "הערך", "היא", "הוא", "אחד", "יבינו", "ש", "על", "את", "של", "עם", "כדי", "היא", "זה", "זאת", "לא", "כל"]);
const tokens = (s) => (norm(s).match(/[א-ת]{3,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/^[והבלמש]{1,2}(?=[א-ת]{3,})/, ""));

function valueLink(raw, d, stageInfo) {
  const line = lineAfter(raw, ["ערך", "מטרה"]);
  const value = (line || d.title || "").trim();
  if (!value) return null;
  const vt = new Set(tokens(value));
  const tail = stageInfo.slice(3).map((s) => s.content).join(" ");
  const linked = vt.size > 0 && tokens(tail).some((w) => vt.has(w));
  return {
    text: value,
    linked,
    suggestion: `הערך "${value}" לא מופיע בדיון או בסיכום. אפשר לחבר: "${MIDOT.d.label}: ${MIDOT.d.text}" או "${MIDOT.h.label}: ${MIDOT.h.text}", ולשאול איך זה קשור למה שעשינו.`,
    sentence: `בסיכום נחבר את מה שעשינו ל"${value}": איפה ראינו את זה היום, ואיפה זה יופיע אצלנו השבוע?`,
  };
}

// ───────────── 58. התאמה לגיל ─────────────

const GRADE_ORDER = ["ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'", "יא'", "יב'"];
const ABSTRACT = [
  ["אידיאולוגיה", "מה שמאמינים בו"],
  ["אתיקה", "מה נכון ומה לא נכון"],
  ["קונפליקט", "מחלוקת או ריב"],
  ["זהות", "מי אני"],
  ["פילוסופיה", "מחשבה גדולה"],
  ["דילמה", "בחירה קשה"],
  ["אוטונומיה", "לבחור לבד"],
  ["סולידריות", "לעמוד אחד ליד השני"],
  ["מופשט", "לא מוחשי"],
];
const CHILDISH = ["ילדים קטנים", "סיפור לפני השינה", "צעצוע", "בובות", "משחקי גן"];

export function ageCheck(raw, ageGroup) {
  const m = /כיתה (\S+) -/.exec(String(ageGroup || ""));
  if (!m) return null;
  const grade = m[1];
  const idx = GRADE_ORDER.indexOf(grade);
  if (idx < 0) return null;
  const t = norm(raw);
  const issues = [];
  if (idx <= 2) {
    for (const [w, alt] of ABSTRACT) if (t.includes(w)) issues.push({ word: w, why: `המילה "${w}" מופשטת לכיתה ${grade}. אפשר לומר: ${alt}`, alt });
    const long = String(raw || "").split(/(?<=[.!?])\s+|\n+/).find((x) => words(x) > 20);
    if (long) issues.push({ word: long.slice(0, 30) + "…", why: "יש משפט ארוך מאוד לגיל הזה. קצרו אותו לשניים", alt: null });
  }
  if (idx >= 6) for (const w of CHILDISH) if (t.includes(norm(w))) issues.push({ word: w, why: `"${w}" עלול להישמע ילדותי לכיתה ${grade}`, alt: null });
  return { grade, issues: issues.slice(0, 4) };
}

// ───────────── 59. שאלות דיון מהטיוטה ─────────────

export function discussionQuestions(raw) {
  const d = parseDraft(raw);
  const value = lineAfter(raw, ["ערך", "מטרה"]) || d.title || "הנושא";
  const t = d.title || "הנושא";
  const game = d.stages[1].split(/[.!?\n]/)[0].trim().slice(0, 70);
  return [
    { level: "אישית", text: game ? `כשהיינו ב"${game}", מה הרגשת? מה היה לך קשה, ומה היה קל?` : `מתי נתקלת בנושא "${t}" בחיים שלך? מה עשית?` },
    { level: "קבוצתית", text: `מה קרה בקבוצה שלנו במשחק, ואיך זה קשור ל"${t}"? מה אפשר לעשות אחרת בפעם הבאה?` },
    { level: "ערכית", text: `אם "${value}" חשוב לנו, איך זה אמור להיראות בשבט, בכיתה ובבית? מה צעד אחד קטן שאפשר לעשות השבוע?` },
  ];
}

// ───────────── 60. הרצה יבשה ─────────────

const WHATIF = [
  [
    { id: "late", q: "מה אם חצי מהקבוצה מגיעה באיחור?", plan: "ממשיכים לפתיחה עם מי שהגיע, ומי שמצטרף מקבל תפקיד של 'מי שמסביר לו מה קרה'." },
    { id: "quiet", q: "מה אם אף אחד לא עונה בסבב?", plan: "מדריך ראשון עונה בעצמו ומראה שמותר לטעות, ואז עוברים לזוגות." },
  ],
  [
    { id: "rain", q: "מה אם יורד גשם?", plan: "מעבירים את המשחק לחדר: אותם כללים, בלי ריצה, עם משימות על דפים." },
    { id: "early", q: "מה אם המשחק נגמר אחרי חצי מהזמן?", plan: "סבב שני עם שינוי כלל אחד שהקבוצות ממציאות בעצמן." },
    { id: "few", q: "מה אם באו רק 5 חניכים?", plan: "משחקים כקבוצה אחת מול השעון, במקום תחרות בין קבוצות." },
  ],
  [
    { id: "gear", q: "מה אם חסר ציוד?", plan: "מחליפים בציוד שיש: דפים במקום קרטונים, ושמות במקום מדבקות." },
    { id: "skill", q: "מה אם המיומנות קשה מדי?", plan: "מראים עם שני מתנדבים, ובזוגות מתרגלים רק את הצעד הראשון." },
  ],
  [
    { id: "silent", q: "מה אם הדיון לא נדלק?", plan: "קודם זוגות לדקה, ואז כל זוג מביא משפט אחד למליאה. מותר לדלג." },
    { id: "dominant", q: "מה אם אחד מדבר כל הזמן?", plan: "מגבילים לשני משפטים לכל אחד, ומעבירים מקל דיבור." },
  ],
  [
    { id: "short", q: "מה אם נגמר הזמן?", plan: "מקצרים את הסיכום למשפט אחד לכל חניך, והדיון נמשך בהודעה לקבוצה." },
  ],
];

export function dryRun(raw) {
  const a = analyze(raw);
  let at = 0;
  const steps = a.stages
    .map((s, i) => {
      const mins = s.minutes || [8, 18, 14, 12, 8][i];
      const step = { stage: s.name, filled: s.filled, minutes: mins, startAt: at, whatIf: s.filled ? WHATIF[i] : [] };
      at += mins;
      return step;
    })
    .filter((s) => s.filled);
  return { totalMinutes: at, steps };
}

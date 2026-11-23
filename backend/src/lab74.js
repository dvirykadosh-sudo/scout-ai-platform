// שלב 74: מחולל הפעולות והמאגר. כאן הלוגיקה, בלי Express. רוב הפונקציות טהורות (מקבלות פעולה ומחזירות תוצאה), כדי שאפשר לבדוק אותן ביחידות.
// הנתיבים נמצאים ב-routes-lab74.js. תגיות נגישות וסריקת פרטיות נמצאות במודולים משלהם (access-tags.js, privacy-scan.js).
// כל הבדיקות כאן מבוססות על מילות מפתח ועל מספרים. הן עוזרות לא לפספס, ולא מחליפות שיקול דעת של מדריך.
import { checkQuality, reviewActivity } from "./quality.js";
import { jaccard, safetyReview, sig } from "./care.js";
import { CONDITIONS } from "./adapt.js";
import { rowToActivity } from "./activities.js";
import { GRADES } from "./shared/constants.js";
import { KINDS, KIND_IDS } from "./kinds.js";
import { norm } from "./smart-search.js";
import { suggestTopics } from "./topics.js";
import { gearItems, gearLoad } from "./gear.js";
import { accessTags } from "./access-tags.js";
import { privacyScan } from "./privacy-scan.js";

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const words = (t) => String(t ?? "").split(/\s+/).filter(Boolean).length;
const stageText = (a, i) => String(a.stages?.[i]?.content ?? "");
const allText = (a) => (a.stages || []).map((s) => s.content || "").join("\n");
const has = (t, re) => re.test(t);

// ───────────────────────── פריט 5: גיל ─────────────────────────

export const BANDS = {
  young: { label: "כיתות ג'–ד'", minutes: [25, 50], sentence: 12, abstract: 1, discussion: 6, doing: 0.5, readWrite: 1 },
  mid: { label: "כיתות ה'–ו'", minutes: [35, 65], sentence: 14, abstract: 2, discussion: 8, doing: 0.45, readWrite: 2 },
  teen: { label: "כיתות ז'–ט'", minutes: [40, 90], sentence: 18, abstract: 4, discussion: 10, doing: 0.35, readWrite: 3 },
  senior: { label: "כיתות י'–יב'", minutes: [45, 120], sentence: 22, abstract: 99, discussion: 10, doing: 0.3, readWrite: 5 },
};

export const BAND_HINTS = {
  young: [
    "הוראה אחת קצרה בכל פעם, עם הדגמה. בלי הסבר ארוך ובלי רשימת כללים.",
    "משחק עם עד שלושה כללים פשוטים ותפקיד לכל ילד, כדי שאף אחד לא מחכה בצד.",
    "משימה מוחשית עם חפץ ביד, בזוגות או בשלשות קטנות. מראים ולא רק מסבירים.",
    "שאלות קונקרטיות (\"מה קרה במשחק?\") ותשובות קצרות. אפשר לענות גם בציור או בתנועה.",
    "סיום קצר: משפט אחד או תנועה אחת שכולם עושים יחד.",
  ],
  mid: [
    "פתיחה עם חידה או חפץ מסתורי. עדיין הוראות קצרות ובשלבים.",
    "משחק תחרותי בין קבוצות קטנות, עם שיפוט הוגן וכללים שכתובים על דף.",
    "משימה בקבוצות עם חלוקת תפקידים. נותנים להם לנסות לבד לפני שמתערבים.",
    "שאלה אחת מרכזית קודם בזוגות ואחר כך במליאה. מקבלים גם תשובות לא מושלמות.",
    "סבב סיום: כל אחד אומר משפט אחד, ומותר לדלג.",
  ],
  teen: [
    "פתיחה שמעוררת עניין או מחלוקת, בלי להטיף. נותנים לקבוצה להבין לבד לאן הולכים.",
    "משחק או סימולציה עם דילמה אמיתית. מכבדים את הרצון לתחכום ולהומור.",
    "משימה עם אחריות אמיתית: הקבוצה מחליטה, מתכננת ומבצעת. המדריך רק מלווה.",
    "דיון עם שאלה פתוחה שאין לה תשובה אחת. מאפשרים חוסר הסכמה ולא מסכמים בכוח.",
    "סיום עם בחירה אישית: מה אני לוקח מזה, ומה אני משאיר. בלי לחץ לשתף.",
  ],
  senior: [
    "פתיחה שמניחה לחניכים להוביל. אפשר שחניכים יפתחו, והמדריך רק מסגרת.",
    "אתגר או סימולציה מורכבת, עם תפקידים ותוצר. מתייחסים אליהם כאל מדריכים צעירים.",
    "משימה שיש לה תוצאה בשטח, למשל תכנון פעולה לחניכים צעירים יותר.",
    "דיון בעומק עם מקורות או מקרה אמיתי. מבקשים נימוק ולא רק דעה.",
    "סיום שמחבר לחיים מחוץ לשבט: מה אני עושה עם זה, ומי עוד צריך לשמוע.",
  ],
};

/** שכבת גיל לפי "כיתה ח' - מעורב". אם לא זוהתה כיתה מחזיר null. */
export function ageBand(ageGroup) {
  const m = String(ageGroup ?? "").match(/^כיתה\s+(\S+?)\s+-/);
  const i = m ? GRADES.indexOf(m[1]) : -1;
  if (i < 0) return null;
  const grade = i + 3;
  const band = grade <= 4 ? "young" : grade <= 6 ? "mid" : grade <= 9 ? "teen" : "senior";
  return { band, grade, label: BANDS[band].label };
}

const ABSTRACT = /אידיאולוגי|פילוסופי|קונספט|אתיקה|אתי\b|דיאלקטי|מופשט|קולקטיבי|אוטונומי|אינטגרצי|פרדיגמ|סטריאוטיפ|הגמוני|אידיאל|פוליטי|היסטוריוסופי|מטפורי|קונטקסט|אינדיבידואל/g;
const READ_WRITE = /קוראים|קריאה|כותבים|כתיבה|רושמים|רישום|דף עבודה|מכתב|ממלאים/;

/** פריט 5: האם הניסוח, האורך והחלוקה מתאימים לגיל, ומה כדאי לשנות בכל שלב. */
export function ageFit(a) {
  const b = ageBand(a.ageGroup);
  if (!b) return { band: null, bandLabel: "", score: null, checks: [], hints: [], note: "לא זוהתה שכבת גיל, ולכן אי אפשר לבדוק התאמה." };
  const r = BANDS[b.band];
  const text = allText(a);
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => words(s) >= 2);
  const avg = sentences.length ? sentences.reduce((s, x) => s + words(x), 0) / sentences.length : 0;
  const abstractN = (text.match(ABSTRACT) || []).length;
  const total = (a.stages || []).reduce((s, x) => s + (x.minutes || 0), 0) || a.durationMin || 1;
  const doing = ((a.stages?.[1]?.minutes || 0) + (a.stages?.[2]?.minutes || 0)) / total;
  const discussion = a.stages?.[3]?.minutes || 0;
  const rwStages = (a.stages || []).filter((s) => READ_WRITE.test(s.content || "")).length;
  const [lo, hi] = r.minutes;
  const dur = a.durationMin || total;
  const checks = [
    { id: "sentence", ok: avg <= r.sentence, label: `משפטים קצרים מספיק (ממוצע ${Math.round(avg * 10) / 10} מילים, עד ${r.sentence})`, tip: "קצרו את המשפטים: משפט אחד, הוראה אחת." },
    { id: "abstract", ok: abstractN <= r.abstract, label: `מעט מילים מופשטות (${abstractN}, עד ${r.abstract === 99 ? "ללא הגבלה" : r.abstract})`, tip: "החליפו מילים מופשטות בדוגמה מהחיים שלהם." },
    { id: "duration", ok: dur >= lo && dur <= hi, label: `אורך מתאים (${dur} דקות, בגיל הזה בדרך כלל ${lo}–${hi})`, tip: dur < lo ? "קצר מדי לגיל הזה: כדאי להרחיב את המשימה או הדיון." : "ארוך לגיל הזה: קצרו או חלקו לשתי פעולות." },
    { id: "doing", ok: doing >= r.doing, label: `מספיק עשייה (${Math.round(doing * 100)}% מהזמן במשחק ובמשימה, לפחות ${Math.round(r.doing * 100)}%)`, tip: "הגדילו את זמן המשחק והמשימה על חשבון ההסבר." },
    { id: "discussion", ok: discussion >= r.discussion, label: `זמן דיון (${discussion} דקות, לפחות ${r.discussion})`, tip: "הוסיפו זמן לדיון, גם אם צריך לקצר משחק." },
    { id: "readWrite", ok: rwStages <= r.readWrite, label: `קריאה וכתיבה במידה (${rwStages} שלבים, עד ${r.readWrite})`, tip: "החליפו חלק מהכתיבה בדיבור, ציור או תנועה." },
  ];
  const ok = checks.filter((c) => c.ok).length;
  return { band: b.band, bandLabel: b.label, grade: b.grade, score: clamp((ok / checks.length) * 100), ok, total: checks.length, checks, hints: (a.stages || []).map((s, i) => ({ stage: s.name, hint: BAND_HINTS[b.band][i] ?? "" })) };
}

// ───────────────────────── פריט 6: יעד חינוכי מדיד ─────────────────────────

const GOALS = [
  { keys: ["סביבה", "טבע", "ניקיון"], does: "לציין שלושה מעשים שאפשר לעשות בשבט לשמירה על הסביבה, ולבחור אחד מהם", indicators: ["חניך מציע מעשה קונקרטי ולא רק רעיון כללי", "חניך מתחייב למעשה אחד עם תאריך", "חניך מזהה מקום בשבט שבו אפשר לשפר"] },
  { keys: ["ערבות"], does: "לתת דוגמה אחת לערבות הדדית מהקבוצה, ולהסביר מה היה קורה בלעדיה", indicators: ["חניך מציע עזרה לחבר בלי שביקשו", "חניך מזכיר שהצלחה של אחד תלויה באחרים", "חניך נותן דוגמה מהפעולה עצמה"] },
  { keys: ["אחריות"], does: "להסביר במשפט אחד מהי אחריות, ולתת דוגמה אחת למשהו שהם אחראים עליו", indicators: ["חניך לוקח משימה בקבוצה בלי שמבקשים ממנו", "חניך מודה בטעות שלו בלי להאשים אחרים", "חניך מזכיר לחבר את מה שהוא התחייב אליו"] },
  { keys: ["רעות", "חברות", "חבר", "ידידות"], does: "לתאר מעשה אחד שמראה רעות, ולבחור מעשה אחד שיעשו השבוע למען חבר", indicators: ["חניך פונה לחבר שנשאר בצד", "חניך מציע לחבר מקום בקבוצה", "חניך מספר על מעשה של חבר שעזר לו"] },
  { keys: ["עבודת צוות", "צוות", "שיתוף פעולה"], does: "לנסח מה עזר לקבוצה להצליח במשימה, ולציין תרומה אחת שלהם", indicators: ["כל חניך מקבל תפקיד ומבצע אותו", "חניך מקשיב להצעה של חבר לפני שמציע שלו", "הקבוצה מגיעה להחלטה בלי שמישהו כופה"] },
  { keys: ["אומץ"], does: "לספר על מצב שבו נדרש אומץ, ולהסביר מה עוזר להם להתגבר על פחד", indicators: ["חניך מנסה משימה שקשה לו", "חניך אומר דעה שונה מהקבוצה בכבוד", "חניך מעודד חבר שמהסס"] },
  { keys: ["כנות", "אמת", "יושר"], does: "להסביר למה קשה לפעמים לומר את האמת, ולתת דוגמה למצב כזה", indicators: ["חניך מודה בטעות בלי שנתפס", "חניך אומר דעה כנה בצורה מכבדת", "חניך מסביר מה עוזר לו להיות כן"] },
  { keys: ["זיכרון", "שואה", "הנצחה", "זכרון"], does: "להסביר במילים שלהם למה זוכרים, ולהציע דרך אחת לשמור על הזיכרון", indicators: ["חניך מספר על סיפור אחד ששמע ונשאר איתו", "חניך מציע מעשה זיכרון קונקרטי", "חניך מתייחס לנושא בכבוד ובשקט"] },
  { keys: ["שייכות", "אחדות", "קהילה", "מדינה", "ציונות", "מולדת"], does: "לתאר מה גורם להם להרגיש שייכים, ומה הם יכולים לתת לקבוצה", indicators: ["חניך מזכיר דבר אחד שהוא אוהב בשבט", "חניך מציע לתרום משהו לקבוצה", "חניך מזהה מי עוד צריך להרגיש שייך"] },
  { keys: ["חופש", "חירות"], does: "להסביר מה החופש מחייב, ולתת דוגמה למגבלה שנעשית מתוך בחירה", indicators: ["חניך מבחין בין חופש לבין עשיית מה שבא לי", "חניך נותן דוגמה מהחיים שלו", "חניך מקשיב לדעה אחרת על חופש"] },
  { keys: ["סקרנות", "חקירה", "שאלות"], does: "לנסח שלוש שאלות על הנושא שעדיין אין להן תשובה", indicators: ["חניך שואל שאלה פתוחה ולא שאלת כן ולא", "חניך שואל בעקבות תשובה של חבר", "חניך מציע איך אפשר לברר"] },
  { keys: ["מחויבות", "התמדה", "מאמץ", "חוסן", "התמודדות"], does: "לתאר מצב שבו המשיכו למרות קושי, ולבחור משימה אחת שהם מתחייבים לה", indicators: ["חניך ממשיך במשימה אחרי כישלון ראשון", "חניך מבקש עזרה במקום לוותר", "חניך מגדיר לעצמו יעד קטן"] },
  { keys: ["נתינה", "התנדבות", "עשייה", "תרומה", "מעורבות"], does: "לבחור מעשה נתינה אחד קונקרטי ולקבוע מתי יעשו אותו", indicators: ["חניך מציע מעשה ולא רק רעיון", "חניך קובע תאריך או שותף למעשה", "חניך מספר על נתינה שחווה"] },
  { keys: ["סבלנות"], does: "לזהות מה עוזר להם לחכות או להתמיד, ולתת דוגמה אחת", indicators: ["חניך מחכה לתורו בלי להפריע", "חניך נותן לחבר זמן לסיים", "חניך מתאר איך הוא מרגיע את עצמו"] },
  { keys: ["הקשבה", "שמיעה"], does: "לחזור במילים שלהם על מה שחבר אמר, ולשאול עליו שאלה אחת", indicators: ["חניך מסכם את דברי החבר לפני שמגיב", "חניך שואל שאלה שמראה שהקשיב", "חניך לא קוטע"] },
  { keys: ["כבוד", "סובלנות", "קבלה", "שונות"], does: "להסביר איך מביעים כבוד גם כשחושבים אחרת, ולתת דוגמה אחת", indicators: ["חניך מנסח אי הסכמה בלי לפגוע", "חניך מבקש הבהרה לפני שדוחה דעה", "חניך מזהה מילה פוגענית ומציע חלופה"] },
  { keys: ["מנהיגות", "הנהגה", "הובלה"], does: "לתאר מה מנהיג טוב עושה, ולציין רגע אחד בפעולה שבו הובילו", indicators: ["חניך לוקח יוזמה ומערב אחרים", "חניך מקשיב לפני שמחליט", "חניך נותן קרדיט לחבר"] },
  { keys: ["אמון", "נאמנות"], does: "לתאר מה בונה אמון בקבוצה, ולציין דבר אחד שהם יכולים לעשות כדי לחזק אותו", indicators: ["חניך עומד במה שהתחייב", "חניך שומר סוד שנאמר בקבוצה", "חניך נותן לחבר הזדמנות נוספת"] },
];

/** פריט 6: יעד חינוכי שאפשר לבדוק, בלי להמציא ערך שלא קיים בפעולה. */
export function measurableGoal(a) {
  const v = norm(a.leadingValue || "");
  const n = Math.max(1, Number(a.groupSize) || 20);
  const need = Math.max(1, Math.ceil((n * 7) / 10)); // 70% בלי שגיאות עיגול של מספרים עשרוניים
  // התאמה לפי תחילת מילה (גם אחרי אות יחס), כדי ש"התייחדות" לא תתפס כ"יחד"
  const vw = v.split(" ").flatMap((w) => [w, w.replace(/^[לבהומשכ]/, "")]);
  const hit = GOALS.find((g) => g.keys.some((k) => (k.includes(" ") ? v.includes(norm(k)) : vw.some((w) => w.startsWith(norm(k))))));
  const value = a.leadingValue || "הנושא";
  const does = hit?.does ?? `להסביר במשפט אחד מה למדו על "${value}", ולתת דוגמה אחת מהחיים שלהם`;
  const indicators = hit?.indicators ?? ["חניך מזכיר את הנושא במילים שלו", "חניך נותן דוגמה אישית או מהפעולה", "חניך מקשיב לדוגמאות של אחרים"];
  return {
    matched: !!hit,
    value,
    goal: `בסוף הפעולה לפחות ${need} מתוך ${n} חניכים יוכלו ${does}.`,
    indicators,
    measure: `בסבב הסיום כל חניך משלים משפט אחד, והמדריך סופר כמה עמדו ביעד (${need} מתוך ${n}). אם פחות, כדאי לחזור לנושא בפעולה הבאה.`,
  };
}

// ───────────────────────── פריט 1 ו-2: ציון איכות מפורט וטיעון "למה הפעולה הזאת" ─────────────────────────

export const QUALITY_WEIGHTS = { structure: 25, participation: 20, safety: 20, timing: 15, language: 10, values: 10 };
export const QUALITY_LABELS = { structure: "מבנה", participation: "מעורבות החניכים", safety: "בטיחות", timing: "זמנים", language: "ניסוח", values: "קשר לערך" };

const DOING = /בזוגות|בקבוצות|משחק|עושים|בונים|מציגים|רצים|כל אחד|כולם|מתחלקים|משימה|מצייר|מדגימ|משחקים|מחפשים/;
const GROUPING = /בזוגות|בקבוצות|בצוותים|בשלשות|בחבורות|בקבוצה קטנה/;

function timingDim(a) {
  const st = a.stages || [];
  const total = st.reduce((s, x) => s + (x.minutes || 0), 0);
  let s = 100;
  const tips = [];
  const longest = st.reduce((m, x) => (x.minutes > m.minutes ? x : m), st[0] || { minutes: 0, name: "" });
  if (total && longest.minutes / total > 0.6) {
    s -= 35;
    tips.push(`שלב "${longest.name}" תופס יותר מ-60% מהפעולה`);
  } else if (total && longest.minutes / total > 0.45) {
    s -= 20;
    tips.push(`שלב "${longest.name}" תופס יותר מ-45% מהפעולה`);
  }
  const tiny = st.filter((x) => x.minutes < 3);
  if (tiny.length) {
    s -= Math.min(30, tiny.length * 10);
    tips.push(`שלבים קצרים מ-3 דקות: ${tiny.map((x) => x.name).join(", ")}`);
  }
  if (total < 20) {
    s -= 20;
    tips.push("הפעולה קצרה מ-20 דקות");
  } else if (total > 120) {
    s -= 15;
    tips.push("הפעולה ארוכה מ-120 דקות");
  }
  if ((st[3]?.minutes ?? 0) < 8) {
    s -= 15;
    tips.push("פחות מ-8 דקות לדיון");
  }
  if (a.durationMin && total && a.durationMin !== total) {
    s -= 25;
    tips.push(`סכום השלבים (${total}) שונה מאורך הפעולה (${a.durationMin})`);
  }
  return { score: clamp(s), tip: tips[0] ?? "" };
}

function participationDim(a) {
  const st = a.stages || [];
  const doingStages = st.filter((s) => has(s.content || "", DOING)).length;
  const grouping = st.filter((s) => has(s.content || "", GROUPING)).length;
  const q = (stageText(a, 3).match(/\?/g) || []).length;
  const everyone = has(stageText(a, 3) + stageText(a, 4), /כל אחד|כל חניך|כולם|סבב/);
  const lecture = (allText(a).match(/המדריך (?:מסביר|מספר|מקריא|מרצה)/g) || []).length;
  let s = Math.min(5, doingStages) * 8 + (grouping >= 2 ? 20 : grouping === 1 ? 10 : 0) + (q >= 2 ? 20 : q === 1 ? 10 : 0) + (everyone ? 10 : 0) + (lecture <= 2 ? 10 : 0);
  let tip = "";
  if (doingStages < 3) tip = "יש מעט שלבים שבהם החניכים עושים. הוסיפו משחק או משימה.";
  else if (!grouping) tip = "אין עבודה בזוגות או בקבוצות קטנות. זה מערב יותר חניכים.";
  else if (q < 2) tip = "הוסיפו לדיון לפחות שתי שאלות פתוחות.";
  else if (!everyone) tip = "הוסיפו סבב קצר שבו כל חניך אומר משפט.";
  else if (lecture > 2) tip = "המדריך מדבר הרבה. העבירו חלק מההסבר לחניכים.";
  return { score: clamp(s), tip };
}

function valuesDim(a) {
  const vt = norm(a.leadingValue || "").split(" ").filter((w) => w.length >= 3);
  if (!vt.length) return { score: 40, tip: "לא הוגדר ערך מוביל. כתבו ערך אחד שהפעולה מכוונת אליו." };
  const inStage = (i) => {
    const t = norm(stageText(a, i));
    return vt.some((w) => t.includes(w.slice(0, Math.max(3, w.length - 1))));
  };
  let s = 0;
  if (inStage(0) || inStage(1)) s += 20;
  if (inStage(3)) s += 30;
  if (inStage(4)) s += 15;
  if ((a.conclusionNote || "").length >= 20) s += 15;
  if ((a.methods || []).some((m) => /דיון|שיתוף|חשיבה משותפת/.test(m.name)) || has(stageText(a, 3), /\?/)) s += 20;
  let tip = "";
  if (!inStage(3)) tip = `הערך "${a.leadingValue}" לא מופיע בדיון. קשרו אליו לפחות שאלה אחת.`;
  else if (!inStage(4)) tip = "הערך לא חוזר בסיכום. סיימו במשפט שמחבר אליו.";
  else if ((a.conclusionNote || "").length < 20) tip = "הוסיפו הערת סיכום שמחברת בין הפעולה לערך.";
  return { score: clamp(s), tip };
}

export function qualityReport(a, { libraryAverage = null, rating = null, runCount = 0 } = {}) {
  const rev = reviewActivity(a);
  const lang = checkQuality((a.stages || []).map((s) => ({ label: s.name, text: s.content })));
  const sf = safetyReview(a);
  const firstFail = rev.checks.find((c) => !c.ok);
  const firstMissing = sf.risks.find((r) => !r.covered);
  const dims = {
    structure: { score: rev.score, tip: firstFail?.tip ?? "" },
    participation: participationDim(a),
    safety: { score: sf.risks.length ? clamp((sf.risks.filter((r) => r.covered).length / sf.risks.length) * 100) : words(a.safetyNotes) >= 4 ? 100 : 85, tip: firstMissing ? `${firstMissing.label}: ${firstMissing.suggestion}` : "" },
    timing: timingDim(a),
    language: { score: lang.score, tip: lang.issues[0] ? `${lang.issues[0].why}: "${lang.issues[0].phrase}"${lang.issues[0].fix ? ` ← ${lang.issues[0].fix}` : ""}` : "" },
    values: valuesDim(a),
  };
  const sumW = Object.values(QUALITY_WEIGHTS).reduce((s, x) => s + x, 0);
  const overall = clamp(Object.entries(QUALITY_WEIGHTS).reduce((s, [k, w]) => s + dims[k].score * w, 0) / sumW);
  const grade = overall >= 85 ? "מצוינת" : overall >= 70 ? "טובה" : overall >= 50 ? "בסדר, כדאי לשפר" : "דורשת עבודה";
  const list = Object.entries(dims).map(([key, d]) => ({ key, label: QUALITY_LABELS[key], weight: QUALITY_WEIGHTS[key], score: d.score, tip: d.tip }));
  const top = list.filter((d) => d.score < 85 && d.tip).sort((x, y) => x.score - y.score).slice(0, 3);
  const best = [...list].sort((x, y) => y.score - x.score || y.weight - x.weight)[0];
  return { overall, grade, dimensions: list, top, best: best.key, libraryAverage, why: whyThis(a, { best, rating, runCount, overall, valuesScore: dims.values.score }) };
}

/** פריט 2: שורה אחת שמסבירה למה מתאים לבחור דווקא בפעולה הזאת. נבנית רק מעובדות שקיימות בפעולה. */
export function whyThis(a, { best, rating, runCount, overall, valuesScore = 0 } = {}) {
  const r = [];
  if (a.leadingValue) r.push(`מכוונת לערך "${a.leadingValue}"${valuesScore >= 70 ? " וקושרת אותו לדיון ולסיכום" : ""}`);
  const b = ageBand(a.ageGroup);
  if (b) r.push(`מתאימה ל${b.label}, ${a.durationMin} דקות`);
  else r.push(`${a.durationMin} דקות`);
  // קודם מה שהמדריכים עשו איתה בפועל (דירוג והפעלות), אחר כך מה שכתוב בה. כך ההוכחה לא נחתכת כשיש הרבה פרטים.
  if (rating && rating.count >= 3) r.push(`דורגה ${rating.average} מתוך 5 על ידי ${rating.count} מדריכים`);
  if (runCount >= 2) r.push(`הופעלה ${runCount} פעמים`);
  const ms = (a.methods || []).slice(0, 2).map((m) => m.name);
  if (ms.length) r.push(`שיטות: ${ms.join(" ו")}`);
  if (best && best.score >= 85) r.push(`החוזקה שלה: ${best.label}`);
  const reasons = r.slice(0, 4);
  return { reasons, line: reasons.join(". ") + ".", overall: overall ?? null };
}

// ───────────────────────── פריט 3: כפילויות לפני שמירה ─────────────────────────

/** חתימה של טיוטה, באותה שיטה שבה care.js משווה פעולות קיימות. */
export const draftSignature = (d) => sig({ title: d.title, leadingValue: d.leadingValue || "", tags: d.tags || [], stages: d.stages || [] });

export function findDuplicates(db, draft, { n = 3, exceptId = null } = {}) {
  const mine = draftSignature(draft);
  const title = norm(draft.title || "");
  const out = [];
  for (const r of db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all()) {
    if (exceptId && r.id === exceptId) continue;
    const b = rowToActivity(r);
    const score = jaccard(mine, sig(b));
    const same = !!title && norm(b.title) === title;
    if (score >= 0.25 || same) out.push({ id: b.id, title: b.title, ageGroup: b.ageGroup, durationMin: b.durationMin, leadingValue: b.leadingValue, score: Math.round(score * 100) / 100, level: same || score >= 0.6 ? "near" : "similar", sameTitle: same });
  }
  out.sort((p, q) => Number(q.sameTitle) - Number(p.sameTitle) || q.score - p.score || p.id - q.id);
  const items = out.slice(0, n);
  return { items, hasNear: items.some((x) => x.level === "near") };
}

// ───────────────────────── פריט 4: מגוון ─────────────────────────

const entropy = (counts) => {
  const total = counts.reduce((s, x) => s + x, 0);
  if (counts.length < 2 || !total) return 0;
  return -counts.reduce((s, c) => s + (c ? (c / total) * Math.log(c / total) : 0), 0) / Math.log(counts.length);
};

/** פריט 4: כמה מגוונות הפעולות של המדריך ב-90 הימים האחרונים: סוגים, שיטות וערכים. מבוסס על הפעלות שתועדו, ואם אין מספיק אז על פעולות שיצר. */
export function diversity(db, userId, { days = 90, now = Date.now() } = {}) {
  const sinceDay = new Date(now - days * 86400000).toISOString().slice(0, 10);
  const sinceIso = new Date(now - days * 86400000).toISOString();
  let rows = db.prepare("SELECT a.kind, a.methods_json, a.leading_value, a.age_group FROM runs r JOIN activities a ON a.id = r.activity_id WHERE r.user_id = ? AND r.ran_on >= ?").all(userId, sinceDay);
  let source = "runs";
  if (rows.length < 3) {
    rows = db.prepare("SELECT kind, methods_json, leading_value, age_group FROM activities WHERE owner_id = ? AND created_at >= ? AND status != 'ARCHIVED'").all(userId, sinceIso);
    source = "created";
  }
  const count = (list) => {
    const m = new Map();
    for (const x of list) if (x) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const kinds = count(rows.map((r) => r.kind));
  const values = count(rows.map((r) => norm(r.leading_value || "")));
  const methods = count(rows.flatMap((r) => JSON.parse(r.methods_json || "[]").map((m) => m.name)));
  const top = (m) => [...m.entries()].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0]), "he"))[0];
  const flags = [];
  const n = rows.length;
  if (n >= 4) {
    const [k, c] = top(kinds) ?? [];
    if (k && c / n >= 0.5) flags.push(`${c} מתוך ${n} הפעולות הן מסוג "${KINDS[k]?.label ?? k}". כדאי לגוון.`);
    const [v, vc] = top(values) ?? [];
    if (v && vc / n >= 0.5) flags.push(`${vc} מתוך ${n} הפעולות עוסקות באותו ערך ("${v}").`);
    const [mname, mc] = top(methods) ?? [];
    if (mname && mc / n >= 0.8) flags.push(`השיטה "${mname}" מופיעה כמעט בכל פעולה (${mc} מתוך ${n}).`);
  }
  const score = n < 3 ? null : clamp((entropy([...kinds.values()]) * 0.4 + entropy([...methods.values()]) * 0.3 + entropy([...values.values()]) * 0.3) * 100);
  const level = score === null ? "none" : score >= 70 ? "good" : score >= 45 ? "ok" : "low";
  return {
    days,
    source,
    count: n,
    score,
    level,
    flags,
    kinds: KIND_IDS.map((id) => ({ id, label: KINDS[id].label, count: kinds.get(id) || 0 })),
    missingKinds: KIND_IDS.filter((id) => !kinds.has(id)).map((id) => KINDS[id].label).slice(0, 4),
    topMethods: [...methods.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([name, c]) => ({ name, count: c })),
    note: score === null ? "עוד אין מספיק פעולות כדי למדוד מגוון. תעדו הפעלות ביומן ההפעלות." : "",
  };
}

// ───────────────────────── פריט 7: התאמה למספר תנאים ─────────────────────────

export const EXTRA_CONDITIONS = {
  dark: {
    label: "חושך או ערב",
    group: "מקום וזמן",
    equipment: "פנסים לכל קבוצה, אפודים זוהרים או סרטים זוהרים",
    safety: "בחושך: ספירת חניכים לפני ואחרי כל מעבר, אף אחד לא יוצא לבד, ופנס לכל קבוצה.",
    tips: ["להתחיל במקום מואר ולהסביר את גבולות הגזרה לפני שמחשיכים.", "המשחק נעשה בהליכה ובקבוצות צמודות, בלי ריצה בחושך.", "הצופיות המעשית נעשית עם פנסים: סימנים, קשרים או התבוננות בכוכבים.", "הדיון נעשה סביב מקור אור קטן, במעגל צפוף.", "לסיים בספירה ובדיקה שכולם יוצאים עם מי שאספו אותו."],
    move: "בחושך: מחליפים ריצה בהליכה זריזה בזוגות.",
  },
  "no-gear": {
    label: "בלי ציוד",
    group: "ציוד",
    equipment: "אין ציוד. משתמשים בגוף, בקול ובמה שיש במקום",
    safety: "בלי ציוד: לבדוק שהמקום פנוי ממכשולים, ולא לאלתר חפצים חדים או כבדים במקום הציוד.",
    tips: ["הפתיחה נעשית בסיפור או בשאלה, בלי חפץ.", "המשחק נעשה בעזרת הגוף: תנועה, קול או ספירה במקום כדורים וכרטיסים.", "הצופיות המעשית נעשית עם מה שיש: ענפים, אבנים או חפצים אישיים של החניכים.", "הדיון נעשה בעל פה, בלי דפים. כל אחד יכול להחזיק רעיון אחד בראש.", "הסיכום בעל פה: כל אחד אומר משפט אחד."],
    move: "בלי ציוד: מחליפים כדור או חבל בתנועה משותפת.",
  },
  cold: {
    label: "קור",
    group: "מזג אוויר",
    equipment: "בגדים חמים, מקום מוגן מהרוח, משקה חם אם אפשר",
    safety: "בקור: להתחיל בתנועה כדי להתחמם, לא להשאיר חניכים לעמוד במקום, ולבדוק שלכולם יש בגדים חמים.",
    tips: ["להתחיל בתנועה קלה כדי שהקבוצה תתחמם.", "המשחק תנועתי ויציאה מהירה, בלי עצירות ארוכות.", "הצופיות המעשית נעשית בזוגות בתנועה או במקום מוגן.", "הדיון נעשה במעגל צפוף ומוגן מהרוח, ולא יותר מדי ארוך.", "לסיים בזמן, כדי שאף אחד לא יחכה בקור."],
    move: "בקור: מחליפים עמידה במקום בתנועה קלה.",
  },
};

export const ALL_CONDITIONS = { ...CONDITIONS, ...EXTRA_CONDITIONS };
const CONDITION_GROUPS = { rain: "מזג אוויר", heat: "מזג אוויר", "small-room": "מקום וזמן", few: "גודל קבוצה", many: "גודל קבוצה", beginners: "הרכב הקבוצה", strong: "הרכב הקבוצה", mixed: "הרכב הקבוצה", restless: "הרכב הקבוצה", mobility: "צרכים מיוחדים", vision: "צרכים מיוחדים", hearing: "צרכים מיוחדים", attention: "צרכים מיוחדים", language: "צרכים מיוחדים" };
export const conditionList = () => Object.entries(ALL_CONDITIONS).map(([key, c]) => ({ key, label: c.label, group: c.group ?? CONDITION_GROUPS[key] ?? "אחר" }));

export const CONTRADICTIONS = [
  ["few", "many"],
  ["beginners", "strong"],
];

/** מוסיף טקסט רק אם הוא נכנס במגבלת האורך (ולא חותך באמצע משפט). */
function appendFit(base, add, max) {
  const out = `${base}\n${add}`;
  return out.length <= max ? { text: out, fit: true } : { text: base, fit: false };
}

/** פריט 7: התאמה לכמה תנאים בבת אחת (עד 3), למשל גשם + קבוצה גדולה + בלי ציוד. */
export function adaptMany(a, keys) {
  const list = [...new Set(keys)];
  if (!list.length || list.length > 3) throw Object.assign(new Error("אפשר לבחור בין תנאי אחד לשלושה"), { status: 400 });
  for (const k of list) if (!Object.hasOwn(ALL_CONDITIONS, k)) throw Object.assign(new Error("תנאי לא מוכר"), { status: 400 });
  for (const [x, y] of CONTRADICTIONS) if (list.includes(x) && list.includes(y)) throw Object.assign(new Error(`אי אפשר לשלב "${ALL_CONDITIONS[x].label}" עם "${ALL_CONDITIONS[y].label}"`), { status: 400 });
  const cs = list.map((k) => ALL_CONDITIONS[k]);
  const label = cs.map((c) => c.label).join(" + ");
  let trimmed = false;
  const MOVE = /רצ|ריצה|תחנות|מירוץ|תנועה|בהליכה|עוברים בין/;
  const stages = a.stages.map((s, i) => {
    let content = s.content;
    const moves = new Set();
    for (const c of cs) {
      const r = appendFit(content, `התאמה (${c.label}): ${c.tips[i]}`, 3000);
      content = r.text;
      if (!r.fit) trimmed = true;
      if (MOVE.test(s.content)) moves.add(c.move);
    }
    for (const m of moves) {
      const r = appendFit(content, m, 3000);
      content = r.text;
      if (!r.fit) trimmed = true;
    }
    return { ...s, content };
  });
  let equipment = a.equipment;
  let safety = a.safetyNotes;
  for (const c of cs) {
    const e = `${equipment}. בנוסף: ${c.equipment}`;
    if (e.length <= 500) equipment = e;
    else trimmed = true;
    const sf = `${safety} ${c.safety}`;
    if (sf.length <= 1000) safety = sf;
    else trimmed = true;
  }
  const title = `${a.title} (גרסת ${label})`;
  return { title: title.slice(0, 120), equipment, safetyNotes: safety, tags: [...new Set([...a.tags, ...cs.map((c) => `גרסת ${c.label}`)])].slice(0, 20), stages, applied: cs.map((c) => c.label), trimmed };
}

// פריט 8 (ציר זמן והתראה על סכום דקות) חי בצד הלקוח, ב-frontend/src/lib/lab74.ts, כדי שיעבוד גם בזמן עריכה. הבדיקות בשרת מייבאות אותו משם.

// ───────────────────────── פריט 9: סריקת בטיחות מורחבת ─────────────────────────

const BASE_SEVERITY = { running: 1, contact: 2, blindfold: 2, water: 3, fire: 3, height: 3, sharp: 3, dark: 2, outside: 2, photos: 1, food: 1, sensitive: 2 };

export const RISKS_EXT = [
  { id: "sun", label: "שמש וחום", severity: 2, re: /שמש|קיץ|צהריים|חם מאוד|חום כבד/, cover: /מים|צל|כובע|שתייה/, suggestion: "מים לכל חניך, מקום מוצל והפסקות שתייה כל 10 דקות." },
  { id: "cold", label: "קור, גשם ובוץ", severity: 1, re: /גשם|קור|בוץ|רטוב|חורף/, cover: /בגדים|חם|יבש|מחליק/, suggestion: "בגדים חמים ויבשים, ומשטח לא חלק להליכה ולמשחק." },
  { id: "animals", label: "בעלי חיים", severity: 2, re: /כלב|חתול|סוס|בעלי חיים|חיות|נחש|עקרב|דבורים/, cover: /אלרגי|מבוגר|מרחק|לא נוגעים/, suggestion: "לשאול על אלרגיות ופחדים, לשמור מרחק, ולא לגעת בלי אישור של מבוגר אחראי." },
  { id: "electric", label: "חשמל", severity: 3, re: /חשמל|שקע|כבל|מטען|מפצל|מערכת הגברה/, cover: /מבוגר|בדיקה|מוגן|לא נוגעים/, suggestion: "רק מבוגר מחבר ומנתק, כבלים לא על הרצפה במעבר, ובלי מים ליד חשמל." },
  { id: "glass", label: "זכוכית ושברים", severity: 2, re: /זכוכית|מראה|בקבוק זכוכית|קרמיקה|צלחות/, cover: /שבר|כפפות|פלסטיק|מבוגר/, suggestion: "להעדיף פלסטיק, ולהחליט מראש מי אוסף שברים (מבוגר, עם כפפות)." },
  { id: "vehicles", label: "רכבים ותנועה", severity: 3, re: /אופניים|קורקינט|רכב|מכונית|אוטובוס|רכבת|כביש/, cover: /קסדה|מבוגר|מעבר חציה|כביש|מלווה/, suggestion: "קסדה לכל רוכב, מלווה בקדמת הקבוצה ובסופה, וחציית כביש רק במעבר ובליווי." },
  { id: "online", label: "אינטרנט ואנשים זרים", severity: 2, re: /אינטרנט|צ'אט|קבוצת וואטסאפ|רשת חברתית|אפליקציה|זרים|אנשים שלא מכירים/, cover: /פרטיות|לא חושפים|מבוגר|לא משתפים/, suggestion: "לא חושפים שם מלא, כתובת או בית ספר, ומבוגר מלווה כל פעילות מקוונת." },
  { id: "chemicals", label: "חומרים מסוכנים", severity: 3, re: /חומר כימי|נפץ|זיקוקים|אבקה|דלק|בנזין|ספירט|מנקה/, cover: /מבוגר|ללא|מוסמך|לא נוגעים/, suggestion: "חומרים כאלה רק בידי מבוגר מוסמך. אם אפשר, להחליף בחלופה בטוחה." },
  { id: "trip", label: "מדרגות, סלעים ושטח לא אחיד", severity: 1, re: /מדרגות|סלע|סלעים|שטח לא מישורי|בור|רצפה חלקה|שיפוע/, cover: /זהירות|נעליים|סימון|הליכה/, suggestion: "נעליים סגורות, סימון מכשולים, והליכה במקום ריצה בשטח לא אחיד." },
  { id: "exposure", label: "חשיפה רגשית", severity: 2, re: /חושפים|סוד|סודות|פגיעה|כאב|אובדן|מספרים על עצמם|סיפור אישי/, cover: /לדלג|רשות|בחירה|לא חייבים|מותר שלא/, suggestion: "להבהיר שאין חובה לשתף, שאפשר לדלג, ושמה שנאמר בקבוצה נשאר בקבוצה." },
  { id: "elimination", label: "משחק הדחה", severity: 1, re: /מודחים|הדחה|יוצא מהמשחק|נפסל|נפסלים|מי שנתפס יוצא|מי שמפסיד יוצא/, cover: /חוזר|מחזיר|לא מודח|תפקיד|משימה|לא יוצאים/, suggestion: "חניך שהודח לא יושב בצד: נותנים לו תפקיד (שופט, מנהל נקודות) או מחזירים אותו אחרי זמן קצר." },
  { id: "captains", label: "בחירת קבוצות על ידי קפטנים", severity: 1, re: /קפטנים|קפטן בוחר|בוחרים קבוצות|בוחרים חברים לקבוצה/, cover: /הגרלה|מחלק|המדריך מחלק|חלוקה מראש/, suggestion: "המדריך מחלק לקבוצות או מגריל, כדי שאף חניך לא יהיה האחרון שנבחר." },
];

/** כללים שתלויים בהקשר: גיל, גודל קבוצה ואורך המשחק. */
const CONTEXT_RULES = [
  {
    id: "young-supervision",
    label: "גיל צעיר ופעילות מסוכנת",
    severity: 3,
    when: (a, ids, band) => band === "young" && ["fire", "sharp", "height", "water"].some((x) => ids.has(x)),
    covered: (a) => /מבוגר צמוד|מבוגר לכל קבוצה|מבוגר ליד כל/.test(a.safetyNotes || ""),
    suggestion: "בכיתות ג'–ד' כל פעילות עם אש, כלים חדים, גובה או מים דורשת מבוגר צמוד לכל קבוצה קטנה, ולא רק השגחה כללית.",
  },
  {
    id: "large-group",
    label: "קבוצה גדולה ופעילות תנועתית",
    severity: 2,
    when: (a, ids) => (a.groupSize || 0) > 40 && ["running", "contact", "blindfold"].some((x) => ids.has(x)),
    covered: (a) => /מדריך נוסף|מבוגר נוסף|אחראי לכל קבוצה|מחלקים לקבוצות/.test(a.safetyNotes || ""),
    suggestion: "בקבוצה של יותר מ-40 חניכים מחלקים לקבוצות קטנות, ולכל קבוצה יש מדריך או אחראי.",
  },
  {
    id: "long-energetic",
    label: "פעילות תנועתית ארוכה",
    severity: 1,
    when: (a) => !!a.energeticMode && (a.stages?.[1]?.minutes || 0) > 25,
    covered: (a) => /הפסקת מים|הפסקת שתייה|שתייה/.test(a.safetyNotes || ""),
    suggestion: "המשחק התנועתי ארוך מ-25 דקות: הוסיפו הפסקת מים באמצע.",
  },
];

/** פריט 9: סריקת בטיחות מורחבת. כוללת את הבדיקה הקיימת, עוד 12 סוגי סיכון, וכללי גיל וגודל קבוצה. */
export function safetyScan(a) {
  const base = safetyReview(a);
  const notes = a.safetyNotes || "";
  const items = base.risks.map((r) => ({ ...r, severity: BASE_SEVERITY[r.id] ?? 1, origin: "base" }));
  for (const r of RISKS_EXT) {
    const found = (a.stages || []).filter((s) => r.re.test(s.content || "")).map((s) => s.name);
    if (!found.length && !r.re.test(a.equipment || "")) continue;
    items.push({ id: r.id, label: r.label, stages: found, suggestion: r.suggestion, covered: r.cover.test(notes), severity: r.severity, origin: "ext" });
  }
  const ids = new Set(items.map((x) => x.id));
  const band = ageBand(a.ageGroup)?.band ?? null;
  const context = CONTEXT_RULES.filter((c) => c.when(a, ids, band)).map((c) => ({ id: c.id, label: c.label, severity: c.severity, suggestion: c.suggestion, covered: c.covered(a), origin: "context" }));
  if (items.length && words(notes) < 4) context.push({ id: "empty-notes", label: "הערות בטיחות חסרות", severity: 2, suggestion: "זוהו גורמי סיכון אבל הערות הבטיחות ריקות או קצרות מאוד. הוסיפו לפחות משפט אחד לכל סיכון.", covered: false, origin: "context" });
  const all = [...items, ...context].sort((x, y) => Number(x.covered) - Number(y.covered) || y.severity - x.severity || String(x.id).localeCompare(String(y.id)));
  const missing = all.filter((x) => !x.covered);
  const PEN = { 1: 6, 2: 12, 3: 20 };
  const score = clamp(100 - missing.reduce((s, x) => s + (PEN[x.severity] ?? 6), 0));
  const sev3 = missing.filter((x) => x.severity === 3).length;
  const level = sev3 >= 2 || score < 60 ? "high" : sev3 === 1 || score < 90 ? "attention" : "ok";
  const lines = missing.filter((x) => x.id !== "empty-notes").map((x) => (x.origin === "context" ? x.suggestion : `${x.label}: ${x.suggestion}`));
  let addition = lines.join(" ");
  const room = 1000 - notes.length - 1;
  if (addition.length > room) addition = addition.slice(0, Math.max(0, room)).replace(/\s\S*$/, "");
  return { risks: all, missingCount: missing.length, ok: missing.length === 0, score, level, addition, extended: all.filter((x) => x.origin !== "base").length };
}

// ───────────────────────── פריט 10: הצעות תגיות ─────────────────────────

const TAG_WORDS = ["חנוכה", "פורים", "פסח", "סוכות", "שבועות", "ראש השנה", "יום כיפור", "שואה", "יום הזיכרון", "עצמאות", "מדורה", "לילה", "טיול", "חורף", "קיץ", "גשם", "פתיחת שנה", "מחנה"];

/** פריט 10: תגיות שכדאי להוסיף: קודם מהתגיות ששימשו אותך בעבר ומופיעות בפעולה, ואחר כך מהתוכן עצמו. */
export function tagSuggestions(a, mine = [], { max = 8, current = [] } = {}) {
  const have = new Set(current.map((t) => norm(t)));
  const text = norm([a.title, a.leadingValue, a.tags?.join(" "), allText(a)].join(" "));
  const out = [];
  const seen = new Set(have);
  const add = (tag, why) => {
    const k = norm(tag);
    if (!k || seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push({ tag: String(tag).slice(0, 24), why });
  };
  for (const t of mine) {
    const k = norm(t.tag ?? t);
    if (k.length >= 2 && text.includes(k)) add(t.tag ?? t, "התגית שלך");
  }
  for (const w of TAG_WORDS) if (text.includes(norm(w))) add(w, "מהתוכן");
  if (gearLoad(a.equipment || "") <= 1) add("ציוד קל", "מהתוכן");
  if ((a.durationMin || 0) <= 30) add("קצרה", "מהתוכן");
  if ((a.durationMin || 0) >= 75) add("ארוכה", "מהתוכן");
  for (const t of accessTags(a).slice(0, 3)) add(t.label, "מהתוכן");
  if (a.leadingValue) add(a.leadingValue.slice(0, 24), "הערך המוביל");
  const b = ageBand(a.ageGroup);
  if (b) add(b.label, "גיל");
  return out;
}

// ───────────────────────── פריט 12: מה עבד לי ─────────────────────────

/** פריט 12: הפעולות שהפעלת, מדורגות לפי מעורבות החניכים שתיעדת (1–3) וכמה פעמים הפעלת. */
export function workedForMe(db, userId, { now = Date.now(), limit = 30 } = {}) {
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.age_group, a.duration_min, COUNT(*) AS runs, AVG(r.engagement) AS eng, COUNT(r.engagement) AS eng_n, MAX(r.ran_on) AS last_ran,
              (SELECT r2.worked FROM runs r2 WHERE r2.activity_id = a.id AND r2.user_id = r.user_id AND r2.worked IS NOT NULL AND r2.worked != '' ORDER BY r2.ran_on DESC, r2.id DESC LIMIT 1) AS note
       FROM runs r JOIN activities a ON a.id = r.activity_id WHERE r.user_id = ? AND a.status != 'ARCHIVED' GROUP BY a.id`,
    )
    .all(userId);
  const items = rows
    .map((r) => {
      const days = Math.max(0, Math.floor((now - Date.parse(`${r.last_ran}T12:00:00Z`)) / 86400000));
      const avg = r.eng_n ? Math.round(r.eng * 100) / 100 : null;
      return { id: r.id, title: r.title, ageGroup: r.age_group, durationMin: r.duration_min, runs: r.runs, avgEngagement: avg, lastRan: r.last_ran, daysSince: days, note: r.note || "", repeatable: avg !== null && avg >= 2.4 && days >= 45, score: (avg ?? 1.5) * 2 + Math.min(r.runs, 5) * 0.5 };
    })
    .sort((x, y) => y.score - x.score || y.runs - x.runs || x.id - y.id)
    .slice(0, limit);
  return { items, total: rows.length, scale: "מעורבות: 1 נמוכה, 3 גבוהה" };
}

// ───────────────────────── פריט 13: השוואה ─────────────────────────

export function compareActivities(db, ids) {
  const items = [];
  for (const id of ids) {
    const r = db.prepare("SELECT * FROM activities WHERE id = ?").get(id);
    if (!r || !["PUBLISHED", "PENDING", "UNLISTED"].includes(r.status)) continue;
    const a = rowToActivity(r);
    const rat = db.prepare("SELECT COUNT(*) AS c, AVG(stars) AS avg FROM ratings WHERE activity_id = ?").get(id);
    const runs = db.prepare("SELECT COUNT(*) AS c FROM runs WHERE activity_id = ?").get(id).c;
    const q = qualityReport(a);
    const sf = safetyScan(a);
    items.push({
      id: a.id,
      title: a.title,
      ageGroup: a.ageGroup,
      durationMin: a.durationMin,
      groupSize: a.groupSize,
      leadingValue: a.leadingValue,
      kind: a.kind ? KINDS[a.kind]?.label ?? a.kind : "",
      methods: (a.methods || []).map((m) => m.name),
      stageMinutes: (a.stages || []).map((s) => s.minutes),
      gearLoad: gearLoad(a.equipment || ""),
      gearItems: gearItems(a.equipment || "").filter((x) => !x.free && !x.optional).length,
      safetyMissing: sf.missingCount,
      safetyScore: sf.score,
      quality: q.overall,
      qualityGrade: q.grade,
      rating: { count: rat.c, average: rat.c ? Math.round(rat.avg * 10) / 10 : 0 },
      runCount: runs,
      access: accessTags(a).map((t) => t.label),
    });
  }
  const pick = (label, key, dir, filter = () => true) => {
    const c = items.filter(filter);
    if (c.length < 2) return null;
    const best = c.reduce((m, x) => (dir * (x[key] - m[key]) > 0 ? x : m), c[0]);
    const tied = c.filter((x) => x[key] === best[key]).length > 1;
    return tied ? null : { label, id: best.id, title: best.title };
  };
  const highlights = [
    pick("הקצרה ביותר", "durationMin", -1),
    pick("הציוד הקל ביותר", "gearLoad", -1),
    pick("הציון הגבוה ביותר", "quality", 1),
    pick("הכי מכוסה בבטיחות", "safetyScore", 1),
    pick("הכי הרבה הפעלות", "runCount", 1, (x) => x.runCount > 0),
  ].filter(Boolean);
  return { items, highlights };
}

// ───────────────────────── פריט 15: הבדלים בין גרסאות, שורה אחרי שורה ─────────────────────────

/** הבדל שורות (LCS). מחזיר [{ op: "same" | "add" | "del", text }]. מוגבל ל-300 שורות לכל צד. */
export function lineDiff(before, after) {
  const A = String(before ?? "").split("\n").slice(0, 300);
  const B = String(after ?? "").split("\n").slice(0, 300);
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) ops.push({ op: "same", text: A[i++] }), j++;
    else if (L[i + 1][j] >= L[i][j + 1]) ops.push({ op: "del", text: A[i++] });
    else ops.push({ op: "add", text: B[j++] });
  }
  while (i < n) ops.push({ op: "del", text: A[i++] });
  while (j < m) ops.push({ op: "add", text: B[j++] });
  return ops;
}

/** משאיר רק שורות ששונו ושורת הקשר אחת מכל צד. קטעים שלא השתנו מקוצרים ל-{ op: "skip", n }. */
export function compactDiff(ops, context = 1) {
  const keep = ops.map((o) => o.op !== "same");
  const near = keep.map((k, i) => k || keep.slice(Math.max(0, i - context), i + context + 1).some(Boolean));
  const out = [];
  let skipped = 0;
  ops.forEach((o, i) => {
    if (near[i]) {
      if (skipped) out.push({ op: "skip", n: skipped });
      skipped = 0;
      out.push(o);
    } else skipped++;
  });
  if (skipped) out.push({ op: "skip", n: skipped });
  return out;
}

const SNAP_FIELDS = [
  ["title", "שם הפעולה"],
  ["ageGroup", "שכבת גיל"],
  ["groupSize", "גודל קבוצה"],
  ["leadingValue", "ערך מוביל"],
  ["equipment", "ציוד"],
  ["safetyNotes", "בטיחות ורגישות"],
  ["conclusionNote", "סיכום"],
];

/** פריט 15: מה השתנה בין שני מצבים של פעולה (גרסה מול גרסה, או גרסה מול הנוכחית). */
export function snapshotDiff(from, to) {
  const fields = [];
  for (const [k, label] of SNAP_FIELDS) {
    const x = String(from[k] ?? "");
    const y = String(to[k] ?? "");
    if (x !== y) fields.push({ field: k, label, ops: compactDiff(lineDiff(x, y)) });
  }
  const stages = [];
  (to.stages || []).forEach((t, i) => {
    const f = from.stages?.[i];
    if (!f) return;
    const minutes = f.minutes !== t.minutes ? [f.minutes, t.minutes] : null;
    const ops = f.content !== t.content ? compactDiff(lineDiff(f.content, t.content)) : [];
    if (minutes || ops.length) stages.push({ index: i, name: t.name, minutes, ops });
  });
  const tags = (from.tags || []).join(",") !== (to.tags || []).join(",") ? { before: from.tags || [], after: to.tags || [] } : null;
  return { fields, stages, tags, changed: fields.length + stages.length + (tags ? 1 : 0) };
}

// ───────────────────────── פריט 16: דוח ייבוא ─────────────────────────

const PLACEHOLDER_RE = /לא זוהה תוכן לשלב הזה/;

/** פריט 16: מה צריך להשלים אחרי ייבוא מקובץ, לפני שמפרסמים. */
export function importReport(db, draft) {
  const st = draft.stages || [];
  const issues = [];
  const missing = st.filter((s) => PLACEHOLDER_RE.test(s.content || ""));
  for (const s of missing) issues.push({ id: `stage-${s.name}`, level: "high", text: `לא זוהה תוכן לשלב "${s.name}"`, tip: "הוסיפו אותו בעריכה לפני הפרסום." });
  for (const s of st) if (!PLACEHOLDER_RE.test(s.content || "") && words(s.content) < 8) issues.push({ id: `short-${s.name}`, level: "medium", text: `התוכן של "${s.name}" קצר מאוד`, tip: "כתבו מה המדריך אומר ומה החניכים עושים." });
  if (!draft.equipment) issues.push({ id: "equipment", level: "medium", text: "לא צוין ציוד", tip: "כתבו מה צריך להכין, או שאין ציוד." });
  if (!draft.safetyNotes) issues.push({ id: "safety", level: "medium", text: "לא צוינו הערות בטיחות", tip: "גם אם אין סיכון מיוחד, כתבו משפט אחד." });
  if (!draft.leadingValue) issues.push({ id: "value", level: "medium", text: "לא זוהה ערך מוביל", tip: "ערך אחד שהפעולה מכוונת אליו." });
  if (!/^כיתה\s/.test(draft.ageGroup || "")) issues.push({ id: "age", level: "medium", text: "שכבת הגיל לא זוהתה בוודאות", tip: "בחרו שכבה ידנית." });
  const total = st.reduce((s, x) => s + (x.minutes || 0), 0);
  if (total < 15 || total > 150) issues.push({ id: "duration", level: "medium", text: `אורך הפעולה (${total} דקות) נראה חריג`, tip: "בדקו את הזמנים בכל שלב." });
  const longest = st.reduce((m, x) => (x.minutes > m ? x.minutes : m), 0);
  if (total && longest / total > 0.6) issues.push({ id: "balance", level: "medium", text: "שלב אחד תופס יותר מ-60% מהזמן", tip: "בדקו שהזמנים נקראו נכון מהקובץ." });
  const dup = db ? findDuplicates(db, { title: draft.title, leadingValue: draft.leadingValue, stages: st, tags: [] }, { n: 2 }) : { items: [], hasNear: false };
  if (dup.hasNear) issues.push({ id: "duplicate", level: "high", text: `נראה דומה מאוד לפעולה קיימת: "${dup.items[0].title}"`, tip: "בדקו שאין כפילות לפני שמפרסמים." });
  const pii = privacyScan({ title: draft.title, leadingValue: draft.leadingValue, equipment: draft.equipment, safetyNotes: draft.safetyNotes, stages: st, tags: [] });
  if (pii.count) issues.push({ id: "privacy", level: "high", text: `נמצאו ${pii.count} פרטים אישיים אפשריים (טלפון, מייל, כתובת או שם)`, tip: "הסירו אותם לפני הפרסום." });
  const PEN = { high: 20, medium: 8 };
  const readiness = clamp(100 - issues.reduce((s, x) => s + PEN[x.level], 0));
  return { readiness, label: readiness >= 85 ? "מוכנה לפרסום" : readiness >= 60 ? "כמעט מוכנה" : "דורשת השלמות", issues, duplicates: dup.items };
}

// ───────────────────────── פריט 17: כיסוי חגים ─────────────────────────

const HOLIDAY_WORDS = {
  "ראש השנה": ["ראש השנה", "חשבון נפש", "שנה חדשה"],
  "יום כיפור": ["יום כיפור", "כיפור", "סליחה", "פיוס"],
  "סוכות": ["סוכות", "סוכה", "הכנסת אורחים"],
  "שמחת תורה": ["שמחת תורה"],
  "חנוכה": ["חנוכה", "חנוכיה", "חשמונאים", "נס פח השמן"],
  "ט\"ו בשבט": ["טו בשבט", "שתילה", "ט\"ו בשבט"],
  "פורים": ["פורים", "מגילה", "משלוח מנות", "מסכות"],
  "פסח": ["פסח", "הגדה", "יציאת מצרים", "חירות"],
  "יום השואה": ["שואה", "גבורה", "הנצחה"],
  "יום הזיכרון": ["יום הזיכרון", "נופלים", "הנצחה"],
  "יום העצמאות": ["עצמאות", "דגל", "מדינה"],
  "ל\"ג בעומר": ["לג בעומר", "ל\"ג בעומר", "מדורה"],
  "יום ירושלים": ["ירושלים"],
  "שבועות": ["שבועות", "ביכורים"],
  "ט\"ו באב": ["טו באב", "ט\"ו באב"],
};

/** פריט 17: לכל חג בחודשים הקרובים, כמה פעולות במאגר מתאימות, ואיזה חג אין לו עדיין פעולה. */
export function holidayCoverage(db, from = new Date(), days = 90) {
  const t = suggestTopics(from, days);
  const rows = db.prepare("SELECT id, title, tags_json, leading_value, stages_json FROM activities WHERE status = 'PUBLISHED'").all().map((r) => ({ id: r.id, title: r.title, strong: norm([r.title, r.leading_value, ...JSON.parse(r.tags_json)].join(" ")), body: norm(JSON.parse(r.stages_json).map((s) => s.content).join(" ")) }));
  const events = t.events.map((e) => {
    const keys = (HOLIDAY_WORDS[e.name] ?? [e.name]).map(norm);
    const own = norm(e.name);
    const match = rows.filter((r) => keys.some((k) => r.strong.includes(k)) || r.body.includes(own));
    return { name: e.name, date: e.date, inDays: e.inDays, have: match.length, items: match.slice(0, 3).map((m) => ({ id: m.id, title: m.title })), gap: match.length === 0, idea: e.suggestions[0] ?? null };
  });
  return { days, events, gaps: events.filter((e) => e.gap).length };
}

// ───────────────────────── פריט 14: פעולה לשכבה אחרת ─────────────────────────

/** פריט 14: מוסיף לכל שלב הערת התאמה לשכבת הגיל החדשה. הכתיבה עצמה נשארת של המדריך. */
export function ageAdaptedStages(stages, ageGroup) {
  const b = ageBand(ageGroup);
  if (!b) return { stages, note: "" };
  const out = stages.map((s, i) => {
    const add = `התאמה ל${b.label}: ${BAND_HINTS[b.band][i]}`;
    const next = `${s.content}\n${add}`;
    return next.length <= 3000 ? { ...s, content: next } : s;
  });
  return { stages: out, note: b.label };
}

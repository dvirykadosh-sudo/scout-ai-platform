// הצעות מתודה לעורך הכתיבה החופשי (רעיונות 113–126).
// הכול מבוסס כללים וספריית המתודות, בלי מודל שפה: מזהים מה כתבתם, מה חסר, ומדרגים מתודות
// לפי סוג השלב, הזמן, גודל הקבוצה, הציוד, הערך וההעדפות האישיות. לכל הצעה יש הסבר למה הוצעה.
import { GEAR_GROUPS } from "./gear.js";
import { METHOD_KEYS, has, norm, words } from "./assist.js";
import { SWAP, topicOf } from "./assist2.js";
import { METHOD_NAMES } from "./shared/constants.js";

export const CATEGORIES = {
  game: ["משחק תחרות", "עשייה", "משחק הדמייה", "הבעה יצירתית", "ייצוג"],
  talk: ["דיון בשאלה", "שיתוף", "חשיבה משותפת"],
  take: ["הסבר", "השראה", "התבוננות", "פירוק"],
};
const CAT_LABEL = { game: "עשייה ומשחק", talk: "שיחה", take: "קבלה והתבוננות" };
export const catOf = (method) => Object.keys(CATEGORIES).find((c) => CATEGORIES[c].includes(method)) || null;

// התאמת מתודה לסוג השלב: 2 מצוין, 1 טוב, 0 ניטרלי, -1 פחות מתאים
const KIND_FIT = {
  open: { "משחק תחרות": 2, "השראה": 2, "שיתוף": 2, "התבוננות": 1, "הבעה יצירתית": 1, "משחק הדמייה": 0, "הסבר": 0, "דיון בשאלה": 0, "עשייה": -1, "פירוק": -1, "ייצוג": -1, "חשיבה משותפת": -1 },
  body: { "משחק תחרות": 2, "עשייה": 2, "ייצוג": 2, "משחק הדמייה": 2, "חשיבה משותפת": 1, "הבעה יצירתית": 1, "הסבר": 1, "פירוק": 1, "התבוננות": 0, "השראה": 0, "דיון בשאלה": 0, "שיתוף": -1 },
  peak: { "השראה": 2, "הבעה יצירתית": 2, "משחק הדמייה": 2, "שיתוף": 2, "עשייה": 1, "דיון בשאלה": 1, "התבוננות": 1, "ייצוג": 0, "חשיבה משותפת": 0, "פירוק": 0, "משחק תחרות": -1, "הסבר": -1 },
  close: { "שיתוף": 2, "התבוננות": 2, "השראה": 1, "דיון בשאלה": 1, "הבעה יצירתית": 1, "חשיבה משותפת": 0, "פירוק": 0, "משחק תחרות": -1, "עשייה": -1, "הסבר": -1, "ייצוג": -2, "משחק הדמייה": -2 },
  free: {},
};
const MIN_MINUTES = { "משחק תחרות": 8, "עשייה": 15, "ייצוג": 12, "הבעה יצירתית": 10, "השראה": 4, "חשיבה משותפת": 10, "דיון בשאלה": 8, "שיתוף": 5, "משחק הדמייה": 12, "התבוננות": 6, "הסבר": 4, "פירוק": 10 };
const DEFAULT_MINUTES = { open: 8, body: 18, peak: 15, close: 7, free: 12 };
// כל אחד מהם מספיק. ציוד שלא סומן בארון מוריד את ההצעה, רק אם המדריך סימן משהו בכלל
const GEAR_NEED = {
  "עשייה": ["paper", "markers", "tape", "bags"],
  "הבעה יצירתית": ["paper", "markers"],
  "ייצוג": ["paper"],
  "משחק הדמייה": ["paper"],
  "חשיבה משותפת": ["paper", "markers"],
  "התבוננות": ["paper"],
};
const GEAR_LABEL = Object.fromEntries(GEAR_GROUPS.map((g) => [g.id, g.label]));

const LINES = {
  "משחק תחרות": [(t) => `מחלקים לקבוצות ועושים מירוץ תחנות קצר סביב "${t}", עם משימה אחת בכל תחנה.`, (t) => `נחלק לקבוצות ונעשה מירוץ תחנות קצר סביב "${t}", עם משימה אחת בכל תחנה.`],
  "עשייה": [(t) => `כל קבוצה בונה או מכינה משהו מוחשי שמבטא את "${t}", ומציגה אותו בחצי דקה.`, (t) => `כל קבוצה תבנה או תכין משהו מוחשי שמבטא את "${t}", ונציג אותו בחצי דקה.`],
  "ייצוג": [(t) => `כל קבוצה מייצגת עמדה אחרת בנושא "${t}" ומציגה אותה בשתי דקות.`, (t) => `כל קבוצה תייצג עמדה אחרת בנושא "${t}" ותציג אותה בשתי דקות.`],
  "הבעה יצירתית": [(t) => `כל אחד מצייר או כותב משפט אחד שמבטא איך נראה "${t}", ומי שרוצה מציג.`, (t) => `כל אחד יצייר או יכתוב משפט אחד שמבטא איך נראה "${t}", ומי שרוצה יציג.`],
  "השראה": [(t) => `מספרים סיפור קצר על אדם שפעל סביב "${t}", ועוצרים בנקודה שבה הוא צריך להחליט.`, (t) => `אספר לכם סיפור קצר על אדם שפעל סביב "${t}", ואעצור בנקודה שבה הוא צריך להחליט.`],
  "חשיבה משותפת": [(t) => `הקבוצה מקבלת בעיה אחת סביב "${t}" וצריכה להחליט יחד על פתרון אחד.`, (t) => `נקבל בעיה אחת סביב "${t}" ונחליט יחד על פתרון אחד.`],
  "דיון בשאלה": [(t) => `שואלים שאלה פתוחה אחת על "${t}", קודם בזוגות ואחר כך בכולם.`, (t) => `נשאל שאלה פתוחה אחת על "${t}", קודם בזוגות ואחר כך בכולם.`],
  "שיתוף": [(t) => `סבב שבו כל אחד אומר משפט אחד על "${t}", ומותר לדלג.`, (t) => `נעשה סבב שבו כל אחד יגיד משפט אחד על "${t}", ומותר לדלג.`],
  "משחק הדמייה": [(t) => `מדמים מצב אמיתי סביב "${t}" עם תפקידים מחולקים מראש, ועוצרים אחרי שלוש דקות להחלפה.`, (t) => `נדמה מצב אמיתי סביב "${t}" עם תפקידים מחולקים מראש, ונעצור אחרי שלוש דקות להחלפה.`],
  "התבוננות": [(t) => `מתבוננים בשקט ורושמים שלושה דברים שלא שמנו לב אליהם בקשר ל"${t}".`, (t) => `נתבונן בשקט ונרשום שלושה דברים שלא שמנו לב אליהם בקשר ל"${t}".`],
  "הסבר": [(t) => `מסבירים בקצרה את "${t}" עם דוגמה אחת, ובודקים הבנה בשאלה.`, (t) => `אסביר בקצרה את "${t}" עם דוגמה אחת, ואבדוק הבנה בשאלה.`],
  "פירוק": [(t) => `מפרקים יחד את "${t}" לשלושה חלקים: מה גורם לזה, מה התוצאות, ודוגמה.`, (t) => `נפרק יחד את "${t}" לשלושה חלקים: מה גורם לזה, מה התוצאות, ודוגמה.`],
};

// מדריך מפורט לכל מתודה: שלבים עם חלק יחסי מהזמן, שאלות, מלכודת נפוצה וציוד (רעיונות 120–121)
const PLAY = {
  "משחק תחרות": {
    steps: [["חוקים בקצרה", "מחלקים לקבוצות שוות ואומרים את החוקים בשלושה משפטים, עם דוגמה אחת מול כולם", 0.15], ["סיבוב ניסיון", "סיבוב קצר בלי ניקוד כדי שכולם יבינו", 0.15], ["המשחק", "מנהלים את התחרות, הניקוד גלוי לכולם, ומדריך אחד שופט", 0.5], ["עצירה וחיבור", "עוצרים לפני שהמתח נגמר ושואלים שאלה אחת שמחברת למה שקרה", 0.2]],
    ask: ["מה עזר לקבוצה שניצחה, ומה כמעט שבר אותה?", "מתי הניקוד הפך לחשוב יותר מהקבוצה?"],
    pitfall: "תחרות יכולה להפוך לריב. קבעו מראש מי שופט ומה עושים כשיש מחלוקת.",
    gear: "שטח פתוח וסימון, דפים לניקוד",
  },
  "עשייה": {
    steps: [["הצגת המשימה", "מראים מה בונים או מכינים ומחלקים את החומרים", 0.15], ["עבודה בקבוצות", "כל קבוצה מתכננת שתי דקות ואז בונה", 0.55], ["הצגה", "כל קבוצה מציגה בחצי דקה מה עשתה", 0.2], ["חיבור", "שואלים איך התוצר מבטא את הנושא", 0.1]],
    ask: ["מה בתוצר שלכם מבטא את הנושא?", "מה הייתם משנים אילו התחלתם מחדש?"],
    pitfall: "מי שמהיר מסיים לפני כולם. הכינו לו משימת הרחבה.",
    gear: "חומרי יצירה, דפים וטושים",
  },
  "ייצוג": {
    steps: [["חלוקת עמדות", "כל קבוצה מקבלת עמדה בסוגיה, בכרטיס קצר", 0.15], ["הכנה", "שלוש דקות להכין טיעון אחד וטיעון נגד", 0.3], ["הצגה", "כל קבוצה מציגה בשתי דקות, בלי להפריע", 0.4], ["יציאה מהתפקיד", "מורידים את התפקיד ושואלים מה באמת חושבים", 0.15]],
    ask: ["איזה טיעון של הצד השני הפתיע אתכם?", "מה הקשה עליכם בעמדה שקיבלתם?"],
    pitfall: "חניך שמייצג עמדה פוגענית עלול להרגיש רע. תנו לכולם דרך ברורה לצאת מהתפקיד.",
    gear: "כרטיסי עמדה",
  },
  "הבעה יצירתית": {
    steps: [["מתחילים מהרגש", "נותנים דקה לחשוב איך הנושא מרגיש, בלי לדבר", 0.15], ["יוצרים", "כל אחד או קבוצה מציירים, כותבים משפט או מציגים בפסל גוף", 0.5], ["הצגה חופשית", "מי שרוצה מציג, ומותר לדלג", 0.25], ["חיבור", "שואלים מה כל אחד שם לב אליו ביצירות של אחרים", 0.1]],
    ask: ["מה ביצירה של מישהו אחר גרם לכם לחשוב?", "מה רציתם להגיד ולא מצאתם מילים?"],
    pitfall: "ביישנים לא מציגים מול כולם. אפשרו הצגה בזוגות או השארת היצירה על הקיר.",
    gear: "דפים, טושים וצבעים",
  },
  "השראה": {
    steps: [["הכנה", "בוחרים סיפור, משל או דמות קצרים שקשורים לנושא (עד 3 דקות)", 0.1], ["מספרים", "מספרים בקול, בלי לקרוא מדף, ועוצרים בנקודת הכרעה", 0.5], ["שאלה אחת", "שואלים מה היה קורה אילו הדמות בחרה אחרת", 0.3], ["שקט קצר", "נותנים עשר שניות שקט לפני שעוברים הלאה", 0.1]],
    ask: ["מה הדמות הזאת הייתה צריכה כדי לבחור כך?", "איפה אצלנו יש רגע כזה?"],
    pitfall: "סיפור ארוך מדי מאבד את הקבוצה. אם עברו חמש דקות, מקצרים.",
    gear: "אין צורך בציוד",
  },
  "חשיבה משותפת": {
    steps: [["הצגת הבעיה", "מציגים דילמה או בעיה אחת, מוחשית ובת זמננו", 0.15], ["חשיבה בקבוצות", "כל קבוצה מציעה פתרון ומסכימה על אחד", 0.45], ["הצגה והכרעה", "הקבוצות מציגות והכיתה מחליטה יחד איך מכריעים", 0.3], ["מה למדנו", "שואלים מה היה קשה בהחלטה משותפת", 0.1]],
    ask: ["איך הגעתם להסכמה, ומי ויתר?", "מה הייתם עושים אחרת בפעם הבאה?"],
    pitfall: "קול אחד חזק משתלט. קבעו מראש מי מסכם ומי שומר שכולם דיברו.",
    gear: "דפים וטושים לכל קבוצה",
  },
  "דיון בשאלה": {
    steps: [["שאלה אחת", "כותבים שאלה פתוחה אחת על הלוח (לא כן או לא)", 0.1], ["זוגות", "שתי דקות בזוגות לפני שמדברים בכולם", 0.25], ["מליאה", "אוספים תשובות, וכל תשובה מקבלת שאלת המשך", 0.55], ["סגירה", "מסכמים במשפט אחד בלי להכריע במקום החניכים", 0.1]],
    ask: ["מה אתם חושבים, ולמה?", "מה היה משנה את דעתכם?"],
    pitfall: "דיון שבו המדריך מדבר הכי הרבה הוא הרצאה. ספרו כמה פעמים דיברתם.",
    gear: "אין צורך בציוד",
  },
  "שיתוף": {
    steps: [["כללי משחק", "אומרים שמותר לדלג ושמה שנאמר כאן נשאר כאן", 0.15], ["הדגמה", "המדריך משתף ראשון, משפט קצר וכן", 0.15], ["סבב", "כל אחד אומר משפט אחד, בלי הערות", 0.6], ["תודה", "מודים לכולם, כולל למי שדילג", 0.1]],
    ask: ["מה שמעתם אצל מישהו אחר ששווה לחשוב עליו?", "מה היה לכם קשה לומר?"],
    pitfall: "קבוצה גדולה, סבב ארוך. חלקו לקבוצות של שישה.",
    gear: "אין צורך בציוד",
  },
  "משחק הדמייה": {
    steps: [["תרחיש", "מציגים מצב אמיתי אחד ומחלקים תפקידים מראש", 0.15], ["הכנה", "דקה לכל תפקיד להבין מה הוא רוצה", 0.2], ["הדמיה", "מדמים שלוש דקות ועוצרים להחלפת תפקידים", 0.45], ["יציאה מהתפקיד", "מורידים את התפקיד ושואלים מה הרגשתם", 0.2]],
    ask: ["מה הרגשתם בתפקיד שקיבלתם?", "מה הייתם עושים אחרת אילו זה קרה באמת?"],
    pitfall: "חניך עלול להיכנס לתפקיד כואב מדי. הגדירו מראש מילת עצירה.",
    gear: "כרטיסי תפקיד",
  },
  "התבוננות": {
    steps: [["הנחיה", "אומרים במה מתבוננים ושומרים על שקט", 0.15], ["התבוננות", "כל אחד מתבונן לבד ורושם שלושה דברים", 0.45], ["שיתוף", "בזוגות, ואז כמה בקול", 0.3], ["חיבור", "שואלים מה לא שמנו לב אליו עד עכשיו", 0.1]],
    ask: ["מה ראיתם שלא שמתם לב אליו קודם?", "מה זה אומר על הדרך שבה אנחנו מסתכלים?"],
    pitfall: "שקט קשה לילדים צעירים. קצרו לשלוש דקות והגדירו מקום.",
    gear: "דפים ועטים",
  },
  "הסבר": {
    steps: [["מה צריך לדעת", "שלושה דברים בלבד, כתובים על הלוח", 0.3], ["דוגמה", "דוגמה אחת קרובה לחיי החניכים", 0.3], ["בדיקת הבנה", "שואלים שאלה אחת ובוחרים מי עונה", 0.25], ["שאלות", "מקום לשאלה אחת או שתיים", 0.15]],
    ask: ["איך הייתם מסבירים את זה לחבר?", "איפה זה פוגש אתכם?"],
    pitfall: "הסבר של יותר מחמש דקות מאבד את הקבוצה. חלקו אותו.",
    gear: "לוח או דף גדול",
  },
  "פירוק": {
    steps: [["מושג אחד", "כותבים מושג מופשט אחד על הלוח", 0.1], ["פירוק", "כל קבוצה מפרקת אותו: מה גורם לו, מה התוצאות, דוגמה", 0.5], ["איסוף", "אוספים את החלקים על הלוח", 0.25], ["חיבור", "שואלים איזה חלק הכי חשוב ולמה", 0.15]],
    ask: ["איזה חלק של הנושא הפתיע אתכם?", "מה אפשר לשנות מתוך מה שפירקנו?"],
    pitfall: "נושא מופשט מדי מבלבל. התחילו מדוגמה מוחשית.",
    gear: "דפים וטושים",
  },
};

// ───────────── עזרים ─────────────

const blockText = (b) => `${b.title || ""}\n${b.text || ""}`;
const allText = (doc) => doc.blocks.map(blockText).join("\n");
export const unitOf = (doc) => (/\d\s*דק['׳]/.test(allText(doc)) ? "דק'" : "דקות");

/** איזה קול המדריך כותב בו: "אנחנו" (נחלק) או הווה רבים (מחלקים). ברירת מחדל: הווה רבים. */
export function voiceOf(doc) {
  const t = allText(doc);
  const we = (t.match(/(?:^|\s)נ(?:חלק|שחק|פתח|דבר|סכם|בנה|שאל|שתף|ראה|עשה|בחר|תחיל|סיים|ספר|שב|עמוד|כנס|קרא|כתוב|צייר|גלה|בדוק|חשוב|מצא|פעל|ציג|בקש)\S*/g) || []).length + (t.match(/אנחנו/g) || []).length;
  const pres = (t.match(/(?:^|\s)(?:מחלקים|משחקים|פותחים|מדברים|מסכמים|בונים|שואלים|משתפים|מתחילים|מסבירים|מספרים|מקריאים|מתכנסים|יושבים|עומדים|מציירים|מציגים)(?=\s|[.,!?:]|$)/g) || []).length;
  return we > pres ? "we" : "pres";
}

/** המתודות שזוהו בבלוק, מהחזקה לחלשה. */
export function methodsIn(text) {
  const t = norm(text);
  const out = [];
  for (const name of METHOD_NAMES) {
    const keys = METHOD_KEYS[name] || [];
    const n = keys.filter((k) => has(t, k)).length + (has(t, name) ? 1 : 0);
    if (n) out.push({ name, n });
  }
  return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "he"));
}

const sentencesOf = (s) =>
  String(s || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

const gearIds = (doc) => (Array.isArray(doc.meta?.gear) ? doc.meta.gear : []);
const topicFor = (doc) => topicOf(doc.title) || "הנושא";

export function lineFor(method, doc, voice = voiceOf(doc)) {
  const f = LINES[method]?.[voice === "we" ? 1 : 0] || LINES[method]?.[0];
  return f ? f(topicFor(doc)) : "";
}

/** משפט שמקשר את המתודה לערך שנבחר (122). */
export function valueLine(method, value, voice = "pres") {
  const v = String(value || "").trim();
  if (!v) return "";
  const c = catOf(method);
  const we = voice === "we";
  if (c === "game") return we ? `ובסוף נעצור ונשאל איפה במשחק הופיע "${v}".` : `ובסוף עוצרים ושואלים איפה במשחק הופיע "${v}".`;
  if (c === "talk") return we ? `ונשאל מה "${v}" אומר על מה שנאמר כאן.` : `ושואלים מה "${v}" אומר על מה שנאמר כאן.`;
  return we ? `ונחבר את זה ל"${v}" בשאלה אחת.` : `ומחברים את זה ל"${v}" בשאלה אחת.`;
}

// ───────────── 113–118, 122, 124: הצעות מתודה לשלב ─────────────

function docMethods(doc, exceptId) {
  const count = {};
  for (const b of doc.blocks) {
    if (b.id === exceptId) continue;
    for (const m of methodsIn(blockText(b))) count[m.name] = (count[m.name] || 0) + 1;
  }
  return count;
}

export function suggestFor(doc, blockId, { prefs = {}, exclude = [], limit = 3 } = {}) {
  const idx = doc.blocks.findIndex((b) => b.id === blockId);
  const block = doc.blocks[idx];
  if (!block) return null;
  const meta = doc.meta || {};
  const voice = voiceOf(doc);
  const used = docMethods(doc, blockId);
  const inBlock = new Set(methodsIn(blockText(block)).map((m) => m.name));
  const usedCats = new Set(Object.keys(used).map(catOf).filter(Boolean));
  const mins = block.minutes ?? null;
  const have = gearIds(doc);
  const size = meta.groupSize || null;
  const young = /כיתה (?:ג|ד|ה|ו)'/.test(meta.ageGroup || "");
  const older = /כיתה (?:ט|י|יא|יב)'/.test(meta.ageGroup || "");
  const items = [];
  for (const m of METHOD_NAMES) {
    if (exclude.includes(m)) continue;
    let score = 0;
    const why = [];
    const warn = [];
    const fit = (KIND_FIT[block.kind] || {})[m];
    if (fit !== undefined) {
      score += fit;
      if (fit >= 2) why.push(`מתאימה במיוחד לשלב מסוג "${{ open: "פתיחה", body: "גוף", peak: "שיא", close: "סיכום", free: "חופשי" }[block.kind]}"`);
      else if (fit < 0) warn.push("פחות רגילה בשלב מהסוג הזה");
    }
    const c = catOf(m);
    if (c && !usedCats.has(c)) {
      score += 2;
      why.push(`עוד אין במסמך מתודה של ${CAT_LABEL[c]}`);
    }
    if (used[m]) {
      score -= 2 * Math.min(used[m], 2);
      warn.push("כבר מופיעה בשלב אחר במסמך");
    }
    if (inBlock.has(m)) {
      score -= 3;
      warn.push("כבר מופיעה בשלב הזה");
    }
    if (mins !== null && mins > 0 && mins < MIN_MINUTES[m]) {
      score -= 2;
      warn.push(`בדרך כלל צריך לפחות ${MIN_MINUTES[m]} דקות, ולשלב יש ${mins}`);
    } else if (mins !== null && mins >= MIN_MINUTES[m]) {
      score += 0.5;
      why.push(`נכנסת בזמן של השלב (${mins} דקות)`);
    }
    if (size) {
      if (size > 25 && (m === "שיתוף" || m === "דיון בשאלה")) {
        score -= 1;
        warn.push(`בקבוצה של ${size} כדאי לפצל לקבוצות של 5 עד 6`);
      }
      if (size < 8 && (m === "משחק תחרות" || m === "ייצוג")) {
        score -= 1;
        warn.push(`בקבוצה של ${size} קשה לחלק לקבוצות מתחרות`);
      }
    }
    const need = GEAR_NEED[m];
    const missing = need && have.length && !need.some((g) => have.includes(g));
    if (missing) {
      score -= 2;
      warn.push(`צריך ${need.slice(0, 2).map((g) => GEAR_LABEL[g]).join(" או ")}, וזה לא מסומן בארון שלכם`);
    } else if (need && have.length) why.push("הציוד שסימנתם מספיק");
    if (young && ["משחק תחרות", "עשייה", "משחק הדמייה"].includes(m)) {
      score += 1;
      why.push("שכבה צעירה אוהבת תנועה ועשייה");
    }
    if (young && ["הסבר", "פירוק"].includes(m)) score -= 1;
    if (older && ["דיון בשאלה", "משחק הדמייה", "ייצוג", "חשיבה משותפת"].includes(m)) {
      score += 1;
      why.push("בשכבה בוגרת יש מקום לעומק ולשיחה");
    }
    const pref = prefs[m] || 0;
    if (pref) {
      score += pref * 3;
      why.push(pref > 0 ? "סימנתם שאתם אוהבים אותה" : "סימנתם שאתם פחות אוהבים אותה");
    }
    if (meta.value && (c === "talk" || m === "השראה")) {
      score += 0.5;
      why.push(`מחברת בקלות לערך "${meta.value}"`);
    }
    items.push({ method: m, score, why, warn, pref });
  }
  items.sort((a, b) => b.score - a.score || a.method.localeCompare(b.method, "he"));
  const unit = unitOf(doc);
  const top = items.slice(0, limit).map((x) => {
    const base = lineFor(x.method, doc, voice);
    const link = valueLine(x.method, meta.value, voice);
    const minutes = Math.max(MIN_MINUTES[x.method], mins || DEFAULT_MINUTES[block.kind] || 12);
    return {
      method: x.method,
      category: catOf(x.method),
      score: Math.round(x.score * 10) / 10,
      why: x.why.slice(0, 4).length ? x.why.slice(0, 4) : ["מתודה שעוד לא השתמשתם בה כאן"],
      warn: x.warn.slice(0, 3),
      text: [base, link].filter(Boolean).join(" "),
      valueLink: link,
      minutes,
      unit,
      pref: x.pref,
    };
  });
  return { blockId, kind: block.kind, voice, detected: [...inBlock], suggestions: top, rest: items.length - top.length };
}

// ───────────── 117: החלפת מתודה בשלב ─────────────

export function swapForBlock(doc, blockId, method, { prefs = {} } = {}) {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const detected = methodsIn(blockText(block));
  const target = method || detected[0]?.name || null;
  if (!target) return { found: false, method: null, current: "", alternatives: [], detected: [] };
  const keys = [...(METHOD_KEYS[target] || []), target];
  const current = sentencesOf(block.text).find((s) => keys.some((k) => has(norm(s), k))) || "";
  const voice = voiceOf(doc);
  const alternatives = (SWAP[target] || []).map(([name, reason]) => ({
    method: name,
    why: reason,
    text: [lineFor(name, doc, voice), valueLine(name, doc.meta?.value, voice)].filter(Boolean).join(" "),
    already: detected.some((d) => d.name === name),
    pref: prefs[name] || 0,
  }));
  alternatives.sort((a, b) => Number(a.already) - Number(b.already) || b.pref - a.pref);
  return { found: !!current, method: target, current, alternatives, detected: detected.map((d) => d.name) };
}

// ───────────── 120–121: העמקה וגרסה קצרה ─────────────

function allocate(total, fracs) {
  const raw = fracs.map((f) => Math.max(1, Math.round(total * f)));
  let diff = total - raw.reduce((a, b) => a + b, 0);
  let i = raw.indexOf(Math.max(...raw));
  while (diff !== 0) {
    const step = diff > 0 ? 1 : -1;
    if (raw[i] + step >= 1) {
      raw[i] += step;
      diff -= step;
    } else i = (i + 1) % raw.length;
  }
  return raw;
}

export function expandMethod(doc, method, minutes) {
  const p = PLAY[method];
  if (!p) return null;
  const topic = topicFor(doc);
  const unit = unitOf(doc);
  const total = Math.max(4, Math.min(120, Math.round(minutes || MIN_MINUTES[method])));
  const ms = allocate(total, p.steps.map((s) => s[2]));
  const steps = p.steps.map((s, i) => ({ label: s[0], text: s[1], minutes: ms[i] }));
  const questions = p.ask.map((q) => q);
  const link = valueLine(method, doc.meta?.value, voiceOf(doc));
  const lines = [`**${method}: ${topic}** (${total} ${unit})`, ...steps.map((s, i) => `${i + 1}. ${s.label} (${s.minutes} ${unit}): ${s.text}`), `שאלות: ${questions.join(" · ")}`, ...(link ? [link] : []), `שימו לב: ${p.pitfall}`, `ציוד: ${p.gear}`];
  return { method, minutes: total, unit, steps, questions, pitfall: p.pitfall, gear: p.gear, valueLink: link, text: lines.join("\n") };
}

export function shortVersion(doc, method) {
  const p = PLAY[method];
  if (!p) return null;
  const unit = unitOf(doc);
  const topic = topicFor(doc);
  const [setup, main] = [p.steps[0], p.steps[Math.min(2, p.steps.length - 1)]];
  const lines = [`**${method}: ${topic}, גרסה קצרה** (10 ${unit})`, `1. ${setup[0]} (2 ${unit}): ${setup[1]}`, `2. ${main[0]} (6 ${unit}): ${main[1]}`, `3. שאלה אחת (2 ${unit}): ${p.ask[0]}`];
  return { method, minutes: 10, unit, text: lines.join("\n") };
}

// ───────────── 119: מעבר חלק בין שלבים ─────────────

const BRIDGES = {
  "game>talk": ["עוצרים את המשחק, מתיישבים במעגל ונותנים חצי דקה לנשום. אחר כך פותחים: מה הרגשתם הרגע שבו הניקוד התחיל להשתנות?", "אומרים: זה היה משחק, ועכשיו נחזור לשאלה למה שיחקנו אותו. כל אחד מספר במשפט אחד מה הוא זוכר.", "מבקשים מכל קבוצה לבחור מישהו שיגיד במשפט אחד מה היה הרגע המשמעותי בשבילה, ופותחים משם את השיחה."],
  "game>take": ["עוצרים, מתיישבים, ואומרים: ראיתם מה קרה. עכשיו אספר לכם משהו שקשור לזה.", "מסיימים את המשחק בכיתוב על הלוח של מה שקרה, ועוברים לרקע: מה בעצם ניסינו להבין."],
  "talk>game": ["אומרים: מספיק דיברנו, בואו נעבור לעשות. קמים, מחלקים לקבוצות בספירה, ומסבירים את המשימה בשני משפטים.", "מסכמים את השיחה במשפט אחד על הלוח, קמים ועוברים לפעילות עם משימה שבודקת את מה שאמרנו."],
  "take>game": ["מסיימים את ההסבר בשאלה אחת, ואז אומרים: עכשיו תנסו בעצמכם. מחלקים לקבוצות ומתחילים.", "אחרי הסיפור שותקים עשר שניות, ואז אומרים: בואו נראה איך זה נראה אצלנו, ופותחים משחק."],
  "take>talk": ["מסיימים בשאלה אחת פתוחה על מה ששמעו, נותנים שתי דקות בזוגות, ורק אז פותחים לכולם.", "אומרים: אני לא אגיד מה אני חושב. מה אתם שמעתם? ומתחילים סבב."],
  "talk>take": ["אחרי השיחה אומרים: רוצה לתת לכם משהו לחשוב עליו. מספרים או מראים משהו קצר ללא עוד שאלות.", "מסכמים את מה שנאמר בשני משפטים, ואז עוברים להסבר או לסיפור שמעמיק אחד מהם."],
  "game>game": ["עושים הפסקה קצרה של שתי דקות לשתייה, ומודיעים שהמשימה הבאה שונה: אותו מקום, כללים אחרים.", "אוספים את כולם במקום אחד, נותנים לשמוע מי ניצח, ואז מציגים את המשחק הבא בשני משפטים."],
  "talk>talk": ["מחליפים מבנה: אם דיברו במליאה, עוברים לזוגות. מבקשים מכל זוג להגיד משפט אחד שהם לוקחים מהשיחה, ואז מתקדמים.", "כותבים על הלוח מה עלה בשיחה, ובוחרים יחד שאלה אחת להעמיק בה."],
  "any>close": ["אומרים: אנחנו מתקרבים לסוף. כל אחד חושב על משפט אחד שהוא לוקח, בלי לכתוב, ונעמוד במעגל.", "עוצרים את מה שקורה, מתכנסים במעגל קטן, ושואלים מה הדבר האחד שרוצים שישאר מהפעולה."],
  "open>any": ["מסיימים את הפתיחה במשפט אחד שמסביר למה אנחנו כאן, ואז עוברים מיד לפעילות כדי לא לאבד את האנרגיה.", "אומרים את הנושא במשפט אחד ומתחילים בלי הקדמה: עכשיו נראה מה זה אומר."],
  generic: ["מסכמים את מה שהיה במשפט אחד, נותנים לקבוצה חצי דקה לזוז או לשתות, ואז מציגים את השלב הבא.", "אומרים בבירור מה הולך להיות עכשיו ולמה, ומחלקים את הציוד לפני שמתחילים."],
};

function catOfBlock(block) {
  const m = methodsIn(blockText(block))[0]?.name;
  return m ? catOf(m) : null;
}
export function bridgeBetween(doc, fromId, toId) {
  const a = doc.blocks.find((b) => b.id === fromId);
  const b = doc.blocks.find((x) => x.id === toId);
  if (!a || !b) return null;
  const ca = catOfBlock(a);
  const cb = catOfBlock(b);
  const keys = [];
  if (b.kind === "close") keys.push("any>close");
  if (a.kind === "open") keys.push("open>any");
  if (ca && cb) keys.push(`${ca}>${cb}`);
  keys.push("generic");
  const seen = new Set();
  const options = [];
  for (const k of keys) {
    for (const t of BRIDGES[k] || []) {
      if (seen.has(t)) continue;
      seen.add(t);
      options.push({ text: t, kind: k });
    }
  }
  return { from: a.title || a.kind, to: b.title || b.kind, fromCategory: ca, toCategory: cb, options: options.slice(0, 3) };
}

// ───────────── 123: מה חסר ─────────────

export function gapsOf(doc) {
  const gaps = [];
  const blocks = doc.blocks;
  const text = allText(doc);
  const t = norm(text);
  const wordsTotal = words(text);
  if (!blocks.length || wordsTotal === 0) {
    return { gaps: [{ id: "empty", label: "המסמך עדיין ריק. כתבו כמה משפטים או בקשו הצעת מתודה לשלב הראשון.", severity: "high", action: blocks[0] ? { type: "suggest", blockId: blocks[0].id } : { type: "add", kind: "open" } }], filled: 0, total: blocks.length };
  }
  const kinds = new Set(blocks.map((b) => b.kind));
  if (!kinds.has("open")) gaps.push({ id: "no-open", label: "אין שלב פתיחה", severity: "mid", action: { type: "add", kind: "open" } });
  if (!kinds.has("close")) gaps.push({ id: "no-close", label: "אין שלב סיכום", severity: "high", action: { type: "add", kind: "close" } });
  if (blocks.length >= 3 && !kinds.has("peak")) gaps.push({ id: "no-peak", label: "אין רגע שיא", severity: "low", action: { type: "add", kind: "peak" } });
  let empty = 0;
  for (const b of blocks) {
    if (words(blockText(b)) < 4 || words(b.text) < 3) {
      empty++;
      gaps.push({ id: `empty-${b.id}`, label: `השלב "${b.title || { open: "פתיחה", body: "גוף", peak: "שיא", close: "סיכום", free: "חופשי" }[b.kind]}" כמעט ריק`, severity: "high", blockId: b.id, action: { type: "suggest", blockId: b.id } });
    }
  }
  const present = new Set(blocks.flatMap((b) => methodsIn(blockText(b)).map((m) => catOf(m.name))).filter(Boolean));
  if (wordsTotal > 30) {
    if (!present.has("game")) gaps.push({ id: "no-doing", label: "החניכים לא עושים כלום: אין משחק, יצירה או הדמיה", severity: "high", action: { type: "suggest", blockId: pickBlock(blocks, ["body", "peak"]) } });
    if (!present.has("talk")) gaps.push({ id: "no-talk", label: "אין שיחה, שיתוף או דיון", severity: "high", action: { type: "suggest", blockId: pickBlock(blocks, ["close", "peak", "body"]) } });
    if (present.has("talk") && !/\?/.test(text)) gaps.push({ id: "no-question", label: "יש שיחה אבל אין בה שאלה כתובה", severity: "mid", action: { type: "suggest", blockId: pickBlock(blocks, ["close", "peak"]) } });
  }
  const counts = {};
  for (const b of blocks) for (const m of methodsIn(blockText(b))) counts[m.name] = (counts[m.name] || 0) + 1;
  for (const [m, n] of Object.entries(counts)) if (n >= 3) gaps.push({ id: `repeat-${m}`, label: `המתודה "${m}" מופיעה ב-${n} שלבים. כדאי לגוון`, severity: "mid", action: { type: "suggest", blockId: blocks.find((b) => methodsIn(blockText(b)).some((x) => x.name === m))?.id } });
  const missingMin = blocks.filter((b) => b.minutes === null || b.minutes === 0);
  const sum = blocks.reduce((s, b) => s + (b.minutes || 0), 0);
  if (missingMin.length) gaps.push({ id: "minutes", label: `ל-${missingMin.length} שלבים אין זמן`, severity: "mid", blockId: missingMin[0].id, action: { type: "focus", blockId: missingMin[0].id, field: "minutes" } });
  else if (doc.meta?.minutes && sum !== doc.meta.minutes) gaps.push({ id: "total", label: `הזמנים מסתכמים ב-${sum} דקות, והמשך המתוכנן ${doc.meta.minutes}`, severity: "low", action: { type: "none" } });
  if (!/(?:ציוד|להביא|דפים|עטים|טוש|חבל|כדור)/.test(t)) gaps.push({ id: "gear", label: "לא כתבתם ציוד, גם אם אין צורך בו", severity: "low", action: { type: "none" } });
  if (/(?:ריצה|רצים|מירוץ|קופצים|תופסת|משחק תחרות)/.test(t) && !/(?:בטיחות|זהירות|גבולות גזרה)/.test(t)) gaps.push({ id: "safety", label: "יש משחק תנועתי ואין שורת בטיחות", severity: "mid", action: { type: "none" } });
  if (!doc.meta?.value && !/(?:ערך|מטרה|שהחניכים יבינו)/.test(t)) gaps.push({ id: "value", label: "לא נבחר ערך או מטרה", severity: "mid", action: { type: "none" } });
  if (!doc.meta?.ageGroup) gaps.push({ id: "age", label: "לא נבחרה שכבה", severity: "low", action: { type: "none" } });
  const order = { high: 0, mid: 1, low: 2 };
  gaps.sort((a, b) => order[a.severity] - order[b.severity]);
  return { gaps: gaps.slice(0, 12), filled: blocks.length - empty, total: blocks.length };
}
function pickBlock(blocks, kinds) {
  for (const k of kinds) {
    const b = blocks.find((x) => x.kind === k);
    if (b) return b.id;
  }
  return blocks[blocks.length - 1]?.id;
}

// ───────────── 126: חיפוש מתודה ─────────────

const tokensOf = (q) => (norm(q).match(/[א-תa-zA-Z0-9]{2,}/g) || []).slice(0, 6);
function bestSentence(text, toks) {
  const sents = sentencesOf(text);
  let best = "";
  let bestN = 0;
  for (const s of sents) {
    const n = toks.filter((k) => norm(s).includes(k)).length;
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  const cut = best.length > 300 ? best.slice(0, 300).replace(/\s+\S*$/, "") : best;
  return { excerpt: cut, hits: bestN };
}

export function searchMethods(q, { activities = [], docs = [] } = {}) {
  const toks = tokensOf(q);
  if (!toks.length) return { catalog: [], library: [], mine: [] };
  const catalog = [];
  for (const name of METHOD_NAMES) {
    const text = `${name} ${(METHOD_KEYS[name] || []).join(" ")} ${PLAY[name]?.steps.map((s) => s[1]).join(" ") || ""}`;
    const n = toks.filter((k) => norm(text).includes(k)).length;
    if (n) catalog.push({ method: name, hits: n + (norm(name).includes(toks[0]) ? 2 : 0) });
  }
  catalog.sort((a, b) => b.hits - a.hits);
  const library = [];
  for (const a of activities) {
    for (const st of a.stages || []) {
      const { excerpt, hits } = bestSentence(st.content || "", toks);
      if (hits) library.push({ activityId: a.id, title: a.title, ageGroup: a.ageGroup, stage: st.name || "", excerpt, hits });
    }
  }
  library.sort((a, b) => b.hits - a.hits || a.activityId - b.activityId);
  const mine = [];
  for (const d of docs) {
    for (const b of d.blocks) {
      const { excerpt, hits } = bestSentence(`${b.title}. ${b.text}`, toks);
      if (hits) mine.push({ docId: d.id, docTitle: d.title || "מסמך ללא שם", blockTitle: b.title || "", excerpt, hits });
    }
  }
  mine.sort((a, b) => b.hits - a.hits || b.docId - a.docId);
  return {
    catalog: catalog.slice(0, 4).map((c) => ({ method: c.method, category: catOf(c.method), playbook: PLAY[c.method]?.steps.slice(0, 2).map((s) => s[1]) || [] })),
    library: library.slice(0, 6),
    mine: mine.slice(0, 6),
  };
}

export const METHOD_CATEGORY_LABEL = CAT_LABEL;
export const PLAYBOOK_METHODS = Object.keys(PLAY);

/** דף הכנה (רעיון 138): ציוד מצטבר, מתודות שזוהו, סך זמן ואזהרות. */
export function prepOf(doc) {
  const gear = new Set();
  const used = new Map();
  for (const b of doc.blocks) {
    for (const m of methodsIn(blockText(b)).slice(0, 2)) {
      used.set(m.name, (used.get(m.name) || 0) + 1);
      const g = PLAY[m.name]?.gear;
      if (g) gear.add(g);
    }
  }
  const t = norm(allText(doc));
  const found = GEAR_GROUPS.filter((g) => g.words.some((w) => has(t, norm(w)))).map((g) => g.label);
  for (const g of Array.isArray(doc.meta?.gear) ? doc.meta.gear : []) if (GEAR_LABEL[g]) found.push(GEAR_LABEL[g]);
  const total = doc.blocks.reduce((s, b) => s + (b.minutes || 0), 0);
  const planned = doc.meta?.minutes ?? null;
  const warnings = [];
  if (planned && total && total !== planned) warnings.push(total > planned ? `הזמנים בשלבים חורגים ב-${total - planned} דקות מהמשך המתוכנן` : `חסרות ${planned - total} דקות מול המשך המתוכנן`);
  if (!doc.blocks.some((b) => b.kind === "close")) warnings.push("אין שלב סיכום");
  const mine = (Array.isArray(doc.meta?.equipment) ? doc.meta.equipment : []).filter(Boolean);
  const items = [...new Set([...mine, ...found, ...gear])];
  const wordsAll = (allText(doc).match(/\S+/g) || []).length;
  const prepMinutes = Math.min(180, 10 + Math.round(wordsAll / 40) + 3 * items.length);
  return { prepMinutes, gear: items, methods: [...used.entries()].map(([name, n]) => ({ name, n })), totalMinutes: total, plannedMinutes: planned, warnings, checklist: ["לעבור על הפעולה בקול פעם אחת", "להכין את הציוד מראש", ...(items.length ? ["לבדוק שהציוד שבתוך הרשימה קיים"] : []), "לתאם עם המדריכים מי מוביל כל שלב", "להכין גרסת חירום של 10 דקות"] };
}

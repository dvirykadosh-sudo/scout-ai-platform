// שלב 57 (475–491): ניתוח שיחה עם חניך או עם שכבה. כללים בלבד, בלי מודל שפה.
// הקלט תמיד הודעות שכבר הוסתרו (ראו chat-parse.js). כל הפלט מבוסס על הודעות מוסתרות.
import { ME } from "./chat-parse.js";

// ───────────── כלים ─────────────
const NIQQUD = /[֑-ׇ]/g;
export const norm = (t) => String(t ?? "").replace(NIQQUD, "").replace(/\s+/g, " ").trim();
const WORD_BOUND = (alts, prefix = false) => new RegExp(`(?<![\\p{L}\\d])${prefix ? "[ובהלמכש]{0,2}" : ""}(?:${alts.join("|")})(?![\\p{L}\\d])`, "iu");
const EMOJI_RX = (chars) => new RegExp(`(?:${chars.join("|")})`, "u");
const hasAny = (rx, t) => rx.test(t);
const words = (t) => (t.match(/[\p{L}\d']+/gu) || []);
const excerpt = (t, rx, len = 90) => {
  const m = rx.exec(t);
  const i = m ? Math.max(0, m.index - 25) : 0;
  const s = t.slice(i, i + len).trim();
  return (i > 0 ? "…" : "") + s + (i + len < t.length ? "…" : "");
};
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const DAY = 86_400_000, HOUR = 3_600_000, MIN = 60_000;
const isoMin = (ts) => (ts == null ? null : new Date(ts).toISOString().slice(0, 16));

// ───────────── מילונים ─────────────
const INTENTS = [
  { id: "conflict", label: "ריב או פגיעה בין חברים", rx: WORD_BOUND(["הציק|מציק|מציקה|מציקים|העליב|העליבו|מעליב|קילל|קיללו|מקלל|איים|מאיים|התעמת|רב איתי|רבתי|רבנו|הרביצו|הרביץ|צחקו עלי|צחקו עליי|צוחקים עלי|צוחקים עליי|עשה לי|עשתה לי|דיברו עלי|דיברו עליי|הוציאו אותי|בלעדיי|בלעדי"], true) },
  { id: "emotional", label: "שיתוף רגשי", rx: WORD_BOUND(["עצוב|עצובה|בוכה|בוכים|קשה לי|רע לי|לא טוב לי|בודד|בודדה|מרגיש לבד|מרגישה לבד|מפחד|מפחדת|פחד|לחוץ|לחוצה|לחץ|חרדה|מתוסכל|מתוסכלת|מתבייש|מתביישת|מרגיש לא טוב|מרגישה לא טוב|אין לי חברים|אין לי כוח|לא בא לי כלום|מעיק|שבור|שבורה"], true) },
  { id: "absence", label: "הודעת היעדרות או איחור", rx: WORD_BOUND(["לא אוכל|לא יכול|לא יכולה|לא מגיע|לא מגיעה|לא אגיע|לא אצליח|לא אספיק|חולה|מצוננת|מצונן|מחלה|בידוד|קורונה|מבחן|בוחן|שיעור פרטי|חוג|נסיעה|משפחתי|אירוע משפחתי|מאחר|מאחרת|אאחר|אתאחר|מתעכב|מתעכבת|יגיע באיחור|אגיע באיחור|אגיע מאוחר|בדרך"], true) },
  { id: "complaint", label: "תלונה או חוסר עניין", rx: WORD_BOUND(["משעמם|שעמום|לא הוגן|לא כיף|לא מצחיק|לא אהבתי|שנאתי|מעצבן|לא רוצה לבוא|לא רוצה להמשיך|לא בא לי|לא מעניין|אין טעם|נמאס|מיותר|לא קשור"], true) },
  { id: "apology", label: "התנצלות", rx: WORD_BOUND(["סליחה|מצטער|מצטערת|אני מתנצל|אני מתנצלת|לא התכוונתי|טעות שלי|אשם|אשמה"], true) },
  { id: "permission", label: "בקשת רשות", rx: WORD_BOUND(["אפשר ל[א-ת]+|אפשר שאני|אפשר שאבוא|מותר ל[א-ת]+|מותר לי|אפשר להביא|אפשר לצאת|אפשר להצטרף"], false) },
  { id: "thanks", label: "תודה או מחמאה", rx: WORD_BOUND(["תודה|תודה רבה|אחלה|היה מדהים|היה כיף|נהניתי|נהנתי|תותח|תותחית|מלך|גדול|אהבתי|אוהב אותך|אוהבת אותך|כל הכבוד|יפה מאוד|מושלם"], true) },
];
const QUESTION_START = WORD_BOUND(["מתי|איפה|למה|איך|כמה|האם|אפשר|אפשרי|באיזו|באיזה|לאן|מאיפה|עד מתי|מי|מה|יש"], false);
const STRICT_Q = new Set(["מתי", "איפה", "למה", "איך", "כמה", "האם", "אפשר", "אפשרי", "באיזו", "באיזה", "לאן", "מאיפה", "עד"]);
const JOKE_RX = /(?:ח{3,}|ה{3,}|לול\b|lol|😂|🤣|😜|😅)/iu;
const ACK_RX = /^(?:אוקיי|אוקי|ok|okay|כן|לא|סבבה|בסדר|יופי|אחלה|👍|👌|🙏|ברור|טוב|קיבלתי|הבנתי|יאללה)[\s.!👍👌🙏]*$/iu;

const EMOTIONS = [
  { id: "joy", label: "התלהבות ושמחה", sign: 1, rx: WORD_BOUND(["מדהים|אלוף|תותח|יאללה|כיף|נהדר|מעולה|אחלה|מתרגש|מתרגשת|לא יכול לחכות|לא יכולה לחכות|חיכיתי|נהניתי|נהנתי"], true), em: EMOJI_RX(["❤", "😍", "🎉", "😁", "😄", "🥳", "🤩", "🔥"]) },
  { id: "bored", label: "שעמום או חוסר עניין", sign: -1, rx: WORD_BOUND(["משעמם|שעמום|אין לי כוח|אין כוח|לא בא לי|לא מעניין|מה זה משנה|סתם|לא יודע"], true), em: EMOJI_RX(["😴", "🙄", "😑"]) },
  { id: "hurt", label: "פגיעה או תחושת הדרה", sign: -1, rx: WORD_BOUND(["פגע בי|פגעת בי|פגעו בי|נעלבתי|לא הוגן|לא נעים לי|העליבו|התעלמו ממני|שכחו אותי|לא הזמינו|בלעדיי|אף אחד לא"], true), em: EMOJI_RX(["💔", "😢", "😭", "🥺"]) },
  { id: "anger", label: "כעס", sign: -1, rx: WORD_BOUND(["כועס|כועסת|מעצבן|מעצבנת|שונא|שונאת|נמאס|די כבר|עצבני|עצבנית|מתעצבן"], true), em: EMOJI_RX(["🤬", "😡", "😠"]) },
  { id: "anxious", label: "לחץ וחשש", sign: -1, rx: WORD_BOUND(["לחוץ|לחוצה|מפחד|מפחדת|פוחד|פוחדת|חושש|חוששת|חרדה|מתח|דואג|דואגת|מה אם"], true), em: EMOJI_RX(["😰", "😨", "😟", "😬"]) },
  { id: "sad", label: "עצב או בדידות", sign: -1, rx: WORD_BOUND(["עצוב|עצובה|בודד|בודדה|מרגיש לבד|מרגישה לבד|קשה לי|רע לי|לא טוב לי|אין לי חברים|בוכה|מדוכא|מדוכאת|ריק"], true), em: EMOJI_RX(["😞", "😔", "😿"]) },
  { id: "guilt", label: "אשמה והתנצלות", sign: 0, rx: WORD_BOUND(["סליחה|מצטער|מצטערת|אשם|אשמה|טעות שלי|לא התכוונתי|התבלבלתי"], true), em: EMOJI_RX(["🙏"]) },
  { id: "humor", label: "הומור וקלילות", sign: 1, rx: WORD_BOUND(["חחח+|הההה+|לול|lol"], false), em: EMOJI_RX(["😂", "🤣", "😜", "😅"]) },
];

const FAQ = [
  { id: "when", label: "מתי ובאיזו שעה", rx: WORD_BOUND(["מתי|באיזו שעה|באיזה שעה|באיזה יום|עד מתי|מתחיל|מתחילים|מסתיים|מסתיימת|נגמר|נגמרת"], true) },
  { id: "where", label: "איפה ואיך מגיעים", rx: WORD_BOUND(["איפה|כתובת|איך מגיעים|איך מגיע|נפגשים|נקודת מפגש|חניה|הסעה|הסעות|לאן"], true) },
  { id: "bring", label: "מה להביא ומה ללבוש", rx: WORD_BOUND(["מה להביא|להביא|צריך להביא|ציוד|ללבוש|לבוש|חולצה|חולצת שבט|מדים|נעליים|מעיל|בקבוק|אוכל|כריך"], true) },
  { id: "cost", label: "תשלום ועלות", rx: WORD_BOUND(["כמה עולה|עולה|תשלום|לשלם|כסף|ביט|פייבוקס|פיי בוקס|מחיר|קופה"], true) },
  { id: "attend", label: "האם יש פעולה ומי מגיע", rx: WORD_BOUND(["יש פעולה|האם יש|מבוטל|בוטל|ביטול|נדחה|דחייה|מי מגיע|מי בא|יהיה"], true) },
];
const STOP = new Set(("אני אתה את אנחנו הם הן הוא היא זה זו זאת אבל או אם כי גם עוד כבר לא כן מה מי איך למה מתי איפה כמה של על עם אל מן בין אחרי לפני עד כל כמו רק אז פה שם היה היו יש אין לי לך לו לה לנו להם אותו אותה אותי אתכם אנו הזה הזאת האלה שלי שלך שלו שלה שלנו תהיה יהיה בסדר טוב סבבה אוקיי אוקי תודה היי שלום הי חחח הההה ממש מאוד יותר פשוט בעצם נראה אולי כאילו וגם אתם הכל הכול עכשיו היום מחר אמש").split(" "));

const INSULT = WORD_BOUND(["מטומטם|מטומטמת|אידיוט|אידיוטית|דבילי|דביל|חרא|מפגר|מפגרת|מכוער|מכוערת|נודניק|סתום|שתוק|שתקי|תסתום|תעוף|זבל|שרמוטה|בן זונה|כוס אמק|מגעיל|מגעילה|חנון|חנונית|פרייר|נאד|עלוב|עלובה|שתמות|תמות"], false);
const EXCLUDE = WORD_BOUND(["לא רוצים אותך|לא רוצים אותו|לא רוצים אותה|לא מזמינים אותך|תעזוב את הקבוצה|תעזבי את הקבוצה|צא מהקבוצה|תצא מהקבוצה|תוציאו אותו|תוציאו אותה|נסיר אותך|אף אחד לא רוצה"], false);

// ───────────── בטיחות (479) ─────────────
const SAFETY = [
  { cat: "selfharm", label: "מחשבות על פגיעה עצמית או על מוות", urgent: true, rx: WORD_BOUND(["להתאבד|התאבדות|לשים קץ|להרוג את עצמי|רוצה למות|לא רוצה לחיות|אין טעם לחיות|אין לי סיבה לחיות|נמאס לי מהחיים|לפגוע בעצמי|פוגע בעצמי|פוגעת בעצמי|חותך את עצמי|חותכת את עצמי|חתכתי את עצמי|לחתוך לעצמי|מכתב פרידה|להיעלם לתמיד|עדיף שלא אהיה|עדיף בלעדיי|מוטב שלא נולדתי|אף אחד לא יתגעגע|kill myself|suicide|kms"], true) },
  { cat: "abuse", label: "חשש לפגיעה בילד או לאיום עליו", urgent: true, rx: WORD_BOUND(["מכה אותי|מכים אותי|מרביץ לי|מרביצה לי|מרביצים לי|הרביץ לי|אבא שלי מרביץ|אמא שלי מרביצה|נגע בי|נגעו בי|נוגע בי|נוגעת בי|הטריד אותי|מטריד אותי|התעלל בי|מתעלל בי|מתעללת בי|אנס אותי|אנסו אותי|הוא מכריח אותי|היא מכריחה אותי|מכריחים אותי|ביקש ממני תמונה|ביקש תמונה|שלח לי תמונות|ביקש שאשלח|מאיים לפרסם|מאיים עלי|מאיים עליי|סחיטה|סחט אותי|אמר שזה סוד|זה סוד בינינו|אל תספר לאף אחד|אל תספרי לאף אחד|פוחד לחזור הביתה|פוחדת לחזור הביתה|לא רוצה לחזור הביתה"], true) },
  { cat: "violence", label: "איום באלימות", urgent: true, rx: WORD_BOUND(["אהרוג|להרוג אותו|להרוג אותה|אפגע בו|אפגע בה|אדקור|אביא סכין|אביא אקדח|אפוצץ|לפוצץ את"], true) },
  { cat: "runaway", label: "בריחה מהבית או חוסר קורת גג", urgent: true, rx: WORD_BOUND(["אברח מהבית|בורח מהבית|ברחתי מהבית|לא אחזור הביתה|אין לי איפה לישון|עזבתי את הבית|זרקו אותי מהבית|לישון ברחוב"], true) },
  { cat: "bullying", label: "הצקות, הדרה או התעללות חברתית", urgent: false, rx: WORD_BOUND(["צוחקים עלי|צוחקים עליי|מציקים לי|מציק לי|מציקה לי|מנודה|מנדים אותי|אף אחד לא מדבר איתי|אף אחד לא רוצה אותי|אין לי חברים|מקללים אותי|מפרסמים עליי|מפרסמים עלי|הקבוצה נגדי|עשו עליי קבוצה|עשו עלי קבוצה|מתעללים בי|מציקים לי בבית הספר"], true) },
  { cat: "distress", label: "מצוקה רגשית", urgent: false, rx: WORD_BOUND(["עצוב לי|אני בוכה|בוכה כל|קשה לי מאוד|אין לי כוח לכלום|לא בא לי כלום|מרגיש לבד|מרגישה לבד|אני שבור|אני שבורה|מדוכא|מדוכאת|התקף חרדה|התקפי חרדה|לא ישן|לא ישנה|לא ישנתי|לא מצליח לישון|לא מצליחה לישון"], true) },
  { cat: "eating", label: "שינוי בהרגלי אכילה", urgent: false, rx: WORD_BOUND(["מקיא|מקיאה|הקאתי|לא אוכל כלום|לא אוכלת כלום|מרעיב את עצמי|מרעיבה את עצמי|שונא את הגוף שלי|שונאת את הגוף שלי"], true) },
  { cat: "substance", label: "אלכוהול, סמים או וייפ", urgent: false, rx: WORD_BOUND(["סמים|חשיש|גראס|אקסטזי|שיכור|שיכורה|התמסטלתי|מסטול|מסטולה|וייפ|ויפ"], true) },
  { cat: "online", label: "קשר מסוכן ברשת", urgent: false, rx: WORD_BOUND(["מישהו זר|מישהו שלא מכיר|הכרתי באינטרנט|מבוגר שכתב לי|ביקש שלא אספר|ביקש לשמור בסוד"], true) },
];

export const HOTLINES = [
  { name: "ער\"ן, עזרה ראשונה נפשית", number: "1201", note: "בכל שעה, בטלפון ובצ'אט, גם לבני נוער" },
  { name: "מוקד 118 של משרד הרווחה", number: "118", note: "ילדים ונוער בסיכון ופגיעה בקטינים, 24 שעות ביממה" },
  { name: "105, קו סיוע לילדים ולנוער ברשת", number: "105", note: "סחיטה, הטרדה ופגיעה ברשת" },
  { name: "משטרה", number: "100", note: "סכנה מיידית" },
  { name: "מד\"א", number: "101", note: "סכנת חיים מיידית" },
];

export function safetyScan(messages, { includeMe = false } = {}) {
  const items = [];
  messages.forEach((m, i) => {
    if (m.kind !== "text" || (!includeMe && m.who === ME)) return;
    const t = norm(m.text);
    for (const s of SAFETY) {
      if (s.rx.test(t)) items.push({ cat: s.cat, label: s.label, urgent: s.urgent, who: m.who, at: isoMin(m.ts), index: i, text: excerpt(t, s.rx) });
    }
  });
  const urgent = items.some((x) => x.urgent);
  const level = urgent ? "urgent" : items.length ? "attention" : "none";
  const cats = [...new Set(items.map((x) => x.cat))];
  return { level, cats, items: items.slice(-12), total: items.length, advice: level === "none" ? null : safetyAdvice(level, cats), hotlines: level === "none" ? [] : HOTLINES };
}

export function safetyAdvice(level, cats = []) {
  if (level === "urgent") {
    return {
      title: "מצאנו משפטים שדורשים תשומת לב מיידית",
      do: [
        "ענו מהר וברוגע. לא להתעלם ולא לדחות לאחרי הפעולה.",
        "תודו על השיתוף ותכתבו שאכפת לכם. לא צריך לפתור הכול בהודעה אחת.",
        "אל תבטיחו סודיות. אפשר לכתוב: \"אני לא יכול/ה להבטיח שזה יישאר רק בינינו, כי אכפת לי ממך. אני אדבר עם מי שיכול לעזור.\"",
        "אל תחקרו ואל תדרשו פרטים. תנו לחניך לספר כמה שנוח לו.",
        "עדכנו מיד את רכז/ת השבט ואת האחראי/ת על הגנת ילדים בתנועה, לפי הנוהל שלכם. אם יש סכנה מיידית, חייגו למשטרה (100) או למד\"א (101).",
        "שמרו את השיחה כפי שהיא כדי למסור לגורם המוסמך, ואל תפיצו אותה.",
      ],
      dont: [
        "לא לטפל לבד ולא להתייעץ בקבוצה.",
        "לא לומר \"זה לא נורא\", \"תירגע\" או \"אתה מגזים\".",
        "לא להיפגש לבד עם החניך. אם נפגשים, בנוכחות מדריך נוסף ובמקום פתוח.",
        "לא להפנות אצבע או לעימות עם מי שהחניך מתאר.",
      ],
      who: ["רכז/ת השבט", "האחראי/ת על הגנת ילדים בתנועה", "הורי החניך, רק לפי הנוהל ובהתאם להנחיית הגורם המוסמך"],
      safeReplies: [
        "תודה ששיתפת אותי. אני שומע/ת אותך ואכפת לי ממך. אני כאן. אפשר שנדבר בטלפון עכשיו?",
        "מה שכתבת חשוב לי. אני לא רוצה שתהיה/י עם זה לבד. אני לא יכול/ה להבטיח שזה יישאר רק בינינו, כי אכפת לי, ואני אדבר עם מי שיכול לעזור. אני כאן.",
      ],
    };
  }
  const bully = cats.includes("bullying");
  return {
    title: "יש בשיחה סימנים שכדאי לשים לב אליהם",
    do: [
      "ענו בפרטי וברוגע. שאלו שאלה פתוחה אחת, לא חקירה.",
      bully ? "בהצקות: דברו עם החניך לפני שמדברים עם מי שהציק, ועדכנו את רכז/ת השבט." : "אם הסימנים חוזרים או מתחזקים, עדכנו את רכז/ת השבט.",
      "הציעו לעבור לשיחת טלפון או לשיחה פנים אל פנים.",
    ],
    dont: ["לא לדון בזה בקבוצה.", "לא להמעיט (\"זה לא נורא\").", "לא להבטיח סודיות מוחלטת."],
    who: ["רכז/ת השבט"],
    safeReplies: [],
  };
}

// ───────────── כוונה ומצב רוח (476, 477) ─────────────
export function classifyIntent(text) {
  const t = norm(text);
  const ids = [];
  const evidence = {};
  for (const it of INTENTS) if (it.rx.test(t)) { ids.push(it.id); evidence[it.id] = excerpt(t, it.rx); }
  const ws = words(t);
  const first = ws[0] || "";
  if (/\?|？/.test(t) || (ws.length <= 14 && STRICT_Q.has(first))) { ids.push("question"); evidence.question = excerpt(t, /\?|？/.test(t) ? /\?|？/ : QUESTION_START); }
  if (ACK_RX.test(t)) ids.unshift("ack");
  if (JOKE_RX.test(t) && !ids.length) ids.push("joke");
  const order = ["conflict", "emotional", "absence", "complaint", "apology", "permission", "question", "thanks", "joke", "ack"];
  const sorted = [...new Set(ids)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const primary = sorted[0] || "general";
  return { primary, all: sorted, evidence };
}
export const INTENT_LABEL = { ...Object.fromEntries(INTENTS.map((i) => [i.id, i.label])), question: "שאלה", joke: "הומור", ack: "אישור קצר", general: "הודעה כללית" };

export function toneOf(messages) {
  const counts = new Map();
  const ev = new Map();
  for (const m of messages) {
    if (m.kind !== "text") continue;
    const t = norm(m.text);
    for (const e of EMOTIONS) {
      const n = (t.match(new RegExp(e.rx.source, "giu")) || []).length + (t.match(new RegExp(e.em.source, "gu")) || []).length;
      if (n) { counts.set(e.id, (counts.get(e.id) || 0) + n); if (!ev.has(e.id)) ev.set(e.id, excerpt(t, e.rx.test(t) ? e.rx : e.em)); }
    }
  }
  const list = [...counts].map(([id, n]) => { const e = EMOTIONS.find((x) => x.id === id); return { id, label: e.label, sign: e.sign, count: n, example: ev.get(id) }; }).sort((a, b) => b.count - a.count);
  const total = list.reduce((s, x) => s + x.count, 0);
  const confidence = total >= 4 ? "בינונית" : total >= 2 ? "נמוכה" : "נמוכה מאוד";
  return { top: list.slice(0, 3), confidence, note: "זיהוי לפי מילים ואימוג'ים בלבד. הוא לא מבין עקיצה, ציניות או הקשר, ולכן זו הצעה לקריאה ולא מסקנה." };
}

// ───────────── קצב, תגובה והתרחקות (478, 485) ─────────────
export function rhythm(messages, { meAlias = ME } = {}) {
  const st = messages.filter((m) => m.ts != null);
  if (st.length < 2) return null;
  const mine = [], theirs = [], blocks = [];
  let block = null;
  for (const m of st) {
    const isMe = m.who === meAlias;
    if (!isMe) { if (!block) block = { first: m, last: m, msgs: [m] }; else { block.last = m; block.msgs.push(m); } }
    else if (block) { mine.push((m.ts - block.first.ts) / MIN); blocks.push({ ...block, answeredAt: m.ts }); block = null; }
  }
  if (block) blocks.push({ ...block, answeredAt: null });
  // תגובות של החניכים להודעות שלי
  let waitMe = null;
  for (const m of st) {
    const isMe = m.who === meAlias;
    if (isMe) { if (waitMe == null) waitMe = m.ts; }
    else if (waitMe != null) { theirs.push((m.ts - waitMe) / MIN); waitMe = null; }
  }
  const end = st[st.length - 1].ts;
  const unanswered = blocks.filter((b) => b.answeredAt == null || b.answeredAt - b.first.ts > DAY).map((b) => ({
    who: b.first.who, at: isoMin(b.first.ts), waitedHours: Math.round(((b.answeredAt ?? end) - b.first.ts) / HOUR), answered: b.answeredAt != null,
    text: norm(b.msgs.map((x) => x.text).join(" ")).slice(0, 110), intent: classifyIntent(b.msgs.map((x) => x.text).join(" ")).primary,
  })).sort((a, b) => b.waitedHours - a.waitedHours).slice(0, 6);
  const night = (m) => { const h = new Date(m.ts).getUTCHours(); return h >= 22 || h < 6; };
  const myMsgs = st.filter((m) => m.who === meAlias);
  const hours = Array(24).fill(0);
  for (const m of st) hours[new Date(m.ts).getUTCHours()]++;
  return {
    myMedianMinutes: median(mine) == null ? null : Math.round(median(mine)),
    theirMedianMinutes: median(theirs) == null ? null : Math.round(median(theirs)),
    answeredSameDay: blocks.length ? Math.round((blocks.filter((b) => b.answeredAt != null && b.answeredAt - b.first.ts <= DAY).length / blocks.length) * 100) : null,
    unanswered,
    myNightShare: myMsgs.length ? Math.round((myMsgs.filter(night).length / myMsgs.length) * 100) : null,
    hours,
  };
}

/** חניכים ששתקו או ירדו בפעילות: השבועיים האחרונים מול ארבעת השבועות שלפניהם. */
export function fading(messages, { meAlias = ME } = {}) {
  const st = messages.filter((m) => m.ts != null && m.who !== meAlias);
  if (st.length < 10) return [];
  const end = Math.max(...messages.filter((m) => m.ts != null).map((m) => m.ts));
  const per = new Map();
  for (const m of st) {
    const age = (end - m.ts) / DAY;
    const p = per.get(m.who) || { recent: 0, prior: 0 };
    if (age < 14) p.recent++; else if (age < 42) p.prior++;
    per.set(m.who, p);
  }
  const out = [];
  for (const [who, p] of per) {
    const baseline = p.prior / 2; // לשבועיים
    if (p.prior >= 6 && p.recent === 0) out.push({ who, kind: "silent", was: Math.round(baseline), now: 0 });
    else if (p.prior >= 8 && p.recent < baseline * 0.4) out.push({ who, kind: "drop", was: Math.round(baseline), now: p.recent });
  }
  return out.sort((a, b) => b.was - a.was).slice(0, 8);
}

export function lengthTrend(messages, who) {
  const t = messages.filter((m) => m.who === who && m.kind === "text");
  if (t.length < 12) return null;
  const half = t.length >> 1;
  const avg = (a) => a.reduce((s, m) => s + words(m.text).length, 0) / Math.max(1, a.length);
  const a = avg(t.slice(0, half)), b = avg(t.slice(half));
  return { before: Math.round(a * 10) / 10, after: Math.round(b * 10) / 10, shorter: a > 0 && b < a * 0.6 };
}

// ───────────── ניתוח שכבה (485–491) ─────────────
export function participation(messages, { meAlias = ME } = {}) {
  const per = new Map();
  for (const m of messages) {
    const p = per.get(m.who) || { who: m.who, count: 0, words: 0, last: null };
    p.count++; p.words += words(m.text).length; if (m.ts != null) p.last = Math.max(p.last ?? 0, m.ts);
    per.set(m.who, p);
  }
  const total = messages.length || 1;
  return [...per.values()].map((p) => ({ who: p.who, count: p.count, share: Math.round((p.count / total) * 100), avgWords: Math.round((p.words / p.count) * 10) / 10, last: isoMin(p.last), isMe: p.who === meAlias })).sort((a, b) => b.count - a.count);
}

export function openQuestions(messages, { meAlias = ME, limit = 12 } = {}) {
  const out = [];
  messages.forEach((m, i) => {
    if (m.who === meAlias || m.kind !== "text") return;
    const c = classifyIntent(m.text);
    if (!c.all.includes("question")) return;
    const answered = messages.slice(i + 1).some((x) => x.who === meAlias && (x.ts == null || m.ts == null || x.ts - m.ts <= 2 * DAY));
    if (!answered) out.push({ who: m.who, at: isoMin(m.ts), text: norm(m.text).slice(0, 140), index: i });
  });
  return out.slice(-limit).reverse();
}

export function faqBuckets(messages, { meAlias = ME } = {}) {
  const buckets = new Map(FAQ.map((f) => [f.id, { id: f.id, label: f.label, count: 0, who: new Set(), sample: "" }]));
  for (const m of messages) {
    if (m.who === meAlias || m.kind !== "text") continue;
    if (!classifyIntent(m.text).all.includes("question")) continue;
    const t = norm(m.text);
    for (const f of FAQ) if (f.rx.test(t)) { const b = buckets.get(f.id); b.count++; b.who.add(m.who); if (!b.sample) b.sample = t.slice(0, 110); }
  }
  return [...buckets.values()].filter((b) => b.count >= 2).map((b) => ({ id: b.id, label: b.label, count: b.count, askers: b.who.size, sample: b.sample, advice: b.askers >= 2 || b.who.size >= 2 ? "כמה אנשים שאלו. הודעה אחת לקבוצה תחסוך את כל התשובות." : "נשאל כמה פעמים. שווה לכלול בהודעה הבאה." })).sort((a, b) => b.count - a.count);
}

export function topics(messages, { meAlias = ME, limit = 8 } = {}) {
  const f = new Map();
  for (const m of messages) {
    if (m.kind !== "text") continue;
    for (const w0 of words(norm(m.text).replace(/\[[^\]]+\]|חניך [א-ת]'|המדריך/g, " "))) {
      let w = w0;
      if (w.length >= 5 && /^[והבלמש]/.test(w)) w = w.slice(1);
      if (w.length < 3 || STOP.has(w) || STOP.has(w0) || /\d/.test(w)) continue;
      f.set(w, (f.get(w) || 0) + 1);
    }
  }
  return [...f].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
}

export function heat(messages, { meAlias = ME } = {}) {
  const events = [];
  const per = new Map();
  messages.forEach((m, i) => {
    if (m.kind !== "text") return;
    const t = norm(m.text);
    const ins = (t.match(new RegExp(INSULT.source, "giu")) || []).length;
    const exc = EXCLUDE.test(t) ? 1 : 0;
    const shout = /!{3,}|\?{3,}/.test(t) ? 1 : 0;
    const score = ins * 2 + exc * 3 + shout;
    if (ins || exc) {
      events.push({ who: m.who, at: isoMin(m.ts), kind: exc ? "הדרה" : "קללה או עלבון", index: i, text: excerpt(t, exc ? EXCLUDE : INSULT, 70), score });
      per.set(m.who, (per.get(m.who) || 0) + score);
    }
  });
  const by = [...per].map(([who, score]) => ({ who, score, isMe: who === meAlias })).sort((a, b) => b.score - a.score).slice(0, 5);
  const level = events.length >= 6 ? "high" : events.length >= 2 ? "medium" : events.length ? "low" : "none";
  return { level, count: events.length, events: events.slice(-8), by };
}

export function toneTrend(messages) {
  const st = messages.filter((m) => m.ts != null && m.kind === "text");
  if (st.length < 20) return [];
  const end = Math.max(...st.map((m) => m.ts));
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const from = end - (w + 1) * 7 * DAY, to = end - w * 7 * DAY;
    const part = st.filter((m) => m.ts > from && m.ts <= to);
    let pos = 0, neg = 0;
    for (const m of part) {
      const t = norm(m.text);
      for (const e of EMOTIONS) if (e.sign && (e.rx.test(t) || e.em.test(t))) { if (e.sign > 0) pos++; else neg++; }
    }
    weeks.push({ week: isoMin(to)?.slice(0, 10), messages: part.length, pos, neg });
  }
  return weeks;
}

// ───────────── חבילת הניתוח המלאה ─────────────
export function analyzeChat(messages, { meAlias = ME, mode = "auto" } = {}) {
  const speakers = [...new Set(messages.map((m) => m.who))].filter((w) => w !== meAlias);
  const resolved = mode !== "auto" ? mode : speakers.length >= 2 ? "group" : "one";
  const texts = messages.filter((m) => m.kind === "text");
  const out = {
    mode: resolved,
    counts: { messages: messages.length, text: texts.length, media: messages.filter((m) => m.kind === "media").length, deleted: messages.filter((m) => m.kind === "deleted").length, speakers: speakers.length },
    safety: safetyScan(messages, { includeMe: false }),
    hasDates: messages.some((m) => m.ts != null),
  };
  const others = messages.filter((m) => m.who !== meAlias);
  // ההודעות שממתינות: רצף ההודעות של אחרים אחרי ההודעה האחרונה שלי
  let lastMine = -1;
  messages.forEach((m, i) => { if (m.who === meAlias) lastMine = i; });
  const trailing = messages.slice(lastMine + 1).filter((m) => m.who !== meAlias);
  const hasMe = messages.some((m) => m.who === meAlias);
  const pendingText = trailing.map((m) => m.text).join("\n");
  const end = Math.max(0, ...messages.filter((m) => m.ts != null).map((m) => m.ts));
  out.needMe = !hasMe && messages.length > 5;
  out.pending = trailing.length && (hasMe || messages.length <= 5)
    ? { count: trailing.length, who: [...new Set(trailing.map((m) => m.who))], since: isoMin(trailing[0].ts), waitedHours: trailing[0].ts != null && end ? Math.round((end - trailing[0].ts) / HOUR) : null, text: norm(pendingText).slice(0, 400), intent: classifyIntent(pendingText), tone: toneOf(trailing) }
    : null;
  const lastMsg = messages[messages.length - 1];
  out.waitingForThem = lastMsg && lastMsg.who === meAlias && lastMsg.ts != null && end ? { since: isoMin(lastMsg.ts), text: norm(lastMsg.text).slice(0, 120) } : null;
  out.intents = {};
  for (const m of others) { if (m.kind !== "text") continue; const p = classifyIntent(m.text).primary; out.intents[p] = (out.intents[p] || 0) + 1; }
  out.tone = toneOf(others);
  out.rhythm = hasMe ? rhythm(messages, { meAlias }) : null;
  out.participation = participation(messages, { meAlias });
  out.fading = fading(messages, { meAlias });
  out.openQuestions = hasMe ? openQuestions(messages, { meAlias }) : openQuestions(messages, { meAlias }).slice(0, 3);
  if (resolved === "group") {
    out.faq = faqBuckets(messages, { meAlias });
    out.topics = topics(messages, { meAlias });
    out.heat = heat(messages, { meAlias });
    out.toneTrend = toneTrend(messages);
  } else {
    const who = speakers[0];
    out.lengthTrend = who ? lengthTrend(messages, who) : null;
    out.heat = heat(messages, { meAlias });
  }
  out.plan = nextSteps(out);
  return out;
}

// ───────────── צעדים הבאים (484) ─────────────
export function nextSteps(a) {
  const steps = [];
  const add = (level, text, why) => steps.push({ level, text, why });
  if (a.safety.level === "urgent") add("urgent", "לפני הכול: לפעול לפי המסגרת האדומה למעלה ולעדכן את רכז/ת השבט.", "זוהו משפטים שדורשים תשומת לב מיידית.");
  else if (a.safety.level === "attention") add("high", "לענות בפרטי ובעדינות, ולעדכן את רכז/ת השבט אם זה חוזר.", "זוהו סימנים שכדאי לשים לב אליהם.");
  const p = a.pending;
  if (p && a.safety.level !== "urgent") {
    const slow = p.waitedHours != null && p.waitedHours >= 24;
    if (["emotional", "conflict"].includes(p.intent.primary)) add("high", "לענות היום ולהציע שיחת טלפון, במקום להמשיך בכתב.", "מצבים רגשיים וריבים מתנהלים טוב יותר בקול.");
    else if (p.intent.all.includes("question")) add(slow ? "high" : "normal", slow ? `לענות עכשיו: החניך מחכה כבר ${p.waitedHours} שעות.` : "לענות על השאלה במשפט ברור וקצר.", "תשובה מהירה ופשוטה מחזקת את הקשר.");
    else if (p.intent.primary === "complaint") add("normal", "להודות על הכנות ולשאול מה היה משנה, בלי להתגונן.", "תלונה היא סימן לקשר, לא התקפה.");
    else if (p.intent.primary === "absence") add("normal", "לאשר ולהעביר מסר שמחכים לו בפעם הבאה.", "חניך שעדכן ראוי לתשובה חמה.");
    else add("normal", "לענות בקצרה ובחום.", "הודעה שלא נענית נשארת בראש של החניך.");
  }
  if (a.waitingForThem) add("low", "אין מה לעשות עכשיו, אבל אם אין תגובה תוך כמה ימים, שלחו הודעה קצרה וקלילה אחת.", "ממתינים לתשובה מהחניך.");
  for (const f of a.fading || []) add("normal", `${f.who}: ${f.kind === "silent" ? "שותק/ת בשבועיים האחרונים" : "ירידה בפעילות"}. לשלוח הודעה אישית קטנה, בלי לשאול למה נעלמת.`, `בעבר ${f.was} הודעות לשבועיים, עכשיו ${f.now}.`);
  if (a.lengthTrend?.shorter) add("normal", "ההודעות של החניך התקצרו משמעותית. שווה שיחה קצרה בפעולה הבאה.", `אורך ממוצע ירד מ-${a.lengthTrend.before} ל-${a.lengthTrend.after} מילים.`);
  if (a.heat && a.heat.level !== "none" && a.mode === "group") add(a.heat.level === "high" ? "high" : "normal", "לכתוב לקבוצה הודעת כללי שיח (יש הצעה בלשונית ההודעות), ולדבר בפרטי עם מי שנפגע.", `נמצאו ${a.heat.count} הודעות עם קללות או הדרה.`);
  if (a.faq?.length) add("normal", `לפרסם הודעה אחת שעונה על: ${a.faq.slice(0, 3).map((f) => f.label).join(", ")}.`, "אותן שאלות חוזרות בקבוצה.");
  if (a.mode === "group" && a.openQuestions?.length >= 3) add("normal", `יש ${a.openQuestions.length} שאלות פתוחות. כדאי לענות עליהן בהודעה אחת מסודרת.`, "שאלות שלא נענו יוצרות רעש ותחושת התעלמות.");
  if (a.rhythm?.myNightShare >= 25) add("low", "חלק ניכר מההודעות שלכם נשלחות אחרי 22:00. שקלו שעות שקט קבועות לחניכים.", "גבולות ברורים טובים לכם ולחניכים.");
  if (!steps.length) add("low", "אין צורך בפעולה מיוחדת. אפשר להמשיך כרגיל.", "לא זוהו דגלים בשיחה.");
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  return steps.sort((x, y) => rank[x.level] - rank[y.level]).slice(0, 8);
}

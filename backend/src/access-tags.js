// שלב 74 (פריט 19): תגיות נגישות שנגזרות מתוכן הפעולה, בלי AI ובלי מסד.
// מדריך שיש לו חניך עם מגבלה, או קבוצה שקטה, או חדר בלי מקום לריצה, צריך לדעת מהר אם הפעולה מתאימה.
// הבדיקה לפי מילות מפתח בשלבי הפעולה (לא בהערות הבטיחות: שם כתוב "לא רצים" וזה לא אומר שרצים).
import { gearLoad } from "./gear.js";

const RUN = /רצ(?!י)|רוץ|ריצה|מירוץ|תופסת|מרדף|קופצ|קפיצ|סלאלום/;
const MOVE = /עוברים בין|תחנות|מסתובבים|מטפסים|עומדים בשורות|הולכים|צועדים|מחליפים מקום/;
const SIT = /יושבים|ישיבה|מתיישבים|במעגל|על הרצפה|על כיסאות/;
const NOISE = /צועק|צעק|בקול רם|תופים|רמקול|מוזיקה|שיר בקול|שרים|מנגנים|שורקים|קריאות|מחיאות כפיים/;
const READ_WRITE = /קוראים|קריאה|כותבים|כתיבה|רושמים|רישום|דף עבודה|מכתב|טקסט כתוב|ממלאים|מילים כתובות/;
const CONTACT = /מגע|דחיפה|היאבקות|נוגעים|חיבוק|מושכים|מרימים|נשענים|נתמכים/;
const FOOD = /אוכל|ממתק|עוגה|שוקולד|בישול|לאכול|חטיף|טועמים|פיתה|לחם|שתייה משותפת/;
// "לא רצים", "בלי מגע": שלילה לא נחשבת
const NEGATED = /(?:לא|בלי|ללא|אסור)\s+(?:ל)?(?:רצ\S*|ריצה|רוץ|מגע|נוגע\S*|דחיפ\S*|צועק\S*)/g;

export const ACCESS_TAGS = [
  { id: "noRun", label: "בלי ריצה", test: (t, a) => !RUN.test(t) && !a.energeticMode },
  { id: "seated", label: "אפשר לעשות בישיבה", test: (t) => !RUN.test(t) && !MOVE.test(t) && SIT.test(t) },
  { id: "quiet", label: "שקטה", test: (t) => !NOISE.test(t) },
  { id: "noReadWrite", label: "בלי קריאה וכתיבה", test: (t) => !READ_WRITE.test(t) },
  { id: "noContact", label: "בלי מגע", test: (t) => !CONTACT.test(t) },
  { id: "noFood", label: "בלי אוכל (אלרגיות)", test: (t) => !FOOD.test(t) },
  { id: "lightGear", label: "ציוד קל", test: (_t, a) => gearLoad(a.equipment || "") <= 1 },
];
export const ACCESS_IDS = ACCESS_TAGS.map((t) => t.id);

const textOf = (a) => (a.stages || []).map((s) => s.content || "").join("\n").replace(NEGATED, " ");

/** התגיות שהפעולה עומדת בהן: [{ id, label }] */
export function accessTags(a) {
  const t = textOf(a);
  return ACCESS_TAGS.filter((x) => x.test(t, a)).map(({ id, label }) => ({ id, label }));
}

/** האם הפעולה עומדת בכל התגיות המבוקשות. */
export function hasAccess(a, ids) {
  if (!ids?.length) return true;
  const have = new Set(accessTags(a).map((x) => x.id));
  return ids.every((id) => have.has(id));
}

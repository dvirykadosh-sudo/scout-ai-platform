// שלב 61 (רעיון 15): תחנות על שביל השנה. חגים מחושבים מהלוח העברי (בלי טבלה קבועה), ועליהם האירועים של המדריך והשבט.
import { hebrewParts } from "./topics.js";

// month: שמות החודשים העבריים כפי ש-ICU מדפיס. d: [מ, עד]. התאריכים נומינליים (בלי הזזות שבת של יום העצמאות/השואה).
const HOLIDAYS = [
  { m: ["Tishri"], d: [1, 2], name: "ראש השנה" },
  { m: ["Tishri"], d: [10, 10], name: "יום כיפור" },
  { m: ["Tishri"], d: [15, 21], name: "סוכות" },
  { m: ["Tishri"], d: [22, 23], name: "שמחת תורה" },
  { m: ["Kislev"], d: [25, 30], name: "חנוכה" },
  { m: ["Shevat"], d: [15, 15], name: "ט״ו בשבט" },
  { m: ["Adar", "Adar II"], d: [14, 14], name: "פורים" },
  { m: ["Nisan"], d: [15, 21], name: "פסח" },
  { m: ["Nisan"], d: [27, 27], name: "יום השואה" },
  { m: ["Iyar"], d: [4, 4], name: "יום הזיכרון" },
  { m: ["Iyar"], d: [5, 5], name: "יום העצמאות" },
  { m: ["Iyar"], d: [18, 18], name: "ל״ג בעומר" },
  { m: ["Sivan"], d: [6, 7], name: "שבועות" },
  { m: ["Av"], d: [9, 9], name: "תשעה באב" },
];

const isoAdd = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** תחנות חג בין שני תאריכים (כולל). כל חג מופיע פעם אחת, ביום הראשון שלו. */
export function holidayStations(from, to) {
  const out = [];
  let prev = "";
  for (let d = from; d <= to; d = isoAdd(d, 1)) {
    const { month, day } = hebrewParts(new Date(`${d}T12:00:00Z`));
    const h = HOLIDAYS.find((x) => x.m.includes(month) && day >= x.d[0] && day <= x.d[1]);
    if (h && h.name !== prev) out.push({ date: d, title: h.name, kind: "holiday" });
    prev = h ? h.name : "";
  }
  return out;
}

const CAMP = /מחנה|מסע|טיול|שבוע שבט|קייטנ|שבת שבט|לינה|שדה/;
const CEREMONY = /טקס|חניכ|הסמכ|עלי|סיום|פרידה|הודיה|מסדר|השבעה|קבלת/;
/** סוג תחנה לפי שם האירוע. */
export const classify = (title) => (CEREMONY.test(title) ? "ceremony" : CAMP.test(title) ? "camp" : null);

/** שנת צופים: 1 בספטמבר עד 31 באוגוסט. */
export function scoutYear(today) {
  const y = Number(today.slice(0, 4));
  const start = today.slice(5, 7) >= "09" ? y : y - 1;
  return { year: start, from: `${start}-09-01`, to: `${start + 1}-08-31` };
}

// שלב 58 – מספרי טלפון ומזהי וואטסאפ. קלט חופשי → מזהה תקני, ותצוגה מוסתרת ליומנים.

const GROUP = /^\d{5,25}(-\d{5,25})?@g\.us$/;
const PERSON = /^\d{8,15}@c\.us$/;

/**
 * מקבל מספר בכתיבה חופשית (052-1234567, +972 52 123 4567, 972521234567) ומחזיר 972521234567@c.us.
 * מזהה שכבר בפורמט תקני (אדם או קבוצה) עובר כמו שהוא. מחזיר null אם לא תקין.
 */
export function normalizeWaId(input) {
  const s = String(input ?? "").trim();
  if (GROUP.test(s) || PERSON.test(s)) return s;
  let d = s.replace(/@c\.us$/, "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `972${d.slice(1)}`; // מספר ישראלי מקומי
  if (!/^\d{8,15}$/.test(d)) return null;
  if (d.startsWith("972") && !/^972(5\d{8}|[2-489]\d{7,8}|7\d{8})$/.test(d)) return null;
  return `${d}@c.us`;
}

export const isGroupId = (id) => GROUP.test(String(id));

/** תצוגה מוסתרת: ...4567 (בלי שאר המספר), לקבוצות: "קבוצה". */
export function waHint(id) {
  const s = String(id || "");
  if (isGroupId(s)) return "קבוצה";
  const d = s.replace(/@.*/, "");
  return d.length >= 4 ? `…${d.slice(-4)}` : "…";
}

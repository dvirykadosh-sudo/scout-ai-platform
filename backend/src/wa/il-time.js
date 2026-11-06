// שלב 58 – זמן ישראל. השרת רץ ב-UTC, ותזמוני הוואטסאפ מוגדרים בשעון ישראל (כולל מעבר קיץ/חורף).

const TZ = "Asia/Jerusalem";
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short" });
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** מפרק רגע (Date או מילישניות) לשעון ישראל: { date:"YYYY-MM-DD", time:"HH:MM", minutes, weekday:0-6 } */
export function ilParts(at = Date.now()) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, minutes: Number(hour) * 60 + Number(p.minute), weekday: WEEKDAY[p.weekday] ?? 0 };
}

/** הפרש (במילישניות) בין שעון ישראל ל-UTC ברגע נתון. */
function offsetMs(at) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second) - Math.floor(at / 1000) * 1000;
}

/** "2026-11-05" + "17:30" בשעון ישראל → מילישניות UTC. מחזיר NaN אם הקלט לא תקין. */
export function ilToUtc(date, time = "00:00") {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const t = /^(\d{1,2}):(\d{2})$/.exec(time || "");
  if (!d || !t) return NaN;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let at = guess - offsetMs(guess);
  at = guess - offsetMs(at); // תיקון נוסף סביב רגע מעבר השעון
  return at;
}

/** "HH:MM" → דקות מחצות. NaN אם לא תקין. */
export function hmToMinutes(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || "");
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
}

/** תאריך ושעה בעברית לתצוגה בהודעות: "יום חמישי, 5.11". */
export function hebrewDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!m) return "";
  const wd = ilParts(ilToUtc(date, "12:00")).weekday;
  return `יום ${DAY_NAMES[wd]}, ${+m[3]}.${+m[2]}`;
}

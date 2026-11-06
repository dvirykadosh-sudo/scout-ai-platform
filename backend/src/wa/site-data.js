// שלב 58 – שאילתות קריאה בלבד על נתוני האתר, לשימוש הבוט והכלים. אין כאן שום מידע על חניכים.
import { DAY_NAMES, hebrewDate, ilParts } from "./il-time.js";

const like = (q) => `%${String(q).replace(/[\\%_]/g, "\\$&")}%`;
const addDays = (date, n) => ilParts(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).date;

/** האירועים הקרובים ביומן האישי של מדריך (טבלת schedule). */
export function upcomingForUser(db, userId, { fromDate, days = 7, limit = 5 } = {}) {
  const from = fromDate ?? ilParts().date;
  return db
    .prepare(
      `SELECT s.id, s.date, s.time, s.group_label, s.note, COALESCE(s.title, a.title) AS title, a.id AS activity_id, a.equipment, a.duration_min
       FROM schedule s LEFT JOIN activities a ON a.id = s.activity_id
       WHERE s.user_id = ? AND s.date >= ? AND s.date <= ? ORDER BY s.date, COALESCE(s.time, ''), s.id LIMIT ?`,
    )
    .all(userId, from, addDays(from, days), limit);
}

/** אירועי הצוות (לוח הצוות). */
export function upcomingTeam(db, { fromDate, days = 14, limit = 5 } = {}) {
  const from = fromDate ?? ilParts().date;
  return db.prepare("SELECT id, title, date, leader, age_group, note FROM team_events WHERE date >= ? AND date <= ? ORDER BY date, id LIMIT ?").all(from, addDays(from, days), limit);
}

/** חיפוש בפעולות המפורסמות לפי כותרת או ערך מוביל. */
export function searchLibrary(db, q, limit = 3) {
  const t = String(q || "").trim().slice(0, 60);
  if (t.length < 2) return [];
  return db.prepare("SELECT id, title, age_group, duration_min FROM activities WHERE status = 'PUBLISHED' AND (title LIKE ? ESCAPE '\\' OR leading_value LIKE ? ESCAPE '\\') ORDER BY id DESC LIMIT ?").all(like(t), like(t), limit);
}

/** שורה קריאה לאירוע מהיומן: "יום חמישי, 5.11 ב-17:30: אחריות אישית (גדוד נעורים)". */
export function eventLine(r) {
  const when = `${hebrewDate(r.date)}${r.time ? ` ב-${r.time}` : ""}`;
  return `${when}: *${r.title || "פעולה"}*${r.group_label ? ` (${r.group_label})` : ""}`;
}

/** שם היום בשבוע (ללא "יום"). */
export const dayName = (date) => DAY_NAMES[ilParts(Date.parse(`${date}T12:00:00Z`)).weekday];
export { addDays };

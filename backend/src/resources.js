// שלב 71: התנגשויות משאבים ביומן. אותו חדר, או אותה קבוצת ציוד מ"ארון הציוד", באותו תאריך ובשעות חופפות.
// הבדיקה היא בין כל המדריכים הפעילים באתר (האתר משרת שבט אחד), וגם בין שני אירועים של אותו מדריך.
// כללים: בלי שעה אין בדיקה (יום שלם הוא לא "חפיפה"). בלי משך נחשב משך הפעולה, ואם אין גם הוא, שעה.
// קובץ טהור (חוץ מהשאילתות) כדי שאפשר יהיה לבדוק אותו בלי שרת.
import { GEAR_GROUPS } from "./gear.js";

const LABEL = new Map(GEAR_GROUPS.map((g) => [g.id, g.label]));
export const gearLabel = (id) => LABEL.get(id) ?? id;

/** שם חדר מנורמל להשוואה: בלי ניקוד, גרשיים ורווחים כפולים. "חדר א׳" ו"חדר א'" זהים. */
export const normRoom = (s) =>
  String(s ?? "")
    .replace(/[֑-ׇ]/g, "")
    .replace(/["'״׳`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const cleanGear = (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((id) => LABEL.has(id)))];
export const parseGear = (json) => {
  try {
    return cleanGear(JSON.parse(json || "[]"));
  } catch {
    return [];
  }
};

const toMin = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(t ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** חלון זמן של אירוע ביום אחד. null אם אין שעה. */
export function windowOf(time, durationMin) {
  const start = toMin(time);
  if (start === null) return null;
  const d = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60;
  return { start, end: Math.min(1440, start + d) };
}
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * cand: { userId, date, time, durationMin, room, gear, excludeId }
 * rows: שורות יומן של אותו שבט (id, user_id, date, time, dur, room, gear_json, by_name)
 * מחזיר רשימת התנגשויות: { id, mine, by, date, time, until, kind: "room" | "gear", what }
 */
export function findClashes(cand, rows) {
  const w = windowOf(cand.time, cand.durationMin);
  const room = normRoom(cand.room);
  const gear = new Set(cleanGear(cand.gear));
  if (!w || (!room && !gear.size)) return [];
  const out = [];
  for (const r of rows) {
    if (r.id === cand.excludeId || r.date !== cand.date) continue;
    const rw = windowOf(r.time, r.dur);
    if (!rw || !overlaps(w, rw)) continue;
    const base = { id: r.id, mine: r.user_id === cand.userId, by: r.user_id === cand.userId ? "אתם" : r.by_name || "מדריך/ה", date: r.date, time: r.time, until: hhmm(rw.end === 1440 ? 1439 : rw.end) };
    if (room && normRoom(r.room) === room) out.push({ ...base, kind: "room", what: r.room });
    for (const g of parseGear(r.gear_json)) if (gear.has(g)) out.push({ ...base, kind: "gear", what: gearLabel(g) });
  }
  return out;
}

/** משפט אחד בעברית לכל התנגשות. */
export const clashText = (c) => `${c.kind === "room" ? "החדר" : "הציוד"} "${c.what}" כבר משובץ ${c.mine ? "אצלכם" : `אצל ${c.by}`} ב-${c.time}–${c.until}`;

const SELECT = `SELECT s.id, s.user_id, s.date, s.time, COALESCE(s.duration_min, a.duration_min) AS dur, s.room, s.gear_json, COALESCE(u.display_name, u.username) AS by_name
  FROM schedule s JOIN users u ON u.id = s.user_id LEFT JOIN activities a ON a.id = s.activity_id
  WHERE s.date >= ? AND s.date <= ? AND s.time IS NOT NULL AND s.time <> '' AND (COALESCE(s.room, '') <> '' OR COALESCE(s.gear_json, '') NOT IN ('', '[]'))
    AND u.disabled = 0 ORDER BY s.date, s.time, s.id LIMIT 600`;

/** שורות יומן עם חדר או ציוד, של כל המדריכים הפעילים, בטווח תאריכים. userId נשמר בחתימה כדי שאפשר יהיה להגביל בעתיד לפי שבט. */
export const tribeRows = (db, _userId, from, to) => db.prepare(SELECT).all(from, to);

export function clashesFor(db, cand) {
  return findClashes(cand, tribeRows(db, cand.userId, cand.date, cand.date));
}

/** התנגשויות לכל האירועים של המדריך בטווח (לתגיות ביומן). מחזיר Map לפי מזהה אירוע. */
export function clashMap(db, userId, from, to) {
  const rows = tribeRows(db, userId, from, to);
  const out = new Map();
  for (const r of rows) {
    if (r.user_id !== userId) continue;
    const list = findClashes({ userId, date: r.date, time: r.time, durationMin: r.dur, room: r.room, gear: parseGear(r.gear_json), excludeId: r.id }, rows);
    if (list.length) out.set(r.id, list);
  }
  return out;
}

/** תפוסת משאבים בטווח: מי תופס מה ומתי. בלי שמות פעולות או קבוצות. */
export function reservations(db, userId, from, to) {
  return tribeRows(db, userId, from, to).map((r) => ({
    id: r.id,
    mine: r.user_id === userId,
    by: r.user_id === userId ? "אתם" : r.by_name || "מדריך/ה",
    date: r.date,
    time: r.time,
    until: hhmm((windowOf(r.time, r.dur)?.end ?? 0) === 1440 ? 1439 : (windowOf(r.time, r.dur)?.end ?? 0)),
    room: r.room || "",
    gear: parseGear(r.gear_json).map((id) => ({ id, label: gearLabel(id) })),
  }));
}

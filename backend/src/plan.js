// תכנון תקופתי: בוחר פעולה מהמאגר לכל שבוע לפי ערכים וגיל, ומראה אילו ערכים עדיין לא מכוסים.
import { rowToActivity } from "./activities.js";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const matchesValue = (a, v) => {
  const x = norm(a.leadingValue);
  const y = norm(v);
  return !!y && (x.includes(y) || y.includes(x));
};

export function buildPlan(db, { weeks, ageGroup, values = [], startDate }) {
  const rows = db.prepare("SELECT * FROM activities WHERE status = 'PUBLISHED'").all().map(rowToActivity);
  const stats = db.prepare("SELECT activity_id AS id, AVG(stars) AS avg, COUNT(*) AS c FROM ratings GROUP BY activity_id").all();
  const rate = new Map(stats.map((s) => [s.id, s.avg * Math.min(1, s.c / 3)]));
  const score = (a) => (a.ageGroup === ageGroup ? 100 : 0) + (rate.get(a.id) || 0) * 4 + (a.isSeed ? 1 : 0);
  const byScore = (list) => [...list].sort((p, q) => score(q) - score(p) || p.id - q.id);

  const used = new Set();
  const slots = [];
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  const seenValues = new Set();

  for (let i = 0; i < weeks; i++) {
    const wanted = cleaned.length ? cleaned[i % cleaned.length] : null;
    let pool = rows.filter((a) => !used.has(a.id));
    let note = "";
    let pick = null;
    if (wanted) {
      const forValue = pool.filter((a) => matchesValue(a, wanted));
      pick = byScore(forValue.filter((a) => !ageGroup || a.ageGroup === ageGroup))[0] || null;
      if (!pick && forValue.length) {
        pick = byScore(forValue)[0];
        note = "שכבת גיל אחרת. כדאי לשכפל ולהתאים";
      }
      if (!pick) note = `אין במאגר פעולה בערך "${wanted}"`;
    } else {
      const fresh = pool.filter((a) => !seenValues.has(norm(a.leadingValue)));
      const base = fresh.length ? fresh : pool;
      pick = byScore(base.filter((a) => !ageGroup || a.ageGroup === ageGroup))[0] || byScore(base)[0] || null;
      if (pick && ageGroup && pick.ageGroup !== ageGroup) note = "שכבת גיל אחרת. כדאי לשכפל ולהתאים";
      if (!pick) note = "אין עוד פעולות במאגר שלא שובצו";
    }
    if (pick) {
      used.add(pick.id);
      seenValues.add(norm(pick.leadingValue));
    }
    let date = null;
    if (startDate) {
      const d = new Date(`${startDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i * 7);
      date = d.toISOString().slice(0, 10);
    }
    slots.push({
      week: i + 1,
      date,
      wantedValue: wanted,
      note,
      activity: pick ? { id: pick.id, title: pick.title, durationMin: pick.durationMin, ageGroup: pick.ageGroup, leadingValue: pick.leadingValue } : null,
    });
  }

  const libraryValues = new Map();
  for (const a of rows) libraryValues.set(a.leadingValue, (libraryValues.get(a.leadingValue) || 0) + 1);
  const coverage = [...libraryValues.entries()].map(([value, count]) => ({ value, count, planned: slots.filter((s) => s.activity && norm(s.activity.leadingValue) === norm(value)).length }));
  const missing = cleaned.filter((v) => !rows.some((a) => matchesValue(a, v)));
  return { slots, coverage, missing };
}

/** תוכנית לכמה שכבות: אותו ערך בכל שבוע לכל השכבות, ופעולה מתאימה לכל שכבה. */
export function buildMultiPlan(db, { weeks, ageGroups, values = [], startDate }) {
  let shared = values.map((v) => v.trim()).filter(Boolean);
  if (!shared.length) {
    // בלי ערכים: הערכים הנפוצים במאגר, כדי שכל השכבות יעסקו באותו ערך באותו שבוע
    const counts = new Map();
    for (const r of db.prepare("SELECT leading_value AS v FROM activities WHERE status = 'PUBLISHED'").all()) counts.set(r.v, (counts.get(r.v) || 0) + 1);
    shared = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "he")).map(([v]) => v).slice(0, Math.min(weeks, 12));
  }
  const byAge = ageGroups.map((ageGroup) => ({ ageGroup, ...buildPlan(db, { weeks, ageGroup, values: shared, startDate }) }));
  const rows = Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    date: byAge[0].slots[i]?.date ?? null,
    value: shared.length ? shared[i % shared.length] : null,
    cells: byAge.map((p) => ({ ageGroup: p.ageGroup, activity: p.slots[i].activity, note: p.slots[i].note })),
  }));
  return { values: shared, ageGroups, rows, missing: [...new Set(byAge.flatMap((p) => p.missing))] };
}

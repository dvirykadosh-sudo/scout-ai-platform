// שלב 61 (רעיונות 16, 17): תובנות וסיכום שנה. כל החישובים על נתונים שכבר קיימים: הרצות, היומן וטיוטות הכתיבה עם תאריך.
// הסיכום האישי נשאר אצל המדריך. סיכום השבט הוא מונים בלבד: בלי שמות, ורק כשיש לפחות MIN_GUIDES מדריכים פעילים.
import { metaDefaults } from "./routes-write.js";

export const MIN_GUIDES = 3;
const DAY = 86400000;
const iso = (s) => String(s || "").slice(0, 10);
const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** יום ראשון של השבוע של התאריך (שבוע ישראלי) */
export const weekStart = (d) => addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay());

const parseJson = (s, fb) => {
  try {
    return JSON.parse(s);
  } catch {
    return fb;
  }
};

/**
 * כל מה שהמדריך עשה או תכנן בטווח. כל אירוע: {date, key, value, methods, minutes, rating, source, title}.
 * הרצה ושיבוץ של אותה פעולה באותו יום נספרים פעם אחת.
 */
export function collectEvents(db, uid, from, to) {
  const seen = new Set();
  const out = [];
  const push = (e) => {
    if (!okDate(e.date) || e.date < from || e.date > to || seen.has(e.key)) return;
    seen.add(e.key);
    out.push(e);
  };
  const act = (a) => ({ value: a?.leading_value || "", methods: parseJson(a?.methods_json, []), minutes: a?.duration_min ?? 0, title: a?.title || "" });

  for (const r of db
    .prepare(
      "SELECT r.id, r.activity_id, r.ran_on, a.title, a.leading_value, a.methods_json, a.duration_min FROM runs r LEFT JOIN activities a ON a.id = r.activity_id WHERE r.user_id = ? AND r.ran_on >= ? AND r.ran_on <= ?",
    )
    .all(uid, from, `${to}T23:59:59`)) {
    push({ date: iso(r.ran_on), key: `a${r.activity_id}@${iso(r.ran_on)}`, ...act(r), rating: 0, source: "run" });
  }
  for (const s of db
    .prepare(
      "SELECT s.id, s.activity_id, s.title AS s_title, s.date, s.duration_min AS s_min, a.title, a.leading_value, a.methods_json, a.duration_min FROM schedule s LEFT JOIN activities a ON a.id = s.activity_id WHERE s.user_id = ? AND s.date >= ? AND s.date <= ?",
    )
    .all(uid, from, to)) {
    const a = act(s);
    push({ date: s.date, key: s.activity_id ? `a${s.activity_id}@${s.date}` : `s${s.id}`, ...a, title: a.title || s.s_title || "פעולה", minutes: s.s_min ?? a.minutes, rating: 0, source: "schedule" });
  }
  for (const d of db.prepare("SELECT id, title, meta_json FROM write_docs WHERE owner_id = ?").all(uid)) {
    let m;
    try {
      m = metaDefaults(parseJson(d.meta_json, {}));
    } catch {
      continue;
    }
    if (m.template || m.archived) continue;
    const base = { value: m.value || "", methods: [], minutes: m.minutes ?? 0, title: d.title || "פעולה ללא שם" };
    if (m.date) push({ date: m.date, key: `w${d.id}@${m.date}`, ...base, rating: 0, source: "write" });
    for (const r of m.runs) if (r.date) push({ date: r.date, key: `w${d.id}@${r.date}`, ...base, rating: r.rating || 0, source: "write" });
  }
  return out;
}

const top = (map, n) =>
  [...map.entries()]
    .map(([label, v]) => ({ label, n: v.n, minutes: v.minutes ?? 0 }))
    .sort((a, b) => b.n - a.n || b.minutes - a.minutes || a.label.localeCompare(b.label, "he"))
    .slice(0, n);

/** ספירה לפי ערך ולפי מתודה. מתודה נספרת פעם אחת לכל אירוע, עם הדקות שלה. */
export function mixes(events) {
  const values = new Map();
  const methods = new Map();
  for (const e of events) {
    if (e.value) values.set(e.value, { n: (values.get(e.value)?.n ?? 0) + 1 });
    for (const m of e.methods) {
      if (!m?.name) continue;
      const c = methods.get(m.name) ?? { n: 0, minutes: 0 };
      c.n += 1;
      c.minutes += Number(m.minutes) || 0;
      methods.set(m.name, c);
    }
  }
  return { values: top(values, 10), methods: top(methods, 12) };
}

/** שבועות רצופים עם לפחות אירוע אחד, נספרים אחורה מהשבוע הנוכחי (או מהקודם, אם בשבוע הנוכחי עוד אין). */
export function weekStreak(dates, today) {
  const weeks = new Set(dates.filter((d) => d <= today).map(weekStart));
  let w = weekStart(today);
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n += 1;
    w = addDays(w, -7);
  }
  return n;
}
/** הרצף הארוך ביותר של שבועות בטווח */
export function bestWeekStreak(dates) {
  const ws = [...new Set(dates.map(weekStart))].sort();
  let best = 0;
  let cur = 0;
  let prev = "";
  for (const w of ws) {
    cur = prev && addDays(prev, 7) === w ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = w;
  }
  return best;
}

/** תובנות לשנה האחרונה (365 יום עד היום). */
export function buildInsights(db, uid, today) {
  const from = addDays(today, -364);
  const all = collectEvents(db, uid, from, addDays(today, 120));
  const held = all.filter((e) => e.date <= today);
  const planned = all.filter((e) => e.date > today).length;
  const heat = {};
  for (const e of held) heat[e.date] = (heat[e.date] ?? 0) + 1;
  const dates = held.map((e) => e.date);
  const months = {};
  for (const e of held) months[e.date.slice(0, 7)] = (months[e.date.slice(0, 7)] ?? 0) + 1;
  const rated = held.filter((e) => e.rating > 0);
  const mx = mixes(held);
  return {
    from,
    to: today,
    today,
    total: held.length,
    activeDays: Object.keys(heat).length,
    minutes: held.reduce((s, e) => s + (e.minutes || 0), 0),
    streakWeeks: weekStreak(dates, today),
    bestStreakWeeks: bestWeekStreak(dates),
    avgRating: rated.length ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 10) / 10 : null,
    planned,
    heat,
    months,
    values: mx.values,
    methods: mx.methods,
  };
}

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const argmax = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];

/** סיכום שנה אישי (שנת צופים ספט׳–אוג׳). */
export function buildWrapped(db, uid, sy, today) {
  const to = sy.to < today ? sy.to : today;
  const held = collectEvents(db, uid, sy.from, to);
  const mx = mixes(held);
  const wd = {};
  const mo = {};
  for (const e of held) {
    const w = new Date(`${e.date}T12:00:00Z`).getUTCDay();
    wd[w] = (wd[w] ?? 0) + 1;
    const m = Number(e.date.slice(5, 7)) - 1;
    mo[m] = (mo[m] ?? 0) + 1;
  }
  const authored = db.prepare("SELECT COUNT(*) AS c FROM activities WHERE owner_id = ? AND created_at >= ? AND created_at <= ?").get(uid, `${sy.from}T00:00:00`, `${sy.to}T23:59:59`).c;
  const rated = held.filter((e) => e.rating > 0);
  const bestDay = argmax(wd);
  const bestMonth = argmax(mo);
  const highlights = [...held]
    .filter((e) => e.title)
    .sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((e) => ({ title: e.title, date: e.date, rating: e.rating || null }));
  return {
    year: sy.year,
    from: sy.from,
    to: sy.to,
    asOf: to,
    total: held.length,
    activeDays: new Set(held.map((e) => e.date)).size,
    minutes: held.reduce((s, e) => s + (e.minutes || 0), 0),
    authored,
    topValue: mx.values[0] ?? null,
    topMethod: mx.methods[0] ?? null,
    values: mx.values.slice(0, 5),
    methods: mx.methods.slice(0, 5),
    bestWeekday: bestDay ? { name: WEEKDAYS[Number(bestDay[0])], n: bestDay[1] } : null,
    bestMonth: bestMonth ? { name: MONTHS_HE[Number(bestMonth[0])], n: bestMonth[1] } : null,
    bestStreakWeeks: bestWeekStreak(held.map((e) => e.date)),
    avgRating: rated.length ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 10) / 10 : null,
    firstDate: held.length ? held.map((e) => e.date).sort()[0] : null,
    highlights,
  };
}

/** סיכום השבט: מונים בלבד. מתחת ל-MIN_GUIDES מדריכים פעילים לא מחזירים כלום, כדי שאי אפשר יהיה לזהות אדם. */
export function buildTribeWrapped(db, sy, today) {
  const to = sy.to < today ? sy.to : today;
  const users = db.prepare("SELECT id FROM users").all();
  const values = new Map();
  const methods = new Map();
  let total = 0;
  let guides = 0;
  const minutes = { n: 0 };
  for (const u of users) {
    const ev = collectEvents(db, u.id, sy.from, to);
    if (!ev.length) continue;
    guides += 1;
    total += ev.length;
    minutes.n += ev.reduce((s, e) => s + (e.minutes || 0), 0);
    const mx = mixes(ev);
    for (const v of mx.values) values.set(v.label, { n: (values.get(v.label)?.n ?? 0) + v.n });
    for (const m of mx.methods) {
      const c = methods.get(m.label) ?? { n: 0, minutes: 0 };
      c.n += m.n;
      c.minutes += m.minutes;
      methods.set(m.label, c);
    }
  }
  if (guides < MIN_GUIDES) return { year: sy.year, hidden: true, minGuides: MIN_GUIDES };
  const authored = db.prepare("SELECT COUNT(*) AS c FROM activities WHERE owner_id IS NOT NULL AND is_seed = 0 AND created_at >= ? AND created_at <= ?").get(`${sy.from}T00:00:00`, `${sy.to}T23:59:59`).c;
  return { year: sy.year, hidden: false, asOf: to, guides, total, minutes: minutes.n, authored, values: top(values, 5), methods: top(methods, 5) };
}

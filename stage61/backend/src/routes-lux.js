// שלב 61: נתיבים לעיצוב החדש. היום (הפעולה הבאה) ומזג אוויר למקום המפגש.
import { z } from "zod";
import { metaDefaults } from "./routes-write.js";
import { gearItems } from "./gear.js";
import { daysBetween, israelToday } from "./organizer.js";
import { classify, holidayStations, scoutYear } from "./lux-trail.js";
import { KIND_LABEL, adviceFor, forecast, geocode, kindOf, pickHour, ttlCache } from "./lux-weather.js";
import { buildInsights, buildTribeWrapped, buildWrapped } from "./lux-insights.js";
import { createPresence } from "./lux-presence.js";

const todayStr = () => israelToday();
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

export function registerLuxRoutes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 40);
  const geoCache = ttlCache(300);
  const fcCache = ttlCache(300);
  // בבדיקות אפשר להחליף את ה-fetch בהחלפה של app.locals.luxFetch
  const fx = () => app.locals.luxFetch ?? fetch;

  /** מסך "היום": הפעולה הבאה של המדריך (עד 30 יום קדימה): מהיומן (שיבוצים) ומטיוטות הכתיבה עם תאריך. */
  app.get("/api/lux/today", requireUser(), lim, (req, res) => {
    const t = todayStr();
    const end = addDays(t, 30);
    const items = [];
    // 1. היומן
    const sched = db
      .prepare("SELECT s.id, s.activity_id, s.title, s.date, s.time, s.duration_min, a.title AS a_title, a.duration_min AS a_duration, a.equipment AS a_equipment, a.stages_json AS a_stages FROM schedule s LEFT JOIN activities a ON a.id = s.activity_id WHERE s.user_id = ? AND s.date >= ? AND s.date <= ? ORDER BY s.date, s.time LIMIT 40")
      .all(req.user.id, t, end);
    for (const r of sched) {
      let stages = 0;
      try {
        stages = r.a_stages ? JSON.parse(r.a_stages).length : 0;
      } catch {
        /* ignore */
      }
      items.push({
        id: r.id,
        source: "schedule",
        href: r.activity_id ? `/library/${r.activity_id}` : "/calendar",
        title: r.a_title || r.title || "פעולה",
        date: r.date,
        startTime: r.time || "",
        daysLeft: daysBetween(t, r.date),
        minutes: r.duration_min ?? r.a_duration ?? 45,
        equipment: r.a_equipment ? gearItems(r.a_equipment).filter((i) => !i.free && !i.optional).map((i) => i.text).slice(0, 12) : [],
        stages,
      });
    }
    // 2. טיוטות כתיבה עם תאריך
    const rows = db.prepare("SELECT id, title, meta_json, blocks_json FROM write_docs WHERE owner_id = ?").all(req.user.id);
    for (const r of rows) {
      let m;
      try {
        m = metaDefaults(JSON.parse(r.meta_json));
      } catch {
        continue;
      }
      if (m.template || m.archived || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || m.date < t || m.date > end) continue;
      let blocks = [];
      try {
        blocks = JSON.parse(r.blocks_json);
      } catch {
        /* ignore */
      }
      items.push({
        id: r.id,
        source: "write",
        href: `/write/${r.id}`,
        title: r.title || "פעולה ללא שם",
        date: m.date,
        startTime: m.startTime || "",
        daysLeft: daysBetween(t, m.date),
        minutes: m.minutes ?? blocks.reduce((x, b) => x + (b.minutes || 0), 0),
        equipment: [...new Set([...(m.equipment ?? []), ...(m.gear ?? [])])].slice(0, 12),
        stages: blocks.length,
      });
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
    res.json({ today: t, next: items[0] ?? null, later: items.slice(1, 4) });
  });

  /** שביל השנה: חגים, פעולות מהיומן, אירועי צוות, מחנות וטקסים. */
  app.get("/api/lux/trail", requireUser(), lim, (req, res) => {
    const t = todayStr();
    const y = scoutYear(t);
    const q = Number(req.query.year);
    const sy = Number.isInteger(q) && q >= 2020 && q <= 2100 ? scoutYear(`${q}-10-01`) : y;
    const stations = holidayStations(sy.from, sy.to);
    const sched = db
      .prepare("SELECT s.id, s.activity_id, s.title, s.date, s.time, a.title AS a_title FROM schedule s LEFT JOIN activities a ON a.id = s.activity_id WHERE s.user_id = ? AND s.date >= ? AND s.date <= ? ORDER BY s.date LIMIT 400")
      .all(req.user.id, sy.from, sy.to);
    for (const r of sched) {
      const title = r.a_title || r.title || "פעולה";
      const k = classify(title) || "activity";
      stations.push({ date: r.date, title, kind: k, href: r.activity_id ? `/library/${r.activity_id}` : "/calendar", time: r.time || "" });
    }
    const team = db.prepare("SELECT id, title, date, leader FROM team_events WHERE date >= ? AND date <= ? ORDER BY date LIMIT 400").all(sy.from, sy.to);
    for (const r of team) stations.push({ date: r.date, title: r.title, kind: classify(r.title) || "team", href: "/team" });
    stations.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ year: sy.year, from: sy.from, to: sy.to, today: t, stations });
  });

  const wz = z.object({
    place: z.string().trim().min(2).max(60),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hour: z.coerce.number().int().min(0).max(23).default(17),
  });

  /** מזג אוויר למקום ולשעה. תמיד מחזיר 200; ok:false כשאין תחזית (אין רשת, מקום לא ידוע, תאריך רחוק). */
  app.get("/api/lux/weather", requireUser(), lim, async (req, res) => {
    const v = wz.safeParse(req.query);
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "מקום ותאריך לא תקינים"));
    const { place, date, hour } = v.data;
    const days = Math.round((Date.parse(date) - Date.parse(todayStr())) / 86400000);
    if (days < 0 || days > 6) return res.json({ ok: false, reason: days < 0 ? "past" : "far", message: "תחזית זמינה ל-7 הימים הקרובים בלבד" });
    try {
      const gk = place.toLowerCase();
      let g = geoCache.get(gk);
      if (g === undefined) {
        g = await geocode(place, fx());
        geoCache.set(gk, g, 24 * 3600_000);
      }
      if (!g) return res.json({ ok: false, reason: "place", message: "לא מצאתי את המקום. נסו שם של עיר" });
      const fk = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`;
      let f = fcCache.get(fk);
      if (!f) {
        f = await forecast(g.lat, g.lon, fx());
        fcCache.set(fk, f, 20 * 60_000);
      }
      const h = pickHour(f, date, hour);
      if (!h) return res.json({ ok: false, reason: "hour", message: "אין תחזית לשעה הזאת" });
      const kind = kindOf(h.code);
      res.json({ ok: true, place: g.name, date, hour, ...h, kind, label: KIND_LABEL[kind], advice: adviceFor(h), source: "Open-Meteo" });
    } catch (e) {
      console.warn("[weather]", e?.message || e);
      res.json({ ok: false, reason: "network", message: "אין חיבור לשירות מזג האוויר כרגע" });
    }
  });

  /** תובנות: מפת חום, ערכים ומתודות לשנה האחרונה. רק הנתונים של המדריך עצמו. */
  app.get("/api/lux/insights", requireUser(), lim, (req, res) => {
    res.json(buildInsights(db, req.user.id, todayStr()));
  });

  const yearOf = (q) => {
    const n = Number(q);
    return scoutYear(Number.isInteger(n) && n >= 2020 && n <= 2100 ? `${n}-10-01` : todayStr());
  };
  /** "Wrapped": סיכום שנת הצופים של המדריך. */
  app.get("/api/lux/wrapped", requireUser(), lim, (req, res) => {
    res.json(buildWrapped(db, req.user.id, yearOf(req.query.year), todayStr()));
  });
  /** סיכום השבט: מונים בלבד, בלי שמות. מוסתר כשיש פחות משלושה מדריכים פעילים. */
  app.get("/api/lux/wrapped/tribe", requireUser(), lim, (req, res) => {
    res.json(buildTribeWrapped(db, yearOf(req.query.year), todayStr()));
  });

  // ── נוכחות בטיוטה משותפת (רעיון 18) ──
  const presence = app.locals.luxPresence ?? (app.locals.luxPresence = createPresence());
  const plim = limiter(60_000, 120);
  const pz = z.object({ cid: z.string().min(6).max(40), name: z.string().max(60).optional(), typing: z.boolean().optional() });
  const draftState = (d) => ({
    commentCount: db.prepare("SELECT COUNT(*) AS c FROM assist_comments WHERE draft_id = ?").get(d.id).c,
    updatedAt: d.updated_at,
  });
  /** אורחים בקישור השיתוף. הקישור עצמו הוא ההרשאה (אותו כלל כמו קריאת הטיוטה המשותפת). */
  app.post("/api/lux/presence/shared/:token", plim, (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return res.status(404).json(fail("NOT_FOUND", "הקישור לא תקין"));
    const d = db.prepare("SELECT id, updated_at FROM assist_drafts WHERE share_token = ?").get(token);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "השיתוף בוטל"));
    const v = pz.safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "בקשה לא תקינה"));
    const people = presence.beat(`d${d.id}`, v.data.cid, { name: v.data.name, typing: v.data.typing });
    res.json({ people: people ?? [], ...draftState(d) });
  });
  /** הכותב/ת: רואים מי קורא עכשיו, ומעדכנים שגם הם מחוברים. */
  app.post("/api/lux/presence/draft/:id", requireUser(), plim, (req, res) => {
    const d = db.prepare("SELECT id, share_token, updated_at FROM assist_drafts WHERE id = ? AND owner_id = ?").get(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "הטיוטה לא נמצאה"));
    if (!d.share_token) return res.json({ shared: false, people: [], ...draftState(d) });
    const v = pz.safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "בקשה לא תקינה"));
    const name = db.prepare("SELECT COALESCE(display_name, username) AS n FROM users WHERE id = ?").get(req.user.id)?.n || "הכותב/ת";
    const people = presence.beat(`d${d.id}`, v.data.cid, { name, owner: true, typing: v.data.typing });
    res.json({ shared: true, people: people ?? [], ...draftState(d) });
  });

  // ── אשף נוחות (רעיון 20): העדפות נגישות שנשמרות בחשבון ועוברות בין מכשירים ──
  const comfortSchema = z
    .object({
      fs: z.enum(["100", "115", "130", "150"]).default("100"),
      motion: z.enum(["full", "calm", "off"]).default("full"),
      contrast: z.boolean().default(false),
      cvd: z.boolean().default(false),
      readAloud: z.boolean().default(false),
      rate: z.number().min(0.6).max(1.6).default(1),
      sound: z.boolean().default(false),
      haptics: z.boolean().default(true),
      mascot: z.boolean().default(true),
    })
    .strict();
  app.get("/api/lux/comfort", requireUser(), lim, (req, res) => {
    const r = db.prepare("SELECT json, updated_at FROM user_comfort WHERE user_id = ?").get(req.user.id);
    if (!r) return res.json({ saved: false, prefs: comfortSchema.parse({}), updatedAt: null });
    let prefs;
    try {
      prefs = comfortSchema.parse(JSON.parse(r.json));
    } catch {
      prefs = comfortSchema.parse({});
    }
    res.json({ saved: true, prefs, updatedAt: r.updated_at });
  });
  app.put("/api/lux/comfort", requireUser(), lim, (req, res) => {
    const v = comfortSchema.safeParse(req.body ?? {});
    if (!v.success) return res.status(400).json(fail("BAD_REQUEST", "העדפות לא תקינות"));
    const at = new Date().toISOString();
    db.prepare("INSERT INTO user_comfort (user_id, json, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at").run(req.user.id, JSON.stringify(v.data), at);
    res.json({ saved: true, prefs: v.data, updatedAt: at });
  });
  app.delete("/api/lux/comfort", requireUser(), lim, (req, res) => {
    db.prepare("DELETE FROM user_comfort WHERE user_id = ?").run(req.user.id);
    res.json({ saved: false });
  });
}

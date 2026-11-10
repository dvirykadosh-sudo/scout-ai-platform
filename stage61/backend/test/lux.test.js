// שלב 61: מזג אוויר למקום המפגש ומסך "היום".
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-lux-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { adviceFor, kindOf, pickHour } = await import("../src/lux-weather.js");
const { classify, holidayStations, scoutYear } = await import("../src/lux-trail.js");
const { bestWeekStreak, weekStart, weekStreak } = await import("../src/lux-insights.js");
const { TTL_MS, cleanName, createPresence } = await import("../src/lux-presence.js");

let server, base, db, app;
const j = async (path, opts = {}) => {
  const r = await fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const auth = (t) => ({ authorization: `Bearer ${t}` });
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

before(() => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  ensureAdmin(db);
  app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const register = async () => {
  const u = "lx" + Math.random().toString(36).slice(2, 8);
  const r = await j("/api/auth/register", { method: "POST", body: JSON.stringify({ username: u, password: "Str0ng!Passw0rd", displayName: "בודק", acceptTerms: true, signupCode: "shevet-code" }) });
  assert.ok(r.body.token, JSON.stringify(r.body));
  return r.body.token;
};

describe("lux-weather: פונקציות טהורות", () => {
  it("kindOf ממפה קודי WMO", () => {
    assert.equal(kindOf(0), "clear");
    assert.equal(kindOf(3), "cloud");
    assert.equal(kindOf(61), "rain");
    assert.equal(kindOf(81), "rain");
    assert.equal(kindOf(96), "storm");
    assert.equal(kindOf(null), "unknown");
  });
  it("גשם מוביל להצעת חלופה במבנה; סופת רעמים מסוכנת", () => {
    assert.equal(adviceFor({ tempC: 18, popPct: 80, precipMm: 2, code: 63 }).adapt, "rain");
    const st = adviceFor({ tempC: 18, popPct: 10, precipMm: 0, code: 95 });
    assert.equal(st.level, "danger");
    assert.match(st.text, /סופת רעמים/);
  });
  it("חום וקור", () => {
    assert.equal(adviceFor({ tempC: 34, popPct: 0, precipMm: 0, code: 0 }).adapt, "heat");
    assert.equal(adviceFor({ tempC: 8, popPct: 0, precipMm: 0, code: 3 }).adapt, "cold");
    assert.equal(adviceFor({ tempC: 22, popPct: 5, precipMm: 0, code: 1 }).adapt, null);
  });
  it("pickHour בוחר את השעה הנכונה ומחזיר null כשאין", () => {
    const f = { hourly: { time: ["2026-11-09T16:00", "2026-11-09T17:00"], temperature_2m: [20, 19], precipitation_probability: [10, 70], precipitation: [0, 1.5], weather_code: [1, 61] } };
    assert.deepEqual(pickHour(f, "2026-11-09", 17), { tempC: 19, popPct: 70, precipMm: 1.5, code: 61 });
    assert.equal(pickHour(f, "2026-11-09", 3), null);
    assert.equal(pickHour({}, "2026-11-09", 17), null);
  });
});

describe("/api/lux/weather", () => {
  it("דורש התחברות", async () => {
    assert.equal((await j(`/api/lux/weather?place=x1&date=${day(1)}`)).status, 401);
  });
  it("מחזיר תחזית והמלצה (עם fetch מדומה) ושומר במטמון", async () => {
    const t = await register();
    let calls = 0;
    const d = day(1);
    app.locals.luxFetch = async (url) => {
      calls++;
      if (String(url).includes("geocoding")) return { ok: true, json: async () => ({ results: [{ name: "ראשון לציון", admin1: "מחוז המרכז", latitude: 31.97, longitude: 34.79 }] }) };
      return { ok: true, json: async () => ({ hourly: { time: [`${d}T17:00`], temperature_2m: [19], precipitation_probability: [75], precipitation: [1.2], weather_code: [63] } }) };
    };
    const r = await j(`/api/lux/weather?place=${encodeURIComponent("ראשון לציון")}&date=${d}&hour=17`, { headers: auth(t) });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.kind, "rain");
    assert.equal(r.body.advice.adapt, "rain");
    assert.equal(r.body.tempC, 19);
    const before = calls;
    await j(`/api/lux/weather?place=${encodeURIComponent("ראשון לציון")}&date=${d}&hour=17`, { headers: auth(t) });
    assert.equal(calls, before, "הבקשה השנייה מגיעה מהמטמון");
    app.locals.luxFetch = undefined;
  });
  it("כשאין רשת: ok:false ולא קריסה", async () => {
    const t = await register();
    app.locals.luxFetch = async () => {
      throw new Error("boom");
    };
    const r = await j(`/api/lux/weather?place=${encodeURIComponent("עיר בלי מטמון")}&date=${day(2)}&hour=10`, { headers: auth(t) });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.reason, "network");
    app.locals.luxFetch = undefined;
  });
  it("תאריך רחוק או קלט שגוי", async () => {
    const t = await register();
    assert.equal((await j(`/api/lux/weather?place=abc&date=${day(20)}`, { headers: auth(t) })).body.reason, "far");
    assert.equal((await j(`/api/lux/weather?place=a&date=nope`, { headers: auth(t) })).status, 400);
  });
});

describe("/api/lux/today", () => {
  it("מחזיר את הפעולה הקרובה ביותר עם שעה וציוד", async () => {
    const t = await register();
    const mk = async (title, date, startTime, equipment) => {
      const c = await j("/api/write/docs", { method: "POST", headers: auth(t), body: JSON.stringify({ template: "classic", title }) });
      const id = c.body.id;
      await j(`/api/write/docs/${id}`, { method: "PUT", headers: auth(t), body: JSON.stringify({ title, meta: { date, startTime, equipment }, blocks: c.body.blocks }) });
      return id;
    };
    await mk("רחוקה", day(10), "18:00", ["חבל"]);
    const near = await mk("קרובה", day(2), "17:30", ["כדור", "חבל"]);
    const r = await j("/api/lux/today", { headers: auth(t) });
    assert.equal(r.status, 200);
    assert.equal(r.body.next?.id, near);
    assert.equal(r.body.next.startTime, "17:30");
    assert.deepEqual(r.body.next.equipment, ["כדור", "חבל"]);
    assert.equal(r.body.next.daysLeft, 2);
    assert.equal(r.body.later.length, 1);
  });
  it("בלי פעולות: next=null", async () => {
    const t = await register();
    assert.equal((await j("/api/lux/today", { headers: auth(t) })).body.next, null);
  });
});

describe("ייצוא Word עם אפשרויות עיצוב (סטודיו הייצוא)", () => {
  const hasXml = async (buf, re) => {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buf);
    const parts = await Promise.all(Object.keys(zip.files).filter((n) => /^word\/(document|header\d*)\.xml$/.test(n)).map((n) => zip.file(n).async("string")));
    return re.test(parts.join("\n"));
  };
  it("ברירת מחדל וגם צבע שבט ויישור לוגו מחזירים קובץ docx תקין", async () => {
    const plain = await fetch(`${base}/api/activities/1/export/docx`);
    assert.equal(plain.status, 200);
    const b0 = Buffer.from(await plain.arrayBuffer());
    assert.equal(b0.subarray(0, 2).toString(), "PK");
    assert.ok(await hasXml(b0, /5D2FA3/i), "ברירת המחדל סגולה");
    const r = await fetch(`${base}/api/activities/1/export/docx?accent=0E7490&logo=left&eco=1&wm=0.2`);
    assert.equal(r.status, 200);
    const b1 = Buffer.from(await r.arrayBuffer());
    assert.ok(await hasXml(b1, /0E7490/i), "צבע השבט מופיע במסמך");
  });
  it("ערכים שגויים בשאילתה לא שוברים את הייצוא", async () => {
    const r = await fetch(`${base}/api/activities/1/export/docx?accent=zzz&logo=up&theme=neon&wm=abc`);
    assert.equal(r.status, 200);
  });
});

describe("שביל השנה", () => {
  it("scoutYear: ספטמבר פותח שנה חדשה", () => {
    assert.deepEqual(scoutYear("2026-11-09"), { year: 2026, from: "2026-09-01", to: "2027-08-31" });
    assert.deepEqual(scoutYear("2027-03-02"), { year: 2026, from: "2026-09-01", to: "2027-08-31" });
    assert.equal(scoutYear("2026-08-31").year, 2025);
  });
  it("חגי תשפ״ז מחושבים נכון (מול לוח עברי ידוע)", () => {
    const h = Object.fromEntries(holidayStations("2026-09-01", "2027-08-31").map((x) => [x.title, x.date]));
    assert.equal(h["ראש השנה"], "2026-09-12");
    assert.equal(h["יום כיפור"], "2026-09-21");
    assert.equal(h["סוכות"], "2026-09-26");
    assert.equal(h["פסח"], "2027-04-22");
    assert.equal(h["שבועות"], "2027-06-11");
    assert.ok(h["חנוכה"] && h["פורים"] && h["ט״ו בשבט"] && h["ל״ג בעומר"]);
  });
  it("classify מזהה מחנות וטקסים", () => {
    assert.equal(classify("מחנה קיץ שבטי"), "camp");
    assert.equal(classify("טקס חניכה לכיתה ה"), "ceremony");
    assert.equal(classify("פעולת שבט רגילה"), null);
  });
  it("/api/lux/trail מחזיר חגים ואירועים של המדריך", async () => {
    const t = await register();
    await j("/api/me/schedule", { method: "POST", headers: auth(t), body: JSON.stringify({ title: "מחנה חנוכה", date: day(20) }) });
    const r = await j("/api/lux/trail", { headers: auth(t) });
    assert.equal(r.status, 200);
    assert.ok(r.body.stations.some((s) => s.kind === "holiday"));
    assert.ok(r.body.stations.some((s) => s.title === "מחנה חנוכה" && s.kind === "camp"));
  });
  it("/api/lux/today כולל גם אירוע מהיומן", async () => {
    const t = await register();
    await j("/api/me/schedule", { method: "POST", headers: auth(t), body: JSON.stringify({ title: "פעולת בדיקה ביומן", date: day(1), time: "18:00" }) });
    const r = await j("/api/lux/today", { headers: auth(t) });
    assert.equal(r.body.next.source, "schedule");
    assert.equal(r.body.next.startTime, "18:00");
  });
});

const uid = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
const seedEvents = (userId, dates) => {
  const a = db.prepare("SELECT id FROM activities ORDER BY id LIMIT 1").get();
  for (const d of dates) db.prepare("INSERT INTO schedule (user_id, activity_id, title, date, duration_min, created_at) VALUES (?,?,?,?,?,?)").run(userId, a.id, "פעולה", d, 40, new Date().toISOString());
};

describe("תובנות וסיכום שנה", () => {
  it("weekStart מחזיר יום ראשון; רצף שבועות", () => {
    assert.equal(weekStart("2026-11-09"), "2026-11-08"); // 9.11.2026 הוא יום שני
    assert.equal(weekStart("2026-11-08"), "2026-11-08");
    assert.equal(weekStreak(["2026-11-09", "2026-11-02", "2026-10-27"], "2026-11-10"), 3);
    assert.equal(weekStreak(["2026-10-20"], "2026-11-10"), 0);
    assert.equal(bestWeekStreak(["2026-10-01", "2026-10-08", "2026-10-15", "2026-11-12"]), 3);
  });
  it("/api/lux/insights: מפת חום, ערכים ומתודות; אירוע עתידי לא נספר כאירוע שהתקיים", async () => {
    const t = await register();
    seedEvents(uid(t), [day(-1), day(-8), day(-15), day(5)]);
    const r = await j("/api/lux/insights", { headers: auth(t) });
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 3);
    assert.equal(r.body.planned, 1);
    assert.equal(r.body.activeDays, 3);
    assert.equal(r.body.heat[day(-1)], 1);
    assert.ok(r.body.values.length >= 1);
    assert.ok(r.body.methods.length >= 1);
    assert.ok(r.body.streakWeeks >= 1);
  });
  it("insights דורש התחברות; משתמש בלי אירועים מקבל אפסים", async () => {
    assert.equal((await j("/api/lux/insights")).status, 401);
    const t = await register();
    const r = await j("/api/lux/insights", { headers: auth(t) });
    assert.equal(r.body.total, 0);
    assert.equal(r.body.streakWeeks, 0);
    assert.deepEqual(r.body.heat, {});
  });
  it("הרצה ושיבוץ של אותה פעולה באותו יום נספרים פעם אחת", async () => {
    const t = await register();
    seedEvents(uid(t), [day(-2)]);
    const a = db.prepare("SELECT id FROM activities ORDER BY id LIMIT 1").get();
    db.prepare("INSERT INTO runs (activity_id, user_id, ran_on, created_at) VALUES (?,?,?,?)").run(a.id, uid(t), day(-2), new Date().toISOString());
    assert.equal((await j("/api/lux/insights", { headers: auth(t) })).body.total, 1);
  });
  it("/api/lux/wrapped: סיכום אישי עם הדגשים", async () => {
    const t = await register();
    const sy = scoutYear(day(0));
    const ds = [day(-1), day(-3), day(-9)].filter((d) => d >= sy.from);
    seedEvents(uid(t), ds);
    const r = await j("/api/lux/wrapped", { headers: auth(t) });
    assert.equal(r.status, 200);
    assert.equal(r.body.year, sy.year);
    assert.equal(r.body.total, ds.length);
    assert.ok(Array.isArray(r.body.highlights));
    assert.ok(r.body.topValue === null || typeof r.body.topValue.label === "string");
  });
  it("סיכום שבט: מוסתר מתחת ל-3 מדריכים, ובלי שמות כשמוצג", async () => {
    const sy = scoutYear(day(0));
    const ds = [day(-1)].filter((d) => d >= sy.from);
    if (!ds.length) return; // תחילת שנה: אין מה לבדוק
    const t1 = await register();
    const early = await j("/api/lux/wrapped/tribe", { headers: auth(t1) });
    assert.equal(early.status, 200);
    // אין עדיין 3 מדריכים עם אירועים (בבדיקות הקודמות נוצרו כמה, לכן נסנן לפי hidden)
    seedEvents(uid(t1), ds);
    const t2 = await register();
    seedEvents(uid(t2), ds);
    const t3 = await register();
    seedEvents(uid(t3), ds);
    const r = await j("/api/lux/wrapped/tribe", { headers: auth(t1) });
    assert.equal(r.body.hidden, false);
    assert.ok(r.body.guides >= 3);
    const txt = JSON.stringify(r.body);
    assert.ok(!/lx[a-z0-9]{6}/.test(txt), "אין שמות משתמש בסיכום השבט");
    assert.ok(!txt.includes("בודק"), "אין שמות תצוגה בסיכום השבט");
  });
});

describe("נוכחות בטיוטה משותפת", () => {
  it("cleanName מנקה תווים מסוכנים ומגביל אורך", () => {
    const n = cleanName("  <b>דני</b>\n  כהן  ");
    assert.ok(!/[<>\n]/.test(n));
    assert.equal(n, "bדני/b כהן");
    assert.equal(cleanName(""), "אורח/ת");
    assert.equal(cleanName("א".repeat(80)).length, 24);
  });
  it("מנוע הנוכחות: TTL, הקלדה, תקרת משתתפים ומחיקה", () => {
    let now = 1_000_000;
    const p = createPresence(() => now);
    const a = p.beat("d1", "cidAAAAAA", { name: "דנה" });
    assert.equal(a.length, 1);
    assert.equal(a[0].you, true);
    const b = p.beat("d1", "cidBBBBBB", { name: "רועי", typing: true });
    assert.equal(b.length, 2);
    assert.equal(b.find((x) => x.name === "רועי").typing, true);
    assert.equal(p.list("d1", "cidAAAAAA").find((x) => x.name === "דנה").you, true);
    now += TTL_MS + 1;
    assert.equal(p.list("d1", "x").length, 0);
    assert.equal(p.size(), 0);
    for (let i = 0; i < 15; i++) p.beat("d2", `cid${String(i).padStart(6, "0")}`, { name: `ח${i}` });
    assert.equal(p.list("d2", "x").length, 12);
    p.leave("d2", "cid000000");
    assert.equal(p.list("d2", "x").length, 11);
    assert.equal(p.beat("d3", "ab", { name: "קצר" }), null);
  });
  it("HTTP: אורח ובעל הטיוטה רואים זה את זה; קישור שבוטל נפסל", async () => {
    const t = await register();
    const d = await j("/api/assist/drafts", { method: "POST", headers: auth(t), body: JSON.stringify({ title: "טיוטת נוכחות", text: "טקסט כלשהו לבדיקה" }) });
    assert.equal(d.status, 201);
    const off = await j(`/api/lux/presence/draft/${d.body.id}`, { method: "POST", headers: auth(t), body: JSON.stringify({ cid: "owner12345" }) });
    assert.equal(off.body.shared, false);
    const sh = await j(`/api/assist/drafts/${d.body.id}/share`, { method: "POST", headers: auth(t), body: JSON.stringify({ enable: true }) });
    const token = sh.body.shareToken;
    const g = await j(`/api/lux/presence/shared/${token}`, { method: "POST", body: JSON.stringify({ cid: "guest123456", name: "נועה", typing: true }) });
    assert.equal(g.status, 200);
    assert.equal(g.body.people.length, 1);
    assert.equal(g.body.people[0].typing, true);
    const o = await j(`/api/lux/presence/draft/${d.body.id}`, { method: "POST", headers: auth(t), body: JSON.stringify({ cid: "owner12345" }) });
    assert.equal(o.body.shared, true);
    assert.equal(o.body.people.length, 2);
    assert.equal(o.body.people[0].owner, true);
    assert.equal(o.body.commentCount, 0);
    // שאר המשתמשים לא רואים טיוטה של אחרים
    const other = await register();
    assert.equal((await j(`/api/lux/presence/draft/${d.body.id}`, { method: "POST", headers: auth(other), body: JSON.stringify({ cid: "intruder123" }) })).status, 404);
    // ביטול שיתוף
    await j(`/api/assist/drafts/${d.body.id}/share`, { method: "POST", headers: auth(t), body: JSON.stringify({ enable: false }) });
    assert.equal((await j(`/api/lux/presence/shared/${token}`, { method: "POST", body: JSON.stringify({ cid: "guest123456" }) })).status, 404);
    assert.equal((await j("/api/lux/presence/shared/not-a-token", { method: "POST", body: JSON.stringify({ cid: "guest123456" }) })).status, 404);
  });
});

describe("אשף נוחות: העדפות בחשבון", () => {
  it("דורש התחברות; ברירת מחדל כשאין שמירה", async () => {
    assert.equal((await j("/api/lux/comfort")).status, 401);
    const t = await register();
    const r = await j("/api/lux/comfort", { headers: auth(t) });
    assert.equal(r.body.saved, false);
    assert.equal(r.body.prefs.fs, "100");
    assert.equal(r.body.prefs.motion, "full");
  });
  it("שמירה, קריאה, ואיפוס", async () => {
    const t = await register();
    const body = { fs: "130", motion: "calm", contrast: true, cvd: true, readAloud: true, rate: 0.9, sound: false, haptics: false, mascot: false };
    const put = await j("/api/lux/comfort", { method: "PUT", headers: auth(t), body: JSON.stringify(body) });
    assert.equal(put.status, 200);
    const get = await j("/api/lux/comfort", { headers: auth(t) });
    assert.equal(get.body.saved, true);
    assert.deepEqual(get.body.prefs, body);
    await j("/api/lux/comfort", { method: "DELETE", headers: auth(t) });
    assert.equal((await j("/api/lux/comfort", { headers: auth(t) })).body.saved, false);
  });
  it("ערכים לא חוקיים ושדות זרים נדחים; משתמש לא רואה העדפות של אחר", async () => {
    const t = await register();
    for (const bad of [{ fs: "400" }, { motion: "wild" }, { rate: 5 }, { evil: true }, { contrast: "yes" }]) {
      assert.equal((await j("/api/lux/comfort", { method: "PUT", headers: auth(t), body: JSON.stringify(bad) })).status, 400, JSON.stringify(bad));
    }
    await j("/api/lux/comfort", { method: "PUT", headers: auth(t), body: JSON.stringify({ fs: "150" }) });
    const other = await register();
    assert.equal((await j("/api/lux/comfort", { headers: auth(other) })).body.saved, false);
  });
});

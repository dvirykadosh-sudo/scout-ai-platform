// שלב 71: התנגשויות חדר וציוד ביומן, חידון/גלגל/לוח ניקוד של זירת המשחק, כרטיס הזמנה לסטורי ואישור הגעה דרך קישור
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-m71-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const R = await import("../src/resources.js");
const { parseRsvpKeyed, parseRsvp } = await import("../src/wa/bot.js");
const repo = await import("../src/wa/repo.js");
const A = await import("../../frontend/src/lib/arena.ts"); // אותו קובץ שרץ בדפדפן (תחביר מחיק)
const I = await import("../../frontend/src/lib/invite.ts");
const { resetStatus } = await import("../src/wa/status.js");

const D = "2027-03-10";

// ───────────────────────── 71א. חישוב התנגשויות (יחידות) ─────────────────────────
describe("71א. התנגשויות משאבים: לוגיקה טהורה", () => {
  const row = (o) => ({ id: 1, user_id: 2, date: D, time: "17:00", dur: 60, room: "", gear_json: null, by_name: "הדס", ...o });
  const cand = (o) => ({ userId: 1, date: D, time: "17:30", durationMin: 30, room: "", gear: [], ...o });

  it("אותו חדר בשעות חופפות הוא התנגשות, בלי קשר לגרשיים וניקוד", () => {
    const r = R.findClashes(cand({ room: "חדר א'" }), [row({ room: "חדר א׳" })]);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].kind, r[0].by, r[0].time, r[0].until, r[0].mine], ["room", "הדס", "17:00", "18:00", false]);
  });
  it("שעות שנוגעות בקצה אינן חופפות (17:00–18:00 ואז 18:00)", () => {
    assert.equal(R.findClashes(cand({ time: "18:00", room: "חדר א" }), [row({ room: "חדר א" })]).length, 0);
    assert.equal(R.findClashes(cand({ time: "16:00", durationMin: 60, room: "חדר א" }), [row({ room: "חדר א" })]).length, 0);
    assert.equal(R.findClashes(cand({ time: "16:00", durationMin: 61, room: "חדר א" }), [row({ room: "חדר א" })]).length, 1);
  });
  it("ציוד: חפיפה בקבוצת ציוד אחת מספיקה, ושם הקבוצה מופיע בעברית", () => {
    const r = R.findClashes(cand({ gear: ["ball", "rope"] }), [row({ gear_json: JSON.stringify(["rope", "map"]) })]);
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, "gear");
    assert.equal(r[0].what, "חבלים וסרטים");
    assert.match(R.clashText(r[0]), /^הציוד "חבלים וסרטים" כבר משובץ אצל הדס ב-17:00–18:00$/);
  });
  it("בלי שעה אין בדיקה, בלי משאב אין התנגשות, ותאריך אחר לא מתנגש", () => {
    assert.equal(R.findClashes(cand({ time: "", room: "חדר א" }), [row({ room: "חדר א" })]).length, 0);
    assert.equal(R.findClashes(cand({}), [row({ room: "חדר א" })]).length, 0);
    assert.equal(R.findClashes(cand({ room: "חדר א" }), [row({ room: "חדר א", date: "2027-03-11" })]).length, 0);
    assert.equal(R.findClashes(cand({ room: "חדר א" }), [row({ room: "חדר א", time: null })]).length, 0);
  });
  it("אירוע לא מתנגש עם עצמו (excludeId), וכן מסומן 'אתם' מול אירוע אחר שלי", () => {
    assert.equal(R.findClashes(cand({ room: "חדר א", excludeId: 1 }), [row({ room: "חדר א" })]).length, 0);
    const r = R.findClashes(cand({ room: "חדר א", userId: 2 }), [row({ room: "חדר א" })]);
    assert.equal(r[0].mine, true);
    assert.equal(r[0].by, "אתם");
  });
  it("בלי משך נחשבת שעה, וחלון נחתך בחצות", () => {
    assert.deepEqual(R.windowOf("17:00", null), { start: 1020, end: 1080 });
    assert.deepEqual(R.windowOf("23:30", 120), { start: 1410, end: 1440 });
    assert.equal(R.windowOf("", 30), null);
  });
  it("מזהי ציוד לא מוכרים נזרקים, ו-JSON שבור לא קורס", () => {
    assert.deepEqual(R.cleanGear(["ball", "ball", "לא-קיים", 5]), ["ball"]);
    assert.deepEqual(R.parseGear("{לא json"), []);
    assert.deepEqual(R.parseGear(null), []);
  });
});

// ───────────────────────── 71ב. יומן מקצה לקצה ─────────────────────────
describe("71ב. יומן: מניעת כפל שיבוץ של חדר וציוד בין מדריכים", () => {
  let server, base, db, a, b, other;
  const call = async (method, path, tok, body) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const reg = async (name) => {
    const username = name + Math.random().toString(36).slice(2, 7);
    const r = await call("POST", "/api/auth/register", null, { username, password: "Str0ng!Passw0rd", displayName: "מדריך " + name, acceptTerms: true, signupCode: "shevet-code" });
    return { token: r.body.token, id: db.prepare("SELECT id FROM users WHERE username = ?").get(username).id };
  };
  const post = (u, body) => call("POST", "/api/me/schedule", u.token, { title: "פעולה", date: D, ...body });

  before(async () => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }), serveStatic: false }).listen(0);
    base = `http://localhost:${server.address().port}`;
    a = await reg("אלה");
    b = await reg("בן");
    other = await reg("גיל");
    db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(other.id);
  });
  after(() => server.close());

  let first;
  it("שיבוץ ראשון עם חדר וציוד נשמר ומוחזר", async () => {
    const r = await post(a, { time: "17:00", durationMin: 60, room: "חדר א׳", gear: ["ball", "rope"] });
    assert.equal(r.status, 201);
    first = r.body;
    assert.equal(first.room, "חדר א׳");
    assert.deepEqual(first.gear, ["ball", "rope"]);
  });
  it("מדריך אחר שמשבץ את אותו חדר בשעה חופפת נחסם (409) עם פירוט", async () => {
    const r = await post(b, { time: "17:30", durationMin: 30, room: "חדר א'" });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "RESOURCE_CLASH");
    assert.equal(r.body.clashes.length, 1);
    assert.equal(r.body.clashes[0].kind, "room");
    assert.match(r.body.error.message, /החדר "חדר א׳" כבר משובץ אצל מדריך אלה/);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM schedule WHERE user_id = ?").get(b.id).c, 0, "שום דבר לא נשמר");
  });
  it("אותה קבוצת ציוד נחסמת, ושעה צמודה (18:00) עוברת", async () => {
    assert.equal((await post(b, { time: "17:15", durationMin: 20, gear: ["rope"] })).status, 409);
    assert.equal((await post(b, { time: "18:00", durationMin: 30, room: "חדר א׳", gear: ["rope"] })).status, 201);
  });
  it("שיבוץ של משתמש מושבת לא חוסם אחרים, ואירוע בלי שעה לא נבדק", async () => {
    db.prepare("INSERT INTO schedule (user_id, title, date, time, duration_min, room, dismissed, created_at) VALUES (?, 'ישן', ?, '17:10', 30, 'חדר מושבת', 0, '2027-01-01T00:00:00Z')").run(other.id, D);
    assert.equal((await post(b, { time: "17:10", durationMin: 30, room: "חדר מושבת" })).status, 201);
    assert.equal((await post(b, { room: "חדר א׳" })).status, 201);
  });
  it("בדיקה חיה: /check מחזיר התנגשויות בלי לשמור, ואומר מתי דילג", async () => {
    const before = db.prepare("SELECT COUNT(*) AS c FROM schedule").get().c;
    const r = await call("POST", "/api/me/schedule/check", b.token, { date: D, time: "17:45", durationMin: 15, room: "חדר א׳" });
    assert.equal(r.status, 200);
    assert.equal(r.body.clashes.length, 1);
    assert.match(r.body.messages[0], /החדר/);
    assert.equal((await call("POST", "/api/me/schedule/check", b.token, { date: D, room: "חדר א׳" })).body.skipped, "no-time");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM schedule").get().c, before);
    assert.equal((await call("POST", "/api/me/schedule/check", null, { date: D })).status, 401);
    assert.equal((await call("POST", "/api/me/schedule/check", b.token, { date: "לא", room: 1 })).status, 400);
  });
  it("force: שיבוץ בכל זאת נשמר, והמדריך שנדרס מקבל התראה ותגית התנגשות", async () => {
    const r = await post(b, { time: "17:30", durationMin: 30, room: "חדר א׳", force: true });
    assert.equal(r.status, 201);
    const n = db.prepare("SELECT kind, text, link FROM notifications WHERE user_id = ? AND kind = 'clash'").all(a.id);
    assert.equal(n.length, 1);
    assert.match(n[0].text, /שיבצו גם את החדר "חדר א׳"/);
    assert.equal(n[0].link, "/calendar");
    const list = (await call("GET", `/api/me/schedule?from=${D}&to=${D}`, a.token)).body;
    const mine = list.find((x) => x.id === first.id);
    assert.ok(mine.clashes.length >= 1, "גם אצל מי ששובץ ראשון מופיעה ההתנגשות");
    assert.equal(mine.clashes[0].by, "מדריך בן");
  });
  it("עריכה: הערה בלבד לא נחסמת בגלל התנגשות ישנה, אבל שינוי שעה לתוך התנגשות נחסם", async () => {
    const forced = db.prepare("SELECT id FROM schedule WHERE user_id = ? AND time = '17:30'").get(b.id).id;
    assert.equal((await call("PATCH", `/api/me/schedule/${forced}`, b.token, { note: "הערה חדשה" })).status, 200);
    const free = (await post(b, { time: "20:00", durationMin: 30, room: "חדר א׳" })).body;
    const move = await call("PATCH", `/api/me/schedule/${free.id}`, b.token, { time: "17:10" });
    assert.equal(move.status, 409);
    assert.equal(move.body.error.code, "RESOURCE_CLASH");
    assert.equal((await call("PATCH", `/api/me/schedule/${free.id}`, b.token, { room: "חדר ב׳" })).status, 200);
  });
  it("אירוע לא מתנגש עם עצמו כשעורכים אותו, ומזהה ציוד לא קיים נדחה", async () => {
    assert.equal((await call("PATCH", `/api/me/schedule/${first.id}`, a.token, { room: "חדר א׳", time: "17:00", force: true })).status, 200);
    assert.equal((await post(a, { time: "09:00", gear: ["לא-קיים"] })).status, 400);
  });
  it("תפוסת המשאבים: מי תופס מה, בלי שמות פעולות ובלי משתמשים מושבתים", async () => {
    const r = await call("GET", `/api/me/reservations?from=${D}&to=${D}`, a.token);
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 2);
    assert.ok(r.body.every((x) => !("title" in x) && !("groupLabel" in x)));
    assert.ok(r.body.some((x) => x.by === "אתם" && x.gear.some((g) => g.label === "כדורים")));
    assert.equal(r.body.some((x) => x.by === "מדריך גיל"), false, "השיבוץ של המשתמש המושבת לא מופיע");
    assert.equal((await call("GET", `/api/me/reservations?from=${D}&to=2028-01-01`, a.token)).status, 400);
    assert.equal((await call("GET", `/api/me/reservations?from=${D}&to=${D}`, null)).status, 401);
  });
});

// ───────────────────────── 71ג. זירת משחק: חידון, גלגל, ניקוד ─────────────────────────
describe("71ג. זירת משחק", () => {
  const stages = [
    { name: "פתיחה", minutes: 10, content: "החניכים יושבים במעגל והמדריך מציג את הסיפור על הגיבורים שיצאו למסע בלילה. אחר כך כל חניך מספר מה הוא היה לוקח איתו למסע." },
    { name: "משחק מרכזי", minutes: 20, content: "הקבוצות מקבלות מפה ומצפן ועליהן למצוא חמש נקודות בשטח לפי הכיוונים. הקבוצה הראשונה שמגיעה לכל הנקודות מנצחת במשחק." },
    { name: "סיכום", minutes: 10, content: "המדריך מנהל שיחה על שיתוף פעולה ועל החשיבות של עזרה הדדית בקבוצה. לסיום כל חניך אומר מילה אחת על התחושה שלו." },
    { name: "הכנה", minutes: 5, content: "בודקים שיש מספיק ציוד לכל הקבוצות לפני תחילת הפעולה ומסדרים את החדר." },
  ];

  it("חידון: כל שאלה תקינה (תשובה אחת נכונה, אפשרויות שונות, השלמה מופיעה בתשובה)", () => {
    const { questions } = A.buildQuiz(stages, { count: 8, seed: 3 });
    assert.ok(questions.length >= 6, `נוצרו ${questions.length}`);
    for (const q of questions) {
      assert.ok(q.options.length >= 3 && q.options.length <= 4);
      assert.equal(new Set(q.options).size, q.options.length, "אין כפילויות");
      assert.ok(q.answer >= 0 && q.answer < q.options.length);
      assert.ok(q.prompt.length > 8);
      if (q.kind === "cloze") {
        assert.ok(q.prompt.includes("_____"));
        assert.ok(!q.prompt.includes(q.options[q.answer]), "התשובה לא כתובה בשאלה");
      }
    }
    assert.ok(questions.some((q) => q.kind === "cloze") && questions.some((q) => q.kind === "stage" || q.kind === "time"));
  });
  it("אותו זרע נותן אותן שאלות, וזרע אחר שאלות אחרות", () => {
    const a1 = A.buildQuiz(stages, { seed: 5 });
    assert.deepEqual(A.buildQuiz(stages, { seed: 5 }), a1);
    assert.notDeepEqual(A.buildQuiz(stages, { seed: 6 }).questions.map((q) => q.options), a1.questions.map((q) => q.options));
  });
  it("שלב אחד: אם אין בו מספיק טקסט מרחיבים לכל הפעולה ומדווחים על כך", () => {
    const withEmpty = [...stages, { name: "ריק", minutes: 0, content: "" }];
    const one = A.buildQuiz(withEmpty, { stageIndex: 4, seed: 1 });
    assert.equal(one.widened, true);
    assert.ok(one.questions.length >= 3);
    const full = A.buildQuiz(stages, { stageIndex: 0, seed: 1 });
    assert.equal(full.widened, false);
    assert.ok(full.questions.length >= 3 && full.questions.every((q) => q.source === "פתיחה"), "שאלות רק מהשלב שנבחר");
  });
  it("פעולה ריקה או קצרה לא קורסת, וכל שאלה שנוצרת תקינה", () => {
    assert.deepEqual(A.buildQuiz([], {}).questions, []);
    assert.deepEqual(A.buildQuiz([{ name: "א", minutes: 0, content: "קצר" }], {}).questions, []);
    for (const q of A.buildQuiz([{ name: "א", minutes: 5, content: "קצר" }], {}).questions) assert.ok(q.options[q.answer]);
  });
  it("שאלות משלכם: מפרסרים שורות תקינות ומדווחים על שורות שבורות", () => {
    const r = A.parseCustom("מי קם ראשון? | דן | רן | גל\nשורה שבורה\nשאלה | כן | לא\nעוד שאלה | א | ב | ג | ד | ה");
    assert.equal(r.questions.length, 2);
    assert.deepEqual(r.bad, [2, 3]);
    assert.equal(r.questions[1].options.length, 4);
    for (const q of r.questions) assert.equal(q.options[q.answer], q.prompt === "מי קם ראשון?" ? "דן" : "א");
  });
  it("גלגל מזל: הפלח שמתחת למצביע הוא תמיד הנבחר, לכל מספר פלחים ולכל סטייה", () => {
    for (const n of [2, 3, 5, 7, 10, 16]) for (let w = 0; w < n; w++) for (const j of [-0.4, -0.3, 0, 0.3, 0.4]) assert.equal(A.landing(A.spinTarget(n, w, 5, j), n), w, `${n}/${w}/${j}`);
  });
  it("גלגל מזל הוגן: חלוקה כמעט אחידה על 14,000 הטלות", () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const c = Array(7).fill(0);
    for (let i = 0; i < 14000; i++) c[A.pickWinner(7, rnd)]++;
    for (const k of c) assert.ok(k > 1700 && k < 2300, String(c));
    assert.equal(A.pickWinner(5, () => 0.9999999), 4);
  });
  it("לוח ניקוד: הוספה, ירידה בלי מינוס, דירוג עם תיקו", () => {
    let t = A.newTeams(3);
    t = A.award(A.award(t, "t1", 10), "t2", 10);
    t = A.award(t, "t3", -5);
    assert.equal(t[2].score, 0);
    const r = A.rank(t);
    assert.deepEqual(r.map((x) => [x.id, x.place]), [["t1", 1], ["t2", 1], ["t3", 3]]);
    assert.equal(A.newTeams(99).length, A.MAX_TEAMS);
    assert.equal(A.newTeams(1).length, 2);
  });
  it("משימות הגלגל קצרות, ייחודיות ובלי שמות או מגע", () => {
    assert.ok(A.WHEEL_TASKS.length >= 8 && new Set(A.WHEEL_TASKS).size === A.WHEEL_TASKS.length);
    assert.ok(A.WHEEL_TASKS.every((x) => x.length < 45 && !/מגע|לחבק|ליטוף/.test(x)));
  });
});

// ───────────────────────── 71ד. כרטיס הזמנה לסטורי ─────────────────────────
describe("71ד. כרטיס הזמנה לסטורי", () => {
  it("מספר וואטסאפ: ישראלי, בינלאומי, ושגוי", () => {
    assert.equal(I.waNumber("050-1234567"), "972501234567");
    assert.equal(I.waNumber("+972 50 123 4567"), "972501234567");
    assert.equal(I.waNumber("00972501234567"), "972501234567");
    for (const bad of ["", "abc", "123", "050123", "0000000000000000000"]) assert.equal(I.waNumber(bad), null, bad);
  });
  it("קישור אישור הגעה כולל מפתח וטקסט מוכן, ודורש מפתח תקין", () => {
    const l = I.rsvpLink("0501234567", "ab12cd");
    assert.match(l, /^https:\/\/wa\.me\/972501234567\?text=/);
    assert.equal(decodeURIComponent(l.split("text=")[1]), "אישור הגעה: כן #ab12cd");
    assert.equal(I.rsvpLink("0501234567", "XY"), null);
    assert.equal(I.rsvpLink("", "ab12cd"), null);
  });
  it("וההודעה המוכנה בקישור נקראת נכון על ידי הבוט", () => {
    const l = I.rsvpLink("0501234567", "ab12cd");
    const text = decodeURIComponent(l.split("text=")[1]);
    assert.deepEqual(parseRsvpKeyed(text), { key: "ab12cd", answer: "yes" });
    assert.deepEqual(parseRsvpKeyed(text.replace("כן", "לא")), { key: "ab12cd", answer: "no" });
    assert.deepEqual(parseRsvpKeyed("אישור הגעה: אולי #ab12cd"), { key: "ab12cd", answer: "maybe" });
  });
  it("הבוט מתעלם מהודעות בלי מפתח או בלי תשובה, ולא נוגע בזיהוי הקיים", () => {
    assert.equal(parseRsvpKeyed("כן"), null);
    assert.equal(parseRsvpKeyed("אישור הגעה #ab12cd"), null, "בלי כן/לא/אולי אין תשובה");
    assert.equal(parseRsvpKeyed("היי מה שלומך #ab12cd ושאר דברים ארוכים מאוד שלא קשורים לכלום אחד שניים שלושה ארבעה"), null);
    assert.equal(parseRsvp("1"), "yes");
  });
  it("שבירת שורות לפי רוחב, חיתוך עם שלוש נקודות, ומילה ארוכה לא נחתכת", () => {
    const m = (s) => s.length * 10;
    assert.deepEqual(I.wrapLines(m, "אחת שתיים שלוש ארבע", 90).lines, ["אחת שתיים", "שלוש ארבע"].map((x) => x));
    const cut = I.wrapLines(m, "א ב ג ד ה ו ז ח ט י כ ל", 30, 2);
    assert.equal(cut.cut, true);
    assert.equal(cut.lines.length, 2);
    assert.ok(cut.lines[1].endsWith("…"));
    assert.deepEqual(I.wrapLines(m, "מילהארוכהמאודמאוד קצר", 50).lines, ["מילהארוכהמאודמאוד", "קצר"]);
  });
  it("הודעה להעתקה: כותרת, פרטים וקישור, בלי שורות ריקות מיותרות", () => {
    const f = { title: "פעולת מסע", line: "", date: "2026-11-19", time: "17:30", place: "המועדון", bring: "" };
    const m = I.inviteMessage(f, "https://wa.me/1?text=x", null);
    assert.match(m, /^\*פעולת מסע\*\nמתי: .*17:30\nאיפה: המועדון\n\nלאישור הגעה/);
    assert.ok(!/\n\n\n/.test(m));
    assert.match(I.inviteMessage(f, null, "https://x.org/library/3"), /פרטים: https:\/\/x\.org\/library\/3$/);
  });
  it("צבע הרקע תמיד נותן ניגודיות 4.5:1 לטקסט לבן, גם בצבעי שבט בהירים", () => {
    const contrast = (hex) => 1.05 / (I.luminance(hex) + 0.05);
    for (const c of ["#5B21B6", "#FACC15", "#ffffff", "#22c55e", "#f97316", "#000000", "#38bdf8"]) assert.ok(contrast(I.backdrop(c, 0.4)) >= 4.5, `${c} -> ${contrast(I.backdrop(c, 0.4)).toFixed(2)}`);
    assert.equal(I.shade("לא צבע", 0.5), "#2a1458");
  });
});

// ───────────────────────── 71ה. אישור הגעה דרך קישור מכרטיס הזמנה (מקצה לקצה) ─────────────────────────
describe("71ה. אישורי הגעה מקישור", () => {
  let server, base, db, adminTok, bridgeTok;
  const call = async (method, path, tok, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const adm = (m, p, b) => call(m, p, adminTok, b);
  const br = (m, p, b) => call(m, p, null, b, { "x-maoz-bridge": bridgeTok });

  before(async () => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }), serveStatic: false }).listen(0);
    base = `http://localhost:${server.address().port}`;
    adminTok = (await call("POST", "/api/auth/login", null, { username: "admin", password: "admin123" })).body.token;
    resetStatus();
    await adm("PUT", "/api/admin/wa/settings", { quietFrom: "00:00", quietTo: "00:00", pauseShabbat: false });
    bridgeTok = (await adm("POST", "/api/admin/wa/bridges", { name: "בדיקה" })).body.token;
  });
  after(() => server.close());

  let key, parent;
  it("יצירת אירוע לכרטיס הזמנה: מפתח של 6 תווים, אדמין בלבד, ושם קצר מדי נדחה", async () => {
    assert.equal((await call("POST", "/api/admin/wa/rsvp-events", null, { title: "טיול" })).status, 401);
    assert.equal((await adm("POST", "/api/admin/wa/rsvp-events", { title: "א" })).status, 400);
    const r = await adm("POST", "/api/admin/wa/rsvp-events", { title: "פעולת מסע" });
    assert.equal(r.status, 201);
    assert.match(r.body.key, /^[a-z2-9]{6}$/);
    key = r.body.key;
    assert.equal(repo.eventByKey(db, key).title, "פעולת מסע");
  });
  it("הורה ששמור באנשי הקשר עונה דרך הקישור, והתשובה נרשמת באירוע", async () => {
    parent = (await adm("POST", "/api/admin/wa/contacts", { name: "הורה לדוגמה", phone: "052-7654321", audience: "parents" })).body;
    const r = await br("POST", "/api/wa/bridge/inbound", { id: "k1", from: parent.waId, text: `אישור הגעה: כן #${key}` });
    assert.equal(r.body.handled, "rsvp");
    const sum = (await adm("GET", `/api/admin/wa/rsvp/${key}`)).body;
    assert.deepEqual([sum.yes, sum.no, sum.maybe, sum.none], [1, 0, 0, 0]);
    assert.equal(sum.people[0].name, "הורה לדוגמה");
  });
  it("שינוי תשובה מעדכן (לא כופל), והאירוע מופיע ברשימת האירועים", async () => {
    await br("POST", "/api/wa/bridge/inbound", { id: "k2", from: parent.waId, text: `אישור הגעה: לא #${key}` });
    const sum = (await adm("GET", `/api/admin/wa/rsvp/${key}`)).body;
    assert.deepEqual([sum.yes, sum.no], [0, 1]);
    const list = (await adm("GET", "/api/admin/wa/rsvp")).body;
    assert.ok(list.some((e) => e.key === key && e.title === "פעולת מסע"));
  });
  it("מפתח שלא קיים, או מספר לא מוכר, לא נרשמים", async () => {
    const wrong = await br("POST", "/api/wa/bridge/inbound", { id: "k3", from: parent.waId, text: "אישור הגעה: כן #zzzzzz" });
    assert.notEqual(wrong.body.handled, "rsvp");
    const stranger = await br("POST", "/api/wa/bridge/inbound", { id: "k4", from: "972509999999@c.us", text: `אישור הגעה: כן #${key}` });
    assert.equal(stranger.body.handled, "unknown");
    assert.equal((await adm("GET", `/api/admin/wa/rsvp/${key}`)).body.no, 1);
  });
  it("הסרה מהרשימה גוברת: מי שהוסר לא נרשם", async () => {
    await br("POST", "/api/wa/bridge/inbound", { id: "k5", from: parent.waId, text: "הסר" });
    const r = await br("POST", "/api/wa/bridge/inbound", { id: "k6", from: parent.waId, text: `אישור הגעה: כן #${key}` });
    assert.equal(r.body.handled, "optedout");
    assert.equal((await adm("GET", `/api/admin/wa/rsvp/${key}`)).body.yes, 0);
  });
});

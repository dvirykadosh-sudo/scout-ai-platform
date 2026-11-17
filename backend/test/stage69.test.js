// שלב 69: מד דופק פדגוגי, סריקת מערך מצולם (Vision), ארגז כלי שטח וחדרי סנכרון צוות (SSE)
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-m69-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { config } = await import("../src/config.js");
const { AiUnavailable, createAiRouter } = await import("../src/ai-router.js");
const { createRooms, CODE_RE } = await import("../src/field-rooms.js");
const { sniffImage, SCAN_SYSTEM } = await import("../src/scan-ocr.js");
// קבצי הצד הלקוח הטהורים (תחביר מחיק), כדי לבדוק את הלוגיקה עצמה ולא עותק שלה
const pulse = await import("../../frontend/src/lib/pulse.ts");
const field = await import("../../frontend/src/lib/field.ts");

const resp = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[String(k).toLowerCase()] }, json: async () => body });
const GEM = (text) => resp(200, { candidates: [{ content: { parts: [{ text }] } }] });
const fake = (fn) => {
  const calls = [];
  const f = async (url, opts) => {
    const c = { url: String(url), opts, body: JSON.parse(opts.body) };
    calls.push(c);
    return fn(c, calls.length);
  };
  f.calls = calls;
  return f;
};
const mulberry = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

// ───────────── א. מד דופק פדגוגי ─────────────
const blk = (kind, title, text, minutes) => ({ id: `${kind}-${title}`, kind, title, text, minutes });
const GAME_TXT = "משחק קצר בו כולם קופצים ומחליפים מקומות במעגל גדול ומתרוצצים";
const TALK1 = "בקבוצות קטנות נדבר על מקרים שבהם היה קשה להגיד את האמת ונשתף מחשבות ודעות";
const TALK2 = "בשיחה במעגל גדול נשאל שאלות עומק ונחשוב על הנושא יחד לאט ובשקט רב";
const CLOSE = "כל אחד אומר מילה אחת על מה שלקח איתו מהפעולה הזאת לשבוע הקרוב";

describe("69א. מד דופק פדגוגי (לוגיקה טהורה)", () => {
  it("סיווג: משחק הוא תנועה, שיחה היא שיחה, שלב קצר מדי נשאר מעורב", () => {
    assert.equal(pulse.classify(blk("open", "פתיחה", GAME_TXT, 5)), "move");
    assert.equal(pulse.classify(blk("body", "דיון", TALK1, 10)), "talk");
    assert.equal(pulse.classify(blk("body", "x", "קצר", 5)), "mixed");
  });
  it("שני שלבי שיחה ברצף: מזוהה נפילת קשב, והמשחק המוצע שובר אותה", () => {
    const blocks = [blk("open", "פתיחה", GAME_TXT, 5), blk("body", "דיון ראשון", TALK1, 10), blk("peak", "דיון שני", TALK2, 12), blk("close", "סיכום", CLOSE, 5)];
    const r = pulse.analyzePulse(blocks);
    const d = r.drops.find((x) => x.kind === "talk-run");
    assert.ok(d, JSON.stringify(r.drops));
    assert.equal(d.insertAfter, 1);
    assert.notEqual(r.level, "good");
    const g = pulse.transitionFor(d);
    assert.equal(g.need, "move");
    const fixed = [...blocks.slice(0, 2), blk("body", `משחק מעבר: ${g.title}`, g.text, g.minutes), ...blocks.slice(2)];
    const r2 = pulse.analyzePulse(fixed);
    assert.ok(!r2.drops.some((x) => x.kind === "talk-run"), JSON.stringify(r2.drops));
    assert.ok(r2.minAttention > r.minAttention, `${r2.minAttention} > ${r.minAttention}`);
  });
  it("קצב מאוזן: אין נקודות בעייתיות והרמה יציבה", () => {
    const r = pulse.analyzePulse([blk("open", "פתיחה", GAME_TXT, 5), blk("body", "דיון", TALK1, 8), blk("peak", "יצירה", "כל קבוצה מציירת ובונה פוסטר משותף עם צבעים ועיצוב מקורי של הערך", 12), blk("close", "סיכום", CLOSE, 5)]);
    assert.equal(r.drops.length, 0, JSON.stringify(r.drops));
    assert.equal(r.level, "good");
  });
  it("ישיבה רצופה של 15 דקות ויותר, ופעולה ארוכה בלי תנועה, מזוהות", () => {
    const sit = pulse.analyzePulse([blk("open", "פתיחה", TALK1, 8), blk("body", "הסבר", "הסבר ארוך על הערך בשיחה והקראה של סיפור למעגל כולו בשקט", 10), blk("close", "סיכום", CLOSE, 5)]);
    assert.ok(sit.drops.some((d) => d.kind === "long-sit" || d.kind === "talk-run"), JSON.stringify(sit.drops));
    const flat = pulse.analyzePulse([blk("open", "א", TALK1, 15), blk("body", "ב", "הסבר ארוך על הערך בשיחה והקראה של סיפור למעגל כולו בשקט", 15), blk("peak", "ג", TALK2, 15), blk("close", "ד", CLOSE, 5)]);
    assert.ok(flat.drops.length >= 1 && flat.drops.length <= 3);
  });
  it("מסמך ריק: רמה empty, בלי התראות; הערכים תמיד בתחום", () => {
    const e = pulse.analyzePulse([blk("open", "", "", null), blk("body", "", "", null)]);
    assert.equal(e.level, "empty");
    assert.equal(e.drops.length, 0);
    assert.equal(pulse.analyzePulse([]).level, "empty");
    const r = pulse.analyzePulse([blk("body", "דיון", TALK1, 120), blk("body", "דיון", TALK2, 120), blk("body", "שיחה", TALK1, 120)]);
    for (const p of r.points) {
      assert.ok(p.attention >= 5 && p.attention <= 100 && p.energy >= 0 && p.energy <= 100, JSON.stringify(p));
    }
    assert.ok(r.drops.length <= 3);
  });
  it("בנק המשחקים: בלי ציוד, לכל צורך יש משחקים, והבחירה מתחלפת עם seed", () => {
    for (const need of ["move", "reset"]) assert.ok(pulse.GAMES.filter((g) => g.need === need).length >= 3);
    for (const g of pulse.GAMES) {
      assert.ok(g.text.length > 40 && g.minutes >= 2 && g.minutes <= 5, g.id);
      assert.ok(!/ציוד נדרש|להביא/.test(g.text), g.id);
    }
    const d = { kind: "talk-run", insertAfter: 1, need: "move", message: "" };
    assert.notEqual(pulse.transitionFor(d, 0).id, pulse.transitionFor(d, 1).id);
  });
});

// ───────────── ב. פונקציות ארגז השטח ─────────────
describe("69ב. מד רעש, חלוקה הוגנת וקריאת SSE (לוגיקה טהורה)", () => {
  it("רמת הרעש: 0 לשקט, 100 לחזק, ועולה עם העוצמה", () => {
    assert.equal(field.rmsToLevel(0), 0);
    assert.equal(field.rmsToLevel(1), 100);
    assert.equal(field.rmsToLevel(0.0001), 0);
    const ls = [0.001, 0.01, 0.05, 0.2, 0.5].map(field.rmsToLevel);
    for (let i = 1; i < ls.length; i++) assert.ok(ls[i] > ls[i - 1], ls.join());
    assert.ok(field.smooth(0, 100) > 0 && field.smooth(0, 100) < 100);
  });
  it("חלוקה הוגנת: כל אחד בדיוק פעם אחת, וגדלי הקבוצות נבדלים באחד לכל היותר", () => {
    for (const [n, k] of [[23, 5], [20, 4], [7, 3], [2, 2], [10, 1]]) {
      const people = Array.from({ length: n }, (_, i) => `p${i}`);
      const g = field.splitGroups(people, k, mulberry(n * 31 + k));
      assert.equal(g.length, k);
      assert.deepEqual(g.flat().sort(), [...people].sort());
      const sizes = g.map((x) => x.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join());
    }
  });
  it("חלוקה: אותו seed נותן אותה תוצאה, seed אחר נותן אחרת, וקבוצות מרובות מדי מקוצצות", () => {
    const p = Array.from({ length: 16 }, (_, i) => String(i));
    assert.deepEqual(field.splitGroups(p, 4, mulberry(1)), field.splitGroups(p, 4, mulberry(1)));
    assert.notDeepEqual(field.splitGroups(p, 4, mulberry(1)), field.splitGroups(p, 4, mulberry(2)));
    assert.equal(field.splitGroups(["a", "b"], 9, mulberry(3)).length, 2);
    assert.equal(field.groupsForSize(20, 4), 5);
    assert.equal(field.groupsForSize(3, 10), 1);
  });
  it("רשימת שמות: מנקה כפילויות ורווחים ושורות ריקות", () => {
    assert.deepEqual(field.parseNames("  דנה  \n\nדנה\nרוני כהן,  יובל "), ["דנה", "רוני כהן", "יובל"]);
    assert.equal(field.parseNames("x\n".repeat(500)).length, 1);
  });
  it("SSE: הודעות שלמות, הערות פעימה מתעלמים, והודעה חלקית נשמרת להמשך", () => {
    const a = field.parseSse(': ping\n\nevent: hello\ndata: {"a":1}\n\nevent: state\ndata: {"b"');
    assert.deepEqual(a.messages, [{ event: "hello", data: '{"a":1}' }]);
    assert.ok(a.rest.startsWith("event: state"));
    const b = field.parseSse(a.rest + ':2}\r\n\r\n');
    assert.deepEqual(b.messages, [{ event: "state", data: '{"b":2}' }]);
    assert.equal(b.rest, "");
  });
});

// ───────────── ג. נתב ה-AI עם תמונה ─────────────
describe("69ג. נתב AI: תמונה", () => {
  it("Gemini: התמונה נשלחת כ-inline_data לפני הטקסט, והמפתח בכותרת", async () => {
    const f = fake(() => GEM("טקסט מתומלל ארוך מספיק"));
    const r = createAiRouter({ keys: { gemini: "SECRET-GEM" }, fetchImpl: f });
    const out = await r.chat({ system: "s", user: "תמלל", image: { mime: "image/jpeg", data: JPEG.toString("base64") } });
    assert.equal(out.provider, "gemini");
    const c = f.calls[0];
    assert.equal(c.opts.headers["x-goog-api-key"], "SECRET-GEM");
    assert.ok(!c.url.includes("SECRET-GEM"));
    const parts = c.body.contents[0].parts;
    assert.equal(parts.length, 2);
    assert.equal(parts[0].inline_data.mime_type, "image/jpeg");
    assert.equal(parts[0].inline_data.data, JPEG.toString("base64"));
    assert.equal(parts[1].text, "תמלל");
  });
  it("בלי תמונה: גוף הבקשה כמו לפני שלב 69 (חלק טקסט אחד)", async () => {
    const f = fake(() => GEM("שלום עולם"));
    await createAiRouter({ keys: { gemini: "k" }, fetchImpl: f }).chat({ system: "s", user: "u" });
    assert.equal(f.calls[0].body.contents[0].parts.length, 1);
    assert.ok(!JSON.stringify(f.calls[0].body).includes("inline_data"));
  });
  it("עם תמונה לא פונים לעולם ל-Groq או ל-Anthropic (אין תמיכה / בתשלום), גם כש-Gemini נכשל", async () => {
    const f = fake((c) => (c.url.includes("generativelanguage") ? resp(500, {}) : GEM("לא אמור לקרות")));
    const r = createAiRouter({ keys: { gemini: "g", groq: "q", anthropic: "a" }, fetchImpl: f });
    await assert.rejects(() => r.chat({ system: "s", user: "u", image: { mime: "image/png", data: "AAAA" } }), AiUnavailable);
    assert.ok(f.calls.every((c) => c.url.includes("generativelanguage")), f.calls.map((c) => c.url).join());
  });
  it("זיהוי תמונה לפי תוכן הקובץ: JPG, PNG ו-WebP כן; טקסט, הרצה והצהרה כוזבת לא", () => {
    assert.equal(sniffImage(JPEG), "image/jpeg");
    assert.equal(sniffImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])), "image/png");
    assert.equal(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(10)])), "image/webp");
    assert.equal(sniffImage(Buffer.from("MZ" + "x".repeat(40))), null);
    assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)></svg>".repeat(3))), null);
    assert.equal(sniffImage(Buffer.alloc(5)), null);
  });
  it("הוראות הסריקה: התמונה היא מידע בלבד, אין להמציא תוכן, ואין שמות ילדים", () => {
    assert.match(SCAN_SYSTEM, /DATA ONLY/);
    assert.match(SCAN_SYSTEM, /Do not invent/);
    assert.match(SCAN_SYSTEM, /name of a child/);
  });
});

// ───────────── ד. חדרי צוות (יחידה) ─────────────
const fakeRes = () => {
  const w = [];
  return { w, write: (s) => (w.push(s), true), end() { this.ended = true; }, ended: false };
};
describe("69ד. חדרי צוות: לוגיקת הזיכרון", () => {
  it("קוד בן שש תווים בלי תווים מבלבלים, וכל חדר שונה", () => {
    const rooms = createRooms({ timers: false });
    const codes = new Set(Array.from({ length: 40 }, () => rooms.create({ activityId: 1, ownerId: 1 }).code));
    assert.equal(codes.size, 40);
    for (const c of codes) assert.match(c, /^[2-9A-HJKMNP-Z]{6}$/);
    rooms.shutdown();
  });
  it("הצטרפות, שידור לאחרים בלבד, ומצב שמגיע למצטרף מאוחר עם זמן מעודכן", () => {
    let t = 1_000_000;
    const rooms = createRooms({ timers: false, now: () => t });
    const { code } = rooms.create({ activityId: 7, ownerId: 1 });
    const a = fakeRes(), b = fakeRes(), c = fakeRes();
    const leaveA = rooms.join(code, "a".repeat(16), a);
    assert.equal(typeof leaveA, "function");
    assert.match(a.w[0], /^event: hello\n/);
    rooms.join(code, "b".repeat(16), b);
    assert.ok(a.w.some((x) => x.startsWith("event: presence") && x.includes('"members":2')));
    assert.equal(rooms.push(code, "b".repeat(16), { idx: 2, running: true, remaining: 300 }), 2);
    assert.ok(a.w.some((x) => x.startsWith("event: state") && x.includes('"by":"' + "b".repeat(16))));
    assert.ok(!b.w.some((x) => x.startsWith("event: state")), "השולח לא מקבל הד");
    t += 100_000; // 100 שניות עברו והטיימר רץ
    rooms.join(code, "c".repeat(16), c);
    const hello = JSON.parse(c.w[0].split("data: ")[1]);
    assert.equal(hello.activityId, 7);
    assert.deepEqual({ idx: hello.state.idx, running: hello.state.running, remaining: hello.state.remaining }, { idx: 2, running: true, remaining: 200 });
    assert.equal(hello.members, 3);
    // מושהה: הזמן לא יורד
    rooms.push(code, "a".repeat(16), { idx: 2, running: false, remaining: 180 });
    t += 60_000;
    assert.equal(rooms.info(code).state.remaining, 180);
    leaveA();
    assert.equal(rooms.info(code).members, 2);
    assert.equal(rooms.push(code, "a".repeat(16), { idx: 0, running: false, remaining: 1 }), false, "מי שיצא לא יכול לשדר");
    rooms.shutdown();
  });
  it("חדר מלא, חיבור כפול, חדר שלא קיים, ושידור ממי שלא מחובר", () => {
    const rooms = createRooms({ timers: false, maxClients: 2 });
    const { code } = rooms.create({ activityId: 1, ownerId: 1 });
    assert.equal(typeof rooms.join(code, "1".repeat(16), fakeRes()), "function");
    const dupOld = fakeRes();
    const first = rooms.join(code, "5".repeat(16), dupOld);
    const dupNew = fakeRes();
    assert.equal(typeof rooms.join(code, "5".repeat(16), dupNew), "function", "חיבור חוזר מחליף את הישן");
    assert.equal(dupOld.ended, true);
    first(); // סגירת הישן לא מנתקת את החדש
    assert.equal(rooms.info(code).members, 2);
    rooms.push(code, "5".repeat(16), { idx: 0, running: false, remaining: 5 });
    rooms.shutdown();
    const rooms2 = createRooms({ timers: false, maxClients: 2 });
    const code2 = rooms2.create({ activityId: 1, ownerId: 1 }).code;
    assert.equal(typeof rooms2.join(code2, "1".repeat(16), fakeRes()), "function");
    assert.equal(typeof rooms2.join(code2, "2".repeat(16), fakeRes()), "function");
    assert.equal(rooms2.join(code2, "3".repeat(16), fakeRes()), "full");
    assert.equal(rooms2.check(code2, "3".repeat(16)), "full");
    assert.equal(rooms2.check(code2, "1".repeat(16)), "ok", "מי שכבר בחדר יכול להתחבר מחדש גם כשהוא מלא");
    assert.equal(rooms2.join("ZZZZZZ", "4".repeat(16), fakeRes()), "none");
    assert.equal(rooms2.push(code2, "9".repeat(16), { idx: 0, running: false, remaining: 5 }), false);
    rooms2.shutdown();
  });
  it("ניקוי: חדר ריק שנשכח נמחק, חדר ישן נסגר עם הודעה, ויש תקרה למספר החדרים", () => {
    let t = 0;
    const rooms = createRooms({ timers: false, now: () => t, idleMs: 1000, ttlMs: 5000, maxRooms: 3 });
    const r1 = rooms.create({ activityId: 1, ownerId: 1 }).code;
    const r2 = rooms.create({ activityId: 1, ownerId: 1 }).code;
    const res = fakeRes();
    rooms.join(r2, "a".repeat(16), res);
    t = 2000;
    rooms.sweep();
    assert.equal(rooms.has(r1), false, "ריק ונשכח");
    assert.equal(rooms.has(r2), true, "יש בו מחובר");
    t = 6000;
    rooms.sweep();
    assert.equal(rooms.has(r2), false);
    assert.ok(res.w.some((x) => x.startsWith("event: closed")) && res.ended);
    for (let i = 0; i < 3; i++) rooms.create({ activityId: 1, ownerId: 1 });
    assert.throws(() => rooms.create({ activityId: 1, ownerId: 1 }), (e) => e.status === 503);
    rooms.shutdown();
    assert.equal(rooms.size(), 0);
  });
});

// ───────────── ה. HTTP: סריקה וחדרים ─────────────
describe("69ה. נתיבי סריקה וחדרי צוות דרך HTTP", () => {
  let server, base, app, db, tok, tok2, actId;
  const j = async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const auth = (t) => ({ authorization: `Bearer ${t}` });
  const reg = async () => {
    const u = "m69" + Math.random().toString(36).slice(2, 8);
    return (await j("/api/auth/register", { method: "POST", body: JSON.stringify({ username: u, password: "Str0ng!Passw0rd", displayName: "בודק", acceptTerms: true, signupCode: "shevet-code" }) })).body.token;
  };
  const scan = (body, headers = {}) => fetch(base + "/api/lux/scan", { method: "POST", headers: { "content-type": "application/octet-stream", ...headers }, body }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  before(async () => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;
    tok = await reg();
    tok2 = await reg();
    actId = db.prepare("SELECT id FROM activities LIMIT 1").get().id;
  });
  after(() => {
    app.locals.fieldRooms?.shutdown();
    server.closeAllConnections?.();
    server.close();
  });
  const withGemini = async (reply, fn) => {
    const prev = config.ai.gemini.key;
    config.ai.gemini.key = "gk-test";
    app.locals.luxFetch = async (url, opts) => reply(String(url), JSON.parse(opts.body));
    try {
      await fn();
    } finally {
      config.ai.gemini.key = prev;
      app.locals.luxFetch = undefined;
    }
  };

  const TRANSCRIPT = [
    "פעולה על אומץ", "ציוד: חבל, כדור", "בטיחות: להשגיח על הקבוצה בזמן המרוץ", "ערך מוביל: אומץ", "שכבת גיל: כיתה ו' - מעורב",
    "פתיחה (5 דקות)", "שואלים את החבורה מתי הרגישו אומץ לאחרונה ומשתפים בזוגות.",
    "ציר זמן/משחק (15 דקות)", "משחק מרוץ שליחים בקבוצות עם משימות אומץ קטנות בדרך.",
    "זמן צופיות מעשי (10 דקות)", "קשירת קשרים בזוגות ובדיקה הדדית של הקשר.",
    "דיון (10 דקות)", "מה עזר לנו להתגבר? מתי קשה לנו לבקש עזרה?",
    "סיכום (5 דקות)", "כל אחד אומר מילה אחת על מה שלקח מהפעולה.",
  ].join("\n");

  it("סריקה: דורשת התחברות, אישור מפורש, וקובץ שהוא באמת תמונה", async () => {
    assert.equal((await scan(JPEG, { "x-scan-consent": "yes" })).status, 401);
    const noConsent = await scan(JPEG, auth(tok));
    assert.equal(noConsent.status, 400);
    assert.equal(noConsent.body.error.code, "CONSENT");
    const notImg = await scan(Buffer.from("MZ" + "x".repeat(100)), { ...auth(tok), "x-scan-consent": "yes" });
    assert.equal(notImg.status, 400);
    assert.equal(notImg.body.error.code, "BAD_IMAGE");
  });
  it("סריקה בלי GEMINI_API_KEY: 503 עם הנחיה להקלדה ידנית, ובלי שום קריאה החוצה", async () => {
    let called = 0;
    app.locals.luxFetch = async () => (called++, GEM("x"));
    try {
      const r = await scan(JPEG, { ...auth(tok), "x-scan-consent": "yes" });
      assert.equal(r.status, 503);
      assert.equal(r.body.error.code, "AI_OFF");
      assert.match(r.body.error.message, /ידנית/);
      assert.equal(called, 0);
    } finally {
      app.locals.luxFetch = undefined;
    }
  });
  it("סריקה עם Gemini: התמונה נשלחת, והתמלול מסודר בחמישה שלבים עם אזהרה", async () => {
    let seen;
    await withGemini(
      (url, body) => ((seen = { url, body }), GEM(TRANSCRIPT)),
      async () => {
        const r = await scan(JPEG, { ...auth(tok), "x-scan-consent": "yes" });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.source, "ai");
        assert.equal(r.body.title, "פעולה על אומץ");
        assert.equal(r.body.stages.length, 5);
        assert.equal(r.body.durationMin, 45);
        assert.match(r.body.equipment, /חבל/);
        assert.equal(r.body.ageGroup, "כיתה ו' - מעורב");
        assert.ok(r.body.transcript.includes("פתיחה"));
        assert.match(r.body.warnings[0], /^נסרק מתמונה/);
      },
    );
    assert.ok(seen.url.includes("generativelanguage.googleapis.com"));
    assert.equal(seen.body.contents[0].parts[0].inline_data.data, JPEG.toString("base64"));
    assert.match(seen.body.systemInstruction.parts[0].text, /DATA ONLY/);
  });
  it("סריקה: תשובה ריקה מהמודל היא 422 עם הנחיית צילום, ולא פעולה ריקה", async () => {
    await withGemini(
      () => GEM("   .  "),
      async () => {
        const r = await scan(JPEG, { ...auth(tok), "x-scan-consent": "yes" });
        assert.ok([422, 503].includes(r.status), String(r.status));
        assert.ok(r.body.error);
      },
    );
  });
  it("חדרים: פתיחה דורשת התחברות ופעולה קיימת, ובקשה שגויה נדחית", async () => {
    assert.equal((await j("/api/field/rooms", { method: "POST", body: JSON.stringify({ activityId: actId }) })).status, 401);
    assert.equal((await j("/api/field/rooms", { method: "POST", headers: auth(tok), body: JSON.stringify({ activityId: 999999 }) })).status, 404);
    assert.equal((await j("/api/field/rooms", { method: "POST", headers: auth(tok), body: JSON.stringify({ activityId: "x" }) })).status, 400);
    assert.equal((await j("/api/field/rooms", { method: "POST", headers: auth(tok), body: JSON.stringify({ activityId: actId, extra: 1 }) })).status, 400);
    const ok = await j("/api/field/rooms", { method: "POST", headers: auth(tok), body: JSON.stringify({ activityId: actId }) });
    assert.equal(ok.status, 201);
    assert.match(ok.body.code, CODE_RE);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const info = await j(`/api/field/rooms/${ok.body.code.toLowerCase()}`);
    assert.equal(info.status, 200);
    assert.equal(info.body.activityId, actId);
    assert.equal((await j("/api/field/rooms/ZZZZZZ")).status, 404);
    assert.equal((await j("/api/field/rooms/abc")).status, 404);
  });

  /** חיבור SSE אמיתי: אוסף הודעות ומאפשר להמתין לאחת מהן */
  const openStream = (code, cid) =>
    new Promise((resolve, reject) => {
      const msgs = [];
      let rest = "";
      const waiters = [];
      const req = http.get(`${base}/api/field/rooms/${code}/stream?cid=${cid}`, { agent: false }, (res) => {
        res.setEncoding("utf8");
        res.on("data", (d) => {
          const p = field.parseSse(rest + d);
          rest = p.rest;
          for (const m of p.messages) {
            const v = { event: m.event, ...JSON.parse(m.data) };
            msgs.push(v);
          }
          for (const w of [...waiters]) if (msgs.some(w.pred)) (waiters.splice(waiters.indexOf(w), 1), w.ok(msgs.find(w.pred)));
        });
        resolve({
          status: res.statusCode,
          headers: res.headers,
          msgs,
          wait: (pred, ms = 3000) => new Promise((ok, no) => {
            const hit = msgs.find(pred);
            if (hit) return ok(hit);
            const w = { pred, ok };
            waiters.push(w);
            setTimeout(() => no(new Error("timeout, got: " + JSON.stringify(msgs))), ms).unref?.();
          }),
          close: () => req.destroy(),
        });
      });
      req.on("error", (e) => (e.code === "ECONNRESET" ? null : reject(e)));
    });

  it("סנכרון חי: מדריך שמזיז שלב ומפעיל טיימר מעדכן את האחרים מיד, בלי הד לעצמו", async () => {
    const { code } = (await j("/api/field/rooms", { method: "POST", headers: auth(tok), body: JSON.stringify({ activityId: actId }) })).body;
    const A = "a1".repeat(8), B = "b2".repeat(8);
    const sa = await openStream(code, A);
    assert.equal(sa.status, 200);
    assert.match(sa.headers["content-type"], /text\/event-stream/);
    assert.match(sa.headers["cache-control"], /no-transform/);
    assert.equal(sa.headers["content-encoding"], undefined);
    const hello = await sa.wait((m) => m.event === "hello");
    assert.equal(hello.activityId, actId);
    assert.equal(hello.state, null);
    assert.equal(hello.members, 1);
    const sb = await openStream(code, B);
    await sb.wait((m) => m.event === "hello");
    await sa.wait((m) => m.event === "presence" && m.members === 2);

    const push = (cid, body) => j(`/api/field/rooms/${code}/state`, { method: "POST", body: JSON.stringify({ cid, ...body }) });
    const r = await push(B, { idx: 3, running: true, remaining: 420 });
    assert.equal(r.status, 200);
    assert.equal(r.body.members, 2);
    const got = await sa.wait((m) => m.event === "state");
    assert.deepEqual({ idx: got.idx, running: got.running, remaining: got.remaining, by: got.by }, { idx: 3, running: true, remaining: 420, by: B });
    assert.ok(!sb.msgs.some((m) => m.event === "state"), "השולח לא מקבל הד");

    assert.equal((await push("c3".repeat(8), { idx: 1, running: false, remaining: 5 })).status, 409, "לא מחובר");
    assert.equal((await push(A, { idx: -1, running: false, remaining: 5 })).status, 400);
    assert.equal((await push(A, { idx: 1, running: "yes", remaining: 5 })).status, 400);
    assert.equal((await push("zz", { idx: 1, running: false, remaining: 5 })).status, 400);

    const sc = await openStream(code, "d4".repeat(8));
    const late = await sc.wait((m) => m.event === "hello");
    assert.equal(late.state.idx, 3);
    assert.equal(late.state.running, true);
    assert.ok(late.state.remaining <= 420 && late.state.remaining > 400);

    // רק מי שפתח את החדר סוגר אותו, והמחוברים מקבלים הודעת סגירה
    assert.equal((await j(`/api/field/rooms/${code}`, { method: "DELETE", headers: auth(tok2) })).status, 403);
    assert.equal((await j(`/api/field/rooms/${code}`, { method: "DELETE" })).status, 401);
    assert.equal((await j(`/api/field/rooms/${code}`, { method: "DELETE", headers: auth(tok) })).status, 200);
    await sa.wait((m) => m.event === "closed");
    assert.equal((await j(`/api/field/rooms/${code}`)).status, 404);
    for (const s of [sa, sb, sc]) s.close();
  });
  it("חיבור לחדר שלא קיים או עם מזהה לא תקין נדחה", async () => {
    const s1 = await openStream("ZZZZZZ", "e5".repeat(8));
    assert.equal(s1.status, 404);
    const { code } = (await j("/api/field/rooms", { method: "POST", headers: auth(tok), body: JSON.stringify({ activityId: actId }) })).body;
    const s2 = await openStream(code, "not-hex");
    assert.equal(s2.status, 404);
    s1.close();
    s2.close();
  });
});

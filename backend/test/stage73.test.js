// שלב 73: בדיקות חדירה כחלק מהבדיקות האוטומטיות.
//  1. גישה בין משתמשים (IDOR): משתמש ב' לא קורא, לא משנה ולא מוחק משאבים של משתמש א'.
//  2. זיוף אסימונים: alg none, חתימה זרה, שינוי תפקיד בגוף האסימון, חשבון מושבת.
//  3. השמה המונית (mass assignment) והרעלת אב-טיפוס.
//  4. תקרת יצירה לאורחים.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.DAILY_CAPS = "1"; // המכסות היומיות כבויות בבדיקות, אלא אם מבקשים במפורש
process.env.API_READ_LIMIT = "1000000";
process.env.API_WRITE_LIMIT = "1000000";

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin, signToken } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { config } = await import("../src/config.js");
const jwt = (await import("jsonwebtoken")).default;

let server, base, db;
const call = async (method, path, tok, body) => {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let n = 0;
const reg = async (extra = {}) => {
  const username = "s73u" + ++n + Math.random().toString(36).slice(2, 5);
  const r = await call("POST", "/api/auth/register", null, { username, password: "Str0ng!Passw0rd7" + n, displayName: "בודק " + n, acceptTerms: true, signupCode: "shevet-code", ...extra });
  return { ...r, username, token: r.body?.token, id: r.body?.user?.id };
};
const denied = (r, what) => assert.ok(r.status === 401 || r.status === 403 || r.status === 404, `${what}: צפוי 401/403/404, התקבל ${r.status}`);

before(async () => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  ensureAdmin(db);
  server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) }).listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

describe("שלב 73: גישה בין משתמשים (IDOR)", () => {
  let A, B;
  const own = {};
  before(async () => {
    A = await reg();
    B = await reg();
    assert.ok(A.token && B.token, "הרשמה נכשלה");
    own.doc = (await call("POST", "/api/write/docs", A.token, { title: "מסמך פרטי של א" })).body.id;
    own.draft = (await call("POST", "/api/assist/drafts", A.token, { title: "טיוטה פרטית", text: "טקסט", mode: "free" })).body.id;
    own.run = (await call("POST", "/api/activities/1/runs", A.token, { ranOn: "2026-11-01", groupLabel: "ז1", worked: "טוב", changeNext: "", notes: "", engagement: 3, timing: "ok" })).body.id;
    own.group = (await call("POST", "/api/me/assist-groups", A.token, { name: "קבוצה של א", size: 12, traits: [] })).body.id;
    own.sched = (await call("POST", "/api/me/schedule", A.token, { activityId: 1, date: "2026-12-01", time: "17:00" })).body.id;
    own.memory = (await call("POST", "/api/story/memories", A.token, { kind: "memory", title: "זיכרון", body: "גוף הזיכרון הוא סיפור קצר על מפגש בשבט, באורך סביר.", value: "אחריות", tags: [], place: "", year: 2020 })).body.id;
    own.follow = (await call("POST", "/api/chat/followups", A.token, { alias: "ד'", note: "לחזור אליו", due: "2026-12-01" })).body.id;
    own.token = (await call("POST", "/api/chat/tokens", A.token, { label: "מחשב" })).body.id;
    own.note = (await call("POST", "/api/activities/1/notes", A.token, { body: "הערה פרטית" })).body.id;
    for (const [k, v] of Object.entries(own)) assert.ok(Number.isInteger(v), `יצירת ${k} נכשלה`);
  });

  it("מסמך כתיבה: ב' לא קורא, לא כותב, לא מוחק ולא משתף", async () => {
    const id = own.doc;
    denied(await call("GET", `/api/write/docs/${id}`, B.token), "קריאה");
    denied(await call("PUT", `/api/write/docs/${id}`, B.token, { title: "נפרץ", blocks: [] }), "עריכה");
    denied(await call("POST", `/api/write/docs/${id}/share`, B.token, { enable: true }), "שיתוף");
    denied(await call("GET", `/api/write/docs/${id}/versions`, B.token), "גרסאות");
    denied(await call("POST", `/api/write/docs/${id}/duplicate`, B.token, {}), "שכפול");
    denied(await call("GET", `/api/write/docs/${id}/editors`, B.token), "עורכים");
    denied(await call("POST", `/api/write/docs/${id}/editors`, B.token, { username: B.username }), "הוספת עצמו כעורך");
    denied(await call("GET", `/api/write/docs/${id}/attendance`, B.token), "נוכחות");
    denied(await call("POST", `/api/write/docs/${id}/snapshot`, B.token, {}), "גרסה");
    denied(await call("DELETE", `/api/write/docs/${id}`, B.token), "מחיקה");
    const row = db.prepare("SELECT title FROM write_docs WHERE id = ?").get(id);
    assert.equal(row?.title, "מסמך פרטי של א", "המסמך נשאר שלם");
  });

  it("טיוטת עוזר: ב' לא קורא, לא משתף ולא מוחק", async () => {
    const id = own.draft;
    denied(await call("GET", `/api/assist/drafts/${id}`, B.token), "קריאה");
    denied(await call("POST", `/api/assist/drafts/${id}/share`, B.token, { enable: true }), "שיתוף");
    denied(await call("GET", `/api/assist/drafts/${id}/versions`, B.token), "גרסאות");
    denied(await call("DELETE", `/api/assist/drafts/${id}`, B.token), "מחיקה");
    assert.ok(db.prepare("SELECT 1 FROM assist_drafts WHERE id = ? AND share_token IS NULL").get(id), "הטיוטה נשארה, ובלי קישור שיתוף");
  });

  it("יומן הרצה, קבוצות, שיבוצים, זיכרונות, מעקבים ואסימוני תוסף: רק לבעלים", async () => {
    denied(await call("DELETE", `/api/runs/${own.run}`, B.token), "מחיקת תיעוד");
    denied(await call("PUT", `/api/me/assist-groups/${own.group}`, B.token, { name: "נפרץ", size: 1, traits: [] }), "עריכת קבוצה");
    denied(await call("DELETE", `/api/me/assist-groups/${own.group}`, B.token), "מחיקת קבוצה");
    denied(await call("PATCH", `/api/me/schedule/${own.sched}`, B.token, { note: "נפרץ" }), "עריכת שיבוץ");
    denied(await call("DELETE", `/api/me/schedule/${own.sched}`, B.token), "מחיקת שיבוץ");
    denied(await call("POST", `/api/me/reminders/${own.sched}/dismiss`, B.token, {}), "סגירת תזכורת");
    denied(await call("PUT", `/api/story/memories/${own.memory}`, B.token, { kind: "memory", title: "נפרץ", body: "גוף חדש ארוך מספיק כדי לעבור את הבדיקות של השרת בלי בעיה.", value: "אחריות", tags: [], place: "", year: 2020 }), "עריכת זיכרון");
    denied(await call("DELETE", `/api/story/memories/${own.memory}`, B.token), "מחיקת זיכרון");
    denied(await call("PATCH", `/api/chat/followups/${own.follow}`, B.token, { done: true }), "עריכת מעקב");
    denied(await call("DELETE", `/api/chat/followups/${own.follow}`, B.token), "מחיקת מעקב");
    denied(await call("DELETE", `/api/chat/tokens/${own.token}`, B.token), "ביטול אסימון תוסף של אחר");
    denied(await call("DELETE", `/api/notes/${own.note}`, B.token), "מחיקת הערה");
    // וכל אחד מהם נשאר שלם
    assert.ok(db.prepare("SELECT 1 FROM runs WHERE id = ?").get(own.run));
    assert.equal(db.prepare("SELECT name FROM assist_groups WHERE id = ?").get(own.group)?.name, "קבוצה של א");
    assert.ok(db.prepare("SELECT 1 FROM schedule WHERE id = ? AND dismissed = 0").get(own.sched));
    assert.equal(db.prepare("SELECT title FROM story_memories WHERE id = ?").get(own.memory)?.title, "זיכרון");
    assert.ok(db.prepare("SELECT 1 FROM chat_followups WHERE id = ? AND done = 0").get(own.follow));
    assert.ok(db.prepare("SELECT 1 FROM ext_tokens WHERE id = ? AND revoked_at IS NULL").get(own.token));
    assert.ok(db.prepare("SELECT 1 FROM activity_notes WHERE id = ?").get(own.note));
  });

  it("הפעלות של אחר: ב' לא רואה ולא מנתק את ההתחברויות של א'", async () => {
    const mine = await call("GET", "/api/me/sessions", A.token);
    const aSession = (mine.body?.items ?? mine.body ?? [])[0];
    if (aSession?.id) denied(await call("DELETE", `/api/me/sessions/${aSession.id}`, B.token), "ניתוק התחברות של אחר");
    const stillOk = await call("GET", "/api/me/sessions", A.token);
    assert.equal(stillOk.status, 200, "א' עדיין מחובר");
  });

  it("בלי אסימון: כל כתיבה אישית נדחית", async () => {
    for (const [m, p, b] of [
      ["POST", "/api/write/docs", { title: "x" }],
      ["POST", "/api/assist/drafts", { title: "x", text: "y", mode: "free" }],
      ["POST", "/api/me/schedule", { activityId: 1, date: "2026-12-01" }],
      ["POST", "/api/me/assist-groups", { name: "x", traits: [] }],
      ["POST", "/api/chat/tokens", { label: "x" }],
      ["DELETE", `/api/runs/${own.run}`],
      ["DELETE", `/api/write/docs/${own.doc}`],
    ]) assert.equal((await call(m, p, null, b)).status, 401, `${m} ${p}`);
  });
});

describe("שלב 73: זיוף אסימונים", () => {
  it("alg none, חתימה זרה ואסימון שנפגם נדחים", async () => {
    const u = await reg();
    const payload = { sub: u.id, username: u.username, role: "ADMIN" };
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.`;
    const foreign = jwt.sign(payload, "not-the-server-secret", { expiresIn: "1h" });
    const good = u.token;
    const tampered = good.split(".").slice(0, 2).join(".") + "." + good.split(".")[2].replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    for (const [name, t] of [["alg none", none], ["חתימה זרה", foreign], ["חתימה פגומה", tampered], ["ריק", ""], ["זבל", "Bearer"]]) {
      assert.equal((await call("GET", "/api/me/sessions", t)).status, 401, name);
      assert.equal((await call("GET", "/api/admin/users", t)).status, 401, `${name} (אדמין)`);
    }
    assert.equal((await call("GET", "/api/me/sessions", good)).status, 200, "האסימון התקין עדיין עובד");
  });

  it("תפקיד בגוף האסימון לא קובע: ההרשאות נקראות מהמסד בכל בקשה", async () => {
    const u = await reg();
    // אסימון עם החתימה האמיתית של השרת, אבל עם תפקיד אדמין שלא קיים במסד
    const forged = jwt.sign({ sub: u.id, username: u.username, role: "ADMIN", mustChangePw: false }, config.jwtSecret, { expiresIn: "1h" });
    assert.equal((await call("GET", "/api/admin/users", forged)).status, 401, "תפקיד מזויף לא פותח ניהול");
    // אותו דבר כשמשנים את התפקיד באסימון של אדמין אמיתי למשתמש רגיל: מסד הנתונים הוא המקור
    const asUser = signToken({ id: u.id, username: u.username, role: "ADMIN", must_change_pw: 0 });
    assert.equal((await call("GET", "/api/admin/users", asUser)).status, 401);
  });

  it("חשבון מושבת ואסימון שנשלל מפסיקים לעבוד מיד", async () => {
    const u = await reg();
    assert.equal((await call("GET", "/api/me/sessions", u.token)).status, 200);
    db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(u.id);
    assert.equal((await call("GET", "/api/me/sessions", u.token)).status, 401, "מושבת");
    db.prepare("UPDATE users SET disabled = 0 WHERE id = ?").run(u.id);
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ?").run(new Date().toISOString(), u.id);
    assert.equal((await call("GET", "/api/me/sessions", u.token)).status, 401, "הפעלה שנשללה");
  });
});

describe("שלב 73: השמה המונית והרעלת אב-טיפוס", () => {
  it("הרשמה עם role/admin/disabled/id בגוף: החשבון נשאר מדריך רגיל", async () => {
    const r = await reg({ role: "ADMIN", isAdmin: true, staffRole: "SUPER", disabled: 0, id: 1, mustChangePw: false, emailVerified: true });
    // או שהשרת דוחה שדות לא מוכרים, או שהוא מתעלם מהם. בשני המקרים אין אדמין.
    if (r.status === 201 || r.status === 200) {
      const row = db.prepare("SELECT role, staff_role FROM users WHERE username = ?").get(r.username);
      assert.equal(row.role, "INSTRUCTOR");
      assert.ok(!row.staff_role, "בלי תפקיד צוות");
      assert.equal((await call("GET", "/api/admin/users", r.token)).status, 401);
    } else assert.ok(r.status >= 400 && r.status < 500, "נדחה בשגיאת לקוח, לא קרס");
  });

  it("__proto__ ו-constructor בגוף של נתיבים רבים לא מרעילים את Object.prototype ולא מקריסים", async () => {
    const u = await reg();
    const evil = JSON.parse('{"__proto__":{"polluted73":true},"constructor":{"prototype":{"polluted73":true}},"title":"x","name":"x","body":"x","text":"x","topic":"x"}');
    for (const [m, p] of [
      ["POST", "/api/write/docs"], ["POST", "/api/assist/drafts"], ["POST", "/api/me/assist-groups"], ["POST", "/api/me/schedule"],
      ["POST", "/api/activities/quick"], ["POST", "/api/activities/generate"], ["POST", "/api/auth/login"], ["POST", "/api/auth/register"],
      ["POST", "/api/story/memories"], ["PUT", "/api/write/docs/1"], ["POST", "/api/assist/analyze"],
    ]) {
      const r = await call(m, p, u.token, evil);
      assert.ok(r.status < 500, `${m} ${p} החזיר ${r.status}`);
    }
    assert.equal({}.polluted73, undefined, "Object.prototype לא הורעל");
    assert.equal(Object.prototype.polluted73, undefined);
  });

  it("גוף JSON פגום או ענק נדחה בשגיאת לקוח", async () => {
    const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" + '"a":'.repeat(10) });
    assert.ok(r.status >= 400 && r.status < 500, "JSON פגום: " + r.status);
    const big = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "x".repeat(3_000_000), password: "y" }) });
    assert.ok(big.status === 413 || big.status === 400, "גוף של 3MB: " + big.status);
  });
});

describe("שלב 73: אורחים לא ממלאים את המסד", () => {
  it("יצירת פעולות בלי התחברות מוגבלת בתקרה יומית לכתובת", async () => {
    const before = db.prepare("SELECT COUNT(*) AS c FROM activities").get().c;
    let limited = 0;
    for (let i = 0; i < 70; i++) {
      const r = await call("POST", "/api/activities/quick", null, {});
      if (r.status === 429) limited++;
    }
    const added = db.prepare("SELECT COUNT(*) AS c FROM activities").get().c - before;
    assert.ok(limited > 0, "הגיעה תקרה (429)");
    assert.ok(added <= 45, `נוספו ${added} שורות (התקרה היומית לאורח היא 40)`);
  });
});

describe("שלב 73: קישורי שיתוף", () => {
  it("קישור לצפייה במסמך: תוקף, ביטול, והחלפה מבטלים את הקישור הקודם", async () => {
    const A = await reg();
    const doc = (await call("POST", "/api/write/docs", A.token, { title: "מסמך לשיתוף" })).body.id;
    const t1 = (await call("POST", `/api/write/docs/${doc}/share`, A.token, { days: 1 })).body.token;
    assert.ok(t1 && t1.length >= 20, "אסימון ארוך מספיק");
    assert.equal((await call("GET", `/api/write/shared/${t1}`, null)).status, 200);
    // החלפה: האסימון הישן מפסיק לעבוד
    const t2 = (await call("POST", `/api/write/docs/${doc}/share`, A.token, { days: 1 })).body.token;
    assert.notEqual(t1, t2);
    assert.equal((await call("GET", `/api/write/shared/${t1}`, null)).status, 404, "אסימון ישן נדחה");
    // תוקף שפג, בצפייה ובהערות
    db.prepare("UPDATE write_shares SET expires_at = ? WHERE token = ?").run(new Date(Date.now() - 1000).toISOString(), t2);
    assert.equal((await call("GET", `/api/write/shared/${t2}`, null)).status, 404, "פג תוקף: צפייה");
    assert.equal((await call("GET", `/api/write/shared/${t2}/comments`, null)).status, 404, "פג תוקף: קריאת הערות");
    assert.equal((await call("POST", `/api/write/shared/${t2}/comments`, null, { author: "x", text: "y" })).status, 404, "פג תוקף: כתיבת הערה");
    // ביטול ידני
    const t3 = (await call("POST", `/api/write/docs/${doc}/share`, A.token, { days: 1 })).body.token;
    assert.equal((await call("GET", `/api/write/shared/${t3}`, null)).status, 200);
    assert.equal((await call("DELETE", `/api/write/docs/${doc}/share`, A.token)).status, 200);
    assert.equal((await call("GET", `/api/write/shared/${t3}`, null)).status, 404, "בוטל: צפייה");
  });

  it("קישור לצפייה בטיוטה: תוקף שפג וביטול, ואסימון קצר או מוזר נדחה", async () => {
    const A = await reg();
    const d = (await call("POST", "/api/assist/drafts", A.token, { title: "טיוטה לשיתוף", text: "טקסט", mode: "free" })).body.id;
    const on = (await call("POST", `/api/assist/drafts/${d}/share`, A.token, { enable: true, days: 1 })).body;
    assert.ok(on.shareToken && on.shareToken.length >= 20);
    assert.equal((await call("GET", `/api/assist/shared/${on.shareToken}`, null)).status, 200);
    db.prepare("UPDATE assist_drafts SET share_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), d);
    assert.equal((await call("GET", `/api/assist/shared/${on.shareToken}`, null)).status, 404, "פג תוקף");
    const again = (await call("POST", `/api/assist/drafts/${d}/share`, A.token, { enable: true })).body.shareToken;
    assert.equal((await call("POST", `/api/assist/drafts/${d}/share`, A.token, { enable: false })).status, 200);
    assert.equal((await call("GET", `/api/assist/shared/${again}`, null)).status, 404, "בוטל");
    for (const t of ["a", "1", "' OR 1=1 --", "..%2F..%2Fetc%2Fpasswd", "%00", "A".repeat(200)]) {
      const r = await call("GET", `/api/assist/shared/${t}`, null);
      assert.ok(r.status === 404 || r.status === 400, `אסימון "${t.slice(0, 20)}": ${r.status}`);
    }
  });
});

describe("שלב 73: ייצוא קבצים", () => {
  it("שם הקובץ בכותרת Content-Disposition מקודד: בלי מרכאות, שורות חדשות ותווים אסורים", async () => {
    const A = await reg();
    const nasty = "דוח\"; filename=\"evil.exe\r\nX-Injected: 1 (1) *'!";
    const r = await fetch(base + "/api/write/export/docx", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${A.token}` },
      body: JSON.stringify({ title: nasty, blocks: [{ id: "b1", title: "פתיחה", kind: "open", text: "שלום", minutes: 5 }] }),
    });
    assert.equal(r.status, 200);
    const cd = r.headers.get("content-disposition") || "";
    assert.match(cd, /^attachment; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/, "רק תווים בטוחים: " + cd);
    assert.equal(r.headers.get("x-injected"), null, "אין הזרקת כותרת");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    await r.arrayBuffer();
  });
});

describe("שלב 73: טקסטים זדוניים לא תוקעים את השרת (ReDoS)", () => {
  it("תשובה תוך שנייה וחצי לכל קלט פתולוגי, בנתיבי טקסט עיקריים", async () => {
    const A = await reg();
    const N = 19000;
    const evil = ["a".repeat(N) + "!", " ".repeat(N) + "x", "\n".repeat(N), ("a ".repeat(40) + "\n").repeat(230), "1.".repeat(N / 2), "(".repeat(N / 2), "שלום ".repeat(N / 5), "- ".repeat(N / 2), "10:".repeat(N / 3)];
    const routes = [
      ["POST", "/api/assist/script"], ["POST", "/api/assist/analyze"], ["POST", "/api/assist/gear"], ["POST", "/api/assist/swap"], ["POST", "/api/assist/inspire"],
      ["POST", "/api/assist/reflect"], ["POST", "/api/assist/questions"], ["POST", "/api/assist/dryrun"], ["POST", "/api/chat/parse"], ["POST", "/api/chat/analyze"],
      ["POST", "/api/write/safety"], ["POST", "/api/write/voice-check"], ["POST", "/api/write/readiness"], ["POST", "/api/story/analyze"], ["POST", "/api/style/analyze"],
      ["POST", "/api/activities/import"],
    ];
    let slowest = 0;
    for (const [m, p] of routes) {
      for (const s of evil) {
        const body = { text: s, title: s, goal: s, notes: s, message: s, content: s, topic: s, raw: s, chat: s, blocks: [{ id: "b1", title: s, kind: "body", text: s }] };
        const t0 = performance.now();
        await call(m, p, A.token, body);
        const dt = performance.now() - t0;
        slowest = Math.max(slowest, dt);
        assert.ok(dt < 1500, `${m} ${p} לקח ${Math.round(dt)}ms על קלט של ${s.slice(0, 6)}...`);
      }
    }
    assert.ok(slowest < 1500);
  });
});

describe("שלב 73: הזרקות בפרמטרי חיפוש", () => {
  it("מיון ופילטרים עם מחרוזות תוקפות נדחים או מטופלים בלי 5xx ובלי נזק למסד", async () => {
    const before = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    for (const q of [
      "sort=constructor", "sort=__proto__", "sort=" + encodeURIComponent("id; DROP TABLE users"), "q=" + encodeURIComponent("' OR 1=1 --"),
      "q=" + encodeURIComponent("\"*)(&"), "author=" + encodeURIComponent("%' ESCAPE '\\"), "page=-1", "pageSize=99999", "page=1e9", "ageGroup[]=x", "q=" + "א".repeat(5000),
    ]) {
      const r = await call("GET", `/api/activities?${q}`, null);
      assert.ok(r.status < 500, `${q.slice(0, 40)} החזיר ${r.status}`);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM users").get().c, before, "טבלת המשתמשים שלמה");
    const s = await call("GET", "/api/search?q=" + encodeURIComponent("\"'*()[]{}^~:-OR NEAR/2 AND NOT"), null);
    assert.ok(s.status < 500, "חיפוש עם תחביר FTS זדוני: " + s.status);
  });
});

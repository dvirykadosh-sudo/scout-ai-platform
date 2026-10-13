import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "node:fs";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { apportion, buildFallback, normalizeDraft } = await import("../src/ai.js");
const { docTitle } = await import("../src/docx.js");

let server, base, db;
const j = async (path, opts = {}) => {
  const r = await fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, body: ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
};

before(() => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  ensureAdmin(db);
  const mailer = createMailer(db, { host: "", adminEmail: "" });
  server = createApp({ db, mailer }).listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const validInput = (over = {}) => ({
  topic: "אחריות אישית",
  value: "אחריות",
  ageGroup: "כיתה ז' - מעורב",
  participants: 18,
  instructor: "נועה",
  role: "מדריכה",
  methods: [
    { name: "משחק תחרות", minutes: 10 },
    { name: "דיון בשאלה", minutes: 12 },
    { name: "הסבר", minutes: 5 },
  ],
  ...over,
});

describe("seed", () => {
  it("טוען חמש פעולות עם משכים נכונים וסכום שלבים תואם", async () => {
    const { body } = await j("/api/activities?pageSize=50&sort=title");
    assert.equal(body.total, 5);
    const durations = Object.fromEntries(body.items.map((a) => [a.title, a.durationMin]));
    assert.equal(durations["פעולת שיא - קדוש"], 50);
    assert.equal(durations["אלימות בקרב בני נוער"], 30);
    assert.equal(durations["בריונות"], 30);
    assert.equal(durations["תחבורה ציבורית בשבת"], 30);
    assert.equal(durations["פעולת נעורים: ממונהג למנהיג"], 60);
    for (const a of body.items) {
      assert.equal(a.stages.length, 5);
      assert.equal(a.stages.reduce((s, x) => s + x.minutes, 0), a.durationMin);
    }
  });
});

describe("חיפוש וסינון", () => {
  it("מחפש לפי טקסט, גיל ושיטה", async () => {
    assert.equal((await j("/api/activities?q=" + encodeURIComponent("מכרז"))).body.total, 1);
    assert.equal((await j("/api/activities?age=" + encodeURIComponent("כיתה ו' - מעורב"))).body.total, 1);
    assert.equal((await j("/api/activities?method=" + encodeURIComponent("משחק הדמייה"))).body.total, 2);
    assert.equal((await j("/api/activities?minDuration=50")).body.total, 2);
  });
  it("דוחה סינון לא תקין", async () => {
    assert.equal((await j("/api/activities?age=bad")).status, 400);
  });
});

describe("יצירת פעולה", () => {
  it("יוצר פעולה תקינה, סכום הדקות מדויק ומידות ד' וח' בסיכום", async () => {
    const r = await j("/api/activities/generate", { method: "POST", body: JSON.stringify(validInput({ activeScouting: true, energeticMode: true })) });
    assert.equal(r.status, 201);
    const a = r.body;
    assert.equal(a.durationMin, 27);
    assert.deepEqual(a.stages.map((s) => s.name), ["פתיחה", "ציר זמן/משחק", "זמן צופיות מעשי", "דיון", "סיכום"]);
    assert.equal(a.stages.reduce((s, x) => s + x.minutes, 0), 27);
    assert.ok(a.stages.every((s) => s.minutes >= 1));
    assert.match(a.stages[4].content, /מידה ד'/);
    assert.match(a.stages[4].content, /מידה ח'/);
    assert.match(a.stages[2].content, /קשרים/);
    assert.equal(a.source, "fallback");
  });
  it("מחזיר שגיאות בעברית ליד השדה", async () => {
    const r = await j("/api/activities/generate", { method: "POST", body: JSON.stringify(validInput({ methods: [], instructor: "" })) });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "VALIDATION");
    assert.ok(r.body.error.fields.methods);
    assert.ok(r.body.error.fields.instructor);
  });
  it("דוחה זמן כולל מחוץ לטווח ושיטה כפולה", async () => {
    const tooLong = validInput({ methods: [{ name: "הסבר", minutes: 120 }, { name: "עשייה", minutes: 100 }] });
    assert.equal((await j("/api/activities/generate", { method: "POST", body: JSON.stringify(tooLong) })).status, 400);
    const dup = validInput({ methods: [{ name: "הסבר", minutes: 5 }, { name: "הסבר", minutes: 5 }] });
    assert.equal((await j("/api/activities/generate", { method: "POST", body: JSON.stringify(dup) })).status, 400);
  });
  it("הוספה לתור המיילים", () => {
    assert.ok(db.prepare("SELECT COUNT(*) AS c FROM email_queue").get().c >= 1);
  });
});

describe("תיקון פלט AI", () => {
  it("מתקן סכום דקות שגוי ומוסיף מידות חסרות", () => {
    const input = validInput();
    const fb = buildFallback(input);
    const broken = {
      ...fb,
      conclusionNote: "בלי מידות",
      stages: fb.stages.map((s) => ({ ...s, minutes: 50, content: s.content.replace(/מידה [דח]'/g, "") })),
    };
    const fixed = normalizeDraft(broken, input);
    assert.equal(fixed.stages.reduce((s, x) => s + x.minutes, 0), 27);
    assert.match(fixed.stages[4].content, /מידה ד'/);
    assert.match(fixed.stages[4].content, /מידה ח'/);
  });
  it("apportion שומר סכום ומינימום 1", () => {
    for (const total of [5, 7, 30, 180]) {
      const r = apportion([10, 1, 1, 50, 0], total);
      assert.equal(r.reduce((a, b) => a + b, 0), total);
      assert.ok(r.every((x) => x >= 1));
    }
  });
});

describe("ייצוא Word", () => {
  it("יוצר קובץ docx תקין עם RTL וכותרת בפורמט המדויק", async () => {
    const r = await j("/api/activities/1/export/docx");
    assert.equal(r.status, 200);
    assert.equal(r.body.subarray(0, 2).toString(), "PK");
    const { default: JSZip } = await import("jszip").catch(() => ({ default: null }));
    if (JSZip) {
      const z = await JSZip.loadAsync(r.body);
      const xml = await z.file("word/document.xml").async("string");
      assert.ok(xml.includes("<w:bidi"));
      assert.ok(xml.includes("<w:rtl"));
      assert.ok(xml.includes("<w:bidiVisual"));
    }
  });
  it("כותרת: [מדריך] . [פעולה] + [שבט] ו-[גדוד]", () => {
    assert.equal(docTitle({ instructor: "נועה", title: "בריונות", tribe: "שבט מעוז", battalion: "גדוד א" }), "נועה . בריונות + שבט מעוז ו-גדוד א");
    assert.equal(docTitle({ instructor: "נועה", title: "בריונות", tribe: "שבט מעוז", battalion: "" }), "נועה . בריונות + שבט מעוז");
  });
  it("404 לפעולה שלא קיימת", async () => {
    assert.equal((await j("/api/activities/9999/export/docx")).status, 404);
  });
});

describe("הרשאות והתחברות", () => {
  let token;
  it("חוסם עריכה ומחיקה בלי התחברות", async () => {
    assert.equal((await j("/api/activities/1", { method: "PUT", body: "{}" })).status, 401);
    assert.equal((await j("/api/activities/1", { method: "DELETE" })).status, 401);
    assert.equal((await j("/api/admin/logs")).status, 401);
  });
  it("מתחבר כאדמין", async () => {
    const r = await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "admin123" }) });
    assert.equal(r.status, 200);
    token = r.body.token;
  });
  it("עורך פעולה ומוודא סכום זמנים", async () => {
    const auth = { authorization: `Bearer ${token}` };
    const ok = await j("/api/activities/3", { method: "PUT", headers: auth, body: JSON.stringify({ equipment: "ציוד חדש" }) });
    assert.equal(ok.body.equipment, "ציוד חדש");
    const a = (await j("/api/activities/3")).body;
    const stages = a.stages.map((s, i) => ({ ...s, minutes: i === 0 ? 10 : s.minutes }));
    const upd = await j("/api/activities/3", { method: "PUT", headers: auth, body: JSON.stringify({ stages }) });
    assert.equal(upd.body.durationMin, 35);
    const bad = await j("/api/activities/3", { method: "PUT", headers: auth, body: JSON.stringify({ stages: stages.slice(0, 4) }) });
    assert.equal(bad.status, 400);
  });
  it("מחיקה היא ארכוב, פעולה מובנית דורשת אישור, וניתן לשחזר", async () => {
    const auth = { authorization: `Bearer ${token}` };
    assert.equal((await j("/api/activities/2", { method: "DELETE", headers: auth })).status, 409);
    assert.equal((await j("/api/activities/2?confirm=yes", { method: "DELETE", headers: auth })).status, 200);
    assert.equal((await j("/api/activities/2")).status, 404);
    assert.equal((await j("/api/activities/2/restore", { method: "POST", headers: auth })).status, 200);
    assert.equal((await j("/api/activities/2")).status, 200);
  });
  it("נועל אחרי 5 ניסיונות כושלים", async () => {
    let last;
    for (let i = 0; i < 5; i++) last = await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "ghost", password: "x" }) });
    assert.equal(last.status, 401);
    const locked = await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "ghost", password: "x" }) });
    assert.equal(locked.status, 429);
  });
  it("שינוי סיסמה", async () => {
    const auth = { authorization: `Bearer ${token}` };
    const short = await j("/api/auth/change-password", { method: "POST", headers: auth, body: JSON.stringify({ currentPassword: "admin123", newPassword: "123" }) });
    assert.equal(short.status, 400);
    const ok = await j("/api/auth/change-password", { method: "POST", headers: auth, body: JSON.stringify({ currentPassword: "admin123", newPassword: "a-new-strong-pass" }) });
    assert.equal(ok.status, 200);
    assert.equal((await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "admin123" }) })).status, 401);
  });
});

describe("לוח אדמין ושכפול", () => {
  it("שכפול מותאם גיל ומשך", async () => {
    const r = await j("/api/activities/1/duplicate", { method: "POST", body: JSON.stringify({ ageGroup: "כיתה ה' - בנים", durationMin: 25 }) });
    assert.equal(r.status, 201);
    assert.equal(r.body.durationMin, 25);
    assert.equal(r.body.stages.reduce((s, x) => s + x.minutes, 0), 25);
    assert.equal(r.body.isSeed, false);
  });
  it("דף הבית זמין ושגיאות API ב-JSON", async () => {
    const home = await fetch(base + "/");
    assert.equal(home.status, 200);
    assert.equal((await j("/api/nope")).status, 404);
  });
});

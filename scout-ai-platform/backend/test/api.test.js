import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "node:fs";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-test-backups-" + process.pid;

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
  it("מסנן לפי רשימת מזהים (מועדפים)", async () => {
    const r = await j("/api/activities?ids=1,3");
    assert.equal(r.body.total, 2);
    assert.deepEqual(r.body.items.map((a) => a.id).sort(), [1, 3]);
    assert.equal((await j("/api/activities?ids=1;drop")).status, 400);
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

describe("דירוגים", () => {
  it("מוסיף דירוג ומחשב ממוצע", async () => {
    const a = await j("/api/activities/4/ratings", { method: "POST", body: JSON.stringify({ stars: 5, comment: "עבדה מצוין", author: "נועה", ageUsed: "כיתה ט' - מעורב" }) });
    assert.equal(a.status, 201);
    const b = await j("/api/activities/4/ratings", { method: "POST", body: JSON.stringify({ stars: 3 }) });
    assert.equal(b.body.count, 2);
    assert.equal(b.body.average, 4);
    const list = await j("/api/activities/4/ratings");
    assert.equal(list.body.items.length, 2);
    assert.equal(list.body.items[1].comment, "עבדה מצוין");
    assert.equal((await j("/api/activities/4")).body.rating.count, 2);
  });
  it("דוחה דירוג לא תקין ופעולה לא קיימת", async () => {
    assert.equal((await j("/api/activities/4/ratings", { method: "POST", body: JSON.stringify({ stars: 9 }) })).status, 400);
    assert.equal((await j("/api/activities/4/ratings", { method: "POST", body: JSON.stringify({ stars: 0 }) })).status, 400);
    assert.equal((await j("/api/activities/9999/ratings", { method: "POST", body: JSON.stringify({ stars: 4 }) })).status, 404);
  });
  it("מחיקת תגובה דורשת אדמין", async () => {
    assert.equal((await j("/api/ratings/1", { method: "DELETE" })).status, 401);
  });
});

describe("סגנון כתיבה", () => {
  const sample = "יאללה חבר'ה, תעמדו במעגל! אחלה, בואו נתחיל. תגידו לי מה אתם חושבים על זה? תספרו לי סיפור קצר, וואלה זה פשוט מטורף. תשבו ותחשבו ביחד, בכיף!";
  it("מנתח דוגמה ומציע העדפות", async () => {
    const r = await j("/api/style/analyze", { method: "POST", body: JSON.stringify({ sample }) });
    assert.equal(r.body.ok, true);
    assert.equal(r.body.suggested.address, "students");
    assert.ok(["youth", "humor"].includes(r.body.suggested.tone));
    assert.ok(r.body.traits.length >= 2);
    assert.equal((await j("/api/style/analyze", { method: "POST", body: JSON.stringify({ sample: "קצר" }) })).body.ok, false);
  });
  it("קורא קובץ טקסט וקובץ Word", async () => {
    const up = (name, buf) => fetch(`${base}/api/style/extract?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: buf });
    const t = await (await up("a.txt", Buffer.from(sample, "utf8"))).json();
    assert.ok(t.text.includes("יאללה"));
    const { Document, Packer, Paragraph } = await import("docx");
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(sample)] }] }));
    const d = await (await up("פעולה.docx", docx)).json();
    assert.ok(d.text.includes("אחלה"));
    assert.equal((await up("a.exe", Buffer.from("x"))).status, 415);
  });
  it("הטון וההעדפות משפיעים על הפעולה שנוצרת", async () => {
    const mk = async (style) => (await j("/api/activities/generate", { method: "POST", body: JSON.stringify(validInput({ style })) })).body;
    const a = await mk({ tone: "humor", address: "script", slang: "heavy" });
    const b = await mk({ tone: "serious", address: "guide", length: "long" });
    assert.match(a.stages[0].content, /יאללה/);
    assert.match(a.stages[0].content, /אני אעמיד/);
    assert.doesNotMatch(b.stages[0].content, /יאללה/);
    assert.match(b.stages[3].content, /טיפ למדריך/);
    assert.equal(a.stages.reduce((s, x) => s + x.minutes, 0), 27);
  });
  it("דוחה ערכי סגנון לא חוקיים", async () => {
    assert.equal((await j("/api/activities/generate", { method: "POST", body: JSON.stringify(validInput({ style: { tone: "evil" } })) })).status, 400);
  });
  it("בונה הנחיה ל-AI חיצוני עם הדוגמה, ומייבא את התשובה חזרה", async () => {
    const input = validInput({ style: { tone: "warm", sample } });
    const p = await j("/api/activities/prompt", { method: "POST", body: JSON.stringify(input) });
    assert.ok(p.body.prompt.includes("אחלה"));
    assert.ok(p.body.prompt.includes("### פתיחה"));
    assert.ok(p.body.prompt.includes("מידה ד'"));
    const reply = `### פתיחה (4 דקות)\nתעמדו במעגל ותגידו מילה אחת.\n\n### ציר זמן/משחק (8 דקות)\nמשחק תחנות.\n\n**### זמן צופיות מעשי (3 דקות)**\nקשר שמונה.\n\n### דיון (8 דקות)\nשלוש שאלות.\n\n### סיכום (4 דקות)\nחוזרים לערך.\n\nציוד: חבלים\nבטיחות: לשמור על מרחב`;
    const r = await j("/api/activities/import", { method: "POST", body: JSON.stringify({ input, text: reply }) });
    assert.equal(r.status, 201);
    assert.equal(r.body.source, "external");
    assert.equal(r.body.stages.length, 5);
    assert.equal(r.body.stages.reduce((s, x) => s + x.minutes, 0), 27);
    assert.equal(r.body.equipment, "חבלים");
    assert.match(r.body.stages[4].content, /מידה ד/);
    assert.match(r.body.stages[0].content, /מילה אחת/);
    const bad = await j("/api/activities/import", { method: "POST", body: JSON.stringify({ input, text: "סתם טקסט ארוך בלי שום כותרות של שלבים בכלל, כלום, שום דבר" }) });
    assert.equal(bad.status, 422);
  });
});

describe("חשבונות מדריכים", () => {
  const auth = (t) => ({ authorization: `Bearer ${t}` });
  const post = (path, body, token) => j(path, { method: "POST", body: JSON.stringify(body), headers: token ? auth(token) : {} });
  const reg = (u, name = "מדריך " + u) => post("/api/auth/register", { username: u, password: "password123", displayName: name, signupCode: "shevet-code" });
  let noa, dan, admin;

  it("הרשמה דורשת קוד, מונעת כפילות וחוזרת עם טוקן", async () => {
    assert.equal((await post("/api/auth/register", { username: "noa", password: "password123", displayName: "נועה", signupCode: "bad" })).status, 403);
    const r = await reg("noa", "נועה");
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, "INSTRUCTOR");
    noa = r.body;
    assert.equal((await reg("NOA")).status, 409);
    dan = (await reg("dan", "דן")).body;
    admin = (await post("/api/auth/login", { username: "admin", password: "a-new-strong-pass" })).body;
    assert.equal(admin.user.role, "ADMIN");
    assert.equal((await j("/api/meta")).body.signupNeedsCode, true);
  });
  it("התחברות לא תלויית רישיות, ולוח הבקרה סגור למדריכים", async () => {
    assert.equal((await post("/api/auth/login", { username: "Noa", password: "password123" })).status, 200);
    assert.equal((await j("/api/admin/stats", { headers: auth(noa.token) })).status, 401);
    assert.equal((await j("/api/admin/users", { headers: auth(noa.token) })).status, 401);
  });
  it("פעולה שנוצרת על ידי מדריך שייכת לו, ורק הוא ואדמין עורכים אותה", async () => {
    const g = await post("/api/activities/generate", validInput(), noa.token);
    assert.equal(g.body.ownerId, noa.user.id);
    const id = g.body.id;
    const mine = await j("/api/me/activities", { headers: auth(noa.token) });
    assert.ok(mine.body.some((a) => a.id === id));
    assert.equal((await j("/api/me/activities", { headers: auth(dan.token) })).body.some((a) => a.id === id), false);
    const put = (t, title) => j(`/api/activities/${id}`, { method: "PUT", body: JSON.stringify({ title }), headers: auth(t) });
    assert.equal((await put(dan.token, "פריצה")).status, 403);
    assert.equal((await put(noa.token, "השם שלי")).status, 200);
    assert.equal((await put(admin.token, "שם מאדמין")).status, 200);
    assert.equal((await j(`/api/activities/${id}`, { method: "PUT", body: JSON.stringify({ title: "אנונימי" }) })).status, 401);
    // delete + restore by owner, not by others
    assert.equal((await j(`/api/activities/${id}`, { method: "DELETE", headers: auth(dan.token) })).status, 403);
    assert.equal((await j(`/api/activities/${id}`, { method: "DELETE", headers: auth(noa.token) })).status, 200);
    assert.equal((await post(`/api/activities/${id}/restore`, {}, noa.token)).status, 200);
  });
  it("מדריך לא עורך פעולה מובנית ולא פעולה אנונימית", async () => {
    assert.equal((await j("/api/activities/1", { method: "PUT", body: JSON.stringify({ title: "חטיפה" }), headers: auth(noa.token) })).status, 403);
    const anon = await post("/api/activities/generate", validInput());
    assert.equal(anon.body.ownerId, null);
    assert.equal((await j(`/api/activities/${anon.body.id}`, { method: "PUT", body: JSON.stringify({ title: "x1" }), headers: auth(noa.token) })).status, 403);
  });
  it("עריכת שלבים מחשבת מחדש את משך הפעולה", async () => {
    const g = (await post("/api/activities/generate", validInput(), dan.token)).body;
    const stages = g.stages.map((s, i) => ({ ...s, minutes: i === 0 ? s.minutes + 3 : s.minutes }));
    const r = await j(`/api/activities/${g.id}`, { method: "PUT", body: JSON.stringify({ stages }), headers: auth(dan.token) });
    assert.equal(r.body.durationMin, g.durationMin + 3);
  });
  it("סגנון שמור בחשבון", async () => {
    assert.equal((await j("/api/me/style", { headers: auth(noa.token) })).body.style, null);
    const put = await j("/api/me/style", { method: "PUT", body: JSON.stringify({ style: { tone: "humor", sample: "דוגמה" } }), headers: auth(noa.token) });
    assert.equal(put.body.style.tone, "humor");
    assert.equal((await j("/api/me/style", { headers: auth(noa.token) })).body.style.sample, "דוגמה");
    assert.equal((await j("/api/me/style", { headers: auth(dan.token) })).body.style, null);
  });
  it("אדמין מנהל משתמשים: השבתה ואיפוס סיסמה", async () => {
    const list = await j("/api/admin/users", { headers: auth(admin.token) });
    assert.ok(list.body.find((u) => u.username === "noa").activities >= 1);
    const off = await j(`/api/admin/users/${dan.user.id}`, { method: "PATCH", body: JSON.stringify({ disabled: true }), headers: auth(admin.token) });
    assert.equal(off.status, 200);
    assert.equal((await post("/api/auth/login", { username: "dan", password: "password123" })).status, 401);
    const reset = await j(`/api/admin/users/${noa.user.id}`, { method: "PATCH", body: JSON.stringify({ resetPassword: true }), headers: auth(admin.token) });
    assert.ok(reset.body.tempPassword.length >= 8);
    const login = await post("/api/auth/login", { username: "noa", password: reset.body.tempPassword });
    assert.equal(login.body.user.mustChangePw, true);
    assert.equal((await j(`/api/admin/users/${admin.user.id}`, { method: "PATCH", body: JSON.stringify({ disabled: true }), headers: auth(admin.token) })).status, 400);
  });
  it("גיבוי: יצירה, רשימה והורדה (אדמין בלבד)", async () => {
    assert.equal((await j("/api/admin/backups")).status, 401);
    const b = await j("/api/admin/backups", { method: "POST", headers: auth(admin.token) });
    assert.equal(b.status, 201);
    const list = await j("/api/admin/backups", { headers: auth(admin.token) });
    assert.ok(list.body.items.some((x) => x.name === b.body.name));
    const dl = await fetch(`${base}/api/admin/backups/${b.body.name}`, { headers: auth(admin.token) });
    assert.equal(dl.status, 200);
    const buf = Buffer.from(await dl.arrayBuffer());
    assert.equal(buf.subarray(0, 15).toString(), "SQLite format 3");
    assert.equal((await j("/api/admin/backups/..%2Fsecret.db", { headers: auth(admin.token) })).status, 404);
  });
});

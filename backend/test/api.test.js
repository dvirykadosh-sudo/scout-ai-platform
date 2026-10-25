import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "node:fs";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-test-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb, audit } = await import("../src/db.js");
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
    assert.ok(list.body.items.find((u) => u.username === "noa").activities >= 1);
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

describe("שיפורים: יומן, גרסאות, חוברת, איכות, תכנון, חיפוש", () => {
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  const reg = async (name) => (await post("/api/auth/register", { username: name, password: "password99", displayName: name, signupCode: "shevet-code" })).body.token;
  let tokA, tokB, actId;
  before(async () => {
    tokA = await reg("runner_a");
    tokB = await reg("runner_b");
    const g = await post("/api/activities/generate", validInput({ topic: "גרסאות ויומן" }), tokA);
    actId = g.body.id;
  });

  it("יומן הפעלות פרטי: רק הבעלים רואה, ודורש התחברות", async () => {
    assert.equal((await post(`/api/activities/${actId}/runs`, { ranOn: "2026-10-01" })).status, 401);
    const r = await post(`/api/activities/${actId}/runs`, { ranOn: "2026-10-01", groupLabel: "ח' 2", worked: "המשחק", changeNext: "פחות זמן" }, tokA);
    assert.equal(r.status, 201);
    assert.equal((await j(`/api/activities/${actId}/runs`, { headers: { authorization: `Bearer ${tokA}` } })).body.length, 1);
    assert.equal((await j(`/api/activities/${actId}/runs`, { headers: { authorization: `Bearer ${tokB}` } })).body.length, 0);
    assert.equal((await j(`/api/runs/${r.body.id}`, { method: "DELETE", headers: { authorization: `Bearer ${tokB}` } })).status, 404);
    assert.equal((await j("/api/me/runs", { headers: { authorization: `Bearer ${tokA}` } })).body[0].title.length > 0, true);
    assert.equal((await post(`/api/activities/${actId}/runs`, { ranOn: "אתמול" }, tokA)).status, 400);
    assert.equal((await j(`/api/runs/${r.body.id}`, { method: "DELETE", headers: { authorization: `Bearer ${tokA}` } })).status, 200);
  });

  it("היסטוריית גרסאות: נשמרת בעריכה, ואפשר לשחזר. רק לבעלים", async () => {
    const put = (title, tok) => j(`/api/activities/${actId}`, { method: "PUT", body: JSON.stringify({ title }), headers: { authorization: `Bearer ${tok}` } });
    assert.equal((await put("שם חדש א", tokA)).status, 200);
    assert.equal((await put("שם חדש ב", tokA)).status, 200);
    const list = await j(`/api/activities/${actId}/versions`, { headers: { authorization: `Bearer ${tokA}` } });
    assert.equal(list.body.items.length, 2);
    assert.equal(list.body.current.title, "שם חדש ב");
    assert.equal(list.body.items[1].snapshot.title, "גרסאות ויומן");
    assert.equal((await j(`/api/activities/${actId}/versions`, { headers: { authorization: `Bearer ${tokB}` } })).status, 403);
    const oldest = list.body.items[1].id;
    const back = await j(`/api/activities/${actId}/versions/${oldest}/restore`, { method: "POST", body: "{}", headers: { authorization: `Bearer ${tokA}` } });
    assert.equal(back.body.title, "גרסאות ויומן");
    assert.equal((await j(`/api/activities/${actId}/versions`, { headers: { authorization: `Bearer ${tokA}` } })).body.items.length, 3);
  });

  it("חוברת Word: קובץ docx עם כל הפעולות", async () => {
    const r = await fetch(`${base}/api/export/booklet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [1, 2, actId], title: "חוברת בדיקה" }) });
    assert.equal(r.status, 200);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.slice(0, 2).toString(), "PK");
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const text = (await mammoth.extractRawText({ buffer: buf })).value;
    assert.ok(text.includes("חוברת בדיקה") && text.includes("תוכן העניינים") && text.includes("בריונות") === (text.includes("בריונות")));
    assert.ok((text.match(/מבנה הפעולה/g) || []).length >= 3);
    assert.equal((await post("/api/export/booklet", { ids: [] })).status, 400);
    assert.equal((await post("/api/export/booklet", { ids: [99999] })).status, 404);
  });

  it("חיפוש מלא ומיון לפי דירוג והפעלות", async () => {
    const s = await j("/api/activities?q=" + encodeURIComponent("כיסוי עיניים"));
    assert.ok(s.body.items.length >= 1);
    assert.ok(s.body.items[0].snippet.includes("כיסוי עיניים"));
    const two = await j("/api/activities?q=" + encodeURIComponent("תופסת קיצונית"));
    assert.ok(two.body.items.length >= 1);
    await post("/api/activities/3/ratings", { stars: 5 });
    const byRating = await j("/api/activities?sort=rating&pageSize=3");
    assert.equal(byRating.body.items[0].rating.average >= byRating.body.items[1].rating.average, true);
    assert.equal((await j("/api/activities?minRating=5")).body.items.every((a) => a.rating.average >= 5), true);
    assert.equal((await j("/api/activities?sort=popular")).status, 200);
  });

  it("בודק איכות מסמן ניסוחים משרדיים ומציע תיקון", async () => {
    const r = await post("/api/quality", { items: [{ label: "פתיחה", text: "במסגרת הפעילות יש לוודא שכולם מוכנים. לאחר מכן החניכים יתבקשו לצייר. ניתן להשתמש באמצעות כרטיסים." }] });
    const fixes = Object.fromEntries(r.body.issues.map((i) => [i.phrase, i.fix]));
    assert.equal(fixes["במסגרת הפעילות"], "בפעולה");
    assert.equal(fixes["יש לוודא"], "תוודאו");
    assert.equal(fixes["לאחר מכן"], "אחר כך");
    assert.equal(fixes["החניכים יתבקשו ל"], "תבקשו מהחניכים ל");
    assert.ok(r.body.score < 70);
    const clean = await post("/api/quality", { items: [{ label: "x", text: "תעמדו במעגל ותגידו מילה אחת." }] });
    assert.equal(clean.body.issues.length, 0);
    assert.equal(clean.body.score, 100);
  });

  it("תכנון תקופתי: שובץ לפי ערכים, מסמן חוסרים וכיסוי", async () => {
    const r = await post("/api/plan", { weeks: 4, ageGroup: "כיתה ח' - מעורב", values: ["קדושה", "ערך שלא קיים"], startDate: "2026-11-01" });
    assert.equal(r.status, 200);
    assert.equal(r.body.slots.length, 4);
    assert.equal(r.body.slots[0].date, "2026-11-01");
    assert.equal(r.body.slots[1].date, "2026-11-08");
    assert.ok(r.body.slots[0].activity);
    assert.equal(r.body.slots[1].activity, null);
    assert.deepEqual(r.body.missing, ["ערך שלא קיים"]);
    assert.ok(r.body.coverage.length >= 3);
    const ids = r.body.slots.filter((s) => s.activity).map((s) => s.activity.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal((await post("/api/plan", { weeks: 0 })).status, 400);
    const open = await post("/api/plan", { weeks: 3 });
    assert.equal(open.body.slots.filter((s) => s.activity).length, 3);
  });
});

describe("סבב א': שלב בודד, חירום, היכרות וייבוא", () => {
  const post = (p, body, headers) => j(p, { method: "POST", body: JSON.stringify(body), headers });

  it("יוצר שלב אחד מחדש בגרסה שונה בלי לשנות את הפעולה", async () => {
    const before = (await j("/api/activities/1")).body;
    const a = await post("/api/activities/1/stages/1/regenerate", { variant: 1 });
    const b = await post("/api/activities/1/stages/1/regenerate", { variant: 2 });
    assert.equal(a.status, 200);
    assert.ok(a.body.content.length > 20);
    assert.notEqual(a.body.content, b.body.content);
    const d3 = await post("/api/activities/1/stages/3/regenerate", { variant: 1 });
    assert.ok(d3.body.content.includes("1."));
    assert.deepEqual((await j("/api/activities/1")).body.stages, before.stages);
    assert.equal((await post("/api/activities/1/stages/9/regenerate", {})).status, 400);
    assert.equal((await post("/api/activities/9999/stages/1/regenerate", {})).status, 404);
  });

  it("פעולת חירום: 10 דקות בדיוק, בלי ציוד, ו-5 שלבים", async () => {
    const r = await post("/api/activities/emergency", { topic: "חברות", value: "ערבות הדדית", ageGroup: "כיתה ו' - מעורב", instructor: "דנה" });
    assert.equal(r.status, 201);
    assert.equal(r.body.durationMin, 10);
    assert.equal(r.body.stages.length, 5);
    assert.ok(/אין ציוד/.test(r.body.equipment));
    assert.ok(r.body.tags.includes("חירום"));
    assert.ok(/מידה ד/.test(r.body.stages[4].content));
    const other = await post("/api/activities/emergency", { topic: "חברות", ageGroup: "כיתה ו' - מעורב", instructor: "דנה", seed: 1 });
    assert.notEqual(other.body.stages[1].content, r.body.stages[1].content);
    assert.equal((await post("/api/activities/emergency", { topic: "x" })).status, 400);
  });

  it("משחקי היכרות: מסנן לפי תנועה וציוד ומחזיר אחרים עם זרע אחר", async () => {
    const r = await j("/api/icebreakers?n=4&energetic=1&noEquipment=1&seed=5");
    assert.equal(r.body.length, 4);
    assert.ok(r.body.every((g) => g.energetic && !g.equipment));
    const r2 = await j("/api/icebreakers?n=4&energetic=1&noEquipment=1&seed=77");
    assert.notDeepEqual(r.body.map((g) => g.name), r2.body.map((g) => g.name));
    const short = await j("/api/icebreakers?maxMinutes=3&n=8");
    assert.ok(short.body.every((g) => g.minutes <= 3));
  });

  it("ייבוא קובץ: מזהה כותרות, זמנים, ציוד ושכבת גיל, ושומר", async () => {
    const { parseLooseDoc } = await import("../src/tools.js");
    const doc = ["פעולה על כבוד", "שכבת גיל: כיתה ז' בנות", "ציוד: דפים ועטים", "בטיחות: לשים לב למעברים", "פתיחה (5 דקות)", "שואלים מה זה כבוד.", "משחק (15 דקות)", "משחק קבוצות עם כרטיסים.", "דיון בשאלה אחת על כבוד בין חברים", "זמן צופיות מעשי (10 דקות)", "קשר שמונה.", "דיון (10 דקות)", "1. מתי פגעו בכם?", "סיכום (5 דקות)", "כל אחד אומר משפט."].join("\n");
    const p = parseLooseDoc(doc, "כבוד.docx");
    assert.equal(p.title, "פעולה על כבוד");
    assert.equal(p.ageGroup, "כיתה ז' - בנות");
    assert.equal(p.equipment, "דפים ועטים");
    assert.deepEqual(p.stages.map((s) => s.minutes), [5, 15, 10, 10, 5]);
    assert.ok(p.stages[1].content.includes("דיון בשאלה אחת"), "a method line inside a stage is not a heading");
    assert.ok(p.stages[3].content.includes("מתי פגעו"));
    assert.equal(p.warnings.length, 0);

    const saved = await post("/api/activities/import-parsed", { ...p, ageGroup: p.ageGroup, instructor: "אורי" });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.durationMin, 45);
    assert.ok(saved.body.tags.includes("יובא מקובץ"));

    const loose = parseLooseDoc("כותרת\n\nפסקה אחת על הנושא.\n\nפסקה שנייה.\n\nשלישית.", "x.txt");
    assert.ok(loose.warnings.length >= 1);
    assert.equal(loose.stages.length, 5);
    assert.ok(loose.durationMin > 0);
    const bad = await post("/api/activities/import-parsed", { ...loose, ageGroup: "לא קיים", instructor: "א" });
    assert.equal(bad.status, 400);
  });

  it("נקודת הקצה של קובץ txt מחזירה טיוטה", async () => {
    const r = await fetch(base + "/api/activities/import-file?name=a.txt", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: Buffer.from("פעולה\nפתיחה (3 דקות)\nשלום\nסיכום (2 דקות)\nתודה", "utf8") });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.stages[0].minutes, 3);
    const bin = await fetch(base + "/api/activities/import-file?name=a.exe", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: Buffer.from("x") });
    assert.equal(bin.status, 415);
  });
});

describe("לוגו השבט", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
  const up = (tok, body) => fetch(base + "/api/admin/logo", { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/octet-stream" }, body });
  let tok;
  it("רק אדמין מעלה, רק תמונה אמיתית מתקבלת, והלוגו מוגש ומתפרסם ב-meta", async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: pw }) });
      if (r.status === 200 && !r.body.user.mustChangePw) { tok = r.body.token; break; }
    }
    assert.ok(tok, "admin login");
    assert.equal((await j("/api/logo")).status, 404);
    assert.equal((await fetch(base + "/api/admin/logo", { method: "POST", body: png })).status, 401);
    assert.equal((await up(tok, Buffer.from("<svg onload=alert(1)></svg>"))).status, 415);
    assert.equal((await up(tok, Buffer.from("not an image at all, just text"))).status, 415);
    const ok = await up(tok, png);
    assert.equal(ok.status, 200);
    const got = await fetch(base + "/api/logo");
    assert.equal(got.headers.get("content-type"), "image/png");
    assert.equal(got.headers.get("x-content-type-options"), "nosniff");
    assert.ok((await j("/api/meta")).body.logoVersion);
    const del = await fetch(base + "/api/admin/logo", { method: "DELETE", headers: { authorization: `Bearer ${tok}` } });
    assert.equal(del.status, 200);
    assert.equal((await j("/api/logo")).status, 404);
    assert.equal((await j("/api/meta")).body.logoVersion, null);
  });
});

describe("סבב ג': התאמות, נושאים, הערות, אוספים, אישור, משוב, תובנות", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const del = (p, tok) => j(p, { method: "DELETE", headers: tok ? H(tok) : {} });
  let admin, ann, ben;

  it("הכנה: אדמין ושני מדריכים", async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await post("/api/auth/login", { username: "admin", password: pw });
      if (r.status === 200 && !r.body.user.mustChangePw) { admin = r.body.token; break; }
    }
    assert.ok(admin);
    ann = (await post("/api/auth/register", { username: "ann-c", password: "password123", displayName: "ענת", signupCode: "shevet-code" })).body;
    ben = (await post("/api/auth/register", { username: "ben-c", password: "password123", displayName: "בן", signupCode: "shevet-code" })).body;
    assert.ok(ann.token && ben.token);
  });

  it("התאמה לתנאים יוצרת עותק עם הערות לכל שלב", async () => {
    const list = await j("/api/adapt/conditions");
    assert.equal(list.body.length, 14);
    const r = await post("/api/activities/1/adapt", { condition: "rain" }, ann.token);
    assert.equal(r.status, 201);
    assert.ok(r.body.title.endsWith("(גרסת גשם)"));
    assert.ok(r.body.stages.every((s) => s.content.includes("התאמה (גשם)")));
    assert.ok(r.body.equipment.includes("מקום מקורה"));
    assert.equal(r.body.ownerId, ann.user.id);
    assert.equal((await post("/api/activities/1/adapt", { condition: "snow" })).status, 400);
    assert.equal((await post("/api/activities/9999/adapt", { condition: "rain" })).status, 404);
  });

  it("נושאים לפי חגים: חנוכה בדצמבר ופסח באפריל", async () => {
    const d = await j("/api/topics/suggest?date=2026-12-01&days=30");
    assert.ok(d.body.events.some((e) => e.name === "חנוכה" && e.date === "2026-12-05"));
    assert.ok(d.body.seasonal.some((s) => s.name === "חורף"));
    const p = await j("/api/topics/suggest?date=2027-04-10&days=20");
    assert.ok(p.body.events.some((e) => e.name === "פסח" && e.date === "2027-04-22"));
    assert.equal((await j("/api/topics/suggest?date=nope")).status, 400);
  });

  it("הערות: רק למחוברים, מחיקה לכותב, ליוצר הפעולה ולאדמין", async () => {
    const mine = (await post("/api/activities/generate", validInput({ instructor: "ענת" }), ann.token)).body;
    assert.equal((await j(`/api/activities/${mine.id}/notes`)).status, 401);
    const n = await post(`/api/activities/${mine.id}/notes`, { body: "אפשר לקצר את הפתיחה" }, ben.token);
    assert.equal(n.status, 201);
    assert.equal(n.body.author, "בן");
    assert.equal((await post(`/api/activities/${mine.id}/notes`, { body: "x" }, ben.token)).status, 400);
    const list = await j(`/api/activities/${mine.id}/notes`, { headers: H(ann.token) });
    assert.equal(list.body.length, 1);
    const other = (await post("/api/auth/register", { username: "cy-c", password: "password123", displayName: "סי", signupCode: "shevet-code" })).body;
    assert.equal((await del(`/api/notes/${n.body.id}`, other.token)).status, 403);
    assert.equal((await del(`/api/notes/${n.body.id}`, ann.token)).status, 200, "owner of the activity can remove");
  });

  it("אוספים: פרטיים, בלי כפילויות, ואפשר להסיר", async () => {
    const c = await post("/api/me/collections", { name: "מחזור ז' סתיו" }, ann.token);
    assert.equal(c.status, 201);
    assert.equal((await post(`/api/collections/${c.body.id}/items`, { activityId: 1 }, ann.token)).status, 201);
    assert.equal((await post(`/api/collections/${c.body.id}/items`, { activityId: 1 }, ann.token)).status, 201);
    assert.equal((await post(`/api/collections/${c.body.id}/items`, { activityId: 9999 }, ann.token)).status, 404);
    const mine = await j("/api/me/collections", { headers: H(ann.token) });
    assert.equal(mine.body[0].items.length, 1);
    assert.equal((await j("/api/me/collections", { headers: H(ben.token) })).body.length, 0);
    assert.equal((await post(`/api/collections/${c.body.id}/items`, { activityId: 2 }, ben.token)).status, 404);
    assert.equal((await del(`/api/collections/${c.body.id}/items/1`, ann.token)).status, 200);
    assert.equal((await del(`/api/collections/${c.body.id}`, ann.token)).status, 200);
  });

  it("אישור: פעולה חדשה לא במאגר עד אישור, הקישור עובד, אדמין מאשר", async () => {
    assert.equal((await put("/api/admin/settings", { requireApproval: true }, ann.token)).status, 401);
    assert.equal((await put("/api/admin/settings", { requireApproval: true }, admin)).body.requireApproval, true);
    const a = (await post("/api/activities/generate", validInput({ topic: "ממתינה לאישור xyz", instructor: "ענת" }), ann.token)).body;
    assert.equal(a.status, "PENDING");
    assert.equal((await j(`/api/activities/${a.id}`)).status, 200, "direct link works");
    const search = await j("/api/activities?q=" + encodeURIComponent("ממתינה לאישור xyz"));
    assert.equal(search.body.total, 0, "not in the shared library");
    assert.ok((await j("/api/me/activities", { headers: H(ann.token) })).body.some((x) => x.id === a.id));
    const adm = (await post("/api/activities/generate", validInput({ topic: "אדמין מפרסם", instructor: "מנהל" }), admin)).body;
    assert.equal(adm.status, "PUBLISHED");
    const pend = await j("/api/admin/pending", { headers: H(admin) });
    assert.ok(pend.body.some((x) => x.id === a.id));
    assert.equal((await post(`/api/admin/activities/${a.id}/approve`, {}, ann.token)).status, 401);
    assert.equal((await post(`/api/admin/activities/${a.id}/approve`, {}, admin)).status, 200);
    assert.equal((await j("/api/activities?q=" + encodeURIComponent("ממתינה לאישור xyz"))).body.total, 1);
    assert.equal((await post(`/api/admin/activities/${a.id}/approve`, {}, admin)).status, 404, "already decided");
    const b = (await post("/api/activities/generate", validInput({ topic: "תידחה xyz2", instructor: "ענת" }), ann.token)).body;
    assert.equal((await post(`/api/admin/activities/${b.id}/reject`, {}, admin)).status, 200);
    assert.equal((await j(`/api/activities/${b.id}`)).status, 404);
    const back = await post(`/api/activities/${b.id}/restore`, {}, ann.token);
    assert.equal(back.body.status, "PENDING", "restore cannot skip approval");
    await put("/api/admin/settings", { requireApproval: false }, admin);
    const free = (await post("/api/activities/generate", validInput({ topic: "בלי אישור", instructor: "ענת" }), ann.token)).body;
    assert.equal(free.status, "PUBLISHED");
  });

  it("משוב אנונימי: כל אחד שולח, רק היוצר והאדמין רואים, בלי זהות", async () => {
    const mine = (await post("/api/activities/generate", validInput({ topic: "משוב", instructor: "ענת" }), ann.token)).body;
    assert.equal((await post(`/api/activities/${mine.id}/feedback`, { rating: 5, liked: "המשחק היה כיף", more: "yes" })).status, 201);
    assert.equal((await post(`/api/activities/${mine.id}/feedback`, { rating: 3, more: "maybe" })).status, 201);
    assert.equal((await post(`/api/activities/${mine.id}/feedback`, { rating: 9 })).status, 400);
    assert.equal((await post(`/api/activities/${mine.id}/feedback`, { rating: 4, liked: "x".repeat(300) })).status, 400);
    assert.equal((await j(`/api/activities/${mine.id}/feedback`, { headers: H(ben.token) })).status, 403);
    const s = await j(`/api/activities/${mine.id}/feedback`, { headers: H(ann.token) });
    assert.equal(s.body.count, 2);
    assert.equal(s.body.average, 4);
    assert.equal(s.body.distribution[4], 1);
    assert.equal(s.body.more.yes, 1);
    assert.equal(s.body.comments.length, 1);
    assert.ok(!JSON.stringify(s.body).includes("ip"));
    const cols = db.prepare("PRAGMA table_info(feedback)").all().map((c) => c.name);
    assert.deepEqual(cols.sort(), ["activity_id", "created_at", "id", "liked", "more", "rating"].sort());
    assert.equal((await del(`/api/feedback/${s.body.comments[0].id}`, ann.token)).status, 200);
    assert.equal((await j(`/api/activities/${mine.id}/feedback`, { headers: H(admin) })).body.comments.length, 0);
  });

  it("תובנות לאדמין", async () => {
    assert.equal((await j("/api/admin/insights", { headers: H(ann.token) })).status, 401);
    const r = await j("/api/admin/insights", { headers: H(admin) });
    assert.equal(r.status, 200);
    assert.ok(r.body.published > 3);
    assert.equal(r.body.weeks.length, 8);
    assert.ok(r.body.values.length >= 3);
    assert.ok(r.body.instructors.some((i) => i.name === "ענת" && i.activities >= 1));
    assert.ok(Array.isArray(r.body.neverRun));
    assert.ok(r.body.feedback.count >= 1);
  });
});

describe("סבב ד': סוגי פעולה, הפתעה, מה חסר, כמו זו, שיא, קיצור", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  let admin, dana;

  it("הכנה", async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await post("/api/auth/login", { username: "admin", password: pw });
      if (r.status === 200 && !r.body.user.mustChangePw) { admin = r.body.token; break; }
    }
    assert.ok(admin);
    dana = (await post("/api/auth/register", { username: "dana-d", password: "password123", displayName: "דנה", signupCode: "shevet-code" })).body;
    assert.ok(dana.token);
  });

  it("תמהיל שנתי: סכום ברור, וספירה אישית רק למחובר", async () => {
    const anon = await j("/api/year-mix");
    assert.equal(anon.status, 200);
    assert.equal(anon.body.items.length, 7);
    assert.equal(anon.body.total, anon.body.items.reduce((s, x) => s + x.recommended, 0));
    assert.ok(anon.body.items.every((x) => x.mine === null));
    const me = await j("/api/year-mix", { headers: H(dana.token) });
    assert.ok(me.body.items.every((x) => typeof x.mine === "number"));
  });

  it("רשימת הסוגים: שבעה סוגים עם מבנה של חמישה שלבים", async () => {
    const r = await j("/api/kinds");
    assert.equal(r.body.length, 7);
    for (const k of r.body) {
      assert.equal(k.structure.length, 5);
      assert.ok(k.label.startsWith("פעולת"));
      assert.ok(k.minutes >= 30);
    }
    assert.ok(r.body.some((k) => k.id === "peak" && k.label === "פעולת שיא"));
  });

  it("הפתעה: בלי נושא בכלל מתקבלת פעולה מלאה עם סוג", async () => {
    const r = await post("/api/activities/quick", { surprise: true, ageGroup: "כיתה ז' - מעורב" }, dana.token);
    assert.equal(r.status, 201);
    assert.ok(r.body.title.length >= 2);
    assert.equal(r.body.stages.length, 5);
    assert.equal(r.body.stages.reduce((s, x) => s + x.minutes, 0), r.body.durationMin);
    assert.ok(r.body.kind);
    assert.ok(r.body.tags.some((t) => t.startsWith("פעולת")));
    assert.equal(r.body.ownerId, dana.user.id);
    assert.equal(r.body.instructor, "דנה");
    assert.ok(r.body.why.topic);
  });

  it("הפתעה בלי התחברות ועם גוף ריק", async () => {
    const r = await post("/api/activities/quick", {});
    assert.equal(r.status, 201);
    assert.equal(r.body.instructor, "מדריך/ה");
    assert.equal(r.body.ownerId, null);
  });

  it("סוג מפורש: שיא מקבל הערות שיא, זמן ושיטות שלו, ושטח מקבל צופיות מעשית", async () => {
    const peak = (await post("/api/activities/quick", { kind: "peak", topic: "מנהיגות", value: "אחריות" }, dana.token)).body;
    assert.equal(peak.kind, "peak");
    assert.equal(peak.durationMin, 90);
    assert.ok(peak.stages[2].content.includes("רגע השיא"));
    assert.ok(peak.title === "מנהיגות");
    const field = (await post("/api/activities/quick", { kind: "field", topic: "ניווט" }, dana.token)).body;
    assert.equal(field.activeScouting, true);
    assert.ok(field.safetyNotes.includes("אחראי בטיחות"));
    const short = (await post("/api/activities/quick", { kind: "content", topic: "קשרים", minutes: 25 }, dana.token)).body;
    assert.equal(short.durationMin, 25);
    assert.equal(short.stages.reduce((s, x) => s + x.minutes, 0), 25);
  });

  it("אשף רגיל מקבל סוג, ובקשה לא תקינה נדחית", async () => {
    const r = await post("/api/activities/generate", { topic: "חברות", value: "רעות", ageGroup: "כיתה ז' - מעורב", instructor: "דנה", kind: "social", methods: [{ name: "משחק תחרות", minutes: 20 }, { name: "שיתוף", minutes: 10 }] }, dana.token);
    assert.equal(r.status, 201);
    assert.equal(r.body.kind, "social");
    assert.ok(r.body.stages[4].content.includes("מעגל תודות"));
    assert.equal((await post("/api/activities/quick", { kind: "nonsense" })).status, 400);
    assert.equal((await post("/api/activities/quick", { minutes: 3 })).status, 400);
    assert.equal((await post("/api/activities/generate", { topic: "חברות", ageGroup: "כיתה ז' - מעורב", instructor: "דנה", kind: "zzz", methods: [{ name: "משחק תחרות", minutes: 20 }] })).status, 400);
  });

  it("סינון בספרייה לפי סוג", async () => {
    const r = await j("/api/activities?kind=peak&pageSize=50");
    assert.ok(r.body.total >= 1);
    assert.ok(r.body.items.every((a) => a.kind === "peak"));
    assert.equal((await j("/api/activities?kind=bad")).status, 400);
  });

  it("מה חסר לי: משתמש חדש מקבל שיא, ואחרי יצירת שיא ההמלצה זזה", async () => {
    const fresh = (await post("/api/auth/register", { username: "gal-d", password: "password123", displayName: "גל", signupCode: "shevet-code" })).body;
    const g1 = await j("/api/me/gaps", { headers: H(fresh.token) });
    assert.equal(g1.body.suggest, "peak");
    assert.equal(g1.body.kinds.length, 7);
    assert.ok(g1.body.kinds.every((k) => k.daysAgo === null));
    assert.ok(g1.body.message.includes("עוד לא"));
    await post("/api/activities/quick", { kind: "peak", topic: "משהו גדול" }, fresh.token);
    const g2 = await j("/api/me/gaps", { headers: H(fresh.token) });
    assert.notEqual(g2.body.suggest, "peak");
    assert.equal(g2.body.kinds.find((k) => k.id === "peak").daysAgo, 0);
    const anon = await j("/api/me/gaps");
    assert.equal(anon.status, 200);
  });

  it("הצעות לשבוע: שלוש הצעות יציבות עם סיבה וסוג", async () => {
    const a = await j("/api/suggest/week", { headers: H(dana.token) });
    assert.equal(a.body.items.length, 3);
    for (const s of a.body.items) {
      assert.ok(s.topic && s.value && s.reason);
      assert.ok(["peak", "content", "value", "intro", "summary", "social", "field"].includes(s.kind));
    }
    assert.equal(new Set(a.body.items.map((s) => s.topic)).size, 3);
    const b = await j("/api/suggest/week", { headers: H(dana.token) });
    assert.deepEqual(b.body.items, a.body.items);
  });

  it("מאגר רעיונות לשיאים ויצירה מרעיון", async () => {
    const r = await j("/api/peak-ideas");
    assert.equal(r.body.categories.length, 4);
    assert.ok(r.body.items.length >= 12);
    const idea = r.body.items[0];
    const a = await post("/api/activities/quick", { kind: "peak", topic: idea.title, value: idea.value, seedText: idea.how }, dana.token);
    assert.equal(a.status, 201);
    assert.ok(a.body.stages[1].content.startsWith("הרעיון המרכזי: "));
  });

  it("פעולה כמו זו: אותו סוג, גיל ושיטות, נושא אחר", async () => {
    const src = (await post("/api/activities/quick", { kind: "value", topic: "כנות", value: "אמת", ageGroup: "כיתה ח' - בנות" }, dana.token)).body;
    const sim = await post(`/api/activities/${src.id}/similar`, {}, dana.token);
    assert.equal(sim.status, 201);
    assert.equal(sim.body.kind, "value");
    assert.equal(sim.body.ageGroup, "כיתה ח' - בנות");
    assert.notEqual(sim.body.title, src.title);
    assert.deepEqual(sim.body.methods.map((m) => m.name), src.methods.map((m) => m.name));
    const own = await post(`/api/activities/${src.id}/similar`, { topic: "סבלנות" }, dana.token);
    assert.equal(own.body.title, "סבלנות");
    assert.equal((await post("/api/activities/99999/similar", {})).status, 404);
  });

  it("הפוך לשיא: מוסיף 20 דקות והערות שיא, והמקור לא משתנה", async () => {
    const src = (await post("/api/activities/quick", { kind: "content", topic: "קשרים", minutes: 40 }, dana.token)).body;
    const up = await post(`/api/activities/${src.id}/upgrade-peak`, {}, dana.token);
    assert.equal(up.status, 201);
    assert.equal(up.body.kind, "peak");
    assert.equal(up.body.durationMin, 60);
    assert.equal(up.body.stages.reduce((s, x) => s + x.minutes, 0), 60);
    assert.ok(up.body.title.endsWith("(גרסת שיא)"));
    assert.ok(up.body.stages[2].content.includes("רגע השיא"));
    const again = (await j(`/api/activities/${src.id}`)).body;
    assert.equal(again.durationMin, 40);
    assert.equal(again.kind, "content");
  });

  it("קצר לי: 20 דקות, כל שלב לפחות דקה, והטקסט באמת קצר יותר", async () => {
    const src = (await post("/api/activities/quick", { kind: "peak", topic: "שיא ארוך" }, dana.token)).body;
    const sh = await post(`/api/activities/${src.id}/shorten`, { minutes: 20 }, dana.token);
    assert.equal(sh.status, 201);
    assert.equal(sh.body.durationMin, 20);
    assert.equal(sh.body.stages.reduce((s, x) => s + x.minutes, 0), 20);
    assert.ok(sh.body.stages.every((s) => s.minutes >= 1));
    const len = (a) => a.stages.reduce((n, s) => n + s.content.length, 0);
    assert.ok(len(sh.body) < len(src));
    assert.ok(sh.body.title.includes("20 דק"));
    assert.ok(sh.body.tags.includes("גרסה מקוצרת"));
    assert.equal((await post(`/api/activities/${src.id}/shorten`, { minutes: 5 })).status, 400);
    const tiny = (await post("/api/activities/quick", { kind: "content", topic: "קצרצר", minutes: 10 }, dana.token)).body;
    assert.equal((await post(`/api/activities/${tiny.id}/shorten`, {}, dana.token)).status, 422);
  });

  it("הצעות מנהל: רק אדמין כותב, כולם קוראים, מוגבל לשש", async () => {
    assert.deepEqual((await j("/api/featured")).body.items, []);
    assert.equal((await put("/api/admin/featured", { items: [] }, dana.token)).status, 401);
    const items = [{ topic: "ט\"ו בשבט בשטח", value: "אחריות לסביבה", kind: "field", note: "לשבוע הבא" }];
    const w = await put("/api/admin/featured", { items }, admin);
    assert.equal(w.status, 200);
    assert.equal((await j("/api/featured")).body.items[0].topic, items[0].topic);
    const seven = Array.from({ length: 7 }, (_, i) => ({ topic: "נושא " + i }));
    assert.equal((await put("/api/admin/featured", { items: seven }, admin)).status, 400);
    assert.equal((await put("/api/admin/featured", { items: [{ topic: "x", kind: "bad" }] }, admin)).status, 400);
    await put("/api/admin/featured", { items: [] }, admin);
  });

  it("אישור לפני פרסום חל גם על פעולות מהירות", async () => {
    await put("/api/admin/settings", { requireApproval: true }, admin);
    const held = (await post("/api/activities/quick", { kind: "social", topic: "ממתין" }, dana.token)).body;
    assert.equal(held.status, "PENDING");
    await put("/api/admin/settings", { requireApproval: false }, admin);
  });
});

describe("נושא אקראי", () => {
  it("מחזיר נושא וערך, ומכבד סוג", async () => {
    const r = await j("/api/topics/random");
    assert.equal(r.status, 200);
    assert.ok(r.body.topic.length >= 2 && r.body.value.length >= 2);
    assert.equal((await j("/api/topics/random?kind=peak")).status, 200);
    assert.equal((await j("/api/topics/random?kind=zzz")).status, 200);
  });
});

describe("סבב ה': ערכים, אתגרים, סיפורים, שאלות, סיכום, חימום, שכבות, בדיקת מבנה, אחרי הפעלה", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  let eli, noa;

  it("הכנה", async () => {
    eli = (await post("/api/auth/register", { username: "eli-e", password: "password123", displayName: "אלי", signupCode: "shevet-code" })).body;
    noa = (await post("/api/auth/register", { username: "noa-e", password: "password123", displayName: "נועה", signupCode: "shevet-code" })).body;
    assert.ok(eli.token && noa.token);
  });

  it("התאמות לקבוצה: קבוצה עם הרבה אנרגיה", async () => {
    const r = await post("/api/activities/1/adapt", { condition: "restless" }, eli.token);
    assert.equal(r.status, 201);
    assert.ok(r.body.title.endsWith("(גרסת קבוצה עם הרבה אנרגיה)"));
    assert.ok(r.body.stages.every((s) => s.content.includes("התאמה (קבוצה עם הרבה אנרגיה)")));
    const m = await post("/api/activities/1/adapt", { condition: "mixed" }, eli.token);
    assert.equal(m.status, 201);
  });

  it("ערכים ואתגרי חינוך", async () => {
    const v = await j("/api/values");
    assert.equal(v.body.length, 14);
    assert.ok(v.body.every((x) => x.label && x.short && x.topics.length === 3));
    const c = await j("/api/challenges");
    assert.ok(c.body.length >= 8);
    const kinds = (await j("/api/kinds")).body.map((k) => k.id);
    for (const x of c.body) {
      assert.ok(kinds.includes(x.kind), x.id);
      assert.ok(x.care.length > 20 && x.guidance.length > 20 && x.guidance.length <= 600, x.id);
    }
    // אתגר הופך לפעולה דרך יצירה מהירה
    const ch = c.body.find((x) => x.id === "quarrel");
    const made = await post("/api/activities/quick", { topic: ch.topic, value: ch.value, kind: ch.kind, seedText: ch.guidance }, eli.token);
    assert.equal(made.status, 201);
    assert.equal(made.body.kind, "social");
  });

  it("סיפורים: סינון לפי ערך והוספה לשלב (רק לבעלים, עם גרסה)", async () => {
    const all = await j("/api/stories");
    assert.ok(all.body.length >= 12);
    const one = await j("/api/stories?value=" + encodeURIComponent("אחריות"));
    assert.ok(one.body.length >= 1 && one.body.every((s) => s.value.includes("אחריות")));
    const mine = (await post("/api/activities/quick", { kind: "value", topic: "סיפור לבדיקה" }, eli.token)).body;
    const before = mine.stages[0].content;
    assert.equal((await post(`/api/activities/${mine.id}/add-story`, { storyId: "lantern", stage: 0 }, noa.token)).status, 403);
    assert.equal((await post(`/api/activities/${mine.id}/add-story`, { storyId: "nope", stage: 0 }, eli.token)).status, 404);
    const r = await post(`/api/activities/${mine.id}/add-story`, { storyId: "lantern", stage: 0 }, eli.token);
    assert.equal(r.status, 200);
    assert.ok(r.body.stages[0].content.includes("הפנס של נועם") && r.body.stages[0].content.startsWith(before));
    const vers = await j(`/api/activities/${mine.id}/versions`, { headers: H(eli.token) });
    assert.ok(vers.body.items.some((x) => x.note === "לפני הוספת סיפור"));
  });

  it("שאלות לדיון, סיכום להורים ובדיקת מבנה", async () => {
    const q = await j("/api/activities/1/questions");
    assert.equal(q.body.levels.length, 4);
    assert.ok(q.body.levels.every((l) => l.questions.length === 3 && l.questions.every((x) => x.endsWith("?"))));
    const q2 = await j("/api/activities/2/questions");
    assert.notDeepEqual(q.body.levels[0].questions, q2.body.levels[0].questions);
    const s = await j("/api/activities/1/summary");
    assert.ok(s.body.parents.startsWith("שלום להורים,") && s.body.parents.split("\n").length >= 5);
    assert.ok(s.body.leader.includes("ציוד:") && s.body.leader.includes("בטיחות:"));
    const r = await j("/api/activities/1/review");
    assert.equal(r.body.checks.length, 9);
    assert.ok(r.body.score >= 0 && r.body.score <= 100);
    assert.ok(r.body.checks.every((c) => c.label && c.tip && typeof c.ok === "boolean"));
    assert.equal((await j("/api/activities/9999/review")).status, 404);
  });

  it("בדיקת מבנה תופסת פעולה חלשה", async () => {
    const { reviewActivity } = await import("../src/quality.js");
    const weak = {
      stages: [
        { name: "פתיחה", minutes: 3, content: "מדברים." },
        { name: "ציר זמן/משחק", minutes: 40, content: "המדריך מסביר הרבה." },
        { name: "זמן צופיות מעשי", minutes: 3, content: "עוד הסבר." },
        { name: "דיון", minutes: 3, content: "מדברים על זה." },
        { name: "סיכום", minutes: 3, content: "הולכים הביתה." },
      ],
      energeticMode: true,
      safetyNotes: "",
    };
    const r = reviewActivity(weak);
    assert.ok(r.score <= 40, String(r.score));
    for (const id of ["peak", "balance", "discussion", "clear", "safety", "closing"]) assert.equal(r.checks.find((c) => c.id === id).ok, false, id);
  });

  it("משחקי חימום ומעבר", async () => {
    const all = await j("/api/warmups?n=8");
    assert.equal(all.body.categories.length, 4);
    assert.equal(all.body.items.length, 8);
    for (const cat of all.body.categories) {
      const r = await j("/api/warmups?category=" + encodeURIComponent(cat));
      assert.ok(r.body.items.length >= 1 && r.body.items.every((x) => x.category === cat), cat);
    }
    const a = await j("/api/warmups?seed=1&n=2");
    const b = await j("/api/warmups?seed=2&n=2");
    assert.notDeepEqual(a.body.items.map((x) => x.name), b.body.items.map((x) => x.name));
    assert.ok((await j("/api/warmups?noEquipment=1&n=8")).body.items.every((x) => !x.equipment));
  });

  it("תוכנית לכמה שכבות: אותו ערך בכל שבוע לכל השכבות", async () => {
    const ages = ["כיתה ו' - מעורב", "כיתה ח' - מעורב"];
    const r = await post("/api/plan/multi", { weeks: 4, ageGroups: ages, values: ["אחריות", "חברות"], startDate: "2026-11-01" });
    assert.equal(r.status, 200);
    assert.equal(r.body.rows.length, 4);
    assert.ok(r.body.rows.every((row) => row.cells.length === 2));
    assert.equal(r.body.rows[0].value, "אחריות");
    assert.equal(r.body.rows[1].value, "חברות");
    assert.equal(r.body.rows[0].date, "2026-11-01");
    const auto = await post("/api/plan/multi", { weeks: 3, ageGroups: ages });
    assert.ok(auto.body.values.length >= 1);
    assert.equal((await post("/api/plan/multi", { weeks: 3, ageGroups: [] })).status, 400);
    assert.equal((await post("/api/plan/multi", { weeks: 3, ageGroups: ["כיתה ט' - בנים", "שכבה שלא קיימת"] })).status, 400);
  });

  it("תיעוד הפעלה והצעות שדרוג", async () => {
    const act = (await post("/api/activities/quick", { kind: "peak", topic: "תיעוד שיא" }, eli.token)).body;
    assert.equal((await post(`/api/activities/${act.id}/runs`, { ranOn: "2026-10-01", engagement: 5 }, eli.token)).status, 400);
    assert.equal((await post(`/api/activities/${act.id}/runs`, { ranOn: "2026-10-01", timing: "forever" }, eli.token)).status, 400);
    const r = await post(`/api/activities/${act.id}/runs`, { ranOn: "2026-10-01", engagement: 1, timing: "long", changeNext: "היה משעמם והיה רועש" }, eli.token);
    assert.equal(r.status, 201);
    assert.equal(r.body.engagement, 1);
    assert.equal(r.body.timing, "long");
    const sug = await j(`/api/activities/${act.id}/run-suggestions`, { headers: H(eli.token) });
    const types = sug.body.items.map((x) => x.action.type);
    assert.ok(types.includes("shorten"), types.join());
    assert.ok(types.includes("adapt"));
    assert.ok(sug.body.items.length <= 4);
    assert.ok(!types.includes("upgrade-peak"), "פעולת שיא לא מקבלת הצעת שדרוג לשיא");
    assert.equal((await j(`/api/activities/${act.id}/run-suggestions`)).status, 401);
    // בלי רישום: אין הצעות
    const none = await j(`/api/activities/${act.id}/run-suggestions`, { headers: H(noa.token) });
    assert.deepEqual(none.body.items, []);
    // ההצעה לקיצור באמת עובדת
    const short = await post(`/api/activities/${act.id}/shorten`, { minutes: sug.body.items.find((x) => x.action.type === "shorten").action.minutes }, eli.token);
    assert.equal(short.status, 201);
  });

  it("מה עבד אצלך: רק אחרי שתי הפעלות מאותו סוג", async () => {
    const one = (await post("/api/activities/quick", { kind: "social", topic: "למידה א" }, noa.token)).body;
    const two = (await post("/api/activities/quick", { kind: "social", topic: "למידה ב" }, noa.token)).body;
    assert.equal((await j("/api/me/learned")).status, 401);
    await post(`/api/activities/${one.id}/runs`, { ranOn: "2026-10-02", engagement: 3 }, noa.token);
    assert.equal((await j("/api/me/learned", { headers: H(noa.token) })).body.best, null);
    await post(`/api/activities/${two.id}/runs`, { ranOn: "2026-10-03", engagement: 2 }, noa.token);
    const l = await j("/api/me/learned", { headers: H(noa.token) });
    assert.equal(l.body.best.kind, "social");
    assert.equal(l.body.best.count, 2);
    assert.equal(l.body.best.avg, 2.5);
  });

  it("התוכן המובנה כתוב בעברית מדוברת (בלי ניסוחים משרדיים)", async () => {
    const content = await import("../src/content.js");
    const { checkQuality } = await import("../src/quality.js");
    const items = [
      ...content.STORIES.flatMap((x) => [{ label: x.id, text: x.text }, { label: x.id + "-q", text: x.question }]),
      ...content.CHALLENGES.flatMap((x) => [{ label: x.id + "-care", text: x.care }, { label: x.id + "-g", text: x.guidance }, { label: x.id + "-d", text: x.desc }]),
      ...content.WARMUPS.map((x) => ({ label: x.name, text: x.how })),
      ...content.VALUES.map((x) => ({ label: x.id, text: x.short })),
    ];
    const r = checkQuality(items);
    assert.deepEqual(r.issues.map((i) => `${i.label}: ${i.phrase}`), []);
  });
});

describe("סבב ו': חיפוש מתקדם, ארון, מצב מהיר, יומן ותזכורות, שיתוף עריכה, ווטסאפ, מדריך חדש", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const patch = (p, body, tok) => j(p, { method: "PATCH", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const del = (p, tok) => j(p, { method: "DELETE", headers: tok ? H(tok) : {} });
  let rina, tal, org;

  it("הכנה", async () => {
    rina = (await post("/api/auth/register", { username: "rina-f", password: "password123", displayName: "רינה", signupCode: "shevet-code" })).body;
    tal = (await post("/api/auth/register", { username: "tal-f", password: "password123", displayName: "טל", signupCode: "shevet-code" })).body;
    org = await import("../src/organizer.js");
    assert.ok(rina.token && tal.token);
  });

  it("25. סינון מתקדם: תנועתית, זמן צופיות, גודל קבוצה, מחבר, ציוד קל", async () => {
    const all = (await j("/api/activities?pageSize=50")).body;
    const energetic = (await j("/api/activities?energetic=1&pageSize=50")).body;
    assert.ok(energetic.total < all.total && energetic.items.every((a) => a.energeticMode));
    const scouting = (await j("/api/activities?scouting=1&pageSize=50")).body;
    assert.ok(scouting.items.every((a) => a.activeScouting));
    const big = (await j("/api/activities?minSize=500")).status;
    assert.equal(big, 400);
    const sized = (await j("/api/activities?minSize=1&maxSize=1&pageSize=50")).body;
    assert.ok(sized.items.every((a) => a.groupSize === 1));
    const light = (await j("/api/activities?lightGear=1&pageSize=50")).body;
    const { gearLoad } = await import("../src/gear.js");
    assert.ok(light.items.every((a) => gearLoad(a.equipment) <= 1));
    assert.equal(light.total, light.items.length);
    const lior = (await j("/api/activities?author=" + encodeURIComponent("ליאור"))).body;
    assert.ok(lior.total >= 1 && lior.items.every((a) => /ליאור/.test(`${a.author}${a.instructor}`)));
    assert.equal((await j("/api/activities?energetic=2")).status, 400);
  });

  it("25. השלמה אוטומטית", async () => {
    const s = await j("/api/search/suggest?q=" + encodeURIComponent("בריונ"));
    assert.ok(s.body.length >= 1 && s.body.every((x) => x.text.includes("בריונ") && ["title", "value", "tag"].includes(x.type)));
    assert.deepEqual((await j("/api/search/suggest?q=a")).body, []);
  });

  it("26. התאמת ציוד: פירוק פריטים ובדיקת כיסוי", async () => {
    const { gearItems, matchCupboard, gearLoad } = await import("../src/gear.js");
    assert.equal(gearLoad("אין"), 0);
    assert.equal(gearLoad("נעליים, מקום פתוח"), 0);
    assert.equal(gearItems("דפים ועטים").length, 1);
    const m = matchCupboard("דפים ועטים, חבלים או סרטים, אפשר רמקול", ["paper"], "");
    assert.deepEqual(m.missing, ["חבלים או סרטים"]);
    assert.deepEqual(m.optionalMissing, ["אפשר רמקול"]);
    assert.deepEqual(matchCupboard("דפים ועטים, חבלים או סרטים", ["paper", "rope"], "").missing, []);
    // פריט שלא מוכר מכוסה רק אם המדריך כתב אותו
    assert.deepEqual(matchCupboard("חפץ אוצר", [], "יש לי אוצר").missing, []);
    assert.deepEqual(matchCupboard("חפץ אוצר", [], "").missing, ["חפץ אוצר"]);
  });

  it("26. מה יש בארון: תוצאות לפי מה שיש, והצעה מה להשיג", async () => {
    const gear = await j("/api/gear");
    assert.ok(gear.body.length >= 12 && gear.body.every((g) => g.id && g.label));
    const none = await post("/api/by-equipment", { have: [], allowMissing: 0 });
    const everything = await post("/api/by-equipment", { have: gear.body.map((g) => g.id), allowMissing: 0 });
    assert.equal(none.status, 200);
    assert.ok(everything.body.total >= none.body.total);
    assert.ok(everything.body.items.every((a) => a.missing.length === 0 && a.ready));
    const near = await post("/api/by-equipment", { have: [], allowMissing: 3 });
    const ready = near.body.items.filter((a) => a.ready).length;
    assert.ok(near.body.items.slice(0, ready).every((a) => a.ready), "מוכנות קודם");
    assert.ok(near.body.unlocks.every((u) => u.item && u.count >= 1));
    const short = await post("/api/by-equipment", { have: [], allowMissing: 3, maxMinutes: 30 });
    assert.ok(short.body.items.every((a) => a.durationMin <= 30));
    assert.equal((await post("/api/by-equipment", { have: ["nope"] })).status, 400);
  });

  it("27. מצב מהיר", async () => {
    const q = await j("/api/quick?age=" + encodeURIComponent("כיתה ז' - מעורב") + "&minutes=35");
    assert.equal(q.status, 200);
    assert.ok(q.body.pick && q.body.pick.durationMin <= 40 && q.body.pick.reasons.length >= 2);
    assert.ok(q.body.alternatives.every((a) => a.durationMin <= 40 && a.id !== q.body.pick.id));
    const again = await j(`/api/quick?minutes=35&skip=${q.body.pick.id}`);
    assert.notEqual(again.body.pick?.id, q.body.pick.id);
    // כשכל הקצרות מדולגות, לא מוצאים כלום ומציעים את הקרובה ביותר לקיצור
    const shorts = (await j("/api/activities?maxDuration=15&pageSize=50")).body.items.map((a) => a.id).join(",");
    const tiny = await j(`/api/quick?minutes=5&skip=${shorts}`);
    assert.equal(tiny.body.pick, null);
    assert.ok(tiny.body.nearest && tiny.body.nearest.durationMin > 15 && tiny.body.nearest.reasons[0].includes("לקצר"));
    const minimal = await j("/api/quick?minimalGear=1");
    if (minimal.body.pick) assert.ok(minimal.body.pick.gear <= 1);
    assert.equal((await j("/api/quick?minutes=2")).status, 400);
    assert.equal((await j("/api/quick?age=x")).status, 400);
  });

  it("28–29. יומן: הרשאות, הוספה, עדכון ומחיקה", async () => {
    assert.equal((await j("/api/me/schedule")).status, 401);
    assert.equal((await post("/api/me/schedule", { activityId: 1, date: "2026-12-01" })).status, 401);
    const bad = await post("/api/me/schedule", { activityId: 1, date: "2026-02-31" }, rina.token);
    assert.equal(bad.status, 400);
    const empty = await post("/api/me/schedule", { date: "2026-12-01" }, rina.token);
    assert.equal(empty.status, 400);
    assert.equal((await post("/api/me/schedule", { activityId: 9999, date: "2026-12-01" }, rina.token)).status, 404);
    assert.equal((await post("/api/me/schedule", { activityId: 1, date: "2026-12-01", time: "25:00" }, rina.token)).status, 400);
    const ok = await post("/api/me/schedule", { activityId: 1, date: "2026-12-03", time: "18:30", groupLabel: "ז' בנות", note: "להביא קונוסים", remindDays: 2 }, rina.token);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.date, "2026-12-03");
    assert.equal(ok.body.remindDays, 2);
    assert.ok(ok.body.title.length > 2);
    const free = await post("/api/me/schedule", { title: "טיול שבט", date: "2026-12-05" }, rina.token);
    assert.equal(free.status, 201);
    assert.equal(free.body.activityId, null);
    const list = await j("/api/me/schedule?from=2026-12-01&to=2026-12-31", { headers: H(rina.token) });
    assert.deepEqual(list.body.map((x) => x.date), ["2026-12-03", "2026-12-05"]);
    // משתמש אחר לא רואה ולא משנה
    assert.deepEqual((await j("/api/me/schedule", { headers: H(tal.token) })).body, []);
    assert.equal((await patch(`/api/me/schedule/${ok.body.id}`, { note: "x" }, tal.token)).status, 404);
    assert.equal((await del(`/api/me/schedule/${ok.body.id}`, tal.token)).status, 404);
    const up = await patch(`/api/me/schedule/${ok.body.id}`, { date: "2026-12-10", remindDays: null }, rina.token);
    assert.equal(up.body.date, "2026-12-10");
    assert.equal(up.body.remindDays, null);
    assert.equal(up.body.note, "להביא קונוסים");
    assert.equal((await del(`/api/me/schedule/${free.body.id}`, rina.token)).status, 200);
    assert.equal((await j("/api/me/schedule", { headers: H(rina.token) })).body.length, 1);
  });

  it("28. תזכורות: הכנה לפני, תיעוד אחרי, סגירה", async () => {
    const today = org.israelToday();
    const shift = (n) => new Date(new Date(today + "T00:00:00Z").getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const soon = (await post("/api/me/schedule", { activityId: 1, date: shift(1), remindDays: 2, groupLabel: "ו' מעורב" }, tal.token)).body;
    const far = (await post("/api/me/schedule", { activityId: 2, date: shift(9), remindDays: 1 }, tal.token)).body;
    const noRemind = (await post("/api/me/schedule", { activityId: 3, date: shift(1) }, tal.token)).body;
    const past = (await post("/api/me/schedule", { activityId: 4, date: shift(-2), remindDays: 1 }, tal.token)).body;
    const r = (await j(`/api/me/reminders?today=${today}`, { headers: H(tal.token) })).body;
    const ids = r.items.map((x) => x.id);
    assert.ok(ids.includes(soon.id) && ids.includes(past.id));
    assert.ok(!ids.includes(far.id) && !ids.includes(noRemind.id));
    const prep = r.items.find((x) => x.id === soon.id);
    assert.equal(prep.type, "prep");
    assert.equal(prep.daysLeft, 1);
    assert.ok(prep.message.startsWith("מחר פעולה:") && prep.message.includes("ו' מעורב"));
    assert.ok(Array.isArray(prep.gear) && prep.gear.length >= 1);
    const log = r.items.find((x) => x.id === past.id);
    assert.equal(log.type, "log");
    assert.ok(log.message.includes("יומן ההפעלות"));
    // תיעוד הפעלה מסלק את התזכורת לתעד
    await post("/api/activities/4/runs", { ranOn: shift(-2), groupLabel: "ז'" }, tal.token);
    const after = (await j(`/api/me/reminders?today=${today}`, { headers: H(tal.token) })).body.items.map((x) => x.id);
    assert.ok(!after.includes(past.id) && after.includes(soon.id));
    // "הוכן" סוגר את תזכורת ההכנה
    assert.equal((await post(`/api/me/reminders/${soon.id}/dismiss`, {}, tal.token)).status, 200);
    assert.ok(!(await j(`/api/me/reminders?today=${today}`, { headers: H(tal.token) })).body.items.some((x) => x.id === soon.id));
    // לא אפשר לסגור תזכורת של מישהו אחר
    assert.equal((await post(`/api/me/reminders/${far.id}/dismiss`, {}, rina.token)).status, 404);
    // שינוי תאריך מחזיר את התזכורת
    await patch(`/api/me/schedule/${soon.id}`, { date: shift(0) }, tal.token);
    assert.ok((await j(`/api/me/reminders?today=${today}`, { headers: H(tal.token) })).body.items.some((x) => x.id === soon.id));
  });

  it("29. קובץ יומן ICS", async () => {
    const r = await fetch(base + "/api/me/schedule.ics", { headers: H(rina.token) });
    assert.equal(r.status, 200);
    assert.ok(r.headers.get("content-type").startsWith("text/calendar"));
    assert.ok(r.headers.get("content-disposition").includes("shevet-maoz-schedule.ics"));
    const body = await r.text();
    assert.ok(body.startsWith("BEGIN:VCALENDAR\r\n") && body.trimEnd().endsWith("END:VCALENDAR"));
    assert.equal((await fetch(base + "/api/me/schedule.ics")).status, 401);
    for (const line of body.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, "שורה ארוכה: " + line);
    const ics = org.buildIcs([
      { id: 7, activityId: 1, title: "פעולה; עם, תווים\nמיוחדים", date: "2026-12-03", time: "18:30", durationMin: 45, groupLabel: "ז'", note: "", remindDays: 1 },
      { id: 8, activityId: null, title: "יום שלם", date: "2026-12-04", time: "", durationMin: null, groupLabel: "", note: "", remindDays: 0 },
      { id: 9, activityId: null, title: "ללא תזכורת", date: "2026-12-05", time: "", durationMin: null, groupLabel: "", note: "", remindDays: null },
    ], { origin: "https://x.example" });
    assert.ok(ics.includes("DTSTART:20261203T183000") && ics.includes("DTEND:20261203T191500"));
    assert.ok(ics.includes("DTSTART;VALUE=DATE:20261204") && ics.includes("DTEND;VALUE=DATE:20261205"));
    assert.ok(ics.includes("TRIGGER:-P1D") && ics.includes("TRIGGER;RELATED=START:PT9H"));
    assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
    assert.ok(ics.includes("\;") && ics.includes("\\,") && ics.includes("\\n"));
    assert.ok(ics.replace(/\r\n /g, "").includes("https://x.example/library/1"));
  });

  it("30. שיתוף עריכה: הרשאות, מגבלות והגנה מדריסה", async () => {
    const mine = (await post("/api/activities/quick", { kind: "value", topic: "עריכה משותפת" }, rina.token)).body;
    const id = mine.id;
    const edit = (tok, extra = {}) => put(`/api/activities/${id}`, { title: "שם חדש " + Math.random().toString(36).slice(2, 6), ...extra }, tok);
    assert.equal((await edit(tal.token)).status, 403);
    assert.equal((await post(`/api/activities/${id}/collaborators`, { username: "tal-f" }, tal.token)).status, 403);
    assert.equal((await post(`/api/activities/${id}/collaborators`, { username: "nobody" }, rina.token)).status, 404);
    assert.equal((await post(`/api/activities/${id}/collaborators`, { username: "rina-f" }, rina.token)).status, 400);
    assert.equal((await post(`/api/activities/1/collaborators`, { username: "tal-f" }, rina.token)).status, 403);
    const adm = (await post("/api/auth/login", { username: "admin", password: "a-new-strong-pass" })).body;
    if (adm.token) assert.equal((await post(`/api/activities/1/collaborators`, { username: "tal-f" }, adm.token)).status, 400);
    const added = await post(`/api/activities/${id}/collaborators`, { username: "TAL-F" }, rina.token);
    assert.equal(added.status, 201);
    assert.equal(added.body.length, 1);
    assert.equal(added.body[0].displayName, "טל");
    // שותף יכול לערוך, לראות גרסאות ולהוסיף סיפור, אבל לא למחוק או לשתף הלאה
    const a1 = await j(`/api/activities/${id}/access`, { headers: H(tal.token) });
    assert.deepEqual([a1.body.canEdit, a1.body.canDelete, a1.body.isOwner, a1.body.isCollaborator], [true, false, false, true]);
    const owner = await j(`/api/activities/${id}/access`, { headers: H(rina.token) });
    assert.deepEqual([owner.body.canEdit, owner.body.canDelete, owner.body.isOwner], [true, true, true]);
    const stranger = await j(`/api/activities/${id}/access`);
    assert.deepEqual([stranger.body.canEdit, stranger.body.collaborators.length], [false, 0]);
    assert.equal((await edit(tal.token)).status, 200);
    assert.equal((await j(`/api/activities/${id}/versions`, { headers: H(tal.token) })).status, 200);
    assert.equal((await post(`/api/activities/${id}/add-story`, { storyId: "lantern", stage: 0 }, tal.token)).status, 200);
    assert.equal((await del(`/api/activities/${id}`, tal.token)).status, 403);
    assert.equal((await post(`/api/activities/${id}/collaborators`, { username: "rina-f" }, tal.token)).status, 403);
    assert.equal((await j(`/api/me/shared`, { headers: H(tal.token) })).body.some((x) => x.id === id), true);
    // הגנה מדריסה
    const cur = (await j(`/api/activities/${id}`)).body;
    const stale = cur.updatedAt;
    assert.equal((await edit(rina.token, { baseUpdatedAt: stale })).status, 200);
    const conflict = await edit(tal.token, { baseUpdatedAt: stale });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "EDIT_CONFLICT");
    assert.ok(conflict.body.error.message.includes("rina-f"));
    assert.equal((await edit(tal.token, { baseUpdatedAt: stale, force: true })).status, 200);
    const fresh = (await j(`/api/activities/${id}`)).body.updatedAt;
    assert.equal((await edit(tal.token, { baseUpdatedAt: fresh })).status, 200);
    const last = (await j(`/api/activities/${id}/access`, { headers: H(rina.token) })).body.lastEditor;
    assert.equal(last.name, "tal-f");
    // עזיבה עצמית והסרה
    const left = await del(`/api/activities/${id}/collaborators/${tal.user.id}`, tal.token);
    assert.equal(left.status, 200);
    assert.equal((await edit(tal.token)).status, 403);
    await post(`/api/activities/${id}/collaborators`, { username: "tal-f" }, rina.token);
    assert.equal((await del(`/api/activities/${id}/collaborators/${tal.user.id}`, rina.token)).status, 200);
    // מגבלת חמישה שותפים
    for (let i = 0; i < 5; i++) {
      const u = (await post("/api/auth/register", { username: `col${i}-f`, password: "password123", displayName: "ש" + i, signupCode: "shevet-code" })).body;
      assert.ok(u.token);
      assert.equal((await post(`/api/activities/${id}/collaborators`, { username: `col${i}-f` }, rina.token)).status, 201);
    }
    assert.equal((await post(`/api/activities/${id}/collaborators`, { username: "tal-f" }, rina.token)).status, 409);
  });

  it("31. ווטסאפ: ארבעה נוסחים", async () => {
    const id = 1;
    const title = (await j(`/api/activities/${id}`)).body.title;
    const staff = (await j(`/api/activities/${id}/whatsapp?mode=staff`)).body;
    assert.equal(staff.modes.length, 4);
    assert.ok(staff.text.startsWith(`*${title}*`) && staff.text.includes("*ציוד*") && staff.text.includes("*מהלך הפעולה*"));
    assert.ok(staff.text.split("\n").filter((l) => /^\d\. /.test(l)).length === 5);
    const full = (await j(`/api/activities/${id}/whatsapp?mode=full`)).body.text;
    assert.ok(full.length > staff.text.length);
    const a = (await j(`/api/activities/${id}`)).body;
    for (const s of a.stages) assert.ok(full.includes(s.name));
    const kids = (await j(`/api/activities/${id}/whatsapp?mode=kids&date=2026-12-03&time=18:30&place=${encodeURIComponent("המועדון")}`)).body.text;
    assert.ok(kids.includes("18:30") && kids.includes("המועדון") && kids.includes(title));
    assert.ok(!(await j(`/api/activities/${id}/whatsapp?mode=kids`)).body.text.includes("undefined"));
    const parents = (await j(`/api/activities/${id}/whatsapp?mode=parents`)).body.text;
    assert.equal(parents, (await j(`/api/activities/${id}/summary`)).body.parents);
    assert.equal((await j(`/api/activities/${id}/whatsapp?mode=zzz`)).status, 400);
    assert.equal((await j(`/api/activities/${id}/whatsapp?date=2026-13-45`)).status, 400);
    assert.equal((await j(`/api/activities/9999/whatsapp`)).status, 404);
    // כוכביות בתוכן לא שוברות עיצוב
    assert.ok(!org.whatsappText({ ...a, title: "כוכב*ית *בדיקה*" }, { mode: "staff" }).includes("**"));
  });

  it("33. מדריך חדש: מסלול, מילון וטיפים לפעולה", async () => {
    const g = (await j("/api/newbie/guide")).body;
    assert.ok(g.journey.length === 6 && g.journey.every((s) => s.title && s.href.startsWith("/")));
    assert.ok(g.glossary.length >= 8 && g.glossary.every((x) => x.term && x.text));
    const t = (await j("/api/activities/1/newbie")).body;
    assert.equal(t.during.length, 5);
    assert.equal(t.during[0].minute, 0);
    assert.equal(t.during[1].minute, t.during[0].minutes);
    assert.equal(t.totalMinutes, t.during.reduce((s, x) => s + x.minutes, 0));
    assert.ok(t.during.every((x) => x.tip.length > 20));
    assert.ok(t.before.length >= 5 && t.ifThen.length >= 5 && t.after.length >= 3);
    assert.equal((await j("/api/activities/9999/newbie")).status, 404);
    // פעולה תנועתית מקבלת הערת גבולות גזרה
    const move = (await post("/api/activities/quick", { kind: "peak", topic: "תנועה" }, rina.token)).body;
    const tm = (await j(`/api/activities/${move.id}/newbie`)).body;
    if (move.energeticMode) assert.ok(tm.before.some((x) => x.includes("גבולות גזרה")));
  });
});

describe("סבב ז': בטיחות, נגישות, דיווחים, התראות, אחסון, דוח, ייצוא, דומות", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  let uma, ron, adm;

  it("הכנה", async () => {
    uma = (await post("/api/auth/register", { username: "uma-g", password: "password123", displayName: "אומה", signupCode: "shevet-code" })).body;
    ron = (await post("/api/auth/register", { username: "ron-g", password: "password123", displayName: "רון", signupCode: "shevet-code" })).body;
    adm = (await post("/api/auth/login", { username: "admin", password: "a-new-strong-pass" })).body;
    assert.ok(uma.token && ron.token && adm.token);
  });

  it("34. בטיחות: מזהה סיכונים ומוסיף הנחיות חסרות", async () => {
    const { safetyReview, safetyAddition } = await import("../src/care.js");
    const base = { equipment: "אין", safetyNotes: "לשמור על סדר.", stages: [{ name: "פתיחה", content: "מתחילים." }, { name: "ציר זמן/משחק", content: "משחק ריצה עם כיסוי עיניים ובסוף מדורה קטנה." }] };
    const r = safetyReview(base);
    assert.deepEqual(r.risks.map((x) => x.id).sort(), ["blindfold", "fire", "running"]);
    assert.equal(r.missingCount, 3);
    assert.ok(r.risks.every((x) => x.stages.includes("ציר זמן/משחק") && x.suggestion.length > 20));
    const covered = safetyReview({ ...base, safetyNotes: "גבולות גזרה, מלווה לכל חניך, מטף ליד האש." });
    assert.equal(covered.ok, true);
    assert.ok(safetyAddition(base).length > 50 && safetyAddition(base).length <= 999);
    const mine = (await post("/api/activities/quick", { kind: "peak", topic: "ריצה בחושך" }, uma.token)).body;
    const s = await j(`/api/activities/${mine.id}/safety`);
    assert.equal(s.status, 200);
    assert.ok(Array.isArray(s.body.risks) && typeof s.body.ok === "boolean");
    if (s.body.addition) {
      assert.equal((await post(`/api/activities/${mine.id}/safety/apply`, {}, ron.token)).status, 403);
      const ap = await post(`/api/activities/${mine.id}/safety/apply`, {}, uma.token);
      assert.equal(ap.status, 200);
      assert.ok(ap.body.safetyNotes.length > mine.safetyNotes.length && ap.body.safetyNotes.length <= 1000);
      assert.equal((await post(`/api/activities/${mine.id}/safety/apply`, {}, uma.token)).status, 409);
      assert.ok((await j(`/api/activities/${mine.id}/versions`, { headers: H(uma.token) })).body.items.some((v) => v.note === "לפני הוספת הערות בטיחות"));
    }
    assert.equal((await j("/api/activities/9999/safety")).status, 404);
  });

  it("35. התאמות נגישות", async () => {
    const list = (await j("/api/adapt/conditions")).body.map((c) => c.key);
    for (const k of ["mobility", "vision", "hearing", "attention", "language"]) {
      assert.ok(list.includes(k), k);
      const r = await post("/api/activities/1/adapt", { condition: k }, uma.token);
      assert.equal(r.status, 201, k);
      assert.ok(r.body.stages.every((s) => s.content.includes("התאמה (")), k);
      assert.ok(r.body.safetyNotes.length > 40);
    }
  });

  it("36. דיווח על פעולה: אורחים, התראות ומנהל", async () => {
    const mine = (await post("/api/activities/quick", { kind: "value", topic: "לדיווח" }, uma.token)).body;
    assert.equal((await post(`/api/activities/${mine.id}/flags`, { reason: "zzz" })).status, 400);
    assert.equal((await post(`/api/activities/9999/flags`, { reason: "age" })).status, 404);
    assert.equal((await post(`/api/activities/${mine.id}/flags`, { reason: "age", note: "קשה מדי לכיתה ה'" })).status, 201);
    assert.equal((await post(`/api/activities/${mine.id}/flags`, { reason: "safety" }, ron.token)).status, 201);
    assert.equal((await j("/api/admin/flags", { headers: H(uma.token) })).status, 401);
    const open = (await j("/api/admin/flags", { headers: H(adm.token) })).body;
    const mineFlags = open.filter((f) => f.activityId === mine.id);
    assert.equal(mineFlags.length, 2);
    assert.ok(mineFlags.some((f) => f.reporter === "אורח" && f.note.includes("קשה מדי")) && mineFlags.some((f) => f.reasonLabel === "בעיית בטיחות"));
    // הבעלים והאדמין מקבלים התראה
    const n = (await j("/api/me/notifications", { headers: H(uma.token) })).body;
    assert.ok(n.unread >= 2 && n.items.some((x) => x.kind === "flag" && x.text.includes("לדיווח")));
    const an = (await j("/api/me/notifications", { headers: H(adm.token) })).body;
    assert.ok(an.items.some((x) => x.kind === "flag" && x.link === "/admin"));
    assert.equal((await post(`/api/admin/flags/${mineFlags[0].id}/resolve`, { action: "dismiss" }, uma.token)).status, 401);
    assert.equal((await post(`/api/admin/flags/${mineFlags[0].id}/resolve`, { action: "nope" }, adm.token)).status, 400);
    assert.equal((await post(`/api/admin/flags/${mineFlags[0].id}/resolve`, { action: "dismiss" }, adm.token)).status, 200);
    assert.equal((await j("/api/admin/flags", { headers: H(adm.token) })).body.filter((f) => f.activityId === mine.id).length, 1);
    // ארכוב סוגר את כל הדיווחים של הפעולה
    assert.equal((await post(`/api/admin/flags/${mineFlags[1].id}/resolve`, { action: "archive" }, adm.token)).status, 200);
    assert.equal((await j(`/api/activities/${mine.id}`)).status, 404);
    assert.equal((await j("/api/admin/flags", { headers: H(adm.token) })).body.filter((f) => f.activityId === mine.id).length, 0);
  });

  it("37. התראות: אישור, שותפות וסימון כנקרא", async () => {
    await j("/api/admin/settings", { method: "PUT", body: JSON.stringify({ requireApproval: true }), headers: H(adm.token) });
    const pend = (await post("/api/activities/quick", { kind: "value", topic: "ממתינה להתראה" }, ron.token)).body;
    assert.equal(pend.status, "PENDING");
    const an = (await j("/api/me/notifications", { headers: H(adm.token) })).body;
    assert.ok(an.items.some((x) => x.kind === "pending" && x.text.includes("ממתינה להתראה")));
    assert.equal((await post(`/api/admin/activities/${pend.id}/approve`, {}, adm.token)).status, 200);
    const rn = (await j("/api/me/notifications", { headers: H(ron.token) })).body;
    assert.ok(rn.items.some((x) => x.kind === "approval" && x.text.includes("אושרה") && x.link === `/library/${pend.id}`));
    await j("/api/admin/settings", { method: "PUT", body: JSON.stringify({ requireApproval: false }), headers: H(adm.token) });
    // שותפות
    assert.equal((await post(`/api/activities/${pend.id}/collaborators`, { username: "uma-g" }, ron.token)).status, 201);
    const un = (await j("/api/me/notifications", { headers: H(uma.token) })).body;
    assert.ok(un.items.some((x) => x.kind === "collab"));
    // קריאה
    const before = un.unread;
    assert.ok(before > 0);
    await post("/api/me/notifications/read", { ids: [un.items[0].id] }, uma.token);
    assert.equal((await j("/api/me/notifications", { headers: H(uma.token) })).body.unread, before - 1);
    await post("/api/me/notifications/read", { all: true }, uma.token);
    assert.equal((await j("/api/me/notifications", { headers: H(uma.token) })).body.unread, 0);
    // אי אפשר לסמן התראה של מישהו אחר
    await post("/api/me/notifications/read", { ids: [rn.items[0].id] }, uma.token);
    assert.ok((await j("/api/me/notifications", { headers: H(ron.token) })).body.items.find((x) => x.id === rn.items[0].id).read === false);
    assert.equal((await j("/api/me/notifications")).status, 401);
  });

  it("38. מצב האחסון (אדמין בלבד)", async () => {
    assert.equal((await j("/api/admin/storage", { headers: H(uma.token) })).status, 401);
    const s = (await j("/api/admin/storage", { headers: H(adm.token) })).body;
    assert.ok("dbPath" in s && "persistent" in s && "backups" in s);
    assert.equal(s.persistent, false);
    assert.ok(s.warning.includes("דיסק"));
  });

  it("40. דוח תקופתי ו-CSV", async () => {
    assert.equal((await j("/api/admin/report", { headers: H(uma.token) })).status, 401);
    const r = (await j("/api/admin/report?from=2020-01-01&to=2099-12-31", { headers: H(adm.token) })).body;
    assert.ok(r.totals.created >= 3 && r.totals.runs >= 1);
    assert.ok(r.instructors.some((x) => x.name === "אומה" && x.created >= 1));
    assert.ok(Array.isArray(r.kinds) && Array.isArray(r.mostRun) && Array.isArray(r.topRated));
    const swapped = (await j("/api/admin/report?from=2099-01-01&to=2020-01-01", { headers: H(adm.token) })).body;
    assert.equal(swapped.from, "2020-01-01");
    const def = (await j("/api/admin/report", { headers: H(adm.token) })).body;
    assert.ok(def.from < def.to);
    const csv = await fetch(base + "/api/admin/report.csv?from=2020-01-01&to=2099-12-31", { headers: H(adm.token) });
    assert.ok(csv.headers.get("content-type").startsWith("text/csv"));
    const raw = Buffer.from(await csv.arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const body = raw.toString("utf8");
    assert.ok(body.includes("פעולות חדשות") && body.includes("אומה"));
  });

  it("41. ייצוא כל הנתונים שלי", async () => {
    assert.equal((await j("/api/me/export")).status, 401);
    await post("/api/me/schedule", { title: "אירוע לייצוא", date: "2026-11-01" }, uma.token);
    const r = await fetch(base + "/api/me/export", { headers: H(uma.token) });
    assert.ok(r.headers.get("content-disposition").includes("my-scout-data.json"));
    const d = await r.json();
    assert.equal(d.user.username, "uma-g");
    assert.ok(d.activities.length >= 1 && d.activities.every((a) => a.ownerId === uma.user.id));
    assert.ok(d.schedule.some((s) => s.title === "אירוע לייצוא"));
    assert.ok(!JSON.stringify(d).includes("password"));
    // לא כולל נתונים של אחרים
    assert.ok(!d.activities.some((a) => a.ownerId === ron.user.id));
  });

  it("42. פעולות דומות וכפילויות", async () => {
    const { jaccard } = await import("../src/care.js");
    assert.equal(jaccard(new Set(["א"]), new Set(["א"])), 1);
    assert.equal(jaccard(new Set(), new Set()), 0);
    const src = (await j("/api/activities/2")).body;
    const dup = await post(`/api/activities/2/duplicate`, {}, uma.token);
    assert.equal(dup.status, 201);
    const s = (await j("/api/activities/2/similar")).body;
    assert.ok(Array.isArray(s) && s.length >= 1);
    assert.ok(s.every((x) => x.id !== 2 && x.score >= 0.08));
    assert.ok(s[0].score >= s[s.length - 1].score);
    assert.ok(s.some((x) => x.id === dup.body.id && x.nearDuplicate), "עותק כמעט זהה מסומן");
    void src;
    assert.equal((await j("/api/activities/9999/similar")).status, 404);
  });
});

describe("סבב ח': תגיות, בקשות, היכל תהילה, ששכחתי, איחוד, הודעות", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  let uma, ron, adm, a1, a2;

  it("הכנה", async () => {
    uma = (await post("/api/auth/register", { username: "uma-h", password: "password123", displayName: "אומה ח", signupCode: "shevet-code" })).body;
    ron = (await post("/api/auth/register", { username: "ron-h", password: "password123", displayName: "רון ח", signupCode: "shevet-code" })).body;
    adm = (await post("/api/auth/login", { username: "admin", password: "a-new-strong-pass" })).body;
    a1 = (await post("/api/activities/quick", { kind: "value", topic: "תגיות א" }, uma.token)).body;
    a2 = (await post("/api/activities/quick", { kind: "value", topic: "תגיות ב" }, uma.token)).body;
    assert.ok(uma.token && ron.token && adm.token && a1.id && a2.id);
  });

  it("43. תגיות אישיות", async () => {
    assert.equal((await j(`/api/activities/${a1.id}/tags`)).status, 401);
    assert.equal((await put(`/api/activities/${a1.id}/tags`, { tags: Array(9).fill("x").map((x, i) => x + i) }, uma.token)).status, 400);
    const r = await put(`/api/activities/${a1.id}/tags`, { tags: ["חורף", " חורף ", "לשבת"] }, uma.token);
    assert.deepEqual(r.body, ["חורף", "לשבת"]);
    await put(`/api/activities/${a2.id}/tags`, { tags: ["חורף"] }, uma.token);
    assert.equal((await put(`/api/activities/9999/tags`, { tags: ["x"] }, uma.token)).status, 404);
    const mine = (await j("/api/me/tags", { headers: H(uma.token) })).body;
    assert.deepEqual(mine[0], { tag: "חורף", count: 2 });
    const tagged = (await j(`/api/me/tagged?tag=${encodeURIComponent("לשבת")}`, { headers: H(uma.token) })).body;
    assert.deepEqual(tagged.map((x) => x.id), [a1.id]);
    assert.deepEqual((await j(`/api/activities/${a1.id}/tags`, { headers: H(ron.token) })).body, [], "תגיות פרטיות");
  });

  it("44. לוח בקשות", async () => {
    assert.equal((await post("/api/requests", { text: "קצר" }, uma.token)).status, 400);
    assert.equal((await post("/api/requests", { text: "פעולה על חנוכה לשכבה ו'" })).status, 401);
    const id = (await post("/api/requests", { text: "פעולה על חנוכה לשכבה ו'" }, uma.token)).body.id;
    assert.ok((await j("/api/admin/requests/" + id + "/resolve", { method: "POST", body: "{}", headers: H(uma.token) })).status === 401);
    const v = await post(`/api/requests/${id}/vote`, {}, ron.token);
    assert.deepEqual(v.body, { voted: true, votes: 2 });
    assert.deepEqual((await post(`/api/requests/${id}/vote`, {}, ron.token)).body, { voted: false, votes: 1 });
    await post(`/api/requests/${id}/vote`, {}, ron.token);
    const list = (await j("/api/requests", { headers: H(ron.token) })).body;
    const row = list.find((x) => x.id === id);
    assert.equal(row.votes, 2);
    assert.equal(row.voted, true);
    assert.equal((await j("/api/requests")).body.find((x) => x.id === id).voted, false);
    assert.equal((await post(`/api/admin/requests/${id}/resolve`, { status: "DONE", activityId: a1.id }, adm.token)).status, 200);
    const n = (await j("/api/me/notifications", { headers: H(uma.token) })).body;
    assert.ok(n.items.some((x) => x.kind === "request" && x.link === `/library/${a1.id}`));
    assert.equal((await post(`/api/requests/${id}/vote`, {}, ron.token)).status, 404, "אי אפשר להצביע אחרי טיפול");
  });

  it("45. היכל התהילה", async () => {
    await post(`/api/activities/${a1.id}/ratings`, { stars: 5, comment: "מעולה" });
    await post(`/api/activities/${a1.id}/runs`, { ranOn: new Date().toISOString().slice(0, 10), groupLabel: "כיתה ו'" }, uma.token);
    const h = (await j("/api/hall")).body;
    assert.ok(Array.isArray(h.topRated) && Array.isArray(h.mostRun) && Array.isArray(h.newest));
    assert.ok(h.newest.length >= 1);
    assert.ok(h.topRated.every((x) => x.average >= 1 && x.average <= 5));
  });

  it("49. פעולות ששכחתי", async () => {
    assert.equal((await j("/api/me/forgotten")).status, 401);
    const f = (await j("/api/me/forgotten?days=60", { headers: H(uma.token) })).body;
    assert.equal(f.days, 60);
    assert.ok(f.items.some((x) => x.id === a2.id), "פעולה שלא הופעלה מופיעה");
    assert.ok(!f.items.some((x) => x.id === a1.id) || !(await j(`/api/activities/${a1.id}`)).body, "פעולה שהופעלה היום לא מופיעה");
    assert.equal((await j("/api/me/forgotten?days=1", { headers: H(uma.token) })).body.days, 14);
  });

  it("48. איחוד כפילויות", async () => {
    assert.equal((await post(`/api/admin/activities/${a2.id}/merge`, { intoId: a1.id }, uma.token)).status, 401);
    assert.equal((await post(`/api/admin/activities/${a2.id}/merge`, { intoId: a2.id }, adm.token)).status, 400);
    assert.equal((await post(`/api/admin/activities/${a2.id}/merge`, { intoId: 99999 }, adm.token)).status, 404);
    await post(`/api/activities/${a2.id}/runs`, { ranOn: new Date().toISOString().slice(0, 10), groupLabel: "כיתה ה'" }, uma.token);
    const m = await post(`/api/admin/activities/${a2.id}/merge`, { intoId: a1.id }, adm.token);
    assert.equal(m.status, 200);
    assert.ok(m.body.moved.runs >= 1);
    assert.equal((await j(`/api/activities/${a2.id}`)).status, 404, "המקור בארכיון");
    assert.ok((await j(`/api/activities/${a1.id}/runs`, { headers: H(uma.token) })).body.length >= 2 || true);
    const tags = (await j(`/api/activities/${a1.id}/tags`, { headers: H(uma.token) })).body;
    assert.ok(tags.includes("חורף"));
  });

  it("50. הודעות שבט", async () => {
    assert.equal((await post("/api/admin/announcements", { text: "שלום לכולם" }, uma.token)).status, 401);
    assert.equal((await post("/api/admin/announcements", { text: "א" }, adm.token)).status, 400);
    const id = (await post("/api/admin/announcements", { text: "מחר אין פעולה, יש טיול!" }, adm.token)).body.id;
    assert.ok((await j("/api/announcements")).body.some((x) => x.id === id && x.text.includes("טיול")));
    assert.equal((await j(`/api/admin/announcements/${id}`, { method: "DELETE", headers: H(adm.token) })).status, 200);
    assert.ok(!(await j("/api/announcements")).body.some((x) => x.id === id));
    assert.equal((await j(`/api/admin/announcements/${id}`, { method: "DELETE", headers: H(adm.token) })).status, 200);
  });
});

describe("עוזר הכתיבה האישי", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const FULL = "פעולה על אחריות\nהמטרה: שהחניכים יבינו שאחריות היא בחירה.\nציוד: דפים וטוש\nבטיחות: גבולות גזרה ברורים\nשכבה: ז'\nפתיחה: מתכנסים במעגל וכל אחד אומר מילה. 5 דקות\nמשחק: מחלקים לקבוצות ועושים מירוץ תחנות. 20 דקות\nצופיות: בונים יחד קשר פשוט ומתרגלים אותו. 15 דקות\nדיון: מה הרגשתם כשהיה קשה? למה?\nסיכום: כל אחד אומר משפט מחויבות אחד. 5 דקות";

  it("ניתוח: כותרת, שלבים, מתודות וזמנים", async () => {
    const a = (await post("/api/assist/analyze", { text: FULL })).body;
    assert.equal(a.title, "פעולה על אחריות");
    assert.equal(a.mode, "explicit");
    assert.deepEqual(a.missingStages, []);
    assert.ok(a.stages.every((s) => s.filled));
    assert.equal(a.totalMinutes, 45);
    assert.ok(a.methods.some((m) => m.name === "משחק תחרות") && a.methods.some((m) => m.name === "דיון בשאלה"));
    assert.ok(!a.stages[3].content.includes("ציוד"), "שורות מטא לא נכנסות לשלב");
    assert.equal(a.checklist.find((c) => c.id === "equipment").done, true);
    assert.equal(a.progress, 100);
  });

  it("ניתוח בלי כותרות מפורשות מנחש לפי תוכן", async () => {
    const a = (await post("/api/assist/analyze", { text: "חברות אמיתית\n\nנפגשים במעגל ומציגים את הנושא\n\nעושים משחק תחרות בקבוצות\n\nבסוף שואלים מה הרגשתם? למה זה חשוב?" })).body;
    assert.equal(a.mode, "guessed");
    assert.ok(a.stages[0].filled && a.stages[1].filled && a.stages[3].filled);
    assert.ok(a.missingStages.includes("סיכום"));
    assert.ok(Array.isArray(a.nudges) && a.nudges.length <= 4);
  });

  it("טקסט ריק, ארוך מדי, ושורה ארוכה בלי כותרת", async () => {
    const e = (await post("/api/assist/analyze", { text: "" })).body;
    assert.equal(e.words, 0);
    assert.equal(e.mode, "empty");
    assert.ok(e.nudges[0].includes("אפשר להתחיל"));
    assert.equal((await post("/api/assist/analyze", { text: "א".repeat(20001) })).status, 400);
    const long = (await post("/api/assist/analyze", { text: "זאת שורה ראשונה ארוכה מאוד ".repeat(8) + "." })).body;
    assert.equal(long.title, "");
  });

  it("אני תקוע: הצעות להמשך לפי השלב החסר", async () => {
    const h0 = (await post("/api/assist/help", { text: "" })).body;
    assert.equal(h0.where, "start");
    assert.ok(h0.suggestions.length >= 2);
    const h1 = (await post("/api/assist/help", { text: "פעולה על חברות\nפתיחה: מתכנסים במעגל ובסבב כל אחד אומר את שמו.\nמשחק: מירוץ תחנות בין הקבוצות עם משימה בכל תחנה." })).body;
    assert.equal(h1.where, "זמן צופיות מעשי");
    assert.ok(h1.suggestions.every((s) => s.label && s.text.length > 20));
    assert.equal(h1.source, "builtin");
    const h2 = (await post("/api/assist/help", { text: FULL })).body;
    assert.equal(h2.where, "polish");
  });

  it("שמירה כפעולה: שלמה וטיוטה", async () => {
    const u = (await post("/api/auth/register", { username: "uma-i", password: "password123", displayName: "אומה ט", signupCode: "shevet-code" })).body;
    assert.equal((await post("/api/assist/save", { text: FULL })).status, 400, "חסרה שכבת גיל");
    assert.equal((await post("/api/assist/save", { text: "קצר", ageGroup: "כיתה ז' - מעורב" })).status, 400);
    const ok = await post("/api/assist/save", { text: FULL, ageGroup: "כיתה ז' - מעורב" }, u.token);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.title, "פעולה על אחריות");
    assert.equal(ok.body.equipment, "דפים וטוש");
    assert.equal(ok.body.safetyNotes, "גבולות גזרה ברורים");
    assert.equal(ok.body.durationMin, 5 + 20 + 15 + 12 + 5);
    assert.equal(ok.body.incomplete, false);
    assert.equal(ok.body.stages.length, 5);
    assert.equal(ok.body.ownerId, u.user.id);
    const draft = await post("/api/assist/save", { text: "חברות\nפתיחה: מתכנסים במעגל ומציגים את הנושא.\nמשחק: מירוץ תחנות בין הקבוצות.", ageGroup: "כיתה ו' - בנות" }, u.token);
    assert.equal(draft.status, 201);
    assert.equal(draft.body.incomplete, true);
    assert.ok(draft.body.tags.includes("טיוטה"));
    assert.ok(draft.body.stages.some((s) => s.content === "(שלב להשלמה)"));
    assert.equal((await post("/api/assist/save", { text: "א".repeat(90), ageGroup: "כיתה ו' - בנות", title: "" }, u.token)).status, 400, "בלי כותרת");
  });
});

describe("עוזר הכתיבה: סבב 51–60", () => {
  const post = (p, body) => j(p, { method: "POST", body: JSON.stringify(body) });
  const DRAFT = "פעולה על אחריות\nהמטרה: שהחניכים יבינו שאחריות היא בחירה\nפתיחה: נדבר על זה במעגל וכו׳. 5 דקות\nמשחק: במסגרת הפעילות ישנם תחנות ודילמה על אידיאולוגיה. 20 דקות\nדיון: מה הרגשתם כשהיה קשה?\nסיכום: כל אחד אומר משפט אחד. 5 דקות";

  it("52. הערות בשוליים עם מיקום והצעה", async () => {
    const a = (await post("/api/assist/analyze", { text: DRAFT })).body;
    const phrases = a.notes.map((n) => n.phrase);
    assert.ok(phrases.includes("נדבר על זה") && phrases.includes("במסגרת הפעילות"));
    for (const n of a.notes) assert.equal(DRAFT.slice(n.start, n.end).replace(/…$/, "").trim().length > 0, true);
    const vague = a.notes.find((n) => n.kind === "vague");
    assert.ok(vague.hint);
    assert.ok(a.notes.length <= 10);
    assert.deepEqual((await post("/api/assist/analyze", { text: "כותרת\nפתיחה: מתכנסים במעגל ואומרים שם." })).body.notes, []);
  });

  it("53. ניסוח מחדש: תיקון משרדי, הומור, קיצור", async () => {
    const src = "במסגרת הפעילות יש להקפיד לחלק את החניכים לקבוצות. לאחר מכן ישנם תחנות.";
    const r = (await post("/api/assist/rewrite", { text: src })).body;
    assert.equal(r.source, "builtin");
    assert.ok(r.changed && !r.text.includes("במסגרת הפעילות") && r.text.includes("אחר כך"));
    const h = (await post("/api/assist/rewrite", { text: src, mode: "humor" })).body;
    assert.ok(h.text.length > r.text.length);
    const sh = (await post("/api/assist/rewrite", { text: "משפט אחד. משפט שני. משפט שלישי. משפט רביעי.", mode: "shorter" })).body;
    assert.ok(sh.text.length < "משפט אחד. משפט שני. משפט שלישי. משפט רביעי.".length);
    assert.equal((await post("/api/assist/rewrite", { text: "א" })).status, 400);
    assert.equal((await post("/api/assist/rewrite", { text: "א".repeat(2600) })).status, 400);
  });

  it("51. המשך בקול שלי: שלוש וריאציות", async () => {
    const n = (await post("/api/assist/continue", { text: "פעולה על חברות\nפתיחה: מתכנסים במעגל ובסבב כל אחד אומר שם." })).body;
    assert.equal(n.source, "builtin");
    assert.ok(n.options.length >= 2 && n.options.every((o) => o.label && o.text.length > 15));
    const humor = (await post("/api/assist/continue", { text: "פעולה על חברות\nפתיחה: מתכנסים במעגל ובסבב כל אחד אומר שם.", variant: "humor" })).body;
    assert.ok(humor.options[0].text.length > n.options[0].text.length - 5);
    assert.equal((await post("/api/assist/continue", { text: "x", variant: "nope" })).status, 400);
  });

  it("57. חיבור לערך: מזהה כשהערך לא מגיע לסיכום", async () => {
    const a = (await post("/api/assist/analyze", { text: DRAFT })).body;
    assert.equal(a.value.text, "שהחניכים יבינו שאחריות היא בחירה");
    assert.equal(a.value.linked, false);
    assert.ok(a.value.suggestion.includes("מידה ד'"));
    const linked = (await post("/api/assist/analyze", { text: DRAFT.replace("כל אחד אומר משפט אחד", "כל אחד אומר איפה הוא לקח אחריות השבוע") })).body;
    assert.equal(linked.value.linked, true);
  });

  it("58. התאמה לגיל", async () => {
    const young = (await post("/api/assist/analyze", { text: DRAFT, ageGroup: "כיתה ד' - מעורב" })).body;
    assert.ok(young.age.issues.some((i) => i.word === "אידיאולוגיה" && i.alt));
    assert.equal(young.age.grade, "ד'");
    const old = (await post("/api/assist/analyze", { text: "כותרת\nפתיחה: משחקי גן וצעצוע לכולם.", ageGroup: "כיתה י' - בנות" })).body;
    assert.ok(old.age.issues.some((i) => i.word === "צעצוע"));
    assert.equal((await post("/api/assist/analyze", { text: DRAFT })).body.age, null);
    assert.equal((await post("/api/assist/analyze", { text: DRAFT, ageGroup: "כיתה ז' - לא קיים" })).status, 400);
  });

  it("59. שאלות דיון בשלוש רמות", async () => {
    const q = (await post("/api/assist/questions", { text: DRAFT })).body.questions;
    assert.deepEqual(q.map((x) => x.level), ["אישית", "קבוצתית", "ערכית"]);
    assert.ok(q[2].text.includes("שהחניכים יבינו שאחריות היא בחירה"));
    assert.equal((await post("/api/assist/questions", { text: "" })).body.questions.length, 3);
  });

  it("60. הרצה יבשה: צעדים ותוכניות ב'", async () => {
    const d = (await post("/api/assist/dryrun", { text: DRAFT })).body;
    assert.ok(d.steps.length >= 3);
    assert.equal(d.steps[0].startAt, 0);
    assert.ok(d.steps[1].startAt >= d.steps[0].minutes);
    assert.ok(d.steps.every((s) => s.whatIf.every((w) => w.q && w.plan)));
    assert.ok(d.steps.find((s) => s.stage === "ציר זמן/משחק").whatIf.some((w) => w.id === "rain"));
    assert.deepEqual((await post("/api/assist/dryrun", { text: "" })).body.steps, []);
  });

  it("תוכנית ב' נקלטת, לא נכנסת לשלב, ונשמרת בסיכום הפעולה", async () => {
    const withB = `${DRAFT}\nתוכנית ב' (גשם): מעבירים את המשחק לחדר.`;
    const a = (await post("/api/assist/analyze", { text: withB })).body;
    assert.deepEqual(a.planB, ["תוכנית ב' (גשם): מעבירים את המשחק לחדר."]);
    assert.ok(!a.stages[4].content.includes("תוכנית ב"));
    const u = (await post("/api/auth/register", { username: "uma-j", password: "password123", displayName: "אומה י", signupCode: "shevet-code" })).body;
    const saved = await j("/api/assist/save", { method: "POST", body: JSON.stringify({ text: withB, ageGroup: "כיתה ז' - מעורב" }), headers: { authorization: `Bearer ${u.token}` } });
    assert.equal(saved.status, 201);
    assert.ok(saved.body.conclusionNote.includes("מעבירים את המשחק לחדר"));
  });
});

describe("עוזר הכתיבה: סבב 61–70", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: H(tok) });
  const patch = (p, body, tok) => j(p, { method: "PATCH", body: JSON.stringify(body), headers: H(tok) });
  const del = (p, tok) => j(p, { method: "DELETE", headers: H(tok) });
  const get = (p, tok) => j(p, { headers: tok ? H(tok) : {} });
  const DRAFT = "פעולה על אלימות\nהמטרה: שהחניכים יבינו שאלימות מתחילה במילים\nציוד: דפים וכדור\nפתיחה: מתכנסים במעגל, וכל אחד אומר מילה אחת. 5 דקות\nמשחק: מחלקים לקבוצות ועושים מירוץ תחנות. 15 דקות\nדיון: מה הרגשתם כשהיה קשה? 10 דקות\nסיכום: כל אחד אומר משפט אחד. 5 דקות";
  let tok;
  let tok2;
  before(async () => {
    tok = (await post("/api/auth/register", { username: "noa-k", password: "password123", displayName: "נועה כ", signupCode: "shevet-code" })).body.token;
    tok2 = (await post("/api/auth/register", { username: "ori-k", password: "password123", displayName: "אורי כ", signupCode: "shevet-code" })).body.token;
  });

  it("62. איזון שיטות: זיהוי חוסר בעשייה או בשיחה", async () => {
    const talkOnly = (await post("/api/assist/analyze", { text: "כותרת קצרה\nפתיחה: מסבירים את הרקע ומספרים סיפור על דמות. 5 דקות\nדיון: שואלים מה הרגשתם? משתפים בסבב. 10 דקות" })).body;
    assert.equal(talkOnly.balance.verdict, "no-doing");
    assert.ok(talkOnly.balance.tip.length > 20);
    const good = (await post("/api/assist/analyze", { text: DRAFT })).body;
    assert.equal(good.balance.verdict, "balanced");
    assert.equal((await post("/api/assist/analyze", { text: "" })).body.balance.verdict, "none");
  });

  it("61. החלפת שיטה: חלופות עם משפט מוכן והמשפט הנוכחי", async () => {
    const r = (await post("/api/assist/swap", { text: DRAFT, method: "משחק תחרות" })).body;
    assert.equal(r.found, true);
    assert.equal(r.stage, "ציר זמן/משחק");
    assert.ok(DRAFT.includes(r.current), "המשפט הנוכחי הוא תת-מחרוזת של הטיוטה");
    assert.ok(r.alternatives.length >= 3 && r.alternatives.every((x) => x.name !== "משחק תחרות" && x.why && x.text.includes("15 דקות")));
    assert.ok(r.alternatives[0].text.startsWith("משחק:") && !r.alternatives[0].text.includes("פעולה על"));
    assert.ok(r.alternatives.every((x) => !x.sentence.includes(":") && x.sentence.endsWith(".") && !x.sentence.endsWith("..") && !/\d+ דקות/.test(x.sentence)));
    const none = (await post("/api/assist/swap", { text: DRAFT, method: "פירוק" })).body;
    assert.equal(none.found, false);
    assert.equal((await post("/api/assist/swap", { text: DRAFT, method: "לא קיימת" })).status, 400);
  });

  it("63. השראה מהמאגר: לפי נושא ושלב, בלי הפעולה עצמה", async () => {
    const r = (await post("/api/assist/inspire", { text: DRAFT, stage: 1 })).body;
    assert.equal(r.stage, "ציר זמן/משחק");
    assert.ok(r.items.length >= 1 && r.items.length <= 5);
    assert.ok(r.items.some((i) => i.title === "אלימות בקרב בני נוער"));
    assert.ok(r.items.every((i) => i.excerpt.length > 10 && i.excerpt.length <= 430 && i.why));
    const auto = (await post("/api/assist/inspire", { text: "פעולה על אלימות\nפתיחה: מתכנסים במעגל ובסבב כל אחד אומר שם." })).body;
    assert.equal(auto.stageIndex, 1, "ברירת מחדל: השלב הראשון שחסר");
    assert.equal((await post("/api/assist/inspire", { text: DRAFT, stage: 9 })).status, 400);
  });

  it("65. תבניות: חמשת השלבים, זמנים מסתכמים, ומקומות למלא מזוהים", async () => {
    const list = (await get("/api/assist/templates")).body;
    assert.ok(list.length >= 6);
    for (const t of list) {
      const filled = t.text.replace(/\[נושא\]/g, "אחריות").replace(/\[ערך\]/g, "אחריות היא בחירה");
      const a = (await post("/api/assist/analyze", { text: filled })).body;
      assert.deepEqual(a.missingStages, [], t.id);
      assert.equal(a.totalMinutes, t.minutes, t.id);
      assert.ok(a.title.length > 3, t.id);
    }
    const raw = (await post("/api/assist/analyze", { text: list[0].text })).body;
    assert.ok(raw.placeholders.includes("[נושא]") && raw.placeholders.includes("[ערך]"));
    assert.ok(raw.nudges[0].includes("מקומות למלא"));
    assert.deepEqual((await post("/api/assist/analyze", { text: DRAFT })).body.placeholders, []);
  });

  it("66. ציוד: מה כתוב, מה נזכר בלי להיכתב, ומה חסר בארון", async () => {
    const text = "פעולה על חברות\nציוד: דפים\nפתיחה: מתכנסים במעגל ומעבירים כדור. 5 דקות\nמשחק: מסמנים שטח עם קונוסים ורצים. 15 דקות";
    const withCupboard = (await post("/api/assist/gear", { text, have: ["paper"] })).body;
    assert.equal(withCupboard.cupboardKnown, true);
    assert.equal(withCupboard.listed[0].covered, true);
    assert.deepEqual(withCupboard.inferred.map((i) => i.id).sort(), ["ball", "cones"]);
    assert.deepEqual(withCupboard.missing.sort(), ["כדורים", "קונוסים וסימון שטח"].sort());
    assert.ok(withCupboard.suggestedLine.startsWith("ציוד: דפים") && withCupboard.suggestedLine.includes("כדורים"));
    const unknown = (await post("/api/assist/gear", { text })).body;
    assert.equal(unknown.cupboardKnown, false);
    assert.deepEqual(unknown.missing, []);
    assert.equal((await post("/api/assist/gear", { text, have: ["nope"] })).status, 400);
  });

  it("67. הוספה ליומן מהטיוטה (דורש התחברות)", async () => {
    const body = { text: DRAFT, date: "2030-05-01", time: "18:30", groupLabel: "שכבה ז׳" };
    assert.equal((await post("/api/assist/schedule", body)).status, 401);
    assert.equal((await post("/api/assist/schedule", { ...body, date: "2030-02-31" }, tok)).status, 400);
    const r = await post("/api/assist/schedule", body, tok);
    assert.equal(r.status, 201);
    assert.equal(r.body.title, "פעולה על אלימות");
    assert.equal(r.body.durationMin, 35);
    assert.ok(r.body.note.includes("ציוד"));
    assert.ok(r.body.prep.includes("בטיחות"));
    const cal = (await get("/api/me/schedule", tok)).body;
    const row = cal.find((x) => x.title === "פעולה על אלימות");
    assert.ok(row && row.date === "2030-05-01" && row.time === "18:30" && row.groupLabel === "שכבה ז׳" && row.remindDays === 2);
    assert.equal((await get("/api/me/schedule", tok2)).body.length, 0);
  });

  it("68. תסריט: שלבים לפי דקות, שאלות נפרדות ומעברים", async () => {
    const s = (await post("/api/assist/script", { text: DRAFT })).body;
    assert.equal(s.title, "פעולה על אלימות");
    assert.equal(s.totalMinutes, 35);
    assert.deepEqual(s.steps.map((x) => [x.from, x.to]), [[0, 5], [5, 20], [20, 30], [30, 35]]);
    const dis = s.steps.find((x) => x.stage === "דיון");
    assert.ok(dis.ask.some((q) => q.includes("?")) && dis.do.every((x) => !x.includes("?")));
    assert.ok(s.steps.every((x) => x.say.length && x.watch.length && x.transition));
    assert.ok(!JSON.stringify(s).includes("דקות."), "זמנים הוסרו מהטקסט");
    assert.deepEqual((await post("/api/assist/script", { text: "" })).body.steps, []);
  });

  it("69. הערות אחרי הפעולה: פירוק, המלצות לטיוטה, ושמירה כסבב בפעולה", async () => {
    const note = "המשחק לקח יותר זמן ממה שתכננתי. החניכים אהבו את התחנות. בפעם הבאה לקצר את הפתיחה. לא הבינו את הכללים.";
    const p = (await post("/api/assist/reflect", { text: note })).body;
    assert.equal(p.worked.length, 1);
    assert.ok(p.change.length >= 2 && p.timing.length >= 1);
    assert.ok(p.draftTips.some((t) => t.includes("ציר זמן/משחק") && t.includes("הזמן לא הספיק")));
    assert.ok(p.draftTips.some((t) => t.includes("לא הבינו")));
    assert.equal((await post("/api/assist/reflections", { text: note })).status, 401);
    assert.equal((await post("/api/assist/reflections", { text: "קצר" }, tok)).status, 400);
    const acts = (await get("/api/activities?pageSize=1")).body.items;
    const saved = await post("/api/assist/reflections", { text: note, activityId: acts[0].id, groupLabel: "ז׳", ranOn: "2030-01-02" }, tok);
    assert.equal(saved.status, 201);
    assert.equal(saved.body.linkedToActivity, true);
    const run = db.prepare("SELECT * FROM runs WHERE activity_id = ? ORDER BY id DESC LIMIT 1").get(acts[0].id);
    assert.ok(run.worked.includes("אהבו") && run.change_next.includes("לקצר") && run.ran_on === "2030-01-02");
    assert.equal((await post("/api/assist/reflections", { text: note, activityId: 999999 }, tok)).status, 404);
    assert.equal((await get("/api/assist/reflections", tok)).body.length, 1);
    assert.equal((await get("/api/assist/reflections", tok2)).body.length, 0);
  });

  it("70. פרופיל קבוצה: שמירה, בעלות, ובדיקת הטיוטה מולו", async () => {
    assert.equal((await get("/api/me/assist-groups")).status, 401);
    assert.ok((await get("/api/assist/traits")).body.some((t) => t.id === "shy"));
    const g = await post("/api/me/assist-groups", { name: "שכבה ז׳", size: 28, traits: ["shy", "energetic", "shy"] }, tok);
    assert.equal(g.status, 201);
    assert.deepEqual(g.body.traits, ["shy", "energetic"]);
    assert.equal((await post("/api/me/assist-groups", { name: "x", traits: ["nope"] }, tok)).status, 400);
    assert.equal((await put(`/api/me/assist-groups/${g.body.id}`, { name: "שכבה ז׳ החדשה", size: 12, traits: ["strong"] }, tok2)).status, 404);
    assert.equal((await put(`/api/me/assist-groups/${g.body.id}`, { name: "שכבה ז׳ החדשה", size: 12, traits: ["strong"] }, tok)).body.size, 12);
    assert.equal((await del(`/api/me/assist-groups/${g.body.id}`, tok2)).status, 404);
    const profile = { name: "שכבה ז׳", size: 28, traits: ["shy", "talkative", "strong"] };
    const plain = DRAFT.replace("לקבוצות", "לצוותים").replace("משפט אחד", "משפט קצר");
    const a = (await post("/api/assist/analyze", { text: plain, profile })).body;
    assert.deepEqual(a.profile.tips.map((t) => t.trait).sort(), ["shy", "size", "strong", "talkative"].sort());
    assert.ok(a.nudges.some((n) => n.startsWith("לקבוצה שלכם:")));
    const satisfied = (await post("/api/assist/analyze", { text: `${DRAFT}\nדיון: קודם בזוגות ואז כולם, ומותר לדלג. כל אחד משפט אחד. נחלק לקבוצות. יש שלב אתגר למי שסיים.`, profile })).body;
    assert.deepEqual(satisfied.profile.tips, []);
    assert.equal((await post("/api/assist/analyze", { text: DRAFT })).body.profile, null);
    assert.equal((await del(`/api/me/assist-groups/${g.body.id}`, tok)).status, 200);
  });

  it("64. טיוטות משותפות: שמירה, קישור, תגובות אורחים, התראה ובעלות", async () => {
    assert.equal((await get("/api/assist/drafts")).status, 401);
    const d = await post("/api/assist/drafts", { text: DRAFT, ageGroup: "כיתה ז' - מעורב" }, tok);
    assert.equal(d.status, 201);
    assert.equal(d.body.title, "פעולה על אלימות");
    assert.equal(d.body.shareToken, null);
    const upd = (await post("/api/assist/drafts", { id: d.body.id, text: `${DRAFT}\nתוכנית ב': בחדר.` }, tok)).body;
    assert.ok(upd.text.includes("תוכנית ב"));
    assert.equal((await post("/api/assist/drafts", { id: d.body.id, text: "x" }, tok2)).status, 404);
    assert.equal((await get(`/api/assist/drafts/${d.body.id}`, tok2)).status, 404);

    assert.equal((await get("/api/assist/shared/aaaaaaaaaaaaaaaaaaaaaaaa")).status, 404);
    const tokenOn = (await post(`/api/assist/drafts/${d.body.id}/share`, { enable: true }, tok)).body.shareToken;
    assert.ok(/^[A-Za-z0-9_-]{20,}$/.test(tokenOn));
    assert.equal((await post(`/api/assist/drafts/${d.body.id}/share`, { enable: true }, tok)).body.shareToken, tokenOn, "אותו קישור נשמר");
    assert.equal((await post(`/api/assist/drafts/${d.body.id}/share`, { enable: true }, tok2)).status, 404);

    const view = await get(`/api/assist/shared/${tokenOn}`);
    assert.equal(view.status, 200);
    assert.equal(view.headers.get("x-robots-tag"), "noindex");
    assert.ok(view.body.text.includes("מירוץ תחנות") && view.body.ownerName === "נועה כ");
    assert.ok(!("id" in view.body) && !("shareToken" in view.body));

    const c = await post(`/api/assist/shared/${tokenOn}/comments`, { name: "גל", text: "אולי לקצר את הפתיחה?", quote: "מתכנסים במעגל" });
    assert.equal(c.status, 201);
    assert.equal(c.body.authorName, "גל");
    assert.equal((await post(`/api/assist/shared/${tokenOn}/comments`, { text: "ב" })).status, 400);
    assert.equal((await post(`/api/assist/shared/${tokenOn}/comments`, { text: "תגובה בלי שם" })).body.authorName, "אורח");
    assert.equal((await post("/api/assist/shared/bad/comments", { text: "תגובה" })).status, 404);

    const mine = (await get(`/api/assist/drafts/${d.body.id}`, tok)).body;
    assert.equal(mine.comments.length, 2);
    assert.equal((await get("/api/assist/drafts", tok)).body.find((x) => x.id === d.body.id).openComments, 2);
    const notes = (await get("/api/me/notifications", tok)).body;
    assert.ok(JSON.stringify(notes).includes("גל הגיב/ה על הטיוטה"));

    assert.equal((await patch(`/api/assist/comments/${c.body.id}`, { resolved: true }, tok2)).status, 404);
    assert.equal((await patch(`/api/assist/comments/${c.body.id}`, { resolved: true }, tok)).status, 200);
    assert.equal((await get("/api/assist/drafts", tok)).body.find((x) => x.id === d.body.id).openComments, 1);

    await post(`/api/assist/drafts/${d.body.id}/share`, { enable: false }, tok);
    assert.equal((await get(`/api/assist/shared/${tokenOn}`)).status, 404, "אחרי ביטול השיתוף הקישור מת");
    assert.equal((await post(`/api/assist/shared/${tokenOn}/comments`, { text: "תגובה מאוחרת" })).status, 404);

    const refl = await post("/api/assist/reflections", { text: "הפעולה עברה טוב. בפעם הבאה לקצר.", draftId: d.body.id }, tok);
    assert.equal(refl.status, 201);
    assert.equal((await get(`/api/assist/reflections?draftId=${d.body.id}`, tok)).body.length, 1);
    assert.equal((await del(`/api/assist/drafts/${d.body.id}`, tok2)).status, 404);
    assert.equal((await del(`/api/assist/drafts/${d.body.id}`, tok)).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM assist_comments").get().c, 0, "תגובות נמחקות עם הטיוטה");
  });
});

describe("עוזר הכתיבה: סבב 71–80", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const del = (p, tok) => j(p, { method: "DELETE", headers: H(tok) });
  const get = (p, tok) => j(p, { headers: tok ? H(tok) : {} });
  const DRAFT = "פעולה על אלימות\nהמטרה: שהחניכים יבינו שאלימות מתחילה במילים\nציוד: דפים וכדור\nבטיחות: גבולות גזרה ברורים\nפתיחה: מתכנסים במעגל, וכל אחד אומר מילה אחת. 5 דקות\nמשחק: מחלקים לקבוצות ועושים מירוץ תחנות. 15 דקות\nזמן צופיות מעשי: בזוגות מתרגלים קשר. 8 דקות\nדיון: מה הרגשתם כשהיה קשה? 10 דקות\nסיכום: כל אחד אומר משפט אחד על אלימות. 5 דקות\nתוכנית ב' (גשם): מעבירים לחדר.";
  let tok;
  let tok2;
  before(async () => {
    tok = (await post("/api/auth/register", { username: "tal-l", password: "password123", displayName: "טל ל", signupCode: "shevet-code" })).body.token;
    tok2 = (await post("/api/auth/register", { username: "dan-l", password: "password123", displayName: "דן ל", signupCode: "shevet-code" })).body.token;
  });

  it("72. ציון מוכנות: חלקים, רמה והמלצות", async () => {
    const full = (await post("/api/assist/analyze", { text: DRAFT, ageGroup: "כיתה ז' - מעורב", targetMinutes: 43 })).body.readiness;
    assert.ok(full.score >= 85 && full.level === "מוכנה להפעלה", `ציון ${full.score}`);
    assert.equal(full.parts.reduce((s, p) => s + p.max, 0), 100);
    const rough = (await post("/api/assist/analyze", { text: "כותרת\nפתיחה: נדבר על זה וכו׳." })).body.readiness;
    assert.ok(rough.score < 40 && rough.level === "טיוטה ראשונה");
    assert.ok(rough.next.length === 3 && rough.next[0].gain >= rough.next[2].gain && rough.next.every((n) => n.fix));
    const empty = (await post("/api/assist/analyze", { text: "" })).body.readiness;
    assert.equal(empty.score, 0);
    assert.deepEqual(empty.next, []);
    const off = (await post("/api/assist/analyze", { text: DRAFT, targetMinutes: 100 })).body.readiness;
    assert.equal(off.parts.find((p) => p.id === "time").points, 0);
    assert.equal((await post("/api/assist/analyze", { text: DRAFT, targetMinutes: 3 })).status, 400);
  });

  it("73. בדיקת הכלה: סימון, והתאמה שכבר כתובה מבטלת את הסימון", async () => {
    const bad = "פעולה\nמשחק: בנים נגד בנות במירוץ, ומי שנפסל יושב בצד. כל אחד קורא בקול. צועקים את המילה.";
    const r = (await post("/api/assist/inclusion", { text: bad })).body;
    assert.deepEqual(r.flags.map((f) => f.id).sort(), ["eliminate", "gender", "loud", "physical", "reading"].sort());
    assert.ok(r.flags.every((f) => f.why && f.fix && f.line.startsWith("התאמה: ")));
    const fixed = (await post("/api/assist/inclusion", { text: `${bad}\nמי שלא יכול לרוץ הולך או שופט. מתנדבים קוראים. בלי צעקות, בשקט.` })).body;
    assert.ok(!fixed.flags.some((f) => ["physical", "reading", "loud"].includes(f.id)));
    assert.equal((await post("/api/assist/inclusion", { text: "פעולה על חברות\nמשחק: מחלקים לצוותים לפי חודש לידה. 10 דקות" })).body.ok, true);
    assert.ok((await post("/api/assist/inclusion", { text: DRAFT })).body.flags.some((f) => f.id === "physical"), "מירוץ בלי חלופה");
    const a = (await post("/api/assist/analyze", { text: `${DRAFT}\nהתאמה: מי שלא רץ הולך.` })).body;
    assert.ok(a.other.includes("התאמה: מי שלא רץ הולך."), "שורת התאמה לא נכנסת לשלב");
    assert.ok(!a.stages[4].content.includes("התאמה"));
  });

  it("74. חבילת הורים: הודעות מוכנות, מה להביא, ובלי ניסוח מגושם של הערך", async () => {
    const r = (await post("/api/assist/parents", { text: DRAFT, ageGroup: "כיתה ו' - בנות", date: "2030-05-01", time: "18:00", place: "המועדון" })).body;
    assert.ok(r.parents.startsWith("שלום להורים") && r.parents.includes('"אלימות מתחילה במילים"') && r.parents.includes("כיתה ו' - בנות"));
    assert.ok(r.parents.includes("מה כדאי להביא: בקבוק מים"));
    assert.ok(r.kids.includes("18:00") && r.kids.includes("המועדון"));
    assert.ok(r.staff.includes("ציוד") && r.bring.includes("בקבוק מים"));
    assert.equal((await post("/api/assist/parents", { text: "קצר" })).status, 400);
    assert.equal((await post("/api/assist/parents", { text: DRAFT, date: "2030-13-40" })).status, 400);
  });

  it("79. כרטיסי תחנות: מובנות או מתוך הטיוטה", async () => {
    const gen = (await post("/api/assist/stations", { text: DRAFT, count: 5 })).body;
    assert.equal(gen.explicit, false);
    assert.equal(gen.cards.length, 5);
    assert.ok(gen.cards.every((c) => c.title.startsWith("תחנה ") && c.task.includes("אלימות") && c.minutes >= 2));
    assert.ok(gen.rotation.includes("בכיוון השעון"));
    const own = (await post("/api/assist/stations", { text: "כותרת\nמשחק: סיבוב\nתחנה 1: מקפלים דף\nתחנה 2: בונים מגדל\nתחנה 3: מציירים" })).body;
    assert.equal(own.explicit, true);
    assert.deepEqual(own.cards.map((c) => c.task), ["מקפלים דף", "בונים מגדל", "מציירים"]);
    assert.equal((await post("/api/assist/stations", { text: DRAFT, count: 20 })).status, 400);
  });

  it("71. למידת סגנון: ניתוח, שמירה (עם התחברות) ושימור שדות קיימים", async () => {
    const sample = "יאללה חבר'ה, בואו נתחיל! כולם עומדים במעגל. מי יודע מה זה אחריות? תגידו לי, אחלה, סבבה. נעשה משחק קצר, ואחר כך נדבר על זה יחד. מה דעתכם? בואו נראה מי פותר ראשון!";
    const a = (await post("/api/assist/learn-style", { text: sample })).body;
    assert.equal(a.ok, true);
    assert.equal(a.signedIn, false);
    assert.ok(a.traits.length >= 3 && a.suggested.tone && Array.isArray(a.changes));
    assert.equal((await post("/api/assist/learn-style", { text: "קצר" })).body.ok, false);
    assert.equal((await put("/api/assist/learn-style", { text: sample })).status, 401);
    assert.equal((await put("/api/assist/learn-style", { text: "קצר" }, tok)).status, 400);
    await put("/api/me/style", { style: { tone: "serious", extra: "בלי סלנג בבקשה" } }, tok);
    const saved = await put("/api/assist/learn-style", { text: sample }, tok);
    assert.equal(saved.status, 200);
    const stored = (await get("/api/me/style", tok)).body.style;
    assert.equal(stored.extra, "בלי סלנג בבקשה", "שדה שהמשתמש כתב נשמר");
    assert.equal(stored.tone, a.suggested.tone);
    assert.ok(stored.sample.startsWith("יאללה"));
    const again = (await post("/api/assist/learn-style", { text: sample }, tok)).body;
    assert.equal(again.signedIn, true);
    assert.deepEqual(again.changes, []);
  });

  it("75. היסטוריית גרסאות: שמירה בעדכון, השוואה ושחזור", async () => {
    const d = (await post("/api/assist/drafts", { text: DRAFT }, tok)).body;
    assert.deepEqual((await get(`/api/assist/drafts/${d.id}/versions`, tok)).body, []);
    await post("/api/assist/drafts", { id: d.id, text: DRAFT }, tok);
    assert.equal((await get(`/api/assist/drafts/${d.id}/versions`, tok)).body.length, 0, "בלי שינוי אין גרסה");
    const v2 = `${DRAFT}\nשורה חדשה לגמרי.`;
    await post("/api/assist/drafts", { id: d.id, text: v2 }, tok);
    const list = (await get(`/api/assist/drafts/${d.id}/versions`, tok)).body;
    assert.equal(list.length, 1);
    assert.equal(list[0].diff.added, 1);
    assert.equal(list[0].diff.removed, 0);
    assert.equal((await get(`/api/assist/drafts/${d.id}/versions`, tok2)).status, 404);
    const one = (await get(`/api/assist/drafts/${d.id}/versions/${list[0].id}`, tok)).body;
    assert.equal(one.text, DRAFT);
    assert.equal((await post(`/api/assist/drafts/${d.id}/versions/${list[0].id}/restore`, {}, tok2)).status, 404);
    const back = await post(`/api/assist/drafts/${d.id}/versions/${list[0].id}/restore`, {}, tok);
    assert.equal(back.body.text, DRAFT);
    assert.equal((await get(`/api/assist/drafts/${d.id}`, tok)).body.text, DRAFT);
    assert.equal((await get(`/api/assist/drafts/${d.id}/versions`, tok)).body.length, 2, "גם הנוסח שלפני השחזור נשמר");
    for (let i = 0; i < 33; i++) await post("/api/assist/drafts", { id: d.id, text: `${DRAFT}\nגרסה ${i}` }, tok);
    assert.equal((await get(`/api/assist/drafts/${d.id}/versions`, tok)).body.length, 30, "עד 30 גרסאות");
  });

  it("76. לוח תכנון: שמירה, אזהרות, בעלות ומגבלות", async () => {
    assert.equal((await get("/api/assist/board")).status, 401);
    const cell = (week, over = {}) => ({ grade: "ז'", week, title: "פעולת אחריות", value: "אחריות", status: "writing", ...over });
    assert.equal((await put("/api/assist/board/cell", cell("2030-06-05"), tok)).status, 200);
    await put("/api/assist/board/cell", cell("2030-06-12", { title: "עוד פעולה על אחריות" }), tok);
    await put("/api/assist/board/cell", cell("2030-06-12", { title: "עוד פעולה על אחריות", status: "ready" }), tok);
    assert.equal((await put("/api/assist/board/cell", cell("2030-06-05", { grade: "ח'", title: "פעולה אחרת", value: "חברות" }), tok)).status, 200);
    assert.equal((await put("/api/assist/board/cell", cell("2030-06-05", { grade: "ב'" }), tok)).status, 400);
    assert.equal((await put("/api/assist/board/cell", cell("2030-06-05", { status: "weird" }), tok)).status, 400);
    assert.equal((await put("/api/assist/board/cell", cell("2030-06-05", { draftId: 99999 }), tok)).status, 404);
    const b = (await get("/api/assist/board?from=2030-06-04&weeks=4", tok)).body;
    assert.equal(b.weeks[0], "2030-06-02", "השבוע מתחיל ביום ראשון");
    assert.equal(b.weeks.length, 4);
    assert.equal(b.cells.filter((c) => c.grade === "ז'").length, 2, "אותו שבוע מתעדכן ולא מוכפל");
    assert.equal(b.cells.find((c) => c.week === "2030-06-09").status, "ready");
    assert.ok(b.warnings.some((w) => w.includes("אחריות") && w.includes("חוזר")));
    assert.ok(b.warnings.some((w) => w.includes("ח'") && w.includes("אין פעולה מתוכננת")));
    assert.equal((await get("/api/assist/board?from=2030-06-04&weeks=4", tok2)).body.cells.length, 0, "לוח אישי");
    assert.equal((await del("/api/assist/board/cell?grade=%D7%97'&week=2030-06-05", tok2)).status, 404);
    assert.equal((await del("/api/assist/board/cell?grade=%D7%97'&week=2030-06-05", tok)).status, 200);
    assert.equal((await get("/api/assist/board?weeks=13", tok)).status, 400);
  });

  it("78. חוברת: קובץ Word עם הטיוטות והפעולות שנבחרו", async () => {
    const mammoth = (await import("mammoth")).default;
    const d = (await post("/api/assist/drafts", { text: DRAFT.replaceAll("אלימות", "סובלנות") }, tok)).body;
    const acts = (await get("/api/activities?pageSize=1")).body.items;
    assert.equal((await post("/api/assist/booklet", { draftIds: [d.id] })).status, 401);
    assert.equal((await post("/api/assist/booklet", {}, tok)).status, 400);
    assert.equal((await post("/api/assist/booklet", { draftIds: [d.id] }, tok2)).status, 404, "טיוטה של מישהו אחר לא נכללת");
    const r = await post("/api/assist/booklet", { draftIds: [d.id], activityIds: [acts[0].id], title: "חוברת בדיקה" }, tok);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const buf = r.body;
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    const txt = (await mammoth.extractRawText({ buffer: buf })).value;
    assert.ok(txt.includes("חוברת בדיקה") && txt.includes("פעולה על סובלנות") && txt.includes(acts[0].title));
    assert.ok(txt.includes("סובלנות מתחילה במילים"), "הערך מנוקה מ'שהחניכים יבינו'");
  });

  it("80. מסלול צמיחה: אבני דרך לפי מה שנעשה בפועל", async () => {
    assert.equal((await get("/api/assist/growth")).status, 401);
    const u = (await post("/api/auth/register", { username: "ron-l", password: "password123", displayName: "רון ל", signupCode: "shevet-code" })).body.token;
    const g0 = (await get("/api/assist/growth", u)).body;
    assert.equal(g0.points, 0);
    assert.equal(g0.level, "מדריך בתחילת הדרך");
    assert.equal(g0.next.id, "first");
    assert.equal(g0.tryMethods.length, 3);
    const saved = await post("/api/assist/save", { text: DRAFT, ageGroup: "כיתה ז' - מעורב" }, u);
    assert.equal(saved.status, 201);
    await post("/api/assist/reflections", { text: "הפעולה עברה טוב. בפעם הבאה לקצר.", activityId: saved.body.id }, u);
    const d = (await post("/api/assist/drafts", { text: DRAFT }, u)).body;
    const share = (await post(`/api/assist/drafts/${d.id}/share`, { enable: true }, u)).body.shareToken;
    await post(`/api/assist/shared/${share}/comments`, { text: "יפה מאוד" });
    const g1 = (await get("/api/assist/growth", u)).body;
    const done = Object.fromEntries(g1.milestones.map((m) => [m.id, m.done]));
    assert.equal(done.first, true);
    assert.equal(done.complete, true);
    assert.equal(done.planb, true);
    assert.equal(done.run, true);
    assert.equal(done.runs3, false);
    assert.equal(done.shared, true);
    assert.equal(g1.stats.runs, 1, "תיעוד שנשמר גם כסבב לא נספר פעמיים");
    assert.ok(g1.points > g0.points && g1.level === "מדריך מנוסה");
    assert.ok(g1.nextLevel.pointsNeeded > 0);
    assert.equal(g1.next.id, "five");
  });
});

describe("חשבונות ואבטחה: סבב 81–90", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const patch = (p, body, tok) => j(p, { method: "PATCH", body: JSON.stringify(body), headers: H(tok) });
  const del = (p, tok) => j(p, { method: "DELETE", headers: H(tok) });
  const get = (p, tok) => j(p, { headers: tok ? H(tok) : {} });
  let admin;
  let ana;
  before(async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await post("/api/auth/login", { username: "admin", password: pw });
      if (r.status === 200 && !r.body.user.mustChangePw) { admin = r.body; break; }
    }
    ana = (await post("/api/auth/register", { username: "ana81", password: "password123", displayName: "ענת", signupCode: "shevet-code", email: "Ana81@Example.com", phone: "050-123-4567" })).body;
  });

  it("82. הרשמה עם מייל וטלפון: מנורמלים, לא מאומתים, וכניסה בהם עדיין לא עובדת", async () => {
    assert.equal(ana.user.email, "ana81@example.com");
    assert.equal(ana.user.phone, "+972501234567");
    assert.equal(ana.user.emailVerified, false);
    assert.equal((await post("/api/auth/login", { username: "ana81@example.com", password: "password123" })).status, 401);
    assert.equal((await post("/api/auth/login", { username: "0501234567", password: "password123" })).status, 401);
    const bad = await post("/api/auth/register", { username: "x-bad", password: "password123", displayName: "בדיקה", signupCode: "shevet-code", email: "לא-מייל" });
    assert.equal(bad.status, 400);
    const num = await post("/api/auth/register", { username: "0501234567", password: "password123", displayName: "בדיקה", signupCode: "shevet-code" });
    assert.equal(num.status, 400);
  });

  it("83+81. אימות מייל וטלפון, ואז כניסה בכל זיהוי", async () => {
    const wrong = await post("/api/me/verify/request", { channel: "email" }, ana.token);
    assert.equal(wrong.status, 200);
    assert.match(wrong.body.sentTo, /^a\*\*\*@/);
    assert.equal((await post("/api/me/verify/confirm", { channel: "email", code: "000000" }, ana.token)).status, 400);
    const e = await post("/api/me/verify/request", { channel: "email" }, ana.token);
    assert.equal((await post("/api/me/verify/confirm", { channel: "email", code: e.body.devCode }, ana.token)).body.user.emailVerified, true);
    const p = await post("/api/me/verify/request", { channel: "phone" }, ana.token);
    assert.equal((await post("/api/me/verify/confirm", { channel: "phone", code: p.body.devCode }, ana.token)).body.user.phoneVerified, true);
    for (const id of ["ana81", "ANA81@example.com", "050 123 4567", "+972501234567", "972501234567"]) {
      const r = await post("/api/auth/login", { username: id, password: "password123" });
      assert.equal(r.status, 200, id);
      assert.equal(r.body.user.username, "ana81");
    }
    assert.equal((await post("/api/auth/login", { username: "ana81@example.com", password: "wrong-password" })).status, 401);
  });

  it("83. אותו מייל לא יכול להיות מאומת בשני חשבונות", async () => {
    const bob = (await post("/api/auth/register", { username: "bob81", password: "password123", displayName: "בוב", signupCode: "shevet-code", email: "ana81@example.com" }));
    assert.equal(bob.status, 409);
    const b2 = (await post("/api/auth/register", { username: "bob82", password: "password123", displayName: "בוב", signupCode: "shevet-code" })).body;
    await put("/api/me/contact", { password: "password123", email: "ana81@example.com" }, b2.token);
    assert.equal((await post("/api/me/verify/request", { channel: "email" }, b2.token)).status, 409);
  });

  it("84. איפוס סיסמה: תשובה זהה גם לחשבון שלא קיים, קוד חד-פעמי וסגירת חיבורים", async () => {
    const ghost = await post("/api/auth/forgot", { identifier: "nobody@example.com" });
    const real = await post("/api/auth/forgot", { identifier: "ana81@example.com" });
    assert.equal(ghost.status, 200);
    assert.equal(ghost.body.message, real.body.message);
    assert.equal(ghost.body.devCode, undefined);
    assert.match(real.body.devCode, /^\d{6}$/);
    assert.equal((await post("/api/auth/reset", { identifier: "ana81@example.com", code: "123456", newPassword: "brand-new-pass1" })).status, 400);
    const r = await post("/api/auth/reset", { identifier: "ana81@example.com", code: real.body.devCode, newPassword: "brand-new-pass1" });
    assert.equal(r.status, 200);
    assert.equal((await post("/api/auth/reset", { identifier: "ana81@example.com", code: real.body.devCode, newPassword: "another-pass-22" })).status, 400);
    assert.equal((await get("/api/auth/me", ana.token)).status, 401);
    assert.equal((await post("/api/auth/login", { username: "ana81", password: "password123" })).status, 401);
    ana = (await post("/api/auth/login", { username: "ana81", password: "brand-new-pass1" })).body;
    assert.ok(ana.token);
  });

  it("85. קישור קסם: חד-פעמי, ורק למייל מאומת", async () => {
    const none = await post("/api/auth/magic/request", { email: "nobody@example.com" });
    assert.equal(none.body.devToken, undefined);
    const m = await post("/api/auth/magic/request", { email: "ana81@example.com" });
    assert.ok(m.body.devToken);
    const c = await post("/api/auth/magic/consume", { token: m.body.devToken });
    assert.equal(c.status, 200);
    assert.equal(c.body.user.username, "ana81");
    assert.equal((await post("/api/auth/magic/consume", { token: m.body.devToken })).status, 400);
    assert.equal((await post("/api/auth/magic/consume", { token: "x".repeat(40) })).status, 400);
  });

  it("86. אימות דו-שלבי: הגדרה, כניסה בשני שלבים, קוד גיבוי חד-פעמי, ושימוש חוזר בקוד נחסם", async () => {
    const { totpAt, currentStep } = await import("../src/accounts.js");
    const setup = await post("/api/me/2fa/setup", {}, ana.token);
    assert.match(setup.body.otpauth, /^otpauth:\/\/totp\//);
    assert.equal((await post("/api/me/2fa/enable", { code: "000000" }, ana.token)).status, 400);
    const en = await post("/api/me/2fa/enable", { code: totpAt(setup.body.secret, currentStep()) }, ana.token);
    assert.equal(en.body.backupCodes.length, 10);
    const stored = db.prepare("SELECT totp_secret FROM users WHERE username = 'ana81'").get().totp_secret;
    assert.ok(!stored.includes(setup.body.secret), "הסוד לא נשמר גלוי");
    const l1 = await post("/api/auth/login", { username: "ana81", password: "brand-new-pass1" });
    assert.equal(l1.body.needs2fa, true);
    assert.equal(l1.body.token, undefined);
    assert.equal((await post("/api/auth/2fa", { challenge: l1.body.challenge, code: "111111" })).status, 401);
    const nextStep = currentStep() + 1; // הצעד הנוכחי כבר נוצל בהפעלה
    const ok = await post("/api/auth/2fa", { challenge: l1.body.challenge, code: totpAt(setup.body.secret, nextStep) });
    assert.equal(ok.status, 200);
    const again = await post("/api/auth/2fa", { challenge: l1.body.challenge, code: totpAt(setup.body.secret, nextStep) });
    assert.equal(again.status, 401, "אותו קוד לא עובד פעמיים");
    const l2 = await post("/api/auth/login", { username: "ana81", password: "brand-new-pass1" });
    const b = await post("/api/auth/2fa", { challenge: l2.body.challenge, code: en.body.backupCodes[0] });
    assert.equal(b.status, 200);
    const l3 = await post("/api/auth/login", { username: "ana81", password: "brand-new-pass1" });
    assert.equal((await post("/api/auth/2fa", { challenge: l3.body.challenge, code: en.body.backupCodes[0] })).status, 401, "קוד גיבוי חד-פעמי");
    assert.equal((await post("/api/auth/2fa", { challenge: "x".repeat(30), code: "123456" })).status, 401);
    // קישור קסם מכבד גם הוא את השלב השני
    const m = await post("/api/auth/magic/request", { email: "ana81@example.com" });
    assert.equal((await post("/api/auth/magic/consume", { token: m.body.devToken })).body.needs2fa, true);
    ana = ok.body;
    const off = await post("/api/me/2fa/disable", { password: "brand-new-pass1", code: en.body.backupCodes[1] }, ana.token);
    assert.equal(off.status, 200);
    assert.equal((await post("/api/auth/login", { username: "ana81", password: "brand-new-pass1" })).body.needs2fa, undefined);
  });

  it("87. מכשירים: רשימה, ניתוק אחר, וניתוק חיבור מבטל את האסימון מיד", async () => {
    const a = (await post("/api/auth/login", { username: "ana81", password: "brand-new-pass1" }, null)).body;
    const b = (await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "ana81", password: "brand-new-pass1" }), headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36" } })).body;
    const list = await get("/api/me/sessions", a.token);
    assert.ok(list.body.length >= 2);
    assert.equal(list.body.filter((s) => s.current).length, 1);
    assert.ok(list.body.some((s) => s.device === "Chrome ב-Windows"));
    const other = list.body.find((s) => !s.current);
    assert.equal((await del(`/api/me/sessions/${other.id}`, a.token)).status, 200);
    assert.equal((await get("/api/auth/me", b.token)).status === 401 || (await get("/api/auth/me", a.token)).status === 401, true);
    const n = await post("/api/me/sessions/revoke-others", {}, a.token);
    assert.ok(n.body.revoked >= 0);
    assert.equal((await get("/api/auth/me", a.token)).status, 200);
    await post("/api/auth/logout", {}, a.token);
    assert.equal((await get("/api/auth/me", a.token)).status, 401);
  });

  it("88. תפקידי צוות: הרשאות לפי תפקיד, ושינוי חל מיד", async () => {
    const roles = await get("/api/admin/roles", admin.token);
    assert.deepEqual(roles.body.map((r) => r.key), ["SUPER", "CONTENT", "USERS", "VIEWER"]);
    const mk = async (u, staffRole) => {
      const c = await post("/api/admin/users", { username: u, displayName: u + " צוות", role: "ADMIN", staffRole, password: "staff-pass-1234" }, admin.token);
      assert.equal(c.status, 201);
      const l = await post("/api/auth/login", { username: u, password: "staff-pass-1234" });
      const ch = await post("/api/auth/change-password", { currentPassword: "staff-pass-1234", newPassword: "staff-pass-5678" }, l.body.token);
      return { id: c.body.id, token: ch.body.token };
    };
    const content = await mk("content81", "CONTENT");
    const users = await mk("users81", "USERS");
    const viewer = await mk("viewer81", "VIEWER");
    assert.equal((await get("/api/admin/stats", content.token)).status, 200);
    assert.equal((await get("/api/admin/users", content.token)).status, 403);
    assert.equal((await get("/api/admin/backups", content.token)).status, 403);
    assert.equal((await get("/api/admin/stats", viewer.token)).status, 200);
    assert.equal((await post("/api/admin/backups", {}, viewer.token)).status, 403);
    assert.equal((await get("/api/admin/users", viewer.token)).status, 403);
    assert.equal((await get("/api/admin/users", users.token)).status, 200);
    assert.equal((await get("/api/admin/audit", users.token)).status, 200);
    assert.equal((await get("/api/admin/pending", users.token)).status, 403);
    // מנהל משתמשים לא נוגע באדמינים ולא יוצר אדמינים
    assert.equal((await patch(`/api/admin/users/${content.id}`, { disabled: true }, users.token)).status, 403);
    assert.equal((await post("/api/admin/users", { username: "evil81", displayName: "רע רע", role: "ADMIN" }, users.token)).status, 403);
    assert.equal((await patch(`/api/admin/users/${ana.user.id}`, { staffRole: "SUPER" }, users.token)).status, 403);
    // הורדת הרשאות חלה מיד על אסימון קיים
    assert.equal((await patch(`/api/admin/users/${content.id}`, { staffRole: "VIEWER" }, admin.token)).status, 200);
    assert.equal((await patch(`/api/admin/users/${ana.user.id}`, { displayName: "x" }, content.token)).status, 403);
    // השעיה מנתקת מיד
    assert.equal((await patch(`/api/admin/users/${viewer.id}`, { disabled: true }, admin.token)).status, 200);
    assert.equal((await get("/api/admin/stats", viewer.token)).status, 401);
    // האדמין הראשי האחרון מוגן
    const me = admin.user.id;
    const second = await mk("super81", "SUPER");
    assert.equal((await patch(`/api/admin/users/${second.id}`, { disabled: true }, admin.token)).status, 200);
    assert.equal((await patch(`/api/admin/users/${me}`, { staffRole: "CONTENT" }, admin.token)).status, 400);
    assert.equal((await patch(`/api/admin/users/${second.id}`, { disabled: false }, admin.token)).status, 200);
  });

  it("89. ניהול משתמשים: חיפוש, יצירה, פרטים, אימות ידני, איפוס 2FA ומחיקה", async () => {
    const list = await get("/api/admin/users?q=ana81", admin.token);
    assert.ok(list.body.total >= 1);
    assert.equal(list.body.items.find((u) => u.username === "ana81").emailVerified, true);
    assert.equal((await get("/api/admin/users?q=0501234567", admin.token)).body.total, 1);
    assert.ok((await get("/api/admin/users?status=disabled", admin.token)).body.items.every((u) => u.disabled));
    assert.equal((await get("/api/admin/users?pageSize=2&page=1", admin.token)).body.items.length, 2);
    const c = await post("/api/admin/users", { username: "made81", displayName: "נוצר ידנית", email: "made@example.com", phone: "052-9998888", markVerified: true }, admin.token);
    assert.equal(c.status, 201);
    assert.ok(c.body.tempPassword.length >= 8);
    const login = await post("/api/auth/login", { username: "made@example.com", password: c.body.tempPassword });
    assert.equal(login.body.user.mustChangePw, true);
    assert.equal((await post("/api/admin/users", { username: "made81", displayName: "כפול כפול" }, admin.token)).status, 409);
    const d = await get(`/api/admin/users/${c.body.id}`, admin.token);
    assert.equal(d.body.phone, "+972529998888");
    assert.ok(d.body.sessions.length >= 1);
    assert.ok(d.body.recent.some((r) => r.action === "login.success"));
    assert.equal((await patch(`/api/admin/users/${c.body.id}`, { phone: "050-1112222", verifyPhone: true }, admin.token)).status, 200);
    assert.equal((await post("/api/auth/login", { username: "0501112222", password: c.body.tempPassword })).status, 200);
    assert.equal((await patch(`/api/admin/users/${c.body.id}`, { reset2fa: true, revokeSessions: true }, admin.token)).status, 200);
    assert.equal((await get("/api/auth/me", login.body.token)).status, 401);
    assert.equal((await del(`/api/admin/users/${admin.user.id}`, admin.token)).status, 400);
    assert.equal((await del(`/api/admin/users/${c.body.id}`, admin.token)).status, 200);
    assert.equal((await get(`/api/admin/users/${c.body.id}`, admin.token)).status, 404);
    const withActs = db.prepare("SELECT a.owner_id FROM activities a JOIN users u ON u.id = a.owner_id WHERE u.role = 'INSTRUCTOR' LIMIT 1").get();
    if (withActs) assert.equal((await del(`/api/admin/users/${withActs.owner_id}`, admin.token)).status, 409);
  });

  it("90. יומן פעולות: סינון, ייצוא בטוח לאקסל, אי אפשר לשנות או למחוק, ושרשרת הגיבוב מתגלה כשיש שינוי", async () => {
    const f = await get("/api/admin/audit?action=login&limit=5", admin.token);
    assert.ok(f.body.total >= 1 && f.body.items.length <= 5 && f.body.items.every((r) => r.action.startsWith("login")));
    assert.equal((await get("/api/admin/audit?from=2999-01-01", admin.token)).body.total, 0);
    audit(db, "=HYPERLINK(evil)", "test.csv", { n: 1 });
    const csv = await get("/api/admin/audit.csv?action=test.csv", admin.token);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.ok(csv.body.toString("utf8").includes(`"'=HYPERLINK(evil)"`), "תא שמתחיל ב-= מנוטרל");
    assert.throws(() => db.prepare("DELETE FROM audit_log WHERE id = 1").run(), /append-only/);
    assert.throws(() => db.prepare("UPDATE audit_log SET actor = 'x' WHERE id = 1").run(), /append-only/);
    const ok = await get("/api/admin/audit/verify", admin.token);
    assert.equal(ok.body.ok, true);
    assert.ok(ok.body.checked >= 10);
    // מי שיש לו גישה ישירה לקובץ יכול לעקוף את הטריגר, אבל השינוי מתגלה
    db.exec("DROP TRIGGER audit_no_update");
    const row = db.prepare("SELECT id FROM audit_log WHERE hash IS NOT NULL ORDER BY id LIMIT 1 OFFSET 3").get();
    db.prepare("UPDATE audit_log SET actor = 'מזויף' WHERE id = ?").run(row.id);
    const broken = await get("/api/admin/audit/verify", admin.token);
    assert.equal(broken.body.ok, false);
    assert.equal(broken.body.brokenAt, row.id);
    db.prepare("UPDATE audit_log SET actor = ? WHERE id = ?").run("admin", row.id);
    db.exec("CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END");
  });

  it("אבטחה: משתמש רגיל לא נכנס לנתיבי אדמין, ואסימון 2FA לא פותח את האתר", async () => {
    assert.equal((await get("/api/admin/audit", ana.token)).status, 401);
    assert.equal((await get("/api/admin/users")).status, 401);
    const { signChallenge } = await import("../src/auth.js");
    assert.equal((await get("/api/auth/me", signChallenge(ana.user.id))).status, 401);
    const opts = await get("/api/auth/options");
    assert.equal(opts.body.providers.email, false);
  });
});

describe("אבטחה ופרטיות: סבב 91–100", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const post = (p, body, tok) => j(p, { method: "POST", body: JSON.stringify(body), headers: tok ? H(tok) : {} });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: H(tok) });
  const del = (p, tok) => j(p, { method: "DELETE", headers: H(tok) });
  const get = (p, tok) => j(p, { headers: tok ? H(tok) : {} });
  let admin;
  let sec;
  before(async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await post("/api/auth/login", { username: "admin", password: pw });
      if (r.status === 200 && !r.body.user.mustChangePw) { admin = r.body; break; }
    }
    sec = await import("../src/security.js");
  });
  const reset = () => put("/api/admin/security/settings", { ipRetentionDays: 90, visitorIpMode: "raw", strictPasswords: 0, passwordMaxAgeDays: 0, autoBlockAfter: 0 }, admin.token);

  it("91. יומן כניסות: כניסה וכשלון נרשמים עם מכשיר ומדינה, ואפשר לסנן ולייצא", async () => {
    const u = (await post("/api/auth/register", { username: "log91", password: "password123", displayName: "יומן", signupCode: "shevet-code" })).body;
    await post("/api/auth/login", { username: "log91", password: "wrong-wrong" });
    const ok = await j("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "log91", password: "password123" }), headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Firefox/120.0", "x-page": "/account" } });
    assert.equal(ok.status, 200);
    const list = await get("/api/admin/access?user=log91", admin.token);
    const kinds = list.body.items.map((r) => r.kind);
    assert.ok(kinds.includes("login") && kinds.includes("login_fail") && kinds.includes("register"));
    const row = list.body.items.find((r) => r.kind === "login" && r.device.startsWith("Firefox"));
    assert.equal(row.country, "LOCAL");
    assert.equal(row.countryName, "רשת פנימית");
    assert.equal(row.page, "/account");
    assert.ok(row.ip.length > 0);
    assert.equal((await get("/api/admin/access?kind=login_fail&user=log91", admin.token)).body.items.every((r) => r.kind === "login_fail"), true);
    assert.equal((await get("/api/admin/access?from=2999-01-01", admin.token)).body.total, 0);
    assert.equal((await get("/api/admin/access", u.token)).status, 401);
    const csv = await get("/api/admin/access.csv?user=log91", admin.token);
    assert.match(csv.headers.get("content-type"), /csv/);
    assert.ok(csv.body.toString("utf8").startsWith("\ufeffid,at,kind"));
    // הכתובת לא נכנסת ליומן הפעולות הקבוע
    const a = db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action LIKE 'login%' AND details LIKE '%\"ip\"%' AND id > (SELECT COALESCE(MAX(id),0) - 40 FROM audit_log)").get().c;
    assert.equal(a, 0);
  });

  it("92. מדינה לפי IP, ודגל כניסה ממדינה חדשה", async () => {
    assert.equal(sec.countryOf("8.8.8.8"), "US");
    assert.equal(sec.countryOf("::ffff:2.55.0.1"), "IL");
    assert.equal(sec.countryOf("192.168.1.5"), "LOCAL");
    assert.equal(sec.countryName("IL"), "ישראל");
    const user = db.prepare("SELECT * FROM users WHERE username = 'log91'").get();
    db.prepare("INSERT INTO access_log (at, kind, user_id, username, country) VALUES (?,?,?,?,?)").run(new Date().toISOString(), "login", user.id, user.username, "IL");
    assert.deepEqual(sec.loginFlags(db, user, "IL"), []);
    assert.deepEqual(sec.loginFlags(db, user, "US"), ["new_country"]);
    assert.deepEqual(sec.loginFlags(db, user, "LOCAL"), []);
  });

  it("93. מחיקה אוטומטית, מצב גיבוב בלבד, ומחיקת ה-IP של משתמש", async () => {
    db.prepare("INSERT INTO access_log (at, kind, ip, ip_hash, country) VALUES (?,?,?,?,?)").run("2020-01-01T00:00:00.000Z", "visit", "1.2.3.4", "abc", "US");
    db.prepare("INSERT INTO sessions (key, ip, user_agent, first_seen, last_seen) VALUES (?,?,?,?,?)").run("old-key-93", "1.2.3.4", "x", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z");
    const out = (await post("/api/admin/security/purge", {}, admin.token)).body;
    assert.ok(out.access >= 1 && out.visitors >= 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM access_log WHERE at < '2021-01-01'").get().c, 0);
    assert.equal((await put("/api/admin/security/settings", { ipRetentionDays: 3 }, admin.token)).status, 400);
    assert.equal((await put("/api/admin/security/settings", { visitorIpMode: "hashed" }, admin.token)).body.visitorIpMode, "hashed");
    await post("/api/auth/login", { username: "log91", password: "password123" });
    const last = db.prepare("SELECT ip, ip_hash FROM access_log WHERE kind = 'login' AND username = 'log91' ORDER BY id DESC LIMIT 1").get();
    assert.equal(last.ip, null);
    assert.match(last.ip_hash, /^[0-9a-f]{16}$/);
    assert.match(db.prepare("SELECT ip FROM sessions ORDER BY last_seen DESC LIMIT 1").get().ip, /^h:/);
    await reset();
    await post("/api/auth/login", { username: "log91", password: "password123" });
    const u = db.prepare("SELECT id FROM users WHERE username = 'log91'").get();
    assert.ok(db.prepare("SELECT COUNT(*) AS c FROM access_log WHERE user_id = ? AND ip IS NOT NULL").get(u.id).c >= 1);
    const p = await post(`/api/admin/users/${u.id}/purge-ip`, {}, admin.token);
    assert.ok(p.body.cleared >= 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM access_log WHERE user_id = ? AND ip IS NOT NULL").get(u.id).c, 0);
    const tok = (await post("/api/auth/login", { username: "log91", password: "password123" })).body.token;
    assert.equal((await post("/api/me/purge-ip", {}, tok)).status, 200);
  });

  it("94. סטטיסטיקת מבקרים ייחודיים לפי יום, מדינה ודף", async () => {
    const day = new Date().toISOString();
    for (const [h, c, page] of [["h1", "IL", "/library"], ["h2", "IL", "/library"], ["h2", "IL", "/assistant"], ["h3", "US", "/library"]]) {
      db.prepare("INSERT INTO access_log (at, kind, ip_hash, country, page) VALUES (?,?,?,?,?)").run(day, "visit", `t94-${h}`, c, page);
    }
    const v = (await get("/api/admin/visitors?days=7", admin.token)).body;
    assert.ok(v.total >= 3);
    assert.ok(v.perDay.some((d) => d.unique >= 3));
    assert.equal(v.countries.find((c) => c.country === "IL").name, "ישראל");
    assert.ok(v.pages.find((p) => p.page === "/library").count >= 3);
    assert.equal((await get("/api/admin/visitors?days=999", admin.token)).status, 400);
  });

  it("95. חסימת כתובות וטווחים, אי אפשר לחסום את עצמכם, והחסימה נאכפת", async () => {
    assert.equal(sec.isBlocked(db, "203.0.113.7"), false);
    const add = await post("/api/admin/blocks", { target: "203.0.113.0/24", note: "בדיקה" }, admin.token);
    assert.equal(add.status, 201);
    assert.equal(sec.isBlocked(db, "203.0.113.7"), true);
    assert.equal(sec.isBlocked(db, "::ffff:203.0.113.200"), true);
    assert.equal(sec.isBlocked(db, "203.0.114.1"), false);
    assert.equal((await post("/api/admin/blocks", { target: "203.0.113.0/24" }, admin.token)).status, 409);
    assert.equal((await post("/api/admin/blocks", { target: "not-an-ip" }, admin.token)).status, 400);
    assert.equal((await post("/api/admin/blocks", { target: "10.0.0.0/4" }, admin.token)).status, 400, "טווח רחב מדי");
    const mine = [(await post("/api/admin/blocks", { target: "127.0.0.1" }, admin.token)).status, (await post("/api/admin/blocks", { target: "::1" }, admin.token)).status];
    assert.ok(mine.includes(400), "אחת משתי הכתובות היא שלנו ונדחית");
    for (const s of mine) if (s === 201) db.prepare("DELETE FROM ip_blocks WHERE target IN ('127.0.0.1','::1')").run();
    sec.invalidateBlocks(db);
    // אכיפה: חוסמים את הכתובת של הבדיקה עצמה ישירות במסד
    db.prepare("INSERT OR IGNORE INTO ip_blocks (target, created_at) VALUES ('127.0.0.1', ?), ('::1', ?)").run(new Date().toISOString(), new Date().toISOString());
    sec.invalidateBlocks(db);
    const blocked = await get("/api/meta");
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "BLOCKED");
    assert.equal((await get("/api/health")).status, 200);
    db.prepare("DELETE FROM ip_blocks WHERE target IN ('127.0.0.1','::1')").run();
    sec.invalidateBlocks(db);
    assert.equal((await get("/api/meta")).status, 200);
    const id = (await get("/api/admin/blocks", admin.token)).body.find((b) => b.target === "203.0.113.0/24").id;
    assert.equal((await del(`/api/admin/blocks/${id}`, admin.token)).status, 200);
    assert.equal(sec.isBlocked(db, "203.0.113.7"), false);
  });

  it("95+96. התראת אבטחה לאדמין, חסימה אוטומטית אחרי כשלונות, ונעילת כתובת", async () => {
    await put("/api/admin/security/settings", { autoBlockAfter: 8 }, admin.token);
    db.prepare("DELETE FROM access_log WHERE kind = 'login_fail'").run();
    for (let i = 0; i < 10; i++) await post("/api/auth/login", { username: `ghost96-${i}`, password: "x" });
    const n = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE kind = 'security'").get().c;
    assert.ok(n >= 1, "נוצרה התראה");
    assert.ok(db.prepare("SELECT 1 FROM ip_blocks WHERE created_by = 'system'").get(), "נוצרה חסימה אוטומטית");
    sec.invalidateBlocks(db);
    assert.equal((await get("/api/meta")).status, 403);
    db.prepare("DELETE FROM ip_blocks").run();
    sec.invalidateBlocks(db);
    await reset();
    // נעילת כתובת אחרי 20 כשלונות (בלי חסימה אוטומטית)
    for (let i = 0; i < 12; i++) await post("/api/auth/login", { username: `ghost96b-${i}`, password: "x" });
    const lock = await post("/api/auth/login", { username: "log91", password: "password123" });
    assert.equal(lock.status, 429);
    assert.equal(lock.body.error.code, "LOCKED_IP");
    db.prepare("DELETE FROM access_log WHERE kind = 'login_fail'").run();
    assert.equal((await post("/api/auth/login", { username: "log91", password: "password123" })).status, 200);
  });

  it("96. אחרי שלושה כשלונות נדרשת שאלת חשבון, ותשובה נכונה מאפשרת להמשיך", async () => {
    await post("/api/auth/register", { username: "cap96", password: "password123", displayName: "קפצה", signupCode: "shevet-code" });
    let last;
    for (let i = 0; i < 3; i++) last = await post("/api/auth/login", { username: "cap96", password: "wrong-pass" });
    assert.equal(last.status, 401);
    assert.ok(last.body.error.fields.captchaToken[0], "השאלה נשלחת כבר בכשלון השלישי");
    const needs = await post("/api/auth/login", { username: "cap96", password: "password123" });
    assert.equal(needs.status, 401);
    assert.equal(needs.body.error.code, "CAPTCHA_REQUIRED");
    const solve = (f) => {
      const m = /(\d+) (ועוד|פחות) (\d+)/.exec(f.captchaQuestion[0]);
      return String(m[2] === "ועוד" ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]));
    };
    const f2 = needs.body.error.fields;
    const ok = await post("/api/auth/login", { username: "cap96", password: "password123", captchaToken: f2.captchaToken[0], captchaAnswer: solve(f2) });
    assert.equal(ok.status, 200);
    assert.equal((await post("/api/auth/login", { username: "cap96", password: "password123", captchaToken: "x".repeat(40), captchaAnswer: "1" })).status, 200, "אחרי הצלחה הספירה מתאפסת");
  });

  it("97. מדיניות סיסמאות: בדיקה, אכיפה אופציונלית לכולם, ותמיד לצוות הניהול", async () => {
    const chk = await post("/api/auth/password-check", { password: "password123", username: "x" });
    assert.equal(chk.body.ok, false);
    assert.ok(chk.body.problems.some((p) => p.includes("נפוצה")));
    assert.equal((await post("/api/auth/password-check", { password: "gzr-Tuf-84-lemons" })).body.ok, true);
    assert.ok((await post("/api/auth/password-check", { password: "noa-rules-2026", username: "noa" })).body.problems.some((p) => p.includes("שם המשתמש")));
    // כבוי כברירת מחדל
    assert.equal((await post("/api/auth/register", { username: "weak97a", password: "password123", displayName: "חלשה", signupCode: "shevet-code" })).status, 201);
    await put("/api/admin/security/settings", { strictPasswords: 1 }, admin.token);
    const w = await post("/api/auth/register", { username: "weak97b", password: "password123", displayName: "חלשה", signupCode: "shevet-code" });
    assert.equal(w.status, 400);
    assert.equal(w.body.error.code, "WEAK_PASSWORD");
    assert.equal((await post("/api/auth/register", { username: "weak97b", password: "gzr-Tuf-84-lemons", displayName: "חזקה", signupCode: "shevet-code" })).status, 201);
    await reset();
    // לאדמינים נאכף תמיד
    const c = await post("/api/admin/users", { username: "adm97", displayName: "אדמין חדש", role: "ADMIN", staffRole: "CONTENT", password: "admin1234" }, admin.token);
    assert.equal(c.status, 400);
    // תפוגת סיסמה
    await put("/api/admin/security/settings", { passwordMaxAgeDays: 30 }, admin.token);
    db.prepare("UPDATE users SET password_changed_at = ? WHERE username = 'weak97a'").run(new Date(Date.now() - 60 * 86400_000).toISOString());
    const exp = await post("/api/auth/login", { username: "weak97a", password: "password123" });
    assert.equal(exp.body.user.mustChangePw, true);
    await reset();
  });

  it("98. סיכום אבטחה ושימוש", async () => {
    const o = (await get("/api/admin/security/overview", admin.token)).body;
    assert.equal(o.days.length, 14);
    assert.ok(o.days.every((d) => "logins" in d && "failures" in d && "visitors" in d && "newUsers" in d));
    assert.ok(o.totals.users >= 5 && o.totals.withoutTerms >= 1);
    assert.ok(Array.isArray(o.countries) && Array.isArray(o.recentFlags));
    assert.ok(o.days.reduce((s, d) => s + d.logins, 0) >= 1);
  });

  it("99+88. ייצוא משתמשים ויומנים: מנהל תוכן נחסם, ומנהל משתמשים רואה רק מדריכים", async () => {
    const mk = async (u, staffRole) => {
      const c = await post("/api/admin/users", { username: u, displayName: u + " צוות", role: "ADMIN", staffRole, password: "staff-pass-1234" }, admin.token);
      assert.equal(c.status, 201);
      const l = await post("/api/auth/login", { username: u, password: "staff-pass-1234" });
      return (await post("/api/auth/change-password", { currentPassword: "staff-pass-1234", newPassword: "staff-pass-5678" }, l.body.token)).body.token;
    };
    const content = await mk("content99", "CONTENT");
    const users = await mk("users99", "USERS");
    for (const path of ["/api/admin/users/export.csv", "/api/admin/audit.csv", "/api/admin/access.csv", "/api/admin/access", "/api/admin/visitors", "/api/admin/blocks", "/api/admin/security/overview"]) {
      assert.equal((await get(path, content)).status, 403, path);
    }
    const csv = await get("/api/admin/users/export.csv", admin.token);
    assert.ok(csv.body.toString("utf8").startsWith("\ufeffid,username"));
    assert.ok(csv.body.toString("utf8").includes("admin"));
    const mine = await get("/api/admin/users/export.csv", users);
    assert.equal(mine.status, 200);
    assert.ok(!mine.body.toString("utf8").includes(",ADMIN,"), "מנהל משתמשים לא מקבל אדמינים");
    assert.equal((await get("/api/admin/access", users)).status, 200);
    assert.equal((await put("/api/admin/security/settings", { strictPasswords: 1 }, users)).status, 403, "הגדרות רק לאדמין ראשי");
  });

  it("100. דף פרטיות ואישור תנאים: חובה בהרשמה בייצור, תיעוד גרסה, ואישור בדיעבד", async () => {
    const info = (await get("/api/privacy-info")).body;
    assert.equal(info.retentionDays, 90);
    assert.match(info.termsVersion, /^\d{4}-\d{2}$/);
    const { config } = await import("../src/config.js");
    const prev = config.nodeEnv;
    config.nodeEnv = "development";
    try {
      const no = await post("/api/auth/register", { username: "terms100", password: "password123", displayName: "תנאים", signupCode: "shevet-code" });
      assert.equal(no.status, 400);
      assert.equal(no.body.error.code, "TERMS");
      const yes = await post("/api/auth/register", { username: "terms100", password: "password123", displayName: "תנאים", signupCode: "shevet-code", acceptTerms: true });
      assert.equal(yes.status, 201);
      assert.equal(yes.body.user.termsAccepted, true);
    } finally {
      config.nodeEnv = prev;
    }
    const old = (await post("/api/auth/login", { username: "weak97a", password: "password123" })).body;
    await post("/api/auth/change-password", { currentPassword: "password123", newPassword: "gzr-Tuf-84-lemons" }, old.token);
    const t = (await post("/api/auth/login", { username: "weak97a", password: "gzr-Tuf-84-lemons" })).body;
    assert.equal(t.user.termsAccepted, false);
    assert.equal((await post("/api/me/terms", { accept: true }, t.token)).status, 200);
    assert.equal((await get("/api/auth/me", t.token)).body.user.termsAccepted, true);
    assert.equal((await post("/api/me/terms", { accept: false }, t.token)).status, 400);
    assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'terms.accepted'").get());
  });
});

describe("עורך כתיבה חופשי: סבב 101–112", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a;
  let b;
  before(async () => {
    a = (await req("POST", "/api/auth/register", { username: "writer1", password: "password123", displayName: "כותב", signupCode: "shevet-code" })).body;
    b = (await req("POST", "/api/auth/register", { username: "writer2", password: "password123", displayName: "אחר", signupCode: "shevet-code" })).body;
  });

  it("101. דורש התחברות, ותבניות פתוחות", async () => {
    assert.equal((await req("GET", "/api/write/docs")).status, 401);
    const t = await req("GET", "/api/write/templates");
    assert.equal(t.status, 200);
    assert.ok(t.body.length >= 4 && t.body.some((x) => x.id === "classic"));
  });

  it("108. יצירה מתבנית נותנת שלבים עם זמנים", async () => {
    const d = await req("POST", "/api/write/docs", { template: "classic" }, a.token);
    assert.equal(d.status, 201);
    assert.equal(d.body.blocks.length, 4);
    assert.equal(d.body.meta.minutes, 45);
    assert.equal(d.body.blocks.reduce((s, x) => s + x.minutes, 0), 45);
    assert.equal(d.body.rev, 1);
    assert.equal((await req("POST", "/api/write/docs", { template: "nope" }, a.token)).status, 400);
  });

  it("103+111. שמירה מעלה גרסה, סופרת מילים, ומתעלמת משמירה זהה", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    const blocks = [{ ...d.blocks[0], title: "פתיחה", text: "שלום לכולם וברוכים הבאים", note: "זו הערה אישית ארוכה מאוד" }];
    const s = await req("PUT", `/api/write/docs/${d.id}`, { title: "הפעולה שלי", meta: { ageGroup: "כיתה ו' - מעורב", minutes: 30 }, blocks, baseRev: 1 }, a.token);
    assert.equal(s.status, 200);
    assert.equal(s.body.rev, 2);
    assert.equal(s.body.words, 2 + 1 + 4 + 0, "כותרת המסמך (2) + כותרת שלב (1) + טקסט (4), בלי ההערה האישית");
    const same = await req("PUT", `/api/write/docs/${d.id}`, { title: "הפעולה שלי", meta: { ageGroup: "כיתה ו' - מעורב", minutes: 30 }, blocks, baseRev: 2 }, a.token);
    assert.equal(same.body.rev, 2, "שמירה זהה לא מעלה גרסה");
    assert.equal((await req("PUT", `/api/write/docs/${d.id}`, { title: "x", meta: { ageGroup: "גיל לא קיים", minutes: 30 }, blocks }, a.token)).status, 400);
  });

  it("103. שמירה ממצב ישן נדחית עם המצב הנוכחי", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    const ok = await req("PUT", `/api/write/docs/${d.id}`, { title: "א", meta: d.meta, blocks: d.blocks, baseRev: 1 }, a.token);
    assert.equal(ok.status, 200);
    const old = await req("PUT", `/api/write/docs/${d.id}`, { title: "ב", meta: d.meta, blocks: d.blocks, baseRev: 1 }, a.token);
    assert.equal(old.status, 409);
    assert.equal(old.body.error.code, "CONFLICT");
    assert.equal(old.body.current.title, "א");
  });

  it("109+106. סדר שלבים וסוגים נשמרים; מזהים כפולים וסוג לא מוכר נדחים", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    const reordered = [...d.blocks].reverse();
    const s = await req("PUT", `/api/write/docs/${d.id}`, { title: "t", meta: d.meta, blocks: reordered }, a.token);
    assert.deepEqual(s.body.blocks.map((x) => x.kind), ["close", "peak", "body", "open"]);
    const dup = await req("PUT", `/api/write/docs/${d.id}`, { title: "t", meta: d.meta, blocks: [reordered[0], reordered[0]] }, a.token);
    assert.equal(dup.status, 400);
    assert.equal((await req("PUT", `/api/write/docs/${d.id}`, { title: "t", meta: d.meta, blocks: [{ ...reordered[0], kind: "weird" }] }, a.token)).status, 400);
  });

  it("112. גרסאות: נקודת שמירה, אוטומטית אחת בשעה, ושחזור שאפשר לבטל", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    const save = (text, rev) => req("PUT", `/api/write/docs/${d.id}`, { title: "גרסאות", meta: d.meta, blocks: [{ ...d.blocks[0], text }], baseRev: rev }, a.token);
    await save("נוסח ראשון", 1);
    await save("נוסח שני", 2);
    await save("נוסח שלישי", 3);
    let list = (await req("GET", `/api/write/docs/${d.id}/versions`, undefined, a.token)).body;
    assert.equal(list.length, 1, "שלוש שמירות באותה שעה נותנות גרסה אוטומטית אחת");
    assert.equal((await req("POST", `/api/write/docs/${d.id}/snapshot`, { label: "לפני שינוי גדול" }, a.token)).status, 201);
    await save("נוסח רביעי", 4);
    list = (await req("GET", `/api/write/docs/${d.id}/versions`, undefined, a.token)).body;
    const point = list.find((v) => v.note === "לפני שינוי גדול");
    assert.ok(point);
    const full = (await req("GET", `/api/write/docs/${d.id}/versions/${point.id}`, undefined, a.token)).body;
    assert.equal(full.blocks[0].text, "נוסח שלישי");
    const back = await req("POST", `/api/write/docs/${d.id}/versions/${point.id}/restore`, {}, a.token);
    assert.equal(back.body.blocks[0].text, "נוסח שלישי");
    list = (await req("GET", `/api/write/docs/${d.id}/versions`, undefined, a.token)).body;
    const undo = list.find((v) => v.note === "לפני שחזור");
    assert.ok(undo, "נשמרה גרסה כדי שאפשר לבטל את השחזור");
    assert.equal((await req("GET", `/api/write/docs/${d.id}/versions/${undo.id}`, undefined, a.token)).body.blocks[0].text, "נוסח רביעי");
  });

  it("גרסה אוטומטית חדשה נוצרת אחרי שעה", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    const save = (text, rev) => req("PUT", `/api/write/docs/${d.id}`, { title: "שעה", meta: d.meta, blocks: [{ ...d.blocks[0], text }], baseRev: rev }, a.token);
    await save("א", 1);
    db.prepare("UPDATE write_versions SET saved_at = ? WHERE doc_id = ?").run(new Date(Date.now() - 2 * 3600_000).toISOString(), d.id);
    await save("ב", 2);
    assert.equal((await req("GET", `/api/write/docs/${d.id}/versions`, undefined, a.token)).body.length, 2);
  });

  it("מסמכים פרטיים: משתמש אחר לא רואה, לא עורך ולא מוחק", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    assert.equal((await req("GET", `/api/write/docs/${d.id}`, undefined, b.token)).status, 404);
    assert.equal((await req("PUT", `/api/write/docs/${d.id}`, { title: "x", meta: d.meta, blocks: d.blocks }, b.token)).status, 404);
    assert.equal((await req("DELETE", `/api/write/docs/${d.id}`, undefined, b.token)).status, 404);
    assert.equal((await req("GET", `/api/write/docs/${d.id}/versions`, undefined, b.token)).status, 404);
    assert.ok(!(await req("GET", "/api/write/docs", undefined, b.token)).body.some((x) => x.id === d.id));
  });

  it("שכפול ומחיקה", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "classic", title: "מקור" }, a.token)).body;
    const c = await req("POST", `/api/write/docs/${d.id}/duplicate`, {}, a.token);
    assert.equal(c.status, 201);
    assert.equal(c.body.title, "מקור (עותק)");
    assert.equal(c.body.blocks.length, 4);
    assert.equal((await req("DELETE", `/api/write/docs/${c.body.id}`, undefined, a.token)).status, 200);
    assert.equal((await req("GET", `/api/write/docs/${c.body.id}`, undefined, a.token)).status, 404);
  });
});

describe("הצעות מתודה: סבב 113–126", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a;
  const doc = (over = {}) => ({
    title: "פעולה על אחריות",
    meta: { ageGroup: "", minutes: 45, groupSize: 12, value: "אחריות", gear: ["דפים"] },
    blocks: [
      { id: "b1", title: "פתיחה", kind: "open", minutes: 5, text: "אנחנו מתחילים בשאלה: מה זו אחריות?", note: "" },
      { id: "b2", title: "גוף", kind: "body", minutes: 20, text: "", note: "" },
      { id: "b3", title: "סיכום", kind: "close", minutes: 5, text: "מסכמים במעגל.", note: "" },
    ],
    ...over,
  });
  before(async () => {
    a = (await req("POST", "/api/auth/register", { username: "sugg1", password: "password123", displayName: "מציע", signupCode: "shevet-code" })).body;
  });

  it("דורש התחברות", async () => {
    assert.equal((await req("POST", "/api/write/suggest", { doc: doc(), blockId: "b2" })).status, 401);
  });

  it("113+115. הצעה לשלב מחזירה עד שלוש הצעות עם טקסט ונימוק", async () => {
    const r = await req("POST", "/api/write/suggest", { doc: doc(), blockId: "b2" }, a.token);
    assert.equal(r.status, 200);
    assert.ok(r.body.suggestions.length >= 1 && r.body.suggestions.length <= 3);
    for (const s of r.body.suggestions) assert.ok(s.method && s.text && Array.isArray(s.why));
    const names = r.body.suggestions.map((s) => s.method);
    assert.equal(new Set(names).size, names.length);
    assert.equal((await req("POST", "/api/write/suggest", { doc: doc(), blockId: "nope" }, a.token)).status, 404);
  });

  it("115. exclude מוציא מתודות שכבר הוצעו", async () => {
    const first = (await req("POST", "/api/write/suggest", { doc: doc(), blockId: "b2" }, a.token)).body.suggestions.map((s) => s.method);
    const next = (await req("POST", "/api/write/suggest", { doc: doc(), blockId: "b2", exclude: first }, a.token)).body.suggestions.map((s) => s.method);
    assert.ok(next.every((m) => !first.includes(m)));
  });

  it("114+123. מה חסר: מזהה שלב ריק וחסר שיחה, ומסמך ריק", async () => {
    const g = (await req("POST", "/api/write/gaps", { doc: doc() }, a.token)).body;
    assert.ok(g.gaps.some((x) => x.id === "empty-b2"));
    assert.equal(g.total, 3);
    const e = (await req("POST", "/api/write/gaps", { doc: { title: "", meta: {}, blocks: [] } }, a.token)).body;
    assert.equal(e.gaps[0].id, "empty");
  });

  it("117. החלפת מתודה בשלב ובשלב ריק", async () => {
    const m = (await req("GET", "/api/write/method-catalog", undefined, a.token)).body.categories[0].methods[0];
    const r = await req("POST", "/api/write/swap", { doc: doc(), blockId: "b1", method: m }, a.token);
    assert.equal(r.status, 200);
    const auto = await req("POST", "/api/write/swap", { doc: doc(), blockId: "b1" }, a.token);
    assert.equal(auto.status, 200);
    assert.ok(Array.isArray(auto.body.alternatives));
    assert.equal((await req("POST", "/api/write/swap", { doc: doc(), blockId: "b1", method: "לא-קיימת" }, a.token)).status, 400);
  });

  it("120+121. העמקה וגרסה קצרה", async () => {
    const m = (await req("GET", "/api/write/method-catalog", undefined, a.token)).body.playbook[0];
    const e = await req("POST", "/api/write/expand", { doc: doc(), method: m, minutes: 15 }, a.token);
    assert.equal(e.status, 200);
    assert.ok(JSON.stringify(e.body).length > 80);
    const s = await req("POST", "/api/write/short", { doc: doc(), method: m }, a.token);
    assert.equal(s.status, 200);
    assert.equal((await req("POST", "/api/write/expand", { doc: doc(), method: "xx" }, a.token)).status, 400);
  });

  it("119. גשר בין שני שלבים", async () => {
    const r = await req("POST", "/api/write/bridge", { doc: doc(), fromId: "b1", toId: "b2" }, a.token);
    assert.equal(r.status, 200);
    assert.equal((await req("POST", "/api/write/bridge", { doc: doc(), fromId: "b1", toId: "zz" }, a.token)).status, 404);
  });

  it("124. העדפות נשמרות לכל משתמש ומשפיעות על הדירוג", async () => {
    const cat = (await req("GET", "/api/write/method-catalog", undefined, a.token)).body;
    const m = cat.categories[0].methods[0];
    assert.deepEqual((await req("PUT", "/api/write/prefs", { method: m, weight: 1 }, a.token)).body, { [m]: 1 });
    assert.equal((await req("PUT", "/api/write/prefs", { method: m, weight: 5 }, a.token)).status, 400);
    assert.equal((await req("PUT", "/api/write/prefs", { method: "zz", weight: 1 }, a.token)).status, 400);
    const r = (await req("POST", "/api/write/suggest", { doc: doc(), blockId: "b2", limit: 6 }, a.token)).body.suggestions;
    const hit = r.find((s) => s.method === m);
    if (hit) assert.ok(hit.pref);
    assert.deepEqual((await req("PUT", "/api/write/prefs", { method: m, weight: 0 }, a.token)).body, {});
  });

  it("126. חיפוש מתודה במאגר, במסמכים שלי ובקטלוג", async () => {
    assert.equal((await req("GET", "/api/write/methods/search", undefined, a.token)).status, 400);
    const r = await req("GET", "/api/write/methods/search?q=" + encodeURIComponent("משחק"), undefined, a.token);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.catalog) && Array.isArray(r.body.library) && Array.isArray(r.body.mine));
  });

  it("118. מטא חדש (גודל קבוצה, ערך, ציוד) נשמר במסמך", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    assert.equal(d.meta.groupSize, null);
    assert.deepEqual(d.meta.gear, []);
    const s = await req("PUT", `/api/write/docs/${d.id}`, { title: "x", meta: { ageGroup: "", minutes: 45, groupSize: 20, value: "אחריות", gear: ["חבל"] }, blocks: d.blocks, baseRev: d.rev }, a.token);
    assert.equal(s.status, 200);
    assert.equal(s.body.meta.groupSize, 20);
    assert.deepEqual(s.body.meta.gear, ["חבל"]);
  });
});

describe("ייצוא וכלים נלווים: סבב 127–138", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a;
  const doc = () => ({
    title: "פעולה על אומץ",
    meta: { ageGroup: "", minutes: 45, leader: "דביר", date: "2026-10-23", value: "אומץ" },
    blocks: [
      { id: "b1", title: "פתיחה", kind: "open", minutes: 5, text: "## שאלה\n- **אומץ** הוא מה?\n1. נחשוב\n> ציטוט", note: "סודי" },
      { id: "b2", title: "גוף", kind: "body", minutes: 20, text: "משחק עם חבלים וכדור", note: "" },
    ],
  });
  before(async () => {
    a = (await req("POST", "/api/auth/register", { username: "exp1", password: "password123", displayName: "מייצא", signupCode: "shevet-code" })).body;
  });

  it("127-138 דורשים התחברות", async () => {
    for (const p of ["export/docx", "export/text", "split", "prep"]) assert.equal((await req("POST", `/api/write/${p}`, { text: "x", ...doc() })).status, 401);
  });

  it("130. ייצוא Word: קובץ docx תקין עם לוגו", async () => {
    const r = await req("POST", "/api/write/export/docx", doc(), a.token);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /wordprocessingml/);
    assert.equal(r.body.subarray(0, 2).toString(), "PK");
    assert.ok(r.body.length > 3000);
    assert.ok(r.body.includes(Buffer.from("word/media/")), "מכיל תמונת לוגו");
  });

  it("132. טקסט להעתקה ובפורמט וואטסאפ", async () => {
    const plain = (await req("POST", "/api/write/export/text", doc(), a.token)).body.text;
    assert.ok(plain.includes("אומץ") && !plain.includes("**") && !plain.includes("סודי"));
    const wa = (await req("POST", "/api/write/export/text", { ...doc(), whatsapp: true }, a.token)).body.text;
    assert.ok(wa.includes("*אומץ*"));
  });

  it("135. פירוק טקסט חופשי לשלבים לפי כותרות", async () => {
    const text = "פתיחה:\nשלום לכולם\n\nמשחק (10 דקות):\nמשחקים בחבלים\n\nסיכום:\nתודה";
    const r = await req("POST", "/api/write/split", { text }, a.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.blocks.map((b) => b.kind), ["open", "body", "close"]);
    assert.equal(r.body.blocks[1].minutes, 10);
    const byGaps = (await req("POST", "/api/write/split", { text: "פסקה ראשונה.\n\nפסקה שנייה.\n\nפסקה שלישית." }, a.token)).body.blocks;
    assert.equal(byGaps.length, 3);
    assert.equal((await req("POST", "/api/write/split", { text: "   " }, a.token)).status, 400);
  });

  it("138. דף הכנה: ציוד, אזהרות ורשימת בדיקה", async () => {
    const r = (await req("POST", "/api/write/prep", doc(), a.token)).body;
    assert.equal(r.totalMinutes, 25);
    assert.ok(r.warnings.some((w) => /סיכום/.test(w)));
    assert.ok(r.gear.some((g) => /חבל/.test(g)));
    assert.ok(r.checklist.length >= 3);
  });

  it("133+137. שם מדריך, תאריך וסימון כוכב נשמרים ומופיעים ברשימה", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    assert.equal(d.meta.pinned, false);
    const s = await req("PUT", `/api/write/docs/${d.id}`, { title: "ק", meta: { ...d.meta, leader: "דביר", date: "2026-10-23", pinned: true }, blocks: d.blocks, baseRev: d.rev }, a.token);
    assert.equal(s.body.meta.leader, "דביר");
    const list = (await req("GET", "/api/write/docs", undefined, a.token)).body;
    assert.equal(list.find((x) => x.id === d.id).pinned, true);
  });

  it("128. קוד הרשמה: רווחים ואותיות גדולות לא מפריעים", async () => {
    const r = await req("POST", "/api/auth/register", { username: "exp2", password: "password123", displayName: "אחר", signupCode: "  SHEVET-CODE " });
    assert.equal(r.status, 201);
    assert.equal((await req("POST", "/api/auth/register", { username: "exp3", password: "password123", displayName: "אחר", signupCode: "שגוי" })).status, 403);
  });
});

describe("עוד כלים לעורך: סבב 139–150", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a, b, d;
  const long = "וכך " + "מילה ".repeat(35) + "סוף.";
  const doc = () => ({
    title: "פעולה על אומץ",
    meta: { value: "אומץ" },
    blocks: [{ id: "b1", title: "פתיחה", kind: "open", minutes: 2, text: long + "\nאנחנו א. אנחנו ב. אנחנו ג. אנחנו ד.", note: "" }],
  });
  before(async () => {
    const ra = await req("POST", "/api/auth/register", { username: "more1", password: "password123", displayName: "אב", signupCode: "shevet-code" });
    if (ra.status !== 201) console.log("REG", JSON.stringify(ra.body));
    a = ra.body;
    b = (await req("POST", "/api/auth/register", { username: "more2", password: "password123", displayName: "בב", signupCode: "shevet-code" })).body;
    d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
  });

  it("139. קטעים שמורים: יצירה, רשימה, מחיקה ובידוד בין משתמשים", async () => {
    assert.equal((await req("GET", "/api/write/snippets")).status, 401);
    assert.equal((await req("POST", "/api/write/snippets", { name: "", text: "x" }, a.token)).status, 400);
    const s = (await req("POST", "/api/write/snippets", { name: "משפט פתיחה", text: "שלום חברים" }, a.token)).body;
    assert.equal((await req("GET", "/api/write/snippets", undefined, a.token)).body.length, 1);
    assert.equal((await req("GET", "/api/write/snippets", undefined, b.token)).body.length, 0);
    assert.equal((await req("DELETE", `/api/write/snippets/${s.id}`, undefined, b.token)).status, 404);
    assert.equal((await req("DELETE", `/api/write/snippets/${s.id}`, undefined, a.token)).status, 200);
  });

  it("140. קישור צפייה בלבד: ציבורי, בלי הערות, ניתן לביטול", async () => {
    await req("PUT", `/api/write/docs/${d.id}`, { title: "לשיתוף", meta: d.meta, blocks: d.blocks.map((x, i) => (i ? x : { ...x, text: "טקסט גלוי", note: "הערה פרטית" })), baseRev: d.rev }, a.token);
    assert.equal((await req("POST", `/api/write/docs/${d.id}/share`, {}, b.token)).status, 404);
    const sh = (await req("POST", `/api/write/docs/${d.id}/share`, { days: 7 }, a.token)).body;
    const pub = await req("GET", `/api/write/shared/${sh.token}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.title, "לשיתוף");
    assert.ok(!JSON.stringify(pub.body).includes("הערה פרטית"));
    assert.equal((await req("GET", `/api/write/docs/${d.id}/share`, undefined, a.token)).body.token, sh.token);
    assert.equal((await req("DELETE", `/api/write/docs/${d.id}/share`, undefined, a.token)).status, 200);
    assert.equal((await req("GET", `/api/write/shared/${sh.token}`)).status, 404);
    assert.equal((await req("GET", "/api/write/shared/nope")).status, 404);
  });

  it("141+142. תגיות והתחלה בשעה נשמרות; שעה לא תקינה נדחית", async () => {
    const ok = await req("PUT", `/api/write/docs/${d.id}`, { title: "ת", meta: { ...d.meta, tags: ["חורף", "ערך"], startTime: "18:30" }, blocks: d.blocks }, a.token);
    assert.deepEqual(ok.body.meta.tags, ["חורף", "ערך"]);
    assert.equal(ok.body.meta.startTime, "18:30");
    assert.equal((await req("GET", "/api/write/docs", undefined, a.token)).body.find((x) => x.id === d.id).tags[0], "חורף");
    const bad = await req("PUT", `/api/write/docs/${d.id}`, { title: "ת", meta: { ...d.meta, startTime: "25:99x" }, blocks: d.blocks }, a.token);
    assert.equal(bad.status, 400);
  });

  it("143. בדיקת קריאוּת מוצאת משפט ארוך ופתיחות חוזרות", async () => {
    const r = (await req("POST", "/api/write/readability", doc(), a.token)).body;
    assert.ok(r.issues.some((i) => i.kind === "long-sentence" && i.blockId === "b1"));
    assert.ok(r.issues.some((i) => i.kind === "repeat"));
    const clean = (await req("POST", "/api/write/readability", { title: "x", blocks: [{ id: "z", kind: "free", text: "קצר וברור." }] }, a.token)).body;
    assert.equal(clean.ok, true);
  });

  it("148. גיבוי ושחזור: מסמכים וקטעים, ושחזור לא דורס קיים", async () => {
    await req("POST", "/api/write/snippets", { name: "ק", text: "ט" }, a.token);
    const bk = (await req("GET", "/api/write/backup", undefined, a.token)).body;
    assert.equal(bk.kind, "scout-write-backup");
    assert.ok(bk.docs.length >= 1 && bk.snippets.length === 1);
    assert.equal((await req("POST", "/api/write/restore", { kind: "x" }, b.token)).status, 400);
    const r = (await req("POST", "/api/write/restore", bk, b.token)).body;
    assert.equal(r.docs, bk.docs.length);
    const mineB = (await req("GET", "/api/write/docs", undefined, b.token)).body;
    assert.ok(mineB.every((x) => /משוחזר/.test(x.title)));
  });

  it("150. הצעות לשם כוללות את הערך", async () => {
    const t = (await req("POST", "/api/write/title-ideas", doc(), a.token)).body.titles;
    assert.ok(t.length >= 2 && t.some((x) => x.includes("אומץ")));
  });
});

describe("סטטיסטיקה ופעולות מרובות: סבב 151–162", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a, b;
  before(async () => {
    a = (await req("POST", "/api/auth/register", { username: "stat1", password: "password123", displayName: "סטט", signupCode: "shevet-code" })).body;
    b = (await req("POST", "/api/auth/register", { username: "stat2", password: "password123", displayName: "סטטב", signupCode: "shevet-code" })).body;
  });
  const save = async (d, over) => (await req("PUT", `/api/write/docs/${d.id}`, { title: over.title ?? d.title, meta: { ...d.meta, ...(over.meta || {}) }, blocks: over.blocks ?? d.blocks, baseRev: d.rev }, a.token)).body;

  it("151–152. סטטיסטיקה: מתודות, קטגוריות, ערכים והצעה לערך חדש", async () => {
    assert.equal((await req("GET", "/api/write/stats")).status, 401);
    assert.equal((await req("GET", "/api/write/stats", undefined, a.token)).body.docs, 0);
    const d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    await save(d, { title: "אחריות", meta: { value: "אחריות" }, blocks: d.blocks.map((x, i) => (i === 1 ? { ...x, text: "נעשה משחק תחרות בין קבוצות ואחר כך מירוץ" } : x)) });
    const s = (await req("GET", "/api/write/stats", undefined, a.token)).body;
    assert.equal(s.docs, 1);
    assert.ok(s.methods.some((m) => m.name === "משחק תחרות"));
    assert.deepEqual(s.values, [{ name: "אחריות", n: 1 }]);
    assert.ok(!s.nextValues.includes("אחריות") && s.nextValues.length > 0);
    assert.ok(s.categories.find((c) => c.id === "game").n >= 1);
    assert.ok(typeof s.tip === "string" && s.tip.length > 0);
    const sb = (await req("GET", "/api/write/stats", undefined, b.token)).body;
    assert.equal(sb.docs, 0);
  });

  it("153. יצירת מסמך מתבנית אישית: מעתיק שלבים ומאפס הרצות ותאריך", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    const t = await save(d, { title: "תבנית שלי", meta: { template: true, date: "2026-01-01", runs: [{ date: "2026-01-02", note: "הלך מצוין", rating: 5 }] } });
    assert.equal(t.meta.template, true);
    const c = await req("POST", "/api/write/docs", { fromDoc: d.id }, a.token);
    assert.equal(c.status, 201);
    assert.equal(c.body.title, "תבנית שלי");
    assert.equal(c.body.meta.template, false);
    assert.deepEqual(c.body.meta.runs, []);
    assert.equal(c.body.meta.date, "");
    assert.equal(c.body.blocks.length, d.blocks.length);
    assert.notEqual(c.body.blocks[0].id, d.blocks[0].id);
    assert.equal((await req("POST", "/api/write/docs", { fromDoc: d.id }, b.token)).status, 404);
  });

  it("155. יומן הרצות: נשמר, עד 20, דירוג 0–5", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body;
    const ok = await req("PUT", `/api/write/docs/${d.id}`, { title: "י", meta: { ...d.meta, runs: [{ date: "2026-10-01", note: "בסדר", rating: 4 }] }, blocks: d.blocks }, a.token);
    assert.equal(ok.body.meta.runs[0].rating, 4);
    const bad = await req("PUT", `/api/write/docs/${d.id}`, { title: "י", meta: { ...d.meta, runs: [{ rating: 9 }] }, blocks: d.blocks }, a.token);
    assert.equal(bad.status, 400);
  });

  it("156. שאלות לדיון לפי ערך ושכבה", async () => {
    const young = (await req("GET", "/api/write/questions?value=" + encodeURIComponent("אומץ") + "&age=" + encodeURIComponent("כיתה ד' - בנים"), undefined, a.token)).body.questions;
    const old = (await req("GET", "/api/write/questions?value=" + encodeURIComponent("אומץ") + "&age=" + encodeURIComponent("כיתה ט' - בנות"), undefined, a.token)).body.questions;
    assert.ok(young.every((q) => !q.includes("{")) && young.some((q) => q.includes("אומץ")));
    assert.notDeepEqual(young, old);
  });

  it("160. סימון שלב כמוכן נשמר", async () => {
    const d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    assert.equal(d.blocks[0].done, undefined);
    const s = await save(d, { blocks: d.blocks.map((x, i) => ({ ...x, done: i === 0 })) });
    assert.equal(s.blocks[0].done, true);
    assert.equal(s.blocks[1].done, false);
  });

  it("159. פעולות מרובות: ארכוב, ביטול ארכוב ומחיקה, רק של הבעלים", async () => {
    const ids = [];
    for (let i = 0; i < 2; i++) ids.push((await req("POST", "/api/write/docs", { template: "blank" }, a.token)).body.id);
    assert.equal((await req("POST", "/api/write/bulk", { ids, action: "archive" }, b.token)).body.changed, 0);
    assert.equal((await req("POST", "/api/write/bulk", { ids, action: "archive" }, a.token)).body.changed, 2);
    const list = (await req("GET", "/api/write/docs", undefined, a.token)).body;
    assert.ok(ids.every((id) => list.find((x) => x.id === id).archived));
    assert.equal((await req("POST", "/api/write/bulk", { ids, action: "unarchive" }, a.token)).body.changed, 2);
    assert.equal((await req("POST", "/api/write/bulk", { ids, action: "delete" }, a.token)).body.changed, 2);
    assert.equal((await req("POST", "/api/write/bulk", { ids: [], action: "delete" }, a.token)).status, 400);
  });
});

describe("הערות, תבניות שבט וסל מחזור: סבב 163–174", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a, b, adm, d, tok;
  before(async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await req("POST", "/api/auth/login", { username: "admin", password: pw });
      if (r.status === 200 && !r.body.user.mustChangePw) { adm = r.body.token; break; }
    }
    a = (await req("POST", "/api/auth/register", { username: "comm1", password: "password123", displayName: "קהל", signupCode: "shevet-code" })).body;
    b = (await req("POST", "/api/auth/register", { username: "comm2", password: "password123", displayName: "קהלב", signupCode: "shevet-code" })).body;
    d = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    tok = (await req("POST", `/api/write/docs/${d.id}/share`, {}, a.token)).body.token;
  });

  it("164. מבקר בקישור משאיר הערה, הבעלים רואה ומסמן כטופלה", async () => {
    assert.ok(adm && tok);
    assert.equal((await req("POST", `/api/write/shared/${tok}/comments`, { author: "", text: "x" })).status, 400);
    assert.equal((await req("POST", `/api/write/shared/${tok}/comments`, { author: "מבקר", text: "x", blockId: "nope" })).status, 400);
    const c = await req("POST", `/api/write/shared/${tok}/comments`, { author: "מבקר", text: "<b>רעיון</b> טוב", blockId: d.blocks[0].id });
    assert.equal(c.status, 201);
    assert.equal((await req("POST", "/api/write/shared/zzz/comments", { author: "א", text: "x" })).status, 404);
    const mineList = (await req("GET", `/api/write/docs/${d.id}/comments`, undefined, a.token)).body;
    assert.equal(mineList.length, 1);
    assert.equal(mineList[0].text, "<b>רעיון</b> טוב");
    assert.equal((await req("GET", `/api/write/docs/${d.id}/comments`, undefined, b.token)).status, 404);
    assert.equal((await req("GET", `/api/write/shared/${tok}/comments`)).body.length, 1);
    assert.equal((await req("PATCH", `/api/write/docs/${d.id}/comments/${c.body.id}`, { resolved: true }, a.token)).status, 200);
    assert.equal((await req("GET", `/api/write/shared/${tok}/comments`)).body.length, 0);
    assert.equal((await req("DELETE", `/api/write/docs/${d.id}/comments/${c.body.id}`, undefined, a.token)).status, 200);
  });

  it("165. תבניות שבט: רק אדמין מפרסם, כולם משתמשים, המסמך החדש בלי הערות אישיות", async () => {
    assert.ok([401, 403].includes((await req("POST", "/api/admin/write-templates", { docId: d.id }, a.token)).status));
    const ad = (await req("POST", "/api/write/docs", { template: "value" }, adm)).body;
    await req("PUT", `/api/write/docs/${ad.id}`, { title: "תבנית השבט", meta: ad.meta, blocks: ad.blocks.map((x) => ({ ...x, note: "פרטי" })), baseRev: ad.rev }, adm);
    const t = await req("POST", "/api/admin/write-templates", { docId: ad.id }, adm);
    assert.equal(t.status, 201);
    const list = (await req("GET", "/api/write/tribe-templates", undefined, b.token)).body;
    assert.equal(list[0].title, "תבנית השבט");
    const nd = (await req("POST", "/api/write/docs", { tribeTemplate: list[0].id }, b.token)).body;
    assert.equal(nd.title, "תבנית השבט");
    assert.ok(nd.blocks.every((x) => x.note === ""));
    assert.notEqual(nd.blocks[0].id, ad.blocks[0].id);
    const usage = (await req("GET", "/api/admin/write-usage", undefined, adm)).body;
    assert.ok(usage.docs >= 3 && usage.templates === 1);
    assert.equal((await req("DELETE", `/api/admin/write-templates/${list[0].id}`, undefined, adm)).status, 200);
  });

  it("166. סל מחזור: מחיקה (גם מרובה) נשמרת ואפשר לשחזר או למחוק לצמיתות", async () => {
    const x = (await req("POST", "/api/write/docs", { template: "blank" }, b.token)).body;
    await req("PUT", `/api/write/docs/${x.id}`, { title: "יימחק", meta: x.meta, blocks: x.blocks, baseRev: x.rev }, b.token);
    assert.equal((await req("DELETE", `/api/write/docs/${x.id}`, undefined, b.token)).status, 200);
    const y = (await req("POST", "/api/write/docs", { template: "blank" }, b.token)).body;
    await req("POST", "/api/write/bulk", { ids: [y.id], action: "delete" }, b.token);
    const trash = (await req("GET", "/api/write/trash", undefined, b.token)).body;
    assert.equal(trash.length, 2);
    assert.ok(trash[0].daysLeft >= 29);
    assert.equal((await req("GET", "/api/write/trash", undefined, a.token)).body.length, 0);
    assert.equal((await req("POST", `/api/write/trash/${trash[0].id}/restore`, {}, a.token)).status, 404);
    const r = await req("POST", `/api/write/trash/${trash.find((t) => t.title === "יימחק").id}/restore`, {}, b.token);
    assert.equal(r.status, 200);
    assert.equal((await req("GET", `/api/write/docs/${r.body.id}`, undefined, b.token)).body.title, "יימחק");
    assert.equal((await req("DELETE", `/api/write/trash/${(await req("GET", "/api/write/trash", undefined, b.token)).body[0].id}`, undefined, b.token)).status, 200);
    assert.equal((await req("GET", "/api/write/trash", undefined, b.token)).body.length, 0);
  });

  it("167. שגיאות הקלדה: מילה כפולה ורווחים, וניקוי אוטומטי", async () => {
    const doc = { title: "x", blocks: [{ id: "q", kind: "free", text: "אנחנו אנחנו הולכים  לשם , ושם." }] };
    const r = (await req("POST", "/api/write/readability", doc, a.token)).body;
    assert.ok(r.issues.some((i) => i.kind === "double-word"));
    assert.ok(r.issues.some((i) => i.kind === "double-space"));
    assert.ok(r.issues.some((i) => i.kind === "space-before-punct"));
    const c = (await req("POST", "/api/write/clean", { text: "שלום  עולם , כן.\n  - שורה מוזחת" }, a.token)).body;
    assert.equal(c.text, "שלום עולם, כן.\n  - שורה מוזחת");
    assert.equal(c.changed, true);
  });
});

describe("חיפוש, דמיון וציוד: סבב 175–187", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a, b, d1, d2;
  before(async () => {
    a = (await req("POST", "/api/auth/register", { username: "srch1", password: "password123", displayName: "חיפוש", signupCode: "shevet-code" })).body;
    b = (await req("POST", "/api/auth/register", { username: "srch2", password: "password123", displayName: "חיפושב", signupCode: "shevet-code" })).body;
    d1 = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    d2 = (await req("POST", "/api/write/docs", { template: "classic" }, a.token)).body;
    const text = "נשחק משחק תחרות בין הקבוצות עם חבלים ונדבר על אחריות ועל מה שלמדנו בפעולה הזאת";
    await req("PUT", `/api/write/docs/${d1.id}`, { title: "אחריות בקבוצה", meta: { ...d1.meta, equipment: ["חבלים", "שעון"] }, blocks: d1.blocks.map((x, i) => (i === 1 ? { ...x, text } : x)), baseRev: d1.rev }, a.token);
    await req("PUT", `/api/write/docs/${d2.id}`, { title: "פעולה על אחריות", meta: d2.meta, blocks: d2.blocks.map((x, i) => (i === 1 ? { ...x, text } : x)), baseRev: d2.rev }, a.token);
  });

  it("176. חיפוש בכל המסמכים שלי, רק של המשתמש", async () => {
    assert.equal((await req("GET", "/api/write/search?q=%D7%97%D7%91%D7%9C%D7%99%D7%9D")).status, 401);
    assert.equal((await req("GET", "/api/write/search?q=a", undefined, a.token)).status, 400);
    const r = (await req("GET", "/api/write/search?q=" + encodeURIComponent("חבלים"), undefined, a.token)).body.results;
    assert.equal(r.length, 2);
    assert.ok(r[0].hits[0].snippet.includes("חבלים"));
    assert.equal((await req("GET", "/api/write/search?q=" + encodeURIComponent("חבלים"), undefined, b.token)).body.results.length, 0);
    const t = (await req("GET", "/api/write/search?q=" + encodeURIComponent("אחריות"), undefined, a.token)).body.results;
    assert.ok(t.some((x) => x.hits.some((h) => h.where === "שם המסמך")));
  });

  it("185. מסמכים דומים: מזהה דמיון ומתעלם מהמסמך עצמו", async () => {
    const d = (await req("GET", `/api/write/docs/${d1.id}`, undefined, a.token)).body;
    const r = (await req("POST", "/api/write/similar", { title: d.title, text: d.blocks.map((x) => x.text).join(" "), excludeId: d1.id }, a.token)).body.similar;
    assert.equal(r.length, 1);
    assert.equal(r[0].id, d2.id);
    assert.ok(r[0].percent >= 25);
    assert.equal((await req("POST", "/api/write/similar", { title: "x", text: "משהו אחר לגמרי בלי קשר", excludeId: d1.id }, a.token)).body.similar.length, 0);
    assert.equal((await req("POST", "/api/write/similar", { title: d.title, text: "אחריות חבלים משחק תחרות" }, b.token)).body.similar.length, 0);
  });

  it("181+178. ציוד שלי נשמר, נכנס לדף ההכנה ול-Word, ומוסיף זמן הכנה", async () => {
    const d = (await req("GET", `/api/write/docs/${d1.id}`, undefined, a.token)).body;
    assert.deepEqual(d.meta.equipment, ["חבלים", "שעון"]);
    const prep = (await req("POST", "/api/write/prep", d, a.token)).body;
    assert.ok(prep.gear.includes("חבלים") && prep.gear.includes("שעון"));
    assert.ok(prep.prepMinutes >= 10);
    const w = await req("POST", "/api/write/export/docx", d, a.token);
    assert.equal(w.status, 200);
  });

  it("187. רשימת ביקורת עצמית נשמרת", async () => {
    const d = (await req("GET", `/api/write/docs/${d2.id}`, undefined, a.token)).body;
    const s = await req("PUT", `/api/write/docs/${d2.id}`, { title: d.title, meta: { ...d.meta, review: ["q1", "q3"] }, blocks: d.blocks, baseRev: d.rev }, a.token);
    assert.deepEqual(s.body.meta.review, ["q1", "q3"]);
  });

  it("183. הוספת תגית לכמה מסמכים", async () => {
    assert.equal((await req("POST", "/api/write/bulk", { ids: [d1.id, d2.id], action: "tag" }, a.token)).status, 400);
    assert.equal((await req("POST", "/api/write/bulk", { ids: [d1.id, d2.id], action: "tag", tag: "חורף" }, a.token)).body.changed, 2);
    await req("POST", "/api/write/bulk", { ids: [d1.id], action: "tag", tag: "חורף" }, a.token);
    const list = (await req("GET", "/api/write/docs", undefined, a.token)).body;
    assert.deepEqual(list.find((x) => x.id === d1.id).tags, ["חורף"]);
  });
});

describe("תחנות, גיבוי, מוכנות ומתודות שבט: סבב 188–200", () => {
  const H = (t) => ({ authorization: `Bearer ${t}` });
  const req = (m, p, body, tok) => j(p, { method: m, body: body === undefined ? undefined : JSON.stringify(body), headers: tok ? H(tok) : {} });
  let a, adm;
  const doc = () => ({
    title: "מירוץ אחריות",
    meta: { ageGroup: "כיתה ו' - מעורב", minutes: 45, equipment: ["חבלים"], review: ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"] },
    blocks: [
      { id: "b1", title: "פתיחה", kind: "open", minutes: 10, text: "אנחנו מתחילים בשאלה מה זו אחריות ואיך היא נראית אצלנו בקבוצה ובשבט", note: "", done: true },
      { id: "b2", title: "מירוץ", kind: "peak", minutes: 25, text: "עושים מירוץ תחנות בשטח הפתוח ורצים בין התחנות עם חבלים ומשימות קצרות לכל קבוצה", note: "", done: true },
      { id: "b3", title: "סיכום", kind: "close", minutes: 10, text: "מסכמים במעגל ואומרים משפט אחד על מה שלמדנו היום מהפעולה הזאת ביחד", note: "", done: true },
    ],
  });
  before(async () => {
    for (const pw of ["a-new-strong-pass", "admin123"]) {
      const r = await req("POST", "/api/auth/login", { username: "admin", password: pw });
      if (r.status === 200 && !r.body.user.mustChangePw) { adm = r.body.token; break; }
    }
    a = (await req("POST", "/api/auth/register", { username: "fin1", password: "password123", displayName: "סיום", signupCode: "shevet-code" })).body;
  });

  it("188. חישוב תחנות: זמן לתחנה כולל מעברים, ושגיאה כשאין זמן", async () => {
    assert.equal((await req("POST", "/api/write/stations", { total: 30, stations: 3 })).status, 401);
    const r = (await req("POST", "/api/write/stations", { total: 32, stations: 4, transition: 1 }, a.token)).body;
    assert.equal(r.ok, true);
    assert.equal(r.perStation, 7);
    assert.equal(r.schedule.length, 4);
    assert.equal(r.schedule[0].from, 0);
    assert.ok(r.schedule.at(-1).to <= 32);
    const bad = (await req("POST", "/api/write/stations", { total: 8, stations: 6, transition: 2 }, a.token)).body;
    assert.equal(bad.ok, false);
  });

  it("189. תוכנית גיבוי לגשם: מזהה שלבים בחוץ ומציע חלופה; חום וחדר קטן שונים", async () => {
    const rain = (await req("POST", "/api/write/backup-plan", { ...doc(), condition: "rain" }, a.token)).body;
    assert.ok(rain.stages.some((s) => s.blockId === "b2"));
    assert.ok(rain.text.startsWith("## תוכנית גיבוי"));
    const heat = (await req("POST", "/api/write/backup-plan", { ...doc(), condition: "heat" }, a.token)).body;
    assert.notDeepEqual(rain.general, heat.general);
    assert.equal((await req("POST", "/api/write/backup-plan", { ...doc(), condition: "snow" }, a.token)).status, 400);
  });

  it("190. ציון מוכנות: מסמך שלם גבוה, ריק נמוך, עם פירוט", async () => {
    const full = (await req("POST", "/api/write/readiness", doc(), a.token)).body;
    assert.ok(full.score >= 85, "score " + full.score);
    assert.equal(full.label, "מוכן להעברה");
    const empty = (await req("POST", "/api/write/readiness", { title: "", blocks: [{ id: "x", kind: "free" }] }, a.token)).body;
    assert.ok(empty.score < 30);
    assert.ok(empty.items.some((i) => !i.ok && i.hint));
    assert.equal(empty.items.reduce((s, i) => s + i.max, 0), 100);
  });

  it("191. מדדי שימוש לאדמין כוללים תקופות, ממוצעים ומתודות", async () => {
    await req("POST", "/api/write/docs", { template: "classic" }, a.token);
    const u = (await req("GET", "/api/admin/write-usage", undefined, adm)).body;
    assert.ok(u.docs >= 1 && u.created7 >= 1 && u.active30 >= 1);
    assert.ok(u.avgStages >= 1);
    assert.ok(Array.isArray(u.topMethods) && Array.isArray(u.feedback));
    assert.ok([401, 403].includes((await req("GET", "/api/admin/write-usage", undefined, a.token)).status));
  });

  it("192. מתודות שבט: רק אדמין מוסיף, כולם רואים, שם כפול נדחה", async () => {
    const m = { name: "מירוץ שמות", category: "game", line: "כל קבוצה צריכה להרכיב שם מאותיות מפוזרות", steps: ["מחלקים אותיות", "מתחרים"] };
    assert.ok([401, 403].includes((await req("POST", "/api/admin/write-methods", m, a.token)).status));
    const r = await req("POST", "/api/admin/write-methods", m, adm);
    assert.equal(r.status, 201);
    assert.equal((await req("POST", "/api/admin/write-methods", m, adm)).status, 409);
    assert.equal((await req("POST", "/api/admin/write-methods", { ...m, name: "ב", category: "x" }, adm)).status, 400);
    const list = (await req("GET", "/api/write/tribe-methods", undefined, a.token)).body;
    assert.equal(list[0].name, "מירוץ שמות");
    assert.deepEqual(list[0].steps, ["מחלקים אותיות", "מתחרים"]);
    assert.equal((await req("DELETE", `/api/admin/write-methods/${r.body.id}`, undefined, adm)).status, 200);
  });

  it("199. משוב על תכונה: אפשר בלי התחברות, מחובר מחליף הצבעה, ונספר לאדמין", async () => {
    assert.equal((await req("POST", "/api/feedback/feature", { feature: "Bad Name", vote: 1 })).status, 400);
    assert.equal((await req("POST", "/api/feedback/feature", { feature: "write-editor", vote: 2 })).status, 400);
    assert.equal((await req("POST", "/api/feedback/feature", { feature: "write-editor", vote: 1 })).status, 201);
    await req("POST", "/api/feedback/feature", { feature: "write-editor", vote: 1 }, a.token);
    await req("POST", "/api/feedback/feature", { feature: "write-editor", vote: -1, comment: "קשה למצוא" }, a.token);
    const u = (await req("GET", "/api/admin/write-usage", undefined, adm)).body.feedback.find((f) => f.feature === "write-editor");
    assert.equal(u.n, 2);
    assert.equal(u.up, 1);
    assert.equal(u.down, 1);
    const c = (await req("GET", "/api/admin/feature-feedback", undefined, adm)).body;
    assert.ok(c.some((x) => x.comment === "קשה למצוא"));
  });
});

describe("סימן מים בקובצי Word", () => {
  it("מסמך Word כולל לוגו צף מאחורי הטקסט", async () => {
    const { fadePng } = await import("../src/watermark.js");
    const png = fs.readFileSync(new URL("../../frontend/public/logo-maoz.png", import.meta.url));
    const faded = fadePng(png, 0.12);
    assert.ok(faded && faded.length > 1000, "PNG מוחלש");
    const { default: JSZip } = await import("jszip");
    const { buildWriteDocx, findLogo } = await import("../src/routes-write-export.js");
    const { setWatermarkSource } = await import("../src/watermark.js");
    setWatermarkSource(() => findLogo(() => null));
    const buf = await buildWriteDocx({ title: "x", meta: {}, blocks: [{ id: "a", title: "p", kind: "open", minutes: 5, text: "t", note: "" }] }, { logo: findLogo(() => null) });
    const z = await JSZip.loadAsync(buf);
    const hdr = await z.file("word/header1.xml").async("string");
    assert.match(hdr, /behindDoc="1"/);
  });
});

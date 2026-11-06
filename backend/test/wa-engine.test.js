// שלב 58: בדיקות מנוע הוואטסאפ. יחידות (זמן, טלפון, תבניות, מכסות, בוט) ובדיקות מקצה לקצה מול הנתיבים.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-wa-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { ilParts, ilToUtc, hebrewDate } = await import("../src/wa/il-time.js");
const { normalizeWaId, waHint, isGroupId } = await import("../src/wa/phone.js");
const T = await import("../src/wa/templates.js");
const P = await import("../src/wa/rate-policy.js");
const { parseRsvp, resolveCommand, norm } = await import("../src/wa/bot.js");
const repo = await import("../src/wa/repo.js");
const { runRules } = await import("../src/wa/scheduler.js");
const { resetStatus } = await import("../src/wa/status.js");
const { describeTools } = await import("../src/wa/tools.js");

describe("שעון ישראל", () => {
  it("ממיר רגע UTC לשעה, תאריך ויום בשבוע בישראל", () => {
    const p = ilParts(Date.UTC(2026, 10, 5, 15, 30)); // נובמבר: UTC+2
    assert.deepEqual([p.date, p.time, p.weekday], ["2026-11-05", "17:30", 4]);
    const s = ilParts(Date.UTC(2026, 6, 1, 9, 0)); // יולי: UTC+3
    assert.deepEqual([s.date, s.time], ["2026-07-01", "12:00"]);
  });
  it("ממיר שעה מקומית ל-UTC גם סביב מעבר שעון הקיץ", () => {
    assert.equal(ilToUtc("2026-11-05", "17:30"), Date.UTC(2026, 10, 5, 15, 30));
    assert.equal(ilToUtc("2026-03-26", "12:00"), Date.UTC(2026, 2, 26, 10, 0));
    assert.equal(ilToUtc("2026-03-28", "12:00"), Date.UTC(2026, 2, 28, 9, 0));
    assert.ok(Number.isNaN(ilToUtc("לא-תאריך", "99:99")));
  });
  it("תאריך בעברית", () => assert.equal(hebrewDate("2026-11-05"), "יום חמישי, 5.11"));
});

describe("טלפונים", () => {
  it("מנרמל מספרים ישראליים בכל כתיבה", () => {
    for (const s of ["052-1234567", "+972 52 123 4567", "0521234567", "972521234567", "00972521234567", "972521234567@c.us"]) assert.equal(normalizeWaId(s), "972521234567@c.us", s);
  });
  it("דוחה מספרים לא תקינים ומזהי קבוצה מזויפים", () => {
    for (const s of ["", "123", "abc", "05212", "97212", "0521234567; DROP TABLE", "<script>"]) assert.equal(normalizeWaId(s), null, s);
    assert.equal(normalizeWaId("120363012345678901@g.us"), "120363012345678901@g.us");
    assert.ok(isGroupId("120363012345678901@g.us"));
    assert.ok(!isGroupId("972521234567@c.us"));
  });
  it("מסתיר את המספר ביומן", () => {
    assert.equal(waHint("972521234567@c.us"), "…4567");
    assert.equal(waHint("120363012345678901@g.us"), "קבוצה");
  });
});

describe("תבניות", () => {
  it("מחליף משתנים, כולל כינויים וברירות מחדל", () => {
    const r = T.renderTemplate("שלום {{שם_מדריך}} מ{{שם_הגדוד|הגדוד}}, {{שעת_הפעולה}}", { name: "נועה", time: "17:30" });
    assert.equal(r.text, "שלום נועה מהגדוד, 17:30");
    assert.deepEqual(r.missing, []);
  });
  it("משתנה בלי ערך נרשם כחסר ולא נשאר בטקסט", () => {
    const r = T.renderTemplate("היי {{שם}} {{מקום}}", { name: "דנה" });
    assert.deepEqual(r.missing, ["מקום"]);
    assert.ok(!r.text.includes("{{"));
  });
  it("ערך שמכיל סוגריים לא יכול להחדיר משתנה חדש", () => {
    const r = T.renderTemplate("{{שם}}", { name: "{{הערה}}", note: "סוד" });
    assert.ok(!r.text.includes("סוד") && !r.text.includes("{{"));
  });
  it("מזהה משתנים לא מוכרים ותבנית ריקה", () => {
    assert.deepEqual(T.validateTemplate("היי {{בלה}}").unknown, ["בלה"]);
    assert.ok(!T.validateTemplate("   ").ok);
    assert.ok(T.validateTemplate("{{שם}} {{שם_הפעולה|פעולה}}").ok);
  });
  it("מנקה תווי בקרה ותווי הפיכת כיוון", () => {
    assert.equal(T.cleanText("א\u0000ב‮ג\r\nד"), "אבג\nד");
    assert.equal(T.cleanText("x".repeat(9000)).length, T.MAX_BODY);
  });
  it("ערכים לפי איש קשר", () => {
    assert.deepEqual(T.valuesFor({ name: "נועה כהן", battalion: "נעורים" }), { name: "נועה", fullName: "נועה כהן", battalion: "נעורים", role: "" });
  });
});

describe("Anti-Ban: מכסות והשהיות", () => {
  const s = { ...P.DEFAULTS };
  const NOON = ilToUtc("2026-11-04", "12:00"); // רביעי בצהריים
  const state = (over = {}) => ({ now: NOON, nextAllowedAt: 0, breakerUntil: 0, counts: { minute: 0, hour: 0, day: 0 }, firstSendAt: 0, ...over });

  it("שעות שקט חוצות חצות, ותשובות לפונים לא נחסמות בהן", () => {
    assert.ok(P.inQuietHours(ilToUtc("2026-11-04", "23:00"), s));
    assert.ok(P.inQuietHours(ilToUtc("2026-11-04", "03:00"), s));
    assert.ok(!P.inQuietHours(NOON, s));
    const night = ilToUtc("2026-11-04", "23:30");
    assert.equal(P.decide(s, state({ now: night }), { priority: 5 }).reason, "quiet");
    assert.ok(P.decide(s, state({ now: night }), { priority: 1 }).allowed);
  });
  it("שבת נחסמת רק כשהאפשרות פעילה", () => {
    const fri = ilToUtc("2026-11-06", "18:00");
    assert.ok(P.inShabbat(fri) && !P.inShabbat(ilToUtc("2026-11-08", "12:00")));
    assert.ok(P.decide(s, state({ now: fri })).allowed);
    assert.equal(P.decide({ ...s, pauseShabbat: true }, state({ now: fri })).reason, "shabbat");
  });
  it("חוסם לפי השהיה, דקה, שעה ויום, ועצירת חירום", () => {
    assert.equal(P.decide(s, state({ nextAllowedAt: NOON + 5000 })).reason, "gap");
    assert.equal(P.decide(s, state({ counts: { minute: 3, hour: 0, day: 0 } })).reason, "minute");
    assert.equal(P.decide(s, state({ counts: { minute: 0, hour: 40, day: 0 } })).reason, "hour");
    assert.equal(P.decide(s, state({ counts: { minute: 0, hour: 0, day: 25 }, firstSendAt: NOON })).reason, "day");
    assert.equal(P.decide(s, state({ breakerUntil: NOON + 60_000 })).reason, "breaker");
    assert.equal(P.decide({ ...s, enabled: false }, state()).reason, "paused");
  });
  it("חימום: המכסה היומית גדלה בהדרגה", () => {
    const d0 = NOON;
    assert.equal(P.dailyCap(s, d0, d0), 25);
    assert.equal(P.dailyCap(s, d0, d0 + 86_400_000), 40);
    assert.equal(P.dailyCap(s, d0, d0 + 4 * 86_400_000), 150);
    assert.equal(P.dailyCap({ ...s, warmup: false }, d0, d0), 150);
  });
  it("השהיה אקראית בטווח, ומוארכת כשאותו טקסט נשלח להרבה", () => {
    for (let i = 0; i < 50; i++) {
      const g = P.gapMs(s, 0, Math.random);
      assert.ok(g >= s.minGapSec * 1000 && g <= s.maxGapSec * 1000, String(g));
    }
    assert.ok(P.gapMs(s, 100, () => 0.5, true) > P.gapMs(s, 100, () => 0.5, false) * 1.7);
  });
  it("הגדרות: תקרות קשיחות ומיזוג עם ברירות מחדל", () => {
    assert.throws(() => P.settingsSchema.parse({ maxPerMinute: 60 }));
    assert.throws(() => P.settingsSchema.parse({ minGapSec: 30, maxGapSec: 10 }));
    assert.throws(() => P.settingsSchema.parse({ quietFrom: "25:99" }));
    assert.equal(P.mergeSettings({ maxPerDay: "הרבה", minGapSec: 10 }).maxPerDay, 150);
    assert.equal(P.mergeSettings({ minGapSec: 10 }).minGapSec, 10);
  });
});

describe("בוט: פענוח", () => {
  it("מזהה תשובות אישור הגעה", () => {
    for (const [t, a] of [["1", "yes"], ["כן!", "yes"], ["מגיעה 🙂", "yes"], ["2", "no"], ["לא מגיע", "no"], ["לא, אי אפשר", "no"], ["3", "maybe"], ["אולי", "maybe"]]) assert.equal(parseRsvp(t), a, t);
    for (const t of ["", "מתי זה בדיוק ואיפה נפגשים לפני?", "תודה"]) assert.equal(parseRsvp(t), null, t);
  });
  it("מזהה פקודות ומתעלם משאר הטקסט", () => {
    assert.equal(resolveCommand(norm("עזרה")).cmd, "help");
    assert.equal(resolveCommand(norm("מתי הפעולה הבאה שלי?")).cmd, "next");
    assert.equal(resolveCommand(norm("מה להביא")).cmd, "gear");
    assert.deepEqual(resolveCommand(norm("חפש אחריות אישית")), { cmd: "search", arg: "אחריות אישית" });
    assert.equal(resolveCommand(norm("מה נשמע")), null);
  });
});

describe("מנוע הוואטסאפ מקצה לקצה", () => {
  let server, base, db, adminTok, userTok, userId, bridgeTok;
  const call = async (method, path, tok, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
  };
  const adm = (m, p, b) => call(m, p, adminTok, b);
  const br = (m, p, b, tok = bridgeTok) => call(m, p, null, b, { "x-maoz-bridge": tok ?? "" });
  const open = () => { db.prepare("DELETE FROM wa_settings WHERE key IN ('next_allowed_at','breaker_until','fails')").run(); };
  const connect = () => br("POST", "/api/wa/bridge/heartbeat", { state: "connected", account: { hint: "4567", name: "שבט" }, version: "1.0.0" });
  const mkContact = async (over = {}) => (await adm("POST", "/api/admin/wa/contacts", { name: "נועה כהן", phone: "052-1234567", battalion: "נעורים", ...over })).body;

  before(async () => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }), serveStatic: false }).listen(0);
    base = `http://localhost:${server.address().port}`;
    adminTok = (await call("POST", "/api/auth/login", null, { username: "admin", password: "admin123" })).body.token;
    const reg = (await call("POST", "/api/auth/register", null, { username: "wauser", password: "Passw0rd!xyz", displayName: "מדריכה", signupCode: "shevet-code" })).body;
    userTok = reg.token;
    userId = db.prepare("SELECT id FROM users WHERE username = 'wauser'").get().id;
    resetStatus();
    // הבדיקות לא תלויות בשעת היום: כבים שעות שקט (from = to) והשהיית שבת, אחרת הן נכשלות בלילה ובשבת
    await call("PUT", "/api/admin/wa/settings", adminTok, { quietFrom: "00:00", quietTo: "00:00", pauseShabbat: false });
  });
  after(() => server.close());

  it("הרשאות: רק אדמין ראשי. אורח, משתמש ומנהל תוכן נחסמים", async () => {
    assert.equal((await call("GET", "/api/admin/wa/status")).status, 401);
    assert.ok([401, 403].includes((await call("GET", "/api/admin/wa/status", userTok)).status));
    assert.equal((await adm("GET", "/api/admin/wa/status")).status, 200);
    db.prepare("UPDATE users SET staff_role = 'CONTENT' WHERE username = 'admin'").run();
    const content = await adm("GET", "/api/admin/wa/contacts");
    db.prepare("UPDATE users SET staff_role = NULL WHERE username = 'admin'").run();
    assert.equal(content.status, 403);
    assert.equal(content.body.error.code, "FORBIDDEN_ROLE");
  });

  it("גשר: האסימון מוצג פעם אחת ונשמר רק כ-hash, ואסימון שגוי נדחה", async () => {
    const r = await adm("POST", "/api/admin/wa/bridges", { name: "המחשב של דביר" });
    assert.equal(r.status, 201);
    bridgeTok = r.body.token;
    assert.match(bridgeTok, /^wb_[0-9a-f]{48}$/);
    const rows = db.prepare("SELECT * FROM wa_bridges").all();
    assert.ok(rows.every((x) => !JSON.stringify(x).includes(bridgeTok)));
    assert.equal(JSON.stringify((await adm("GET", "/api/admin/wa/bridges")).body).includes(bridgeTok), false);
    for (const bad of [null, "", "wb_x", "wb_" + "g".repeat(48), "wb_" + "a".repeat(48), "mx_" + "a".repeat(48)]) assert.equal((await br("POST", "/api/wa/bridge/heartbeat", { state: "qr" }, bad)).status, 401, String(bad));
    assert.equal((await call("POST", "/api/wa/bridge/heartbeat", userTok, { state: "qr" })).status, 401, "אסימון משתמש לא משמש כגשר");
  });

  it("QR חי: מוצג לאדמין בלבד, כ-SVG, ונעלם כשהחיבור מצליח", async () => {
    await br("POST", "/api/wa/bridge/heartbeat", { state: "qr", qr: "2@ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,secret,qr" });
    const s = (await adm("GET", "/api/admin/wa/status")).body;
    assert.equal(s.bridge.state, "qr");
    assert.match(s.bridge.qrSvg, /<svg/);
    const stored = db.prepare("SELECT * FROM wa_bridges").all().map((x) => JSON.stringify(x)).join("") + db.prepare("SELECT * FROM audit_log").all().map((x) => JSON.stringify(x)).join("");
    assert.ok(!stored.includes("secret,qr"), "ה-QR לא נשמר במסד");
    await connect();
    const after = (await adm("GET", "/api/admin/wa/status")).body;
    assert.equal(after.bridge.state, "connected");
    assert.equal(after.bridge.qrSvg, null);
    assert.equal(after.bridge.account.hint, "4567");
    assert.equal((await br("POST", "/api/wa/bridge/heartbeat", { qr: "x".repeat(5000), state: "qr" })).status, 400);
  });

  it("אנשי קשר: אימות טלפון, כפילות ומניעת בוט לא-מדריכים", async () => {
    assert.equal((await adm("POST", "/api/admin/wa/contacts", { name: "x", phone: "123" })).status, 400);
    const c = await mkContact({ userId });
    assert.equal(c.waId, "972521234567@c.us");
    assert.equal((await adm("POST", "/api/admin/wa/contacts", { name: "עוד", phone: "0521234567" })).status, 409);
    assert.equal((await adm("POST", "/api/admin/wa/contacts", { name: "ל", kind: "group", waId: "972521234568@c.us" })).status, 400);
    const kid = await mkContact({ name: "הורה", phone: "0501112222", audience: "parents", botAllowed: true });
    assert.equal(kid.botAllowed, false, "בוט רק למדריכים");
  });

  it("תור: שליחה, חכירה אחת בכל פעם, השהיה בין הודעות ודיווח תוצאה", async () => {
    open();
    const c = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    const marker = "הודעת-בדיקה-" + Date.now();
    const s1 = await adm("POST", "/api/admin/wa/jobs/send", { contactId: c.id, text: marker });
    assert.equal(s1.status, 201);
    await adm("POST", "/api/admin/wa/jobs/send", { contactId: c.id, text: "שנייה" });
    const n1 = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n1.job.to, "972521234567@c.us");
    assert.equal(n1.job.text, marker);
    assert.ok(n1.job.typingMs >= 800 && n1.job.typingMs <= 6000);
    const wrong = await br("POST", "/api/wa/bridge/result", { jobId: n1.job.id + 1, ok: true });
    assert.equal(wrong.status, 409);
    assert.equal((await br("POST", "/api/wa/bridge/result", { jobId: n1.job.id, ok: true })).status, 200);
    assert.equal((await br("POST", "/api/wa/bridge/result", { jobId: n1.job.id, ok: true })).status, 409, "אי אפשר לדווח פעמיים");
    const n2 = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n2.job, null);
    assert.ok(["gap", "cooldown"].includes(n2.reason), n2.reason);
    assert.ok(n2.retryInMs >= 1500);
    const log = (await adm("GET", "/api/admin/wa/log")).body;
    assert.ok(log.rows.some((r) => r.status === "sent" && r.contactName === c.name));
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM wa_log").all()).includes(marker), "היומן לא כולל את תוכן ההודעה");
    open();
    db.prepare("UPDATE wa_jobs SET sent_at = ? WHERE status = 'sent'").run(new Date(Date.now() - 3_600_000).toISOString());
    const n3 = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n3.job.text, "שנייה");
    await br("POST", "/api/wa/bridge/result", { jobId: n3.job.id, ok: true });
  });

  it("כשוואטסאפ לא מחובר ההודעות נשארות בתור", async () => {
    open();
    const c = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    await adm("POST", "/api/admin/wa/jobs/send", { contactId: c.id, text: "בהמתנה" });
    await br("POST", "/api/wa/bridge/heartbeat", { state: "disconnected" });
    const n = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n.job, null);
    assert.equal(n.reason, "not_connected");
    assert.ok((await adm("GET", "/api/admin/wa/jobs?status=queued")).body.some((j) => j.body === "בהמתנה"));
    await connect();
  });

  it("עצירה אוטומטית אחרי כשלונות רצופים, ושחרור ידני", async () => {
    await adm("PUT", "/api/admin/wa/settings", { breakerFails: 2, minGapSec: 3, maxGapSec: 3, perContactCooldownSec: 0 });
    const who = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    for (const t of ["כשל א", "כשל ב"]) await adm("POST", "/api/admin/wa/jobs/send", { contactId: who.id, text: t });
    for (let i = 0; i < 2; i++) {
      db.prepare("DELETE FROM wa_settings WHERE key = 'next_allowed_at'").run(); // מדלגים על ההשהיה בלבד, מונה הכשלונות נשמר
      const n = (await br("GET", "/api/wa/bridge/next")).body;
      assert.ok(n.job, "יש משימה " + i);
      await br("POST", "/api/wa/bridge/result", { jobId: n.job.id, ok: false, error: "timeout" });
    }
    db.prepare("DELETE FROM wa_settings WHERE key = 'next_allowed_at'").run();
    const noa = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    await adm("POST", "/api/admin/wa/jobs/send", { contactId: noa.id, text: "אחרי העצירה" });
    const blocked = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(blocked.reason, "breaker");
    assert.ok((await adm("GET", "/api/admin/wa/log?status=breaker")).body.total >= 1);
    assert.equal((await adm("POST", "/api/admin/wa/breaker/clear")).status, 200);
    assert.notEqual((await br("GET", "/api/wa/bridge/next")).body.reason, "breaker");
  });

  it("מספר שלא קיים בוואטסאפ נכשל סופית בלי להפעיל עצירה", async () => {
    open();
    const c = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    const id = (await adm("POST", "/api/admin/wa/jobs/send", { contactId: c.id, text: "למספר שגוי", whenIso: new Date().toISOString() })).body.jobId;
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased') AND id != ?").run(id);
    const n = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n.job.id, id);
    await br("POST", "/api/wa/bridge/result", { jobId: id, ok: false, error: "not on whatsapp", permanent: true });
    assert.equal(repo.getJob(db, id).status, "failed");
    assert.equal(db.prepare("SELECT value FROM wa_settings WHERE key = 'fails'").get()?.value ?? "0", "0");
  });

  it("שעות שקט עוצרות שליחה רגילה אך לא תשובות לפונים", async () => {
    await adm("PUT", "/api/admin/wa/settings", { quietFrom: "00:00", quietTo: "23:59", minGapSec: 8, maxGapSec: 20 });
    open();
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased')").run();
    const c = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    await adm("POST", "/api/admin/wa/jobs/send", { contactId: c.id, text: "בשקט" });
    assert.equal((await br("GET", "/api/wa/bridge/next")).body.reason, "quiet");
    const rep = await adm("POST", `/api/admin/wa/inbox/${c.id}/reply`, { text: "תשובה אישית" });
    assert.equal(rep.status, 201);
    const n = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n.job?.text, "תשובה אישית");
    await br("POST", "/api/wa/bridge/result", { jobId: n.job.id, ok: true });
    await adm("PUT", "/api/admin/wa/settings", { quietFrom: "00:00", quietTo: "00:00" });
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased')").run();
  });

  it("תבניות: ברירות מחדל, אימות משתנים ותצוגה מקדימה", async () => {
    const t = (await adm("GET", "/api/admin/wa/templates")).body;
    assert.ok(t.templates.length >= 4 && t.variables.length >= 10);
    assert.equal((await adm("POST", "/api/admin/wa/templates", { name: "שבורה", body: "היי {{לא_קיים}}" })).status, 400);
    const ok = await adm("POST", "/api/admin/wa/templates", { name: "שלי", body: "שלום {{שם_מדריך}}" });
    assert.equal(ok.status, 201);
    assert.equal((await adm("POST", "/api/admin/wa/templates", { name: "שלי", body: "שוב" })).status, 409);
    const pv = (await adm("POST", "/api/admin/wa/templates/preview", { body: "שלום {{שם_מדריך}} ב{{תאריך}}" })).body;
    assert.match(pv.text, /שלום נועה/);
  });

  it("שליחה לכמה אנשים: תבנית אישית לכל נמען, דילוג על מי שהוסר, ומגבלות", async () => {
    open();
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased')").run();
    const a = await mkContact({ name: "אבי לוי", phone: "0521110001" });
    const b = await mkContact({ name: "בני דן", phone: "0521110002", optedOut: true });
    const r = await adm("POST", "/api/admin/wa/jobs/broadcast", { contactIds: [a.id, b.id], template: "היי {{שם_מדריך}}, מחר {{שעה}}", extra: { שעה: "17:00" } });
    assert.equal(r.status, 201);
    assert.equal(r.body.created.length, 1);
    assert.equal(r.body.skipped[0].name, "בני דן");
    assert.equal(repo.getJob(db, r.body.created[0]).body, "היי אבי, מחר 17:00");
    const missing = await adm("POST", "/api/admin/wa/jobs/broadcast", { contactIds: [a.id], template: "{{מקום}}" });
    assert.equal(missing.body.created.length, 0, "משתנה חסר לא נשלח כמו שהוא");
    const many = await adm("POST", "/api/admin/wa/jobs/broadcast", { contactIds: Array.from({ length: 61 }, (_, i) => i + 1), template: "x" });
    assert.equal(many.status, 400);
    const kids = await mkContact({ name: "קבוצת חניכים", kind: "group", waId: "120363000000000001@g.us", audience: "trainees" });
    const guard = await adm("POST", "/api/admin/wa/jobs/broadcast", { contactIds: [kids.id], template: "שלום" });
    assert.equal(guard.status, 422);
    assert.match(guard.body.error.message, /חניכים/);
    const okk = await adm("POST", "/api/admin/wa/jobs/broadcast", { contactIds: [kids.id], template: "שלום", confirmTrainees: true });
    assert.equal(okk.body.created.length, 1);
  });

  it("אישורי הגעה: הודעה עם בקשה, תשובה 1 נרשמת ומסוכמת", async () => {
    open();
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased')").run();
    await adm("PUT", "/api/admin/wa/settings", { perContactCooldownSec: 0 });
    const a = (await adm("GET", "/api/admin/wa/contacts?q=אבי")).body[0];
    const r = await adm("POST", "/api/admin/wa/jobs/broadcast", { contactIds: [a.id], template: "מגיעים ל{{אירוע}}?", extra: { אירוע: "טיול" }, rsvp: true, eventTitle: "טיול שכבתי" });
    const jobId = r.body.created[0];
    const n = (await br("GET", "/api/wa/bridge/next")).body;
    assert.equal(n.job.id, jobId);
    assert.match(n.job.text, /השיבו 1/);
    await br("POST", "/api/wa/bridge/result", { jobId, ok: true });
    const key = repo.getJob(db, jobId).eventKey;
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "m1", from: a.waId, text: "1" })).body.handled, "rsvp");
    const sum = (await adm("GET", `/api/admin/wa/rsvp/${key}`)).body;
    assert.equal(sum.yes, 1);
    assert.equal(sum.none, 0);
    assert.equal((await adm("GET", "/api/admin/wa/rsvp")).body[0].title, "טיול שכבתי");
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "m1", from: a.waId, text: "1" })).body.handled, "duplicate");
  });

  it("הסרה מהרשימה: 'הסר' מפסיק הודעות, 'הצטרף' מחזיר", async () => {
    const a = (await adm("GET", "/api/admin/wa/contacts?q=אבי")).body[0];
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "o1", from: a.waId, text: "הסר" })).body.handled, "optout");
    assert.equal((await adm("GET", "/api/admin/wa/contacts?q=אבי")).body[0].optedOut, true);
    const blocked = await adm("POST", "/api/admin/wa/jobs/send", { contactId: a.id, text: "אחרי הסרה" });
    assert.equal(blocked.status, 422);
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "o2", from: a.waId, text: "הצטרף" })).body.handled, "optin");
    assert.equal((await adm("GET", "/api/admin/wa/contacts?q=אבי")).body[0].optedOut, false);
  });

  it("בוט: כבוי כברירת מחדל, עונה רק למורשים, מתעלם ממספרים לא מוכרים ולא שומר את הטקסט שלהם", async () => {
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased')").run();
    const noa = (await adm("GET", "/api/admin/wa/contacts?q=נועה")).body[0];
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "b0", from: noa.waId, text: "עזרה" })).body.handled, "stored");
    await adm("PUT", "/api/admin/wa/contacts/" + noa.id, { botAllowed: true });
    await adm("PUT", "/api/admin/wa/settings", { botEnabled: true });
    db.prepare("INSERT INTO schedule (user_id, title, date, time, group_label, created_at) VALUES (?,?,?,?,?,?)").run(userId, "פעולת בדיקה", ilParts(Date.now() + 2 * 86_400_000).date, "17:30", "נעורים", new Date().toISOString());
    const r = (await br("POST", "/api/wa/bridge/inbound", { id: "b1", from: noa.waId, text: "מתי הפעולה הבאה?" })).body;
    assert.equal(r.handled, "cmd:next");
    const reply = repo.listJobs(db, { source: "bot", limit: 1 })[0];
    assert.match(reply.body, /^🤖 מעוז: /);
    assert.match(reply.body, /פעולת בדיקה/);
    assert.equal(reply.priority, 1);
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "b2", from: "972599999999@c.us", text: "מידע סודי של זר" })).body.handled, "unknown");
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM wa_inbox").all()).includes("מידע סודי של זר"));
    assert.equal((await br("POST", "/api/wa/bridge/inbound", { id: "b3", from: noa.waId, text: "🤖 מעוז: עזרה" })).body.handled, "ignored");
    for (let i = 0; i < 10; i++) await br("POST", "/api/wa/bridge/inbound", { id: "r" + i, from: noa.waId, text: "עזרה" });
    assert.ok(repo.botRepliesSince(db, noa.id, new Date(Date.now() - 3_600_000).toISOString()) <= 8, "הגבלת קצב לכל שולח");
  });

  it("בוט בקבוצה: רק עם קריאה מפורשת לבוט ורק כשהקבוצה מורשית", async () => {
    const grp = await mkContact({ name: "קבוצת מדריכים", kind: "group", waId: "120363000000000002@g.us", audience: "guides", botAllowed: true });
    const noa = (await adm("GET", "/api/admin/wa/contacts?q=נועה")).body[0];
    const post = (id, text) => br("POST", "/api/wa/bridge/inbound", { id, from: noa.waId, isGroup: true, groupId: grp.waId, text });
    assert.equal((await post("g1", "עזרה")).body.handled, "stored");
    await adm("PUT", "/api/admin/wa/settings", { botGroups: true });
    assert.equal((await post("g2", "מעוז עזרה")).body.handled, "stored", "בלי ! או @ לא נחשב קריאה לבוט");
    db.prepare("DELETE FROM wa_jobs WHERE source = 'bot'").run();
    assert.equal((await post("g3", "!מעוז עזרה")).body.handled, "cmd:help");
    assert.equal(repo.listJobs(db, { source: "bot", limit: 1 })[0].waId, grp.waId, "התשובה נשלחת לקבוצה");
    const stranger = await br("POST", "/api/wa/bridge/inbound", { id: "g4", from: noa.waId, isGroup: true, groupId: "120363999999999999@g.us", text: "!מעוז עזרה" });
    assert.equal(stranger.body.handled, "unknown-group");
  });

  it("כללי אוטומציה: כלל שבועי ותזכורת לפני פעולה, בלי כפילויות", async () => {
    await adm("PUT", "/api/admin/wa/settings", { botEnabled: false, perContactCooldownSec: 45 });
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE status IN ('queued','leased')").run();
    const noa = (await adm("GET", "/api/admin/wa/contacts?q=נועה")).body[0];
    const bad = await adm("POST", "/api/admin/wa/rules", { name: "x", kind: "weekly", config: { weekday: 9, time: "17:00", contactIds: [noa.id], body: "היי" } });
    assert.equal(bad.status, 400);
    const w = await adm("POST", "/api/admin/wa/rules", { name: "ישיבת שכב\"ג", kind: "weekly", config: { weekday: 4, time: "17:30", contactIds: [noa.id], body: "היי {{שם_מדריך}}, ישיבה {{תאריך}} ב-{{שעה}}", eventOffsetDays: 0 } });
    assert.equal(w.status, 201);
    assert.match(w.body.summary, /כל יום חמישי ב-17:30/);
    const r2 = await adm("POST", "/api/admin/wa/rules", { name: "תזכורת", kind: "before_activity", config: { hoursBefore: 24, body: "תזכורת: {{שם_הפעולה}} ב{{תאריך}} בשעה {{שעה}}" } });
    assert.equal(r2.status, 201);
    // הבדיקה הקודמת מוסיפה פעולה לעוד יומיים מהשעון האמיתי, וביום מסוים זה מתנגש עם התאריכים הקבועים כאן. מנקים כדי שהבדיקה לא תלויה בתאריך ההרצה.
    db.prepare("DELETE FROM schedule WHERE title = ?").run("פעולת בדיקה");
    db.prepare("INSERT INTO schedule (user_id, title, date, time, created_at) VALUES (?,?,?,?,?)").run(userId, "פעולה למחר", "2026-11-06", "17:30", new Date().toISOString());
    const thu = ilToUtc("2026-11-05", "18:00");
    assert.equal(runRules(db, thu), 2);
    assert.equal(runRules(db, thu + 60_000), 0, "ריצה חוזרת לא יוצרת כפילויות");
    const jobs = repo.listJobs(db, { source: "rule", limit: 5 }).concat(repo.listJobs(db, { source: "reminder", limit: 5 }));
    assert.ok(jobs.some((j) => j.body === "היי נועה, ישיבה יום חמישי, 5.11 ב-17:30"), jobs.map((j) => j.body).join("|"));
    assert.ok(jobs.some((j) => /פעולה למחר ביום שישי, 6\.11 בשעה 17:30/.test(j.body)), jobs.map((j) => j.body).join("|"));
    assert.equal(runRules(db, ilToUtc("2026-11-05", "23:00")), 0, "כלל שהוחמץ ביותר מ-3 שעות לא רץ");
    assert.equal((await adm("DELETE", `/api/admin/wa/rules/${w.body.id}`)).status, 200);
  });

  it("כלים בסגנון MCP: תיאור JSON Schema, אימות קלט וכלי לא מוכר", async () => {
    const d = (await adm("GET", "/api/admin/wa/tools")).body;
    assert.ok(d.length >= 9 && d.every((t) => t.name && t.description && t.inputSchema?.type === "object"));
    assert.equal(describeTools().length, d.length);
    assert.equal((await adm("POST", "/api/admin/wa/tools/nope", {})).status, 404);
    assert.equal((await adm("POST", "/api/admin/wa/tools/wa_send", { contactId: "x" })).status, 400);
    const st = (await adm("POST", "/api/admin/wa/tools/wa_status", {})).body;
    assert.equal(st.bridge.qr, undefined);
    assert.equal(JSON.stringify((await adm("POST", "/api/admin/wa/tools/wa_contacts", {})).body).includes("972521234567"), false, "הטלפון מוסתר בכלי");
  });

  it("יצוא יומן CSV מנטרל נוסחאות, וביטול גשר חוסם אותו", async () => {
    await mkContact({ name: "=HYPERLINK(\"http://x\")", phone: "0521110009" });
    const c = (await adm("GET", "/api/admin/wa/contacts?q=HYPERLINK")).body[0];
    repo.insertLog(db, { contactName: c.name, hint: "…0009", status: "sent" });
    const csv = (await adm("GET", "/api/admin/wa/log.csv")).body;
    assert.ok(csv.includes(`"'=HYPERLINK`), "תא שמתחיל ב-= מקבל גרש מקדים");
    const b = (await adm("GET", "/api/admin/wa/bridges")).body[0];
    assert.equal((await adm("DELETE", `/api/admin/wa/bridges/${b.id}`)).status, 200);
    assert.equal((await br("GET", "/api/wa/bridge/next")).status, 401);
  });

  it("ביקורת: פעולות נרשמות בלי תוכן הודעות וטלפונים", () => {
    const rows = db.prepare("SELECT action, details FROM audit_log WHERE action LIKE 'wa.%'").all();
    assert.ok(rows.length > 10);
    const text = JSON.stringify(rows);
    for (const secret of ["972521234567", "0521234567", "בהמתנה", "תשובה אישית", bridgeTok]) assert.ok(!text.includes(secret), secret);
  });
});

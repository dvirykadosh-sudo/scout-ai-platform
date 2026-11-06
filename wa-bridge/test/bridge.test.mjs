// בדיקת שילוב: הגשר האמיתי (לולאות + מתאם מדמה) מול שרת האתר האמיתי בזיכרון.
// QR → חיבור → שליחה מהתור → דיווח → כשל זמני וסופי → הודעה נכנסת ובוט → כיבוי → שחזור → אסימון שגוי.
import assert from "node:assert/strict";
import os from "node:os";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = os.tmpdir() + "/scout-wab-backups-" + process.pid;

const { createApp } = await import("../../backend/src/app.js");
const { openDb } = await import("../../backend/src/db.js");
const { seedIfEmpty } = await import("../../backend/src/seed.js");
const { ensureAdmin } = await import("../../backend/src/auth.js");
const { createMailer } = await import("../../backend/src/email.js");
const { resetStatus } = await import("../../backend/src/wa/status.js");
const { createBridge } = await import("../src/index.js");
const { MockAdapter } = await import("../src/adapters/mock.js");
const { sendError } = await import("../src/adapters/base.js");
const { SiteClient } = await import("../src/site-client.js");
const { Outbox } = await import("../src/outbox.js");
const { silentLogger } = await import("../src/log.js");
const { startOutbound } = await import("../src/loops/outbound.js");
const { startInbound } = await import("../src/loops/inbound.js");

const until = async (fn, ms = 6000, step = 40) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("until: תם הזמן");
    await new Promise((r) => setTimeout(r, step));
  }
};

describe("גשר מול האתר האמיתי", () => {
  let server, base, db, adminTok, token, adapter, bridge, outbox, contactId;
  const call = async (method, path, tok, body) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const adm = (m, p, b) => call(m, p, adminTok, b);
  const status = async () => (await adm("GET", "/api/admin/wa/status")).body;
  const jobRow = (id) => db.prepare("SELECT status, attempts, error FROM wa_jobs WHERE id = ?").get(id);
  const noGap = () => db.prepare("DELETE FROM wa_settings WHERE key IN ('next_allowed_at','breaker_until','fails')").run();
  const enqueue = async (text) => { noGap(); return (await adm("POST", "/api/admin/wa/jobs/send", { contactId, text })).body.jobId; };
  const mkBridge = (over = {}) => {
    const a = over.adapter || new MockAdapter({ qrDelayMs: 10 });
    const o = over.outbox || new Outbox(null);
    const c = over.client || new SiteClient({ siteUrl: base, token });
    return { a, o, b: createBridge({ adapter: a, client: c, outbox: o, log: silentLogger, intervals: { heartbeat: { intervalMs: 150 }, outbound: { idleMs: 80 }, restartMs: 50 } }) };
  };

  before(async () => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }), serveStatic: false }).listen(0);
    base = `http://localhost:${server.address().port}`;
    adminTok = (await call("POST", "/api/auth/login", null, { username: "admin", password: "admin123" })).body.token;
    resetStatus();
    // לא תלוי בשעת היום: בלי שעות שקט ובלי הפסקת שבת, ובלי השהיית קשר
    await adm("PUT", "/api/admin/wa/settings", { quietFrom: "00:00", quietTo: "00:00", pauseShabbat: false, perContactCooldownSec: 0, minGapSec: 3, maxGapSec: 3, breakerFails: 2, maxPerMinute: 10, maxPerHour: 200 });
    token = (await adm("POST", "/api/admin/wa/bridges", { name: "בדיקה" })).body.token;
    contactId = (await adm("POST", "/api/admin/wa/contacts", { name: "נועה כהן", phone: "052-1234567", battalion: "נעורים" })).body.id;
    ({ a: adapter, o: outbox, b: bridge } = mkBridge());
    bridge.start();
  });

  after(async () => {
    await bridge.stop();
    server.close();
  });

  it("QR מגיע לאתר כ-SVG, ואחרי סריקה המצב הופך למחובר והקוד נעלם", async () => {
    const s = await until(async () => { const x = await status(); return x.bridge.state === "qr" && x.bridge.qrSvg ? x : null; });
    assert.match(s.bridge.qrSvg, /<svg/);
    adapter.scan();
    const c = await until(async () => { const x = await status(); return x.bridge.state === "connected" ? x : null; });
    assert.equal(c.bridge.qrSvg, null);
    assert.equal(c.bridge.account.hint, "0000");
  });

  it("הודעה בתור נשלחת דרך המתאם ונרשמת כנשלחה, בלי תוכן ביומן", async () => {
    const id = await enqueue("תזכורת-לבדיקה-א");
    await until(() => adapter.sent.length === 1);
    assert.equal(adapter.sent[0].to, "972521234567@c.us");
    assert.equal(adapter.sent[0].text, "תזכורת-לבדיקה-א");
    await until(() => jobRow(id).status === "sent");
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM wa_log").all()).includes("תזכורת-לבדיקה-א"));
  });

  it("הקצב נקבע באתר: הודעה שנייה לא יוצאת לפני ההשהיה", async () => {
    db.prepare("DELETE FROM wa_settings WHERE key IN ('breaker_until','fails')").run(); // ההשהיה next_allowed_at נשארת
    const id = (await adm("POST", "/api/admin/wa/jobs/send", { contactId, text: "ממתינה להשהיה" })).body.jobId;
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(adapter.sent.length, 1, "הגשר לא שולח לפני שהאתר אישר");
    assert.equal(jobRow(id).status, "queued");
    noGap();
    await until(() => adapter.sent.length === 2);
    await until(() => jobRow(id).status === "sent");
  });

  it("כשל זמני נרשם וחוזר לתור, כשל סופי נעצר בלי ניסיון נוסף", async () => {
    adapter.failures.push(sendError("timeout"));
    const id = await enqueue("כשל זמני");
    await until(() => jobRow(id).attempts >= 1 && jobRow(id).status !== "leased");
    assert.equal(jobRow(id).status, "queued");
    assert.equal(adapter.sent.length, 2, "לא נשלחה");

    adapter.failures.push(sendError("המספר לא רשום בוואטסאפ", true));
    const id2 = await enqueue("מספר שגוי");
    await until(() => jobRow(id2).status === "failed");
    assert.equal(jobRow(id2).attempts, 1);
    db.prepare("UPDATE wa_jobs SET status = 'cancelled' WHERE id = ?").run(id);
  });

  it("הודעה נכנסת: 'הסר' מסירה את איש הקשר והבוט עונה דרך תור השליחה", async () => {
    const before = adapter.sent.length;
    noGap();
    adapter.simulateInbound({ from: "972521234567@c.us", text: "הסר", name: "נועה" });
    await until(() => adapter.sent.length > before);
    assert.match(adapter.sent.at(-1).text, /הוסרתם/);
    const c = (await adm("GET", "/api/admin/wa/contacts?q=" + encodeURIComponent("נועה"))).body[0];
    assert.equal(c.optedOut, true);
  });

  it("הודעה כפולה מועברת פעם אחת. הודעה שלי או ריקה לא מועברות", async () => {
    const a = new MockAdapter();
    const got = [];
    const inb = startInbound({ adapter: a, client: { inbound: async (m) => { got.push(m); return { handled: false }; } }, log: silentLogger, signal: new AbortController().signal, onAuthError() {} });
    const m = { id: "dup-1", from: "972529999999@c.us", text: "שלום" };
    a.emit("message", m);
    a.emit("message", m);
    a.emit("message", { id: "x", from: "972529999999@c.us", text: "  " });
    a.emit("message", { id: "y", from: "972529999999@c.us", text: "שלי", fromMe: true });
    await until(() => got.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(got.length, 1);
    assert.deepEqual(got[0], { id: "dup-1", from: "972529999999@c.us", isGroup: false, text: "שלום" });
    inb.stop();
  });

  it("כשהשליחה מושהית באתר הגשר לא שולח, וממשיך מיד כשחוזרים", async () => {
    await adm("PUT", "/api/admin/wa/settings", { enabled: false });
    noGap();
    const id = (await adm("POST", "/api/admin/wa/jobs/send", { contactId: (await adm("POST", "/api/admin/wa/contacts", { name: "דנה", phone: "054-7654321", battalion: "נעורים" })).body.id, text: "בהשבתה" })).body.jobId;
    await new Promise((r) => setTimeout(r, 500));
    assert.notEqual(jobRow(id)?.status, "sent");
    await adm("PUT", "/api/admin/wa/settings", { enabled: true });
    noGap();
    await until(() => jobRow(id).status === "sent");
  });

  it("נפילת הוואטסאפ: הגשר מפעיל מחדש את המתאם ומציג QR חדש", async () => {
    const before = adapter.getState();
    assert.equal(before.state, "connected");
    adapter.simulateClose();
    const q = await until(async () => { const x = await status(); return x.bridge.state === "qr" && x.bridge.qrSvg ? x : null; });
    assert.match(q.bridge.qrSvg, /<svg/);
    adapter.scan();
    await until(async () => (await status()).bridge.state === "connected");
  });

  it("כיבוי מסודר: האתר רואה 'מנותק' מיד", async () => {
    await bridge.stop();
    await bridge.finished;
    assert.equal((await status()).bridge.state, "disconnected");
  });

  it("אסימון שגוי: הגשר נעצר עם שגיאת אימות ולא מנסה שוב ושוב", async () => {
    const bad = new SiteClient({ siteUrl: base, token: "wb_" + "a".repeat(48) });
    const { b } = mkBridge({ client: bad });
    b.start();
    await b.finished;
    assert.ok(b.fatal, "נרשמה שגיאת אימות");
  });

  it("משימה שכבר נשלחה לא נשלחת שוב כשהאתר מחכיר אותה פעם נוספת", async () => {
    const a = new MockAdapter();
    a.scan();
    const o = new Outbox(null);
    o.begin(555); o.finish(555, { ok: true });
    const reported = [];
    let handed = 0;
    const fake = {
      next: async () => (handed++ === 0 ? { job: { id: 555, to: "972521234567@c.us", text: "כבר נשלחה", typingMs: 0 } } : { job: null, retryInMs: 1000 }),
      result: async (r) => { reported.push(r); return { ok: true }; },
    };
    const ctl = new AbortController();
    const loop = startOutbound({ adapter: a, client: fake, outbox: o, log: silentLogger, flags: {}, signal: ctl.signal, onAuthError() {} }, { idleMs: 20 });
    await until(() => handed >= 1 && o.pending().length === 0);
    ctl.abort();
    await loop.done;
    assert.equal(a.sent.length, 0, "לא נשלחה פעמיים");
    assert.ok(reported.every((r) => r.jobId === 555 && r.ok));
  });

  it("אסימון ששבוטל באתר מפסיק לעבוד", async () => {
    const b = (await adm("GET", "/api/admin/wa/bridges")).body[0];
    assert.equal((await adm("DELETE", `/api/admin/wa/bridges/${b.id}`)).status, 200);
    const { b: late } = mkBridge();
    late.start();
    await late.finished;
    assert.ok(late.fatal);
  });
});

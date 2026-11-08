// שלב 60: שליחת מייל. כשל חייב להיות רועש וברור (שגיאה + לוג), ושום מצב לא מחזיר "הצלחה שקטה".
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.MAIL_DEBUG = "1"; // הלוגים של הממייל פעילים גם בבדיקות, כדי לוודא שהם נכתבים
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-mailer-backups-" + process.pid;

const { createMailer, MailError } = await import("../src/email.js");
const { openDb } = await import("../src/db.js");

const db = openDb(":memory:");
const MSG = { to: "dvir@example.com", subject: "בדיקה", html: "<p>שלום</p>" };

/** שרת SMTP מינימלי: מקבל הכול, או דוחה נמען שמכיל "reject". */
function fakeSmtp() {
  const got = [];
  const srv = net.createServer((sock) => {
    let data = false;
    let buf = "";
    let cur = { rcpt: [] };
    sock.write("220 fake ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      while (true) {
        if (data) {
          const i = buf.indexOf("\r\n.\r\n");
          if (i < 0) return;
          cur.body = buf.slice(0, i);
          buf = buf.slice(i + 5);
          data = false;
          got.push(cur);
          cur = { rcpt: [] };
          sock.write("250 2.0.0 OK queued as fake123\r\n");
          continue;
        }
        const i = buf.indexOf("\r\n");
        if (i < 0) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^EHLO|^HELO/i.test(line)) sock.write("250 fake\r\n");
        else if (/^MAIL FROM/i.test(line)) sock.write("250 OK\r\n");
        else if (/^RCPT TO/i.test(line)) {
          if (/reject/i.test(line)) sock.write("550 5.1.1 no such user\r\n");
          else { cur.rcpt.push(line); sock.write("250 OK\r\n"); }
        } else if (/^DATA/i.test(line)) { data = true; sock.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 OK\r\n");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((res) => srv.listen(0, "127.0.0.1", () => res({ srv, got, port: srv.address().port })));
}

describe("mailer: ללא ספק", () => {
  const m = createMailer(db, { host: "", adminEmail: "" });
  it("hasTransport כבוי, ו-sendNow זורק שגיאה ברורה במקום להחזיר false", async () => {
    assert.equal(m.hasTransport, false);
    assert.equal(m.mode, "none");
    await assert.rejects(m.sendNow(MSG), (e) => e instanceof MailError && e.code === "MAIL_NOT_CONFIGURED" && /SMTP_HOST|MAIL_RELAY_URL/.test(e.hint));
  });
  it("describe לא חושף סיסמאות", () => {
    const d = createMailer(db, { host: "smtp.gmail.com", port: 587, user: "dvir@gmail.com", pass: "abcdefghijklmnop" }).describe();
    assert.equal(d.mode, "smtp");
    assert.equal(d.user, "d***@gmail.com");
    assert.equal(d.passwordLength, 16);
    assert.ok(!JSON.stringify(d).includes("abcdefghijklmnop"));
  });
});

describe("mailer: SMTP", () => {
  let s;
  before(async () => { s = await fakeSmtp(); });
  after(() => s.srv.close());

  it("שליחה מוצלחת מחזירה messageId, accepted ותשובת השרת", async () => {
    const m = createMailer(db, { host: "127.0.0.1", port: s.port, from: "noreply@example.com" });
    const r = await m.sendNow(MSG);
    assert.equal(r.ok, true);
    assert.deepEqual(r.accepted, ["dvir@example.com"]);
    assert.match(r.response, /250/);
    assert.ok(r.id);
    assert.equal(s.got.length, 1);
  });

  it("נמען שנדחה מוביל לשגיאה, לא להצלחה", async () => {
    const m = createMailer(db, { host: "127.0.0.1", port: s.port, from: "noreply@example.com" });
    await assert.rejects(m.sendNow({ ...MSG, to: "reject@example.com" }), (e) => e instanceof MailError);
  });

  it("שרת שלא עונה בכלל (פורט סגור): שגיאה עם הסבר על Render", async () => {
    const closed = net.createServer();
    await new Promise((r) => closed.listen(0, "127.0.0.1", r));
    const port = closed.address().port;
    await new Promise((r) => closed.close(r));
    const m = createMailer(db, { host: "127.0.0.1", port });
    await assert.rejects(m.sendNow(MSG), (e) => e instanceof MailError && /Render/.test(e.hint));
  });

  it("verify/selfCheck רושם lastVerify", async () => {
    const m = createMailer(db, { host: "127.0.0.1", port: s.port });
    await m.selfCheck();
    assert.equal(m.describe().lastVerify.ok, true);
  });
});

describe("mailer: ממסר HTTPS (Apps Script)", () => {
  let srv, url, last, mode;
  before(async () => {
    srv = http.createServer((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        last = JSON.parse(b);
        if (mode === "html") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>sign in</html>"); }
        res.writeHead(200, { "content-type": "application/json" });
        if (mode === "badsecret" || last.secret !== "S3CR3T") return res.end(JSON.stringify({ ok: false, error: "bad secret" }));
        res.end(JSON.stringify({ ok: true, remaining: 97 }));
      });
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${srv.address().port}/exec`;
  });
  after(() => srv.close());

  it("שולח JSON עם הסוד, הנמען והקבצים", async () => {
    mode = "ok";
    const m = createMailer(db, { relayUrl: url, relaySecret: "S3CR3T" });
    assert.equal(m.mode, "relay");
    const r = await m.sendNow({ ...MSG, attachments: [{ filename: "a.txt", content: Buffer.from("hi") }] });
    assert.equal(r.ok, true);
    assert.match(r.response, /97/);
    assert.equal(last.to, "dvir@example.com");
    assert.equal(last.attachments[0].base64, Buffer.from("hi").toString("base64"));
  });
  it("סוד שגוי: שגיאה עם הסבר", async () => {
    mode = "badsecret";
    const m = createMailer(db, { relayUrl: url, relaySecret: "WRONG" });
    await assert.rejects(m.sendNow(MSG), (e) => e.code === "RELAY_FAILED" && /MAIL_RELAY_SECRET/.test(e.hint));
  });
  it("תשובה שאינה JSON (דף כניסה של גוגל): שגיאה, לא הצלחה", async () => {
    mode = "html";
    const m = createMailer(db, { relayUrl: url, relaySecret: "S3CR3T" });
    await assert.rejects(m.sendNow(MSG), (e) => e.code === "RELAY_FAILED" && /Web app/.test(e.message));
  });
  it("ממסר מנצח SMTP כששניהם מוגדרים", () => {
    assert.equal(createMailer(db, { host: "smtp.gmail.com", relayUrl: url, relaySecret: "x" }).mode, "relay");
  });
});

describe("mailer: Resend", () => {
  it("קורא ל-API עם Bearer, ושגיאת 403 הופכת לשגיאה עם הסבר", async () => {
    const real = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (u, o) => {
      calls.push({ u, o });
      return calls.length === 1
        ? new Response(JSON.stringify({ id: "re_1" }), { status: 200 })
        : new Response(JSON.stringify({ message: "You can only send testing emails to your own email address" }), { status: 403 });
    };
    try {
      const m = createMailer(db, { resendKey: "re_key", from: "onboarding@resend.dev" });
      const r = await m.sendNow(MSG);
      assert.equal(r.id, "re_1");
      assert.equal(calls[0].u, "https://api.resend.com/emails");
      assert.equal(calls[0].o.headers.Authorization, "Bearer re_key");
      await assert.rejects(m.sendNow(MSG), (e) => e.code === "RESEND_FAILED" && /דומיין/.test(e.hint));
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("תור ההודעות", () => {
  it("כשל בשליחה מהתור נרשם בתור לניסיון חוזר", async () => {
    const m = createMailer(db, { relayUrl: "http://127.0.0.1:1/x", relaySecret: "s" });
    m.enqueue("נושא", "<p>x</p>", "q@example.com");
    await m.processQueue();
    const row = db.prepare("SELECT * FROM email_queue WHERE to_addr = 'q@example.com'").get();
    assert.equal(row.status, "PENDING");
    assert.equal(row.attempts, 1);
    assert.ok(row.last_error);
  });
});

describe("הנתיבים: כל שליחה וכל דילוג נכתבים ללוג של השרת", () => {
  let server, base, db2, lines, realLog, realErr;
  const call = async (m, p, tok, body) => {
    const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: m === "GET" ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const logged = (re) => lines.some((l) => re.test(l));
  before(async () => {
    const { createApp } = await import("../src/app.js");
    const { seedIfEmpty } = await import("../src/seed.js");
    const { ensureAdmin } = await import("../src/auth.js");
    db2 = openDb(":memory:");
    seedIfEmpty(db2);
    ensureAdmin(db2);
    // ממסר שמצביע לפורט סגור: כל שליחה נכשלת מיד
    server = createApp({ db: db2, mailer: createMailer(db2, { relayUrl: "http://127.0.0.1:1/x", relaySecret: "s" }), serveStatic: false }).listen(0);
    base = `http://localhost:${server.address().port}`;
    lines = [];
    realLog = console.log;
    realErr = console.error;
    console.log = (...a) => lines.push(a.join(" "));
    console.error = (...a) => lines.push(a.join(" "));
  });
  after(() => {
    console.log = realLog;
    console.error = realErr;
    server.close();
  });

  it("איפוס סיסמה: התשובה זהה לכולם, אבל כשל שליחה מופיע בלוג עם סיבה והסבר", async () => {
    const r = await call("POST", "/api/auth/register", null, { username: "mailfail", password: "Passw0rd!xyz", displayName: "בודק", signupCode: "shevet-code", email: "mailfail@example.com" });
    assert.equal(r.status, 201);
    db2.prepare("UPDATE users SET email_verified_at = ? WHERE username = 'mailfail'").run(new Date().toISOString());
    lines.length = 0;
    const f = await call("POST", "/api/auth/forgot", null, { identifier: "mailfail@example.com" });
    assert.equal(f.status, 200);
    assert.equal(f.body.ok, true);
    await new Promise((res) => setTimeout(res, 300)); // התור רץ ברקע
    assert.ok(logged(/\[deliver\] email → m\*\*\*@example\.com/), "נרשם ניסיון שליחה (מסכה)");
    assert.ok(logged(/\[mail\] נכשל \| ערוץ=relay/), "נרשם הכשלון מהספק");
    assert.ok(!logged(/mailfail@example\.com/), "הכתובת המלאה לא נכתבת ללוג");
  });

  it("איפוס סיסמה לפי מייל שלא אומת: דילוג מוסבר בלוג", async () => {
    await call("POST", "/api/auth/register", null, { username: "unver", password: "Passw0rd!xyz", displayName: "בודק", signupCode: "shevet-code", email: "unver@example.com" });
    lines.length = 0;
    const f = await call("POST", "/api/auth/forgot", null, { identifier: "unver@example.com" });
    assert.equal(f.status, 200);
    assert.ok(logged(/\[forgot\] דילוג: יש חשבון עם המייל הזה אבל הוא עדיין לא מאומת/));
  });

  it("איפוס סיסמה לחשבון לא קיים: אותה תשובה, ודילוג בלוג", async () => {
    lines.length = 0;
    const f = await call("POST", "/api/auth/forgot", null, { identifier: "nobody-here" });
    assert.equal(f.status, 200);
    assert.ok(logged(/\[forgot\] דילוג: לא נמצא חשבון/));
  });

  it("אימות מייל מהחשבון (לא אנונימי): כשל שליחה מחזיר 502 ונכתב ללוג עם הקוד", async () => {
    const r = await call("POST", "/api/auth/login", null, { username: "unver", password: "Passw0rd!xyz" });
    lines.length = 0;
    const v = await call("POST", "/api/me/verify/request", r.body.token, { channel: "email" });
    assert.equal(v.status, 502);
    assert.ok(logged(/\[deliver\] email → u\*\*\*@example\.com .*נכשל/), lines.join("\n"));
  });
});

// שלב 65: ביצועים ואמינות (ממצאים 41–66): שגיאות שרת, בדיקת שחזור, גרסת סכמה, מטמון, חיפוש, לוגו וגופנים.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.BACKUP_DIR = os.tmpdir() + "/scout-h65-backups-" + process.pid;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const { createApp } = await import("../src/app.js");
const { openDb, schemaVersion, SCHEMA_VERSION } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { searchActivities } = await import("../src/activities.js");
const { recordServerError, recentServerErrors, resetServerErrors } = await import("../src/server-errors.js");
const persist = await import("../src/persist.js");

describe("57–59. שגיאות שרת נרשמות, לא נעלמות, והתראה פעם בשעה", () => {
  it("רישום, איחוד שגיאות זהות והתראה אחת בלבד", () => {
    resetServerErrors();
    const db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    const queued = [];
    const mailer = { hasTransport: true, enqueue: (subject, html, to) => queued.push({ subject, html, to }) };
    const config = { smtp: { adminEmail: "admin@example.com" } };
    const err = new Error("boom <b>x</b>");
    const quiet = { error() {} };
    recordServerError({ db, mailer, config, log: quiet }, "http500", err, { path: "/api/x" });
    recordServerError({ db, mailer, config, log: quiet }, "http500", err, { path: "/api/x" });
    recordServerError({ db, mailer, config, log: quiet }, "http500", err, { path: "/api/x" });
    const list = recentServerErrors();
    assert.equal(list.length, 1);
    assert.equal(list[0].count, 3);
    assert.equal(queued.length, 1, "התראה אחת בלבד לאותה שגיאה");
    assert.equal(queued[0].to, "admin@example.com");
    assert.ok(!queued[0].html.includes("<b>x</b>"), "ההודעה עוברת הברחת HTML");
    const n = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE kind = 'error'").get().c;
    assert.ok(n >= 1, "התראה באתר לאדמין");
    // שגיאה שונה מקבלת התראה משלה
    recordServerError({ db, mailer, config, log: quiet }, "unhandledRejection", new Error("אחרת"));
    assert.equal(queued.length, 2);
    // שגיאה בלי db או mailer לא קורסת
    assert.doesNotThrow(() => recordServerError({ log: quiet }, "x", "טקסט בלבד"));
    resetServerErrors();
  });
  it("תקרה של 10 התראות ביום", () => {
    resetServerErrors();
    const queued = [];
    const mailer = { hasTransport: true, enqueue: (...a) => queued.push(a) };
    const config = { smtp: { adminEmail: "a@example.com" } };
    for (let i = 0; i < 25; i++) recordServerError({ mailer, config, log: { error() {} } }, "k", new Error(`שגיאה ${i}`));
    assert.equal(queued.length, 10);
    resetServerErrors();
  });
  it("all.js: כיבוי מסודר ומעקב אחר חריגות (נבדק בקוד, כי הוא דורש אתר בנוי)", () => {
    const code = fs.readFileSync(path.join(ROOT, "backend/src/all.js"), "utf8");
    assert.match(code, /installProcessGuards\(/);
    assert.match(code, /process\.on\("SIGTERM"/);
    assert.match(code, /httpServer = app\.listen/);
    assert.match(code, /closeIdleConnections/);
    assert.match(code, /persist\?\.flush\(\)/);
    assert.match(code, /await web\.prepare\(\)/, "השרת עדיין מפעיל את Next.js");
  });
});

describe("60. גרסת סכמה", () => {
  it("PRAGMA user_version מתעדכן", () => {
    const db = openDb(":memory:");
    assert.equal(schemaVersion(db), SCHEMA_VERSION);
    assert.ok(SCHEMA_VERSION >= 64);
  });
  it("PRAGMAs של ביצועים", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "h65-")), "p.db");
    const db = openDb(f);
    assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    assert.equal(db.prepare("PRAGMA synchronous").get().synchronous, 1, "NORMAL");
    assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_runs_activity'").get();
    assert.ok(idx, "אינדקס לפי פעולה בטבלת הרצות");
    db.close();
  });
});

describe("64. בדיקת שחזור של הגיבוי", () => {
  const SECRET = "s".repeat(40);
  function fake() {
    const store = { content: null };
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (d) => chunks.push(d));
      req.on("end", () => {
        if (req.headers.authorization !== "Bearer tok") return res.writeHead(401).end();
        if (req.method === "GET") {
          if (!store.content) return res.writeHead(404).end("{}");
          if (/raw/.test(req.headers.accept)) return res.writeHead(200).end(Buffer.from(store.content, "base64"));
          return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sha: "s1" }));
        }
        store.content = JSON.parse(Buffer.concat(chunks).toString()).content;
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ content: { sha: "s2" } }));
      });
    });
    return new Promise((ok) => srv.listen(0, () => ok({ srv, store, url: `http://127.0.0.1:${srv.address().port}` })));
  }
  it("גיבוי תקין עובר, ומפתח לא מתאים או אין גיבוי נכשלים עם הסבר", async () => {
    const { srv, store, url } = await fake();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET };
    const quiet = () => {};
    assert.deepEqual((await persist.verifyRemoteBackup({ env: { DATA_REPO: "", DATA_TOKEN: "" }, log: quiet })).ok, false);
    const none = await persist.verifyRemoteBackup({ env, log: quiet });
    assert.equal(none.ok, false);
    assert.match(none.error, /אין עדיין גיבוי/);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "h65v-")), "v.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('1')");
    await persist.startPersist(db, file, { env, log: quiet, pollMs: 3_600_000 }).flush();
    const ok = await persist.verifyRemoteBackup({ env, log: quiet });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.encrypted, true);
    assert.equal(persist.persistState.verifyOk, true);
    assert.ok(persist.persistState.lastVerifiedAt);
    const wrong = await persist.verifyRemoteBackup({ env: { ...env, JWT_SECRET: "z".repeat(40) }, log: quiet });
    assert.equal(wrong.ok, false);
    assert.equal(persist.persistState.verifyOk, false);
    assert.ok(persist.persistState.verifyError);
    // המסד החי לא הושפע
    assert.equal(db.prepare("SELECT x FROM t").get().x, "1");
    db.close();
    srv.close();
    void store;
  });
});

describe("41–52. מטמון, חיפוש ונכסים", () => {
  let server, base, db;
  before(() => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    const app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;
  });
  after(() => server.close());

  it("/api/methods ו-/api/meta: מטמון קצר לאורחים, ולא למחוברים", async () => {
    for (const p of ["/api/methods", "/api/meta"]) {
      const g = await fetch(base + p);
      assert.match(g.headers.get("cache-control") || "", /max-age=60/, p);
      const a = await fetch(base + p, { headers: { authorization: "Bearer x" } });
      assert.match(a.headers.get("cache-control") || "", /no-store/, p);
    }
  });

  it("חיפוש: אותן תוצאות (דירוג וספירת הרצות) עם שאילתות מקובצות", () => {
    const first = db.prepare("SELECT id FROM activities WHERE status='PUBLISHED' ORDER BY id LIMIT 2").all();
    for (const [i, a] of first.entries()) {
      for (let k = 0; k <= i; k++) db.prepare("INSERT INTO ratings (activity_id, stars, created_at) VALUES (?,?,?)").run(a.id, 4 + (k % 2), new Date().toISOString());
    }
    const r = searchActivities(db, { pageSize: 50 });
    assert.ok(r.items.length >= 3);
    const byId = new Map(r.items.map((x) => [x.id, x]));
    assert.equal(byId.get(first[0].id).rating.count, 1);
    assert.equal(byId.get(first[0].id).rating.average, 4);
    assert.equal(byId.get(first[1].id).rating.count, 2);
    assert.equal(byId.get(first[1].id).rating.average, 4.5);
    const none = r.items.find((x) => x.id !== first[0].id && x.id !== first[1].id);
    assert.deepEqual(none.rating, { count: 0, average: 0 });
    assert.equal(typeof none.runCount, "number");
    assert.equal(searchActivities(db, { q: "zzzz-לא-קיים-zzzz" }).items.length, 0);
  });

  it("לוגו קטן, גופנים מקומיים וכותרות מטמון בקונפיגורציה של האתר", () => {
    const fe = path.join(ROOT, "frontend");
    const small = fs.statSync(path.join(fe, "public/logo-maoz-320.v1.webp")).size;
    assert.ok(small < 40_000, `הלוגו הקטן שוקל ${small}`);
    assert.ok(fs.statSync(path.join(fe, "public/logo-maoz-640.v1.webp")).size < 80_000);
    const css = fs.readFileSync(path.join(fe, "src/app/globals.css"), "utf8");
    assert.doesNotMatch(css, /fonts\.googleapis/);
    const layout = fs.readFileSync(path.join(fe, "src/app/layout.tsx"), "utf8");
    assert.match(layout, /@fontsource\/heebo\/hebrew-400\.css/);
    assert.match(layout, /@fontsource\/rubik\/hebrew-700\.css/);
    const nc = fs.readFileSync(path.join(fe, "next.config.mjs"), "utf8");
    assert.match(nc, /immutable/);
    for (const f of ["Chrome.tsx", "Polish.tsx", "login/LampLogin.tsx", "lux/EagleIntro.tsx"]) {
      assert.doesNotMatch(fs.readFileSync(path.join(fe, "src/components", f), "utf8"), /logo-maoz\.png/, f);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(fe, "src/app/(site)/layout.tsx"), "utf8"), /src="\/logo-maoz\.png"/);
    const tribe = fs.readFileSync(path.join(fe, "src/lib/lux/tribe.ts"), "utf8");
    assert.match(tribe, /version === "builtin"/);
    const sm = fs.readFileSync(path.join(fe, "src/app/sitemap.ts"), "utf8");
    assert.match(sm, /TTL_MS/);
  });

  it("ה-CSP כבר לא מתיר את Google Fonts", async () => {
    const r = await fetch(base + "/api/health");
    const csp = r.headers.get("content-security-policy") || "";
    assert.doesNotMatch(csp, /googleapis|gstatic/);
    assert.match(csp, /font-src 'self'/);
  });
});

describe("62. מייל בדיקה לאדמין", () => {
  let server, base, db, tok;
  const sent = [];
  let failNext = false;
  const stub = {
    hasTransport: true,
    mode: "smtp",
    enqueue() {},
    describe: () => ({ mode: "smtp" }),
    sendNow: async (m) => {
      if (failNext) throw Object.assign(new Error("חיבור נדחה"), { code: "ECONNREFUSED", hint: "בדקו SMTP_HOST" });
      sent.push(m);
      return { ok: true, mode: "smtp", accepted: [m.to] };
    },
  };
  const call = (p, o = {}) => fetch(base + p, { ...o, headers: { "content-type": "application/json", ...(o.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  async function start(mailer) {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    server = createApp({ db, mailer }).listen(0);
    base = `http://localhost:${server.address().port}`;
    const r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "admin123" }) });
    let t = r.body.token;
    if (r.body.user.mustChangePw) {
      await call("/api/auth/change-password", { method: "POST", headers: { authorization: `Bearer ${t}` }, body: JSON.stringify({ currentPassword: "admin123", newPassword: "Adm1n!Strong-pass-65" }) });
      t = (await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "Adm1n!Strong-pass-65" }) })).body.token;
    }
    tok = t;
  }
  const test = () => call("/api/admin/mail/test", { method: "POST", headers: { authorization: `Bearer ${tok}` }, body: "{}" });

  it("בלי ספק מייל: 400 עם הסבר, ובלי הרשאת אדמין: 401/403", async () => {
    await start(createMailer(db ?? openDb(":memory:"), { host: "", adminEmail: "" }));
    const r = await test();
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "NO_MAIL");
    const anon = await call("/api/admin/mail/test", { method: "POST", body: "{}" });
    assert.ok([401, 403].includes(anon.status));
    server.close();
  });

  it("עם ספק: נשלח רק לכתובת האדמין (לא לכתובת שמגיעה בבקשה), והתשובה מסתירה את הכתובת", async () => {
    process.env.ADMIN_EMAIL = "";
    await start(stub);
    const { config } = await import("../src/config.js");
    const prev = config.smtp.adminEmail;
    config.smtp.adminEmail = "owner@example.com";
    try {
      const noTarget = db.prepare("SELECT email FROM users WHERE username='admin'").get();
      assert.ok(!noTarget.email);
      const bodyTo = await call("/api/admin/mail/test", { method: "POST", headers: { authorization: `Bearer ${tok}` }, body: JSON.stringify({ to: "victim@example.org" }) });
      assert.equal(bodyTo.status, 200, JSON.stringify(bodyTo.body));
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, "owner@example.com", "הנמען נקבע בשרת");
      assert.equal(bodyTo.body.to, "o***@example.com");
      assert.ok(!JSON.stringify(bodyTo.body).includes("owner@example.com"));
      assert.equal(db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'mail.test'").get().c, 1);
      failNext = true;
      const bad = await test();
      assert.equal(bad.status, 502);
      assert.equal(bad.body.error.code, "MAIL_FAILED");
      assert.match(bad.body.error.message, /חיבור נדחה/);
      assert.match(bad.body.error.message, /SMTP_HOST/);
      failNext = false;
      config.smtp.adminEmail = "";
      const none = await test();
      assert.equal(none.status, 400);
      assert.equal(none.body.error.code, "NO_TARGET");
    } finally {
      config.smtp.adminEmail = prev;
      server.close();
    }
  });
});

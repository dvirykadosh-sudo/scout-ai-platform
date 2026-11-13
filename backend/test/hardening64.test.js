// שלב 64: תיקוני אבטחה (ממצאים 21–40): גיבוי מוצפן, שחזור בטוח, תקרות, אתגר 2FA חד-פעמי, Service Worker, שיטות HTTP, תוקף שיתוף.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = os.tmpdir() + "/scout-h64-backups-" + process.pid;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin, signChallenge, readChallenge, burnChallenge } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { config } = await import("../src/config.js");
const persist = await import("../src/persist.js");
const { takeAiBudget, aiBudgetState } = await import("../src/ai-budget.js");
const { takeDaily } = await import("../src/guest-limits.js");

// ───────────── GitHub מדומה ─────────────
function fakeGithub() {
  const store = { content: null, sha: null, puts: 0, getFail: 0, getStatus: 500, gets: 0 };
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer tok") return res.writeHead(401).end();
      if (req.method === "GET") {
        store.gets++;
        if (store.getFail > 0) {
          store.getFail--;
          return res.writeHead(store.getStatus).end("{}");
        }
        if (!store.content) return res.writeHead(404).end("{}");
        if (/raw/.test(req.headers.accept)) return res.writeHead(200).end(Buffer.from(store.content, "base64"));
        return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sha: store.sha }));
      }
      const b = JSON.parse(Buffer.concat(chunks).toString());
      if (store.sha && b.sha !== store.sha) return res.writeHead(409).end("{}");
      store.content = b.content;
      store.sha = "sha" + ++store.puts;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ content: { sha: store.sha } }));
    });
  });
  return new Promise((ok) => srv.listen(0, () => ok({ srv, store, url: `http://127.0.0.1:${srv.address().port}` })));
}
const quiet = () => {};
const tmpDb = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "h64-")), name);
const SECRET_A = "a".repeat(40);
const SECRET_B = "b".repeat(40);

describe("21–22. גיבוי GitHub מוצפן וחתום", () => {
  // מצב השמירה הוא גלובלי במודול, ולכן מאפסים בין בדיקות
  beforeEach(() => {
    persist.persistState.blocked = null;
    persist.persistState.failStreak = 0;
    persist.persistState.lastError = null;
  });
  it("הצילום מוצפן: אי אפשר לקרוא ממנו תוכן, והשחזור עובד עם אותו מפתח", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET_A };
    const file = tmpDb("a.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('סוד-של-הקבוצה')");
    const p = persist.startPersist(db, file, { env, log: quiet, pollMs: 3_600_000 });
    assert.equal(await p.flush(), true);
    const raw = Buffer.from(store.content, "base64");
    assert.equal(raw.subarray(0, 4).toString(), "MZB1", "כותרת הפורמט המוצפן");
    assert.ok(!raw.includes(Buffer.from("SQLite format")) && !raw.includes(Buffer.from("סוד-של-הקבוצה")), "אין טקסט גלוי");
    assert.equal(persist.persistState.encrypted, true);
    assert.equal(persist.persistState.keySource, "JWT_SECRET");
    db.close();
    fs.rmSync(file);
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet }), "restored");
    const back = new DatabaseSync(file);
    assert.equal(back.prepare("SELECT x FROM t").get().x, "סוד-של-הקבוצה");
    back.close();
    srv.close();
  });

  it("BACKUP_KEY קודם ל-JWT_SECRET, ובשחזור אפשר לפתוח גם עם JWT_SECRET_PREVIOUS", async () => {
    const { srv, store, url } = await fakeGithub();
    const base = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url };
    const file = tmpDb("b.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('1')");
    const p = persist.startPersist(db, file, { env: { ...base, JWT_SECRET: SECRET_A, BACKUP_KEY: "k".repeat(32) }, log: quiet, pollMs: 3_600_000 });
    await p.flush();
    assert.equal(persist.persistState.keySource, "BACKUP_KEY");
    db.close();
    fs.rmSync(file);
    // JWT_SECRET הוחלף, אבל BACKUP_KEY נשאר: נפתח
    assert.equal(await persist.restoreIfMissing(file, { env: { ...base, JWT_SECRET: SECRET_B, BACKUP_KEY: "k".repeat(32) }, log: quiet }), "restored");
    fs.rmSync(file);
    // גיבוי שהוצפן ב-JWT_SECRET ישן נפתח דרך JWT_SECRET_PREVIOUS
    const d2 = new DatabaseSync(file);
    d2.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('2')");
    const p2 = persist.startPersist(d2, file, { env: { ...base, JWT_SECRET: SECRET_A }, log: quiet, pollMs: 3_600_000 });
    await p2.flush();
    d2.close();
    fs.rmSync(file);
    assert.equal(await persist.restoreIfMissing(file, { env: { ...base, JWT_SECRET: SECRET_B, JWT_SECRET_PREVIOUS: SECRET_A }, log: quiet }), "restored");
    assert.ok(store.puts >= 2);
    srv.close();
  });

  it("מפתח לא מתאים: השחזור נעצר (locked), השמירה חסומה, והגיבוי הקיים לא נדרס", async () => {
    const { srv, store, url } = await fakeGithub();
    const base = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url };
    const file = tmpDb("c.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('חשוב')");
    await persist.startPersist(db, file, { env: { ...base, JWT_SECRET: SECRET_A }, log: quiet, pollMs: 3_600_000 }).flush();
    const before = store.content;
    db.close();
    fs.rmSync(file);
    const env = { ...base, JWT_SECRET: SECRET_B };
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet }), "locked");
    assert.ok(persist.persistState.blocked);
    assert.equal(persist.persistHealthy(), false, "המצב מדווח כלא תקין");
    assert.equal(fs.existsSync(file), false, "לא נוצר קובץ");
    // מסד חדש וריק עולה, אבל לא דורס את הגיבוי
    const fresh = new DatabaseSync(file);
    fresh.exec("CREATE TABLE t(x TEXT)");
    const p = persist.startPersist(fresh, file, { env, log: quiet, pollMs: 3_600_000 });
    assert.equal(await p.push({ force: true }), false);
    assert.equal(store.content, before, "הגיבוי נשאר כמו שהיה");
    // רק אישור מפורש (override) דורס
    assert.equal(await p.push({ force: true, override: true }), true);
    assert.notEqual(store.content, before);
    assert.equal(persist.persistState.blocked, null);
    fresh.close();
    srv.close();
  });

  it("קובץ פגום או מזויף לא משוחזר", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET_A };
    const file = tmpDb("d.db");
    // 1. צילום מוצפן שנוסה לשנות בו בית: GCM דוחה
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('x')");
    await persist.startPersist(db, file, { env, log: quiet, pollMs: 3_600_000 }).flush();
    db.close();
    fs.rmSync(file);
    const good = Buffer.from(store.content, "base64");
    const tampered = Buffer.from(good);
    tampered[tampered.length - 5] ^= 0xff;
    store.content = tampered.toString("base64");
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet }), "locked");
    assert.equal(fs.existsSync(file), false);
    // 2. gzip תקין אבל התוכן אינו מסד SQLite
    store.content = zlib.gzipSync(Buffer.from("not a database ".repeat(500))).toString("base64");
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet }), "invalid");
    assert.equal(fs.existsSync(file), false);
    assert.ok(persist.persistState.blocked);
    // 3. פורמט לא מוכר
    store.content = Buffer.from("garbage-bytes").toString("base64");
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet }), "invalid");
    srv.close();
  });

  it("צילום ישן (דחוס בלי הצפנה) עדיין משוחזר, והשמירה הבאה מוצפנת", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET_A };
    const file = tmpDb("e.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('ישן')");
    const legacy = zlib.gzipSync(fs.readFileSync(file));
    db.close();
    fs.rmSync(file);
    store.content = legacy.toString("base64");
    store.sha = "old1";
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet }), "restored");
    const back = new DatabaseSync(file);
    assert.equal(back.prepare("SELECT x FROM t").get().x, "ישן");
    back.exec("INSERT INTO t VALUES ('חדש')");
    const p = persist.startPersist(back, file, { env, log: quiet, pollMs: 3_600_000 });
    assert.equal(await p.push({ force: true }), true);
    assert.equal(Buffer.from(store.content, "base64").subarray(0, 4).toString(), "MZB1");
    back.close();
    srv.close();
  });

  it("שגיאת שרת זמנית מנוסה שוב. כישלון מלא חוסם שמירה ולא דורס", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET_A };
    const file = tmpDb("f.db");
    const seed = new DatabaseSync(file);
    seed.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('נתון')");
    await persist.startPersist(seed, file, { env, log: quiet, pollMs: 3_600_000 }).flush();
    seed.close();
    fs.rmSync(file);
    const savedContent = store.content;
    // 502 פעמיים ואז הצלחה
    store.getFail = 2;
    store.getStatus = 502;
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet, waitMs: 5 }), "restored");
    fs.rmSync(file);
    // 500 בכל הניסיונות
    store.getFail = 99;
    store.getStatus = 500;
    assert.equal(await persist.restoreIfMissing(file, { env, log: quiet, waitMs: 5 }), "error");
    assert.match(persist.persistState.blocked, /נכשל/);
    store.getFail = 0;
    const fresh = new DatabaseSync(file);
    fresh.exec("CREATE TABLE t(x TEXT)");
    const p = persist.startPersist(fresh, file, { env, log: quiet, pollMs: 3_600_000 });
    assert.equal(await p.push({ force: true }), false, "אסור לדרוס את הגיבוי במסד ריק");
    assert.equal(store.content, savedContent);
    fresh.close();
    srv.close();
  });

  it("שינוי ברעש בלבד (ביקורים) לא מעלה בכל דקה, ושינוי אמיתי כן", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET_A };
    const file = tmpDb("g.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); CREATE TABLE access_log(id INTEGER PRIMARY KEY, note TEXT); INSERT INTO t VALUES ('1')");
    const p = persist.startPersist(db, file, { env, log: quiet, pollMs: 3_600_000, minGapMs: 0, noiseGapMs: 3_600_000 });
    assert.equal(await p.push({ force: true }), true);
    const puts = store.puts;
    db.exec("INSERT INTO access_log(note) VALUES ('ביקור')");
    assert.equal(await p.push(), false, "רעש בלבד: לא מעלים");
    assert.equal(store.puts, puts);
    assert.equal(persist.persistHealthy(), true, "ובכל זאת השמירה נחשבת תקינה");
    db.exec("INSERT INTO t VALUES ('2')");
    assert.equal(await p.push(), true, "שינוי אמיתי נשמר");
    assert.equal(store.puts, puts + 1);
    db.close();
    srv.close();
  });

  it("רצף כישלונות נספר ומתאפס אחרי הצלחה", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url, JWT_SECRET: SECRET_A };
    const file = tmpDb("h.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('1')");
    const p = persist.startPersist(db, file, { env: { ...env, DATA_TOKEN: "wrong" }, log: quiet, pollMs: 3_600_000 });
    persist.persistState.failStreak = 0;
    await p.push({ force: true });
    await p.push({ force: true });
    assert.equal(persist.persistState.failStreak, 2);
    const ok = persist.startPersist(db, file, { env, log: quiet, pollMs: 3_600_000 });
    assert.equal(await ok.push({ force: true }), true);
    assert.equal(persist.persistState.failStreak, 0);
    assert.ok(store.content);
    db.close();
    srv.close();
  });
});

describe("28. אתגר 2FA חד-פעמי", () => {
  it("אחרי כניסה מוצלחת אי אפשר להשתמש שוב באותו אסימון", () => {
    const t = signChallenge(7);
    const p = readChallenge(t);
    assert.equal(p.sub, 7);
    assert.ok(p.jti);
    assert.ok(readChallenge(t), "לפני ניצול: תקף (אפשר לנסות קוד כמה פעמים)");
    burnChallenge(p);
    assert.equal(readChallenge(t), null);
    assert.ok(readChallenge(signChallenge(7)), "אסימון חדש עובד");
  });
});

describe("23. תקרת הוצאה כללית ל-AI", () => {
  it("מעבר לתקרה היומית נחסם", () => {
    const old = config.ai.dailyCap;
    config.ai.dailyCap = 3;
    try {
      const day = aiBudgetState().day;
      // איפוס: נריץ עד שנחסם ונמדוד
      let allowed = 0;
      for (let i = 0; i < 10; i++) if (takeAiBudget()) allowed++;
      assert.ok(allowed <= 3, `הותרו ${allowed}`);
      assert.equal(takeAiBudget(), false);
      assert.ok(aiBudgetState().blocked > 0);
      assert.equal(aiBudgetState().cap, 3);
      assert.equal(typeof day, "string");
    } finally {
      config.ai.dailyCap = old;
    }
  });
});

describe("24–26. מכסות יומיות לאורחים ולטלמטריה", () => {
  let server, base, db, adminTok;
  const j = async (p, opts = {}) => {
    const r = await fetch(base + p, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const post = (p, body, tok, headers = {}) => j(p, { method: "POST", body: JSON.stringify(body), headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers } });
  const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: { authorization: `Bearer ${tok}` } });
  const get = (p, tok) => j(p, { headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  const activityId = () => db.prepare("SELECT id FROM activities WHERE status = 'PUBLISHED' ORDER BY id LIMIT 1").get().id;
  const input = () => ({ topic: "אחריות", value: "אחריות", ageGroup: "כיתה ז' - מעורב", participants: 12, instructor: "נועה", role: "מדריכה", methods: [{ name: "משחק תחרות", minutes: 10 }, { name: "דיון בשאלה", minutes: 12 }, { name: "הסבר", minutes: 5 }] });

  before(async () => {
    process.env.DAILY_CAPS = "1";
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    const app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;
    const r = await post("/api/auth/login", { username: "admin", password: "admin123" });
    const t = r.body.token;
    if (r.body.user.mustChangePw) {
      await post("/api/auth/change-password", { currentPassword: "admin123", newPassword: "Adm1n!Strong-pass-64" }, t);
      adminTok = (await post("/api/auth/login", { username: "admin", password: "Adm1n!Strong-pass-64" })).body.token;
    } else adminTok = t;
  });
  after(() => {
    delete process.env.DAILY_CAPS;
    server.close();
  });

  it("אורח מדרג פעולה אחת לכל היותר 3 פעמים ביום, ואין טלפונים וקישורים בהערה", async () => {
    const id = activityId();
    const first = await post(`/api/activities/${id}/ratings`, { stars: 5, comment: "מעולה! התקשרו 054-1234567 או www.example.com", author: "רותם" });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const row = db.prepare("SELECT comment, author FROM ratings WHERE activity_id = ? ORDER BY id DESC LIMIT 1").get(id);
    assert.ok(!/054|example/.test(row.comment), row.comment);
    assert.match(row.comment, /\[הוסר\]/);
    assert.equal((await post(`/api/activities/${id}/ratings`, { stars: 4 })).status, 201);
    assert.equal((await post(`/api/activities/${id}/ratings`, { stars: 4 })).status, 201);
    const blocked = await post(`/api/activities/${id}/ratings`, { stars: 4 });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, "DAILY_CAP");
  });

  it("מדריך מחובר לא נחסם במכסת האורחים", async () => {
    const id = activityId();
    for (let i = 0; i < 5; i++) assert.equal((await post(`/api/activities/${id}/ratings`, { stars: 5 }, adminTok)).status, 201);
  });

  it("דיווח על אותה פעולה: אורח מוגבל ל-2 ביום", async () => {
    const id = db.prepare("SELECT id FROM activities WHERE status = 'PUBLISHED' ORDER BY id DESC LIMIT 1").get().id;
    const body = { reason: "other", note: "קשר 0541234567" };
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await post(`/api/activities/${id}/flags`, body)).status);
    assert.deepEqual(codes.slice(0, 2).every((c) => c === 201 || c === 200), true, codes.join());
    assert.equal(codes[2], 429);
    const note = db.prepare("SELECT note FROM flags ORDER BY id DESC LIMIT 1").get()?.note ?? "";
    assert.ok(!/0541234567/.test(note), note);
  });

  it("יצירת פעולה בלי התחברות: מכסה יומית לכל כתובת", async () => {
    const old = config.guestDailyPerIp;
    config.guestDailyPerIp = 2;
    try {
      let last = 0;
      const seen = [];
      for (let i = 0; i < 6; i++) {
        last = (await post("/api/activities/generate", input())).status;
        seen.push(last);
      }
      assert.ok(seen.includes(429), seen.join());
    } finally {
      config.guestDailyPerIp = old;
    }
  });

  it("דיווחי שגיאה: מכסה לכל כתובת, ורשומות זהות לא נערמות", async () => {
    const body = { message: "boom", stack: "at x", url: "/library", source: "test" };
    const codes = [];
    for (let i = 0; i < 70; i++) codes.push((await post("/api/client-error", body)).status);
    assert.ok(codes.includes(429), "אחרי 60 דיווחים נחסם");
    const rows = db.prepare("SELECT COUNT(*) AS c FROM client_errors").get().c;
    assert.ok(rows <= 10, `נשמרו ${rows} רשומות זהות`);
  });

  it("takeDaily סופר לפי מפתח", () => {
    assert.equal(takeDaily("unit", "k1", 2), true);
    assert.equal(takeDaily("unit", "k1", 2), true);
    assert.equal(takeDaily("unit", "k1", 2), false);
    assert.equal(takeDaily("unit", "k2", 2), true);
  });

  it("39. קישור שיתוף לטיוטה: אפשר לקבוע תוקף, והקישור הפג לא פעיל", async () => {
    const reg = await post("/api/auth/register", { username: "share64", password: "Str0ng!Passw0rd64", displayName: "שיתוף", acceptTerms: true, signupCode: "shevet-code" });
    const tok = reg.body.token;
    const d = await post("/api/assist/drafts", { text: "טיוטה לשיתוף" }, tok);
    assert.equal(d.status, 201, JSON.stringify(d.body));
    const forever = await post(`/api/assist/drafts/${d.body.id}/share`, { enable: true }, tok);
    assert.equal(forever.status, 200);
    assert.equal(forever.body.expiresAt, null);
    const timed = await post(`/api/assist/drafts/${d.body.id}/share`, { enable: true, days: 7 }, tok);
    assert.ok(timed.body.expiresAt && new Date(timed.body.expiresAt) > new Date());
    assert.equal((await get(`/api/assist/shared/${timed.body.shareToken}`)).status, 200);
    assert.equal((await post(`/api/assist/drafts/${d.body.id}/share`, { enable: true, days: 999 }, tok)).status, 400);
    db.prepare("UPDATE assist_drafts SET share_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), d.body.id);
    assert.equal((await get(`/api/assist/shared/${timed.body.shareToken}`)).status, 404, "קישור שפג תוקפו");
    assert.equal(db.prepare("SELECT share_token FROM assist_drafts WHERE id = ?").get(d.body.id).share_token, null);
  });

  it("37. שיטות HTTP לא נחוצות (TRACE) נדחות", async () => {
    const status = await new Promise((ok, no) => {
      const r = http.request(base + "/api/health", { method: "TRACE" }, (res) => {
        res.resume();
        ok(res.statusCode);
      });
      r.on("error", no);
      r.end();
    });
    assert.equal(status, 405);
    assert.equal((await get("/api/health")).status, 200);
  });

  it("61. /api/health מציג את מצב שמירת הנתונים", async () => {
    const h = await get("/api/health");
    assert.ok(["off", "ok", "stuck", "blocked"].includes(h.body.persist), JSON.stringify(h.body));
  });

  it("אדמין: שמירה עצורה דורשת אישור מפורש", async () => {
    // ה-handle נשאר ממבחני השמירה למעלה (אותו תהליך). מדמים מצב עצור.
    assert.ok(persist.persistHandle(), "יש handle ממבחן קודם");
    persist.persistState.blocked = "בדיקה: הגיבוי מוצפן במפתח אחר";
    try {
      const r = await post("/api/admin/persist/save", {}, adminTok);
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, "PERSIST_BLOCKED");
      const sys = await get("/api/admin/system", adminTok);
      assert.ok(sys.body.warnings.some((w) => /עצורה/.test(w)), JSON.stringify(sys.body.warnings));
      const h = await get("/api/health");
      assert.equal(h.body.persist, "blocked", "גם בבדיקת התקינות הציבורית (בלי פרטים) רואים שהשמירה עצורה");
    } finally {
      persist.persistState.blocked = null;
    }
  });
});

describe("29. Service Worker לא שומר תוכן אישי", () => {
  const code = fs.readFileSync(path.join(HERE, "../../frontend/public/sw.js"), "utf8");
  const mk = () => {
    const handlers = {};
    const deleted = [];
    const puts = [];
    const cache = { put: async (r) => void puts.push(r.url), keys: async () => [], match: async () => undefined, delete: async () => true };
    const ctx = {
      self: { addEventListener: (t, f) => (handlers[t] = f), location: new URL("https://site.test/"), clients: { claim: async () => {} }, skipWaiting: () => {} },
      caches: { open: async () => cache, keys: async () => ["pages-v2", "pages-v3"], delete: async (k) => void deleted.push(k) },
      fetch: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      URL, Response, Request, Headers, console, Promise,
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return { handlers, deleted, puts, ctx };
  };
  const fire = async (m, req) => {
    let responded = null;
    m.handlers.fetch({ request: req, respondWith: (p) => (responded = p) });
    if (responded) await responded;
    await new Promise((r) => setTimeout(r, 10));
    return responded !== null;
  };

  it("בקשה עם Authorization עוברת לרשת בלי מטמון", async () => {
    const m = mk();
    assert.equal(await fire(m, new Request("https://site.test/api/activities/5", { headers: { authorization: "Bearer x" } })), false);
    assert.equal(m.puts.length, 0);
  });
  it("בקשה ציבורית נשמרת, אבל תשובה private או no-store לא", async () => {
    const pub = mk();
    assert.equal(await fire(pub, new Request("https://site.test/api/activities/5")), true);
    assert.equal(pub.puts.length, 1);
    const priv = mk();
    priv.ctx.fetch = async () => new Response("{}", { status: 200, headers: { "cache-control": "private, no-store" } });
    assert.equal(await fire(priv, new Request("https://site.test/api/activities/5")), true);
    assert.equal(priv.puts.length, 0);
  });
  it("גרסה חדשה מוחקת מטמונים ישנים, והודעת clear-private מנקה", async () => {
    const m = mk();
    let waited;
    m.handlers.activate({ waitUntil: (p) => (waited = p) });
    await waited;
    assert.ok(m.deleted.includes("pages-v2"));
    assert.ok(!m.deleted.includes("pages-v3"));
    const m2 = mk();
    let w2;
    m2.handlers.message({ data: "clear-private", waitUntil: (p) => (w2 = p) });
    await w2;
    assert.deepEqual(m2.deleted, ["pages-v3"]);
  });
});

describe("30–38. הגדרות פרודקשן", () => {
  const run = (envx, code) =>
    spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: path.resolve(HERE, ".."),
      env: { ...process.env, NODE_ENV: "production", JWT_SECRET: "x".repeat(40), ADMIN_PASSWORD: "Tr1cky!Scout-pass-64", ...envx },
      encoding: "utf8",
    });
  it("38. בפרודקשן בלי WEB_ORIGIN אין CORS למקור חיצוני", () => {
    const r = run({ WEB_ORIGIN: "" }, `const { config } = await import("./src/config.js"); console.log(JSON.stringify(config.webOrigin))`);
    assert.equal(r.stdout.trim(), '""');
    const r2 = run({ WEB_ORIGIN: "https://x.example" }, `const { config } = await import("./src/config.js"); console.log(config.webOrigin)`);
    assert.equal(r2.stdout.trim(), "https://x.example");
  });
  it("36. אזהרה על שם משתמש admin", () => {
    const r = run({}, `const { configWarnings } = await import("./src/config.js"); console.log(configWarnings().join("|"))`);
    assert.match(r.stdout, /admin/);
    const r2 = run({ ADMIN_USERNAME: "moaz-manager" }, `const { configWarnings } = await import("./src/config.js"); console.log(configWarnings().join("|"))`);
    assert.doesNotMatch(r2.stdout, /"admin"/);
  });
  it("34. שמירת יומנים: 30 ימים כברירת מחדל", async () => {
    const sec = await import("../src/security.js");
    assert.equal(sec.SETTING_DEFAULTS.ipRetentionDays, 30);
  });
  it("30. ה-Docker מריץ כמשתמש לא-root דרך סקריפט כניסה", () => {
    const df = fs.readFileSync(path.join(HERE, "../../Dockerfile"), "utf8");
    assert.match(df, /docker-entry\.sh/);
    const sh = fs.readFileSync(path.join(HERE, "../../deploy/docker-entry.sh"), "utf8");
    assert.match(sh, /runuser -u node/);
    assert.equal(spawnSync("sh", ["-n", path.join(HERE, "../../deploy/docker-entry.sh")]).status, 0);
  });
  it("31–33. אין פגיעויות ידועות בחבילות, ויש Dependabot", () => {
    const root = path.join(HERE, "../..");
    assert.ok(fs.existsSync(path.join(root, ".github/dependabot.yml")));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "backend/package.json"), "utf8"));
    assert.ok(pkg.overrides?.["geoip-country"]?.["ip-address"]);
  });
});

void crypto;

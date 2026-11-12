// שלב 63: תיקוני אבטחה ופרטיות (ממצאים 1–20).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-h63-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin, timingDummyRounds, verifyJwt, registerFailure, clearFailures, checkLock } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { config, deriveKey, configWarnings } = await import("../src/config.js");
const { scrubContact, scrubDeep } = await import("../src/guest-guard.js");
const sec = await import("../src/security.js");
const { sealSecret, openSecret, hashSecret } = await import("../src/accounts.js");
const jwt = (await import("jsonwebtoken")).default;

let server, base, db, app, adminTok;
const j = async (p, opts = {}) => {
  const r = await fetch(base + p, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const post = (p, body, tok, headers = {}) => j(p, { method: "POST", body: JSON.stringify(body), headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers } });
const put = (p, body, tok) => j(p, { method: "PUT", body: JSON.stringify(body), headers: { authorization: `Bearer ${tok}` } });
const get = (p, tok, headers = {}) => j(p, { headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers } });
const input = (over = {}) => ({
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
let n = 0;
const reg = async (over = {}) => {
  const username = "h63u" + ++n + Math.random().toString(36).slice(2, 5);
  const r = await post("/api/auth/register", { username, password: "Str0ng!Passw0rd" + n, displayName: "בודק", acceptTerms: true, signupCode: "shevet-code", ...over });
  return { ...r, username };
};

before(async () => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  ensureAdmin(db);
  app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
  for (const pw of ["admin123"]) {
    const r = await post("/api/auth/login", { username: "admin", password: pw });
    if (r.status === 200) {
      if (r.body.user.mustChangePw) {
        const t = r.body.token;
        const c = await post("/api/auth/change-password", { currentPassword: pw, newPassword: "Adm1n!Strong-pass-63" }, t);
        assert.equal(c.status, 200, JSON.stringify(c.body));
        adminTok = (await post("/api/auth/login", { username: "admin", password: "Adm1n!Strong-pass-63" })).body.token;
      } else adminTok = r.body.token;
    }
  }
  assert.ok(adminTok);
});
after(() => server.close());

describe("1–3. פעולות אורח", () => {
  it("scrubContact: מסיר טלפונים, קישורים ומיילים, ולא נוגע בטקסט רגיל", () => {
    assert.equal(scrubContact("התקשרו 054-1234567 עכשיו"), "התקשרו [הוסר] עכשיו");
    assert.equal(scrubContact("0541234567"), "[הוסר]");
    assert.equal(scrubContact("+972 54 123 4567"), "[הוסר]");
    assert.equal(scrubContact("03-5551234"), "[הוסר]");
    assert.equal(scrubContact("כתבו אל dana@example.com"), "כתבו אל [הוסר]");
    assert.equal(scrubContact("ראו https://bit.ly/abc ועוד"), "ראו [הוסר] ועוד");
    assert.equal(scrubContact("www.example.co.il/page"), "[הוסר]");
    assert.equal(scrubContact("wa.me/972541234567"), "[הוסר]");
    for (const ok of ["10 דקות, 12 חניכים, כיתה ז'", "משחק של 45 דקות ב-2026", "שלב 1: חימום. שלב 2: משחק", "הקבוצה מונה 25-30 חניכים", "תאריך 2026-11-11", "כתובת: ח'ליל, בית הצופים"]) assert.equal(scrubContact(ok), ok, ok);
    assert.deepEqual(scrubDeep({ a: ["054-1234567", { b: "ok" }], n: 5, t: true }), { a: ["[הוסר]", { b: "ok" }], n: 5, t: true });
  });

  it("פעולה שיצר אורח היא UNLISTED: לא במאגר, אבל הקישור הישיר עובד", async () => {
    const r = await post("/api/activities/generate", input());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, "UNLISTED");
    const id = r.body.id;
    const list = await get("/api/activities?pageSize=50");
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(!list.body.items.some((a) => a.id === id), "לא מופיעה ברשימה הציבורית");
    assert.ok(!(await get("/api/activities?q=" + encodeURIComponent("אחריות אישית") + "&pageSize=50")).body.items.some((a) => a.id === id));
    const direct = await get(`/api/activities/${id}`);
    assert.equal(direct.status, 200);
    assert.equal(direct.body.status, "UNLISTED");
  });

  it("הטקסט החופשי של אורח מנוקה מטלפון וקישור", async () => {
    const r = await post("/api/activities/generate", input({ instructor: "דנה 054-1234567", tribe: "שבט www.spam.co.il" }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const text = JSON.stringify(r.body);
    assert.ok(!/054-1234567|spam\.co\.il/.test(text), "לא נשארו פרטי קשר");
    assert.ok(text.includes("[הוסר]"));
  });

  it("תוכן שהמחולל עצמו יצר לא משתנה בניקוי (אין מקרי-שווא)", async () => {
    for (const topic of ["אחריות אישית", "מנהיגות בשטח", "חברות ושיתוף פעולה", "כבוד הדדי", "ידיעת הארץ"]) {
      const r = await post("/api/activities/generate", input({ topic }));
      assert.equal(r.status, 201);
      const { id, status, ...rest } = r.body;
      assert.equal(JSON.stringify(scrubDeep(rest)), JSON.stringify(rest), `הנושא ${topic} נוקה בטעות`);
    }
  });

  it("מדריך מחובר: מתפרסם כרגיל (PUBLISHED)", async () => {
    const t = (await reg()).body.token;
    const r = await post("/api/activities/generate", input(), t);
    assert.equal(r.status, 201);
    assert.equal(r.body.status, "PUBLISHED");
  });

  it("כשהאישור דלוק: אורח עדיין לא נכנס לתור האישורים ולא יוצר התראות לאדמין", async () => {
    assert.equal((await put("/api/admin/settings", { requireApproval: true }, adminTok)).status, 200);
    const before = db.prepare("SELECT COUNT(*) AS c FROM notifications").get().c;
    const r = await post("/api/activities/generate", input());
    assert.equal(r.body.status, "UNLISTED");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM notifications").get().c, before, "בלי התראה לאדמין");
    const t = (await reg()).body.token;
    const m = await post("/api/activities/generate", input(), t);
    assert.equal(m.body.status, "PENDING", "מדריך מחובר כן עובר אישור");
    assert.equal((await put("/api/admin/settings", { requireApproval: false }, adminTok)).status, 200);
  });

  it("אדמין יכול להחזיר פעולות אורח למאגר (guestPublish) וחזרה", async () => {
    const s = await put("/api/admin/settings", { guestPublish: true }, adminTok);
    assert.equal(s.body.guestPublish, true);
    const r = await post("/api/activities/generate", input());
    assert.equal(r.body.status, "PUBLISHED");
    const back = await put("/api/admin/settings", { guestPublish: false }, adminTok);
    assert.equal(back.body.guestPublish, false);
    assert.equal((await get("/api/admin/settings", adminTok)).body.requireApproval, false);
    assert.equal((await post("/api/activities/generate", input())).body.status, "UNLISTED");
  });

  it("אדמין יכול לפרסם במאגר פעולת אורח שמצא, ורק אדמין", async () => {
    const r = await post("/api/activities/generate", input());
    assert.equal(r.body.status, "UNLISTED");
    assert.equal((await post(`/api/admin/activities/${r.body.id}/approve`, {})).status, 401);
    const u = (await reg()).body.token;
    assert.ok([401, 403].includes((await post(`/api/admin/activities/${r.body.id}/approve`, {}, u)).status));
    assert.equal((await post(`/api/admin/activities/${r.body.id}/approve`, {}, adminTok)).status, 200);
    assert.equal((await get(`/api/activities/${r.body.id}`)).body.status, "PUBLISHED");
    assert.ok((await get("/api/activities?pageSize=50")).body.items.some((a) => a.id === r.body.id));
    // דחייה לא חלה על UNLISTED, ופעולה שכבר פורסמה לא "מאושרת" שוב
    const r2 = await post("/api/activities/generate", input());
    assert.equal((await post(`/api/admin/activities/${r2.body.id}/reject`, {}, adminTok)).status, 404);
    assert.equal((await post(`/api/admin/activities/${r.body.id}/approve`, {}, adminTok)).status, 404);
  });

  it("שכפול פעולה על ידי אורח נשאר UNLISTED", async () => {
    const r = await post("/api/activities/1/duplicate", {});
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, "UNLISTED");
  });
});

describe("4–5. מעקב מבקרים וייצוא docx", () => {
  it("בקשות חוזרות של אותו מבקר לא כותבות למסד בכל בקשה", async () => {
    const ua = "repeat-probe/1";
    await get("/api/activities?pageSize=1", null, { "user-agent": ua });
    const t1 = db.prepare("SELECT last_seen FROM sessions WHERE user_agent = ?").get(ua).last_seen;
    await new Promise((r) => setTimeout(r, 30));
    await get("/api/activities?pageSize=1", null, { "user-agent": ua });
    assert.equal(db.prepare("SELECT last_seen FROM sessions WHERE user_agent = ?").get(ua).last_seen, t1, "עד דקה אין כתיבה נוספת");
    app.locals.resetVisitThrottle();
    await new Promise((r) => setTimeout(r, 5));
    await get("/api/activities?pageSize=1", null, { "user-agent": ua });
    assert.notEqual(db.prepare("SELECT last_seen FROM sessions WHERE user_agent = ?").get(ua).last_seen, t1);
  });

  it("כותרות User-Agent מזויפות לא מנפחות את טבלת המבקרים", async () => {
    for (let i = 0; i < 60; i++) await get("/api/activities?pageSize=1", null, { "user-agent": `forged-${i}-${crypto.randomBytes(3).toString("hex")}` });
    const c = db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE user_agent LIKE 'forged-%'").get().c;
    assert.ok(c <= 40, `נוצרו ${c} שורות`);
    assert.ok(db.prepare("SELECT 1 FROM sessions WHERE user_agent = 'other'").get(), "העודף נספר כ'אחר'");
  });

  it("טבלת המבקרים לא גדלה בלי גבול: מעל 50,000 שורות נמחקות הישנות", async () => {
    const ins = db.prepare("INSERT INTO sessions (key, ip, user_agent, first_seen, last_seen) VALUES (?,?,?,?,?)");
    db.exec("BEGIN");
    for (let i = 0; i < 50_200; i++) ins.run(`bulk-${i}`, "1.1.1.1", "bulk", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z");
    db.exec("COMMIT");
    for (let i = 0; i < 520; i++) {
      app.locals.resetVisitThrottle();
      await get("/api/activities?pageSize=1", null, { "user-agent": "trim-probe/1" });
    }
    const c = db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c;
    assert.ok(c < 50_000, `נשארו ${c}`);
  });

  it("ייצוא docx: עובד, ומחזיר קובץ זהה בקריאה חוזרת (מטמון)", async () => {
    const a = await fetch(base + "/api/activities/1/export/docx");
    const b = await fetch(base + "/api/activities/1/export/docx");
    assert.equal(a.status, 200);
    assert.match(a.headers.get("content-type") || "", /wordprocessingml/);
    const A = Buffer.from(await a.arrayBuffer());
    const B = Buffer.from(await b.arrayBuffer());
    assert.equal(A.compare(B), 0);
    assert.equal(A.subarray(0, 2).toString(), "PK");
    assert.equal((await fetch(base + "/api/activities/99999/export/docx")).status, 404);
  });
});

describe("6–9. התחברות והרשמה", () => {
  it("6. חשבון לא קיים נבדק באותו מחיר bcrypt כמו חשבון קיים", async () => {
    assert.equal(await timingDummyRounds(), config.bcryptCost);
  });

  it("7. הרשמה לא חושפת מייל או טלפון קיימים", async () => {
    const email = `ex${Date.now()}@example.com`;
    const first = await reg({ email });
    assert.equal(first.status, 201);
    db.prepare("UPDATE users SET email_verified_at = ? WHERE username = ?").run(new Date().toISOString(), first.username);
    const second = await reg({ email });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const row = db.prepare("SELECT email_verified_at FROM users WHERE username = ?").get(second.username);
    assert.equal(row.email_verified_at, null, "החשבון החדש לא מאומת");
    const phone = "0541234" + String(Date.now()).slice(-3);
    const p1 = await reg({ phone });
    assert.equal(p1.status, 201, JSON.stringify(p1.body));
    db.prepare("UPDATE users SET phone_verified_at = ? WHERE username = ?").run(new Date().toISOString(), p1.username);
    assert.equal((await reg({ phone })).status, 201);
    // שם משתמש תפוס עדיין נאמר (צריך כדי להירשם)
    assert.equal((await post("/api/auth/register", { username: first.username, password: "Str0ng!Passw0rd77", displayName: "בודק", acceptTerms: true, signupCode: "shevet-code" })).status, 409);
  });

  it("7. בקשת אימות למייל שמאומת אצל אחר: אותה תשובה, בלי קוד", async () => {
    const email = `v${Date.now()}@example.com`;
    const owner = await reg({ email });
    db.prepare("UPDATE users SET email_verified_at = ? WHERE username = ?").run(new Date().toISOString(), owner.username);
    const other = await reg();
    const pw = "Str0ng!Passw0rd" + n;
    const c = await put("/api/me/contact", { password: pw, email }, other.body.token);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const vr = await post("/api/me/verify/request", { channel: "email" }, other.body.token);
    assert.equal(vr.status, 200);
    assert.equal(vr.body.devCode, undefined);
    assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'verify.target_taken'").get());
  });

  it("8. נעילה ברמת חשבון: אחרי 8 כשלונות (מכל כתובת) נדרשת שאלה, אחרי 20 נעילה, ואיפוס סיסמה מנקה", async () => {
    const u = await reg();
    const pw = "Str0ng!Passw0rd" + n;
    const id = db.prepare("SELECT id FROM users WHERE username = ?").get(u.username).id;
    const acct = `acct|${id}`;
    for (let i = 0; i < 8; i++) registerFailure(db, acct, { max: 20, minutes: 15 });
    const need = await post("/api/auth/login", { username: u.username, password: pw });
    assert.equal(need.status, 401);
    assert.equal(need.body.error.code, "CAPTCHA_REQUIRED", "גם סיסמה נכונה צריכה את השאלה");
    const tok = need.body.error.fields.captchaToken[0];
    assert.ok(tok);
    // פותרים: לוקחים את התשובה מהאסימון (בדיקה בלבד)
    const payload = jwt.decode(tok);
    let answer = null;
    for (let a = 0; a <= 20; a++) if (hashSecret(`captcha|${a}`) === payload.h) answer = a;
    assert.notEqual(answer, null);
    const ok = await post("/api/auth/login", { username: u.username, password: pw, captchaToken: tok, captchaAnswer: String(answer) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM login_attempts WHERE key = ?").get(acct).c, 0, "הצלחה מנקה את מונה החשבון");
    // נעילה
    for (let i = 0; i < 20; i++) registerFailure(db, acct, { max: 20, minutes: 15 });
    assert.ok(checkLock(db, acct) > 0);
    const locked = await post("/api/auth/login", { username: u.username, password: pw });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, "LOCKED");
    clearFailures(db, acct);
    assert.equal((await post("/api/auth/login", { username: u.username, password: pw })).status, 200);
  });

  it("9. כניסה כושלת לחשבון שלא קיים לא שומרת את מה שהוקלד", async () => {
    const typed = "Pa55w0rd-typed-by-mistake";
    await post("/api/auth/login", { username: typed, password: "whatever-123" });
    const rows = JSON.stringify(db.prepare("SELECT * FROM access_log ORDER BY id DESC LIMIT 5").all()) + JSON.stringify(db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 5").all());
    assert.ok(!rows.includes(typed), "המחרוזת שהוקלדה לא נשמרה");
    assert.ok(/לא-מזוהה:[0-9a-f]{8}/.test(rows), "נשמרת טביעה קצרה במקומה");
    // לחשבון קיים שם המשתמש כן נרשם (הוא לא סוד לאדמין)
    const u = await reg();
    await post("/api/auth/login", { username: u.username, password: "wrong-password-1" });
    assert.ok(db.prepare("SELECT 1 FROM access_log WHERE kind = 'login_fail' AND username = ?").get(u.username));
  });
});

describe("10–13. סיסמאות, 2FA לאדמין, captcha וטופס", () => {
  it("10. ברירת המחדל בפרודקשן: סיסמאות נפוצות נחסמות (בדיקה בתהליך נפרד)", () => {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", `const s = await import("./src/security.js"); console.log(s.SETTING_DEFAULTS.strictPasswords)`], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), env: { ...process.env, NODE_ENV: "production", JWT_SECRET: "x".repeat(40), ADMIN_PASSWORD: "Tr1cky!Scout-pass-63" }, encoding: "utf8" });
    assert.equal(r.stdout.trim(), "1", r.stderr);
  });

  it("10. כשהחוזק דלוק, סיסמה נפוצה נדחית וחזקה מתקבלת", async () => {
    assert.equal((await put("/api/admin/security/settings", { strictPasswords: 1 }, adminTok)).status, 200);
    const weak = await post("/api/auth/register", { username: "weakreg63", password: "password123", displayName: "בודק", acceptTerms: true, signupCode: "shevet-code" });
    assert.equal(weak.status, 400, JSON.stringify(weak.body));
    assert.equal((await reg()).status, 201);
    assert.equal((await put("/api/admin/security/settings", { strictPasswords: 0 }, adminTok)).status, 200);
  });

  it("11. אדמין בלי 2FA מקבל תזכורת פעם בשבוע (לא בכל כניסה)", async () => {
    const count = () => db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE kind = 'security' AND text LIKE '%בלי אימות דו-שלבי%'").get().c;
    await post("/api/auth/login", { username: "admin", password: "Adm1n!Strong-pass-63" });
    const a = count();
    assert.ok(a >= 1);
    await post("/api/auth/login", { username: "admin", password: "Adm1n!Strong-pass-63" });
    assert.equal(count(), a);
    // מדריך רגיל לא מקבל
    const u = await reg();
    const uid = db.prepare("SELECT id FROM users WHERE username = ?").get(u.username).id;
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND kind = 'security'").get(uid).c, 0);
  });

  it("12. captcha: חד-פעמי, גם אם הפתרון נכון, ושגוי גם הוא נשרף", () => {
    const solve = (c) => {
      const p = jwt.decode(c.token);
      for (let a = 0; a <= 20; a++) if (hashSecret(`captcha|${a}`) === p.h) return String(a);
    };
    const c1 = sec.makeCaptcha();
    const ans = solve(c1);
    assert.equal(sec.checkCaptcha(c1.token, ans), true);
    assert.equal(sec.checkCaptcha(c1.token, ans), false, "אותו אסימון לא עובד פעמיים");
    const c2 = sec.makeCaptcha();
    assert.equal(sec.checkCaptcha(c2.token, "999"), false);
    assert.equal(sec.checkCaptcha(c2.token, solve(c2)), false, "ניסיון שגוי שרף את האסימון");
    assert.equal(sec.checkCaptcha(c1.token.slice(0, -2) + "xx", ans), false);
    // אסימון JWT של סשן לא מתקבל כ-captcha ולהפך
    assert.equal(sec.checkCaptcha(jwt.sign({ purpose: "captcha", jti: "a", h: "x" }, config.jwtSecret), "1"), false);
  });

  it("12. captcha: תשובה תוך פחות משנייה נדחית כשהבדיקה פעילה", () => {
    const solve = (c) => {
      const p = jwt.decode(c.token);
      for (let a = 0; a <= 20; a++) if (hashSecret(`captcha|${a}`) === p.h) return String(a);
    };
    config.strictTiming = true;
    try {
      const c = sec.makeCaptcha();
      assert.equal(sec.checkCaptcha(c.token, solve(c)), false, "מהר מדי");
    } finally {
      config.strictTiming = false;
    }
  });

  it("13. אסימון טופס: השרת קובע את הזמן. מהר מדי נדחה, ובלי אסימון יש רווח בין ניסיונות", async () => {
    const t = (await get("/api/auth/form-token")).body.token;
    assert.ok(t);
    assert.ok(sec.formTokenAgeMs(t) >= 0);
    assert.equal(sec.formTokenAgeMs(t + "x"), null);
    assert.equal(sec.formTokenAgeMs(jwt.sign({ purpose: "form" }, "other-key")), null);
    config.strictTiming = true;
    try {
      const fast = await reg({ formToken: t });
      assert.equal(fast.status, 400, "נשלח מיד אחרי קבלת האסימון");
      await new Promise((r) => setTimeout(r, 2600));
      const t2 = (await get("/api/auth/form-token")).body.token;
      await new Promise((r) => setTimeout(r, 2600));
      assert.equal((await reg({ formToken: t2 })).status, 201);
      const again = await reg();
      assert.equal(again.status, 429, "בלי אסימון: רווח של 30 שניות מאותה כתובת");
    } finally {
      config.strictTiming = false;
    }
  });
});

describe("14–20. סודות, הגדרות, כותרות", () => {
  it("14. החלפת JWT_SECRET עם JWT_SECRET_PREVIOUS לא מנתקת מחוברים, ובלעדיו כן", async () => {
    const t = (await reg()).body.token;
    assert.equal((await get("/api/auth/me", t)).status, 200);
    const old = config.jwtSecret;
    config.jwtSecret = "rotated-secret-" + "y".repeat(30);
    try {
      assert.equal((await get("/api/auth/me", t)).status, 401, "בלי המפתח הקודם: מנותק");
      config.jwtSecretPrevious = old;
      assert.equal((await get("/api/auth/me", t)).status, 200, "עם המפתח הקודם: ממשיך");
      assert.ok(verifyJwt(t).sub);
    } finally {
      config.jwtSecret = old;
      config.jwtSecretPrevious = "";
    }
  });

  it("14. סודות 2FA נפתחים גם אחרי החלפת מפתח (קודם) או הוספת TOTP_KEY", () => {
    const old = config.jwtSecret;
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
    config.jwtSecret = "another-" + "z".repeat(30);
    try {
      assert.equal(openSecret(sealed), null, "בלי המפתח הקודם אי אפשר");
      config.jwtSecretPrevious = old;
      assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
      config.jwtSecretPrevious = "";
      config.totpKey = "dedicated-totp-key-" + "k".repeat(20);
      const s2 = sealSecret("ABCDEF234567ABCD");
      config.jwtSecret = "yet-another-" + "q".repeat(30);
      assert.equal(openSecret(s2), "ABCDEF234567ABCD", "מפתח ה-2FA הנפרד לא תלוי ב-JWT_SECRET");
    } finally {
      config.jwtSecret = old;
      config.totpKey = "";
      config.jwtSecretPrevious = "";
    }
  });

  it("14. מפתחות משנה: שונים זה מזה ובאורך 32 בתים", () => {
    const a = deriveKey("captcha");
    const b = deriveKey("form");
    assert.equal(a.length, 32);
    assert.notEqual(a.toString("hex"), b.toString("hex"));
    assert.notEqual(a.toString("hex"), crypto.createHash("sha256").update(config.jwtSecret).digest("hex"));
  });

  it("15. בפרודקשן: סיסמת אדמין חלשה במסד חדש עוצרת את ההפעלה, וחזקה לא; סוד קצר מדי נדחה", () => {
    const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const run = (env, code) => spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd, env: { ...process.env, NODE_ENV: "production", DB_PATH: ":memory:", ...env }, encoding: "utf8" });
    const seed = `const {openDb}=await import("./src/db.js"); const {ensureAdmin}=await import("./src/auth.js"); console.log("created:"+ensureAdmin(openDb(":memory:")));`;
    const weak = run({ JWT_SECRET: "s".repeat(40), ADMIN_PASSWORD: "admin1234" }, seed);
    assert.equal(weak.status, 1, weak.stdout + weak.stderr);
    assert.match(weak.stderr, /ADMIN_PASSWORD/);
    const strong = run({ JWT_SECRET: "s".repeat(40), ADMIN_PASSWORD: "Tr1cky!Scout-pass-63x" }, seed);
    assert.equal(strong.status, 0, strong.stderr);
    assert.match(strong.stdout, /created:true/);
    const short = run({ JWT_SECRET: "short", ADMIN_PASSWORD: "Tr1cky!Scout-pass-63x" }, `const {assertProductionSafe}=await import("./src/config.js"); assertProductionSafe(); console.log("booted");`);
    assert.notEqual(short.status, 0);
    assert.doesNotMatch(short.stdout, /booted/);
    const mid = run({ JWT_SECRET: "m".repeat(20), ADMIN_PASSWORD: "Tr1cky!Scout-pass-63x" }, `const {assertProductionSafe}=await import("./src/config.js"); assertProductionSafe(); console.log("booted");`);
    assert.equal(mid.status, 0, mid.stderr);
    assert.match(mid.stderr, /JWT_SECRET/, "אזהרה על סוד בינוני");
  });

  it("16–18. אין X-Powered-By בשרת ה-API, ו-/api/health לא חושף שעת עלייה", async () => {
    const r = await fetch(base + "/api/health");
    assert.equal(r.headers.get("x-powered-by"), null);
    const h = await r.json();
    assert.ok(h.boot);
    assert.equal("startedAt" in h, false);
    assert.equal("uptimeSec" in h, false);
  });

  it("20. TRUST_PROXY ברירת מחדל 1, וכותרת IP מוגדרת רק בהגדרה מפורשת", () => {
    assert.equal(config.trustProxy, 1);
    assert.equal(config.clientIpHeader, "");
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", `const {config}=await import("./src/config.js"); console.log(JSON.stringify([config.trustProxy, config.clientIpHeader]))`], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), env: { ...process.env, TRUST_PROXY: "2", CLIENT_IP_HEADER: "CF-Connecting-IP" }, encoding: "utf8" });
    assert.equal(r.stdout.trim(), '[2,"cf-connecting-ip"]');
    const bad = spawnSync(process.execPath, ["--input-type=module", "-e", `const {config}=await import("./src/config.js"); console.log(JSON.stringify([config.trustProxy, config.clientIpHeader]))`], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), env: { ...process.env, TRUST_PROXY: "loopback", CLIENT_IP_HEADER: "bad header!" }, encoding: "utf8" });
    assert.equal(bad.stdout.trim(), '["loopback",""]');
    assert.ok(Array.isArray(configWarnings()));
  });

  it("20. עמוד האדמין מראה איזו כתובת השרת רואה, ורק לאדמין", async () => {
    const s = await get("/api/admin/system", adminTok);
    assert.equal(s.status, 200);
    assert.ok(s.body.clientIp && typeof s.body.clientIp.seen === "string");
    const hdr = await get("/api/admin/system", adminTok, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(hdr.body.clientIp.forwardedFor, "9.9.9.9");
    assert.ok([401, 403].includes((await get("/api/admin/system")).status));
    const u = await reg();
    assert.ok([401, 403].includes((await get("/api/admin/system", u.body.token)).status));
  });
});

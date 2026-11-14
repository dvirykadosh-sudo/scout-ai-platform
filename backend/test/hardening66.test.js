// שלב 66: SEO, ניקוי, פרטיות, שאלות שלא נענו, הדפסה ותיעוד (ממצאים 67–100).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const { createApp } = await import("../src/app.js");
const { openDb, SCHEMA_VERSION } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { config } = await import("../src/config.js");
const { publicAuthor } = await import("../src/guest-guard.js");
const { purgeOld } = await import("../src/security.js");
const { createEagle } = await import("../src/lux-eagle.js");

describe("67–71. מפת האתר ו-SEO", () => {
  it("מפת האתר לא כוללת דפים שמחייבים התחברות, ויש בה תאריך שינוי של הפריסה", () => {
    const sm = read("frontend/src/app/sitemap.ts");
    for (const p of ["/account", "/write\"", "/team"]) assert.ok(!sm.includes(`["${p.replace('"', "")}",`), `${p} לא אמור להופיע`);
    assert.match(sm, /lastModified: DEPLOYED/);
    assert.match(sm, /page <= 100/);
  });
  it("דפי חשבון, צוות וכתיבה מסומנים noindex", () => {
    for (const p of ["account", "team", "write"]) assert.match(read(`frontend/src/app/(site)/${p}/page.tsx`), /robots: \{ index: false, follow: true \}/, p);
  });
  it("כתובת האתר מ-RENDER_EXTERNAL_URL כשאין PUBLIC_URL", () => {
    const run = (env) =>
      execFileSync(process.execPath, ["--input-type=module", "-e", `const {config}=await import("./src/config.js");console.log(config.publicUrl)`], {
        cwd: path.join(ROOT, "backend"),
        env: { PATH: process.env.PATH, NODE_ENV: "test", ...env },
      })
        .toString()
        .trim();
    assert.equal(run({ RENDER_EXTERNAL_URL: "https://x.onrender.com/" }), "https://x.onrender.com");
    assert.equal(run({ PUBLIC_URL: "https://mine.example", RENDER_EXTERNAL_URL: "https://x.onrender.com" }), "https://mine.example");
  });
});

describe("97. שם הכותב בדירוג ציבורי", () => {
  it("publicAuthor: שם פרטי בלבד, מוסתר או מלא", () => {
    assert.equal(publicAuthor("דני כהן", "first"), "דני");
    assert.equal(publicAuthor("  נועה   לוי ", "first"), "נועה");
    assert.equal(publicAuthor("דני כהן", "hidden"), null);
    assert.equal(publicAuthor("דני כהן", "full"), "דני כהן");
    assert.equal(publicAuthor("", "first"), null);
    assert.equal(publicAuthor(null, "first"), null);
    assert.equal(publicAuthor("<b>יואב</b> בן-דוד", "first").includes("<"), false);
    assert.equal(publicAuthor("א".repeat(40), "first").length, 14);
    assert.equal(publicAuthor("O'Brien Smith", "first"), "O'Brien");
  });
  it("ה-API מחזיר רק שם פרטי, והמלא נשאר במסד", async () => {
    const db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    const server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) }).listen(0);
    const base = `http://localhost:${server.address().port}`;
    try {
      const id = db.prepare("SELECT id FROM activities WHERE status = 'PUBLISHED' ORDER BY id LIMIT 1").get().id;
      db.prepare("INSERT INTO ratings (activity_id, stars, comment, author, created_at) VALUES (?,?,?,?,?)").run(id, 5, "נהדר", "דני כהן", new Date().toISOString());
      const get = async () => (await (await fetch(`${base}/api/activities/${id}/ratings`)).json()).items[0].author;
      assert.equal(await get(), "דני");
      const prev = config.ratingAuthorMode;
      config.ratingAuthorMode = "hidden";
      assert.equal(await get(), null);
      config.ratingAuthorMode = "full";
      assert.equal(await get(), "דני כהן");
      config.ratingAuthorMode = prev;
      assert.equal(db.prepare("SELECT author FROM ratings").get().author, "דני כהן");
    } finally {
      server.close();
    }
  });
});

describe("98. מחיקה אוטומטית של טקסט חופשי של אורחים", () => {
  it("הערות ושמות בדירוגים והערות בדיווחים סגורים נמחקות אחרי התקופה, והכוכבים נשארים", () => {
    const db = openDb(":memory:");
    seedIfEmpty(db);
    const id = db.prepare("SELECT id FROM activities ORDER BY id LIMIT 1").get().id;
    const old = new Date(Date.now() - 400 * 86400_000).toISOString();
    const fresh = new Date().toISOString();
    const ins = db.prepare("INSERT INTO ratings (activity_id, stars, comment, author, created_at) VALUES (?,?,?,?,?)");
    ins.run(id, 4, "ישן", "דני", old);
    ins.run(id, 2, "חדש", "נועה", fresh);
    const flag = db.prepare("INSERT INTO flags (activity_id, reason, note, status, resolved_at, created_at) VALUES (?,?,?,?,?,?)");
    flag.run(id, "other", "סגור וישן", "RESOLVED", old, old);
    flag.run(id, "other", "פתוח וישן", "OPEN", null, old);
    flag.run(id, "other", "סגור וחדש", "RESOLVED", fresh, fresh);
    const avgBefore = db.prepare("SELECT AVG(stars) AS a FROM ratings").get().a;
    const r = purgeOld(db, 30);
    assert.equal(r.ratingText, 1);
    assert.equal(r.flagNotes, 1);
    const rows = db.prepare("SELECT stars, comment, author FROM ratings ORDER BY id").all();
    assert.deepEqual({ ...rows[0] }, { stars: 4, comment: null, author: null });
    assert.deepEqual({ ...rows[1] }, { stars: 2, comment: "חדש", author: "נועה" });
    assert.equal(db.prepare("SELECT AVG(stars) AS a FROM ratings").get().a, avgBefore, "הממוצע לא משתנה");
    const notes = db.prepare("SELECT note FROM flags ORDER BY id").all().map((x) => x.note);
    assert.deepEqual(notes, [null, "פתוח וישן", "סגור וחדש"]);
  });
  it("0 ימים = לא מוחקים", () => {
    const db = openDb(":memory:");
    seedIfEmpty(db);
    const id = db.prepare("SELECT id FROM activities ORDER BY id LIMIT 1").get().id;
    const old = new Date(Date.now() - 800 * 86400_000).toISOString();
    db.prepare("INSERT INTO ratings (activity_id, stars, comment, author, created_at) VALUES (?,?,?,?,?)").run(id, 3, "x", "y", old);
    const prev = config.guestTextRetentionDays;
    config.guestTextRetentionDays = 0;
    try {
      const r = purgeOld(db, 30);
      assert.equal(r.ratingText, undefined);
      assert.equal(db.prepare("SELECT comment FROM ratings").get().comment, "x");
    } finally {
      config.guestTextRetentionDays = prev;
    }
  });
  it("שאלות שמעוז לא ענה עליהן נמחקות אחרי 60 יום", () => {
    const db = openDb(":memory:");
    const old = new Date(Date.now() - 61 * 86400_000).toISOString();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO eagle_unanswered (key, q, count, first_at, last_at) VALUES ('a','ישנה',1,?,?),('b','חדשה',1,?,?)").run(old, old, now, now);
    purgeOld(db, 30);
    assert.deepEqual(db.prepare("SELECT q FROM eagle_unanswered").all().map((x) => x.q), ["חדשה"]);
  });
});

describe("91. שאלות שמעוז לא ידע לענות עליהן", () => {
  const mk = (extra = {}) => {
    const db = openDb(":memory:");
    seedIfEmpty(db);
    return { db, eagle: createEagle({ db, ai: { key: "" }, today: () => "2026-11-14", ...extra }) };
  };
  it("שאלה לא מוכרת נרשמת מוסתרת ומאוחדת, ושאלה שנענתה לא נרשמת", async () => {
    const { db, eagle } = mk();
    await eagle.ask({ question: "בלה בלה בלה זבנגלולוגיה", user: null });
    await eagle.ask({ question: "בלה בלה בלה זבנגלולוגיה", user: null });
    await eagle.ask({ question: "זבנגלולוגיה חרוזים 052-1234567 dana@example.com", user: null });
    await eagle.ask({ question: "איך מפעילים מצב במה?", user: null });
    const rows = db.prepare("SELECT q, count FROM eagle_unanswered ORDER BY id").all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].count, 2, "אותה שאלה מתאחדת");
    assert.ok(!rows.some((r) => /052|dana@|example\.com/.test(r.q)), "טלפון ומייל מוסתרים");
    assert.ok(!rows.some((r) => /מצב במה/.test(r.q)), "שאלה שנענתה לא נרשמת");
    const cols = db.prepare("PRAGMA table_info(eagle_unanswered)").all().map((c) => c.name);
    assert.ok(!cols.some((c) => /user|ip|name/i.test(c)), "אין עמודת משתמש או כתובת");
  });
  it("logUnanswered=false לא כותב כלום", async () => {
    const { db, eagle } = mk({ logUnanswered: false });
    await eagle.ask({ question: "בלה בלה בלה זבנגלולוגיה", user: null });
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM eagle_unanswered").get().c, 0);
  });
  it("תקרה של 500 רשומות", async () => {
    const { db, eagle } = mk();
    for (let i = 0; i < 520; i++) await eagle.ask({ question: `זבנגלולוגיה ${"אבגדהוזחטיכלמנסעפצקרשת"[i % 22]}${"קרשתאבגדהוזחטיכלמנסעפצ"[(i * 7) % 22]}${i} בלה`, user: null });
    assert.ok(db.prepare("SELECT COUNT(*) AS c FROM eagle_unanswered").get().c <= 500);
  });
  describe("נתיבי אדמין", () => {
    let server, base, tok;
    const db = openDb(":memory:");
    before(async () => {
      seedIfEmpty(db);
      ensureAdmin(db);
      server = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) }).listen(0);
      base = `http://localhost:${server.address().port}`;
      const call = (p, o = {}) => fetch(base + p, { ...o, headers: { "content-type": "application/json", ...(o.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
      const r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "admin123" }) });
      tok = r.body.token;
      if (r.body.user.mustChangePw) {
        await call("/api/auth/change-password", { method: "POST", headers: { authorization: `Bearer ${tok}` }, body: JSON.stringify({ currentPassword: "admin123", newPassword: "Adm1n!Strong-pass-66" }) });
        tok = (await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "Adm1n!Strong-pass-66" }) })).body.token;
      }
    });
    after(() => server.close());
    const call = (p, o = {}) => fetch(base + p, { ...o, headers: { "content-type": "application/json", ...(o.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    it("רק אדמין, רשימה לפי כמות, מחיקה בודדת וניקוי", async () => {
      assert.ok([401, 403].includes((await call("/api/admin/eagle/unanswered")).status));
      const now = new Date().toISOString();
      const ins = db.prepare("INSERT INTO eagle_unanswered (key, q, count, first_at, last_at) VALUES (?,?,?,?,?)");
      ins.run("k1", "שאלה נדירה", 1, now, now);
      ins.run("k2", "שאלה נפוצה", 7, now, now);
      const A = { authorization: `Bearer ${tok}` };
      const list = await call("/api/admin/eagle/unanswered", { headers: A });
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.items.map((x) => x.q), ["שאלה נפוצה", "שאלה נדירה"]);
      assert.equal((await call(`/api/admin/eagle/unanswered/${list.body.items[1].id}`, { method: "DELETE", headers: A })).status, 200);
      assert.equal((await call("/api/admin/eagle/unanswered/abc", { method: "DELETE", headers: A })).status, 400);
      const clear = await call("/api/admin/eagle/unanswered", { method: "DELETE", headers: A });
      assert.equal(clear.body.removed, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS c FROM eagle_unanswered").get().c, 0);
    });
  });
});

describe("99–100. הדפסה בלי חלון קופץ", () => {
  it("אין יותר window.open או document.write, ויש הברחת גרש", () => {
    for (const f of ["WriteV47.tsx", "WriteV39.tsx"]) {
      const code = read(`frontend/src/components/${f}`);
      assert.doesNotMatch(code, /window\.open\(/, f);
      assert.doesNotMatch(code, /document\.write\(/, f);
      assert.match(code, /printDocument\(/, f);
    }
    const lib = read("frontend/src/lib/print.ts");
    assert.match(lib, /"'": "&#39;"/);
    assert.match(lib, /iframe/);
  });
});

describe("89. טעינה עצלה בדף הבית", () => {
  it("רכיבים שמתחת לקיפול נטענים ב-dynamic", () => {
    const code = read("frontend/src/components/HomeShell.tsx");
    for (const c of ["AnnouncementsBanner", "NextStepCard", "UpcomingCard", "TourButton", "RemindersBanner", "ThisWeek", "HomeInspiration"]) {
      assert.match(code, new RegExp(`const ${c} = dynamic\\(`), c);
    }
    assert.match(code, /import \{ Generator \} from/, "הטופס עצמו נטען מיד");
  });
});

describe("72–86. ניקוי, תצורה ותיעוד", () => {
  it("render.yaml מתאר את המצב החינמי, בלי SIGNUP_CODE", () => {
    const y = read("render.yaml");
    assert.match(y, /plan: free/);
    assert.doesNotMatch(y, /^\s*- key: SIGNUP_CODE/m);
    assert.match(y, /BACKUP_KEY/);
  });
  it("אין SIGNUP_CODE בקבצי env ובמדריכי הפריסה, וקובצי env כפולים בתוך src הוסרו מהחבילה", () => {
    for (const f of [".env.example", "backend/.env.example", "DEPLOY.md", "deploy/VPS.md"]) assert.doesNotMatch(read(f), /SIGNUP_CODE=|`SIGNUP_CODE`: קוד/, f);
    assert.match(read("frontend/.env.example"), /NEXT_PUBLIC_A11Y_NAME/);
  });
  it("engines אחיד, ואין קריאה ל-signupOpen שלא הוגדר", () => {
    assert.equal(JSON.parse(read("backend/package.json")).engines.node, ">=22.13");
    assert.equal(JSON.parse(read("package.json")).engines.node, ">=22.13");
    assert.doesNotMatch(read("backend/src/app.js"), /signupOpen\(\)/);
  });
  it("מפת ה-API נוצרת מהשרת", () => {
    execFileSync(process.execPath, ["backend/scripts/gen-openapi.mjs"], { cwd: ROOT, env: { PATH: process.env.PATH }, stdio: "pipe" });
    const d = JSON.parse(read("docs/openapi.json"));
    const n = Object.values(d.paths).reduce((s, v) => s + Object.keys(v).length, 0);
    assert.ok(n > 400, `נמצאו ${n}`);
    assert.ok(d.paths["/api/activities/{id}/ratings"]?.get);
    assert.ok(d.paths["/api/admin/eagle/unanswered"]?.get, "הנתיב החדש מופיע");
    assert.ok(d.paths["/api/admin/mail/test"]?.post);
  });
  it("אינדקס תיעוד, ESLint ו-editorconfig קיימים", () => {
    for (const f of ["docs/README.md", "tools/lint/eslint.config.mjs", "tools/lint/package.json", ".editorconfig", ".prettierrc.json"]) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
    assert.match(read("package.json"), /"lint": /);
  });
  it("גרסת הסכמה 66", () => {
    assert.equal(SCHEMA_VERSION, 66);
  });
});

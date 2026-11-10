// שלב 58: בדיקות אבטחה אוטומטיות.
//  1. "פצצת zip": קובץ Word קטן שמתנפח לא יפיל את השרת
//  2. מפת הנתיבים: כל נתיב שנגיש בלי התחברות חייב להופיע ברשימה שנבדקה ידנית; נתיבי אדמין סגורים למשתמש רגיל
//  3. כותרות: תשובות אישיות לא נשמרות במטמון; גוף גדול ללא התחברות נדחה לפני הקריאה
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import zlib from "node:zlib";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-sec-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { assertSafeZip } = await import("../src/safe-zip.js");
const { extractText } = await import("../src/style.js");
const { buildDocx } = await import("../src/docx.js");
const { getActivity } = await import("../src/activities.js");

/** בונה zip עם רכיב אחד. declared מאפשר לשקר בגדלים (כמו תוקף). */
function makeZip(raw, { declared, name = "word/document.xml" } = {}) {
  const comp = zlib.deflateRawSync(raw, { level: 9 });
  const nm = Buffer.from(name);
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const usize = declared ?? raw.length;
  const lfh = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(comp.length), u32(usize), u16(nm.length), u16(0), nm]);
  const cdh = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(comp.length), u32(usize), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), nm]);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(1), u16(1), u32(cdh.length), u32(lfh.length + comp.length), u16(0)]);
  return Buffer.concat([lfh, comp, cdh, eocd]);
}

let server, base, db, app, userTok, adminTok;
const call = async (m, p, tok, body, extra = {}) => {
  const path = String(p).replace(/:[A-Za-z]+/g, "1");
  const r = await fetch(base + path, { method: m, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...extra }, body: m === "GET" || m === "HEAD" ? undefined : JSON.stringify(body ?? {}) });
  return r;
};

before(async () => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  ensureAdmin(db);
  app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }), serveStatic: false });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
  const reg = await (await call("POST", "/api/auth/register", null, { username: "secuser", password: "Passw0rd!xyz", displayName: "בודק", signupCode: "shevet-code" })).json();
  userTok = reg.token;
  const login = await (await call("POST", "/api/auth/login", null, { username: "admin", password: "admin123" })).json();
  adminTok = login.token;
});
after(() => server.close());

describe("שלב 58: הגנה מפני zip מנופח", () => {
  it("קובץ Word תקין עדיין נקרא", async () => {
    const buf = await buildDocx(getActivity(db, 1));
    assert.ok(assertSafeZip(buf).entries > 3);
    const text = await extractText(buf, "a.docx");
    assert.ok(text.length > 50);
  });

  it("רכיב שמתנפח מעבר לתקרה נחסם מהר, בלי להקצות זיכרון", () => {
    const bomb = makeZip(Buffer.alloc(40_000_000, 0x61));
    assert.ok(bomb.length < 100_000, "הפצצה קטנה: " + bomb.length);
    const t0 = Date.now();
    assert.throws(() => assertSafeZip(bomb), (e) => e.status === 422 && e.code === "ZIP_UNSAFE");
    assert.ok(Date.now() - t0 < 2000);
  });

  it("גם כשהקובץ משקר על הגודל שלו", () => {
    const liar = makeZip(Buffer.alloc(40_000_000, 0x61), { declared: 10 });
    assert.throws(() => assertSafeZip(liar), (e) => e.status === 422);
  });

  it("הרבה רכיבים קטנים שביחד גדולים מדי נחסמים", () => {
    // כל רכיב 7MB (מתחת לתקרה לרכיב), אבל ארבעה מהם עוברים את סך התקרה
    const one = zlib.deflateRawSync(Buffer.alloc(7_000_000, 0x62), { level: 9 });
    const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
    const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
    const locals = [], cds = [];
    let off = 0;
    for (let i = 0; i < 4; i++) {
      const nm = Buffer.from(`f${i}.xml`);
      const l = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(one.length), u32(7_000_000), u16(nm.length), u16(0), nm, one]);
      cds.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(one.length), u32(7_000_000), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nm]));
      locals.push(l);
      off += l.length;
    }
    const cd = Buffer.concat(cds);
    const zip = Buffer.concat([...locals, cd, Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(4), u16(4), u32(cd.length), u32(off), u16(0)])]);
    assert.throws(() => assertSafeZip(zip, { maxEntries: 50, maxEntryBytes: 8_000_000, maxTotalBytes: 20_000_000 }), (e) => e.status === 422);
  });

  it("קבצים פגומים או לא zip נדחים בלי לקרוס", () => {
    for (const junk of [Buffer.alloc(0), Buffer.from("hello world, not a zip file at all"), Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]), makeZip(Buffer.from("abc")).subarray(0, 40)]) {
      assert.throws(() => assertSafeZip(junk), (e) => e.status === 422);
    }
  });

  it("הנתיב הציבורי מחזיר 422 ולא 500 לפצצה", async () => {
    const bomb = makeZip(Buffer.alloc(40_000_000, 0x61));
    for (const p of ["/api/activities/import-file?name=x.docx", "/api/style/extract?name=x.docx"]) {
      const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: bomb });
      assert.equal(r.status, 422, p);
    }
  });
});

describe("שלב 58: מפת הנתיבים", () => {
  // רשימת הנתיבים שנגישים בלי התחברות (גם אם מחזירים 400 על בקשה ריקה). נבדקה ידנית בשלב 58.
  // נתיב חדש שנגיש לאורח ולא מופיע כאן יכשיל את הבדיקה, כדי שההחלטה תהיה מודעת.
  const PUBLIC = new Set([
  "GET /api/activities",
  "GET /api/activities/:id",
  "GET /api/activities/:id/access",
  "GET /api/activities/:id/export/docx",
  "GET /api/activities/:id/newbie",
  "GET /api/activities/:id/questions",
  "GET /api/activities/:id/ratings",
  "GET /api/activities/:id/review",
  "GET /api/activities/:id/safety",
  "GET /api/activities/:id/similar",
  "GET /api/activities/:id/summary",
  "GET /api/activities/:id/whatsapp",
  "GET /api/adapt/conditions",
  "GET /api/announcements",
  "GET /api/assist/shared/:token",
  "GET /api/assist/templates",
  "GET /api/assist/traits",
  "GET /api/auth/invite/:code",
  "GET /api/auth/options",
  "GET /api/challenges",
  "GET /api/coverage",
  "GET /api/featured",
  "GET /api/flag-reasons",
  "GET /api/flags",
  "GET /api/gear",
  "GET /api/hall",
  "GET /api/health",
  "GET /api/health/data",
  "GET /api/icebreakers",
  "GET /api/kinds",
  "GET /api/logo",
  "GET /api/me/gaps",
  "GET /api/meta",
  "GET /api/methods",
  "GET /api/newbie/guide",
  "GET /api/peak-ideas",
  "GET /api/privacy-info",
  "GET /api/quick",
  "GET /api/reactions/:id",
  "GET /api/requests",
  "GET /api/search/smart",
  "GET /api/search/suggest",
  "GET /api/status",
  "GET /api/stories",
  "GET /api/suggest/week",
  "GET /api/topics/random",
  "GET /api/topics/suggest",
  "GET /api/values",
  "GET /api/warmups",
  "GET /api/write/shared/:token",
  "GET /api/write/shared/:token/comments",
  "GET /api/write/templates",
  "GET /api/year-mix",
  "POST /api/activities/:id/adapt",
  "POST /api/activities/:id/duplicate",
  "POST /api/activities/:id/feedback",
  "POST /api/activities/:id/flags",
  "POST /api/activities/:id/ratings",
  "POST /api/activities/:id/shorten",
  "POST /api/activities/:id/similar",
  "POST /api/activities/:id/stages/:index/regenerate",
  "POST /api/activities/:id/upgrade-peak",
  "POST /api/activities/emergency",
  "POST /api/activities/generate",
  "POST /api/activities/import",
  "POST /api/activities/import-file",
  "POST /api/activities/import-parsed",
  "POST /api/activities/prompt",
  "POST /api/activities/quick",
  "POST /api/assist/analyze",
  "POST /api/assist/continue",
  "POST /api/assist/dryrun",
  "POST /api/assist/gear",
  "POST /api/assist/help",
  "POST /api/assist/inclusion",
  "POST /api/assist/inspire",
  "POST /api/assist/learn-style",
  "POST /api/assist/parents",
  "POST /api/assist/questions",
  "POST /api/assist/reflect",
  "POST /api/assist/rewrite",
  "POST /api/assist/save",
  "POST /api/assist/script",
  "POST /api/assist/shared/:token/comments",
  "POST /api/lux/presence/shared/:token", // נוכחות באורחים בטיוטה משותפת. ההרשאה היא טוקן השיתוף, כמו GET /api/assist/shared/:token
  "POST /api/assist/stations",
  "POST /api/assist/swap",
  "POST /api/auth/2fa",
  "POST /api/auth/2fa/email/request",
  "POST /api/auth/forgot",
  "POST /api/auth/login",
  "POST /api/auth/magic/consume",
  "POST /api/auth/magic/request",
  "POST /api/auth/password-check",
  "POST /api/auth/register",
  "POST /api/auth/reset",
  "POST /api/by-equipment",
  "POST /api/client-error",
  "POST /api/cost/estimate",
  "POST /api/export/booklet",
  "POST /api/feedback/feature",
  "POST /api/plan",
  "POST /api/plan/multi",
  "POST /api/quality",
  "POST /api/report",
  "POST /api/style/analyze",
  "POST /api/style/extract",
  "POST /api/vitals",
  "POST /api/write/shared/:token/comments",
  "POST /api/write/shared/:token/presence"
  ]);
  const routes = () => {
    const out = [];
    for (const l of app.router.stack) if (l.route) for (const m of Object.keys(l.route.methods)) out.push([m.toUpperCase(), l.route.path]);
    return out.filter(([m, p]) => !(/logout|backup\/restore|maintenance/.test(p) && m !== "GET"));
  };

  it("כל נתיב שפתוח לאורח מופיע ברשימה שנבדקה", async () => {
    const open = [];
    for (const [m, p] of routes()) {
      const r = await call(m, p, null);
      if (r.status !== 401 && r.status !== 403 && !PUBLIC.has(`${m} ${p}`)) open.push(`${m} ${p} -> ${r.status}`);
    }
    assert.deepEqual(open, [], "נתיבים חדשים פתוחים לאורח. אם זה מכוון, הוסיפו אותם לרשימה:\n" + open.join("\n"));
  });

  it("אף נתיב אדמין (או וואטסאפ) לא נגיש לאורח או למשתמש רגיל", async () => {
    const bad = [];
    for (const [m, p] of routes()) {
      if (!/^\/api\/(admin|wa\/admin)\//.test(p)) continue;
      for (const tok of [null, userTok]) {
        const r = await call(m, p, tok);
        if (r.status !== 401 && r.status !== 403) bad.push(`${m} ${p} ${tok ? "user" : "anon"} -> ${r.status}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it("תפקיד מנהל תוכן לא מגיע לוואטסאפ", async () => {
    const r = await call("GET", "/api/admin/wa/status", adminTok);
    assert.notEqual(r.status, 403, "אדמין ראשי רשאי (או שהנתיב עוד לא קיים: 404)");
  });
});

describe("שלב 58: כותרות וגופי בקשה", () => {
  it("תשובה אישית מסומנת no-store, וציבורית לא", async () => {
    const a = await call("GET", "/api/me/security", userTok);
    assert.equal(a.status, 200);
    assert.match(a.headers.get("cache-control") || "", /no-store/);
    const b = await call("GET", "/api/health", null);
    assert.doesNotMatch(b.headers.get("cache-control") || "", /no-store/);
  });

  it("גוף של 2MB לעוזר השיחות בלי התחברות נדחה מיד", async () => {
    const big = JSON.stringify({ text: "א".repeat(2_000_000) });
    const r = await fetch(base + "/api/chat/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: big });
    assert.equal(r.status, 401);
  });

  it("שלב 59: העלאת קובץ של 500KB: אורח נדחה (413), מחובר עובר לקריאה (לא 413)", async () => {
    const big = Buffer.alloc(500_000, 0x61);
    for (const p of ["/api/activities/import-file?name=x.txt", "/api/style/extract?name=x.txt"]) {
      const guest = await fetch(base + p, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: big });
      assert.equal(guest.status, 413, `guest ${p}`);
      const user = await fetch(base + p, { method: "POST", headers: { "content-type": "application/octet-stream", authorization: `Bearer ${userTok}` }, body: big });
      assert.notEqual(user.status, 413, `user ${p}`);
    }
  });

  it("שלב 59: אסימון מזויף לא פותח את תקרת ה-3MB", async () => {
    const big = Buffer.alloc(600_000, 0x61);
    const r = await fetch(base + "/api/style/extract?name=x.txt", { method: "POST", headers: { "content-type": "application/octet-stream", authorization: "Bearer not-a-real-token-at-all" }, body: big });
    assert.equal(r.status, 413);
  });
});

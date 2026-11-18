// שלב 70: חדרי שטח ב-SQLite, מגבלת קצב לפי משתמש, עריכת צוות חיה בעורך (מיזוג, הרשאות, נוכחות SSE) ו"ה-DNA של הקבוצה"
import assert from "node:assert/strict";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.BACKUP_DIR = (await import("node:os")).tmpdir() + "/scout-m70-backups-" + process.pid;

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { config } = await import("../src/config.js");
const { createRooms } = await import("../src/field-rooms.js");
const jsMerge = await import("../src/block-merge.js");
const tsMerge = await import("../../frontend/src/lib/blockmerge.ts"); // אותו קובץ שרץ בדפדפן (תחביר מחיק)
const { createLiveDocs } = await import("../src/lux-presence.js");
const dna = await import("../src/group-dna.js");
const { createRag } = await import("../src/maoz-rag.js");
const { aiTurn, localTurn, SCENARIOS } = await import("../src/maoz-spar.js");
const { aiDraft, localDraft } = await import("../src/maoz-draft.js");
const { parseSse } = await import("../../frontend/src/lib/field.ts");

// ───────────────────────── 70א. חדרי שטח שורדים השכמה של השרת ─────────────────────────
describe("70א. חדרי שטח ב-SQLite", () => {
  const fakeRes = () => ({ out: [], ended: false, write(s) { this.out.push(s); return true; }, end() { this.ended = true; } });
  const hello = (res) => JSON.parse(/data: (.*)\n/.exec(res.out[0])[1]);

  it("חדר וטיימר שורדים 'השכמה': מופע חדש על אותו מסד מוצא את החדר, והטיימר ממשיך לרוץ", () => {
    const db = new DatabaseSync(":memory:");
    let t = 1_000_000;
    const a = createRooms({ db, timers: false, now: () => t });
    const { code } = a.create({ activityId: 7, ownerId: 3 });
    const r1 = fakeRes();
    a.join(code, "c1".repeat(8), r1);
    assert.equal(a.push(code, "c1".repeat(8), { idx: 2, running: true, remaining: 300 }), 1);
    a.shutdown(); // השרת נרדם: החיבורים נסגרים, החדר נשמר במסד
    t += 90_000; // 90 שניות אחר כך
    const b = createRooms({ db, timers: false, now: () => t });
    assert.equal(b.has(code), true);
    assert.equal(b.isOwner(code, 3), true);
    assert.equal(b.isOwner(code, 4), false);
    const info = b.info(code);
    assert.deepEqual({ idx: info.state.idx, running: info.state.running, remaining: info.state.remaining }, { idx: 2, running: true, remaining: 210 });
    const r2 = fakeRes();
    assert.equal(typeof b.join(code, "d3".repeat(8), r2), "function");
    assert.equal(hello(r2).state.remaining, 210);
    assert.equal(hello(r2).activityId, 7);
  });

  it("טיימר מושהה לא יורד, וטיימר רץ לא יורד מתחת למינימום הסביר גם אחרי שעות", () => {
    const db = new DatabaseSync(":memory:");
    let t = 5_000_000;
    const a = createRooms({ db, timers: false, now: () => t });
    const { code } = a.create({ activityId: 1, ownerId: 1 });
    a.join(code, "c1".repeat(8), fakeRes());
    a.push(code, "c1".repeat(8), { idx: 0, running: false, remaining: 120 });
    t += 3_000_000;
    assert.equal(a.info(code).state.remaining, 120);
    a.push(code, "c1".repeat(8), { idx: 0, running: true, remaining: 60 });
    t += 5 * 3600_000;
    assert.equal(a.info(code).state.remaining, -3600);
  });

  it("חדר שננטש נמחק מהמסד אחרי הזמן; חדר ישן מ-TTL נמחק גם אם יש בו מחוברים; סגירה מוחקת שורה", () => {
    const db = new DatabaseSync(":memory:");
    let t = 0;
    const a = createRooms({ db, timers: false, now: () => t, idleMs: 1000, ttlMs: 10_000 });
    const idle = a.create({ activityId: 1, ownerId: 1 }).code;
    const live = a.create({ activityId: 2, ownerId: 1 }).code;
    const closed = a.create({ activityId: 3, ownerId: 1 }).code;
    a.join(live, "c1".repeat(8), fakeRes());
    assert.equal(a.close(closed), true);
    assert.equal(a.has(closed), false);
    t = 2000;
    a.sweep();
    assert.equal(a.has(idle), false, "נטוש מעל idleMs");
    assert.equal(a.has(live), true, "יש מחובר");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM field_rooms").get().c, 1);
    t = 11_000;
    a.sweep();
    assert.equal(a.has(live), false, "מעבר ל-TTL");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM field_rooms").get().c, 0);
  });

  it("מכסת חדרים נספרת לפי המסד, ושורה פגת תוקף שנקראת אחרי השכמה נמחקת ולא חוזרת", () => {
    const db = new DatabaseSync(":memory:");
    let t = 0;
    const a = createRooms({ db, timers: false, now: () => t, maxRooms: 2, ttlMs: 5000 });
    const c1 = a.create({ activityId: 1, ownerId: 1 }).code;
    a.create({ activityId: 2, ownerId: 1 });
    assert.throws(() => a.create({ activityId: 3, ownerId: 1 }));
    a.shutdown();
    const b = createRooms({ db, timers: false, now: () => t, maxRooms: 2, ttlMs: 5000 });
    assert.equal(b.size(), 2, "המסד מחזיק את החדרים גם כשהזיכרון ריק");
    assert.throws(() => b.create({ activityId: 3, ownerId: 1 }));
    t = 6000;
    assert.equal(b.has(c1), false);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM field_rooms WHERE code = ?").get(c1).c, 0);
  });

  it("בלי מסד: ההתנהגות של שלב 69 נשמרת (זיכרון בלבד)", () => {
    const a = createRooms({ timers: false });
    const { code } = a.create({ activityId: 1, ownerId: 1 });
    assert.equal(a.has(code), true);
    assert.equal(a.size(), 1);
    a.shutdown();
    assert.equal(a.has(code), false);
  });
});

// ───────────────────────── 70ב. מיזוג ברמת שלב (שרת ולקוח זהים) ─────────────────────────
describe("70ב. מיזוג ברמת שלב", () => {
  const B = (id, text = "", extra = {}) => ({ id, title: id, text, ...extra });
  const ids = (r) => r.blocks.map((b) => b.id).join(",");
  const txt = (r, id) => r.blocks.find((b) => b.id === id)?.text;

  const cases = [
    {
      name: "רק אני שיניתי שלב: השינוי שלי נכנס, השאר מהם",
      base: [B("a", "1"), B("b", "2")],
      mine: [B("a", "אני"), B("b", "2")],
      theirs: [B("a", "1"), B("b", "הם")],
      check: (r) => (assert.equal(txt(r, "a"), "אני"), assert.equal(txt(r, "b"), "הם"), assert.deepEqual(r.conflicts, [])),
    },
    {
      name: "שניים שינו אותו שלב: מי ששומר גובר, וההתנגשות מדווחת",
      base: [B("a", "1")],
      mine: [B("a", "אני")],
      theirs: [B("a", "הם")],
      check: (r) => (assert.equal(txt(r, "a"), "אני"), assert.deepEqual(r.conflicts, ["a"])),
    },
    {
      name: "שניהם שינו אותו שלב לאותו תוכן: אין התנגשות",
      base: [B("a", "1")],
      mine: [B("a", "x")],
      theirs: [B("a", "x")],
      check: (r) => (assert.equal(txt(r, "a"), "x"), assert.deepEqual(r.conflicts, [])),
    },
    {
      name: "הם מחקו שלב שלא נגעתי בו: נמחק. אני מחקתי שלב שהם שינו: נשאר",
      base: [B("a", "1"), B("b", "2"), B("c", "3")],
      mine: [B("a", "1"), B("b", "2")],
      theirs: [B("b", "2"), B("c", "הם שינו")],
      check: (r) => (assert.equal(ids(r), "b,c"), assert.equal(txt(r, "c"), "הם שינו")),
    },
    {
      name: "הם מחקו שלב שאני שיניתי: נשאר שלי",
      base: [B("a", "1"), B("b", "2")],
      mine: [B("a", "1"), B("b", "אני")],
      theirs: [B("a", "1")],
      check: (r) => (assert.equal(ids(r), "a,b"), assert.equal(txt(r, "b"), "אני")),
    },
    {
      name: "כל אחד הוסיף שלב במקום אחר: שניהם נכנסים במקומם",
      base: [B("a"), B("b"), B("c")],
      mine: [B("a"), B("m"), B("b"), B("c")],
      theirs: [B("a"), B("b"), B("c"), B("t")],
      check: (r) => assert.equal(ids(r), "a,m,b,c,t"),
    },
    {
      name: "הם סידרו מחדש ואני רק ערכתי טקסט: הסדר שלהם נשמר",
      base: [B("a", "1"), B("b", "2"), B("c", "3")],
      mine: [B("a", "אני"), B("b", "2"), B("c", "3")],
      theirs: [B("c", "3"), B("a", "1"), B("b", "2")],
      check: (r) => (assert.equal(ids(r), "c,a,b"), assert.equal(txt(r, "a"), "אני")),
    },
    {
      name: "אני סידרתי מחדש והם הוסיפו שלב: הסדר שלי, והשלב שלהם אחרי קודמו",
      base: [B("a"), B("b"), B("c")],
      mine: [B("c"), B("b"), B("a")],
      theirs: [B("a"), B("t"), B("b"), B("c")],
      check: (r) => assert.equal(ids(r), "c,b,a,t"),
    },
    {
      name: "בלי שינויים משני הצדדים: אותו נוסח",
      base: [B("a", "1"), B("b", "2")],
      mine: [B("a", "1"), B("b", "2")],
      theirs: [B("a", "1"), B("b", "2")],
      check: (r) => (assert.equal(ids(r), "a,b"), assert.deepEqual(r.conflicts, [])),
    },
    {
      name: "סדר מפתחות שונה באובייקט אינו שינוי",
      base: [{ id: "a", title: "t", text: "1" }],
      mine: [{ id: "a", title: "t", text: "אני" }],
      theirs: [{ text: "1", title: "t", id: "a" }],
      check: (r) => (assert.equal(txt(r, "a"), "אני"), assert.deepEqual(r.conflicts, [])),
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const js = jsMerge.mergeBlocks(c.base, c.mine, c.theirs);
      const ts = tsMerge.mergeBlocks(c.base, c.mine, c.theirs);
      c.check(js);
      assert.deepEqual(ts, js, "גרסת הדפדפן והשרת מחזירות אותו דבר");
    });
  }

  it("מיזוג שדות שטוחים (כותרת/מטא): שדה שלא שיניתי נלקח מהם, שדה ששיניתי נשאר שלי", () => {
    const base = { minutes: 45, value: "אומץ", gear: ["חבל"] };
    const mine = { minutes: 60, value: "אומץ", gear: ["חבל"] };
    const theirs = { minutes: 45, value: "חברות", gear: ["חבל", "כדור"] };
    const want = { minutes: 60, value: "חברות", gear: ["חבל", "כדור"] };
    assert.deepEqual(jsMerge.mergeFields(base, mine, theirs), want);
    assert.deepEqual(tsMerge.mergeFields(base, mine, theirs), want);
  });

  it("זיכרון נוסחי בסיס: שומר כמה גרסאות אחרונות לכל מסמך, ושוכח מסמכים ישנים", () => {
    const cache = jsMerge.createRevCache({ perDoc: 2, maxDocs: 2 });
    const row = (id, rev) => ({ id, rev, title: "t" + rev, meta_json: "{}", blocks_json: JSON.stringify([{ id: "a", text: String(rev) }]) });
    cache.remember(row(1, 1));
    cache.remember(row(1, 2));
    cache.remember(row(1, 2)); // כפילות לא נוספת
    cache.remember(row(1, 3));
    assert.equal(cache.at(1, 1), null, "מעבר ל-perDoc");
    assert.equal(cache.at(1, 3).blocks[0].text, "3");
    cache.remember(row(2, 1));
    cache.remember(row(3, 1));
    assert.equal(cache.at(1, 3), null, "מעבר ל-maxDocs (הישן נשכח)");
    assert.equal(cache.size(), 2);
  });
});

// ───────────────────────── 70ג. נוכחות חיה (לוגיקה, בלי רשת) ─────────────────────────
describe("70ג. נוכחות חיה במסמך", () => {
  const fakeRes = () => ({ out: [], ended: false, write(s) { this.out.push(s); return true; }, end() { this.ended = true; } });
  const events = (res) => res.out.filter((s) => s.startsWith("event:")).map((s) => ({ ev: /event: (\w+)/.exec(s)[1], d: JSON.parse(/data: (.*)\n/.exec(s)[1]) }));
  const CID = (n) => String(n).repeat(16).slice(0, 16);

  it("הצטרפות, מיקום והקלדה מתפרסמים לכולם; מזהה האדם אטום ולא חושף את מזהה החיבור", () => {
    const live = createLiveDocs({ timers: false });
    const a = fakeRes(), b = fakeRes();
    live.join(5, CID(1), a, { userId: 1, name: "דנה", owner: true });
    const leaveB = live.join(5, CID(2), b, { userId: 2, name: "יוסי" });
    assert.equal(events(a).at(-1).ev, "presence", "A מקבלת הודעה שיוסי הצטרף");
    assert.equal(events(a).at(-1).d.people.length, 2);
    const hello = events(b)[0];
    assert.equal(hello.ev, "hello");
    assert.match(hello.d.me, /^[a-z0-9]+$/);
    assert.ok(!JSON.stringify(events(a)).includes(CID(2)), "מזהה החיבור לא נחשף");
    assert.equal(live.focus(5, CID(2), 2, { block: "blk1", editing: true }), true);
    const last = events(a).at(-1).d.people.find((p) => p.name === "יוסי");
    assert.equal(last.block, "blk1");
    assert.equal(last.editing, true);
    leaveB();
    assert.equal(events(a).at(-1).d.people.length, 1);
  });

  it("אי אפשר לזייף מיקום של מישהו אחר: משתמש אחר או חיבור לא מוכר נדחים", () => {
    const live = createLiveDocs({ timers: false });
    live.join(1, CID(1), fakeRes(), { userId: 1, name: "א" });
    assert.equal(live.focus(1, CID(1), 99, { block: "x" }), false);
    assert.equal(live.focus(1, CID(7), 1, { block: "x" }), false);
    assert.equal(live.focus(2, CID(1), 1, { block: "x" }), false);
  });

  it("מגבלת מחוברים למסמך, חיבור חוזר מחליף את הישן, והסרה מנתקת את כל חיבורי המשתמש", () => {
    const live = createLiveDocs({ timers: false, maxPerDoc: 2 });
    const r1 = fakeRes();
    live.join(1, CID(1), r1, { userId: 1, name: "א" });
    live.join(1, CID(2), fakeRes(), { userId: 2, name: "ב" });
    assert.equal(live.check(1, CID(3)), "full");
    assert.equal(live.check(1, CID(1)), "ok", "חיבור קיים תמיד מותר");
    const again = fakeRes();
    live.join(1, CID(1), again, { userId: 1, name: "א" });
    assert.equal(r1.ended, true);
    assert.equal(live.people(1).length, 2);
    assert.equal(live.kickUser(1, 2), 1);
    assert.equal(live.people(1).length, 1);
  });

  it("הודעת 'נשמר' מגיעה לאחרים בלבד, בלי תוכן המסמך", () => {
    const live = createLiveDocs({ timers: false });
    const a = fakeRes(), b = fakeRes();
    live.join(1, CID(1), a, { userId: 1, name: "א" });
    live.join(1, CID(2), b, { userId: 2, name: "ב" });
    const before = events(a).length;
    assert.equal(live.saved(1, { rev: 4, cid: CID(1), changed: ["x"], title: true }), 1);
    assert.equal(events(a).length, before, "השומר לא מקבל הד");
    const s = events(b).at(-1);
    assert.equal(s.ev, "saved");
    assert.deepEqual(Object.keys(s.d).sort(), ["by", "changed", "conflicts", "meta", "rev", "title"]);
    assert.equal(s.d.rev, 4);
  });
});

// ───────────────────────── 70ד. עריכת צוות מקצה לקצה (HTTP + SSE) ─────────────────────────
describe("70ד. עריכת צוות בעורך: הרשאות, מיזוג ונוכחות", () => {
  let app, server, base, db;
  let owner, editor, stranger, ownerName, editorName;
  const j = async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const auth = (t) => ({ authorization: `Bearer ${t}` });
  const reg = async () => {
    const username = "t70" + Math.random().toString(36).slice(2, 8);
    const r = await j("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password: "Str0ng!Passw0rd", displayName: "מדריך " + username, acceptTerms: true, signupCode: "shevet-code" }) });
    return { token: r.body.token, username };
  };
  const newDoc = async (t) => (await j("/api/write/docs", { method: "POST", headers: auth(t), body: JSON.stringify({ template: "classic", title: "פעולה משותפת" }) })).body;
  const get = (t, id) => j(`/api/write/docs/${id}`, { headers: auth(t) });
  const put = (t, doc, over = {}) => j(`/api/write/docs/${doc.id}`, { method: "PUT", headers: auth(t), body: JSON.stringify({ title: doc.title, meta: doc.meta, blocks: doc.blocks, baseRev: doc.rev, ...over }) });
  const edit = (doc, i, text) => ({ ...doc, blocks: doc.blocks.map((b, k) => (k === i ? { ...b, text } : b)) });

  const openStream = (id, cid, token) =>
    new Promise((resolve, reject) => {
      const msgs = [];
      let rest = "";
      const waiters = [];
      const req = http.get(`${base}/api/write/docs/${id}/live?cid=${cid}`, { agent: false, headers: token ? auth(token) : {} }, (res) => {
        res.setEncoding("utf8");
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ status: res.statusCode, msgs, close: () => req.destroy() });
        }
        res.on("data", (d) => {
          const p = parseSse(rest + d);
          rest = p.rest;
          for (const m of p.messages) msgs.push({ event: m.event, ...JSON.parse(m.data) });
          for (const w of [...waiters]) if (msgs.some(w.pred)) (waiters.splice(waiters.indexOf(w), 1), w.ok(msgs.find(w.pred)));
        });
        resolve({
          status: res.statusCode,
          headers: res.headers,
          msgs,
          wait: (pred, ms = 3000) =>
            new Promise((ok, no) => {
              const hit = msgs.find(pred);
              if (hit) return ok(hit);
              waiters.push({ pred, ok });
              setTimeout(() => no(new Error("timeout, got: " + JSON.stringify(msgs))), ms).unref?.();
            }),
          close: () => req.destroy(),
        });
      });
      req.on("error", (e) => (e.code === "ECONNRESET" ? null : reject(e)));
    });

  before(async () => {
    db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;
    ({ token: owner, username: ownerName } = await reg());
    ({ token: editor, username: editorName } = await reg());
    ({ token: stranger } = await reg());
  });
  after(() => {
    app.locals.fieldRooms?.shutdown();
    app.locals.liveDocs?.shutdown();
    server.closeAllConnections?.();
    server.close();
  });

  it("מסמך הוא פרטי: מדריך שלא הוזמן לא קורא, לא שומר ולא מתחבר לנוכחות (404, לא 403)", async () => {
    const doc = await newDoc(owner);
    assert.equal((await get(stranger, doc.id)).status, 404);
    assert.equal((await put(stranger, doc)).status, 404);
    assert.equal((await openStream(doc.id, "a1".repeat(8), stranger)).status, 404);
    assert.equal((await openStream(doc.id, "a1".repeat(8), null)).status, 401);
    assert.equal((await j(`/api/write/docs/${doc.id}/editors`, { headers: auth(stranger) })).status, 404);
  });

  it("הזמנה: רק הבעלים מזמין; משתמש לא קיים, עצמי וכפילות נדחים; יש מגבלה; ההתראה נשלחת", async () => {
    const doc = await newDoc(owner);
    const inv = (t, username) => j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(t), body: JSON.stringify({ username }) });
    assert.equal((await inv(owner, "no_such_user_xyz")).status, 404);
    assert.equal((await inv(owner, ownerName)).status, 400);
    assert.equal((await inv(editor, editorName)).status, 404, "מי שלא הוזמן עוד לא רואה את המסמך");
    const ok = await inv(owner, editorName.toUpperCase());
    assert.equal(ok.status, 201);
    assert.equal(ok.body.editors.length, 1);
    assert.equal((await inv(owner, editorName)).body.editors.length, 1, "הזמנה כפולה לא משכפלת");
    assert.equal((await inv(editor, ownerName)).status, 403, "עורך לא מזמין");
    const n = db.prepare("SELECT text, link FROM notifications WHERE kind = 'collab' ORDER BY id DESC LIMIT 1").get();
    assert.match(n.text, /הזמין/);
    assert.equal(n.link, `/write/${doc.id}`);
    const list = await j(`/api/write/docs/${doc.id}/editors`, { headers: auth(editor) });
    assert.equal(list.body.role, "editor");
    assert.ok(!("username" in list.body.editors[0]), "עורך לא רואה שמות משתמש");
    const own = await j(`/api/write/docs/${doc.id}/editors`, { headers: auth(owner) });
    assert.equal(own.body.editors[0].username, editorName);
    const mine = await j("/api/write/editing", { headers: auth(editor) });
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].id, doc.id);
    assert.equal((await j("/api/write/editing", { headers: auth(stranger) })).body.length, 0);
  });

  it("עורך מוזמן קורא ושומר, אבל מחיקה, שכפול וגרסאות נשארים לבעלים", async () => {
    const doc = await newDoc(owner);
    await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: editorName }) });
    const g = await get(editor, doc.id);
    assert.equal(g.status, 200);
    assert.equal(g.body.role, "editor");
    assert.equal((await get(owner, doc.id)).body.role, "owner");
    const saved = await put(editor, edit(g.body, 0, "נכתב ע״י העורך"));
    assert.equal(saved.status, 200);
    assert.equal(saved.body.rev, g.body.rev + 1);
    assert.equal((await get(owner, doc.id)).body.blocks[0].text, "נכתב ע״י העורך");
    assert.equal((await j(`/api/write/docs/${doc.id}`, { method: "DELETE", headers: auth(editor) })).status, 404);
    assert.equal((await j(`/api/write/docs/${doc.id}/versions`, { headers: auth(editor) })).status, 404);
    assert.equal((await j(`/api/write/docs/${doc.id}/duplicate`, { method: "POST", headers: auth(editor), body: "{}" })).status, 404);
    assert.equal((await get(owner, doc.id)).status, 200, "המסמך לא נמחק");
  });

  it("שני מדריכים עורכים שלבים שונים: שמירה עם merge ממזגת, בלי התנגשות ובלי לאבד כלום", async () => {
    const doc = await newDoc(owner);
    await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: editorName }) });
    const o = (await get(owner, doc.id)).body; // שניהם קוראים את אותה גרסה
    const e = (await get(editor, doc.id)).body;
    assert.equal(o.rev, e.rev);
    const first = await put(editor, edit(e, 0, "פתיחה של העורך"), { merge: true });
    assert.equal(first.status, 200);
    assert.equal(first.body.merged, undefined, "בלי התנגשות רוויזיה אין מיזוג");
    // הבעלים עדיין על הגרסה הישנה ועורך שלב אחר
    const second = await put(owner, edit(o, 2, "שיא של הבעלים"), { merge: true });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.merged, true);
    assert.deepEqual(second.body.conflicts, []);
    assert.equal(second.body.blocks[0].text, "פתיחה של העורך");
    assert.equal(second.body.blocks[2].text, "שיא של הבעלים");
    assert.equal(second.body.rev, o.rev + 2);
    const fresh = (await get(editor, doc.id)).body;
    assert.equal(fresh.blocks[0].text, "פתיחה של העורך");
    assert.equal(fresh.blocks[2].text, "שיא של הבעלים");
  });

  it("אותו שלב בשני הצדדים: נשמר הנוסח של מי ששומר, וה'אחר' נשמר בגרסאות", async () => {
    const doc = await newDoc(owner);
    await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: editorName }) });
    const o = (await get(owner, doc.id)).body;
    const e = (await get(editor, doc.id)).body;
    await put(editor, edit(e, 1, "גרסת העורך"), { merge: true });
    const r = await put(owner, edit(o, 1, "גרסת הבעלים"), { merge: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.merged, true);
    assert.deepEqual(r.body.conflicts, [o.blocks[1].id]);
    assert.equal(r.body.blocks[1].text, "גרסת הבעלים");
    const vers = (await j(`/api/write/docs/${doc.id}/versions`, { headers: auth(owner) })).body;
    const snap = vers.find((v) => /לפני מיזוג/.test(v.note || ""));
    assert.ok(snap, "נשמרה גרסה לפני המיזוג");
    const old = (await j(`/api/write/docs/${doc.id}/versions/${snap.id}`, { headers: auth(owner) })).body;
    assert.equal(old.blocks[1].text, "גרסת העורך");
  });

  it("בלי merge, או כשנוסח הבסיס לא בזיכרון: התנגשות רגילה (409), כמו לפני שלב 70", async () => {
    const solo = await newDoc(owner);
    const s1 = (await get(owner, solo.id)).body;
    await put(owner, edit(s1, 0, "א"));
    const stale = await put(owner, edit(s1, 0, "ב"), { merge: true });
    assert.equal(stale.status, 409, "מסמך בלי עורכים לא ממוזג");
    assert.equal(stale.body.error.code, "CONFLICT");
    assert.ok(stale.body.current);

    const doc = await newDoc(owner);
    await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: editorName }) });
    const d = (await get(owner, doc.id)).body;
    await put(owner, edit(d, 0, "ג"));
    assert.equal((await put(owner, edit(d, 1, "ד"))).status, 409, "בלי merge=true");
    app.locals.writeRevs.forget(doc.id); // כמו אחרי השכמה של השרת
    assert.equal((await put(owner, edit(d, 1, "ד"), { merge: true })).status, 409, "נוסח בסיס חסר");
  });

  it("סכום שלבים אחרי מיזוג מוגבל ל-60", async () => {
    const doc = await newDoc(owner);
    await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: editorName }) });
    const o = (await get(owner, doc.id)).body;
    const e = (await get(editor, doc.id)).body;
    const mk = (pre, n) => Array.from({ length: n }, (_, i) => ({ id: `${pre}${i}`, title: "", kind: "free", minutes: null, text: "", note: "", done: false }));
    await put(editor, { ...e, blocks: [...e.blocks, ...mk("e", 40)] }, { merge: true });
    const r = await put(owner, { ...o, blocks: [...o.blocks, ...mk("o", 40)] }, { merge: true });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "TOO_MANY");
  });

  it("נוכחות חיה אמיתית: מי מחובר, באיזה שלב, הודעת 'נשמר' בלי הד, והסרה מנתקת", async () => {
    const doc = await newDoc(owner);
    await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: editorName }) });
    const A = "a1".repeat(8), E = "e5".repeat(8);
    const sa = await openStream(doc.id, A, owner);
    assert.equal(sa.status, 200);
    assert.match(sa.headers["content-type"], /text\/event-stream/);
    assert.match(sa.headers["cache-control"], /no-transform/);
    await sa.wait((m) => m.event === "hello");
    const se = await openStream(doc.id, E, editor);
    const eHello = await se.wait((m) => m.event === "hello");
    assert.equal(eHello.people.length, 2);
    await sa.wait((m) => m.event === "presence" && m.people.length === 2);

    // מיקום: בלי חיבור פעיל או עם בקשה לא תקינה נדחה
    const focus = (t, body) => j(`/api/write/docs/${doc.id}/live/focus`, { method: "POST", headers: auth(t), body: JSON.stringify(body) });
    assert.equal((await focus(editor, { cid: "f0".repeat(8), block: "x", editing: true })).status, 409);
    assert.equal((await focus(owner, { cid: E, block: "x" })).status, 409, "לא אפשר לדווח בשם חיבור של אחר");
    assert.equal((await focus(editor, { cid: E, block: "x".repeat(40) })).status, 400);
    assert.equal((await focus(stranger, { cid: E, block: "x" })).status, 404);
    const blockId = doc.blocks[1].id;
    assert.equal((await focus(editor, { cid: E, block: blockId, editing: true })).status, 200);
    const seen = await sa.wait((m) => m.event === "presence" && m.people.some((p) => p.block === blockId && p.editing));
    assert.ok(seen.people.every((p) => p.name && p.color));

    // שמירה של העורך מגיעה לבעלים בלבד
    const e = (await get(editor, doc.id)).body;
    const r = await put(editor, edit(e, 1, "שינוי חי"), { cid: E });
    assert.equal(r.status, 200);
    const saved = await sa.wait((m) => m.event === "saved");
    assert.equal(saved.rev, r.body.rev);
    assert.deepEqual(saved.changed, [blockId]);
    assert.equal(se.msgs.some((m) => m.event === "saved"), false, "השומר לא מקבל הד");

    // הסרת העורך מנתקת אותו וחוסמת גישה
    assert.equal((await j(`/api/write/docs/${doc.id}/editors/${(await j(`/api/write/docs/${doc.id}/editors`, { headers: auth(owner) })).body.editors[0].id}`, { method: "DELETE", headers: auth(owner) })).status, 200);
    await se.wait((m) => m.event === "kicked");
    assert.equal((await get(editor, doc.id)).status, 404);
    sa.close();
    se.close();
  });

  it("עורך יכול לעזוב בעצמו, אבל לא להסיר אחרים", async () => {
    const doc = await newDoc(owner);
    const { token: third, username: thirdName } = await reg();
    for (const u of [editorName, thirdName]) await j(`/api/write/docs/${doc.id}/editors`, { method: "POST", headers: auth(owner), body: JSON.stringify({ username: u }) });
    const list = (await j(`/api/write/docs/${doc.id}/editors`, { headers: auth(owner) })).body.editors;
    const eId = list.find((x) => x.username === editorName).id;
    const tId = list.find((x) => x.username === thirdName).id;
    assert.equal((await j(`/api/write/docs/${doc.id}/editors/${tId}`, { method: "DELETE", headers: auth(editor) })).status, 403);
    assert.equal((await j(`/api/write/docs/${doc.id}/editors/${eId}`, { method: "DELETE", headers: auth(editor) })).status, 200);
    assert.equal((await get(editor, doc.id)).status, 404);
    assert.equal((await get(third, doc.id)).status, 200);
  });
});

// ───────────────────────── 70ה. ה-DNA של הקבוצה ─────────────────────────
describe("70ה. DNA קבוצתי", () => {
  const row = (o) => ({ engagement: null, timing: null, energetic: 0, value: "", methods: [], worked: "", changeNext: "", ...o });

  it("עד שיש 3 הפעלות מדורגות אין פרופיל (ready=false) ואין משפט לפרומפט", () => {
    const d = dna.computeDna([row({ engagement: 3, energetic: 1 }), row({ engagement: 2 }), row({})]);
    assert.equal(d.ready, false);
    assert.equal(d.hint, "");
    assert.equal(d.sig, "");
    assert.equal(dna.dnaSystemLine(d), "");
  });

  it("קבוצה אנרגטית: מעדיפה אנרגיה, מתודות מנצחות ותורפה, ומשפט הפרופיל בלי שמות", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ engagement: 3, energetic: 1, methods: ["משחק תנועה", "תחרות"], value: "אומץ", worked: "המשחק והתנועה עבדו מצוין", timing: "long" })),
      ...Array.from({ length: 3 }, () => row({ engagement: 1, energetic: 0, methods: ["הרצאה"], changeNext: "יותר מדי דיבור והסבר ארוך", timing: "long" })),
    ];
    const d = dna.computeDna(rows);
    assert.equal(d.ready, true);
    assert.equal(d.energy.pref, "high");
    assert.equal(d.confidence, "medium");
    assert.deepEqual(d.winMethods.map((m) => m.name).sort(), ["משחק תנועה", "תחרות"]);
    assert.deepEqual(d.weakMethods.map((m) => m.name), ["הרצאה"]);
    assert.equal(d.timing, "long");
    assert.ok(d.failThemes.some((t) => t.id === "talk"));
    assert.ok(d.winThemes.some((t) => t.id === "move"));
    assert.deepEqual(d.values.map((v) => v.name), ["אומץ"]);
    assert.match(d.hint, /אנרגטיות/);
    assert.match(d.hint, /משחק תנועה/);
    assert.match(d.hint, /להימשך יותר מדי/);
    assert.ok(!/\d{4,}/.test(d.hint));
    assert.match(dna.dnaSystemLine(d), /בטיחות/, "ההנחיה לא מבטלת בטיחות");
    assert.equal(d.sig.length, 8);
  });

  it("קבוצה רגועה, או בלי הבדל מובהק, או בלי נתונים משני הצדדים", () => {
    const calm = dna.computeDna([...Array.from({ length: 3 }, () => row({ engagement: 3, energetic: 0 })), ...Array.from({ length: 3 }, () => row({ engagement: 1, energetic: 1 }))]);
    assert.equal(calm.energy.pref, "calm");
    const mixed = dna.computeDna([...Array.from({ length: 3 }, () => row({ engagement: 2, energetic: 0 })), ...Array.from({ length: 3 }, () => row({ engagement: 2, energetic: 1 }))]);
    assert.equal(mixed.energy.pref, "mixed");
    const onlyOne = dna.computeDna(Array.from({ length: 4 }, () => row({ engagement: 3, energetic: 1 })));
    assert.equal(onlyOne.energy.pref, null);
  });

  it("התאמת תוצאות חיפוש: משנה רק את הציון לפי הפרופיל, ובלי פרופיל לא משנה כלום", () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ engagement: i < 3 ? 3 : 1, energetic: i < 3 ? 1 : 0, methods: i < 3 ? ["משחק תנועה"] : ["הרצאה"] }));
    const d = dna.computeDna(rows);
    assert.ok(dna.dnaFactor({ energetic: 1, title: "x", meta: "", snippet: "" }, d) > 1);
    assert.ok(dna.dnaFactor({ energetic: 0, title: "x", meta: "", snippet: "" }, d) < 1);
    assert.ok(dna.dnaFactor({ energetic: null, title: "משחק תנועה", meta: "", snippet: "" }, d) > 1);
    assert.ok(dna.dnaFactor({ energetic: null, title: "הרצאה", meta: "", snippet: "" }, d) < 1);
    assert.equal(dna.dnaFactor({ energetic: 1, title: "x" }, null), 1);
    assert.equal(dna.dnaFactor({ energetic: 1, title: "x" }, { ready: false }), 1);
  });

  describe("עם מסד, נתיבים ו-AI", () => {
    let app, server, base, db, tok, tok2, uid;
    const j = async (path, opts = {}) => {
      const r = await fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const auth = (t) => ({ authorization: `Bearer ${t}` });
    const reg = async () => {
      const username = "d70" + Math.random().toString(36).slice(2, 8);
      const r = await j("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password: "Str0ng!Passw0rd", displayName: "בודק", acceptTerms: true, signupCode: "shevet-code" }) });
      return r.body.token;
    };
    before(async () => {
      db = openDb(":memory:");
      seedIfEmpty(db);
      ensureAdmin(db);
      app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
      server = app.listen(0);
      base = `http://localhost:${server.address().port}`;
      tok = await reg();
      tok2 = await reg();
      uid = db.prepare("SELECT id FROM users ORDER BY id DESC LIMIT 2").all().at(1).id;
    });
    after(() => {
      app.locals.fieldRooms?.shutdown();
      app.locals.liveDocs?.shutdown();
      server.closeAllConnections?.();
      server.close();
    });

    const log = (activityId, group, engagement, timing, extra = {}) => j(`/api/activities/${activityId}/runs`, { method: "POST", headers: auth(tok), body: JSON.stringify({ ranOn: new Date().toISOString().slice(0, 10), groupLabel: group, engagement, ...(timing ? { timing } : {}), ...extra }) });

    it("נתיב ה-DNA: דורש התחברות, ריק בלי יומן, ומחשב לפי קבוצה מהיומן הפרטי בלבד", async () => {
      assert.equal((await j("/api/lux/dna")).status, 401);
      const empty = await j("/api/lux/dna", { headers: auth(tok) });
      assert.equal(empty.status, 200);
      assert.equal(empty.body.dna.ready, false);
      assert.deepEqual(empty.body.groups, []);
      const [a1, a2] = db.prepare("SELECT id FROM activities WHERE status = 'PUBLISHED' ORDER BY id LIMIT 2").all().map((r) => r.id);
      db.prepare("UPDATE activities SET energetic_mode = 1, methods_json = ? WHERE id = ?").run(JSON.stringify([{ name: "משחק תנועה" }]), a1);
      db.prepare("UPDATE activities SET energetic_mode = 0, methods_json = ? WHERE id = ?").run(JSON.stringify([{ name: "הרצאה" }]), a2);
      for (let i = 0; i < 3; i++) {
        assert.equal((await log(a1, "שכבה ו׳", 3, "long", { worked: "משחק ותנועה" })).status, 201);
        assert.equal((await log(a2, "שכבה ו׳", 1, "long", { changeNext: "יותר מדי דיבור" })).status, 201);
      }
      assert.equal((await log(a2, "שכבה ח׳", 3)).status, 201);
      const all = (await j("/api/lux/dna", { headers: auth(tok) })).body;
      assert.equal(all.dna.ready, true);
      assert.equal(all.dna.energy.pref, "high");
      assert.deepEqual(all.groups.map((g) => g.label).sort(), ["שכבה ו׳", "שכבה ח׳"]);
      const six = (await j(`/api/lux/dna?group=${encodeURIComponent("שכבה ו׳")}`, { headers: auth(tok) })).body;
      assert.equal(six.dna.runs, 6);
      const eight = (await j(`/api/lux/dna?group=${encodeURIComponent("שכבה ח׳")}`, { headers: auth(tok) })).body;
      assert.equal(eight.dna.ready, false, "הפעלה אחת בלבד");
      // פרטיות: מדריך אחר לא רואה את היומן
      const other = (await j("/api/lux/dna", { headers: auth(tok2) })).body;
      assert.equal(other.dna.runs, 0);
      assert.deepEqual(other.groups, []);
      assert.equal(typeof dna.dnaFor(db, uid).hint, "string");
    });

    it("מעוז, הטיוטה והסימולטור מקבלים dna בלי לשבור: מחובר, אורח, וערך לא תקין", async () => {
      const ask = (t, body) => j("/api/lux/eagle/ask", { method: "POST", headers: t ? auth(t) : {}, body: JSON.stringify(body) });
      assert.equal((await ask(tok, { q: "רעיון למשחק קצר לשכבה ו", dna: "*" })).status, 200);
      assert.equal((await ask(tok, { q: "רעיון למשחק קצר לשכבה ו", dna: "שכבה ו׳" })).status, 200);
      assert.equal((await ask(null, { q: "רעיון למשחק קצר לשכבה ו", dna: "*" })).status, 200, "אורח: מתעלמים");
      assert.equal((await ask(tok, { q: "רעיון למשחק קצר", dna: "x".repeat(61) })).status, 400);
      assert.equal((await ask(tok, { q: "רעיון למשחק קצר", extra: 1 })).status, 400, "הסכמה נשארה מחמירה");
      const spar = await j("/api/lux/spar/turn", { method: "POST", headers: auth(tok), body: JSON.stringify({ scenario: SCENARIOS[0].id, history: [], leader: "", dna: "*" }) });
      assert.equal(spar.status, 200);
      const draft = await j("/api/lux/eagle/draft", { method: "POST", headers: auth(tok), body: JSON.stringify({ title: "חברות אמיתית", dna: "*" }) });
      assert.equal(draft.status, 201);
    });

    it("הסימולטור והטיוטה מעבירים ל-AI את משפט הפרופיל (ורק אותו), ובלי פרופיל אין שדה כזה", async () => {
      const seen = [];
      const router = { chat: async (o) => (seen.push(o), { text: JSON.stringify({ replies: [{ persona: SCENARIOS[0].personas[0], text: "בסדר" }], tip: "טיפ קצר וטוב למדריך" }) }) };
      const p = { scenario: SCENARIOS[0].id, history: [], leader: "שלום חבר׳ה", finish: false };
      const local = localTurn(p);
      await aiTurn(router, { ...p, dnaHint: "פרופיל הקבוצה: אנרגטית" }, local);
      await aiTurn(router, p, local);
      assert.equal(JSON.parse(seen[0].user).groupProfile, "פרופיל הקבוצה: אנרגטית");
      assert.match(seen[0].system, /groupProfile/);
      assert.equal("groupProfile" in JSON.parse(seen[1].user), false);
      const blocks = [{ kind: "open", title: "פתיחה", minutes: 5 }, { kind: "body", title: "גוף", minutes: 20 }, { kind: "peak", title: "שיא", minutes: 10 }, { kind: "close", title: "סיכום", minutes: 5 }];
      const input = { title: "אומץ", ageGroup: "", value: "", minutes: 40, groupProfile: "פרופיל הקבוצה: רגועה" };
      const loc = localDraft(input, blocks, {});
      const router2 = { chat: async (o) => (seen.push(o), { text: "{}" }) };
      await aiDraft(router2, input, blocks, loc);
      assert.equal(JSON.parse(seen[2].user).groupProfile, "פרופיל הקבוצה: רגועה");
    });

    it("RAG: תוצאות כוללות energetic, והתאמה לפרופיל לא מוסיפה ולא מוחקת תוצאות", () => {
      const rag = createRag(db);
      const plain = rag.search(["משחק"], { limit: 6 });
      assert.ok(plain.hits.length > 0);
      assert.ok(plain.hits.every((h) => "energetic" in h));
      const rows = Array.from({ length: 6 }, (_, i) => row({ engagement: i < 3 ? 3 : 1, energetic: i < 3 ? 1 : 0, methods: ["משחק תנועה"] }));
      const tuned = rag.search(["משחק"], { limit: 6, dna: dna.computeDna(rows) });
      // ההתאמה משנה סדר בתוך מאגר המועמדים (פי 3 מהמבוקש), ולכן אין תוצאות חדשות מחוץ לו ואין פחות תוצאות
      const pool = new Set(rag.search(["משחק"], { limit: 18 }).hits.map((h) => h.ref));
      assert.equal(tuned.hits.length, plain.hits.length);
      assert.ok(tuned.hits.every((h) => pool.has(h.ref)));
      rag.close();
    });
  });
});

// ───────────────────────── 70ו. מגבלת קצב לפי משתמש ─────────────────────────
describe("70ו. מגבלת קצב: משתמש מחובר נספר לפי עצמו, לא לפי כתובת", () => {
  it("ברירות המחדל נדיבות לשבט על אותו NAT", () => {
    assert.deepEqual(config.rate, { read: 1200, readAnon: 600, write: 240, writeAnon: 90 });
  });

  it("שני מדריכים מאותה כתובת לא חוסמים זה את זה, ואורח נספר בנפרד", async () => {
    const saved = { ...config.rate };
    const env = config.nodeEnv;
    const db = openDb(":memory:");
    seedIfEmpty(db);
    ensureAdmin(db);
    config.rate.read = 60;
    config.rate.readAnon = 60;
    const app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });
    const server = app.listen(0);
    const base = `http://localhost:${server.address().port}`;
    const j = (path, opts = {}) => fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    const reg = async () => (await (await j("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "r70" + Math.random().toString(36).slice(2, 8), password: "Str0ng!Passw0rd", displayName: "בודק", acceptTerms: true, signupCode: "shevet-code" }) })).json()).token;
    try {
      const A = await reg();
      const B = await reg();
      config.nodeEnv = "development"; // המגבלה כבויה בבדיקות; מדליקים אותה רק לחלון הזה
      const hit = async (t) => {
        let blocked = 0;
        for (let i = 0; i < 70; i++) if ((await j("/api/write/templates", { headers: t ? { authorization: `Bearer ${t}` } : {} })).status === 429) blocked++;
        return blocked;
      };
      assert.ok((await hit(A)) >= 9, "משתמש A חוצה את המגבלה שלו");
      assert.equal((await j("/api/write/templates", { headers: { authorization: `Bearer ${B}` } })).status, 200, "משתמש B מאותה כתובת לא נחסם");
      assert.equal((await j("/api/write/templates")).status, 200, "אורח מאותה כתובת לא נחסם בגלל A");
      assert.ok((await hit(null)) >= 9, "אורחים נספרים לפי כתובת");
    } finally {
      config.nodeEnv = env;
      Object.assign(config.rate, saved);
      server.closeAllConnections?.();
      server.close();
    }
  });
});

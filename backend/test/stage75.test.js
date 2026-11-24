// שלב 75: עוזר הכתיבה והעורך (20 שדרוגים).
// הלוגיקה הטהורה של הלקוח (frontend/src/lib/write75.ts) נבדקת ישירות, והשרת (מגבלות, וואטסאפ, תבניות, נעילה, "טרם נבדק") מול שרת אמיתי.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.SIGNUP_CODE = "shevet-code";
process.env.API_READ_LIMIT = "1000000";
process.env.API_WRITE_LIMIT = "1000000";

const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { seedIfEmpty } = await import("../src/seed.js");
const { ensureAdmin } = await import("../src/auth.js");
const { createMailer } = await import("../src/email.js");
const { createLiveDocs, LOCK_MS } = await import("../src/lux-presence.js");
const S = await import("../src/write75.js");
const W = await import("../../frontend/src/lib/write75.ts");
const M = await import("../../frontend/src/lib/blockmerge.ts");
const { parseSse } = await import("../../frontend/src/lib/field.ts");

const blk = (id, text = "", over = {}) => ({ id, title: "", kind: "body", minutes: null, text, note: "", ...over });
const key = (o) => ({ key: "", code: "", ctrl: false, alt: false, shift: false, typing: true, ...o });
const words = (n, seed = 0) => Array.from({ length: n }, (_, i) => `מילה${String.fromCharCode(1488 + ((i + seed) % 26))}${String.fromCharCode(1488 + ((i * 7 + seed) % 26))}${i}`).join(" ");

// ───────────────────────── 18. מגבלות והודעות ברורות ─────────────────────────
describe("75.18 מגבלות: הודעות ברורות", () => {
  const scenarios = {
    "שלב ארוך מדי": { title: "x", blocks: [blk("a", "א".repeat(20001))] },
    "יותר מ-60 שלבים": { title: "x", blocks: Array.from({ length: 61 }, (_, i) => blk("b" + i)) },
    "כותרת מסמך": { title: "ש".repeat(121), blocks: [blk("a")] },
    "כותרת שלב": { title: "x", blocks: [blk("a", "", { title: "כ".repeat(121) })] },
    "הערה": { title: "x", blocks: [blk("a", "", { note: "ה".repeat(5001) })] },
    "גודל מסמך": { title: "x", blocks: Array.from({ length: 30 }, (_, i) => blk("c" + i, "א".repeat(15000))) },
    "תקין": { title: "x", blocks: [blk("a", "שלום")] },
  };
  for (const [name, snap] of Object.entries(scenarios)) {
    it(`אותו נוסח בלקוח ובשרת: ${name}`, () => {
      assert.deepEqual(S.limitProblemsOf(snap), W.limitProblems(snap));
    });
  }
  it("ההודעה אומרת איזה שלב, כמה תווים ומה עושים", () => {
    const p = W.limitProblems(scenarios["שלב ארוך מדי"])[0];
    assert.equal(p.code, "BLOCK_TEXT");
    assert.equal(p.block, 1);
    assert.match(p.message, /שלב 1 ארוך מדי: 20,001 תווים, ואפשר עד 20,000/);
    assert.match(p.message, /פיצול/);
    assert.match(W.limitProblems(scenarios["יותר מ-60 שלבים"])[0].message, /יש 61 שלבים, ואפשר עד 60/);
    assert.equal(W.limitProblems(scenarios["תקין"]).length, 0);
  });
  it("השרת לא קורס על גוף משובש", () => {
    assert.deepEqual(S.limitProblemsOf(null), []);
    assert.deepEqual(S.limitProblemsOf({ blocks: "x" }), []);
    assert.deepEqual(S.limitProblemsOf({ blocks: [null, 5, { text: 7 }] }), []);
  });
  it("מונה: כתום מ-90%, אדום מעבר למגבלה", () => {
    assert.equal(W.limitLevel(100, 1000), "ok");
    assert.equal(W.limitLevel(900, 1000), "near");
    assert.equal(W.limitLevel(1000, 1000), "near");
    assert.equal(W.limitLevel(1001, 1000), "over");
    assert.equal(W.limitText(18420, 20000), "18,420 מתוך 20,000 תווים");
    assert.equal(W.blocksLeft(58), 2);
    assert.equal(W.blocksLeft(70), 0);
  });
});

// ───────────────────────── 4. קיצורי מקלדת ─────────────────────────
describe("75.4 קיצורי מקלדת", () => {
  it("Ctrl+S עובד במקלדת עברית (key='ס', code=KeyS)", () => {
    assert.deepEqual(W.shortcutAction(key({ ctrl: true, key: "ס", code: "KeyS" })), { action: "save" });
    assert.deepEqual(W.shortcutAction(key({ ctrl: true, key: "ז", code: "KeyZ" })), { action: "undo" });
    assert.deepEqual(W.shortcutAction(key({ ctrl: true, key: "י", code: "KeyY" })), { action: "redo" });
    assert.deepEqual(W.shortcutAction(key({ ctrl: true, shift: true, key: "Z", code: "KeyZ" })), { action: "redo" });
  });
  it("Ctrl+Alt הוא AltGr בווינדוס ולכן לא מופעל; Alt+Shift מחליף שפה ולכן גם לא", () => {
    assert.equal(W.shortcutAction(key({ ctrl: true, alt: true, key: "s", code: "KeyS" })), null);
    assert.equal(W.shortcutAction(key({ alt: true, shift: true, key: "ArrowUp", code: "ArrowUp" })), null);
  });
  it("תנועה בין שלבים והזזה", () => {
    assert.deepEqual(W.shortcutAction(key({ alt: true, key: "ArrowUp" })), { action: "moveUp" });
    assert.deepEqual(W.shortcutAction(key({ alt: true, key: "ArrowDown" })), { action: "moveDown" });
    assert.deepEqual(W.shortcutAction(key({ alt: true, key: "PageUp" })), { action: "prevBlock" });
    assert.deepEqual(W.shortcutAction(key({ alt: true, key: "PageDown" })), { action: "nextBlock" });
    assert.deepEqual(W.shortcutAction(key({ alt: true, key: "3", code: "Digit3" })), { action: "goto", n: 3 });
    assert.equal(W.shortcutAction(key({ alt: true, key: "0", code: "Digit0" })), null);
  });
  it("מקשים עם Ctrl+Shift", () => {
    const a = (code) => W.shortcutAction(key({ ctrl: true, shift: true, code }))?.action;
    assert.equal(a("KeyH"), "find");
    assert.equal(a("KeyF"), "focus");
    assert.equal(a("KeyE"), "preview");
    assert.equal(a("KeyL"), "readAloud");
    assert.equal(a("KeyD"), "dup");
    assert.deepEqual(W.shortcutAction(key({ ctrl: true, key: "Enter", code: "Enter" })), { action: "newBlock" });
  });
  it("'?' פותח את העזרה רק מחוץ לשדה טקסט; Ctrl+/ תמיד", () => {
    assert.deepEqual(W.shortcutAction(key({ key: "?", shift: true, code: "Slash", typing: false })), { action: "help" });
    assert.equal(W.shortcutAction(key({ key: "?", shift: true, code: "Slash", typing: true })), null, "בתוך טקסט '?' הוא תו");
    assert.deepEqual(W.shortcutAction(key({ ctrl: true, key: "/", code: "Slash", typing: true })), { action: "help" });
  });
  it("לוח הקיצורים: בלי כפילויות, וכל פעולה מופיעה", () => {
    const keys = W.SHORTCUTS75.map((s) => s.keys);
    assert.equal(new Set(keys).size, keys.length);
    for (const a of ["save", "undo", "redo", "bold", "italic", "newBlock", "dup", "moveUp", "prevBlock", "goto", "find", "focus", "preview", "readAloud", "help"]) assert.ok(W.SHORTCUTS75.some((s) => s.action === a), a);
  });
});

// ───────────────────────── 5. פקודות / ─────────────────────────
describe("75.5 פקודות / להוספת שלבים", () => {
  it("מזהה שורת פקודה לפי מיקום הסמן, ולא באמצע משפט", () => {
    assert.deepEqual(W.slashAt("/משח", 4), { start: 0, end: 4, query: "משח", arg: "" });
    assert.equal(W.slashAt("שלום /משח", 9), null);
    assert.deepEqual(W.slashAt("שורה ראשונה\n  /דקות 12", 22), { start: 12, end: 22, query: "דקות", arg: "12" });
    assert.equal(W.slashAt("שורה ראשונה\n/דקות 12", 3), null, "הסמן בשורה אחרת");
    assert.equal(W.slashAt("http://x.co", 11), null);
    assert.equal(W.slashAt("", 0), null);
  });
  it("סינון: תחילת מילה בעברית או באנגלית, ובלי מחרוזת מציגים הכול", () => {
    assert.equal(W.matchSlash("").length, W.SLASH_COMMANDS.length);
    assert.deepEqual(W.matchSlash("משח").map((c) => c.id), ["game"]);
    assert.deepEqual(W.matchSlash("sum").map((c) => c.id), ["summary"]);
    assert.deepEqual(W.matchSlash("zzz"), []);
    assert.ok(W.matchSlash("ד").some((c) => c.id === "minutes"));
  });
  it("התוכנית של כל פקודה", () => {
    assert.deepEqual(W.slashPlan("game", "כדורשער"), { type: "add", block: { kind: "body", title: "משחק: כדורשער", minutes: 10, hint: "כללים בשלושה משפטים: מי משחק, מה עושים ואיך מנצחים" } });
    assert.equal(W.slashPlan("summary", "").block.kind, "close");
    assert.equal(W.slashPlan("summary", "").block.minutes, 5);
    assert.equal(W.slashPlan("stage", "").block.title, "");
    assert.deepEqual(W.slashPlan("minutes", "12"), { type: "minutes", minutes: 12 });
    assert.equal(W.slashPlan("minutes", "").type, "error");
    assert.equal(W.slashPlan("minutes", "999").type, "error");
    assert.equal(W.slashPlan("unchecked", "").flag, "unchecked");
    assert.equal(W.slashPlan("note", "").type, "note");
  });
  it("מחיקת שורת הפקודה מהטקסט ומיקום הסמן", () => {
    assert.deepEqual(W.stripRange("אחד\n/שלב\nשלוש", 4, 8), { text: "אחד\nשלוש", caret: 4 });
    assert.deepEqual(W.stripRange("אחד\n/שלב", 4, 8), { text: "אחד", caret: 3 });
    assert.deepEqual(W.stripRange("/שלב", 0, 4), { text: "", caret: 0 });
  });
});

// ───────────────────────── 7. מד זמן חי ─────────────────────────
describe("75.7 מד הזמן החי", () => {
  const bl = (...m) => m.map((x, i) => blk("t" + i, "טקסט", { minutes: x }));
  it("צבעים: תקין, קרוב, חריגה וחסר", () => {
    assert.equal(W.timeMeter(bl(20, 25), 45).level, "ok");
    assert.equal(W.timeMeter(bl(20, 26), 45).level, "ok", "סטייה של דקה בתוך הסבילות");
    assert.equal(W.timeMeter(bl(20, 30), 45).level, "near");
    assert.equal(W.timeMeter(bl(40, 30), 45).level, "over");
    assert.equal(W.timeMeter(bl(10, 10), 45).level, "under");
    assert.equal(W.timeMeter(bl(20, 25), 45).label, "בדיוק 45 דקות, כמו שתוכנן");
  });
  it("תוויות וחישובים", () => {
    const over = W.timeMeter(bl(40, 30), 45);
    assert.equal(over.diff, 25);
    assert.match(over.label, /25 דקות מעבר לתכנון \(70 מתוך 45\)/);
    assert.equal(over.pct, 100);
    assert.match(W.timeMeter(bl(10, 10), 45).label, /חסרות 25 דקות/);
    assert.equal(W.timeMeter(bl(null, null), 45).level, "empty");
    assert.equal(W.timeMeter(bl(20, 25), null).level, "ok");
    assert.equal(W.timeMeter(bl(20, 25), 0).planned, null);
  });
  it("שלבים בלי משך נספרים, והחלקים מסתכמים ל-1", () => {
    const m = W.timeMeter([blk("a", "יש טקסט", { minutes: 10 }), blk("b", "גם כאן יש טקסט"), blk("c", "", { minutes: 30 })], 40);
    assert.equal(m.missing, 1);
    assert.ok(Math.abs(m.parts.reduce((s, p) => s + p.share, 0) - 1) < 1e-9);
  });
});

// ───────────────────────── 8. בדיקת סגנון בעברית ─────────────────────────
describe("75.8 בדיקת סגנון", () => {
  const LONG = "אנחנו נפגשים בבוקר ליד השער הגדול ואחר כך הולכים יחד אל המגרש הירוק שבקצה היישוב כדי לשחק משחק חדש עם כל החברים מהשכבה הצעירה וגם מהשכבה הבוגרת.";
  const check = (text, opts) => W.styleCheck([{ id: "x", title: "", text }], opts);
  it("משפט ארוך מסומן עם מיקום מדויק, וקצר לא", () => {
    const text = `פתיחה קצרה. ${LONG} סוף.`;
    const hits = check(text).filter((i) => i.kind === "long");
    assert.equal(hits.length, 1);
    assert.equal(text.slice(hits[0].start, hits[0].end), LONG);
    assert.match(hits[0].message, /27 מילים/);
    assert.equal(check("משפט קצר אחד. ועוד אחד.").length, 0);
    assert.equal(check(LONG, { maxWords: 40 }).filter((i) => i.kind === "long").length, 0);
  });
  it("חזרות: שלוש פעמים בקטע קצר, ומילה כפולה ברצף", () => {
    const rep = check("הכדור עף, הכדור נפל, הכדור קפץ").filter((i) => i.kind === "repeat");
    assert.equal(rep.length, 1);
    assert.equal(rep[0].text, "הכדור");
    assert.equal(check("הכדור עף, הכדור נפל").filter((i) => i.kind === "repeat").length, 0);
    const dbl = check("אנחנו הולכים הולכים הביתה").filter((i) => i.kind === "double");
    assert.equal(dbl.length, 1);
    assert.equal(dbl[0].suggest, "הולכים");
    assert.equal(check("הולכים. הולכים").filter((i) => i.kind === "double").length, 0, "נקודה ביניהם: לא כפילות");
  });
  it("שלושה משפטים ברצף שפותחים באותה מילה", () => {
    const t = "אנחנו רצים בשדה היום. אנחנו קופצים מעל המכשולים. אנחנו שרים שיר ארוך.";
    const o = check(t).filter((i) => i.kind === "opener");
    assert.equal(o.length, 1);
    assert.equal(check("אנחנו רצים בשדה היום. אנחנו קופצים מעל המכשולים. הם שרים שיר ארוך.").filter((i) => i.kind === "opener").length, 0);
  });
  it("קבוצה מעורבת: לשון זכר בלבד מסומנת, ופנייה לשני המינים לא", () => {
    const g = (t, mode = "mixed") => check(t, { mode }).filter((i) => i.kind === "gender");
    assert.equal(g("כל החניכים מגיעים.").length, 1);
    assert.equal(g("כל החניכים מגיעים.")[0].suggest, "החניכים וחניכות");
    assert.equal(g("החניכים וחניכות מגיעים.").length, 0);
    assert.equal(g("החניכות והחניכים מגיעים.").length, 0);
    assert.equal(g("כל אחד וכל אחת בוחרים.").length, 0);
    assert.equal(g("כל אחד בוחר.").length, 1);
    assert.equal(g("בנו מבנים גדולים.").length, 0, "מבנים היא מילה אחרת מ'בנים'");
    assert.equal(g("לחניכים ולחניכות שלום.").length, 0);
    const lead = g("שלום לחניכים.")[0];
    assert.equal(lead.suggest, "לחניכים וחניכות");
  });
  it("קבוצת בנים או בנות, ובלי קבוצה", () => {
    assert.equal(check("החניכות מגיעות.", { mode: "boys" }).filter((i) => i.kind === "gender").length, 1);
    assert.equal(check("החניכים מגיעים.", { mode: "boys" }).filter((i) => i.kind === "gender").length, 0);
    assert.equal(check("החניכים מגיעים.", { mode: "girls" }).filter((i) => i.kind === "gender").length, 1);
    assert.equal(check("החניכים מגיעים.", { mode: null }).filter((i) => i.kind === "gender").length, 0);
    assert.equal(W.genderMode("כיתה ח' - מעורב"), "mixed");
    assert.equal(W.genderMode("כיתה ד' - בנים"), "boys");
    assert.equal(W.genderMode("כיתה ד' - בנות"), "girls");
    assert.equal(W.genderMode(""), null);
    assert.equal(W.genderMode(undefined), null);
  });
  it("המיקום של כל ממצא בתוך טקסט השלב, ומיון לפי שלב ומיקום", () => {
    const blocks = [{ id: "a", title: "", text: "כל החניכים מגיעים." }, { id: "b", title: "", text: `פתיחה. ${LONG}` }];
    const all = W.styleCheck(blocks, { mode: "mixed" });
    for (const i of all) assert.ok(i.start >= 0 && i.end > i.start && i.end <= blocks[i.b].text.length);
    assert.deepEqual(all.map((i) => i.b), [...all.map((i) => i.b)].sort((x, y) => x - y));
  });
  it("משפטים: מיקומים מדויקים וסימוני Markdown לא נספרים", () => {
    const t = "## כותרת\n- ראשון. שני!\nשלישי?";
    const sp = W.sentenceSpans(t);
    assert.deepEqual(sp.map((s) => s.text), ["כותרת", "ראשון.", "שני!", "שלישי?"]);
    for (const s of sp) assert.equal(t.slice(s.start, s.end), s.text);
  });
});

// ───────────────────────── 11. חיפוש והחלפה ─────────────────────────
describe("75.11 חיפוש והחלפה בכל המסמך", () => {
  const doc = [blk("a", "החניך לחניך חניכים. חניך!", { title: "חניך ראשון", note: "סוד על חניך" }), blk("b", "Scout scout SCOUT")];
  it("תת-מחרוזת, אותיות גדולות וקטנות, ומשתנה לפי matchCase", () => {
    assert.equal(W.findAll(doc, "scout").length, 3);
    assert.equal(W.findAll(doc, "scout", { matchCase: true }).length, 1);
    assert.equal(W.findAll(doc, "חניך").length, 4, "בכותרת ובטקסט; 'חניכים' כתובה עם כ רגילה ולכן אינה התאמה");
  });
  it("מילה שלמה: בלי קידומת רק עומדת בפני עצמה, ועם קידומות גם ה-ל וכדומה, והשורש בלבד מוחלף", () => {
    const whole = W.findAll(doc, "חניך", { whole: true });
    assert.equal(whole.length, 2, "'חניך!' ו'חניך ראשון' בכותרת, בלי 'החניך' ו'לחניך'");
    const pre = W.findAll(doc, "חניך", { whole: true, prefixes: true });
    assert.equal(pre.length, 4);
    assert.ok(pre.every((h) => h.hit === "חניך"));
    const r = W.replaceAllHits(doc, "חניך", "משתתף", { whole: true, prefixes: true });
    assert.equal(r.count, 4);
    assert.equal(r.blocks[0].text, "המשתתף למשתתף חניכים. משתתף!");
    assert.equal(r.blocks[0].title, "משתתף ראשון");
    assert.equal(r.touched, 1);
    assert.equal(doc[0].text, "החניך לחניך חניכים. חניך!", "המקור לא משתנה");
  });
  it("חיפוש בהערות רק כשביקשו, ושלב אחד בלבד", () => {
    assert.equal(W.findAll(doc, "סוד").length, 0);
    assert.equal(W.findAll(doc, "סוד", { fields: ["note"] }).length, 1);
    assert.equal(W.findAll(doc, "scout", { onlyBlock: "a" }).length, 0);
    assert.equal(W.findAll(doc, "scout", { onlyBlock: "b" }).length, 3);
  });
  it("תווים מיוחדים והחלפה עם $ נשמרים כמו שהם", () => {
    const d = [blk("x", "מחיר (10$) ועוד (10$)")];
    assert.equal(W.findAll(d, "(10$)").length, 2);
    assert.equal(W.replaceAllHits(d, "(10$)", "$& $1").blocks[0].text, "מחיר $& $1 ועוד $& $1");
    assert.deepEqual(W.findAll(d, ""), []);
  });
  it("החלפת מופע אחד בלבד, והקשר סביב ההתאמה", () => {
    const hits = W.findAll(doc, "scout", { onlyBlock: "b" });
    const one = W.replaceOneHit(doc, hits[1], "צופה");
    assert.equal(one[1].text, "Scout צופה SCOUT");
    assert.equal(hits[0].before, "");
    assert.equal(hits[0].after, " scout SCOUT");
  });
  it("אין מחזור אינסופי בביטוי שיכול להתאים ריק", () => {
    assert.deepEqual(W.findAll([blk("a", "abc")], "x*"), [], "x* מוברח כטקסט, ואין בו כוכבית");
  });
});

// ───────────────────────── 1. היסטוריית ביטול לכל שלב ─────────────────────────
describe("75.1 ביטול ושחזור לכל שלב", () => {
  const cur = (text, title = "") => ({ title, text });
  const typed = () => {
    let h = {};
    h = W.histRecord(h, "a", cur(""), 0);
    for (const [t, at] of [["ש", 100], ["של", 200], ["שלו", 300]]) h = W.histRecord(h, "a", cur(t), at);
    h = W.histRecord(h, "a", cur("שלום"), 5000);
    return h;
  };
  it("הקלדה רציפה היא פעימה אחת, והפסקה פותחת פעימה חדשה", () => {
    const h = typed();
    assert.deepEqual(h.a.stack.map((e) => e.text), ["", "שלו"]);
    assert.equal(h.a.last.text, "שלום");
  });
  it("ביטול חוזר לפעימה הקודמת, ושחזור מחזיר", () => {
    let h = typed();
    let r = W.histUndo(h, "a", cur("שלום"), 6000);
    assert.equal(r.apply.text, "שלו");
    r = W.histUndo(r.state, "a", cur("שלו"), 6100);
    assert.equal(r.apply.text, "");
    h = r.state;
    assert.equal(W.histUndo(h, "a", cur(""), 6200).apply, null, "אין עוד מה לבטל");
    const re = W.histRedo(h, "a", cur(""), 6300);
    assert.equal(re.apply.text, "שלו");
    assert.equal(W.histRedo(re.state, "a", cur("שלו"), 6400).apply.text, "שלום");
  });
  it("עריכה חדשה אחרי ביטול מנקה את השחזור", () => {
    const r = W.histUndo(typed(), "a", cur("שלום"), 6000);
    const h = W.histRecord(r.state, "a", cur("שלו!"), 6100);
    assert.equal(h.a.redo.length, 0);
    assert.equal(W.histRedo(h, "a", cur("שלו!"), 6200).apply, null);
  });
  it("הביטול מסנכרן שינוי שעוד לא נרשם", () => {
    let h = W.histRecord({}, "a", cur("אחד"), 0);
    h = W.histRecord(h, "a", cur("אחד שניים"), 100);
    const r = W.histUndo(h, "a", cur("אחד שניים שלושה"), 150);
    assert.equal(r.apply.text, "אחד");
  });
  it("רשימת מצבים קודמים ושחזור מהרשימה (גם הוא ניתן לביטול)", () => {
    const h = typed();
    assert.deepEqual(W.histList(h, "a").map((e) => e.text), ["שלו", ""]);
    const r = W.histRestore(h, "a", 1, cur("שלום"), 7000);
    assert.equal(r.apply.text, "");
    const back = W.histUndo(r.state, "a", cur(""), 7100);
    assert.equal(back.apply.text, "שלום", "אפשר לבטל את השחזור");
    assert.equal(W.histRestore(h, "a", 9, cur("x"), 0).apply, null);
  });
  it("הכותרת נשמרת יחד עם הטקסט", () => {
    let h = W.histRecord({}, "a", cur("א", "כותרת"), 0);
    h = W.histRecord(h, "a", cur("אב", "כותרת חדשה"), 100);
    assert.deepEqual(W.histUndo(h, "a", cur("אב", "כותרת חדשה"), 200).apply, { title: "כותרת", text: "א" });
  });
  it("תקרה של 40 מצבים לשלב, וניקוי שלבים שנמחקו וגודל כולל", () => {
    let h = {};
    for (let i = 0; i < 80; i++) h = W.histRecord(h, "a", cur("טקסט " + i), i * 5000);
    assert.equal(h.a.stack.length, W.HIST_MAX);
    h = W.histRecord(h, "gone", cur("א"), 0);
    h = W.histRecord(h, "gone", cur("אב"), 10);
    assert.deepEqual(Object.keys(W.histTrim(h, ["a"])), ["a"]);
    let big = {};
    for (const id of ["p", "q"]) {
      big = W.histRecord(big, id, cur("x".repeat(20000)), 0);
      for (let i = 1; i <= 20; i++) big = W.histRecord(big, id, cur("x".repeat(20000 - i)), i * 5000);
    }
    const trimmed = W.histTrim(big, ["p", "q"]);
    const total = Object.values(trimmed).reduce((s, e) => s + e.stack.reduce((a, x) => a + x.text.length, 0), 0);
    assert.ok(total <= W.HIST_CHARS, `${total}`);
  });
  it("טעינה מאחסון משובש לא קורסת ומסננת רשומות לא תקינות", () => {
    assert.deepEqual(W.histParse(null), {});
    assert.deepEqual(W.histParse("{bad"), {});
    assert.deepEqual(W.histParse("[1,2]"), {});
    const ok = W.histParse(JSON.stringify({ a: { stack: [{ at: 1, title: "", text: "א" }, { bad: true }], redo: [], last: { title: "", text: "ב" } }, b: 5 }));
    assert.equal(ok.a.stack.length, 1);
    assert.equal(ok.b, undefined);
  });
});

// ───────────────────────── 2. שמירה מקומית ושחזור ─────────────────────────
describe("75.2 שחזור נוסח מקומי מול השרת", () => {
  const snap = (blocks, title = "פעולה") => ({ title, meta: { minutes: 45 }, blocks });
  const merge = { blocks: M.mergeBlocks, fields: M.mergeFields };
  const base = snap([blk("a", "א"), blk("b", "ב"), blk("c", "ג")]);
  it("אין נוסח, או נוסח זהה לשרת: אין מה לשחזר", () => {
    assert.equal(W.recoveryPlan(null, { rev: 3, snap: base }, merge).kind, "none");
    assert.equal(W.recoveryPlan({ rev: 3, snap: base }, { rev: 3, snap: base }, merge).kind, "none");
  });
  it("אותה גרסה בשרת: משחזרים את מה שהקלדתי", () => {
    const mine = snap([blk("a", "א חדש"), blk("b", "ב"), blk("c", "ג")]);
    const r = W.recoveryPlan({ rev: 3, snap: mine, base }, { rev: 3, snap: base }, merge);
    assert.equal(r.kind, "restore");
    assert.equal(r.snap.blocks[0].text, "א חדש");
  });
  it("השרת התקדם בינתיים: ממזגים ברמת שלב, ולא מוחקים את מה שהקלדתי (היה נמחק קודם)", () => {
    const mine = snap([blk("a", "א שלי"), blk("b", "ב"), blk("c", "ג")]);
    const theirs = snap([blk("a", "א"), blk("b", "ב שלהם"), blk("c", "ג"), blk("d", "חדש מהם")]);
    const r = W.recoveryPlan({ rev: 3, snap: mine, base }, { rev: 5, snap: theirs }, merge);
    assert.equal(r.kind, "merge");
    assert.deepEqual(r.snap.blocks.map((b) => b.text), ["א שלי", "ב שלהם", "ג", "חדש מהם"]);
    assert.deepEqual(r.conflicts, []);
    assert.equal(r.mineChanged, 1);
  });
  it("אותו שלב נערך משני הצדדים: הנוסח שלי נשאר, והשלב מדווח כהתנגשות", () => {
    const mine = snap([blk("a", "א שלי"), blk("b", "ב"), blk("c", "ג")]);
    const theirs = snap([blk("a", "א שלהם"), blk("b", "ב"), blk("c", "ג")]);
    const r = W.recoveryPlan({ rev: 3, snap: mine, base }, { rev: 4, snap: theirs }, merge);
    assert.equal(r.kind, "merge");
    assert.equal(r.snap.blocks[0].text, "א שלי");
    assert.deepEqual(r.conflicts, ["a"]);
  });
  it("כותרת ומטא ממוזגות לפי מי ששינה", () => {
    const mine = { title: "כותרת שלי", meta: { minutes: 45 }, blocks: base.blocks };
    const theirs = { title: "פעולה", meta: { minutes: 60 }, blocks: base.blocks };
    const r = W.recoveryPlan({ rev: 3, snap: mine, base }, { rev: 4, snap: theirs }, merge);
    assert.equal(r.snap.title, "כותרת שלי");
    assert.equal(r.snap.meta.minutes, 60);
  });
  it("בלי נקודת מוצא (מאגר ישן) לא מוחקים: מציעים לבחור", () => {
    const mine = snap([blk("a", "א שלי"), blk("b", "ב"), blk("c", "ג")]);
    const r = W.recoveryPlan({ rev: 3, snap: mine }, { rev: 9, snap: base }, merge);
    assert.equal(r.kind, "conflict");
    assert.equal(r.reason, "no-base");
    assert.equal(r.mine.blocks[0].text, "א שלי");
  });
  it("אם אחרי המיזוג אין הבדל מהשרת, אין מה להציע", () => {
    const theirs = snap([blk("a", "א שלי"), blk("b", "ב"), blk("c", "ג")]);
    const mine = snap([blk("a", "א שלי"), blk("b", "ב"), blk("c", "ג")]);
    assert.equal(W.recoveryPlan({ rev: 3, snap: mine, base }, { rev: 4, snap: theirs }, merge).kind, "none");
  });
});

// ───────────────────────── 13. השוואה צד-לצד ─────────────────────────
describe("75.13 השוואת גרסאות צד-לצד", () => {
  const snap = (blocks, title = "פעולה") => ({ title, meta: {}, blocks });
  it("סימון נוסף, הוסר, שונה והוזז, בסדר של הגרסה החדשה", () => {
    const a = snap([blk("a", "אחד"), blk("b", "שניים"), blk("c", "שלושה"), blk("z", "ישן")]);
    const b = snap([blk("c", "שלושה"), blk("a", "אחד ועוד"), blk("b", "שניים"), blk("n", "חדש")]);
    const c = W.compareDocs(a, b);
    assert.deepEqual(c.rows.map((r) => [r.key, r.status]), [["c", "moved"], ["z", "removed"], ["a", "changed"], ["b", "same"], ["n", "added"]]);
    assert.equal(c.counts.moved, 1);
    assert.equal(c.counts.added, 1);
    assert.equal(c.counts.removed, 1);
  });
  it("בשלב ששונה מסומנות המילים שנוספו ושנמחקו בכל צד", () => {
    const c = W.compareDocs({ title: "t", meta: {}, blocks: [blk("a", "היום נשחק במעגל גדול")] }, { title: "t", meta: {}, blocks: [blk("a", "היום נשחק בשדה גדול")] });
    const r = c.rows[0];
    assert.equal(r.status, "changed");
    assert.deepEqual(r.fields, ["הטקסט"]);
    assert.deepEqual(r.leftParts.filter((p) => p.k === "del").map((p) => p.t.trim()), ["במעגל"]);
    assert.deepEqual(r.rightParts.filter((p) => p.k === "add").map((p) => p.t.trim()), ["בשדה"]);
    assert.equal(r.leftParts.map((p) => p.t).join(""), "היום נשחק במעגל גדול", "שלמות הטקסט בצד שמאל");
    assert.equal(r.rightParts.map((p) => p.t).join(""), "היום נשחק בשדה גדול");
  });
  it("שינוי כותרת, זמן וסוג נרשם, וכותרת המסמך", () => {
    const c = W.compareDocs({ title: "א", meta: {}, blocks: [blk("a", "x", { title: "ישן", minutes: 5 })] }, { title: "ב", meta: {}, blocks: [blk("a", "x", { title: "חדש", minutes: 10, kind: "peak" })] });
    assert.deepEqual(c.rows[0].fields, ["הכותרת", "הסוג", "הזמן"]);
    assert.equal(c.titleChanged, true);
    assert.equal(W.compareDocs({ title: "א", meta: {}, blocks: [] }, { title: "א", meta: {}, blocks: [] }).titleChanged, false);
  });
  it("הסרה באמצע ממוקמת אחרי השלב שקדם לה, והסרה בתחילה בראש", () => {
    const a = snap([blk("x", "ראשון"), blk("a", "אחד"), blk("y", "מוסר"), blk("b", "שניים")]);
    const b = snap([blk("a", "אחד"), blk("b", "שניים")]);
    assert.deepEqual(W.compareDocs(a, b).rows.map((r) => r.key), ["x", "a", "y", "b"]);
  });
  it("טקסטים ענקיים לא תוקעים (השוואה גסה לפי שורות)", () => {
    const big = (s) => Array.from({ length: 6000 }, (_, i) => `שורה ${i} ${s}`).join("\n");
    const t0 = Date.now();
    const p = W.wordParts(big("א"), big("ב"));
    assert.ok(Date.now() - t0 < 3000, "פחות מ-3 שניות");
    assert.ok(p.left.length > 0 && p.right.length > 0);
  });
  it("טקסט זהה או ריק", () => {
    assert.deepEqual(W.wordParts("", ""), { left: [], right: [] });
    assert.deepEqual(W.wordParts("א ב", "א ב").left, [{ t: "א ב", k: "same" }]);
  });
});

// ───────────────────────── 6. גרירה ושינוי סדר, 17. מחוק לאחרונה, 14. טרם נבדק ─────────────────────────
describe("75.6 / 75.17 / 75.14 סדר, מחוק לאחרונה וסימון בדיקה", () => {
  it("העברת פריט וגבולות", () => {
    assert.deepEqual(W.moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
    assert.deepEqual(W.moveItem([1, 2, 3], 2, 0), [3, 1, 2]);
    const a = [1, 2, 3];
    assert.equal(W.moveItem(a, 1, 1), a);
    assert.equal(W.moveItem(a, -1, 0), a);
    assert.equal(W.moveItem(a, 0, 3), a);
  });
  it("יעד הגרירה לפי גובה האצבע", () => {
    const rects = [{ top: 0, height: 100 }, { top: 100, height: 100 }, { top: 200, height: 100 }];
    assert.equal(W.dropIndex(rects, 10), 0);
    assert.equal(W.dropIndex(rects, 60), 1);
    assert.equal(W.dropIndex(rects, 160), 2);
    assert.equal(W.dropIndex(rects, 9999), 3, "מתחת לכולם: אחרי השלב האחרון");
    assert.equal(W.dropIndex([], 5), 0);
  });
  it("מקום סופי אחרי גרירה: למטה מקדימים בשבצת אחת, למעלה לא", () => {
    assert.equal(W.dropTarget(0, 3, 5), 2, "מהראשון לפני הרביעי");
    assert.equal(W.dropTarget(0, 5, 5), 4, "מהראשון לסוף הרשימה");
    assert.equal(W.dropTarget(4, 0, 5), 0, "מהסוף לראש");
    assert.equal(W.dropTarget(2, 2, 5), 2, "לא זז");
    assert.equal(W.dropTarget(2, 3, 5), 2, "מיד אחריו: לא זז");
    assert.equal(W.dropTarget(3, 1, 5), 1);
    assert.equal(W.dropTarget(0, 0, 1), 0);
  });
  it("הודעה לקורא מסך", () => {
    assert.equal(W.moveAnnounce("פתיחה", 0, 2, 5), 'השלב "פתיחה" הוזז ממקום 1 למקום 3 מתוך 5');
    assert.match(W.moveAnnounce("", 1, 0, 3), /ללא שם/);
  });
  it("שלב שנמחק חוזר למקומו, ושלב ריק לא נשמר", () => {
    let tray = [];
    tray = W.trayPush(tray, blk("a", "תוכן"), 1, 1000);
    tray = W.trayPush(tray, blk("e", ""), 0, 1000);
    assert.equal(tray.length, 1);
    const r = W.trayRestore([blk("x", "1"), blk("y", "2")], tray, "a");
    assert.equal(r.ok, true);
    assert.deepEqual(r.blocks.map((b) => b.id), ["x", "a", "y"]);
    assert.equal(r.tray.length, 0);
    assert.equal(W.trayRestore([], tray, "nope").ok, false);
  });
  it("שחזור נחסם כשיש 60 שלבים, ומזהה כפול מקבל חדש", () => {
    const tray = W.trayPush([], blk("a", "תוכן"), 0, 1);
    const full = Array.from({ length: 60 }, (_, i) => blk("f" + i));
    const r = W.trayRestore(full, tray, "a");
    assert.equal(r.ok, false);
    assert.match(r.reason, /60/);
    const dup = W.trayRestore([blk("a", "כבר כאן")], tray, "a");
    assert.equal(dup.ok, true);
    assert.notEqual(dup.blocks[0].id, dup.blocks[1].id);
  });
  it("תקרה של 20, מחיקה כפולה לא מכפילה, ופג תוקף אחרי 7 ימים", () => {
    let tray = [];
    for (let i = 0; i < 30; i++) tray = W.trayPush(tray, blk("b" + i, "תוכן " + i), i, i);
    assert.equal(tray.length, W.TRAY_MAX);
    assert.equal(tray[0].block.id, "b29");
    tray = W.trayPush(tray, blk("b29", "תוכן חדש יותר"), 3, 99);
    assert.equal(tray.filter((t) => t.block.id === "b29").length, 1);
    const day = 86_400_000;
    assert.equal(W.trayPrune([{ at: 0, index: 0, block: blk("a", "x") }, { at: 6 * day, index: 0, block: blk("b", "x") }], 7 * day).length, 1);
    assert.deepEqual(W.trayParse("{", 0), []);
    assert.deepEqual(W.trayParse(JSON.stringify([{ at: 1, index: 0, block: { id: "a", title: "", text: "x", note: "" } }, { bad: 1 }]), 2).length, 1);
  });
  it('אזהרה לפני ייצוא על שלבים שסומנו "טרם נבדק"', () => {
    assert.equal(W.exportWarning([blk("a", "x"), blk("b", "y")]), null);
    const one = W.exportWarning([blk("a", "x", { unchecked: true, title: "משחק" }), blk("b", "y")]);
    assert.match(one, /שלב אחד עדיין מסומן "טרם נבדק": 1\. משחק/);
    const many = W.exportWarning(Array.from({ length: 6 }, (_, i) => blk("u" + i, "x", { unchecked: true })));
    assert.match(many, /6 שלבים עדיין מסומנים/);
    assert.match(many, /ועוד\./);
    assert.deepEqual(W.uncheckedOf([blk("a", "", { unchecked: true })]).map((x) => x.i), [0]);
  });
});

// ───────────────────────── 16. A4 ועימוד, 9. הקרא לי ─────────────────────────
describe("75.16 / 75.9 עימוד להדפסה והקראה", () => {
  it("שלב קצר שלא נכנס בסוף העמוד עובר לעמוד הבא, ושלב ארוך זורם", () => {
    const longText = Array.from({ length: 30 }, () => "שורה קצרה").join("\n");
    const shortText = Array.from({ length: 10 }, () => "שורה קצרה").join("\n");
    const p = W.paginate([{ title: "א", text: longText }, { title: "ב", text: shortText }]);
    assert.equal(p.blocks[0].keep, false);
    assert.equal(p.blocks[1].keep, true);
    assert.equal(p.blocks[1].newPage, true);
    assert.match(p.blocks[1].reason, /עובר לעמוד הבא/);
    assert.equal(p.pages, 2);
    const huge = W.paginate([{ title: "x", text: Array.from({ length: 300 }, () => "שורה").join("\n") }]);
    assert.ok(huge.pages >= 6, `${huge.pages}`);
    assert.equal(W.paginate([]).pages, 1);
  });
  it("תוכן ארוך מוסיף עמודים", () => {
    const one = W.paginate([{ title: "א", text: "קצר" }]).pages;
    const many = W.paginate(Array.from({ length: 12 }, (_, i) => ({ title: "ש" + i, text: words(80, i) }))).pages;
    assert.equal(one, 1);
    assert.ok(many > one);
  });
  it("קטעי הקראה: משפט כל פעם, בלי סימוני Markdown, עם מיקום מקורי", () => {
    const blocks = [{ title: "א", text: "**משפט** ראשון. שני!\n- שלישי" }, { title: "ב", text: "רביעי." }];
    const c = W.readChunks(blocks, 0, "block");
    assert.deepEqual(c.map((x) => x.text), ["משפט ראשון.", "שני!", "שלישי"]);
    assert.equal(blocks[0].text.slice(c[1].start, c[1].end), "שני!");
    assert.equal(W.readChunks(blocks, 0, "all").length, 4);
    assert.deepEqual(W.readChunks(blocks, 1, "fromHere").map((x) => x.b), [1]);
    assert.deepEqual(W.readChunks(blocks, 5, "block"), []);
  });
  it("זרימה: הקראה שחורגת מזמן השלב מקבלת הערה", () => {
    const r = W.readFlow([{ title: "א", text: words(300), minutes: 1 }, { title: "ב", text: words(10), minutes: 5 }, { title: "ג", text: words(50), minutes: null }]);
    assert.match(r[0].note, /יותר מהזמן שתוכנן/);
    assert.equal(r[1].note, "");
    assert.equal(r[2].note, "");
    assert.ok(W.readSeconds(130, 1) === 60 && W.readSeconds(130, 2) === 30);
  });
});

// ───────────────────────── 15. וואטסאפ ─────────────────────────
describe("75.15 ייצוא לוואטסאפ בלי עיצוב שבור", () => {
  const wa = S.waText;
  it("הדגשה כפולה הופכת להדגשה של וואטסאפ, ונטייה הופכת ל-_", () => {
    assert.equal(wa("זה **חשוב** מאוד"), "זה *חשוב* מאוד");
    assert.equal(wa("זה *נטוי* מאוד"), "זה _נטוי_ מאוד");
    assert.equal(wa("זה __נטוי__ מאוד"), "זה _נטוי_ מאוד");
    assert.equal(wa("~~נמחק~~"), "~נמחק~");
    assert.equal(wa("**  רווחים  **"), "*רווחים*", "רווחים בתוך ההדגשה משבשים אותה בוואטסאפ");
    assert.equal(wa("ריק **** באמצע"), "ריק  באמצע");
  });
  it("כותרות, רשימות, ציטוט וקישורים", () => {
    assert.equal(wa("## כותרת"), "*כותרת*");
    assert.equal(wa("- א\n* ב\n• ג"), "• א\n• ב\n• ג");
    assert.equal(wa("1) ראשון\n2. שני"), "1. ראשון\n2. שני");
    assert.equal(wa("> ציטוט"), "> ציטוט");
    assert.equal(wa("ראו [האתר](https://example.com/x)"), "ראו האתר (https://example.com/x)");
    assert.equal(wa("א\n---\nב"), "א\nב");
  });
  it("טבלה הופכת לרשימה קריאה", () => {
    assert.equal(wa("| שם | זמן |\n|---|---|\n| משחק | 10 |\n| דיון | 5 |"), "*שם — זמן*\n• משחק — 10\n• דיון — 5");
  });
  it("סימן בלי זוג מוסר, כדי שלא יפעיל עיצוב במקום לא צפוי", () => {
    assert.equal(wa("מחיר 5 * 3 = 15"), "מחיר 5  3 = 15");
    assert.ok(!wa("שלום * עולם").includes("*"));
    assert.ok(wa("snake_case_word").includes("snake_case_word"), "קו תחתון בתוך מילה נשאר");
    assert.equal(wa("*א* ו*ב"), "_א_ וב");
  });
  it("שורה שמתחילה בסימן עיצוב לא מקבלת תו כיווניות לפניו (זה היה שובר את ההדגשה)", () => {
    assert.ok(wa("**כותרת** בהתחלה").startsWith("*"));
    assert.equal(wa("Scout הוא תנועה").charCodeAt(0), 0x200f, "שורה שמתחילה באות לטינית מקבלת RLM כדי שלא תתהפך");
    assert.equal(wa("123 משתתפים"), "123 משתתפים", "ספרות לא צריכות RLM: הכיוון נקבע לפי העברית");
  });
  it("קוד ושורות בקוד נוקים, ובלי תווי בקרה", () => {
    assert.equal(wa("השתמשו ב-`סרגל` כאן"), "השתמשו ב-סרגל כאן");
    assert.equal(wa("```\nקוד\n```"), "קוד");
    assert.equal(wa("א\u0000ב\u0007ג"), "אבג");
    assert.equal(wa("א\r\n\r\n\r\n\r\nב"), "א\n\nב");
  });
  const doc = { title: "טקס *חגיגי*", meta: { ageGroup: "כיתה ו' - מעורב", minutes: 45, value: "אומץ" }, blocks: [blk("a", "פתיחה **חזקה**", { title: "פתיחה", minutes: 5, kind: "open", note: "סוד אישי שלא יוצא", unchecked: true }), blk("b", "- דיון\n- סיכום", { title: "", kind: "close" })] };
  it("מסמך מלא: כותרת, שלבים, בלי הערות אישיות ובלי כוכביות בכותרת הפנימית", () => {
    const w = S.toWhatsApp(doc);
    assert.ok(w.text.startsWith("*טקס חגיגי*\nכיתה ו' - מעורב | 45 דקות | ערך: אומץ"));
    assert.match(w.text, /\*פתיחה \(5 דק'\)\*\nפתיחה \*חזקה\*/);
    assert.match(w.text, /\*סיכום\*\n• דיון\n• סיכום/);
    assert.ok(!w.text.includes("סוד אישי"));
    assert.equal(w.parts.length, 1);
    assert.ok(!w.text.includes("טרם נבדק"), "ברירת מחדל: בלי סימון בטקסט");
    assert.match(S.toWhatsApp(doc, { marks: true }).text, /\*פתיחה \(5 דק'\)\* \(טרם נבדק\)/);
  });
  it("מסמך ארוך מפוצל להודעות לפי שלבים, כל הודעה בתוך המגבלה", () => {
    const long = { title: "ארוך", meta: {}, blocks: Array.from({ length: 12 }, (_, i) => blk("s" + i, words(120, i), { title: "שלב " + i })) };
    const w = S.toWhatsApp(long, { max: 1500 });
    assert.ok(w.parts.length > 2);
    for (const p of w.parts) assert.ok(p.length <= 1500 + 120, `${p.length}`);
    assert.match(w.parts[0], /חלק 1 מתוך/);
    assert.match(w.parts[w.parts.length - 1], new RegExp(`חלק ${w.parts.length} מתוך ${w.parts.length}`));
    // כל מה שנכתב מופיע באחת ההודעות
    const joined = w.parts.join("\n");
    for (let i = 0; i < 12; i++) assert.ok(joined.includes(`שלב ${i}`));
  });
  it("שלב אחד ענק מפוצל בגבולות פסקאות", () => {
    const big = { title: "ענק", meta: {}, blocks: [blk("a", Array.from({ length: 40 }, (_, i) => words(40, i) + ".").join("\n\n"), { title: "הכול" })] };
    const w = S.toWhatsApp(big, { max: 2000 });
    assert.ok(w.parts.length >= 3);
    for (const p of w.parts) assert.ok(p.length <= 2100, `${p.length}`);
  });
  it("ללא כותרות ושלבים", () => {
    assert.equal(S.toWhatsApp({ title: "", meta: {}, blocks: [] }).text, "*פעולה*");
    assert.match(S.toWhatsApp({ title: "x", meta: {}, blocks: [blk("a", "", { kind: "close" })] }).text, /\*סיכום\*/);
  });
});

// ───────────────────────── שרת: HTTP ─────────────────────────
describe("75 שרת: מגבלות, סימון, ייצוא, תבניות ונעילה", () => {
  let app, server, base, db, A, Bu, C;
  const j = async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const auth = (t) => ({ authorization: `Bearer ${t}` });
  let n = 0;
  const reg = async () => {
    const username = "t75u" + ++n + Math.random().toString(36).slice(2, 6);
    const r = await j("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password: "Str0ng!Passw0rd7" + n, displayName: "מדריך " + n, acceptTerms: true, signupCode: "shevet-code" }) });
    return { token: r.body.token, username, name: "מדריך " + n };
  };
  const newDoc = async (u, over = {}) => (await j("/api/write/docs", { method: "POST", headers: auth(u.token), body: JSON.stringify({ template: "classic", title: "פעולה", ...over }) })).body;
  const put = (u, doc, over = {}) => j(`/api/write/docs/${doc.id}`, { method: "PUT", headers: auth(u.token), body: JSON.stringify({ title: doc.title, meta: doc.meta, blocks: doc.blocks, baseRev: doc.rev, ...over }) });
  const get = (u, id) => j(`/api/write/docs/${id}`, { headers: auth(u.token) });

  const openStream = (id, cid, token) =>
    new Promise((resolve, reject) => {
      const msgs = [];
      let rest = "";
      const waiters = [];
      const req = http.get(`${base}/api/write/docs/${id}/live?cid=${cid}`, { agent: false, headers: auth(token) }, (res) => {
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
    A = await reg();
    Bu = await reg();
    C = await reg();
  });
  after(() => {
    app.locals.fieldRooms?.shutdown();
    app.locals.liveDocs?.shutdown();
    server.closeAllConnections?.();
    server.close();
  });

  it("שלב ארוך מדי נדחה בהסבר ברור (לא 'הנתונים אינם תקינים')", async () => {
    const d = await newDoc(A);
    const blocks = d.blocks.map((b, i) => (i === 1 ? { ...b, text: "א".repeat(20001) } : b));
    const r = await put(A, d, { blocks });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "LIMITS");
    assert.match(r.body.error.message, /שלב 2 ארוך מדי: 20,001 תווים, ואפשר עד 20,000/);
    assert.equal(r.body.problems[0].block, 2);
    assert.equal(r.body.problems[0].length, 20001);
    const ok = await put(A, d, { blocks: d.blocks.map((b, i) => (i === 1 ? { ...b, text: "א".repeat(20000) } : b)) });
    assert.equal(ok.status, 200, "בדיוק 20,000 עובר");
  });
  it("61 שלבים נדחים בהסבר, ו-60 עוברים", async () => {
    const d = await newDoc(A);
    const mk = (k) => Array.from({ length: k }, (_, i) => ({ id: "q" + i, title: "", kind: "body", minutes: null, text: "", note: "", done: false }));
    const bad = await put(A, d, { blocks: mk(61) });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /יש 61 שלבים, ואפשר עד 60/);
    assert.equal((await put(A, d, { blocks: mk(60) })).status, 200);
  });
  it("כמה חריגות יחד מדווחות כולן", async () => {
    const d = await newDoc(A);
    const r = await put(A, d, { title: "ש".repeat(121), blocks: d.blocks.map((b, i) => (i < 2 ? { ...b, note: "ה".repeat(5001) } : b)) });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.problems.map((p) => p.code), ["DOC_TITLE", "BLOCK_NOTE", "BLOCK_NOTE"]);
  });
  it("גוף משובש עדיין מקבל את שגיאת האימות הרגילה, בלי קריסה", async () => {
    const d = await newDoc(A);
    const r = await j(`/api/write/docs/${d.id}`, { method: "PUT", headers: auth(A.token), body: JSON.stringify({ blocks: "לא מערך" }) });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "VALIDATION");
  });

  it('"טרם נבדק" נשמר רק כשהוא true, ולא נחשף בקישור צפייה', async () => {
    const d = await newDoc(A);
    const r = await put(A, d, { blocks: d.blocks.map((b, i) => (i === 0 ? { ...b, unchecked: true, note: "סוד אישי 75" } : { ...b, unchecked: false })) });
    assert.equal(r.status, 200);
    const g = (await get(A, d.id)).body;
    assert.equal(g.blocks[0].unchecked, true);
    assert.ok(!("unchecked" in g.blocks[1]), "false לא נשמר, כדי שמסמכים לא ישתנו");
    const sh = await j(`/api/write/docs/${d.id}/share`, { method: "POST", headers: auth(A.token), body: JSON.stringify({}) });
    const view = await j(`/api/write/shared/${sh.body.token}`);
    assert.equal(view.status, 200);
    const raw = JSON.stringify(view.body);
    assert.ok(!raw.includes("unchecked"));
    assert.ok(!raw.includes("סוד אישי 75"), "הערה אישית לא יוצאת בקישור");
  });
  it("הסרת הסימון נשמרת, ומיזוג בעריכה משותפת לא יוצר התנגשות מדומה מסימון שלא שונה", async () => {
    const d = await newDoc(A);
    const marked = await put(A, d, { blocks: d.blocks.map((b, i) => (i === 0 ? { ...b, unchecked: true } : b)) });
    assert.equal(marked.status, 200);
    const cur = (await get(A, d.id)).body;
    const cleared = await put(A, cur, { blocks: cur.blocks.map((b) => ({ ...b, unchecked: false })) });
    assert.equal(cleared.status, 200);
    assert.ok(!("unchecked" in (await get(A, d.id)).body.blocks[0]));
  });

  it("ייצוא טקסט לוואטסאפ: מפוצל להודעות, בלי הערות, ובלי ייצוא ללא התחברות", async () => {
    const body = { title: "פעולה", meta: {}, blocks: [{ id: "a", title: "פתיחה", kind: "open", minutes: 5, text: "זה **חשוב** ו*נטוי*", note: "סוד אישי 75" }], whatsapp: true };
    const r = await j("/api/write/export/text", { method: "POST", headers: auth(A.token), body: JSON.stringify(body) });
    assert.equal(r.status, 200);
    assert.match(r.body.text, /זה \*חשוב\* ו_נטוי_/);
    assert.ok(!JSON.stringify(r.body).includes("סוד אישי 75"));
    assert.ok(Array.isArray(r.body.parts) && r.body.parts.length === 1);
    assert.equal(typeof r.body.chars, "number");
    const plain = await j("/api/write/export/text", { method: "POST", headers: auth(A.token), body: JSON.stringify({ ...body, whatsapp: false }) });
    assert.ok(!plain.body.text.includes("סוד אישי 75"));
    assert.ok(!plain.body.text.includes("*"), "גם נטייה וגם הדגשה מוסרות מהטקסט הפשוט");
    assert.equal((await j("/api/write/export/text", { method: "POST", body: JSON.stringify(body) })).status, 401);
    const split = await j("/api/write/export/text", { method: "POST", headers: auth(A.token), body: JSON.stringify({ ...body, blocks: Array.from({ length: 10 }, (_, i) => ({ ...body.blocks[0], id: "s" + i, text: words(150, i) })), max: 1000 }) });
    assert.ok(split.body.parts.length > 3);
    const bad = await j("/api/write/export/text", { method: "POST", headers: auth(A.token), body: JSON.stringify({ ...body, max: 50 }) });
    assert.equal(bad.status, 400, "מתחת ל-1000 לא מתקבל");
  });

  it("תבניות מהרצות מוצלחות: רק מסמכים שדורגו 4 ומעלה, ורק שלי", async () => {
    const good = await newDoc(A, { title: "פעולה מצליחה" });
    const g1 = await put(A, good, { meta: { ...good.meta, runs: [{ date: "2026-11-01", note: "עבד נהדר", rating: 5 }, { date: "2026-11-10", note: "", rating: 4 }] } });
    assert.equal(g1.status, 200);
    const weak = await newDoc(A, { title: "פעולה חלשה" });
    await put(A, weak, { meta: { ...weak.meta, runs: [{ date: "2026-11-02", note: "קשה", rating: 2 }] } });
    const none = await newDoc(A, { title: "בלי הרצות" });
    assert.ok(none.id);
    const others = await newDoc(Bu, { title: "של מישהו אחר" });
    await put(Bu, others, { meta: { ...others.meta, runs: [{ date: "2026-11-02", note: "", rating: 5 }] } });
    const r = await j("/api/write/templates/mine", { headers: auth(A.token) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.docs.map((d) => d.title), ["פעולה מצליחה"]);
    assert.equal(r.body.docs[0].runs, 2);
    assert.equal(r.body.docs[0].avgRating, 4.5);
    assert.equal(r.body.docs[0].lastRun, "2026-11-10");
    assert.equal(r.body.docs[0].lastNote, "עבד נהדר");
    assert.equal((await j("/api/write/templates/mine")).status, 401);
  });
  it("יצירת מסמך משלד של הרצה מוצלחת: אותם שלבים וזמנים, בלי טקסט, עם רמז, והרצות מאופסות", async () => {
    const src = await newDoc(A, { title: "מקור" });
    const filled = await put(A, src, { meta: { ...src.meta, runs: [{ date: "2026-11-01", note: "", rating: 5 }], leader: "דנה" }, blocks: src.blocks.map((b, i) => ({ ...b, text: `משפט ראשון בשלב ${i}. משפט שני.`, note: "הערה פרטית" })) });
    assert.equal(filled.status, 200);
    const r = await j("/api/write/docs/from-run", { method: "POST", headers: auth(A.token), body: JSON.stringify({ docId: src.id, skeleton: true }) });
    assert.equal(r.status, 201);
    const nd = (await get(A, r.body.id)).body;
    assert.equal(nd.title, "מקור");
    assert.deepEqual(nd.blocks.map((b) => [b.kind, b.title, b.minutes]), src.blocks.map((b) => [b.kind, b.title, b.minutes]));
    assert.ok(nd.blocks.every((b) => b.text === "" && b.note === ""));
    assert.equal(nd.blocks[0].hint, "משפט ראשון בשלב 0.");
    assert.deepEqual(nd.meta.runs, []);
    assert.notEqual(nd.blocks[0].id, src.blocks[0].id);
    const full = await j("/api/write/docs/from-run", { method: "POST", headers: auth(A.token), body: JSON.stringify({ docId: src.id, skeleton: false, title: "עותק מלא" }) });
    const fd = (await get(A, full.body.id)).body;
    assert.equal(fd.title, "עותק מלא");
    assert.match(fd.blocks[0].text, /משפט ראשון/);
    assert.equal(fd.blocks[0].note, "", "הערות אישיות לא עוברות");
  });
  it("מסמך של מישהו אחר, בקשה כפולה או ריקה נדחים", async () => {
    const mine = await newDoc(A);
    const post = (u, b) => j("/api/write/docs/from-run", { method: "POST", headers: auth(u.token), body: JSON.stringify(b) });
    assert.equal((await post(Bu, { docId: mine.id })).status, 404);
    assert.equal((await post(A, {})).status, 400);
    assert.equal((await post(A, { docId: mine.id, activityId: 1 })).status, 400);
    assert.equal((await post(A, { docId: 99999 })).status, 404);
    assert.equal((await post(A, { docId: mine.id, extra: 1 })).status, 400, "שדות לא מוכרים נדחים");
    assert.equal((await j("/api/write/docs/from-run", { method: "POST", body: JSON.stringify({ docId: mine.id }) })).status, 401);
  });
  it("פעולות מהמאגר שההשתתפות בהן הייתה גבוהה הופכות לשלד של מסמך", async () => {
    const run = (u, engagement) => j("/api/activities/1/runs", { method: "POST", headers: auth(u.token), body: JSON.stringify({ ranOn: "2026-11-05", groupLabel: "ז1", worked: "", changeNext: "", notes: "", engagement }) });
    assert.equal((await run(C, 2)).status, 201);
    assert.deepEqual((await j("/api/write/templates/mine", { headers: auth(C.token) })).body.activities, [], "השתתפות בינונית לא נחשבת");
    assert.equal((await run(C, 3)).status, 201);
    const t = await j("/api/write/templates/mine", { headers: auth(C.token) });
    assert.equal(t.body.activities.length, 1);
    assert.equal(t.body.activities[0].id, 1);
    assert.equal(t.body.activities[0].runs, 1);
    const r = await j("/api/write/docs/from-run", { method: "POST", headers: auth(C.token), body: JSON.stringify({ activityId: 1, skeleton: true }) });
    assert.equal(r.status, 201);
    const nd = (await get(C, r.body.id)).body;
    const act = (await j("/api/activities/1")).body;
    assert.equal(nd.blocks.length, act.stages.length);
    assert.equal(nd.blocks[0].kind, "open");
    assert.equal(nd.blocks[nd.blocks.length - 1].kind, "close");
    assert.ok(nd.blocks.every((b) => b.text === "" && b.minutes > 0));
    assert.ok(nd.blocks.some((b) => b.hint));
    assert.equal((await j("/api/write/docs/from-run", { method: "POST", headers: auth(C.token), body: JSON.stringify({ activityId: 999999 }) })).status, 404);
  });

  it("נעילת שלב: מי שהקליד ראשון מחזיק, אחר רואה מי, והשחרור פותח", async () => {
    const d = await newDoc(A, { title: "נעילה" });
    const inv = await j(`/api/write/docs/${d.id}/editors`, { method: "POST", headers: auth(A.token), body: JSON.stringify({ username: Bu.username }) });
    assert.equal(inv.status, 201);
    const cidA = "a1".repeat(8), cidB = "b2".repeat(8);
    const sa = await openStream(d.id, cidA, A.token);
    const sb = await openStream(d.id, cidB, Bu.token);
    await sa.wait((m) => m.event === "hello");
    await sb.wait((m) => m.event === "hello");
    const lock = (u, cid, block) => j(`/api/write/docs/${d.id}/live/lock`, { method: "POST", headers: auth(u.token), body: JSON.stringify({ cid, block }) });
    const blockId = d.blocks[1].id;
    const first = await lock(A, cidA, blockId);
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);
    const seen = await sb.wait((m) => m.event === "presence" && m.people.some((p) => p.lock === blockId));
    assert.equal(seen.people.filter((p) => p.lock).length, 1);
    const denied = await lock(Bu, cidB, blockId);
    assert.deepEqual({ status: denied.status, ok: denied.body.ok }, { status: 200, ok: false });
    assert.ok(denied.body.by.includes("מדריך"), "מציג מי נועל");
    const other = await lock(Bu, cidB, d.blocks[2].id);
    assert.equal(other.body.ok, true, "שלב אחר פתוח");
    assert.equal((await lock(A, cidA, null)).body.ok, true);
    assert.equal((await lock(Bu, cidB, blockId)).body.ok, true, "אחרי שחרור");
    assert.equal((await lock(A, cidA, blockId)).body.ok, false, "ועכשיו A נעול החוצה");
    sa.close();
    sb.close();
  });
  it("הרשאות הנעילה: זר לא מקבל, בלי חיבור חי נדחה, גוף שגוי נדחה", async () => {
    const d = await newDoc(A);
    const lock = (u, body, id = d.id) => j(`/api/write/docs/${id}/live/lock`, { method: "POST", headers: u ? auth(u.token) : {}, body: JSON.stringify(body) });
    assert.equal((await lock(C, { cid: "c3".repeat(8), block: "x" })).status, 404, "זר");
    assert.equal((await lock(A, { cid: "a1".repeat(8), block: "x" })).status, 409, "אין חיבור חי");
    assert.equal((await lock(A, { cid: "XYZ", block: "x" })).status, 400);
    assert.equal((await lock(A, { cid: "a1".repeat(8), block: "x", more: 1 })).status, 400);
    assert.equal((await lock(null, { cid: "a1".repeat(8), block: "x" })).status, 401);
    assert.equal((await lock(A, { cid: "a1".repeat(8), block: "x" }, 99999)).status, 404);
  });
});

// ───────────────────────── נוכחות: נעילה ביחידה ─────────────────────────
describe("75.19 נעילת שלב בנוכחות החיה (לוגיקה)", () => {
  const fakeRes = () => ({ out: [], write(s) { this.out.push(s); return true; }, end() {} });
  const events = (res) => res.out.filter((s) => s.startsWith("event:")).map((s) => ({ ev: /event: (\w+)/.exec(s)[1], d: JSON.parse(/data: (.*)\n/.exec(s)[1]) }));
  const CID = (n) => String(n).repeat(16).slice(0, 16);
  const setup = () => {
    let t = 1_000_000;
    const live = createLiveDocs({ timers: false, now: () => t });
    const a = fakeRes(), b = fakeRes();
    live.join(1, CID(1), a, { userId: 1, name: "דנה", owner: true });
    live.join(1, CID(2), b, { userId: 2, name: "יוסי" });
    return { live, a, b, tick: (ms) => (t += ms) };
  };
  it("נעילה, סירוב עם שם המחזיק, שחרור, ונעילה אחת לכל חיבור", () => {
    const { live, a } = setup();
    assert.equal(live.lock(1, CID(1), 1, "s1").ok, true);
    assert.deepEqual(live.lock(1, CID(2), 2, "s1"), { ok: false, reason: "LOCKED", by: "דנה" });
    assert.equal(live.lock(1, CID(2), 2, "s2").ok, true);
    assert.equal(live.lock(1, CID(1), 1, "s3").ok, true, "דנה עוברת לשלב אחר ומשחררת את s1");
    assert.equal(live.lock(1, CID(2), 2, "s1").ok, true, "s1 התפנה");
    const last = events(a).at(-1).d.people;
    assert.deepEqual(last.map((p) => [p.name, p.lock]).sort(), [["דנה", "s3"], ["יוסי", "s1"]].sort());
    assert.equal(live.lock(1, CID(1), 1, null).ok, true);
    assert.equal(live.people(1).find((p) => p.name === "דנה").lock, null);
  });
  it("נעילה פגה אחרי 20 שניות, ומתחדשת בהקלדה", () => {
    const { live, b, tick } = setup();
    live.lock(1, CID(1), 1, "s1");
    tick(LOCK_MS - 1000);
    assert.equal(live.lock(1, CID(2), 2, "s1").ok, false);
    live.lock(1, CID(1), 1, "s1"); // חידוש
    tick(LOCK_MS - 1000);
    assert.equal(live.lock(1, CID(2), 2, "s1").ok, false, "החידוש האריך");
    tick(2000);
    assert.equal(live.people(1).find((p) => p.name === "דנה").lock, null, "פגה גם ברשימה");
    assert.equal(live.lock(1, CID(2), 2, "s1").ok, true);
    assert.ok(events(b).length > 0);
  });
  it("sweep משחרר נעילות שפגו ומודיע לשאר", () => {
    const { live, b, tick } = setup();
    live.lock(1, CID(1), 1, "s1");
    const before = events(b).length;
    tick(LOCK_MS + 1);
    assert.equal(live.sweep(), 1);
    assert.equal(events(b).length, before + 1);
    assert.equal(events(b).at(-1).d.people.every((p) => p.lock === null), true);
    assert.equal(live.sweep(), 0);
  });
  it("אי אפשר לנעול בשם מישהו אחר, ובלי חיבור; מי שהתנתק משחרר", () => {
    const { live } = setup();
    assert.equal(live.lock(1, CID(1), 2, "s1").ok, false, "משתמש שגוי");
    assert.equal(live.lock(1, CID(9), 1, "s1").reason, "NOT_CONNECTED");
    assert.equal(live.lock(7, CID(1), 1, "s1").reason, "NOT_CONNECTED");
    live.lock(1, CID(1), 1, "s1");
    live.kickUser(1, 1);
    assert.equal(live.lock(1, CID(2), 2, "s1").ok, true);
  });
});

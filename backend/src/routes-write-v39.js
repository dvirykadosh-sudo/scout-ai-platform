// שלב 39 (261–270): בדיקת קול, בדיקת בטיחות, התאמה לגיל ושאלות לדיון אחרי כל שלב.
import crypto from "node:crypto";
import { z } from "zod";
import { RISKS } from "./care.js";
import { KIND_LABEL } from "./routes-write-export.js";
import { KINDS, metaDefaults } from "./routes-write.js";
import { questionsFor } from "./routes-write-more.js";
import { methodsIn } from "./write-suggest.js";
import { getSet, putSet } from "./ops.js";

const wc = (t) => (String(t || "").match(/\S+/g) || []).length;
const clean = (t) => String(t || "").replace(/[#>*|]/g, " ").replace(/\s+/g, " ").trim();
const sents = (t) => String(t || "").replace(/[#>*|]/g, " ").split(/(?<=[.!?:])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const SPEAK_WPM = 125; // קצב הדרכה בקול, כולל עצירות

/** 261, 262: כמה זמן ייקח להגיד את זה בקול, ואילו משפטים קשים להגייה. */
export function voiceCheck(doc) {
  const blocks = [];
  const hard = [];
  let speakSec = 0, planned = 0;
  for (const b of doc.blocks) {
    const label = b.title || KIND_LABEL[b.kind];
    const words = wc(clean(b.text));
    const sec = Math.round((words / SPEAK_WPM) * 60);
    speakSec += sec;
    planned += b.minutes || 0;
    const ratio = b.minutes ? +(sec / 60 / b.minutes).toFixed(2) : null;
    blocks.push({ id: b.id, label, words, speakSec: sec, plannedMin: b.minutes || 0, ratio, note: ratio == null ? "" : ratio > 0.6 ? "רוב השלב הוא דיבור שלכם. ייתכן שלא נשאר זמן לחניכים" : ratio < 0.05 && words > 0 ? "" : "" });
    for (const s of sents(b.text)) {
      const n = wc(s);
      const reasons = [];
      if (n > 22) reasons.push(`${n} מילים בנשימה אחת`);
      if ((s.match(/[,،]/g) || []).length >= 4) reasons.push("הרבה פסיקים ופסוקיות");
      if (/\([^)]{20,}\)/.test(s)) reasons.push("סוגריים ארוכים באמצע המשפט");
      if (/\d[\d.,/-]{5,}/.test(s)) reasons.push("מספרים ארוכים שקשה להגיד");
      if (/[א-ת]{13,}/.test(s)) reasons.push("מילה ארוכה במיוחד");
      if (reasons.length) hard.push({ blockId: b.id, label, text: s.slice(0, 120), reasons });
    }
  }
  return { totalSpeakMin: +(speakSec / 60).toFixed(1), plannedMin: planned, blocks, hardSentences: hard.slice(0, 30), talkShare: planned ? Math.round((100 * speakSec) / 60 / planned) : null };
}

/** 263, 264: סריקת בטיחות, ויחס מדריכים-חניכים מומלץ. */
function ratioFor(riskIds, ageGroup) {
  let per = 12;
  const why = [];
  const take = (n, w) => { if (n < per) { per = n; why.push(w); } };
  if (riskIds.includes("water")) take(5, "פעילות ליד מים");
  if (riskIds.includes("fire") || riskIds.includes("sharp") || riskIds.includes("height")) take(6, "אש, כלים חדים או גובה");
  if (riskIds.includes("outside")) take(8, "יציאה מהמועדון");
  if (riskIds.includes("dark")) take(8, "חושך");
  if (riskIds.includes("running") || riskIds.includes("contact")) take(10, "תנועה ומגע");
  const grade = /כיתה\s+([א-י]+)['׳]/.exec(ageGroup || "")?.[1] || "";
  if (["ג", "ד", "ה"].includes(grade)) { per = Math.max(4, Math.round(per * 0.7)); why.push("שכבה צעירה"); }
  return { perGuide: per, why };
}
export function safetyScan(doc) {
  const meta = metaDefaults(doc.meta ?? {});
  const all = doc.blocks.map((b) => `${b.title}\n${b.text}`).join("\n");
  const equip = [...meta.equipment, ...meta.gear].join(" ");
  const notes = doc.blocks.filter((b) => /בטיחות|זהירות|הנחיות/.test(b.title)).map((b) => b.text).join("\n") + "\n" + all;
  const risks = [];
  for (const r of RISKS) {
    const stages = doc.blocks.filter((b) => r.re.test(`${b.title} ${b.text}`)).map((b) => b.title || KIND_LABEL[b.kind]);
    if (!stages.length && !r.re.test(equip)) continue;
    // "מכוסה" רק אם יש הנחיה ייעודית מעבר לאזכור הפעילות עצמה
    const covered = r.cover.test(doc.blocks.filter((b) => /בטיחות|זהירות|הנחיות|גבולות/.test(`${b.title} ${b.text}`)).map((b) => b.text).join("\n"));
    risks.push({ id: r.id, label: r.label, stages: [...new Set(stages)], suggestion: r.suggestion, covered });
  }
  const ratio = ratioFor(risks.map((r) => r.id), meta.ageGroup);
  const guidesNeeded = meta.groupSize ? Math.max(1, Math.ceil(meta.groupSize / ratio.perGuide)) : null;
  return { risks, missing: risks.filter((r) => !r.covered).length, ratio: { ...ratio, groupSize: meta.groupSize, guidesNeeded }, ok: risks.every((r) => r.covered) };
}

// 266–268: התאמה לגיל. כללים פשוטים, נקודת פתיחה שצריך לעבור עליה.
const TO_YOUNG = [["להתמודד עם", "לנסות לפתור"], ["להתנהל", "להתנהג"], ["אחריות אישית", "לקחת אחריות"], ["לנתח", "לחשוב על"], ["להבין את המשמעות", "להבין מה זה אומר"], ["לדון", "לדבר"], ["ערכים", "דברים חשובים"], ["קבוצת", "חבורת"], ["לגבש", "להחליט ביחד"], ["אתגר", "משימה"], ["במהלך", "בזמן"], ["לאחר מכן", "אחר כך"], ["עליכם", "אתם צריכים"], ["לבחון", "לבדוק"], ["להסיק מסקנות", "להבין מה למדנו"], ["תהליך", "דרך"], ["פרספקטיבה", "זווית"], ["להציג", "להראות"]];
const TO_OLD = [["משימה", "אתגר"], ["לבדוק", "לבחון"], ["להחליט ביחד", "לגבש עמדה"], ["חבורת", "קבוצת"], ["אחר כך", "לאחר מכן"], ["לדבר על", "לדון ב"], ["דברים חשובים", "ערכים"], ["להבין מה למדנו", "להסיק מסקנות"]];
const LEVELS = { young: { label: "צעירים (כיתות ג-ה)", maxStage: 12, grade: "כיתה ד' - מעורב", sentence: 14, scale: 0.85 }, mid: { label: "בינוניים (כיתות ו-ח)", maxStage: 20, grade: "כיתה ז' - מעורב", sentence: 20, scale: 1 }, old: { label: "בוגרים (כיתות ט-יב)", maxStage: 30, grade: "כיתה י' - מעורב", sentence: 28, scale: 1.1 } };
const splitLong = (s, max) => {
  const w = s.split(/\s+/);
  if (w.length <= max) return s;
  const cut = s.lastIndexOf(",", s.split(/\s+/).slice(0, max).join(" ").length);
  return cut > 20 ? s.slice(0, cut) + "." + s.slice(cut + 1) : s;
};
export function adaptToAge(doc, level) {
  const L = LEVELS[level];
  const changes = [];
  const blocks = doc.blocks.map((b) => {
    let text = String(b.text || "");
    const before = text;
    const dict = level === "young" ? TO_YOUNG : level === "old" ? TO_OLD : [];
    for (const [from, to] of dict) if (text.includes(from)) { text = text.replaceAll(from, to); changes.push({ blockId: b.id, label: b.title || KIND_LABEL[b.kind], what: `"${from}" ← "${to}"` }); }
    if (level !== "old") {
      text = text.split("\n").map((line) => (wc(line) > L.sentence * 1.4 ? splitLong(line, L.sentence) : line)).join("\n");
    }
    let minutes = b.minutes;
    if (minutes) {
      const m = Math.max(1, Math.min(L.maxStage, Math.round(minutes * L.scale)));
      if (m !== minutes) changes.push({ blockId: b.id, label: b.title || KIND_LABEL[b.kind], what: `זמן ${minutes} ← ${m} דקות (טווח קשב)` });
      minutes = m;
    }
    if (level === "old" && b.kind === "peak" && !/שאלה למחשבה/.test(text)) {
      text += `${text.trim() ? "\n" : ""}**שאלה למחשבה:** מה המחיר של ההחלטה הזו, ומי משלם אותו?`;
      changes.push({ blockId: b.id, label: b.title || KIND_LABEL[b.kind], what: "נוספה שאלה מעמיקה לבוגרים" });
    }
    if (level === "young" && b.kind === "close" && !/משפט אחד/.test(text)) {
      text += `${text.trim() ? "\n" : ""}**לסיום:** כל אחד אומר משפט אחד על מה שהוא לוקח מהפעולה.`;
      changes.push({ blockId: b.id, label: b.title || KIND_LABEL[b.kind], what: "נוספה סגירה קצרה לצעירים" });
    }
    return { ...b, text, minutes };
  });
  return { level, label: L.label, grade: L.grade, blocks, changes };
}

// 269: שאלות לדיון לפי תוכן השלב
const BY_METHOD = {
  "משחק תחרות": ["מה עזר לצוות שלכם להצליח, ומה הפריע?", "איך הרגשתם כשהפסדתם או כשניצחתם?", "מה הייתם משנים בצוות בפעם הבאה?"],
  "עשייה": ["מה היה הכי קשה בלעשות את זה ביחד?", "מה למדתם על עצמכם תוך כדי?", "איך חילקתם ביניכם את העבודה?"],
  "משחק הדמייה": ["איך הרגשתם בתפקיד שקיבלתם?", "מה הייתם עושים אחרת במצב אמיתי?", "מה הפתיע אתכם בהחלטות של האחרים?"],
  "הבעה יצירתית": ["מה רציתם להעביר ביצירה שלכם?", "מה ראיתם ביצירות של אחרים שלא חשבתם עליו?"],
  "ייצוג": ["מה גרם לכם לבחור את הדרך שבה הצגתם?", "מה הצופים הבינו, ומה פחות?"],
  "דיון בשאלה": ["מי שינה את דעתו במהלך הדיון, ולמה?", "איזה טיעון הכי שכנע אתכם?"],
  "שיתוף": ["מה הרגשתם כששיתפתם, ומה כשהקשבתם?", "מה שמעתם אצל מישהו אחר שנגע בכם?"],
  "חשיבה משותפת": ["איזה רעיון של מישהו אחר הפתיע אתכם?", "איך הגענו להחלטה, ומי לא נשמע?"],
  "הסבר": ["מה הדבר החשוב ביותר שלמדתם עכשיו?", "מה עדיין לא ברור לכם?"],
  "השראה": ["מה בסיפור תפס אתכם, ולמה?", "איפה אתם רואים דבר כזה אצלנו?"],
  "התבוננות": ["מה שמתם לב אליו שלא שמתם לב קודם?", "מה זה אומר עלינו?"],
  "פירוק": ["איזה חלק הכי חשוב כדי להבין את כל הנושא?", "מה קושר בין החלקים?"],
};
const BY_KIND = { open: ["מה אתם מצפים שיקרה היום?", "מה אתם יודעים כבר על הנושא?"], body: ["מה היה הרגע הכי מעניין עד עכשיו?"], peak: ["מה הרגשתם ברגע הזה?", "מה הוא אומר לכם על עצמכם?"], close: ["מה אתם לוקחים מהפעולה?", "מה אחד שאתם יכולים לעשות השבוע בעקבותיה?"], free: ["מה לדעתכם היה העיקר כאן?"] };
export function stageQuestions({ block, value, ageGroup, bank = [] }) {
  const text = `${block.title}\n${block.text}`;
  const methods = methodsIn(text).slice(0, 2).map((m) => m.name);
  const seed = crypto.createHash("sha1").update(text).digest().readUInt32BE(0);
  const pool = [];
  for (const m of methods) pool.push(...(BY_METHOD[m] || []).map((q) => ({ q, from: m })));
  pool.push(...(BY_KIND[block.kind] || BY_KIND.free).map((q) => ({ q, from: KIND_LABEL[block.kind] || "שלב" })));
  if (value) pool.push(...questionsFor(value, ageGroup).slice(0, 3).map((q) => ({ q, from: `ערך: ${value}` })));
  const picked = [];
  for (let i = 0; i < pool.length && picked.length < 5; i++) {
    const c = pool[(i * 3 + (seed % pool.length)) % pool.length];
    if (!picked.some((p) => p.q === c.q)) picked.push(c);
  }
  const young = /כיתה\s+(ג|ד|ה)['׳]/.test(ageGroup || "");
  const out = picked.slice(0, 3).map((p) => ({ ...p, q: young ? p.q.replace(/^מה (.*)\?$/, "מה $1?") : p.q }));
  return { questions: out, fromBank: bank.slice(0, 3) };
}

export function registerWriteV39Routes(app, { db, limiter, fail, requireUser }) {
  const lim = limiter(60_000, 60);
  const blockZ = z.object({ id: z.string().trim().min(1).max(24).default("x"), title: z.string().max(120).default(""), kind: z.enum(KINDS).default("free"), minutes: z.number().int().min(0).max(300).nullable().default(null), text: z.string().max(20000).default(""), note: z.string().max(5000).default("") });
  const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60) });

  app.post("/api/write/voice-check", requireUser(), lim, (req, res) => res.json(voiceCheck(docZ.parse(req.body ?? {}))));
  app.post("/api/write/safety", requireUser(), lim, (req, res) => res.json(safetyScan(docZ.parse(req.body ?? {}))));

  // 265: אנשי קשר לחירום, מוגדרים פעם אחת
  const emZ = z.object({ contacts: z.array(z.object({ name: z.string().trim().min(1).max(40), phone: z.string().trim().regex(/^[0-9+\-\s]{5,20}$/, "מספר טלפון לא תקין") })).max(6) });
  app.get("/api/write/emergency", requireUser(), lim, (req, res) => {
    let contacts = [];
    try {
      contacts = JSON.parse(getSet(db, `emergency.${req.user.id}`, "[]"));
    } catch {
      /* empty */
    }
    res.json({ contacts, national: [{ name: "מד״א", phone: "101" }, { name: "משטרה", phone: "100" }, { name: "כבאות והצלה", phone: "102" }] });
  });
  app.put("/api/write/emergency", requireUser(), lim, (req, res) => {
    const v = emZ.parse(req.body ?? {});
    putSet(db, `emergency.${req.user.id}`, JSON.stringify(v.contacts));
    res.json({ contacts: v.contacts });
  });

  app.post("/api/write/age-adapt", requireUser(), lim, (req, res) => {
    const v = z.object({ level: z.enum(["young", "mid", "old"]), doc: docZ }).parse(req.body ?? {});
    res.json(adaptToAge(v.doc, v.level));
  });
  app.post("/api/write/docs/:id/age-copy", requireUser(), limiter(60_000, 20), (req, res) => {
    const v = z.object({ level: z.enum(["young", "mid", "old"]) }).parse(req.body ?? {});
    const d = db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(Number(req.params.id), req.user.id);
    if (!d) return res.status(404).json(fail("NOT_FOUND", "המסמך לא נמצא"));
    if (db.prepare("SELECT COUNT(*) AS c FROM write_docs WHERE owner_id = ?").get(req.user.id).c >= 200) return res.status(409).json(fail("LIMIT", "הגעתם למספר המסמכים המרבי"));
    const doc = { title: d.title, meta: JSON.parse(d.meta_json), blocks: JSON.parse(d.blocks_json) };
    const r = adaptToAge(doc, v.level);
    const meta = { ...doc.meta, ageGroup: r.grade, template: false, archived: false, pinned: false, runs: [], date: "" };
    const blocks = r.blocks.map((b) => ({ ...b, id: crypto.randomBytes(5).toString("hex"), done: false }));
    const at = new Date().toISOString();
    const ins = db.prepare("INSERT INTO write_docs (owner_id, title, meta_json, blocks_json, rev, words, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)").run(req.user.id, `${d.title || "פעולה"} (${r.label.split(" ")[0]})`.slice(0, 120), JSON.stringify(meta), JSON.stringify(blocks), d.words, at, at);
    res.status(201).json({ id: Number(ins.lastInsertRowid), changes: r.changes.length });
  });

  // 269, 270
  app.post("/api/write/stage-questions", requireUser(), lim, (req, res) => {
    const v = z.object({ block: blockZ, value: z.string().trim().max(40).default(""), ageGroup: z.string().trim().max(40).default("") }).parse(req.body ?? {});
    const bank = db.prepare("SELECT id, text, uses FROM write_question_bank WHERE user_id = ? ORDER BY uses DESC, id DESC LIMIT 5").all(req.user.id);
    res.json(stageQuestions({ ...v, bank }));
  });
  app.get("/api/write/question-bank", requireUser(), lim, (req, res) => res.json(db.prepare("SELECT id, text, uses FROM write_question_bank WHERE user_id = ? ORDER BY uses DESC, id DESC LIMIT 100").all(req.user.id)));
  app.post("/api/write/question-bank", requireUser(), lim, (req, res) => {
    const v = z.object({ text: z.string().trim().min(5).max(200), used: z.boolean().default(false) }).parse(req.body ?? {});
    if (db.prepare("SELECT COUNT(*) AS c FROM write_question_bank WHERE user_id = ?").get(req.user.id).c >= 100) return res.status(409).json(fail("LIMIT", "הבנק מלא (100 שאלות). מחקו ישנות"));
    db.prepare("INSERT INTO write_question_bank (user_id, text, uses, created_at) VALUES (?,?,?,?) ON CONFLICT(user_id, text) DO UPDATE SET uses = uses + ?").run(req.user.id, v.text, v.used ? 1 : 0, new Date().toISOString(), v.used ? 1 : 0);
    res.status(201).json({ ok: true });
  });
  app.delete("/api/write/question-bank/:id", requireUser(), lim, (req, res) => {
    db.prepare("DELETE FROM write_question_bank WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });
}

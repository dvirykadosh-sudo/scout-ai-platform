// מעבדת סגנון (שלב 53, רעיונות 388–422): פירוק פעולה לגורמים, טביעת סגנון מדידה, ציון נאמנות, שכתוב וטיוטה לפי הסגנון.
// הכול כללים ומדידות על הטקסט עצמו, בלי מודל שפה. כשיש מפתח AI, כרטיס הסגנון (card) מועבר אליו כהנחיה.
import { keywordsFrom } from "./routes-write-v47.js";
import { gearList } from "./routes-write-v51.js";

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const plain = (t) => String(t || "").replace(/[#>|_`]/g, " ").replace(/\*\*/g, "");
const wordsOf = (t) => plain(t).split(/[\s,.;:!?()"'״׳\-–—•*/\\]+/).filter(Boolean);
const hasHeb = (w) => /[א-ת]/.test(w);
export const sentencesOf = (t) => plain(t).split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter((s) => wordsOf(s).length >= 2);
const per10 = (n, total) => (total ? round((n / total) * 10) : 0);
const count = (text, re) => (text.match(re) || []).length;
const top = (map, n = 8, min = 2) => [...map.entries()].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n);

const SLANG = ["יאללה", "אחלה", "וואלה", "סבבה", "בקטנה", "חבר'ה", "חבר׳ה", "מטורף", "אש", "נו", "בכיף", "כפרה", "אחי", "תותח", "מעולה", "חזק", "פיצוץ", "בומבה", "ממש"];
const FORMAL = ["יתבקשו", "במסגרת", "בהתאם", "לאחר מכן", "יוצגו", "ניתן", "על מנת", "יש לבצע", "הינו", "הנ\"ל", "בעקבות", "מטרת הפעילות", "החניכים יתבקשו"];
const COLLOQ = ["בואו", "נו", "ככה", "פשוט", "בקיצור", "אז", "קצת", "הרבה", "תראו", "תגידו", "אתם יודעים", "טוב"];
const SECOND = ["אתם", "תעשו", "תגידו", "תבקשו", "שימו", "בואו", "תנו", "תחשבו", "תספרו", "קחו", "תעמדו", "ספרו", "אמרו", "חשבו", "עמדו", "שבו", "כתבו", "דמיינו", "תדמיינו", "ספרו", "הסתכלו", "נסו", "בחרו", "חלקו", "הרימו", "עברו", "צאו", "לכו", "הקשיבו"];
const FIRST = ["אני", "אומר", "אבקש", "אציג", "אשאל", "אסביר", "אחלק", "אספר", "אפתח", "אסכם", "אעמיד", "אתחיל"];
const WE = ["אנחנו", "נעשה", "נשב", "נדבר", "נתחיל", "נבין", "ביחד", "יחד", "נסכם", "נבחר", "נחשוב"];
const IMPERSONAL = ["פותחים", "עומדים", "מחלקים", "מבקשים", "שואלים", "מסבירים", "מסכמים", "מתחילים", "חוזרים", "מחברים", "מציגים", "מעבירים", "מעמידים"];
const IMAGERY = ["כמו", "בדיוק כמו", "דמיינו", "תארו לעצמכם", "כאילו", "מסע", "הרפתקה", "סיפור"];
const CONNECT = ["ואז", "אחר כך", "בסוף", "קודם", "בהתחלה", "אחרי זה", "לפני", "בינתיים", "בשלב הבא", "ובסיום", "לבסוף"];
const CLOSERS = ["לסיכום", "בסיום", "נסכם", "מה למדנו", "מה לקחתם", "מה הייתם", "כל הכבוד", "תודה"];
const METHODS = [["משחק", /משחק|תחרות|מירוץ|קבוצות מתחרות/], ["דיון", /דיון|שיחה|נדבר|שאלה לדיון|מדברים/], ["הצגה", /הצגה|תפקידים|משחק תפקידים|מגלמים/], ["סיפור", /סיפור|מספרים|מספר|פעם/], ["כתיבה", /כותבים|כתבו|פתק|דף עבודה/], ["יצירה", /יצירה|מציירים|בונים|מכינים|פלקט/], ["תחנות", /תחנות|תחנה/], ["שיר", /שיר|שרים|מנגינה/], ["התנסות", /מתנסים|ניסוי|אתגר|משימה/], ["הרצאה/הסבר", /מסבירים|הסבר|מציג|מציגים/]];
const KIND_WORDS = { open: /פתיח|התחל|חימום|היכרות|פתיחה/, peak: /שיא|משחק מרכזי|פעולת שיא|הפעילות המרכזית/, close: /סיכום|סיום|סגירה|סוגרים|מעגל סיכום/, body: /גוף|דיון|הסבר|עיקר|חלק|תחנה|משחק|פעילות|נושא/ };
const STOP = new Set("של על את עם אל אני אתה אתם אנחנו הוא היא הם הן זה זו זאת אבל אם או כי גם לא כל כמו מה מי איך למה מתי איפה אחר אחרי לפני בין עוד רק כך כן יש אין היה היו להיות יהיה כדי שלא הזה הזו האלה אלה אותו אותה אותם ואז אז כאן שם פה לכם לנו להם שלנו שלכם עליו עליה בו בה בהם ממנו אחד אחת שני שתי".split(/\s+/));

const stageText = (b) => `${b.title || ""}\n${b.text || ""}`;

/** פיצול טקסט חופשי לשלבים לפי כותרות או לפי פסקאות. */
export function splitText(raw, fallbackTitle = "") {
  const lines = String(raw || "").replace(/\r/g, "").split("\n");
  const sections = [];
  let cur = null;
  let title = fallbackTitle;
  const head = (t) => {
    const s = t.replace(/[*_`#>]/g, "").trim();
    if (s.length === 0 || s.length > 48 || /[.!?]$/.test(s) && !/:$/.test(s)) return null;
    const m = s.replace(/^(\d+[.)]|שלב\s*\d*[:.)-]?)\s*/, "").replace(/[:\-–]\s*$/, "").trim();
    const isNum = /^(\d+[.)]|שלב\s*\d)/.test(s);
    if (isNum || /^(פתיח|פתיחת|גוף|דיון|משחק|שיא|סיכום|סיום|חימום|הסבר|תחנ|סגירה|היכרות)/.test(m) || /:$/.test(s)) return m || s;
    return null;
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (cur) cur.body.push(""); continue; }
    const h = head(t);
    if (h && !/^(מטרה|ציוד|בטיחות|ערך|גיל)\s*[:：]/.test(t)) { cur = { title: h, body: [] }; sections.push(cur); const mm = t.match(/(\d+)\s*(?:דק|דקות|')/); cur.minutes = mm ? Number(mm[1]) : null; continue; }
    if (cur) cur.body.push(line);
    else if (!title && t.length <= 100) title = t.replace(/[*_`#>]/g, "");
    else { cur = { title: "פתיחה", body: [line], minutes: null }; sections.push(cur); }
  }
  let blocks = sections.map((s) => ({ title: s.title, text: s.body.join("\n").trim(), minutes: s.minutes ?? null })).filter((s) => s.text || s.title);
  if (blocks.length < 2) {
    const paras = String(raw || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).filter((p) => p !== title);
    const n = Math.min(5, Math.max(2, paras.length));
    const per = Math.ceil(paras.length / n);
    blocks = Array.from({ length: n }, (_, i) => ({ title: ["פתיחה", "גוף", "המשך", "שיא", "סיכום"][i] || "שלב", text: paras.slice(i * per, (i + 1) * per).join("\n\n"), minutes: null })).filter((b) => b.text);
  }
  const k = blocks.length;
  return { title, blocks: blocks.slice(0, 40).map((b, i) => ({ id: `t${i}`, title: b.title, kind: kindOf(b.title, i, k), minutes: b.minutes, text: b.text.slice(0, 8000), note: "" })) };
}
function kindOf(title, i, n) {
  for (const k of ["peak", "close", "open"]) if (KIND_WORDS[k].test(title)) return k;
  if (i === 0) return "open";
  if (i === n - 1 && n > 2) return "close";
  return "body";
}

/** פירוק פעולה לגורמים (388). */
export function decompose(doc) {
  const blocks = doc.blocks;
  const all = [doc.title, ...blocks.map(stageText)].join("\n");
  const sents = sentencesOf(all);
  const goalLine = sents.find((s) => /מטרה|מטרת|נרצה ש|החניכים י/.test(s)) || "";
  const stages = blocks.map((b, i) => {
    const text = plain(b.text);
    const ss = sentencesOf(text);
    const questions = ss.filter((s) => /\?$/.test(s) || /^(מה|מי|איך|למה|מתי|איפה|האם|כמה)\s/.test(s));
    const speech = (b.text.match(/["״“][^"״”]{6,160}["״”]/g) || []).map((s) => s.slice(1, -1));
    const imperatives = ss.filter((s) => SECOND.some((v) => s.startsWith(v)) || IMPERSONAL.some((v) => s.startsWith(v)));
    const methods = METHODS.filter(([, re]) => re.test(stageText(b))).map(([m]) => m);
    return { n: i + 1, title: b.title || `שלב ${i + 1}`, kind: b.kind, minutes: b.minutes || 0, words: wordsOf(text).length, sentences: ss.length, questions: questions.slice(0, 6), speech: speech.slice(0, 4), instructions: imperatives.slice(0, 5), methods, hook: ss[0] || "" };
  });
  return {
    title: doc.title,
    value: doc.meta?.value || "",
    age: doc.meta?.ageGroup || "",
    goal: goalLine.slice(0, 200),
    equipment: gearList(doc).items.map((x) => x.item),
    safety: ["מדורה", "מים", "ריצה", "גובה", "חושך", "סכין", "אש", "טיול"].filter((w) => all.includes(w)),
    stages,
    opening: stages.find((s) => s.kind === "open")?.hook || stages[0]?.hook || "",
    peak: stages.find((s) => s.kind === "peak")?.title || "",
    closing: [...stages].reverse().find((s) => s.kind === "close")?.questions[0] || "",
    totalMinutes: stages.reduce((s, x) => s + x.minutes, 0),
  };
}

/** טביעת סגנון (389–402). */
export function fingerprint(doc) {
  const blocks = doc.blocks;
  const text = blocks.length ? blocks.map((b) => b.text).join("\n\n") : "";
  const full = plain(text);
  const ss = sentencesOf(text);
  const n = Math.max(1, ss.length);
  const lens = ss.map((s) => wordsOf(s).length).sort((a, b) => a - b);
  const ws = wordsOf(text);
  const c = (list) => ws.filter((w) => list.includes(w)).length + list.filter((p) => p.includes(" ") && full.includes(p)).length;
  const second = c(SECOND), first = c(FIRST), we = c(WE), impersonal = c(IMPERSONAL);
  const masc = count(full, /חניכים|כולם|הבנים|המדריכים|הילדים/g), fem = count(full, /חניכות|כולן|הבנות|המדריכות|הילדות/g);
  const inclusive = count(full, /חניכים וחניכות|כולם וכולן|הבנים והבנות|ילדים וילדות|\/ת\b|\(ה\)/g);
  const dominant = first > second && first > impersonal ? "first" : impersonal > second ? "impersonal" : we > second ? "we" : "second";
  const formal = FORMAL.filter((p) => full.includes(p)).length, colloq = COLLOQ.reduce((a, p) => a + count(full, new RegExp(`(?<![א-ת])${p}(?![א-ת])`, "g")), 0);
  const slangWords = SLANG.filter((p) => full.includes(p));
  const level = slangWords.length >= 3 || colloq / n > 0.25 ? "colloquial" : formal >= 2 ? "formal" : "neutral";
  const emojiList = [...new Set(full.match(/\p{Extended_Pictographic}/gu) || [])].slice(0, 8);
  const freq = new Map();
  const bi = new Map();
  let prev = "";
  for (const raw of ws) {
    const w = raw.replace(/[^א-ת]/g, "");
    if (!w || !hasHeb(w) || w.length < 3 || STOP.has(w)) { prev = ""; continue; }
    freq.set(w, (freq.get(w) || 0) + 1);
    if (prev) bi.set(`${prev} ${w}`, (bi.get(`${prev} ${w}`) || 0) + 1);
    prev = w;
  }
  const opener = new Map();
  for (const s of ss) { const w = wordsOf(s)[0]; if (w) opener.set(w, (opener.get(w) || 0) + 1); }
  const qs = ss.filter((s) => /\?$/.test(s));
  const openQ = qs.filter((s) => /^(מה|מי|איך|למה|מתי|איפה|כמה|באיזה|ספרו|תארו)/.test(s)).length;
  const lines = text.split("\n").filter((l) => l.trim());
  const bullets = lines.filter((l) => /^\s*([•\-*–])\s+/.test(l)).length, numbered = lines.filter((l) => /^\s*\d+[.)]\s+/.test(l)).length;
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  const bold = count(text, /\*\*[^*]+\*\*/g);
  const share = (x) => round(x / Math.max(1, lines.length), 2);
  const fmt = bullets / Math.max(1, lines.length) > 0.35 ? "bullets" : numbered / Math.max(1, lines.length) > 0.35 ? "numbered" : "paragraphs";
  const quoted = count(text, /["״“][^"״”]{6,160}["״”]/g);
  const imperatives = ss.filter((s) => SECOND.some((v) => s.startsWith(v)) || IMPERSONAL.some((v) => s.startsWith(v))).length;
  const humorMarks = count(full, /😂|🤣|חחח|הההה|:\)|;\)/g);
  const imagery = IMAGERY.reduce((a, p) => a + (full.includes(p) ? 1 : 0), 0);
  const methodsH = METHODS.map(([m, re]) => [m, blocks.filter((b) => re.test(stageText(b))).length]).filter(([, k]) => k > 0).sort((a, b) => b[1] - a[1]);
  const mins = blocks.map((b) => b.minutes || 0), totalMin = mins.reduce((a, b) => a + b, 0);
  const share2 = {};
  for (const k of ["open", "body", "peak", "close", "free"]) share2[k] = totalMin ? round(blocks.filter((b) => b.kind === k).reduce((a, b) => a + (b.minutes || 0), 0) / totalMin, 2) : 0;
  const connectors = CONNECT.map((p) => [p, count(full, new RegExp(p, "g"))]).filter(([, k]) => k > 0).sort((a, b) => b[1] - a[1]);
  const closers = CLOSERS.filter((p) => full.includes(p));
  return {
    version: 1, words: ws.length, sentences: ss.length,
    sentence: { avg: round(lens.reduce((a, b) => a + b, 0) / n), median: lens[Math.floor(n / 2)] || 0, p90: lens[Math.floor(n * 0.9)] || 0, shortShare: round(lens.filter((l) => l <= 6).length / n, 2), longShare: round(lens.filter((l) => l >= 20).length / n, 2) },
    address: { second, first, we, impersonal, masc, fem, inclusive, dominant, genderMode: inclusive > 0 ? "inclusive" : fem > masc ? "feminine" : masc > 0 ? "masculine" : "unknown" },
    register: { formal, colloq, slang: slangWords.length, slangWords, level },
    punct: { exclaimPer10: per10(count(full, /!/g), n), questionPer10: per10(count(full, /\?/g), n), ellipsisPer10: per10(count(full, /\.\.\.|…/g), n), dashPer10: per10(count(full, / [-–—] /g), n), parenPer10: per10(count(full, /\(/g), n), quotePer10: per10(quoted, n), emoji: emojiList.length ? count(full, /\p{Extended_Pictographic}/gu) : 0, emojiList },
    signature: { words: top(freq, 10).map(([w, k]) => ({ w, n: k })), phrases: top(bi, 6).map(([p, k]) => ({ p, n: k })) },
    openers: top(opener, 5).map(([w, k]) => ({ w, n: k })),
    questions: { total: qs.length, openShare: qs.length ? round(openQ / qs.length, 2) : 0, perStage: blocks.length ? round(qs.length / blocks.length) : 0 },
    format: { bulletShare: share(bullets), numberedShare: share(numbered), boldCount: bold, paragraphs: paras.length, avgParagraphWords: paras.length ? Math.round(ws.length / paras.length) : 0, dominant: fmt },
    humor: { markers: humorMarks, imagery, level: humorMarks >= 2 ? "high" : humorMarks + imagery >= 2 ? "light" : "none" },
    speech: { quoted, imperatives, speechShare: round(quoted / n, 2), imperativeShare: round(imperatives / n, 2) },
    methods: methodsH.map(([m, k]) => ({ m, n: k })),
    pace: { stages: blocks.length, totalMinutes: totalMin, avgMinutes: blocks.length ? round(totalMin / blocks.length) : 0, avgWordsPerStage: blocks.length ? Math.round(ws.length / blocks.length) : 0, minutesShare: share2 },
    connectors: connectors.slice(0, 5).map(([w, k]) => ({ w, n: k })), closers,
  };
}

const ADDR = { second: "פנייה ישירה לחניכים בלשון רבים ('בואו', 'ספרו')", first: "גוף ראשון של המדריך ('אני אבקש', 'אשאל')", impersonal: "הוראות כלליות ('פותחים', 'מחלקים')", we: "לשון 'אנחנו' ('נתחיל', 'נדבר')" };
const REG = { formal: "רשמי וענייני", neutral: "ניטרלי וברור", colloquial: "דיבורי וקליל" };
const FMT = { bullets: "תבליטים קצרים", numbered: "רשימות ממוספרות", paragraphs: "פסקאות רציפות" };

/** תיאור קריא של הטביעה (407, "למה זה נשמע ככה"). */
export function describe(fp) {
  const out = [];
  out.push(`משפט ממוצע של ${fp.sentence.avg} מילים (חציון ${fp.sentence.median}). ${fp.sentence.shortShare >= 0.4 ? "הרבה משפטים קצרים וקצביים." : fp.sentence.longShare >= 0.25 ? "יש משפטים ארוכים ומפורטים." : "אורך משפטים מאוזן."}`);
  out.push(`פנייה: ${ADDR[fp.address.dominant]}${fp.address.genderMode === "inclusive" ? ", עם לשון מכלילה (חניכים וחניכות)" : fp.address.genderMode === "feminine" ? ", בלשון נקבה" : fp.address.genderMode === "masculine" ? ", בלשון זכר" : ""}.`);
  out.push(`רישום: ${REG[fp.register.level]}${fp.register.slangWords.length ? ` (סלנג: ${fp.register.slangWords.slice(0, 4).join(", ")})` : ""}.`);
  out.push(`פיסוק: ${fp.punct.exclaimPer10} סימני קריאה ו-${fp.punct.questionPer10} שאלות לכל 10 משפטים${fp.punct.emojiList.length ? `, אימוג'י: ${fp.punct.emojiList.join(" ")}` : ""}.`);
  out.push(`עיצוב: ${FMT[fp.format.dominant]}.`);
  if (fp.questions.total) out.push(`שאלות: ${fp.questions.perStage} בשלב בממוצע, ${Math.round(fp.questions.openShare * 100)}% פתוחות.`);
  if (fp.signature.words.length) out.push(`מילים חוזרות: ${fp.signature.words.slice(0, 6).map((x) => x.w).join(", ")}.`);
  if (fp.openers.length) out.push(`פותח משפטים ב: ${fp.openers.slice(0, 3).map((x) => x.w).join(", ")}.`);
  if (fp.humor.level !== "none") out.push(fp.humor.level === "high" ? "הומור גלוי." : "נגיעות של דימויים והומור.");
  if (fp.speech.quoted) out.push(`כותב גם מה המדריך אומר בציטוט (${fp.speech.quoted} פעמים).`);
  return out;
}

/** משפטים מייצגים: הכי קרובים לאורך החציוני ועם מילות חתימה (407). */
export function exemplars(doc, fp, k = 3) {
  const sigs = new Set(fp.signature.words.map((x) => x.w));
  const ss = sentencesOf(doc.blocks.map((b) => b.text).join("\n\n")).filter((s) => { const l = wordsOf(s).length; return l >= 5 && l <= 28; });
  return ss.map((s) => ({ s, score: -Math.abs(wordsOf(s).length - fp.sentence.avg) + wordsOf(s).filter((w) => sigs.has(w)).length * 2 })).sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.s.slice(0, 160));
}

/** כרטיס סגנון להנחיית מודל (407). */
export function styleCard(doc, fp) {
  const ex = exemplars(doc, fp);
  const lines = [
    "כתוב בדיוק בסגנון של המדריך הזה. אלה מדידות מתוך הפעולה שלו, ואין לסטות מהן:",
    `- משפט ממוצע ${fp.sentence.avg} מילים; ${fp.sentence.shortShare >= 0.4 ? "הרבה משפטים קצרים" : "משפטים באורך בינוני"}; משפט ארוך לא עולה על ${Math.max(14, fp.sentence.p90)} מילים.`,
    `- ${ADDR[fp.address.dominant]}.${fp.address.genderMode === "inclusive" ? " לשון מכלילה: חניכים וחניכות." : ""}`,
    `- רישום ${REG[fp.register.level]}.${fp.register.slangWords.length ? ` מילים מותרות: ${fp.register.slangWords.join(", ")}.` : " בלי סלנג."}`,
    `- סימני קריאה: ${fp.punct.exclaimPer10 >= 2 ? "הרבה" : fp.punct.exclaimPer10 >= 0.7 ? "מעט" : "כמעט בלי"}; שאלות: ${fp.questions.perStage || 1} בשלב, ${fp.questions.openShare >= 0.5 ? "פתוחות" : "גם שאלות סגורות"}.`,
    `- עיצוב: ${FMT[fp.format.dominant]}.`,
  ];
  if (fp.openers.length) lines.push(`- משפטים נפתחים לעיתים קרובות ב: ${fp.openers.slice(0, 4).map((x) => x.w).join(", ")}.`);
  if (fp.signature.words.length) lines.push(`- מילים וביטויים אופייניים לשלב: ${[...fp.signature.words.slice(0, 6).map((x) => x.w), ...fp.signature.phrases.slice(0, 3).map((x) => x.p)].join(", ")}.`);
  if (fp.speech.quoted) lines.push("- לציין בציטוט מה המדריך אומר בפועל.");
  if (fp.humor.level !== "none") lines.push("- לשמור על נגיעות הומור ודימויים.");
  if (fp.punct.emojiList.length) lines.push(`- אימוג'י מותרים: ${fp.punct.emojiList.join(" ")}.`);
  if (ex.length) lines.push("דוגמאות למשפטים שלו:", ...ex.map((e, i) => `${i + 1}. ${e}`));
  return lines.join("\n").slice(0, 2900);
}

/** ציון נאמנות לסגנון (403). */
export function styleScore(target, cand) {
  const gaps = [];
  let pen = 0;
  const add = (w, ok, text) => { if (!ok) { pen += w; gaps.push(text); } };
  const ratio = cand.sentence.avg && target.sentence.avg ? cand.sentence.avg / target.sentence.avg : 1;
  add(18, ratio >= 0.75 && ratio <= 1.3, ratio > 1.3 ? `המשפטים ארוכים מהרגיל שלך (${cand.sentence.avg} לעומת ${target.sentence.avg} מילים). כדאי לפצל.` : `המשפטים קצרים מהרגיל שלך (${cand.sentence.avg} לעומת ${target.sentence.avg}).`);
  add(14, cand.address.dominant === target.address.dominant, `הפנייה שונה: אצלך ${ADDR[target.address.dominant]}.`);
  add(8, target.address.genderMode === "unknown" || cand.address.genderMode === target.address.genderMode || cand.address.genderMode === "unknown", "לשון הפנייה (זכר/נקבה/מכלילה) שונה מהרגילה שלך.");
  add(12, cand.register.level === target.register.level, `הרישום שונה: אצלך ${REG[target.register.level]}.`);
  add(10, Math.abs(cand.punct.exclaimPer10 - target.punct.exclaimPer10) <= 2, `סימני הקריאה לא תואמים (אצלך ${target.punct.exclaimPer10} לכל 10 משפטים).`);
  add(8, Math.abs(cand.questions.perStage - target.questions.perStage) <= 1.5, `מספר השאלות בשלב שונה (אצלך ${target.questions.perStage}).`);
  add(10, cand.format.dominant === target.format.dominant, `העיצוב שונה: אצלך ${FMT[target.format.dominant]}.`);
  const ts = new Set(target.signature.words.map((x) => x.w)), cs = new Set(cand.signature.words.map((x) => x.w));
  const inter = [...ts].filter((w) => cs.has(w)).length;
  add(10, ts.size === 0 || inter / ts.size >= 0.2, `חסרות המילים האופייניות שלך: ${[...ts].slice(0, 4).join(", ")}.`);
  const to = new Set(target.openers.map((x) => x.w));
  add(6, to.size === 0 || cand.openers.some((x) => to.has(x.w)), `אין פתיחות משפט מהסוג שלך (${[...to].slice(0, 3).join(", ")}).`);
  add(4, target.humor.level === "none" || cand.humor.level !== "none", "חסרים ההומור והדימויים שאתה משתמש בהם.");
  return { score: Math.max(0, 100 - pen), level: pen <= 15 ? "נאמן מאוד" : pen <= 40 ? "דומה" : "שונה", gaps };
}

const FORMAL_MAP = [[/יתבקשו/g, "נבקש מהם"], [/במסגרת הפעילות/g, "בפעולה"], [/לאחר מכן/g, "אחר כך"], [/על מנת ל/g, "כדי ל"], [/ניתן ל/g, "אפשר ל"], [/יש לבצע/g, "עושים"], [/בהתאם ל/g, "לפי "]];
const splitAt = (s, maxWords) => {
  const w = s.split(" ");
  if (w.length <= maxWords) return [s];
  const mid = Math.floor(w.length / 2);
  let best = -1;
  for (let i = 0; i < w.length - 1; i++) if (/[,،]$/.test(w[i]) || w[i + 1] === "ואז" || (w[i + 1].startsWith("ו") && w[i + 1].length > 3)) if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  if (best < 3 || best > w.length - 4) return [s];
  const a = w.slice(0, best + 1).join(" ").replace(/[,،]$/, "") + ".";
  let b = w.slice(best + 1).join(" ");
  if (b.startsWith("ואז ")) b = b.slice(4);
  return [a, b.charAt(0) + b.slice(1)];
};

/** שכתוב טקסט לכיוון הסגנון (404). כללים בלבד, לא כתיבה חופשית. */
export function rewriteTowards(target, text) {
  const changes = [];
  let t = String(text || "");
  const before = fingerprint({ blocks: [{ text: t, kind: "free", title: "", minutes: null }] });
  if (target.register.level !== "formal") {
    let n = 0;
    for (const [re, to] of FORMAL_MAP) t = t.replace(re, () => { n++; return to; });
    if (n) changes.push(`הוחלפו ${n} ניסוחים רשמיים בניסוח יומיומי`);
  }
  const paras = t.split(/\n/);
  const out = paras.map((line) => {
    if (/^\s*([•\-*]|\d+[.)])\s/.test(line) || !line.trim()) return line;
    let ss = line.split(/(?<=[.!?])\s+/);
    if (target.sentence.avg && before.sentence.avg > target.sentence.avg * 1.3) {
      const lim = Math.max(8, Math.round(target.sentence.avg * 1.4));
      const next = ss.flatMap((s) => splitAt(s, lim));
      if (next.length !== ss.length) { changes.push(`פוצלו ${next.length - ss.length} משפטים ארוכים`); ss = next; }
    } else if (target.sentence.avg && before.sentence.avg < target.sentence.avg * 0.75 && ss.length > 1) {
      const merged = [];
      let m = 0;
      for (const s of ss) {
        const last = merged[merged.length - 1];
        if (last && wordsOf(last).length <= 5 && wordsOf(s).length <= 8 && /\.$/.test(last)) { merged[merged.length - 1] = last.replace(/\.$/, ",") + " " + s; m++; } else merged.push(s);
      }
      if (m) { changes.push(`אוחדו ${m} משפטים קצרים`); ss = merged; }
    }
    return ss.join(" ");
  });
  t = out.join("\n");
  if (target.punct.exclaimPer10 >= 2 && before.punct.exclaimPer10 < 1) {
    let n = 0;
    t = t.split("\n").map((l) => { const ss = l.split(/(?<=[.!?])\s+/); return ss.map((s) => (/\.$/.test(s) && SECOND.some((v) => s.startsWith(v)) && n < 6 ? (n++, s.replace(/\.$/, "!")) : s)).join(" "); }).join("\n");
    if (n) changes.push(`נוספו ${n} סימני קריאה להוראות`);
  } else if (target.punct.exclaimPer10 < 0.5 && before.punct.exclaimPer10 > 1.5) {
    const n = count(t, /!/g);
    t = t.replace(/!/g, ".");
    changes.push(`הוסרו ${n} סימני קריאה`);
  }
  if (target.format.dominant === "bullets" && before.format.dominant === "paragraphs") {
    t = t.split("\n").map((l) => { if (!l.trim() || /^\s*([•\-*]|\d+[.)])\s/.test(l)) return l; const ss = l.split(/(?<=[.!?])\s+/); return ss.length >= 3 ? ss.map((s) => `• ${s}`).join("\n") : l; }).join("\n");
    if (t.includes("•")) changes.push("הפסקאות הפכו לתבליטים");
  } else if (target.format.dominant === "paragraphs" && before.format.dominant === "bullets") {
    t = t.split("\n").map((l) => l.replace(/^\s*([•\-*]|\d+[.)])\s+/, "")).join(" ").replace(/\s{2,}/g, " ");
    changes.push("התבליטים אוחדו לפסקה");
  }
  return { text: t, changes, note: changes.length ? "השכתוב מבוסס כללים (אורך משפט, ניסוח רשמי, פיסוק ועיצוב). אפשר לשלב עם כרטיס הסגנון במודל AI לשכתוב עמוק יותר." : "לא נמצאו התאמות אוטומטיות. הטקסט כבר קרוב לסגנון שלך." };
}

/** טיוטה חדשה מהשלד של פעולה קיימת ובסגנון שלה (405). */
export function draftFromSkeleton(dec, fp, { topic, value }) {
  const t = topic || dec.title || "הנושא";
  const v = value || dec.value || "הערך";
  const ex = fp.punct.exclaimPer10 >= 2 ? "!" : ".";
  const D = fp.address.dominant;
  const say = (second, first, imp) => ({ second, first, impersonal: imp, we: second }[D === "we" ? "we" : D] ?? second);
  const T = {
    open: [say(`בואו נתחיל: מה אתם חושבים כשאני אומר "${t}"?`, `אני אשאל: מה עולה לכם כשאני אומר "${t}"?`, `פותחים בשאלה: מה עולה בראש כששומעים "${t}"?`)],
    body: [say(`חלקו לקבוצות וחשבו יחד: איפה אתם פוגשים את ${v} בחיים שלכם?`, `אחלק לקבוצות ואבקש מכל אחת לחשוב איפה היא פוגשת ${v}.`, `מחלקים לקבוצות. כל קבוצה חושבת איפה היא פוגשת ${v}.`)],
    peak: [say(`עכשיו האתגר: כל קבוצה מציגה במשחק קצר איך נראית ${v} בפועל${ex}`, `אציג אתגר: כל קבוצה תציג בתנועה איך נראית ${v}${ex}`, `שיא הפעולה: כל קבוצה מציגה בתנועה איך נראית ${v}${ex}`)],
    close: [say(`נסכם: מה לקחתם איתכם על ${t}?`, `אסכם בשאלה: מה לקחתם איתכם על ${t}?`, `מסכמים בשאלה: מה לוקחים מהפעולה על ${t}?`)],
    free: [say(`נמשיך עם ${t}.`, `אמשיך עם ${t}.`, `ממשיכים עם ${t}.`)],
  };
  const opener = fp.openers[0]?.w;
  const sigs = [...fp.signature.words.slice(0, 4).map((x) => x.w), ...fp.signature.phrases.slice(0, 2).map((x) => x.p)];
  const bulletize = fp.format.dominant === "bullets";
  const blocks = dec.stages.map((s, i) => {
    const base = T[s.kind] ?? T.free;
    const extra = s.questions.length ? say(`שאלה לדיון: ${s.questions[0].replace(/[א-ת]+(?=\?)/, "").trim() ? "מה זה אומר עליכם?" : "מה דעתכם?"}`, "אשאל: מה זה אומר עליכם?", "שאלה לדיון: מה זה אומר עלינו?") : "";
    const lines = [...base, ...(extra ? [extra] : []), ...(fp.speech.quoted ? [`המדריך אומר: "${say("בואו נראה מה יוצא לנו", "בואו נראה מה יוצא לנו", "נראה מה יוצא")}"`] : [])];
    return { id: `d${i}`, title: s.title, kind: s.kind, minutes: s.minutes || null, text: (bulletize ? lines.map((l) => `• ${l}`) : lines).join("\n"), note: `טיוטה לפי השלד והסגנון שלך. ${opener ? `נסו לפתוח משפטים ב"${opener}". ` : ""}${sigs.length ? `ביטויים אופייניים לשלב: ${sigs.join(", ")}.` : ""}` };
  });
  return { title: `${t}${dec.title && dec.title !== t ? "" : ""}`, blocks };
}

/** בדיקות עומק ופירוק מורחב (408–416). */
export function review(doc, libraryStats = null, libraryKeywordSets = []) {
  const dec = decompose(doc);
  const text = doc.blocks.map(stageText).join(" ");
  const checks = [
    ["goal", "מוגדרת מטרה", !!dec.goal],
    ["value", "מוגדר ערך מוביל", !!dec.value],
    ["age", "מוגדר גיל", !!dec.age],
    ["equipment", "אפשר לזהות ציוד", dec.equipment.length > 0 || /אין צורך בציוד|בלי ציוד/.test(text)],
    ["safety", "יש התייחסות לבטיחות", dec.safety.length === 0 || /בטיחות|זהירות|אישור|מבוגר אחראי/.test(text)],
    ["times", "לכל שלב מוגדר זמן", dec.stages.every((s) => s.minutes > 0)],
    ["questions", "יש שאלה לפחות בשליש מהשלבים", dec.stages.filter((s) => s.questions.length).length >= Math.ceil(dec.stages.length / 3)],
    ["close", "יש שלב סיכום", dec.stages.some((s) => s.kind === "close")],
    ["peak", "יש שלב שיא", dec.stages.some((s) => s.kind === "peak")],
  ];
  const complete = Math.round((checks.filter((c) => c[2]).length / checks.length) * 100);
  const val = dec.value ? dec.value.split(/\s+/)[0] : "";
  const mention = val ? dec.stages.filter((_, i) => stageText(doc.blocks[i]).includes(val)) : [];
  const consistency = val ? { value: val, covered: mention.length, total: dec.stages.length, missing: dec.stages.filter((s, i) => !stageText(doc.blocks[i]).includes(val)).map((s) => s.title).slice(0, 6) } : null;
  const concepts = dec.stages.map((s, i) => ({ stage: s.title, words: keywordsFrom({ title: "", blocks: [doc.blocks[i]] }, 4).map((k) => k.word) }));
  const kws = new Set(keywordsFrom(doc, 20).map((k) => k.word));
  let similar = [];
  for (const l of libraryKeywordSets) {
    const inter = [...kws].filter((w) => l.words.has(w)).length;
    const j = inter / Math.max(1, kws.size + l.words.size - inter);
    if (j > 0.12) similar.push({ id: l.id, title: l.title, similarity: Math.round(j * 100) });
  }
  similar = similar.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  const total = dec.totalMinutes;
  const realistic = total ? { planned: total, withTransitions: total + Math.max(0, dec.stages.length - 1) * 1 + 3, note: "מוסיף דקה למעבר בין שלבים ושלוש דקות להתארגנות" } : null;
  const tips = [];
  for (const c of checks) if (!c[2]) tips.push({ key: c[0], text: `חסר: ${c[1]}` });
  if (consistency && consistency.covered < Math.ceil(consistency.total / 2)) tips.push({ key: "valueweak", text: `הערך "${val}" מופיע רק ב-${consistency.covered} מתוך ${consistency.total} שלבים. קשרו אותו לשלבים נוספים.` });
  if (similar[0] && similar[0].similarity >= 40) tips.push({ key: "similar", text: `הפעולה דומה ב-${similar[0].similarity}% ל"${similar[0].title}" במאגר. כדאי להבליט מה ייחודי בה.` });
  const compare = libraryStats ? { stages: { mine: dec.stages.length, avg: libraryStats.stages }, minutes: { mine: total, avg: libraryStats.minutes }, perStage: { mine: dec.stages.length ? round(total / dec.stages.length) : 0, avg: libraryStats.perStage } } : null;
  const tags = [...new Set([...fingerprint(doc).methods.map((m) => m.m), ...[...kws].slice(0, 5)])].slice(0, 8);
  return { completeness: { score: complete, checks: checks.map(([key, label, ok]) => ({ key, label, ok })) }, consistency, concepts, similar, realistic, compare, tips: tips.slice(0, 3), allTips: tips, tags };
}

/** מיזוג שתי טביעות במשקל (406). */
export function mergeFingerprints(a, b, w = 0.5) {
  const mix = (x, y) => (typeof x === "number" && typeof y === "number" ? round(x * (1 - w) + y * w, 2) : w >= 0.5 ? y : x);
  const walk = (x, y) => {
    if (Array.isArray(x) || Array.isArray(y)) return w >= 0.5 ? y : x;
    if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).map((k) => [k, walk(x[k], y?.[k])]));
    return mix(x, y);
  };
  const m = walk(a, b);
  m.signature = { words: [...a.signature.words.slice(0, 5), ...b.signature.words.slice(0, 5)].filter((x, i, arr) => arr.findIndex((y) => y.w === x.w) === i), phrases: [...a.signature.phrases.slice(0, 3), ...b.signature.phrases.slice(0, 3)] };
  m.openers = [...a.openers.slice(0, 3), ...b.openers.slice(0, 3)].filter((x, i, arr) => arr.findIndex((y) => y.w === x.w) === i);
  m.address.dominant = w >= 0.5 ? b.address.dominant : a.address.dominant;
  m.register.level = w >= 0.5 ? b.register.level : a.register.level;
  m.format.dominant = w >= 0.5 ? b.format.dominant : a.format.dominant;
  m.address.genderMode = w >= 0.5 ? b.address.genderMode : a.address.genderMode;
  return m;
}

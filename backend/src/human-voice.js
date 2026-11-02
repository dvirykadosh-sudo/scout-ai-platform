// שלב 56 (455–458, 461–464, 466): הקול האנושי. מנוע כללים בלבד, בלי מודל שפה:
// ניקוי תמלול, רגיסטר דיבורי/רשמי, קלישאות, פרטים חסרים, הוראות במה, בדיקת הקראה, מדד חום ומילון אישי.
// כל התוצאות הן הצעות: הכללים מזהים צורה של טקסט ולא מבינים משמעות.

const HE = "א-ת";
const PREFIX = "[ובהלמכש]{0,3}";
const WORD_RE = /[א-ת֑-ׇA-Za-z0-9]+(?:['׳"״\-־][א-ת֑-ׇA-Za-z0-9]+)*/g;

export const wordsOf = (t) => String(t || "").match(WORD_RE) || [];
export const countWords = (t) => wordsOf(t).length;
export const tidy = (t) =>
  String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])(?=[א-ת])/g, "$1 ")
    .replace(/^[,;: ]+/gm, "")
    .trim();

/** מפצל למשפטים (שומר סימני פיסוק). שורה חדשה היא תמיד גבול. */
export function splitSentences(text) {
  const out = [];
  for (const para of String(text || "").split(/\n+/)) {
    const m = para.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g);
    if (m) for (const s of m) { const t = s.trim(); if (t) out.push(t); }
  }
  return out;
}

const re = (p, flags = "g", open = false) => new RegExp(`(?<![${HE}])(?:${p})${open ? "" : `(?![${HE}])`}`, flags);
const stripP = (w) => w.replace(/^[^א-תA-Za-z0-9]+|[^א-תA-Za-z0-9]+$/g, "");

// ───────────── 455: ניקוי תמלול מדובר ─────────────

const VOCAL = /^(?:א+|אה+|אמ+|אממ+|הממ+|הה+|מממ+|איי+|אההה*|u+h+|u+m+|e+h+|e+r+m*)$/i;
const SOFT = new Set(["כאילו", "יעני", "בעצם", "ממש", "פשוט", "נו", "אוקיי", "אוקי"]);
const EMPHASIS = new Set(["מאוד", "ממש", "יפה", "לאט", "עוד", "רגע", "שוב", "חזק", "ביחד", "בשקט", "כן", "לא", "די", "אולי", "נו", "הלאה"]);
const BREAKERS = new Set(["ואז", "אחר", "פתאום", "בסוף", "לבסוף", "אבל", "אז", "בהתחלה", "אחרי", "לפני"]);
const QWORDS = new Set(["מה", "למה", "איך", "מי", "איפה", "מתי", "כמה", "האם", "מדוע", "לאן", "מאיפה", "איזה", "איזו", "מהי", "מהו"]);

export function cleanTranscript(text) {
  const src = String(text || "").replace(/\r/g, "").trim();
  const removed = [];
  const paras = src.split(/\n+/);
  const outParas = [];
  let punctAdded = 0;
  for (const para of paras) {
    const toks = para.split(/\s+/).filter(Boolean);
    const kept = [];
    let sinceSoft = 99;
    for (const tok of toks) {
      const w = stripP(tok);
      if (w && VOCAL.test(w)) { removed.push(w); continue; }
      if (w && SOFT.has(w)) {
        if (sinceSoft < 40) { removed.push(w); continue; }
        sinceSoft = 0;
      } else sinceSoft++;
      const prev = kept.length ? stripP(kept[kept.length - 1]) : "";
      if (w && prev === w && !EMPHASIS.has(w) && !/[,.!?…]$/.test(kept[kept.length - 1])) { removed.push(w); continue; }
      kept.push(tok);
    }
    outParas.push(kept);
  }
  const rebuilt = outParas.map((kept) => {
    const joined = kept.join(" ");
    const terminals = (joined.match(/[.!?…]/g) || []).length;
    if (kept.length >= 12 && terminals < kept.length / 28) {
      // תמלול בלי פיסוק: שוברים למשפטים ומסמנים שאלות
      const sents = [];
      let cur = [];
      for (const tok of kept) {
        const w = stripP(tok);
        const isBreaker = BREAKERS.has(w) || /^כש(?![רלת])[א-ת]{3,}$/.test(w);
        if (cur.length >= 9 && isBreaker) {
          // "ואז פתאום": הגבול לפני "ואז", לא ביניהם
          const last = stripP(cur[cur.length - 1] || "");
          const carry = BREAKERS.has(last) && cur.length > 1 ? [cur.pop()] : [];
          sents.push(cur); cur = carry;
        }
        cur.push(tok);
      }
      if (cur.length) sents.push(cur);
      return sents.map((s) => {
        let line = s.join(" ").replace(/[,;:]+$/, "");
        const q = QWORDS.has(stripP(s[0] || ""));
        punctAdded++;
        return /[.!?…]$/.test(line) ? line : line + (q ? "?" : ".");
      }).join(" ");
    }
    if (joined && !/[.!?…"”)]$/.test(joined) && kept.length >= 4) { punctAdded++; return joined.replace(/[,;:]+$/, "") + (QWORDS.has(stripP(kept[0])) ? "?" : "."); }
    return joined;
  }).filter(Boolean);
  const tally = {};
  for (const w of removed) tally[w] = (tally[w] || 0) + 1;
  return { text: tidy(rebuilt.join("\n")), removed: removed.length, fillers: Object.entries(tally).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count), punctAdded, before: countWords(src), after: countWords(rebuilt.join(" ")) };
}

// ───────────── 456: דיבורי ↔ רשמי ─────────────

const TO_SPOKEN = [
  [`ו?(?:לכן|על\\s+כן|לפיכך|משום\\s+כך)`, "אז", "לכן ← אז"],
  [`(?:אולם|ברם|אך|עם\\s+זאת)`, "אבל", "אולם / אך / עם זאת ← אבל"],
  [`(?:כמו\\s+כן|בנוסף\\s+לכך|יתרה\\s+מכך|יתרה\\s+מזאת)`, "וגם", "כמו כן ← וגם"],
  [`במהלך`, "בזמן", "במהלך ← בזמן"],
  [`לעיתים|לעתים`, "לפעמים", "לעיתים ← לפעמים"],
  [`ברצוני`, "אני רוצה", "ברצוני ← אני רוצה"],
  [`מבלי`, "בלי", "מבלי ← בלי"],
  [`אודות`, "על", "אודות ← על"],
  [`בסופו\\s+של\\s+(?:דבר|יום)`, "בסוף", "בסופו של דבר ← בסוף"],
  [`לאחר\\s+מכן`, "אחר כך", "לאחר מכן ← אחר כך"],
  [`לאחר`, "אחרי", "לאחר ← אחרי"],
  [`טרם`, "לפני", "טרם ← לפני"],
  [`ישנם|ישנן`, "יש", "ישנם ← יש"],
  [`נדרשים`, "צריכים", "נדרשים ← צריכים"],
  [`נדרשות`, "צריכות", "נדרשות ← צריכות"],
  [`נדרש`, "צריך", "נדרש ← צריך"],
  [`אינו|אינה|אינם|אינן`, "לא", "אינו ← לא"],
  [`הינו`, "הוא", "הינו ← הוא"],
  [`הינה`, "היא", "הינה ← היא"],
  [`הינם`, "הם", "הינם ← הם"],
  [`הינן`, "הן", "הינן ← הן"],
  [`זאת\\s+ועוד`, "ועוד דבר", "זאת ועוד ← ועוד דבר"],
  [`לאור\\s+זאת`, "בגלל זה", "לאור זאת ← בגלל זה"],
  [`לשם\\s+כך`, "בשביל זה", "לשם כך ← בשביל זה"],
  [`על\\s+מנת`, "כדי", "על מנת ← כדי"],
];

const TO_FORMAL_SIMPLE = [
  [`כאילו|יעני`, "", "הסרת 'כאילו'"],
  [`ממש`, "", "הסרת 'ממש'"],
  [`לפעמים`, "לעיתים", "לפעמים ← לעיתים"],
  [`אחר\\s+כך`, "לאחר מכן", "אחר כך ← לאחר מכן"],
];

const applyList = (text, list) => {
  let t = text;
  const changes = [];
  for (const [pat, to, label] of list) {
    let n = 0;
    t = t.replace(re(pat), () => { n++; return to; });
    if (n) changes.push({ label, count: n });
  }
  return { t, changes };
};

const SLANG = ["יאללה", "אחי", "וואלה", "סבבה", "אחלה", "תכלס", "חבר'ה", "מטורף", "אש"];

export function shiftRegister(text, level = 1) {
  const src = tidy(text);
  if (level === 1) return { text: src, changes: [], level, flags: [] };
  if (level >= 2) {
    let { t, changes } = applyList(src, TO_SPOKEN);
    // "כאשר" ← "כש", "אשר" ← "ש" (מצמידים למילה הבאה)
    let n = 0;
    t = t.replace(new RegExp(`(?<![${HE}])כאשר\\s+(?=[${HE}])`, "g"), () => { n++; return "כש"; });
    if (n) changes.push({ label: "כאשר ← כש", count: n });
    n = 0;
    t = t.replace(new RegExp(`(?<=[${HE}])\\s+אשר\\s+(?=[${HE}])`, "g"), () => { n++; return " ש"; });
    if (n) changes.push({ label: "אשר ← ש", count: n });
    n = 0;
    t = t.replace(new RegExp(`(?<![${HE}])במידה\\s+ו(?=[${HE}])`, "g"), () => { n++; return "אם "; });
    if (n) changes.push({ label: "במידה ו ← אם", count: n });
    // פיצול משפטים ארוכים בפסיק לפני מילת חיבור
    let splits = 0;
    const paras = t.split(/\n/).map((para) => splitSentences(para).map((s) => {
      const w = s.split(/\s+/);
      if (w.length <= 24) return s;
      const mid = Math.floor(w.length / 2);
      let best = -1;
      for (let i = 0; i < w.length - 1; i++) {
        if (!/,$/.test(w[i])) continue;
        if (!/^(?:ו|אבל|אז|כי|ש|אחרי)/.test(stripP(w[i + 1]))) continue;
        if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
      }
      if (best < 0) return s;
      splits++;
      w[best] = w[best].replace(/,$/, ".");
      return w.join(" ");
    }).join(" "));
    if (splits) changes.push({ label: "פיצול משפטים ארוכים", count: splits });
    return { text: tidy(paras.join("\n")), changes, level, flags: [] };
  }
  // רשמי
  let { t, changes } = applyList(src, TO_FORMAL_SIMPLE);
  let n = 0;
  t = t.replace(new RegExp(`(^|[.!?]\\s+|,\\s+)אבל(?![${HE}])`, "gm"), (_, p) => { n++; return `${p}אך`; });
  if (n) changes.push({ label: "אבל ← אך", count: n });
  n = 0;
  t = t.replace(new RegExp(`(?<![${HE}])אחרי\\s+ש`, "g"), () => { n++; return "לאחר ש"; });
  if (n) changes.push({ label: "אחרי ש ← לאחר ש", count: n });
  n = 0;
  t = t.replace(new RegExp(`(?<![${HE}])בלי\\s+ש`, "g"), () => { n++; return "מבלי ש"; });
  if (n) changes.push({ label: "בלי ש ← מבלי ש", count: n });
  n = 0;
  t = t.replace(new RegExp(`(^|[.!?]\\s+)בסוף(?![${HE}])`, "gm"), (_, p) => { n++; return `${p}לבסוף`; });
  if (n) changes.push({ label: "בסוף ← לבסוף", count: n });
  const flags = SLANG.filter((s) => src.includes(s));
  return { text: tidy(t), changes, level, flags };
}

// ───────────── 457: קלישאות ומבנים רובוטיים ─────────────

const CLICHES = [
  { p: `על\\s+מנת`, to: "כדי", why: "ניסוח רשמי. מדברים 'כדי'" },
  { p: `בסופו\\s+של\\s+(?:דבר|יום)`, to: "בסוף", why: "ניסוח רשמי. מדברים 'בסוף'" },
  { p: `הלכה\\s+למעשה`, to: "בפועל", why: "ניסוח רשמי. מדברים 'בפועל'" },
  { p: `ללא\\s+ספק`, to: "בלי ספק", why: "ניסוח רשמי" },
  { p: `(?:חשוב|ראוי|כדאי|יש)\\s+לציין(?!\\s*ש)`, to: "", why: "מילוי: אם זה חשוב, פשוט אומרים את זה" },
  { p: `כידוע,?`, to: "", why: "מילוי שלא מוסיף מידע" },
  { p: `בעידן\\s+המודרני,?`, to: "", why: "פתיחה כללית שמתאימה לכל נושא" },
  { p: `בעולם\\s+של\\s+היום,?`, to: "", why: "פתיחה כללית שמתאימה לכל נושא" },
  { p: `(?:חשוב|ראוי|כדאי|יש)\\s+לציין\\s*ש`, open: true, why: "מילוי. מוחקים את 'חשוב לציין' ופותחים ישר בעובדה" },
  { p: `אין\\s+ספק\\s+ש`, open: true, why: "מילוי. אם אין ספק אין צורך להגיד את זה" },
  { p: `ניתן\\s+לומר\\s+ש`, open: true, why: "ניסוח משרדי. אומרים את זה ישר" },
  { p: `יש\\s+לזכור\\s+ש`, open: true, why: "הנחיה במקום סיפור. תנו לשומעים להגיע לזה לבד" },
  { p: `מסע\\s+(?:מרתק|מרגש|מטלטל|בלתי\\s+נשכח)`, why: "קלישאה. תתארו מה קרה בפועל במקום 'מסע'" },
  { p: `חוויה\\s+(?:מעצימה|בלתי\\s+נשכחת|מתקנת|מרגשת)`, why: "תווית במקום חוויה. ספרו מה קרה ומה הרגשתם" },
  { p: `(?:כל\\s+אחד\\s+מאיתנו|כולנו\\s+יודעים|כולנו\\s+מכירים)`, why: "הכללה. ספרו על מקרה אחד ספציפי" },
  { p: `(?:שיעור|לקח)\\s+חשוב\\s+לחיים`, why: "מוסר השכל מוכן. תנו לחניכים להסיק בעצמם" },
  { p: `קחו\\s+נשימה\\s+עמוקה`, why: "נדוש" },
  { p: `בהתאם\\s+ל`, open: true, why: "ניסוח משרדי. 'לפי' או פשוט מחיקה" },
  { p: `במסגרת\\s+ה`, open: true, why: "ניסוח משרדי. 'ב' מספיק" },
  { p: `(?:מדהים|מופלא|פנטסטי|מושלם|נפלא)`, why: "תואר מנופח. תארו מה ראיתם במקום", min: 3 },
];

export function findCliches(text) {
  const src = String(text || "");
  const items = [];
  for (const c of CLICHES) {
    const rx = re(c.p, "g", c.open);
    const hits = [];
    let m;
    while ((m = rx.exec(src))) hits.push({ text: m[0], at: m.index });
    if (!hits.length || (c.min && hits.length < c.min)) continue;
    items.push({ kind: "cliche", text: hits[0].text, count: hits.length, suggest: c.to ?? null, fix: c.to !== undefined, why: c.why });
  }
  const sents = splitSentences(src);
  const n = countWords(src);
  // שלישיות: "א, ב ו-ג"
  const triads = sents.filter((s) => new RegExp(`(?<![${HE}])[${HE}]{2,},\\s+[${HE}]{2,}\\s+ו[${HE}]{2,}(?![${HE}])`).test(s)).length;
  if (triads >= 2) items.push({ kind: "structure", text: "רשימות של שלושה", count: triads, suggest: null, fix: false, why: "שלוש-שלוש בכל משפט נשמע כמו נאום מוכן. השאירו פריט אחד, זה שבאמת קרה" });
  const notOnly = (src.match(/לא\s+רק[^.!?]{0,80}אלא\s+גם/g) || []).length;
  if (notOnly >= 2) items.push({ kind: "structure", text: "'לא רק… אלא גם'", count: notOnly, suggest: null, fix: false, why: "מבנה חוזר שמרגיש כתוב. נסו משפט ישיר" });
  const openers = {};
  for (const s of sents) { const w = stripP(s.split(/\s+/)[0] || ""); if (w) openers[w] = (openers[w] || 0) + 1; }
  const top = Object.entries(openers).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 4 && top[1] / Math.max(1, sents.length) >= 0.4) items.push({ kind: "structure", text: `${top[1]} משפטים שמתחילים ב'${top[0]}'`, count: top[1], suggest: null, fix: false, why: "פתיחה זהה שוב ושוב יוצרת קצב חד-גוני. שנו את סדר המשפט או חברו שניים" });
  const ex = (src.match(/!/g) || []).length;
  if (ex >= 3 && ex / Math.max(1, n) > 1 / 60) items.push({ kind: "structure", text: `${ex} סימני קריאה`, count: ex, suggest: null, fix: false, why: "הרבה סימני קריאה מקטינים את הכוח של כל אחד. השאירו אחד או שניים" });
  const abstract = (src.match(re(`ה?(?:מסע|תהליך|עולם|מציאות|ערך|ערכים|משמעות|חשיבות|פוטנציאל|אתגר|הזדמנות|חוויה|מימד)(?:ים|ות)?`)) || []).length;
  if (n >= 40 && abstract / n > 0.04) items.push({ kind: "structure", text: "ריבוי מילים מופשטות", count: abstract, suggest: null, fix: false, why: "הרבה 'תהליך', 'משמעות', 'חוויה'. תחליפו במעשה אחד ספציפי" });
  return { items, total: items.reduce((s, i) => s + i.count, 0), fixable: items.filter((i) => i.fix).length };
}

export function fixCliches(text) {
  let t = String(text || "");
  let n = 0;
  for (const c of CLICHES) {
    if (c.to === undefined) continue;
    t = t.replace(re(c.p, "g", c.open), () => { n++; return c.to; });
  }
  return { text: tidy(t.replace(/\s+,/g, ",").replace(/,\s*,/g, ",")), applied: n };
}

// ───────────── 458: פרטים חסרים ─────────────

const N = (p) => new RegExp(`(?<![${HE}])${PREFIX}(?:${p})(?![${HE}])`, "g");
export const DETAIL_PATTERNS = {
  place: N(`חדר|בית|כיתה|חורשה|שביל|אוהל|מדורה|חוף|גינה|מגרש|רחוב|אוטובוס|מטבח|סלון|מרפסת|יער|נחל|מדבר|בסיס|סניף|חצר|גג|מקלט|פארק|כביש|תחנה|שדה|עמק|מערה|מחנה|חניון|גן`),
  smell: N(`ריח(?:ים)?|הריח|מריח|ניחוח|סירחון|מסריח|הסריח|עשן`),
  sound: N(`קול|צעק|צעקה|לחש|שקט|רעש|צליל|שרנו|צחק|צחקו|נשמע|שמעתי|דממה|שתיקה|ציוץ|רעם|דפיקה|חריקה|בכה`),
  sight: N(`אור|חושך|צבע|נוצץ|אפור|שחור|לבן|אדום|כחול|ירוק|זוהר|צל|להבה|ערפל|ירח|כוכבים`),
  touch: N(`קר|קור|חם|רטוב|רטובה|קפוא|זיעה|רעדתי|רעד|חול|בוץ|גשם|קוצים|דביק`),
  taste: N(`טעם|מתוק|מלוח|אכלנו|אכלתי|שתינו|שתיתי`),
  body: N(`הלב|בטן|ידיים|ידיי|גרון|רעדו|דמעות|דמעה|בכיתי|הסמקתי|התכווצה|נעתקה|ברכיים|גוש`),
  person: N(`אבא|אמא|סבא|סבתא|אח|אחות|חבר|חברה|מדריך|מדריכה|חניך|חניכה|מורה|שכן|דוד|דודה|אחי`),
  feeling: N(`פחד|פחדתי|התביישתי|בושה|כעסתי|כעס|שמחתי|שמחה|נלחצתי|לחץ|התרגשתי|התרגשות|גאווה|גאה|עצוב|בודד|בדידות|אשמה|תסכול|מבוכה|הצטערתי|התגעגעתי|געגוע|אכזבה|התאכזבתי|נבהלתי|הרגשתי|חששתי|חשש|קינאתי`),
  time: new RegExp(`(?:בלילה|בבוקר|בערב|בצהריים|אחר\\s+הצהריים|בחצות|ביום\\s+[${HE}]+|לפני\\s+(?:\\d+|[${HE}]+)\\s+(?:שנים|שנה|חודשים|ימים|שבועות)|באותה\\s+שנה|בקיץ|בחורף|באביב|בסתיו|בשבת|בחופש|בגיל\\s+\\d+|בגיל\\s+[${HE}]+)`, "g"),
  number: new RegExp(`\\d+|(?<![${HE}])(?:שניים|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שבעה|שמונה|תשע|תשעה|עשר|עשרה|עשרים|שלושים|מאה|אלף)(?![${HE}])`, "g"),
  quote: new RegExp(`["“”„]([^"“”„]{3,})["“”„]|(?:אמר|אמרה|אמרו|צעק|צעקה|לחש|לחשה|שאל|שאלה|ענה|ענתה)[^.!?]{0,20}[:,]\\s*["“„]?[${HE}]`, "g"),
};
const countRx = (rx, t) => (String(t).match(rx) || []).length;

export function detailProfile(text) {
  const t = String(text || "");
  const counts = {};
  for (const [k, rx] of Object.entries(DETAIL_PATTERNS)) counts[k] = countRx(rx, t);
  return counts;
}

const ASK = {
  quote: "מה בדיוק מישהו אמר באותו רגע? כתבו את המשפט במילים שלו, גם אם הוא לא מושלם.",
  sensory: "מה היה הריח, הקול או הקור באוויר באותו רגע? בחרו חוש אחד וכתבו משפט עליו.",
  body: "מה קרה לכם בגוף באותו רגע: ידיים, בטן, גרון, קול? כתבו מה הרגשתם פיזית.",
  place: "איפה זה היה בדיוק? מה היה מסביב: חדר, חורשה, אוטובוס?",
  number: "כמה זמן זה נמשך, כמה אנשים היו שם, בני כמה הייתם?",
  time: "מתי זה קרה? באיזו שעה, באיזו עונה, בכיתה כמה?",
};

/** ארבע קטגוריות חושיות נספרות יחד: מספיק חוש אחד. */
export function detailGaps(text) {
  const c = detailProfile(text);
  const sensory = c.smell + c.sound + c.sight + c.touch + c.taste;
  const present = [];
  const missing = [];
  const rows = [["quote", c.quote > 0], ["sensory", sensory > 0], ["body", c.body > 0], ["place", c.place > 0], ["number", c.number > 0], ["time", c.time > 0]];
  for (const [k, ok] of rows) (ok ? present : missing).push(k);
  const questions = missing.slice(0, 3).map((key) => ({ key, q: ASK[key] }));
  return { present, missing, questions, counts: c, covered: present.length, total: rows.length };
}

// ───────────── 462: הוראות במה ─────────────

const has = (rx, t) => String(t).search(rx) >= 0;

export function stageDirections(text, max = 6) {
  const sents = splitSentences(text);
  const dirs = [];
  let humor = false, quote = false, turn = false, qs = 0, feel = 0;
  sents.forEach((s, i) => {
    const w = countWords(s);
    if (!turn && /^(?:ו?אז|פתאום|ברגע\s+ש|ופתאום)/.test(s) && i > 0) { dirs.push({ before: i, text: "מנמיכים קול, מאטים" }); turn = true; }
    if (!humor && /(?:צחקנו|צחקתי|צחקו|מצחיק|חחח|הצחיק)/.test(s)) { dirs.push({ after: i, text: "פה בדרך כלל צוחקים. מחכים" }); humor = true; }
    else if (!quote && has(DETAIL_PATTERNS.quote, s)) { dirs.push({ after: i, text: "משנים קצת את הקול לדמות" }); quote = true; }
    else if (/\?$/.test(s) && qs < 2 && w >= 3) { dirs.push({ after: i, text: "עוצרים ונותנים להם לחשוב" }); qs++; }
    else if (feel < 1 && has(DETAIL_PATTERNS.feeling, s) && w >= 4) { dirs.push({ after: i, text: "שתיקה קצרה" }); feel++; }
  });
  if (sents.length >= 4) dirs.push({ after: sents.length - 1, text: "נושמים ומסתכלים עליהם" });
  const chosen = dirs.slice(0, max);
  const out = [];
  sents.forEach((s, i) => {
    for (const d of chosen) if (d.before === i) out.push(`(${d.text})`);
    out.push(s);
    for (const d of chosen) if (d.after === i) out.push(`(${d.text})`);
  });
  return { text: out.join(" ").replace(/\s+/g, " ").trim(), directions: chosen.map((d) => ({ at: d.before ?? d.after, position: d.before !== undefined ? "before" : "after", text: d.text })) };
}

// ───────────── 463: בדיקת הקראה בקול ─────────────

const WPM = 125; // קצב הקראה של סיפור, איטי מקריאה שקטה

export function readAloudCheck(text) {
  const sents = splitSentences(text);
  const words = sents.map(countWords);
  const total = words.reduce((a, b) => a + b, 0);
  const long = [];
  const marked = [];
  sents.forEach((s, i) => {
    if (words[i] <= 22) { marked.push(s); return; }
    const w = s.split(/\s+/);
    const mid = Math.floor(w.length / 2);
    let best = -1;
    for (let k = 3; k < w.length - 3; k++) {
      const ok = /[,;:]$/.test(w[k]) || /^(?:ו|אבל|אז|כי|ש)/.test(stripP(w[k + 1] || ""));
      if (ok && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
    }
    const at = best >= 0 ? best : mid;
    long.push({ index: i, words: words[i], text: s.slice(0, 90), breath: w.slice(0, at + 1).join(" ").slice(-30) });
    marked.push([...w.slice(0, at + 1), "‖", ...w.slice(at + 1)].join(" "));
  });
  const mean = total / Math.max(1, sents.length);
  const sd = Math.sqrt(words.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, sents.length));
  const paras = String(text || "").split(/\n\s*\n|\n/).filter((p) => p.trim());
  const dense = paras.map((p, i) => ({ i, words: countWords(p) })).filter((p) => p.words > 90).map((p) => p.i + 1);
  const hard = [...new Set(wordsOf(text).filter((w) => w.replace(/[^א-ת]/g, "").length >= 12))].slice(0, 6);
  const seconds = Math.round((total / WPM) * 60);
  const notes = [];
  if (long.length) notes.push(`${long.length} משפטים ארוכים מדי להקראה (מעל 22 מילים). הוספנו סימון נשימה ‖ במקום הטבעי.`);
  if (sents.length >= 6 && sd < 3) notes.push("כל המשפטים באורך דומה, וזה נשמע כמו מונוטון. שלבו משפט קצר מאוד אחרי משפט ארוך.");
  if (dense.length) notes.push(`פסקה ${dense.join(", ")} ארוכה מאוד. פצלו לשורה ריקה: זו נשימה גם לכם וגם למאזינים.`);
  if (hard.length) notes.push(`מילים ארוכות שקשה להגיד בשטף: ${hard.join(", ")}.`);
  if (!notes.length && total >= 30) notes.push("הקצב נראה נוח להקראה.");
  return { seconds, minutesText: seconds >= 90 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} דקות` : `${seconds} שניות`, sentences: sents.length, words: total, avg: Math.round(mean * 10) / 10, spread: Math.round(sd * 10) / 10, long, dense, hard, marked: marked.join(" "), notes };
}

// ───────────── 466: המילון שלי ─────────────

const COLLOQUIAL = ["אחי", "יאללה", "נו", "בקיצור", "תכלס", "וואלה", "חבר'ה", "אחלה", "סבבה", "תקשיבו", "שימו לב", "רגע", "אוקיי", "אתם יודעים", "בואו", "תגידו"];

const entryRx = (w) => {
  const e = String(w).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const single = !/\\s\+/.test(e);
  return new RegExp(`(?<![${HE}])${single && w.length >= 3 ? "[ובהלמכש]?" : ""}${e}(?![${HE}])`, "g");
};

export function dictCheck(text, dict = {}) {
  const say = (dict.say || []).filter(Boolean);
  const never = (dict.never || []).filter(Boolean);
  const count = (w) => (String(text).match(entryRx(w)) || []).length;
  const sayHits = say.map((word) => ({ word, count: count(word) })).filter((x) => x.count);
  const neverHits = never.map((word) => ({ word, count: count(word) })).filter((x) => x.count);
  const present = COLLOQUIAL.filter((w) => count(w) > 0 && !say.includes(w) && !never.includes(w));
  return { sayHits, neverHits, unusedSay: say.filter((w) => !sayHits.some((h) => h.word === w)), suggestions: present.slice(0, 6), usage: say.length ? Math.round((sayHits.length / say.length) * 100) : null };
}

export function cleanDict(raw) {
  const norm = (a) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x).replace(/\s+/g, " ").trim()).filter((x) => x && x.length <= 30))].slice(0, 40);
  return { say: norm(raw?.say), never: norm(raw?.never) };
}

// ───────────── 464: מדד חום ואנושיות ─────────────

const FP_WORDS = new Set(["אני", "אותי", "לי", "שלי", "עליי", "אצלי", "איתי", "ממני", "בשבילי", "אליי"]);
const ADDRESS = /(?:אתם|שימו|תדמיינו|חשבו|בואו|תגידו|תקשיבו|דמיינו|הסתכלו|ספרו|זוכרים)/;
const SPOKEN_MARK = /(?<![א-ת])(?:אז|ואז|פתאום|תקשיבו|נו|בקיצור|רגע|וואלה|יאללה|תכלס|אתם\s+יודעים|שימו\s+לב)(?![א-ת])/g;
const FORMAL_MARK = /(?<![א-ת])(?:אולם|לפיכך|כמו\s+כן|במהלך|אשר|על\s+כן|עם\s+זאת|טרם|ישנם|ישנן|הינו|הינה|במסגרת|בהתאם)(?![א-ת])/g;
const LEVELS = [[30, "כללי וקר"], [50, "מתחמם"], [70, "אישי"], [101, "חי"]];

export function humanScore(text, dict) {
  const src = String(text || "");
  const n = countWords(src);
  if (n < 25) return { score: null, level: "קצר מדי", note: "צריך לפחות 25 מילים כדי למדוד.", parts: [], tips: [] };
  const sents = splitSentences(src);
  const lens = sents.map(countWords);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const sd = Math.sqrt(lens.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, lens.length));
  const gaps = detailGaps(src);
  const c = gaps.counts;
  const senses = [c.smell, c.sound, c.sight, c.touch, c.taste].filter((x) => x > 0).length;
  const spec = (c.place ? 4 : 0) + (c.quote ? 7 : 0) + Math.min(2, senses) * 3 + (c.body ? 4 : 0) + (c.number ? 3 : 0) + (c.time ? 3 : 0) + (c.person ? 3 : 0);
  const words = wordsOf(src);
  const fp = words.filter((w) => FP_WORDS.has(w) || (/תי$/.test(w) && w.length >= 4)).length / n * 100;
  let voice = fp >= 4 && fp <= 14 ? 15 : fp < 4 ? (fp / 4) * 15 : Math.max(8, 15 - (fp - 14));
  voice += ADDRESS.test(src) ? 5 : 0;
  const shortN = lens.filter((l) => l <= 6).length, longN = lens.filter((l) => l >= 14).length;
  const rhythm = (shortN ? 5 : 0) + (longN ? 3 : 0) + Math.min(7, (sd / 4) * 7);
  const spoken = Math.max(0, Math.min(10, countRx(SPOKEN_MARK, src) * 3) - countRx(FORMAL_MARK, src) * 3);
  const feel = c.feeling;
  const emotion = feel === 0 ? 0 : feel <= 2 ? 6 : feel <= 5 ? (c.body ? 10 : 8) : 5;
  const cl = findCliches(src);
  const clPts = Math.min(15, cl.items.filter((i) => i.kind === "cliche").reduce((s, i) => s + i.count * 3, 0));
  const stPts = Math.min(9, cl.items.filter((i) => i.kind === "structure").length * 3);
  const dc = dict && (dict.say?.length || dict.never?.length) ? dictCheck(src, dict) : null;
  const dictPts = dc ? Math.max(0, Math.min(10, dc.sayHits.length * 3 - dc.neverHits.length * 3 + 2)) : 0;
  const parts = [
    { key: "specific", label: "פרטים ספציפיים", pts: Math.round(spec), max: 30 },
    { key: "voice", label: "גוף ראשון ופנייה", pts: Math.round(voice), max: 20 },
    { key: "rhythm", label: "קצב ומשפטים קצרים", pts: Math.round(rhythm), max: 15 },
    { key: "spoken", label: "עברית מדוברת", pts: Math.round(spoken), max: 10 },
    { key: "emotion", label: "רגש וגוף", pts: Math.round(emotion), max: 10 },
  ];
  if (dc) parts.push({ key: "dict", label: "המילים שלי", pts: Math.round(dictPts), max: 10 });
  const max = parts.reduce((s, p) => s + p.max, 0);
  const raw = parts.reduce((s, p) => s + p.pts, 0) - clPts - stPts;
  const score = Math.max(0, Math.min(100, Math.round((raw / max) * 100)));
  const level = LEVELS.find(([lim]) => score < lim)[1];
  const tips = [];
  const weak = [...parts].sort((a, b) => a.pts / a.max - b.pts / b.max);
  const TIP = {
    specific: gaps.questions[0]?.q || "הוסיפו פרט אחד שרק מי שהיה שם יודע.",
    voice: "דברו בגוף ראשון ופנו אליהם: 'אני זוכר ש...', 'תדמיינו שאתם...'.",
    rhythm: "אחרי משפט ארוך שימו משפט קצר מאוד. למשל: 'ואז שתקתי.'",
    spoken: "החליפו ניסוח רשמי בדיבור: 'אולם' ← 'אבל', 'לכן' ← 'אז'. הכלי 'דיבורי' עושה זאת בלחיצה.",
    emotion: "אל תכתבו רק מה הרגשתם. כתבו מה קרה בגוף: ידיים, בטן, קול.",
    dict: "השתמשו ביותר מהמילים שלכם, ופחות במילים שבחרתם לא להגיד.",
  };
  for (const p of weak) if (p.pts / p.max < 0.55 && tips.length < 3) tips.push({ key: p.key, text: TIP[p.key] });
  if (clPts && tips.length < 4) tips.push({ key: "cliche", text: `יש ${cl.items.filter((i) => i.kind === "cliche").length} ניסוחים נדושים. כפתור 'ניקוי קלישאות' מתקן את מה שאפשר אוטומטית.` });
  return { score, level, parts, penalties: { cliches: clPts, structure: stPts }, tips, words: n, note: "הציון מבוסס על כללים (פרטים, גוף ראשון, קצב, מילים רשמיות) ולא על הבנת משמעות. הוא מכוון לשיפור ולא נותן פסק דין." };
}

/** הצעה למילון: מילים מדוברות שכבר מופיעות בטקסטים שלכם. */
export const suggestSay = (text) => dictCheck(text, {}).suggestions;

// ───────────── 465: השוואת גרסאות ─────────────

/** הפרש מילים (LCS). שומר אורך סביר: עד 700 מילים מכל צד. */
export function wordDiff(a, b) {
  const x = String(a || "").split(/\s+/).filter(Boolean).slice(0, 700);
  const y = String(b || "").split(/\s+/).filter(Boolean).slice(0, 700);
  const m = x.length, n = y.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) { out.push({ w: x[i], t: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ w: x[i++], t: "del" });
    else out.push({ w: y[j++], t: "add" });
  }
  while (i < m) out.push({ w: x[i++], t: "del" });
  while (j < n) out.push({ w: y[j++], t: "add" });
  const added = out.filter((o) => o.t === "add").length, deleted = out.filter((o) => o.t === "del").length;
  return { diff: out, added, deleted, same: out.length - added - deleted };
}

// שלב 68: מנוע כוונות וסלנג של מעוז. פועל מקומית ובחינם, בלי מודל, ומבין ניסוח חופשי:
//  • תיקון שגיאות הקלדה ("מפריעם", "היפראקטבים") מול אוצר המילים של האתר,
//  • סלנג צופי ומצבי חירום בשטח ("ירד גשם", "נשאר לי 10 דקות", "חניכים היפראקטיביים", "שכחתי ציוד"),
//  • חילוץ פרטים (דקות, גודל קבוצה, שכבה),
//  • שאלת מיקוד קצרה כשהשאלה עמומה, במקום תשובה גנרית.
// הקובץ טהור (בלי גישה למסד ובלי רשת), ולכן קל לבדוק. התשובות עצמן נבנות ב-maoz-field.js.
import { lev, norm, skeleton, stems } from "./smart-search.js";

const FIN = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const finals = (src) => src.replace(/[ךםןףץ]/g, (c) => FIN[c]);
const FOLDED_RX = new WeakMap();
/** בדיקת regex על טקסט שאותיותיו הסופיות כבר אוחדו: גם הדפוס מאוחד, כדי ש"מקשיבים" ו"גשם" ייתפסו */
const T = (rx, text) => {
  let r = FOLDED_RX.get(rx);
  if (!r) FOLDED_RX.set(rx, (r = new RegExp(finals(rx.source), rx.flags)));
  return r.test(text);
};
/** נרמול להשוואה: בלי ניקוד וסימנים, אותיות סופיות מאוחדות */
export const fold = (s) => norm(s).replace(/[ךםןףץ]/g, (c) => FIN[c]);

/** מילות מפתח חופשיות לאתגרי החינוך (משותף לנשר ולתיקון שגיאות ההקלדה) */
export const CHALLENGE_KEYS = {
  quarrel: "ריב רבים רבו מתקוטטים מריבה כעס כועסים מסוכסכים",
  excluded: "בצד מבודד לבד לא משתלב נשאר בצד דחוי חריג",
  disruptive: "מפריע מפריעים מפריעה הפרעה רעש רועשים צועק צועקים לא מקשיבים שקט משתוללים לא שקט משמעת",
  unmotivated: "משועמם משועממים משתעמם משתעממים משעמם משעממת אדישים מוטיבציה לא רוצים להשתתף לא מתעניינים",
  teasing: "מקניט מקניטים הקנטה הצקה מציק מציקים בריונות צוחקים על עלבונות",
  split: "חבורות חבורה קליקה פיצול מפולגת לא מתערבבים",
  phones: "טלפון טלפונים נייד ניידים סמארטפון מסך מסכים וואטסאפ",
  newgroup: "איחוד שכבות קבוצה חדשה לא מכירים מכירים שכבה חדשה מתאחדים",
  hardtimes: "אבל עצוב עצובה מתח משבר תקופה קשה פטירה מצב רוח כבד",
};

// ───────────────────────── אותות (signals) ─────────────────────────
// כל אות: מילים (השוואה מטושטשת: קידומת/סיומת, כתיב מלא/חסר, שגיאת הקלדה אחת) וביטויים (regex על הטקסט המנורמל).
// המילים כתובות בצורת שורש ללא סיומות רבים, כדי שגם "משתוללים" ו"משתולל" ייתפסו.
const SIGNALS = {
  rain: {
    words: "גשם גשום גשומ ברד סופה סערה בוץ שלולית רטוב",
    ph: [/ירד(ו)? גשם/, /(מתחיל|התחיל) לרדת/, /יורד גשם/, /ברקים? ורעמים|רעמים/],
  },
  hyper: {
    words: "היפראקטיב היפר אקטיב מתפרע משתולל פרוע מטורפ מתרוצצ חסרמנוח רועש צועק צעקות בלגן בלאגן טירוף",
    ph: [/לא (נרגעים|יושבים|שקטים|עומדים במקום)/, /עולים על הקירות/, /חסרי מנוחה/, /אין (עם )?מי לדבר/, /יצאו מהכלים/, /מתפרצים/, /יותר מדי אנרגיה/, /אנרגיות/],
  },
  bored: {
    words: "משעמ משועממ משתעממ משתעמ נרדמ מנומנמ אדיש",
    ph: [/אין להם (חשק|מצב רוח)/, /לא (מתעניינים|מעוניינים|רוצים להשתתף)/, /מסתכלים בטלפון/, /נשברו/, /נראה להם משעמם/],
  },
  heat: { words: "חמסין שרב להט מזיע צמא מתייבש", ph: [/(חם|חמסין) (מאוד|נורא|מדי|בחוץ|פה|כאן)/, /מכת חום/, /חום כבד/, /שמש (חזקה|קופחת)/, /^חם$/] },
  cold: { words: "קפוא קפא מקפיא צינה", ph: [/(קר|קור) (מאוד|נורא|מדי|בחוץ|פה|כאן)/, /רוח חזקה/, /קופאים/, /^קר$/] },
  dark: { words: "חושכ חשוכ לילה כוכבים", ph: [/ירד(ה)? (ה)?חושך/, /חשכה/] },
  filler: { words: "פילר אלתור מאולתר", ph: [/חור בלו(ז|"ז)/, /למלא (זמן|את הזמן|חור)/, /ממלא מקום/, /משהו קטן ל/, /לפני ש(מתחילים|מתחילה|המדריך|הרכז)/, /מחכים ל/, /ממתינים ל/] },
  unprepared: {
    words: "",
    ph: [/לא (הכנתי|התכוננתי|הספקתי להתכונן|הכנתי כלום)/, /בלי הכנה/, /ברגע האחרון/, /שכחתי (להתכונן|שיש|את הפעולה)/, /אין לי (הכנה|תוכנית|פעולה|כלום|רעיון)/, /לא מוכן/, /הכל (התפרק|נפל)/],
  },
  nogear: { words: "", ph: [/(בלי|ללא|אין) ציוד/, /שכחתי (את )?(ה)?ציוד/, /הציוד (לא|נשכח|נשאר)/, /אין (לי )?כלום/] },
  few: { words: "", ph: [/הגיעו (רק )?(\d+|שניים|שלושה|ארבעה|חמישה|מעט|כמה)/, /מעט חניכים/, /חצי קבוצה/, /בקושי הגיעו/, /כמעט אף אחד/, /רק \d+ חניכים/, /חסרים (חניכים|הרבה)/] },
  many: { words: "", ph: [/(המון|הרבה|מלא) חניכים/, /קבוצה (ענקית|גדולה מאוד)/, /שכבה שלמה/, /מעל \d{2,} חניכים/, /\d{2,} חניכים/] },
  attention: { words: "מפריע הפרעה", ph: [/לא (מקשיבים|קשובים|שומעים)/, /(מדברים|מפריעים) (כל הזמן|בזמן)/, /אי אפשר להשתלט/, /יצא לי מהידיים/, /לא (מצליח|מצליחה) להשתלט/] },
};
const HE = "[א-ת]";
const MED = new RegExp(`(?<!${HE})[והשבכלמ]{0,2}(?:נפצע|פצוע|פציעה|דימום|מדמם|מדממת|איבד(?:ה)? הכרה|התעלפ|לא נושמ|נחנק|טובע|התקף|נשיכה|עקיצה|מכת חום|התייבש|התחשמל|נכווה|כוויה|אלרגי|בלע)|(?<!${HE})[והש]?(?:דם|שבר)(?!${HE})`);
const LOST = /((חניך|חניכה|ילד|ילדה|נער|נערה)\s*(נעלמ|אבד|הלכ(ה)? לאיבוד|לא נמצא|ברח|נעלמה)|איבדנו (חניך|ילד|ילדה|חניכה)|חסר (לי )?(חניך|ילד|ילדה)|(נעלמ|אבד)(ה)? (לי )?(חניך|ילד))/;
const URGENT = /(עכשיו|פתאום|ירד|יורד|נשאר|נשארו|התחיל|הגיעו|שכחתי|מה עושים|מה לעשות|מה אני עושה|מה אפשר|עזרה|דחוף|חירום|תציל|תעזור|בבקשה|כרגע|הרגע|ברגע)/;
/** שאלה על נושא (לא מצב חירום): "יש לך פעולה על גשם", "מה זה גשם", "תכתוב פעולה על ..." */
const TOPICAL = /(יש לך (פעולה|משחק|משהו|רעיון|סיפור)|משהו על|משחק על|פעולה (על|בנושא)|פעולות (על|בנושא)|תכתוב|תכתבי|תכין|תחפש|מצא לי|חפש לי|מה זה|מה זו|סיפור על|שאלות לדיון|משחק(ים)? (היכרות|פתיחה)|רעיון לפעולה|שם לפעולה)/;

const lexCache = new Map();
const lexOf = (id) => {
  if (!lexCache.has(id)) lexCache.set(id, SIGNALS[id].words.split(" ").filter(Boolean).map(fold));
  return lexCache.get(id);
};
/** הפרש של פעולה אחת מותרת: חסרה אות, אות מיותרת, או שתי אותות סמוכות שהתחלפו. החלפת אות באחרת לא נחשבת, כדי ש"כותבים" לא יהפוך ל"כוכבים". */
export function oneTypo(a, b) {
  if (a === b) return true;
  const d = a.length - b.length;
  if (Math.abs(d) > 1) return false;
  if (d === 0) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return i < a.length - 1 && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = d > 0 ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  return long.slice(i + 1) === short.slice(i);
}
/** האם מילה (עם קידומת וסיומת אפשריות) מתאימה לשורש מהלקסיקון */
const UNFOLD = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };
/** מחזיר אות סופית באחרונה (המילה הוקלדה או נורמלה בלי סופיות), כדי ש-stems יזהה סיומות כמו "ים" */
const finalize = (t) => (t && UNFOLD[t.at(-1)] ? t.slice(0, -1) + UNFOLD[t.at(-1)] : t);
function tokenHits(tok, stem) {
  if (!stem) return false;
  const forms = new Set([tok]);
  for (const x of stems(finalize(tok))) forms.add(fold(x));
  for (const t of forms) {
    if (t === stem) return true;
    if (stem.length >= 4 && t.startsWith(stem) && t.length - stem.length <= 3) return true;
    if (skeleton(t) === skeleton(stem)) return true;
    if (stem.length >= 5 && t.length >= 5 && oneTypo(t, stem)) return true;
  }
  return false;
}

// ───────────────────────── מספרים בעברית ─────────────────────────
const NUMW = [
  [/(רבע שעה)/, 15], [/(חצי שעה)/, 30], [/(שעה וחצי)/, 90], [/(שעתיים)/, 120], [/(?:^| )שעה(?: |$)/, 60],
  [/(חמש עשרה|חמישה עשר|חמש עשרה)/, 15], [/(שתי דקות|שתיים|שניים)/, 2], [/(שלוש|שלושה)/, 3], [/(ארבע|ארבעה)/, 4], [/(חמש|חמישה)/, 5],
  [/(שש|שישה)/, 6], [/(שבע|שבעה)/, 7], [/(שמונה)/, 8], [/(תשע|תשעה)/, 9], [/(עשר|עשרה)/, 10], [/(עשרים)/, 20], [/(שלושים)/, 30], [/(ארבעים)/, 40], [/(חמישים)/, 50],
];
/** כמה דקות הוזכרו (0 אם לא). מחפש ליד המילה "דקות" או "שעה" ולא מספרים אקראיים. */
export function parseMinutesLoose(q) {
  const t = fold(q);
  const d = /(\d{1,3})\s*(?:דק|דקות|דקה|min)/.exec(t);
  if (d) return Math.min(180, Number(d[1]));
  if (T(/(רבע שעה|חצי שעה|שעה וחצי|שעתיים)/, t) || T(/(?:^| )שעה(?: |$)/, t)) {
    for (const [rx, n] of NUMW.slice(0, 5)) if (T(rx, t)) return n;
  }
  if (T(/דקות|דקה/, t)) {
    for (const [rx, n] of NUMW.slice(5)) {
      const m = new RegExp(`${finals(rx.source)}\\s*(?:דקות|דקה)`).exec(t);
      if (m) return n;
    }
    if (T(/(?:^| )דקה(?: |$)/, t)) return 1;
  }
  return 0;
}
export function parseKids(q) {
  const t = fold(q);
  const m = /(?:הגיעו|יש לי|רק|נשארו|כ)\s*(\d{1,3})\s*(?:חניכימ|חניכות|ילדימ)/.exec(t) || /(\d{1,3})\s*(?:חניכימ|חניכות|ילדימ)/.exec(t);
  return m ? Number(m[1]) : 0;
}

// ───────────────────────── תיקון שגיאות הקלדה ─────────────────────────
/** בונה אוצר מילים להשוואה מרשימת מקורות טקסט (כותרות, מילות מפתח, שמות מתודות וערכים). surf: צורת הכתיב המקורית (עם אותיות סופיות) */
export function buildVocab(texts) {
  const words = new Set();
  const bySkel = new Map();
  const surf = new Map();
  const add = (f, original) => {
    words.add(f);
    if (!surf.has(f)) surf.set(f, original);
  };
  for (const tx of texts) {
    for (const w of norm(tx).split(" ").filter(Boolean)) {
      if (w.length < 3 || T(/\d/, w)) continue;
      add(fold(w), w);
      for (const s of stems(w)) add(fold(s), s);
    }
  }
  for (const w of words) {
    const k = skeleton(w);
    if (!bySkel.has(k)) bySkel.set(k, new Set());
    bySkel.get(k).add(w);
  }
  for (const id of Object.keys(SIGNALS)) for (const w of lexOf(id)) add(w, w);
  const byLen = new Map();
  for (const w of words) {
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length).push(w);
  }
  return { words, bySkel, byLen, surf };
}
const known = (vocab, o) => {
  const f = fold(o);
  return vocab.words.has(f) || stems(norm(o)).some((x) => vocab.words.has(fold(x)) || vocab.words.has(skeleton(fold(x))));
};
const PROTECT = new Set("עזרה דחוף חירום בעיה רעיון משהו פעולה פעולות חניכים חניכות חניך מדריך מדריכה מדריכים מפגש שבט עכשיו תודה בבקשה לילה בוקר ערב אחרי לפני קבוצה קבוצות כיתה נושא נושאים זמן דקות שעה".split(" ").map(fold));
/**
 * מתקן מילים שלא מוכרות למילה קרובה אחת ויחידה באוצר המילים (עד טעות אחת במילה של 4–6 אותיות, עד שתיים באורך 7 ומעלה).
 * אם יש כמה מועמדים באותו מרחק, לא מתקנים (עדיף לא לנחש). text: מנורמל לזיהוי אותות; fixedQ: אותו משפט בכתיב המקורי להמשך החיפוש.
 */
export function fixTypos(q, vocab) {
  const orig = norm(q).split(" ").filter(Boolean);
  const fixes = [];
  const folded = orig.map((o) => fold(o));
  const out = folded.map((t, i) => {
    if (t.length < 4 || T(/\d/, t) || PROTECT.has(t) || known(vocab, orig[i])) return [t, orig[i]];
    const pick = (w) => {
      fixes.push([t, w]);
      return [w, vocab.surf.get(w) ?? w];
    };
    const sk = vocab.bySkel.get(skeleton(t));
    if (sk && sk.size === 1) {
      const [only] = sk;
      if (only !== t) return pick(only);
    }
    const max = t.length >= 8 ? 2 : 1; // שתי טעויות רק במילים ארוכות מאוד
    let best = null;
    let bd = 99;
    let tie = false;
    for (let L = t.length - max; L <= t.length + max; L++) {
      for (const w of vocab.byLen.get(L) || []) {
        if (w[0] !== t[0] && t.length < 6) continue; // טעויות הקלדה כמעט אף פעם לא באות הראשונה
        const d = max === 1 ? (oneTypo(t, w) ? 1 : 99) : lev(t, w, max);
        if (d > max) continue;
        if (d < bd) {
          bd = d;
          best = w;
          tie = false;
        } else if (d === bd && w !== best) tie = true;
      }
    }
    return best && !tie ? pick(best) : [t, orig[i]];
  });
  return { text: out.map((x) => x[0]).join(" "), fixedQ: out.map((x) => x[1]).join(" "), fixes };
}

// ───────────────────────── ניתוח ─────────────────────────
/**
 * @param {string} q השאלה כפי שהוקלדה
 * @param {{vocab?: ReturnType<typeof buildVocab>}} [env]
 * @returns {{
 *   text: string, fixedQ: string, fixes: string[][], signals: string[], minutes: number, kids: number,
 *   urgent: boolean, topical: boolean, emergency: ""|"medical"|"lost", field: boolean,
 *   needsMinutes: boolean, vague: boolean, vagueExact: boolean
 * }}
 */
export function analyzeIntent(q, env = {}) {
  const raw = String(q ?? "");
  const { text, fixes, fixedQ } = env.vocab ? fixTypos(raw, env.vocab) : { text: fold(raw), fixes: [], fixedQ: norm(raw) };
  const toks = text.split(" ").filter(Boolean);
  const signals = [];
  for (const [id, s] of Object.entries(SIGNALS)) {
    const lex = lexOf(id);
    const byWord = lex.length > 0 && toks.some((t) => lex.some((l) => tokenHits(t, l)));
    const byPhrase = s.ph.some((rx) => T(rx, text));
    if (byWord || byPhrase) signals.push(id);
  }
  const minutes = parseMinutesLoose(raw);
  const kids = parseKids(raw);
  const timeLeft = T(/(נשאר(ו)?|חסר(ות)?|יש לי רק|רק|עוד) (לי )?(\S+ )?(דקות|דקה|רבע שעה|חצי שעה|שעה)/, text) || T(/(דקות|רבע שעה|חצי שעה) (נשארו|שנשארו|פנויות|בלבד)/, text) || T(/^(\d+|\S+) (דקות|דקה)$/, text) || T(/אין לי (הרבה )?זמן/, text) || T(/נגמר לי הזמן|נשאר (לי )?(קצת|מעט) זמן|נשאר זמן/, text);
  if (timeLeft) signals.push("time");
  if (T(/מעט|קצת/, text) && !signals.includes("few") && T(/חניכים/, text) && T(/הגיעו/, text)) signals.push("few");
  const urgent = T(URGENT, text);
  const topical = T(TOPICAL, text);
  const emergency = topical ? "" : T(LOST, text) ? "lost" : T(MED, text) ? "medical" : "";
  const field = !emergency && signals.length > 0 && !topical;
  const needsMinutes = field && signals.includes("time") && !minutes && signals.length === 1;
  // עמום: שאלה קצרה מאוד בלי שום אות וגם בלי עוגן מהאתר
  const meaningful = toks.filter((t) => t.length >= 2 && !STOP_VAGUE.has(t));
  const vagueExact = !field && !emergency && !topical && T(VAGUE, text);
  const vague = vagueExact || (!field && !emergency && !topical && meaningful.length <= 1 && !signals.length && !toks.some((t) => t.length >= 4 && env.vocab && env.vocab.words.has(t)));
  return { text, fixedQ, fixes, signals, minutes, kids, urgent, topical, emergency, field, needsMinutes, vague, vagueExact };
}
const VAGUE = /^(עזרה|תעזור לי|תעזרי לי|תעזרו לי|אני צריך עזרה|אני צריכה עזרה|צריך עזרה|דחוף|חירום|מה עושים|מה לעשות|נתקעתי|אני תקוע|אני תקועה|תקוע|תקועה|יש בעיה|בעיה|לא יודע מה לעשות|לא יודעת מה לעשות|משהו|רעיון|תן רעיון|אין לי רעיון|אין לי רעיונות|פעולה|מה אפשר|אני בלחץ|לחץ|אבוד|אני אבוד|אני אבודה|הכל נפל|הכול נפל|עזרו לי|עזור לי|עזרי לי|מה אני עושה|עכשיו מה)$/;
const STOP_VAGUE = new Set("אני את אתה לי לך זה זאת מה איך מי אפשר רוצה צריך צריכה בבקשה תודה כן לא אולי".split(" ").map(fold));

// ───────────────────────── שאלות מיקוד ─────────────────────────
/** שאלת מיקוד קצרה וידידותית + עד שלוש תשובות מוכנות ללחיצה. הלחיצה נשלחת כשאלה חדשה. */
export function clarifyFor(ia) {
  if (ia.needsMinutes) {
    return { ask: "אני מתאים לך משהו. כמה דקות נשארו?", options: ["נשארו לי 5 דקות", "נשארו לי 10 דקות", "נשארו לי 20 דקות"], why: "minutes" };
  }
  if (T(/^(פעולה|רעיון|תן רעיון|אין לי רעיון|אין לי רעיונות|משהו)$/, ia.text)) {
    return { ask: "בשמחה. פעולה מלאה לתכנון מראש, או משהו לרגע הזה בשטח?", options: ["תכתוב לי פעולה על אחריות לכיתה ו' 45 דקות", "נשארו לי 10 דקות ואין מה לעשות", "חניכים לא מקשיבים לי עכשיו"], why: "kind" };
  }
  return { ask: "אני איתך. מה קורה: חניכים שקשה איתם עכשיו, חסר לך זמן ורעיון, או שאת/ה מתכנן/ת מראש?", options: ["חניכים לא מקשיבים לי עכשיו", "נשארו לי 10 דקות ואין מה לעשות", "אני מתכנן/ת פעולה מראש"], why: "vague" };
}

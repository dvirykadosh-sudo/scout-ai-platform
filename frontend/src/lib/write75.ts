// שלב 75: הלוגיקה הטהורה של עוזר הכתיבה והעורך. בלי React ובלי דפדפן, כדי שבדיקות השרת יריצו אותה ישירות (Node 22, הסרת טיפוסים).
// לכן רק תחביר שאפשר למחוק: בלי enum, בלי namespace ובלי פרמטרים-שדות. ייבוא מקבצי lib אחרים אסור (tsc לא מאפשר סיומת .ts), ולכן מיזוג מוזרק מבחוץ.

export interface W75Block {
  id: string;
  title: string;
  kind: string;
  minutes: number | null;
  text: string;
  note: string;
  hint?: string;
  done?: boolean;
  unchecked?: boolean;
}
export interface W75Snap {
  title: string;
  meta: Record<string, unknown>;
  blocks: W75Block[];
}

const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/* ───────────────────────── 18. מגבלות והודעות ברורות ───────────────────────── */

export const LIMITS = { blocks: 60, blockText: 20000, blockTitle: 120, blockNote: 5000, docTitle: 120, docChars: 400000 };
export type LimitCode = "BLOCKS" | "BLOCK_TEXT" | "BLOCK_TITLE" | "BLOCK_NOTE" | "DOC_TITLE" | "DOC_SIZE";
export interface LimitProblem {
  code: LimitCode;
  /** מספר השלב (מ-1), או null כשזה על המסמך כולו */
  block: number | null;
  length: number;
  max: number;
  message: string;
}

/** כל מה שחורג מהמגבלות, בלשון שמסבירה מה קרה ומה עושים. אותו נוסח בדיוק מגיע גם מהשרת (backend/src/write75.js). */
export function limitProblems(snap: { title: string; blocks: { title: string; text: string; note: string }[] }): LimitProblem[] {
  const out: LimitProblem[] = [];
  if (snap.blocks.length > LIMITS.blocks) {
    out.push({ code: "BLOCKS", block: null, length: snap.blocks.length, max: LIMITS.blocks, message: `יש ${snap.blocks.length} שלבים, ואפשר עד ${LIMITS.blocks}. מזגו שלבים קצרים או העבירו חלק מהם למסמך נפרד.` });
  }
  if (snap.title.length > LIMITS.docTitle) out.push({ code: "DOC_TITLE", block: null, length: snap.title.length, max: LIMITS.docTitle, message: `שם המסמך ארוך מדי: ${num(snap.title.length)} תווים, ואפשר עד ${LIMITS.docTitle}.` });
  snap.blocks.forEach((b, i) => {
    if (b.text.length > LIMITS.blockText) out.push({ code: "BLOCK_TEXT", block: i + 1, length: b.text.length, max: LIMITS.blockText, message: `שלב ${i + 1} ארוך מדי: ${num(b.text.length)} תווים, ואפשר עד ${num(LIMITS.blockText)}. כדאי לפצל אותו לשני שלבים (הכפתור "פיצול במיקום הסמן").` });
    if (b.title.length > LIMITS.blockTitle) out.push({ code: "BLOCK_TITLE", block: i + 1, length: b.title.length, max: LIMITS.blockTitle, message: `כותרת שלב ${i + 1} ארוכה מדי: ${num(b.title.length)} תווים, ואפשר עד ${LIMITS.blockTitle}.` });
    if (b.note.length > LIMITS.blockNote) out.push({ code: "BLOCK_NOTE", block: i + 1, length: b.note.length, max: LIMITS.blockNote, message: `ההערה האישית בשלב ${i + 1} ארוכה מדי: ${num(b.note.length)} תווים, ואפשר עד ${num(LIMITS.blockNote)}.` });
  });
  const chars = snap.blocks.reduce((s, b) => s + b.text.length + b.note.length + b.title.length, 0);
  if (chars > LIMITS.docChars) out.push({ code: "DOC_SIZE", block: null, length: chars, max: LIMITS.docChars, message: `המסמך גדול מדי: כ-${num(chars / 1000)} אלף תווים, ואפשר עד ${num(LIMITS.docChars / 1000)} אלף. פצלו אותו לשני מסמכים או קצרו הערות.` });
  return out;
}

export type LimitLevel = "ok" | "near" | "over";
/** צבע המונה ליד שדה: מ-90% מהמגבלה כתום, מעבר לה אדום */
export const limitLevel = (len: number, max: number): LimitLevel => (len > max ? "over" : len >= max * 0.9 ? "near" : "ok");
export const limitText = (len: number, max: number) => `${num(len)} מתוך ${num(max)} תווים`;
export const blocksLeft = (count: number) => Math.max(0, LIMITS.blocks - count);

/* ───────────────────────── 4. קיצורי מקלדת ───────────────────────── */

export type Action75 = "save" | "undo" | "redo" | "bold" | "italic" | "newBlock" | "dup" | "moveUp" | "moveDown" | "prevBlock" | "nextBlock" | "goto" | "find" | "focus" | "preview" | "readAloud" | "help";
export interface KeyInfo {
  key: string;
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** האם הסמן בתוך שדה טקסט (אז "?" הוא תו רגיל ולא פתיחת עזרה) */
  typing: boolean;
}
export interface ShortcutDef {
  keys: string;
  action: Action75;
  label: string;
  group: "שמירה וביטול" | "עיצוב" | "שלבים" | "תצוגה וכלים";
}
export const SHORTCUTS75: ShortcutDef[] = [
  { keys: "Ctrl+S", action: "save", label: "שמירה עכשיו", group: "שמירה וביטול" },
  { keys: "Ctrl+Z", action: "undo", label: "ביטול בשלב הנוכחי (ואם אין, במסמך)", group: "שמירה וביטול" },
  { keys: "Ctrl+Y או Ctrl+Shift+Z", action: "redo", label: "שחזור", group: "שמירה וביטול" },
  { keys: "Ctrl+B", action: "bold", label: "הדגשת הטקסט המסומן", group: "עיצוב" },
  { keys: "Ctrl+I", action: "italic", label: "נטייה של הטקסט המסומן", group: "עיצוב" },
  { keys: "Ctrl+Enter", action: "newBlock", label: "שלב חדש מתחת לנוכחי", group: "שלבים" },
  { keys: "Ctrl+Shift+D", action: "dup", label: "שכפול השלב הנוכחי", group: "שלבים" },
  { keys: "Alt+↑ / Alt+↓", action: "moveUp", label: "הזזת השלב הנוכחי למעלה או למטה", group: "שלבים" },
  { keys: "Alt+PageUp / Alt+PageDown", action: "prevBlock", label: "מעבר לשלב הקודם או הבא", group: "שלבים" },
  { keys: "Alt+1 עד Alt+9", action: "goto", label: "קפיצה לשלב לפי מספר", group: "שלבים" },
  { keys: "Ctrl+Shift+H", action: "find", label: "חיפוש והחלפה", group: "תצוגה וכלים" },
  { keys: "Ctrl+Shift+F", action: "focus", label: "מצב מיקוד במסך מלא", group: "תצוגה וכלים" },
  { keys: "Ctrl+Shift+E", action: "preview", label: "תצוגה מקדימה לשלב", group: "תצוגה וכלים" },
  { keys: "Ctrl+Shift+L", action: "readAloud", label: "הקרא לי: הקראת השלב", group: "תצוגה וכלים" },
  { keys: "? או Ctrl+/", action: "help", label: "פתיחת לוח הקיצורים הזה", group: "תצוגה וכלים" },
];

const LETTER: Record<string, string> = { KeyS: "s", KeyZ: "z", KeyY: "y", KeyB: "b", KeyI: "i", KeyD: "d", KeyH: "h", KeyF: "f", KeyE: "e", KeyL: "l" };

/**
 * מתאים לחיצה לפעולה. משתמשים ב-code (המקש הפיזי) ולא ב-key: במקלדת עברית Ctrl+S מדווח כ-"ס", והקיצורים הישנים לא עבדו שם.
 * נמנעים מ-Ctrl+Alt (זה AltGr בווינדוס) וממקשים שהדפדפן תופס (Ctrl+F, Ctrl+Shift+R, Alt+Shift שמחליף שפה).
 */
export function shortcutAction(k: KeyInfo): { action: Action75; n?: number } | null {
  const L = LETTER[k.code] ?? "";
  if (k.alt && !k.ctrl && !k.shift) {
    if (k.key === "ArrowUp") return { action: "moveUp" };
    if (k.key === "ArrowDown") return { action: "moveDown" };
    if (k.key === "PageUp") return { action: "prevBlock" };
    if (k.key === "PageDown") return { action: "nextBlock" };
    const d = /^Digit([1-9])$/.exec(k.code);
    if (d) return { action: "goto", n: Number(d[1]) };
    return null;
  }
  if (k.ctrl && !k.alt) {
    if (k.key === "Enter" && !k.shift) return { action: "newBlock" };
    if (k.code === "Slash" || k.key === "/") return { action: "help" };
    if (!k.shift) {
      if (L === "s") return { action: "save" };
      if (L === "z") return { action: "undo" };
      if (L === "y") return { action: "redo" };
      if (L === "b") return { action: "bold" };
      if (L === "i") return { action: "italic" };
    } else {
      if (L === "z") return { action: "redo" };
      if (L === "d") return { action: "dup" };
      if (L === "h") return { action: "find" };
      if (L === "f") return { action: "focus" };
      if (L === "e") return { action: "preview" };
      if (L === "l") return { action: "readAloud" };
    }
    return null;
  }
  if (!k.ctrl && !k.alt && !k.typing && (k.key === "?" || (k.shift && k.code === "Slash"))) return { action: "help" };
  return null;
}

/* ───────────────────────── 5. פקודות / ───────────────────────── */

export type SlashId = "stage" | "game" | "summary" | "minutes" | "open" | "peak" | "discussion" | "unchecked" | "note";
export interface SlashCmd {
  id: SlashId;
  label: string;
  hint: string;
  aliases: string[];
}
export const SLASH_COMMANDS: SlashCmd[] = [
  { id: "stage", label: "שלב", hint: "שלב חדש מתחת לנוכחי", aliases: ["stage", "שלב חדש"] },
  { id: "game", label: "משחק", hint: "שלב משחק של 10 דקות, עם רמז לכללים", aliases: ["game", "משחקון"] },
  { id: "summary", label: "סיכום", hint: "שלב סיכום של 5 דקות", aliases: ["summary", "סגירה"] },
  { id: "minutes", label: "דקות", hint: "קובע את משך השלב הנוכחי: /דקות 10", aliases: ["minutes", "זמן", "משך"] },
  { id: "open", label: "פתיחה", hint: "שלב פתיחה של 5 דקות", aliases: ["open", "פתיח"] },
  { id: "peak", label: "שיא", hint: "שלב שיא של 15 דקות", aliases: ["peak", "רגע שיא"] },
  { id: "discussion", label: "דיון", hint: "שלב דיון של 10 דקות עם שאלות", aliases: ["discussion", "שיחה"] },
  { id: "unchecked", label: "לבדיקה", hint: "מסמן את השלב כ״טרם נבדק״", aliases: ["check", "טרם נבדק", "בדיקה"] },
  { id: "note", label: "הערה", hint: "פותח את ההערה האישית של השלב", aliases: ["note", "הערה אישית"] },
];

export interface SlashHit {
  /** תחילת השורה (כולל ה-/) וסופה, כדי למחוק אותה כשהפקודה מופעלת */
  start: number;
  end: number;
  query: string;
  arg: string;
}
/** האם הסמן נמצא בשורה שכולה פקודה: רק רווחים, /, מילה ואולי ארגומנט. */
export function slashAt(text: string, caret: number): SlashHit | null {
  const c = Math.max(0, Math.min(caret, text.length));
  const start = text.lastIndexOf("\n", c - 1) + 1;
  let end = text.indexOf("\n", c);
  if (end < 0) end = text.length;
  const line = text.slice(start, end);
  const m = /^[ \t]*\/([^\s/]*)(?:[ \t]+(.*))?$/.exec(line);
  if (!m) return null;
  return { start, end, query: m[1], arg: (m[2] ?? "").trim() };
}
export function matchSlash(query: string): SlashCmd[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.label.startsWith(q) || c.aliases.some((a) => a.toLowerCase().startsWith(q)));
}
export type SlashPlan =
  | { type: "add"; block: { kind: string; title: string; minutes: number | null; hint: string } }
  | { type: "minutes"; minutes: number }
  | { type: "flag"; flag: "unchecked" }
  | { type: "note" }
  | { type: "error"; message: string };
export function slashPlan(id: SlashId, arg: string): SlashPlan {
  switch (id) {
    case "stage":
      return { type: "add", block: { kind: "body", title: arg.slice(0, 120), minutes: null, hint: "" } };
    case "game":
      return { type: "add", block: { kind: "body", title: arg ? `משחק: ${arg}`.slice(0, 120) : "משחק", minutes: 10, hint: "כללים בשלושה משפטים: מי משחק, מה עושים ואיך מנצחים" } };
    case "summary":
      return { type: "add", block: { kind: "close", title: arg.slice(0, 120) || "סיכום", minutes: 5, hint: "מה לוקחים מהפעולה, ומה עושים איתה" } };
    case "open":
      return { type: "add", block: { kind: "open", title: arg.slice(0, 120) || "פתיחה", minutes: 5, hint: "משפט תפיסה, שאלה או מעשה קטן" } };
    case "peak":
      return { type: "add", block: { kind: "peak", title: arg.slice(0, 120) || "שיא", minutes: 15, hint: "הרגע שבו הנושא נוגע בהם באמת" } };
    case "discussion":
      return { type: "add", block: { kind: "body", title: arg.slice(0, 120) || "דיון", minutes: 10, hint: "שלוש שאלות: מה קרה, למה זה חשוב, מה עושים עם זה" } };
    case "minutes": {
      const m = /\d{1,3}/.exec(arg);
      const n = m ? Number(m[0]) : NaN;
      if (!Number.isFinite(n)) return { type: "error", message: "כתבו מספר דקות אחרי הפקודה, למשל: /דקות 10" };
      if (n > 300) return { type: "error", message: "אפשר עד 300 דקות לשלב" };
      return { type: "minutes", minutes: n };
    }
    case "unchecked":
      return { type: "flag", flag: "unchecked" };
    case "note":
      return { type: "note" };
  }
}
/** מוחק את שורת הפקודה מהטקסט ומחזיר את מיקום הסמן החדש */
export function stripRange(text: string, start: number, end: number): { text: string; caret: number } {
  const hasNl = text[end] === "\n";
  const cutEnd = hasNl ? end + 1 : end;
  const cutStart = !hasNl && start > 0 && text[start - 1] === "\n" ? start - 1 : start;
  return { text: text.slice(0, cutStart) + text.slice(cutEnd), caret: cutStart };
}

/* ───────────────────────── 7. מד זמן חי ───────────────────────── */

export type MeterLevel = "empty" | "ok" | "near" | "over" | "under";
export interface Meter {
  total: number;
  planned: number | null;
  diff: number;
  level: MeterLevel;
  /** אחוז המילוי של הפס (מוגבל ל-100, מעבר לכך נראה בצבע ובטקסט) */
  pct: number;
  label: string;
  missing: number;
  parts: { id: string; minutes: number; share: number }[];
}
/** סטייה של עד 5% (ולפחות 2 דקות) נחשבת תקינה. עד 15% כתום, מעבר לכך אדום (חריגה) או כתום-כחול (חסר). */
export function timeMeter(blocks: { id: string; minutes: number | null; text: string }[], planned: number | null | undefined): Meter {
  const total = blocks.reduce((s, b) => s + (b.minutes ?? 0), 0);
  const missing = blocks.filter((b) => b.minutes == null && b.text.trim()).length;
  const p = planned && planned > 0 ? planned : null;
  const parts = blocks.map((b) => ({ id: b.id, minutes: b.minutes ?? 0, share: total ? (b.minutes ?? 0) / total : 0 }));
  if (!total) return { total, planned: p, diff: 0, level: "empty", pct: 0, label: p ? `עוד לא חולקו דקות. המשך המתוכנן הוא ${p} דקות` : "עוד לא חולקו דקות לשלבים", missing, parts };
  if (p === null) return { total, planned: null, diff: 0, level: "ok", pct: 100, label: `${total} דקות בסך הכול. אפשר לקבוע משך מתוכנן כדי לראות סטייה`, missing, parts };
  const diff = total - p;
  const tol = Math.max(2, Math.round(p * 0.05));
  const abs = Math.abs(diff);
  let level: MeterLevel = "ok";
  if (abs > tol) level = abs <= p * 0.15 ? "near" : diff > 0 ? "over" : "under";
  const label = diff === 0 ? `בדיוק ${p} דקות, כמו שתוכנן` : diff > 0 ? `${diff} דקות מעבר לתכנון (${total} מתוך ${p})` : `חסרות ${-diff} דקות לתכנון (${total} מתוך ${p})`;
  return { total, planned: p, diff, level, pct: Math.min(100, Math.round((total / p) * 100)), label, missing, parts };
}

/* ───────────────────────── 8. בדיקת סגנון בעברית ───────────────────────── */

export type StyleKind = "long" | "repeat" | "double" | "opener" | "gender";
export interface StyleIssue {
  /** אינדקס השלב (מ-0) */
  b: number;
  id: string;
  kind: StyleKind;
  start: number;
  end: number;
  text: string;
  message: string;
  suggest?: string;
}
export type GenderMode = "mixed" | "boys" | "girls" | null;
export function genderMode(ageGroup: string | undefined | null): GenderMode {
  const g = String(ageGroup ?? "");
  if (/מעורב$/.test(g)) return "mixed";
  if (/בנים$/.test(g)) return "boys";
  if (/בנות$/.test(g)) return "girls";
  return null;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'"׳״-]*/gu;
export const countTokens = (s: string) => (s.match(WORD) ?? []).length;

/** משפטים עם מיקומים בטקסט המקורי. מפריד בנקודה, סימן שאלה או קריאה, ובירידת שורה. */
export function sentenceSpans(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const push = (a: number, b: number) => {
    // מוריד רק סימוני בלוק בתחילת המשפט (כותרת, ציטוט, תבליט, מספור) ולא כוכביות של הדגשה
    const head = /^(?:\s+|#{1,6}\s+|>\s*|[-*•]\s+|\d{1,2}[.)]\s+)+/.exec(text.slice(a, b));
    let s = a + (head ? head[0].length : 0);
    let e = b;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e, text: text.slice(s, e) });
  };
  const re = /[.!?…]+(?=\s|$)|\n+/g;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const isNl = m[0][0] === "\n";
    push(from, isNl ? m.index : m.index + m[0].length);
    from = m.index + m[0].length;
  }
  push(from, text.length);
  return out;
}

const STOP = new Set(["שלהם", "שלהן", "אנחנו", "הזה", "הזאת", "האלה", "כדי", "אחרי", "לפני", "בתוך", "מאוד", "עוד", "כמו", "אבל", "גם", "אחד", "אחת", "אפשר", "צריך", "יהיה", "היה", "היא", "הוא", "הם", "הן", "אתם", "אתן", "שלנו", "שלכם", "כאשר", "אשר", "לכל", "כולם", "כולן", "מה", "למה", "איך", "מתי", "איפה", "מי", "עם", "על", "אל", "את", "של", "לא", "כן", "יש", "אין"]);

interface GenderRule {
  stem: string;
  both: string;
  /** מה צריך לבוא אחריו כדי שיוגדר "פנייה לשני המינים" (למשל "ו" + החלק המקביל) */
  partner: string;
}
const MASC: GenderRule[] = [
  { stem: "חניכים", both: "חניכים וחניכות", partner: "חניכות" },
  { stem: "ילדים", both: "ילדים וילדות", partner: "ילדות" },
  { stem: "בנים", both: "בנים ובנות", partner: "בנות" },
  { stem: "מדריכים", both: "מדריכים ומדריכות", partner: "מדריכות" },
  { stem: "צופים", both: "צופים וצופות", partner: "צופות" },
  { stem: "כולם", both: "כולם וכולן", partner: "כולן" },
  { stem: "כל אחד", both: "כל אחד וכל אחת", partner: "כל אחת" },
];
const FEM: GenderRule[] = [
  { stem: "חניכות", both: "חניכים וחניכות", partner: "חניכים" },
  { stem: "ילדות", both: "ילדים וילדות", partner: "ילדים" },
  { stem: "בנות", both: "בנים ובנות", partner: "בנים" },
  { stem: "מדריכות", both: "מדריכים ומדריכות", partner: "מדריכים" },
  { stem: "צופות", both: "צופים וצופות", partner: "צופים" },
  { stem: "כולן", both: "כולם וכולן", partner: "כולם" },
  { stem: "כל אחת", both: "כל אחד וכל אחת", partner: "כל אחד" },
];
// קידומות: ו, ה, ב, כ, ל, ש, ומ+ה. בלי "מ" לבד, כדי ש"מבנים" (מבנה) לא ייחשב "בנים".
const PRE = "(?:מה|[והבכלש]){0,2}";

export function styleCheck(blocks: { id: string; title: string; text: string }[], opts: { mode?: GenderMode; maxWords?: number } = {}): StyleIssue[] {
  const maxWords = opts.maxWords ?? 22;
  const out: StyleIssue[] = [];
  blocks.forEach((blk, b) => {
    const text = blk.text;
    if (!text.trim()) return;
    const sents = sentenceSpans(text);
    // משפטים ארוכים
    for (const s of sents) {
      const n = countTokens(s.text);
      if (n > maxWords) out.push({ b, id: blk.id, kind: "long", start: s.start, end: s.end, text: s.text.slice(0, 80) + (s.text.length > 80 ? "…" : ""), message: `משפט של ${n} מילים. בדיבור קשה לעקוב אחרי יותר מ-${maxWords}: כדאי לפצל לשניים.` });
    }
    // משפטים רצופים שפותחים באותה מילה
    for (let i = 0; i + 2 < sents.length; i++) {
      const w = (x: string) => (x.match(WORD) ?? [""])[0];
      const a = w(sents[i].text);
      if (a.length >= 2 && countTokens(sents[i].text) >= 4 && a === w(sents[i + 1].text) && a === w(sents[i + 2].text) && countTokens(sents[i + 1].text) >= 4 && countTokens(sents[i + 2].text) >= 4) {
        out.push({ b, id: blk.id, kind: "opener", start: sents[i].start, end: sents[i + 2].end, text: `${a}… ${a}… ${a}…`, message: `שלושה משפטים ברצף פותחים ב"${a}". שינוי הפתיחה באחד מהם יעשה את הטקסט זורם יותר.` });
        i += 2;
      }
    }
    // מילים כפולות וחזרות צפופות
    const toks: { w: string; start: number; end: number }[] = [];
    const re = new RegExp(WORD.source, "gu");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) toks.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    for (let i = 1; i < toks.length; i++) {
      if (toks[i].w === toks[i - 1].w && toks[i].w.length >= 2 && !/^\d+$/.test(toks[i].w) && !/^[\p{L}]$/u.test(toks[i].w)) {
        const between = text.slice(toks[i - 1].end, toks[i].start);
        if (/^[ \t]+$/.test(between)) out.push({ b, id: blk.id, kind: "double", start: toks[i - 1].start, end: toks[i].end, text: `${toks[i].w} ${toks[i].w}`, message: `המילה "${toks[i].w}" הופיעה פעמיים ברצף.`, suggest: toks[i].w });
      }
    }
    const seen = new Set<string>();
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i].w;
      if (w.length < 4 || STOP.has(w) || seen.has(w) || /^\d+$/.test(w)) continue;
      let c = 1;
      for (let j = i + 1; j < toks.length && j < i + 30; j++) if (toks[j].w === w) c++;
      if (c >= 3) {
        seen.add(w);
        out.push({ b, id: blk.id, kind: "repeat", start: toks[i].start, end: toks[i].end, text: w, message: `"${w}" חוזרת ${c} פעמים בקטע קצר. אפשר להחליף באחת ממילים נרדפות או לוותר על חלק מהן.` });
      }
    }
    // לשון זכר/נקבה
    if (opts.mode) {
      const rules = opts.mode === "mixed" ? [...MASC, ...FEM] : opts.mode === "girls" ? MASC : FEM;
      for (const r of rules) {
        const re2 = new RegExp(`(?<![\\p{L}])(${PRE})(${r.stem.replace(/ /g, "\\s+")})(?![\\p{L}])`, "gu");
        let g: RegExpExecArray | null;
        while ((g = re2.exec(text))) {
          const after = text.slice(g.index + g[0].length, g.index + g[0].length + 14);
          const before = text.slice(Math.max(0, g.index - 14), g.index);
          // "חניכים וחניכות" או "חניכות וחניכים": כבר פונה לשני המינים
          const withPartner = new RegExp(`^\\s*(?:ו|או)?\\s*${PRE}${r.partner.replace(/ /g, "\\s+")}`, "u").test(after) || new RegExp(`${r.partner.replace(/ /g, "\\s+")}\\s*(?:ו|או)?\\s*$`, "u").test(before);
          if (opts.mode === "mixed" && withPartner) continue;
          const mode = opts.mode;
          const why = mode === "mixed" ? "הקבוצה מעורבת" : mode === "boys" ? "הקבוצה היא קבוצת בנים" : "הקבוצה היא קבוצת בנות";
          out.push({ b, id: blk.id, kind: "gender", start: g.index + g[1].length, end: g.index + g[0].length, text: r.stem, message: mode === "mixed" ? `${why}, ו"${r.stem}" פונה רק לצד אחד. אפשר: "${g[1]}${r.both}".` : `${why}, ו"${r.stem}" הוא לשון ${rules === MASC ? "זכר" : "נקבה"}. בדקו שהניסוח מתאים.`, suggest: mode === "mixed" ? `${g[1]}${r.both}` : undefined });
        }
      }
    }
  });
  return out.sort((x, y) => x.b - y.b || x.start - y.start).slice(0, 60);
}

/* ───────────────────────── 11. חיפוש והחלפה בכל המסמך ───────────────────────── */

export type FindField = "title" | "text" | "note";
export interface FindOpts {
  matchCase?: boolean;
  whole?: boolean;
  /** עם "מילה שלמה": לכלול גם צורות עם קידומת (ה, ו, ב, ל, כ, מ, ש), ולהחליף רק את השורש */
  prefixes?: boolean;
  fields?: FindField[];
  /** חיפוש רק בשלב אחד */
  onlyBlock?: string;
}
export interface Hit {
  b: number;
  id: string;
  field: FindField;
  start: number;
  end: number;
  before: string;
  hit: string;
  after: string;
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HEB_PRE = "(?:[והבכלמש]{1,3})?";
function finder(query: string, o: FindOpts): RegExp | null {
  if (!query) return null;
  const q = escRe(query);
  const flags = o.matchCase ? "gu" : "giu";
  if (!o.whole) return new RegExp(q, flags);
  const pre = o.prefixes ? HEB_PRE : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])(${pre})(${q})(?![\\p{L}\\p{N}])`, flags);
}
export function findAll(blocks: W75Block[], query: string, o: FindOpts = {}): Hit[] {
  const re = finder(query, o);
  if (!re) return [];
  const fields = o.fields ?? ["title", "text"];
  const out: Hit[] = [];
  blocks.forEach((blk, b) => {
    if (o.onlyBlock && blk.id !== o.onlyBlock) return;
    for (const field of fields) {
      const s = blk[field] ?? "";
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const stemStart = o.whole ? m.index + (m[1]?.length ?? 0) : m.index;
        const stemEnd = o.whole ? stemStart + (m[2]?.length ?? 0) : m.index + m[0].length;
        if (stemEnd === stemStart) {
          re.lastIndex++;
          continue;
        }
        out.push({ b, id: blk.id, field, start: stemStart, end: stemEnd, before: s.slice(Math.max(0, stemStart - 24), stemStart), hit: s.slice(stemStart, stemEnd), after: s.slice(stemEnd, stemEnd + 24) });
      }
    }
  });
  return out;
}
function applyHits(blocks: W75Block[], hits: Hit[], repl: string): W75Block[] {
  const by = new Map<string, Hit[]>();
  for (const h of hits) by.set(`${h.id}|${h.field}`, [...(by.get(`${h.id}|${h.field}`) ?? []), h]);
  return blocks.map((blk) => {
    let next = blk;
    for (const field of ["title", "text", "note"] as FindField[]) {
      const hs = by.get(`${blk.id}|${field}`);
      if (!hs) continue;
      let s = blk[field];
      for (const h of [...hs].sort((x, y) => y.start - x.start)) s = s.slice(0, h.start) + repl + s.slice(h.end);
      next = { ...next, [field]: s };
    }
    return next;
  });
}
export function replaceAllHits(blocks: W75Block[], query: string, repl: string, o: FindOpts = {}): { blocks: W75Block[]; count: number; touched: number } {
  const hits = findAll(blocks, query, o);
  const res = applyHits(blocks, hits, repl);
  return { blocks: res, count: hits.length, touched: new Set(hits.map((h) => h.id)).size };
}
export function replaceOneHit(blocks: W75Block[], hit: Hit, repl: string): W75Block[] {
  return applyHits(blocks, [hit], repl);
}

/* ───────────────────────── 1. היסטוריית ביטול מקומית לכל שלב ───────────────────────── */

export interface HistEntry {
  at: number;
  title: string;
  text: string;
}
export interface BlockHist {
  stack: HistEntry[];
  redo: HistEntry[];
  last: { title: string; text: string } | null;
  lastAt: number;
}
export type HistState = Record<string, BlockHist>;
export const HIST_MAX = 40;
export const HIST_GAP_MS = 1200;
export const HIST_CHARS = 300_000;

const fresh = (): BlockHist => ({ stack: [], redo: [], last: null, lastAt: 0 });
const eq = (a: { title: string; text: string } | null, b: { title: string; text: string }) => !!a && a.title === b.title && a.text === b.text;

/** רושם מצב נוכחי של שלב. רצף עריכות צמוד נחשב לפעימה אחת, ומקודם לה נשמר המצב שלפניה. */
export function histRecord(h: HistState, id: string, cur: { title: string; text: string }, now: number): HistState {
  const prev = h[id] ?? fresh();
  if (prev.last === null) return { ...h, [id]: { ...prev, last: { title: cur.title, text: cur.text }, lastAt: now } };
  if (eq(prev.last, cur)) return h;
  let stack = prev.stack;
  if (now - prev.lastAt >= HIST_GAP_MS || stack.length === 0) {
    if (!eq(stack[stack.length - 1] ?? null, prev.last)) stack = [...stack, { at: prev.lastAt, title: prev.last.title, text: prev.last.text }].slice(-HIST_MAX);
  }
  return { ...h, [id]: { stack, redo: [], last: { title: cur.title, text: cur.text }, lastAt: now } };
}
export function histUndo(h: HistState, id: string, cur: { title: string; text: string }, now: number): { state: HistState; apply: { title: string; text: string } | null } {
  const synced = histRecord(h, id, cur, now);
  const e = synced[id];
  if (!e || !e.stack.length) return { state: synced, apply: null };
  const top = e.stack[e.stack.length - 1];
  const stack = e.stack.slice(0, -1);
  const redo = [...e.redo, { at: now, title: cur.title, text: cur.text }].slice(-HIST_MAX);
  return { state: { ...synced, [id]: { stack, redo, last: { title: top.title, text: top.text }, lastAt: 0 } }, apply: { title: top.title, text: top.text } };
}
export function histRedo(h: HistState, id: string, cur: { title: string; text: string }, now: number): { state: HistState; apply: { title: string; text: string } | null } {
  const e = h[id];
  if (!e || !e.redo.length || !eq(e.last, cur)) return { state: h, apply: null };
  const top = e.redo[e.redo.length - 1];
  const redo = e.redo.slice(0, -1);
  const stack = [...e.stack, { at: now, title: cur.title, text: cur.text }].slice(-HIST_MAX);
  return { state: { ...h, [id]: { stack, redo, last: { title: top.title, text: top.text }, lastAt: 0 } }, apply: { title: top.title, text: top.text } };
}
/** מצבים קודמים של השלב, מהחדש לישן, לבחירה ידנית */
export const histList = (h: HistState, id: string): HistEntry[] => [...(h[id]?.stack ?? [])].reverse();
/** שחזור מצב מהרשימה (האינדקס לפי histList). המצב הנוכחי נכנס להיסטוריה, כך שגם השחזור ניתן לביטול. */
export function histRestore(h: HistState, id: string, index: number, cur: { title: string; text: string }, now: number): { state: HistState; apply: { title: string; text: string } | null } {
  const list = histList(h, id);
  const pick = list[index];
  if (!pick) return { state: h, apply: null };
  const synced = histRecord(h, id, cur, now);
  const e = synced[id];
  const stack = [...e.stack, { at: now, title: cur.title, text: cur.text }].slice(-HIST_MAX);
  return { state: { ...synced, [id]: { stack, redo: [], last: { title: pick.title, text: pick.text }, lastAt: 0 } }, apply: { title: pick.title, text: pick.text } };
}
/** מוחק היסטוריה של שלבים שנמחקו, ומקצץ את הישן ביותר כשהסך עובר את התקרה */
export function histTrim(h: HistState, liveIds: string[]): HistState {
  const keep = new Set(liveIds);
  const out: HistState = {};
  for (const [id, e] of Object.entries(h)) if (keep.has(id)) out[id] = e;
  const size = (e: BlockHist) => e.stack.reduce((s, x) => s + x.text.length + x.title.length, 0) + e.redo.reduce((s, x) => s + x.text.length + x.title.length, 0);
  let total = Object.values(out).reduce((s, e) => s + size(e), 0);
  while (total > HIST_CHARS) {
    let worst: string | null = null;
    let worstSize = 0;
    for (const [id, e] of Object.entries(out)) {
      const s = size(e);
      if (e.stack.length > 0 && s > worstSize) {
        worst = id;
        worstSize = s;
      }
    }
    if (!worst) break;
    const e = out[worst];
    const drop = e.stack[0];
    out[worst] = { ...e, stack: e.stack.slice(1) };
    total -= drop.text.length + drop.title.length;
  }
  return out;
}
export function histParse(raw: string | null): HistState {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    const out: HistState = {};
    for (const [id, v] of Object.entries(j as Record<string, BlockHist>)) {
      if (!v || !Array.isArray(v.stack) || !Array.isArray(v.redo)) continue;
      const ok = (x: HistEntry) => x && typeof x.text === "string" && typeof x.title === "string" && typeof x.at === "number";
      out[String(id).slice(0, 24)] = { stack: v.stack.filter(ok).slice(-HIST_MAX), redo: v.redo.filter(ok).slice(-HIST_MAX), last: v.last && typeof v.last.text === "string" && typeof v.last.title === "string" ? { title: v.last.title, text: v.last.text } : null, lastAt: 0 };
    }
    return out;
  } catch {
    return {};
  }
}

/* ───────────────────────── 2. שמירה מקומית ושחזור מול השרת ───────────────────────── */

export interface LocalBuffer {
  rev: number;
  snap: W75Snap;
  /** הנוסח האחרון שהשרת אישר כשהמאגר נכתב: נקודת המוצא למיזוג */
  base?: W75Snap;
  at?: number;
}
export type Recovery =
  | { kind: "none" }
  | { kind: "restore"; snap: W75Snap }
  | { kind: "merge"; snap: W75Snap; conflicts: string[]; mineChanged: number }
  | { kind: "conflict"; mine: W75Snap; theirs: W75Snap; reason: "no-base" };
type MergeBlocksFn = (base: W75Block[], mine: W75Block[], theirs: W75Block[]) => { blocks: W75Block[]; conflicts: string[] };
type MergeFieldsFn = (base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>) => Record<string, unknown>;
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
export const sameSnap = (a: W75Snap, b: W75Snap) => canon(a) === canon(b);

/**
 * מה עושים עם הנוסח שנשמר במכשיר כשפותחים את המסמך. עד עכשיו נוסח ששמרתי כשהמסמך השתנה בינתיים בשרת פשוט נמחק.
 * עכשיו: אם יש נקודת מוצא ממזגים ברמת שלב (ושינויים שהתנגשו נשארים אצלי, והנוסח של השרת נשמר בגרסאות), ואם אין, לא מוחקים אלא שואלים.
 */
export function recoveryPlan(buf: LocalBuffer | null, server: { rev: number; snap: W75Snap }, merge: { blocks: MergeBlocksFn; fields: MergeFieldsFn }): Recovery {
  if (!buf || !buf.snap) return { kind: "none" };
  if (sameSnap(buf.snap, server.snap)) return { kind: "none" };
  if (buf.rev === server.rev) return { kind: "restore", snap: buf.snap };
  if (!buf.base) return { kind: "conflict", mine: buf.snap, theirs: server.snap, reason: "no-base" };
  const base = buf.base;
  const blocks = merge.blocks(base.blocks, buf.snap.blocks, server.snap.blocks);
  const snap: W75Snap = {
    title: buf.snap.title === base.title ? server.snap.title : buf.snap.title,
    meta: merge.fields(base.meta, buf.snap.meta, server.snap.meta),
    blocks: blocks.blocks,
  };
  if (sameSnap(snap, server.snap)) return { kind: "none" };
  const mineChanged = buf.snap.blocks.filter((b) => canon(base.blocks.find((x) => x.id === b.id)) !== canon(b)).length + (buf.snap.title !== base.title ? 1 : 0);
  return { kind: "merge", snap, conflicts: blocks.conflicts, mineChanged };
}

/* ───────────────────────── 13. השוואה צד-לצד ───────────────────────── */

export interface Part {
  t: string;
  k: "same" | "del" | "add";
}
export type RowStatus = "same" | "changed" | "added" | "removed" | "moved";
export interface CmpRow {
  key: string;
  status: RowStatus;
  left: W75Block | null;
  right: W75Block | null;
  fields: string[];
  leftParts: Part[];
  rightParts: Part[];
}
export interface Compare {
  rows: CmpRow[];
  titleChanged: boolean;
  counts: Record<RowStatus, number>;
}
const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
/**
 * הבדלי מילים בין שני טקסטים. קודם מסירים התחלה וסוף משותפים (רוב העריכות), ובאמצע מריצים LCS.
 * כשהאמצע ענק (מעל 4 מיליון השוואות) לא מנסים לחשב ומסמנים אותו כמוחלף כולו, כדי לא לתקוע את הדפדפן ולא לצרוך זיכרון.
 */
export function wordParts(a: string, b: string): { left: Part[]; right: Part[] } {
  const left: Part[] = [];
  const right: Part[] = [];
  const add = (arr: Part[], t: string, k: Part["k"]) => {
    if (!t) return;
    const last = arr[arr.length - 1];
    if (last && last.k === k) last.t += t;
    else arr.push({ t, k });
  };
  if (a === b) {
    add(left, a, "same");
    add(right, b, "same");
    return { left, right };
  }
  const x: string[] = tokens(a);
  const y: string[] = tokens(b);
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let q = 0;
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
  const xm = x.slice(p, x.length - q);
  const ym = y.slice(p, y.length - q);
  add(left, x.slice(0, p).join(""), "same");
  add(right, y.slice(0, p).join(""), "same");
  const n = xm.length;
  const m = ym.length;
  if (n * m > 4_000_000) {
    add(left, xm.join(""), "del");
    add(right, ym.join(""), "add");
  } else {
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = xm[i] === ym[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (xm[i] === ym[j]) {
        add(left, xm[i], "same");
        add(right, ym[j], "same");
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) add(left, xm[i++], "del");
      else add(right, ym[j++], "add");
    }
    while (i < n) add(left, xm[i++], "del");
    while (j < m) add(right, ym[j++], "add");
  }
  add(left, x.slice(x.length - q).join(""), "same");
  add(right, y.slice(y.length - q).join(""), "same");
  return { left, right };
}
const FIELDS: [keyof W75Block, string][] = [
  ["title", "הכותרת"],
  ["kind", "הסוג"],
  ["minutes", "הזמן"],
  ["text", "הטקסט"],
  ["done", "סימון מוכן"],
  ["unchecked", "סימון טרם נבדק"],
];
const val = (b: W75Block, k: keyof W75Block) => (k === "minutes" ? (b.minutes ?? null) : k === "done" || k === "unchecked" ? !!b[k] : (b[k] ?? ""));
/** מצמיד שלבים לפי המזהה (גרסאות של אותו מסמך שומרות מזהים). שלבים שאין להם זוג מסומנים כנוספו או הוסרו. */
export function compareDocs(a: W75Snap, b: W75Snap): Compare {
  const A = new Map(a.blocks.map((x) => [x.id, x]));
  const B = new Map(b.blocks.map((x) => [x.id, x]));
  const rows: CmpRow[] = [];
  const posA = new Map(a.blocks.map((x, i) => [x.id, i]));
  const commonA = a.blocks.filter((x) => B.has(x.id)).map((x) => x.id);
  const commonB = b.blocks.filter((x) => A.has(x.id)).map((x) => x.id);
  const moved = new Set<string>();
  // אורך תת-הסדרה הרציפה הארוכה ביותר שנשארה במקומה: מה שמחוצה לה הוזז
  const idxInB = new Map(commonB.map((id, i) => [id, i]));
  const seq = commonA.map((id) => idxInB.get(id) as number);
  const lis: number[] = [];
  const prev: number[] = [];
  const tails: number[] = [];
  seq.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) lis.push(k);
  const stay = new Set(lis.map((i) => commonA[i]));
  for (const id of commonA) if (!stay.has(id)) moved.add(id);
  const row = (left: W75Block | null, right: W75Block | null, forcedMoved = false): CmpRow => {
    if (left && !right) return { key: left.id, status: "removed", left, right: null, fields: [], leftParts: [{ t: left.text, k: "del" }], rightParts: [] };
    if (!left && right) return { key: right.id, status: "added", left: null, right, fields: [], leftParts: [], rightParts: [{ t: right.text, k: "add" }] };
    const l = left as W75Block;
    const r = right as W75Block;
    const fields = FIELDS.filter(([k]) => val(l, k) !== val(r, k)).map(([, name]) => name);
    const parts = l.text === r.text ? { left: l.text ? [{ t: l.text, k: "same" as const }] : [], right: r.text ? [{ t: r.text, k: "same" as const }] : [] } : wordParts(l.text, r.text);
    return { key: r.id, status: fields.length ? "changed" : forcedMoved ? "moved" : "same", left: l, right: r, fields, leftParts: parts.left, rightParts: parts.right };
  };
  // הסדר של הצד החדש. שלבים שהוסרו נכנסים מיד אחרי השלב שקדם להם בצד הישן.
  const removedAfter = new Map<string, W75Block[]>();
  const head: W75Block[] = [];
  a.blocks.forEach((x, i) => {
    if (B.has(x.id)) return;
    let p = i - 1;
    while (p >= 0 && !B.has(a.blocks[p].id)) p--;
    if (p < 0) head.push(x);
    else removedAfter.set(a.blocks[p].id, [...(removedAfter.get(a.blocks[p].id) ?? []), x]);
  });
  for (const x of head) rows.push(row(x, null));
  for (const r of b.blocks) {
    rows.push(row(A.get(r.id) ?? null, r, moved.has(r.id)));
    for (const x of removedAfter.get(r.id) ?? []) rows.push(row(x, null));
  }
  void posA;
  const counts: Record<RowStatus, number> = { same: 0, changed: 0, added: 0, removed: 0, moved: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, titleChanged: a.title !== b.title, counts };
}

/* ───────────────────────── 6. גרירה ושינוי סדר ───────────────────────── */

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
/** משבצת ההכנסה (0 עד n) לפי גובה האצבע או העכבר: לפני השלב הראשון שמרכזו מתחת לנקודה, או n אם הנקודה מתחת לכולם */
export function dropIndex(rects: { top: number; height: number }[], y: number): number {
  for (let i = 0; i < rects.length; i++) if (y < rects[i].top + rects[i].height / 2) return i;
  return rects.length;
}
/** המקום הסופי של פריט שנגרר מ-from אל משבצת ההכנסה slot (אחרי שהוא יוצא ממקומו הישן, מה שמקדים בשבצת אחת כשיורדים למטה) */
export const dropTarget = (from: number, slot: number, n: number): number => Math.max(0, Math.min(n - 1, slot > from ? slot - 1 : slot));
export const moveAnnounce = (title: string, from: number, to: number, total: number) => `השלב "${title || "ללא שם"}" הוזז ממקום ${from + 1} למקום ${to + 1} מתוך ${total}`;

/* ───────────────────────── 17. שלבים שנמחקו ───────────────────────── */

export interface Trashed {
  at: number;
  index: number;
  block: W75Block;
}
export const TRAY_MAX = 20;
export const TRAY_DAYS = 7;
export function trayPush(tray: Trashed[], block: W75Block, index: number, now: number): Trashed[] {
  if (!block.text.trim() && !block.title.trim() && !block.note.trim()) return tray;
  return [{ at: now, index, block }, ...tray.filter((t) => t.block.id !== block.id)].slice(0, TRAY_MAX);
}
export function trayRestore(blocks: W75Block[], tray: Trashed[], id: string): { blocks: W75Block[]; tray: Trashed[]; ok: boolean; reason?: string } {
  const t = tray.find((x) => x.block.id === id);
  if (!t) return { blocks, tray, ok: false, reason: "השלב לא נמצא במחוק לאחרונה" };
  if (blocks.length >= LIMITS.blocks) return { blocks, tray, ok: false, reason: `יש כבר ${LIMITS.blocks} שלבים. מחקו שלב לפני השחזור` };
  const at = Math.max(0, Math.min(t.index, blocks.length));
  const block = blocks.some((b) => b.id === t.block.id) ? { ...t.block, id: Math.random().toString(36).slice(2, 10) } : t.block;
  return { blocks: [...blocks.slice(0, at), block, ...blocks.slice(at)], tray: tray.filter((x) => x.block.id !== id), ok: true };
}
export const trayPrune = (tray: Trashed[], now: number): Trashed[] => tray.filter((t) => now - t.at < TRAY_DAYS * 86_400_000).slice(0, TRAY_MAX);
export function trayParse(raw: string | null, now: number): Trashed[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as Trashed[];
    if (!Array.isArray(j)) return [];
    return trayPrune(
      j.filter((t) => t && typeof t.at === "number" && typeof t.index === "number" && t.block && typeof t.block.id === "string" && typeof t.block.text === "string" && typeof t.block.title === "string" && typeof t.block.note === "string"),
      now,
    );
  } catch {
    return [];
  }
}

/* ───────────────────────── 14. "טרם נבדק" ───────────────────────── */

export const uncheckedOf = (blocks: W75Block[]) => blocks.map((b, i) => ({ b, i })).filter((x) => x.b.unchecked);
/** אזהרה לפני ייצוא או שיתוף, או null כשהכול נבדק */
export function exportWarning(blocks: W75Block[]): string | null {
  const u = uncheckedOf(blocks);
  if (!u.length) return null;
  const names = u.slice(0, 4).map((x) => `${x.i + 1}. ${x.b.title || "ללא כותרת"}`);
  return `${u.length === 1 ? "שלב אחד עדיין מסומן" : `${u.length} שלבים עדיין מסומנים`} "טרם נבדק": ${names.join(", ")}${u.length > 4 ? " ועוד" : ""}. כדאי לעבור עליהם לפני שמעבירים הלאה.`;
}

/* ───────────────────────── 16. הדפסה ב-A4 ועימוד חכם ───────────────────────── */

export interface PageEstimate {
  pages: number;
  lines: number;
  /** לכל שלב: האם כדאי לשמור אותו בעמוד אחד, ואם הוא פותח עמוד חדש (ולמה) */
  blocks: { keep: boolean; lines: number; newPage: boolean; reason: string }[];
}
/** הערכה גסה לדף A4 עם שוליים של 15 מ"מ, גופן 11pt ושורות של כ-85 תווים. נשמרת בנפרד מההדפסה האמיתית, שנקבעת ב-CSS. */
export function paginate(blocks: { title: string; text: string }[], opts: { linesPerPage?: number; cpl?: number } = {}): PageEstimate {
  const per = opts.linesPerPage ?? 44;
  const cpl = opts.cpl ?? 85;
  const sizes = blocks.map((b) => {
    const body = b.text
      .split("\n")
      .map((l) => (l.trim() ? Math.max(1, Math.ceil(l.replace(/[#>*|_`-]/g, "").length / cpl)) : 1))
      .reduce((s, x) => s + x, 0);
    return 3 + body;
  });
  let used = 0;
  let pages = 1;
  const out: PageEstimate["blocks"] = [];
  sizes.forEach((lines, i) => {
    const keep = lines <= Math.round(per * 0.45);
    let newPage = false;
    let reason = "";
    const left = per - used;
    if (keep && lines > left) {
      newPage = true;
      reason = "השלב קצר ולא נכנס בשלמותו בסוף העמוד, ולכן עובר לעמוד הבא";
    } else if (!keep && left < 5 && used > 0) {
      newPage = true;
      reason = "לא נשארו שורות מספיקות אחרי הכותרת, ולכן השלב מתחיל בעמוד הבא";
    }
    if (newPage) {
      pages++;
      used = 0;
    }
    let rest = lines;
    while (rest > per - used) {
      rest -= per - used;
      pages++;
      used = 0;
    }
    used += rest;
    out.push({ keep, lines, newPage, reason });
    void i;
  });
  return { pages, lines: sizes.reduce((s, x) => s + x, 0), blocks: out };
}

/* ───────────────────────── 9. "הקרא לי" ───────────────────────── */

export interface ReadChunk {
  b: number;
  start: number;
  end: number;
  text: string;
}
const stripMd = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^#{1,4}\s+/gm, "").replace(/^>\s?/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
/** מחלק את השלב לקטעי הקראה (משפט כל פעם), עם המיקום המקורי כדי להדגיש בזמן הקראה */
export function readChunks(blocks: { title: string; text: string }[], from: number, scope: "block" | "fromHere" | "all"): ReadChunk[] {
  const out: ReadChunk[] = [];
  const range = scope === "block" ? [from] : scope === "all" ? blocks.map((_, i) => i) : blocks.map((_, i) => i).filter((i) => i >= from);
  for (const b of range) {
    const blk = blocks[b];
    if (!blk) continue;
    for (const s of sentenceSpans(blk.text)) {
      const t = stripMd(s.text).replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
      if (t.length > 1) out.push({ b, start: s.start, end: s.end, text: t });
    }
  }
  return out;
}
/** כמה שניות נמשכת הקראה של טקסט במהירות נתונה (כ-130 מילים בדקה במהירות 1) */
export const readSeconds = (words: number, rate = 1) => Math.round((words / (130 * Math.max(0.5, rate))) * 60);
export function readFlow(blocks: { title: string; text: string; minutes: number | null }[], rate = 1): { b: number; seconds: number; planned: number | null; note: string }[] {
  return blocks.map((blk, b) => {
    const seconds = readSeconds(countTokens(blk.text), rate);
    const planned = blk.minutes;
    let note = "";
    if (planned && seconds > planned * 60) note = `הקראת הטקסט לבדה נמשכת כ-${Math.ceil(seconds / 60)} דקות, יותר מהזמן שתוכנן לשלב (${planned}). אין מקום לחניכים.`;
    else if (planned && seconds > planned * 60 * 0.6) note = `הקראת הטקסט תופסת כ-${Math.round((seconds / (planned * 60)) * 100)}% מזמן השלב.`;
    return { b, seconds, planned, note };
  });
}

// שלב 57 (470–474): פענוח שיחות (ייצוא וואטסאפ או הדבקה) והסתרת פרטים מזהים לפני כל ניתוח.
// הכול כאן פונקציות טהורות: לא נוגעות במסד ולא שומרות את הטקסט.

const BIDI = /[‎‏‪-‮⁦-⁩﻿]/g;
export const MAX_MESSAGES = 6000;
export const MAX_TEXT = 600;

const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?`;
const DATE = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})`;
const HEAD_ANDROID = new RegExp(String.raw`^${DATE},?\s+${TIME}\s*[-–—]\s+(.*)$`);
const HEAD_IOS = new RegExp(String.raw`^\[${DATE},?\s+${TIME}\]\s+(.*)$`);
const MEDIA = /^(?:<מדיה לא נכללה>|<Media omitted>|(?:תמונה|סרטון|סטיקר|GIF|מסמך|אודיו|הודעה קולית|איש קשר|קובץ|מיקום)[^:\n]{0,16}לא נכלל\S*|(?:image|video|sticker|audio|document|GIF) omitted|<attached:[^>]*>|‎?<.{1,30}>)$/i;
const DELETED = /^(?:הודעה זו נמחקה|מחקת הודעה זו|This message was deleted|You deleted this message)\.?$/i;
const EDITED = /\s*<ההודעה נערכה>|\s*<This message was edited>/g;
const PLAIN = /^([\p{L}\p{N} '’״".()_-]{1,30}):\s+(\S.*)$/u;

const toNum = (s) => (s === undefined || s === "" ? 0 : Number(s));

function resolveDates(rows) {
  // סדר יום/חודש: אם המספר הראשון גדול מ-12 הוא יום; אם השני גדול מ-12 הסדר הפוך. ברירת מחדל ישראלית: יום/חודש.
  let dm = 0, md = 0;
  for (const r of rows) {
    if (r.a > 12) dm++;
    if (r.b > 12) md++;
  }
  const monthFirst = md > dm;
  return rows.map((r) => {
    const day = monthFirst ? r.b : r.a;
    const mon = monthFirst ? r.a : r.b;
    let h = r.h;
    if (r.ap) h = /^p/i.test(r.ap) ? (h % 12) + 12 : h % 12;
    const y = r.y < 100 ? 2000 + r.y : r.y;
    return Date.UTC(y, mon - 1, day, h, r.mi, r.s);
  });
}

const kindOf = (text) => (DELETED.test(text) ? "deleted" : MEDIA.test(text) ? "media" : "text");

/**
 * מפענח טקסט של שיחה. מחזיר הודעות מסודרות, משתתפים ופורמט שזוהה.
 * פורמטים: ייצוא וואטסאפ לאנדרואיד ("12.3.2025, 14:05 - שם: הודעה"), לאייפון ("[12.3.2025, 14:05:33] שם: הודעה"),
 * הדבקה פשוטה של שורות "שם: הודעה", והודעה בודדת.
 */
export function parseChat(raw) {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const warnings = [];
  const rows = [];
  let cur = null, heads = 0, ios = 0, systemCount = 0;
  for (const line0 of lines) {
    const line = line0.replace(BIDI, "");
    const m = HEAD_IOS.exec(line) ?? HEAD_ANDROID.exec(line);
    if (m) {
      heads++;
      if (line.startsWith("[")) ios++;
      cur = { a: toNum(m[1]), b: toNum(m[2]), y: toNum(m[3]), h: toNum(m[4]), mi: toNum(m[5]), s: toNum(m[6]), ap: m[7] || "", body: m[8] };
      rows.push(cur);
    } else if (cur) cur.body += `\n${line}`;
  }
  let format = "single";
  let messages = [];
  if (heads >= 2 || (heads === 1 && rows.length === 1 && /:\s/.test(rows[0].body))) {
    format = ios > heads / 2 ? "ios" : "android";
    const stamps = resolveDates(rows);
    rows.forEach((r, i) => {
      const body = r.body.replace(EDITED, "").trim();
      const k = body.indexOf(": ");
      const name = k > 0 ? body.slice(0, k).trim() : "";
      if (!name || name.length > 40 || name.split(/\s+/).length > 5 || k < 0) { systemCount++; return; }
      const msg = body.slice(k + 2).trim();
      if (!msg) return;
      messages.push({ who: name, ts: stamps[i], text: msg, kind: kindOf(msg) });
    });
  } else {
    const plain = lines.map((l) => l.replace(BIDI, "").trim()).filter(Boolean);
    const hits = plain.filter((l) => PLAIN.test(l));
    if (hits.length >= 2) {
      format = "plain";
      let last = null;
      for (const l of plain) {
        const m = PLAIN.exec(l);
        if (m) { last = { who: m[1].trim(), ts: null, text: m[2].trim(), kind: kindOf(m[2].trim()) }; messages.push(last); }
        else if (last) last.text += `\n${l}`;
      }
    } else if (plain.length) {
      messages = [{ who: "חניך", ts: null, text: plain.join("\n").trim(), kind: "text" }];
    }
  }
  let truncated = false;
  if (messages.length > MAX_MESSAGES) { messages = messages.slice(-MAX_MESSAGES); truncated = true; warnings.push(`השיחה ארוכה מאוד, נותחו ${MAX_MESSAGES} ההודעות האחרונות.`); }
  const counts = new Map();
  for (const m of messages) counts.set(m.who, (counts.get(m.who) || 0) + 1);
  const participants = [...counts].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
  const stamped = messages.filter((m) => m.ts !== null);
  const iso = (t) => new Date(t).toISOString().slice(0, 16);
  if (!messages.length) warnings.push("לא נמצאו הודעות בטקסט. בווטסאפ: פתחו שיחה, ⋮ (תפריט), עוד, ייצוא צ'אט, בלי מדיה.");
  if (format === "plain" || format === "single") warnings.push("אין בטקסט תאריכים ושעות, ולכן לא ייבדקו זמני תגובה ומגמות.");
  return { format, messages, systemCount, participants, from: stamped.length ? iso(stamped[0].ts) : null, to: stamped.length ? iso(stamped[stamped.length - 1].ts) : null, truncated, warnings };
}

/** סינון לפי טווח: lastDays (ימים אחרונים) ו/או lastN (הודעות אחרונות). */
export function filterRange(messages, { lastDays = 0, lastN = 0 } = {}) {
  let out = messages;
  const stamped = out.filter((m) => m.ts !== null);
  if (lastDays > 0 && stamped.length) {
    const end = stamped[stamped.length - 1].ts;
    out = out.filter((m) => m.ts === null || m.ts >= end - lastDays * 86_400_000);
  }
  if (lastN > 0 && out.length > lastN) out = out.slice(-lastN);
  return out;
}

// ───────────── הסתרת פרטים (472) ─────────────

const SCRUB = [
  ["phone", "טלפון", /(?<!\d)(?:\+?972[-\s]?|0)(?:5\d|[2-4]|[7-9])[-\s]?\d{3}[-\s]?\d{4}(?!\d)/g, "[טלפון]"],
  ["email", "מייל", /[\w.+-]+@[\w-]+\.[\w.]+/g, "[מייל]"],
  ["url", "קישור", /https?:\/\/[^\s,;)]+|www\.[^\s,;)]+/g, "[קישור]"],
  ["id", "מספר זהות", /(?<!\d)\d{9}(?!\d)/g, "[מספר]"],
  ["address", "כתובת", /(?:רחוב|רח'|שדרות|שד'|שדרת)\s+[א-ת"']+(?:\s+[א-ת"']+)?\s+\d+/g, "[כתובת]"],
  ["handle", "שם משתמש", /(?<![\w.])@[A-Za-z0-9_.]{3,}/g, "[משתמש]"],
];

export function scrubPII(text) {
  let t = String(text ?? "");
  const found = {};
  for (const [key, , rx, rep] of SCRUB) t = t.replace(rx, () => { found[key] = (found[key] || 0) + 1; return rep; });
  return { text: t, found };
}

const LETTERS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'", "כ'", "ל'", "מ'", "נ'", "ס'", "ע'", "פ'", "צ'", "ק'", "ר'", "ש'", "ת'"];
export const aliasFor = (i) => `חניך ${LETTERS[i] ?? i + 1}`;
export const ME = "אני";
const HEB = "א-ת";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** שם → תבנית שתופסת גם תחיליות עבריות (לדני, מדני, שדני). שמות קצרים (עד 2 אותיות) נתפסים רק כמילה שלמה. */
function namePattern(name) {
  const pre = name.length >= 3 ? "[ובהלמכש]{0,2}" : "";
  return new RegExp(`(?<![${HEB}\\w])(${pre})${esc(name)}(?![${HEB}\\w])`, "g");
}

const nameTokens = (name) => {
  const t = new Set();
  if (/\p{L}/u.test(name) && !/\d{5,}/.test(name)) {
    t.add(name.trim());
    for (const w of name.split(/[\s'’"׳״.-]+/)) if (w.length >= 2 && /^[\p{L}]+$/u.test(w)) t.add(w);
  }
  return [...t].sort((a, b) => b.length - a.length);
};

/**
 * מחליף שמות באינדקס ("חניך א'"), את המדריך ב-"אני", ומסיר פרטים מזהים.
 * names שלא מופיעים בשיחה כמשתתפים (למשל חבר שהוזכר) אפשר להוסיף ב-extra.
 */
export function maskMessages(messages, { me = "", extra = [], already = false } = {}) {
  const counts = new Map();
  for (const m of messages) counts.set(m.who, (counts.get(m.who) || 0) + 1);
  const ordered = [...counts].sort((a, b) => b[1] - a[1]).map(([n]) => n).filter((n) => n !== me);
  const aliases = ordered.map((name, i) => ({ name, alias: already ? name : aliasFor(i), count: counts.get(name), isMe: false }));
  if (me && counts.has(me)) aliases.unshift({ name: me, alias: ME, count: counts.get(me), isMe: true });
  const whoMap = new Map(aliases.map((a) => [a.name, a.alias]));
  const subs = [];
  if (!already) {
    for (const a of aliases) for (const tok of nameTokens(a.name)) subs.push([namePattern(tok), a.isMe ? "המדריך" : a.alias]);
    for (const x of (extra || []).map((s) => String(s).trim()).filter((s) => s.length >= 2).slice(0, 12)) subs.push([namePattern(x), "[שם]"]);
    subs.sort((p, q) => q[0].source.length - p[0].source.length);
  }
  const scrubbed = {};
  const out = messages.map((m) => {
    let t = m.text.slice(0, MAX_TEXT * 3);
    if (!already) for (const [rx, rep] of subs) t = t.replace(rx, (_, p) => `${p}${rep}`);
    t = t.replace(/@⁨?[^\s@]{1,30}⁩?/g, (mm) => (/^@(?:חניך|המדריך)/.test(mm) ? mm : "@[שם]"));
    const s = scrubPII(t);
    for (const [k, v] of Object.entries(s.found)) scrubbed[k] = (scrubbed[k] || 0) + v;
    return { who: whoMap.get(m.who) ?? (already ? m.who : "חניך"), ts: m.ts, text: s.text.slice(0, MAX_TEXT), kind: m.kind };
  });
  return { messages: out, aliases, meAlias: me && counts.has(me) ? ME : already && out.some((m) => m.who === ME) ? ME : null, scrubbed };
}

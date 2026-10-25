// ייצוא וכלים נלווים לעורך הכתיבה (רעיונות 130–138): Word עם לוגו, טקסט להעתקה,
// פירוק טקסט חופשי לשלבים, ודף הכנה.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { fadeWatermark, watermarkRuns } from "./watermark.js";
import { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { KINDS, metaDefaults } from "./routes-write.js";
import { prepOf } from "./write-suggest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };
const PURPLE = "5D2FA3";
const DARK = "1E1245";
export const KIND_LABEL = { open: "פתיחה", body: "גוף", peak: "שיא", close: "סיכום", free: "שלב" };

const blockZ = z.object({
  id: z.string().trim().min(1).max(24).default("x"),
  title: z.string().max(120).default(""),
  kind: z.enum(KINDS).default("free"),
  minutes: z.number().int().min(0).max(300).nullable().default(null),
  text: z.string().max(20000).default(""),
  note: z.string().max(5000).default(""),
});
const docZ = z.object({ title: z.string().max(120).default(""), meta: z.any().default({}), blocks: z.array(blockZ).max(60), withNotes: z.boolean().default(false) });

/** משתמש בלוגו שהאדמין העלה, ואם אין, בקובץ ברירת המחדל של השבט. */
export function findLogo(getLogo) {
  const up = getLogo?.();
  if (up?.buf && /png|jpeg/.test(up.type)) return { buf: up.buf, type: up.type.includes("png") ? "png" : "jpg" };
  for (const p of [path.join(here, "..", "public", "logo-maoz.png"), path.join(here, "..", "..", "frontend", "public", "logo-maoz.png")]) {
    try {
      if (fs.existsSync(p)) return { buf: fs.readFileSync(p), type: "png" };
    } catch {
      /* next */
    }
  }
  return null;
}

/** גודל PNG/JPEG כדי לשמור יחס. */
function imageSize(img) {
  try {
    if (img.type === "png") return { w: img.buf.readUInt32BE(16), h: img.buf.readUInt32BE(20) };
    let i = 2;
    while (i < img.buf.length) {
      if (img.buf[i] !== 0xff) break;
      const m = img.buf[i + 1];
      const len = img.buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) return { h: img.buf.readUInt16BE(i + 5), w: img.buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  } catch {
    /* fallthrough */
  }
  return { w: 1, h: 1 };
}

const run = (t, o = {}) => new TextRun({ text: String(t ?? ""), rightToLeft: true, font: FONT, ...o });
const para = (children, o = {}) => new Paragraph({ bidirectional: true, alignment: AlignmentType.START, spacing: { after: 100, line: 300 }, ...o, children: Array.isArray(children) ? children : [run(children)] });

/** **מודגש** בתוך שורה. */
function inline(text, o = {}) {
  return String(text)
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((p) => (p.startsWith("**") && p.endsWith("**") ? run(p.slice(2, -2), { ...o, bold: true }) : run(p, o)));
}

/** מרקדאון פשוט של העורך (כותרת, רשימה, מספור, ציטוט) לפסקאות Word. */
export function mdParagraphs(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trimEnd();
    if (!l.trim()) continue;
    let m;
    if ((m = l.match(/^#{1,3}\s+(.*)$/))) out.push(para(inline(m[1], { bold: true, size: 26, color: PURPLE }), { spacing: { before: 160, after: 80 }, keepNext: true }));
    else if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) out.push(para([run("•  "), ...inline(m[1])], { indent: { start: 360, hanging: 240 } }));
    else if ((m = l.match(/^\s*(\d+)[.)]\s+(.*)$/))) out.push(para([run(`${m[1]}.  `), ...inline(m[2])], { indent: { start: 360, hanging: 300 } }));
    else if ((m = l.match(/^>\s?(.*)$/))) out.push(para(inline(m[1], { italics: true, color: "5a4a8a" }), { indent: { start: 360 }, border: { right: { style: BorderStyle.SINGLE, size: 12, color: PURPLE, space: 6 } } }));
    else if (/^\|.*\|$/.test(l.trim())) {
      if (/^[\s|:-]+$/.test(l)) continue;
      out.push(para(inline(l.trim().slice(1, -1).split("|").map((c) => c.trim()).join("   |   "))));
    } else out.push(para(inline(l)));
  }
  return out;
}

export async function buildWriteDocx(doc, { logo, tribe = "שבט מעוז" } = {}) {
  const meta = metaDefaults(doc.meta ?? {});
  const total = doc.blocks.reduce((s, b) => s + (b.minutes || 0), 0);
  const children = [];
  if (logo) {
    const { w, h } = imageSize(logo);
    const H = 90;
    children.push(para([new ImageRun({ type: logo.type, data: logo.buf, transformation: { width: Math.round((H * w) / h) || H, height: H }, altText: { title: "לוגו", description: "לוגו השבט", name: "logo" } })], { alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
  }
  children.push(para([run(doc.title || "פעולה ללא שם", { bold: true, size: 40, color: DARK })], { alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
  const facts = [];
  if (meta.leader) facts.push(["מדריך/ה", meta.leader]);
  facts.push(["תאריך", meta.date || new Date().toLocaleDateString("he-IL")]);
  if (meta.ageGroup) facts.push(["שכבת גיל", meta.ageGroup]);
  if (meta.groupSize) facts.push(["גודל קבוצה", String(meta.groupSize)]);
  facts.push(["משך", `${meta.minutes ?? (total || "-")} דקות`]);
  if (meta.value) facts.push(["ערך", meta.value]);
  if (meta.equipment.length) facts.push(["ציוד", meta.equipment.join(", ")]);
  for (const [k, v] of facts) children.push(para([run(`${k}: `, { bold: true, color: PURPLE }), run(v)], { spacing: { after: 40 } }));
  for (const b of doc.blocks) {
    const head = `${b.title || KIND_LABEL[b.kind]}${b.minutes ? ` (${b.minutes} דקות)` : ""}`;
    children.push(para([run(head, { bold: true, size: 28, color: PURPLE })], { spacing: { before: 280, after: 100 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: PURPLE, space: 2 } } }));
    const body = mdParagraphs(b.text);
    children.push(...(body.length ? body : [para([run("(השלב ריק)", { color: "999999" })])]));
    if (doc.withNotes && b.note.trim()) children.push(para([run("הערה לעצמי: ", { bold: true, color: "7A6AA8" }), run(b.note, { color: "7A6AA8" })], { shading: { fill: "F1EBFB" } }));
  }
  const file = new Document({
    creator: "מחולל פעולות - שבט מעוז",
    title: doc.title || "פעולה",
    styles: { default: { document: { run: { font: FONT, size: 22, rightToLeft: true } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, bottom: 1000, left: 1000, right: 1000 } } },
        headers: { default: new Header({ children: [para([...watermarkRuns(), run(tribe, { color: "7A6AA8", size: 20 })], { alignment: AlignmentType.CENTER })] }) },
        footers: { default: new Footer({ children: [para([new TextRun({ children: ["עמוד ", PageNumber.CURRENT, " מתוך ", PageNumber.TOTAL_PAGES], rightToLeft: true, font: FONT, size: 20, color: "7A6AA8" })], { alignment: AlignmentType.CENTER })] }) },
        children,
      },
    ],
  });
  return fadeWatermark(await Packer.toBuffer(file));
}

/** טקסט נקי להעתקה, או בפורמט וואטסאפ (כוכביות להדגשה). */
export function toPlain(doc, { whatsapp = false } = {}) {
  const meta = metaDefaults(doc.meta ?? {});
  const B = (s) => (whatsapp ? `*${s}*` : s);
  const strip = (s) => (whatsapp ? s.replace(/\*\*([^*]+)\*\*/g, "*$1*") : s.replace(/\*\*([^*]+)\*\*/g, "$1")).replace(/^#{1,3}\s+/gm, "").replace(/^>\s?/gm, "");
  const out = [B(doc.title || "פעולה")];
  const bits = [meta.ageGroup, meta.minutes ? `${meta.minutes} דקות` : "", meta.groupSize ? `${meta.groupSize} חניכים` : "", meta.value ? `ערך: ${meta.value}` : ""].filter(Boolean);
  if (bits.length) out.push(bits.join(" | "));
  for (const b of doc.blocks) out.push("", B(`${b.title || KIND_LABEL[b.kind]}${b.minutes ? ` (${b.minutes} דק')` : ""}`), strip(b.text).trim());
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const KIND_WORDS = [
  ["open", /^(פתיחה|פתיח|חימום|כניסה)/],
  ["close", /^(סיכום|סגירה|סיום|סיכומון)/],
  ["peak", /^(שיא|רגע השיא|שיא הפעולה)/],
];
const kindOfTitle = (t) => KIND_WORDS.find(([, re]) => re.test(t.trim()))?.[0] || "body";
const bid = (i) => `s${Date.now().toString(36).slice(-4)}${i}`;

/** מפרק טקסט חופשי שהודבק לשלבים: לפי כותרות ("פתיחה:", "שלב 2", "1.") או לפי שורות ריקות. */
export function splitText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const headRe = /^\s*(?:#{1,3}\s*)?(?:שלב\s*\d+\s*[:.\-–]?\s*)?((?:פתיחה|פתיח|חימום|גוף(?: הפעולה)?|שיא|רגע השיא|סיכום|סגירה|סיום|דיון|משחק|סיפור|יצירה|חלק\s*\d+)[^:\n(]{0,40})\s*(?:\((\d{1,3})\s*דק(?:ות|')?\))?\s*:?\s*$/;
  const numRe = /^\s*(\d{1,2})[.)]\s+([^\n]{2,60}?)\s*:\s*$/;
  const blocks = [];
  let cur = null;
  const push = () => {
    if (cur && (cur.text.trim() || cur.title)) blocks.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };
  for (const raw of lines) {
    const inl = raw.match(/^\s*(פתיחה|שיא|סיכום)\s*:\s*(\S.*)$/);
    if (inl) {
      push();
      cur = { title: inl[1], kind: kindOfTitle(inl[1]), minutes: null, text: inl[2] + "\n", note: "" };
      continue;
    }
    const m = raw.match(headRe) || (raw.match(numRe) ? [raw, raw.match(numRe)[2], null] : null);
    if (m && raw.trim().length <= 70 && (/[:：]\s*$/.test(raw) || /^\s*(#|שלב)/.test(raw) || /^\s*(פתיחה|שיא|סיכום)\s*$/.test(raw))) {
      push();
      const title = m[1].trim();
      cur = { title, kind: kindOfTitle(title), minutes: m[2] ? Number(m[2]) : null, text: "", note: "" };
    } else {
      if (!cur) cur = { title: "", kind: "free", minutes: null, text: "", note: "" };
      cur.text += raw + "\n";
    }
  }
  push();
  let result = blocks;
  if (result.length <= 1 && lines.join("\n").includes("\n\n")) {
    const parts = String(text).replace(/\r/g, "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
    if (parts.length > 1) result = parts.map((p, i) => ({ title: "", kind: i === 0 ? "open" : i === parts.length - 1 ? "close" : "body", minutes: null, text: p, note: "" }));
  }
  return result.slice(0, 30).map((b, i) => ({ id: bid(i), hint: undefined, ...b, title: b.title.slice(0, 120), text: b.text.slice(0, 20000) }));
}

export function registerWriteExportRoutes(app, { limiter, fail, requireUser, getLogo }) {
  const lim = limiter(60_000, 40);
  const norm = (d) => ({ title: d.title, meta: metaDefaults(d.meta ?? {}), blocks: d.blocks, withNotes: d.withNotes });

  app.post("/api/write/export/docx", requireUser(), lim, async (req, res) => {
    const doc = norm(docZ.parse(req.body ?? {}));
    const buf = await buildWriteDocx(doc, { logo: findLogo(getLogo) });
    const name = encodeURIComponent(`${(doc.title || "פעולה").replace(/[\\/:*?"<>|]/g, " ").slice(0, 60)}.docx`);
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${name}`, "X-Content-Type-Options": "nosniff" }).send(buf);
  });

  app.post("/api/write/export/text", requireUser(), lim, (req, res) => {
    const v = docZ.extend({ whatsapp: z.boolean().default(false) }).parse(req.body ?? {});
    res.json({ text: toPlain(norm(v), { whatsapp: v.whatsapp }) });
  });

  app.post("/api/write/split", requireUser(), lim, (req, res) => {
    const v = z.object({ text: z.string().trim().min(1, "הדביקו טקסט").max(60000) }).parse(req.body ?? {});
    const blocks = splitText(v.text);
    if (!blocks.length) return res.status(400).json(fail("NOTHING", "לא הצלחתי לפרק את הטקסט"));
    res.json({ blocks });
  });

  app.post("/api/write/prep", requireUser(), lim, (req, res) => res.json(prepOf(norm(docZ.parse(req.body ?? {})))));
}

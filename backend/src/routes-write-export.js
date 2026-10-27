// ייצוא וכלים נלווים לעורך הכתיבה (רעיונות 130–138): Word עם לוגו, טקסט להעתקה,
// פירוק טקסט חופשי לשלבים, ודף הכנה.
import { KIND_STYLE, bar, designFooter, designHeader, designPage } from "./design.js";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { fadeWatermark } from "./watermark.js";
import { AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
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
const docZ = z.object({
  title: z.string().max(120).default(""),
  meta: z.any().default({}),
  blocks: z.array(blockZ).max(60),
  withNotes: z.boolean().default(false),
  theme: z.enum(["classic", "purple", "blue"]).default("classic"),
  eco: z.boolean().default(false),
  large: z.boolean().default(false),
  qr: z.boolean().default(false),
  docId: z.number().int().positive().optional(),
});

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

const optsOf = (o = {}) => ({ theme: o.theme, eco: !!o.eco, large: !!o.large, qr: o.qr || "", wm: o.wm });

async function qrPng(url) {
  try {
    const QR = (await import("qrcode")).default;
    return await QR.toBuffer(url, { margin: 1, width: 240 });
  } catch {
    return null;
  }
}

const stageLine = (t) => String(t || "").replace(/[*#>|]/g, "").replace(/\s+/g, " ").trim();

export async function buildWriteDocx(doc, { logo, tribe = "שבט מעוז", opts: o0 } = {}) {
  const o = optsOf(o0);
  const meta = metaDefaults(doc.meta ?? {});
  const total = doc.blocks.reduce((s, b) => s + (b.minutes || 0), 0);
  const children = [];
  children.push(bar(doc.title || "פעולה ללא שם", { size: 32, before: 0, o }));
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
    const ks = KIND_STYLE[b.kind] || KIND_STYLE.body;
    const head = `${ks.mark} ${b.title || KIND_LABEL[b.kind]}${b.minutes ? `   ⏱ ${b.minutes} דקות` : ""}`;
    children.push(bar(head, { o, color: o.eco ? undefined : ks.color }));
    const body = mdParagraphs(b.text);
    children.push(...(body.length ? body : [para([run("(השלב ריק)", { color: "999999" })])]));
    if (doc.withNotes && b.note.trim()) children.push(para([run("הערה לעצמי: ", { bold: true, color: "7A6AA8" }), run(b.note, { color: "7A6AA8" })], { shading: { fill: "F1EBFB" } }));
  }
  if (o.qr) {
    const png = await qrPng(o.qr);
    if (png) {
      children.push(para([new ImageRun({ type: "png", data: png, transformation: { width: 90, height: 90 }, altText: { title: "QR", description: "סריקה לפתיחה באתר", name: "qr" } }), run("   סרקו לפתיחת הפעולה באתר", { color: "7A6AA8", size: 20 })], { spacing: { before: 300 }, keepLines: true }));
    }
  }
  return pack(doc, children, { logo, tribe, o });
}

async function pack(doc, children, { logo, tribe, o }) {
  const file = new Document({
    creator: "מחולל פעולות - שבט מעוז",
    title: doc.title || "פעולה",
    styles: { default: { document: { run: { font: FONT, size: o.large ? 32 : 22, rightToLeft: true } } } },
    sections: [{ properties: { page: designPage(o) }, headers: designHeader(logo, o), footers: designFooter(tribe, o), children }],
  });
  return fadeWatermark(await Packer.toBuffer(file));
}

/** דף מדריך בעמוד אחד: שלבים, זמנים וציוד בלבד, להדפסה ולקיחה לשטח. */
export async function buildSheetDocx(doc, { logo, tribe = "שבט מעוז", opts: o0 } = {}) {
  const o = optsOf({ ...o0, large: false, wm: 0.15 });
  const meta = metaDefaults(doc.meta ?? {});
  const total = doc.blocks.reduce((s, b) => s + (b.minutes || 0), 0);
  const line = { style: BorderStyle.SINGLE, size: 4, color: "B8B0DC" };
  const borders = { top: line, bottom: line, left: line, right: line };
  const W = [2300, 1100, 5400];
  const cell = (kids, w, fill) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders, margins: { top: 60, bottom: 60, left: 100, right: 100 }, shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined, children: kids });
  const rows = [
    new TableRow({ tableHeader: true, children: ["שלב", "דקות", "עיקר"].map((t, i) => cell([para([run(t, { bold: true, color: "FFFFFF" })], { spacing: { after: 0 } })], W[i], "4A3FC9")) }),
    ...doc.blocks.map((b) => {
      const ks = KIND_STYLE[b.kind] || KIND_STYLE.body;
      const t = stageLine(b.text);
      return new TableRow({ cantSplit: true, children: [cell([para([run(`${ks.mark} ${b.title || KIND_LABEL[b.kind]}`, { bold: true })], { spacing: { after: 0 } })], W[0]), cell([para(b.minutes ? String(b.minutes) : "-", { spacing: { after: 0 } })], W[1]), cell([para(t.length > 170 ? t.slice(0, 167) + "…" : t || "-", { spacing: { after: 0 } })], W[2])] });
    }),
  ];
  const children = [bar(`דף מדריך: ${doc.title || "פעולה"}`, { size: 30, before: 0, o })];
  const facts = [meta.ageGroup, meta.groupSize ? `${meta.groupSize} חניכים` : "", `${meta.minutes ?? (total || "-")} דקות`, meta.value ? `ערך: ${meta.value}` : ""].filter(Boolean);
  children.push(para([run(facts.join("  |  "), { bold: true, color: PURPLE })]));
  children.push(new Table({ visuallyRightToLeft: true, width: { size: W.reduce((x, y) => x + y, 0), type: WidthType.DXA }, columnWidths: W, rows }));
  children.push(bar("ציוד להכין", { o, size: 24 }));
  children.push(para(meta.equipment.length ? meta.equipment.map((e) => `☐ ${e}`).join("    ") : "לא הוגדר ציוד"));
  return pack(doc, children, { logo, tribe, o });
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

export function registerWriteExportRoutes(app, { limiter, fail, requireUser, getLogo, db, publicUrl = "" }) {
  const lim = limiter(60_000, 40);
  const norm = (d) => ({ title: d.title, meta: metaDefaults(d.meta ?? {}), blocks: d.blocks, withNotes: d.withNotes });

  const fileName = (doc, ext) => encodeURIComponent(`${(doc.title || "פעולה").replace(/[\\/:*?"<>|]/g, " ").slice(0, 60)}.${ext}`);
  const send = (res, buf, name, type) => res.set({ "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${name}`, "X-Content-Type-Options": "nosniff" }).send(buf);
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  /** בכל ייצוא נשמרת גרסה, כדי שתמיד אפשר לחזור למה שיצא. */
  const keepVersion = (req, v) => {
    if (!db || !v.docId) return;
    try {
      const d = db.prepare("SELECT * FROM write_docs WHERE id = ? AND owner_id = ?").get(v.docId, req.user.id);
      if (!d) return;
      const last = db.prepare("SELECT blocks_json, title FROM write_versions WHERE doc_id = ? ORDER BY id DESC LIMIT 1").get(d.id);
      if (last && last.blocks_json === d.blocks_json && last.title === d.title) return;
      db.prepare("INSERT INTO write_versions (doc_id, title, meta_json, blocks_json, words, note, saved_at) VALUES (?,?,?,?,?,?,?)").run(d.id, d.title, d.meta_json, d.blocks_json, d.words, "ייצוא קובץ", new Date().toISOString());
      db.prepare("DELETE FROM write_versions WHERE doc_id = ? AND id NOT IN (SELECT id FROM write_versions WHERE doc_id = ? ORDER BY id DESC LIMIT 100)").run(d.id, d.id);
    } catch {
      /* ignore */
    }
  };
  const optsFor = (req, v) => {
    const base = publicUrl || `${req.protocol}://${req.get("host")}`;
    return { theme: v.theme, eco: v.eco, large: v.large, qr: v.qr ? (v.docId ? `${base}/write/${v.docId}` : base) : "" };
  };

  app.post("/api/write/export/docx", requireUser(), lim, async (req, res) => {
    const v = docZ.parse(req.body ?? {});
    const doc = norm(v);
    const buf = await buildWriteDocx(doc, { logo: findLogo(getLogo), opts: optsFor(req, v) });
    keepVersion(req, v);
    send(res, buf, fileName(doc, "docx"), DOCX);
  });

  app.post("/api/write/export/sheet", requireUser(), lim, async (req, res) => {
    const v = docZ.parse(req.body ?? {});
    const doc = norm(v);
    const buf = await buildSheetDocx(doc, { logo: findLogo(getLogo), opts: optsFor(req, v) });
    send(res, buf, fileName({ title: `דף מדריך ${doc.title}` }, "docx"), DOCX);
  });

  // PDF אמיתי באותו עיצוב. דורש LibreOffice בשרת (יש בהרצה מקומית וב-Docker, אין ב-Render החינמי).
  app.post("/api/write/export/pdf", requireUser(), limiter(60_000, 10), async (req, res) => {
    const v = docZ.parse(req.body ?? {});
    const doc = norm(v);
    const buf = await buildWriteDocx(doc, { logo: findLogo(getLogo), opts: optsFor(req, v) });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scout-pdf-"));
    try {
      fs.writeFileSync(path.join(dir, "d.docx"), buf);
      await new Promise((ok, no) => execFile("soffice", ["--headless", "--convert-to", "pdf", "--outdir", dir, path.join(dir, "d.docx")], { timeout: 60_000, env: { ...process.env, HOME: dir } }, (e) => (e ? no(e) : ok())));
      const pdf = fs.readFileSync(path.join(dir, "d.pdf"));
      keepVersion(req, v);
      send(res, pdf, fileName(doc, "pdf"), "application/pdf");
    } catch {
      res.status(501).json(fail("NO_PDF", "יצירת PDF אינה זמינה בשרת הזה. אפשר להשתמש בהדפסה ושמירה כ-PDF."));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

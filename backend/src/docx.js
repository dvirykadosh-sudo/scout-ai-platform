import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { MIDOT } from "./shared/constants.js";

const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };
const PURPLE = "5D2FA3";
const DARK = "1E1245";

const run = (text, o = {}) => new TextRun({ text: String(text ?? ""), rightToLeft: true, font: FONT, ...o });

// Every paragraph is bidirectional; START = right edge in an RTL paragraph.
const para = (children, o = {}) =>
  new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { after: 120, line: 300 },
    ...o,
    children: Array.isArray(children) ? children : [run(children)],
  });

/** Multi-line text (lines separated by \n) as separate RTL paragraphs inside a cell. */
const lines = (text, o = {}) =>
  String(text ?? "")
    .split("\n")
    .map((l) => para(l, { spacing: { after: 80, line: 276 }, ...o }));

const line = { style: BorderStyle.SINGLE, size: 4, color: "8E6BD1" };
const borders = { top: line, bottom: line, left: line, right: line };

function cell(children, width, { head = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    verticalAlign: head ? VerticalAlign.CENTER : VerticalAlign.TOP,
    shading: head ? { type: ShadingType.CLEAR, fill: PURPLE, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children,
  });
}

const meta = (k, v) => para([run(`${k}: `, { bold: true, color: PURPLE }), run(v)], { spacing: { after: 60 } });

const heading = (text) =>
  para([run(text, { bold: true, size: 28, color: PURPLE })], {
    spacing: { before: 280, after: 120 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: PURPLE, space: 2 } },
  });

/** Exact header format required: [מדריך] . [פעולה] + [שבט] ו-[גדוד] */
export function docTitle(a) {
  const instructor = a.instructor || a.author || "";
  const tail = a.battalion ? `${a.tribe} ו-${a.battalion}` : a.tribe;
  return `${instructor} . ${a.title} + ${tail}`;
}

export async function buildDocx(a) {
  const W = [1900, 2000, 6006]; // sum = A4 width (11906) - 2 x 1000 margin
  const head = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: ["זמן / שלב", "שכבה חינוכית", "תוכן"].map((t, i) =>
      cell([para([run(t, { bold: true, color: "FFFFFF" })], { spacing: { after: 0 } })], W[i], { head: true }),
    ),
  });
  const body = a.stages.map(
    (s) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell([para([run(s.name, { bold: true })], { spacing: { after: 40 } }), para(`${s.minutes} דקות`)], W[0]),
          cell([para(s.layer)], W[1]),
          cell(lines(s.content), W[2]),
        ],
      }),
  );

  const doc = new Document({
    creator: "מחולל פעולות - שבט מעוז",
    title: a.title,
    styles: { default: { document: { run: { font: FONT, size: 22, rightToLeft: true } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, bottom: 1000, left: 1000, right: 1000 } } },
        headers: { default: new Header({ children: [para([run(a.tribe, { color: "7A6AA8", size: 20 })], { alignment: AlignmentType.CENTER })] }) },
        footers: {
          default: new Footer({
            children: [
              para(
                [new TextRun({ children: ["עמוד ", PageNumber.CURRENT, " מתוך ", PageNumber.TOTAL_PAGES], rightToLeft: true, font: FONT, size: 20, color: "7A6AA8" })],
                { alignment: AlignmentType.CENTER },
              ),
            ],
          }),
        },
        children: [
          para([run(docTitle(a), { bold: true, size: 34, color: DARK })], { alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
          meta("תאריך", new Date().toLocaleDateString("he-IL")),
          meta("שכבת גיל", a.ageGroup),
          meta("גודל קבוצה", String(a.groupSize)),
          meta("משך הפעולה", `${a.durationMin} דקות`),
          meta("ערך מוביל", a.leadingValue),
          meta("ציוד", a.equipment),
          meta("בטיחות ורגישות", a.safetyNotes),
          heading("מבנה הפעולה"),
          new Table({
            visuallyRightToLeft: true,
            width: { size: W.reduce((x, y) => x + y, 0), type: WidthType.DXA },
            columnWidths: W,
            rows: [head, ...body],
          }),
          heading("סיכום וקישור למידות הצופה"),
          para(a.conclusionNote || ""),
          para([run(`${MIDOT.d.label}: `, { bold: true, color: PURPLE }), run(MIDOT.d.text)]),
          para([run(`${MIDOT.h.label}: `, { bold: true, color: PURPLE }), run(MIDOT.h.text)]),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// עיצוב מסמכי Word בסגנון הצופים: גל בראש העמוד, לוגו במרכז, סימן מים גדול, פסים צבעוניים לכותרות וגל תחתון.
// אפשרויות: theme (classic/purple/blue), eco (בלי גלים וסימן מים, לחיסכון בדיו).
import fs from "node:fs";
import {
  AlignmentType, Footer, Header, HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, PageNumber, Paragraph, ShadingType, TextRun,
  VerticalPositionAlign, VerticalPositionRelativeFrom, BorderStyle,
} from "docx";
import { fadePng, getWatermarkLogo, size } from "./watermark.js";

const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };
export const THEMES = {
  classic: { label: "ירוק וסגול", bar: "4A3FC9" },
  purple: { label: "סגול", bar: "5B2FA3" },
  blue: { label: "כחול", bar: "1E5FA8" },
};
export const themeOf = (o) => THEMES[o?.theme] ? o.theme : "classic";
// צבע לפי סוג שלב: שיא כתום, סיכום ירוק, השאר בצבע הערכה
export const KIND_STYLE = { open: { mark: "▶" }, body: { mark: "●" }, peak: { mark: "★", color: "B45309" }, close: { mark: "✔", color: "0F766E" }, free: { mark: "●" } };

const imgs = {};
const read = (n) => {
  if (n in imgs) return imgs[n];
  try {
    imgs[n] = fs.readFileSync(new URL(`./assets/${n}`, import.meta.url));
  } catch {
    imgs[n] = null;
  }
  return imgs[n];
};
const EMU = 360000;
const cm = (x) => Math.round(x * 37.8);

export const designPage = (o = {}) => ({
  size: { width: 11906, height: 16838 },
  margin: o.eco ? { top: 1500, bottom: 1200, left: 1100, right: 1100, header: 300, footer: 300 } : { top: 2500, bottom: 1700, left: 1100, right: 1100, header: 0, footer: 0 },
});

const floatImg = (data, wCm, hCm, name, v) =>
  new ImageRun({
    type: "png",
    data,
    transformation: { width: cm(wCm), height: cm(hCm) },
    altText: { title: name, description: "קישוט עיצוב", name: "doc-design " + name },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: v },
      behindDocument: true,
      allowOverlap: true,
      lockAnchor: true,
    },
  });

export function designHeader(fallbackLogo, o = {}) {
  const kids = [];
  const eco = !!o.eco;
  const head = !eco && read(`doc-header-${themeOf(o)}.png`);
  if (head) kids.push(floatImg(head, 21, 4.2, "גל עליון", VerticalPositionAlign.TOP));
  const logo = getWatermarkLogo() || fallbackLogo;
  if (logo?.buf) {
    const { w, h } = size(logo);
    const H = eco ? 1.6 : 2.9;
    kids.push(new ImageRun({ type: logo.type, data: logo.buf, transformation: { width: Math.round(cm(H * (w / h || 1))), height: cm(H) }, altText: { title: "לוגו", description: "לוגו השבט", name: "logo" } }));
    const pre = !eco && logo.type === "png" ? fadePng(logo.buf, o.wm ?? 0.5) : null;
    if (pre) {
      const W = 14;
      kids.push(
        new ImageRun({
          type: "png",
          data: pre,
          transformation: { width: cm(W), height: cm((W * h) / w) },
          altText: { title: "סימן מים", description: "לוגו השבט ברקע", name: "watermark-pre" },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
            behindDocument: true,
            allowOverlap: true,
            lockAnchor: true,
          },
        }),
      );
    }
  }
  return { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: eco ? 0 : 380, after: 0 }, children: kids })] }) };
}

export function designFooter(tribe = "שבט מעוז", o = {}) {
  const eco = !!o.eco;
  const color = eco ? "6B5FA8" : "FFFFFF";
  const t = (text, x = {}) => new TextRun({ text, rightToLeft: true, font: FONT, size: 19, color, bold: !eco, ...x });
  const foot = !eco && read(`doc-footer-${themeOf(o)}.png`);
  const kids = [];
  if (foot) kids.push(floatImg(foot, 21, 5.08, "גל תחתון", VerticalPositionAlign.BOTTOM));
  kids.push(t(`${tribe} | הצופים העבריים בישראל | ראשון לציון`));
  return {
    default: new Footer({
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: eco ? 0 : 420, after: 0 }, bidirectional: true, children: kids }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ children: ["עמוד ", PageNumber.CURRENT, " מתוך ", PageNumber.TOTAL_PAGES], rightToLeft: true, font: FONT, size: 18, color })],
        }),
      ],
    }),
  };
}

/** פס צבעוני ברוחב מלא עם טקסט לבן. במצב חסכוני: קו תחתון בלבד. */
export const bar = (text, { size: sz = 26, before = 240, o = {}, color } = {}) => {
  const fill = color || THEMES[themeOf(o)].bar;
  if (o.eco)
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      keepNext: true,
      spacing: { before, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: fill, space: 2 } },
      children: [new TextRun({ text, rightToLeft: true, font: FONT, bold: true, size: sz, color: fill })],
    });
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    keepNext: true,
    spacing: { before, after: 100 },
    shading: { type: ShadingType.CLEAR, fill, color: "auto" },
    indent: { left: 60, right: 60 },
    children: [new TextRun({ text: ` ${text} `, rightToLeft: true, font: FONT, bold: true, size: sz, color: "FFFFFF" })],
  });
};

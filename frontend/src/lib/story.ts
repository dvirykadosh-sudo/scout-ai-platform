// שלב 71: ציור כרטיס ההזמנה (סטורי 9:16, 1080×1920) על canvas. רץ בדפדפן בלבד, בלי ספריות ציור ובלי שליחה לשרת.
// אזורי הבטיחות: וואטסאפ מכסה בערך 250 פיקסלים למעלה ולמטה, ולכן התוכן החשוב נשאר בין 230 ל-1690.
import { backdrop, whenText, wrapLines, type InviteFields } from "./invite";

export const STORY_W = 1080;
export const STORY_H = 1920;

export interface StoryOptions {
  fields: InviteFields;
  color: string;
  tribe: string;
  logo: HTMLImageElement | null;
  /** קוד QR (תמונה) לאישור הגעה או לעמוד הפעולה. null = בלי */
  qr: HTMLImageElement | null;
  qrCaption: string;
  fontFamily: string;
}

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

/** גבול תחתון לתוכן החשוב: וואטסאפ מכסה את התחתית בכפתורי תגובה */
export const SAFE_BOTTOM = 1690;

/** מצייר את הכרטיס בקנה מידה k ומחזיר את הקצה התחתון של התוכן. drawStory מנסה קנה מידה קטן יותר עד שהכול נכנס באזור הבטיחות. */
function paint(c: CanvasRenderingContext2D, o: StoryOptions, k: number): number {
  const dark = backdrop(o.color, 0.4);
  const mid = backdrop(o.color, 0.2);
  const font = (w: number, size: number) => `${w} ${Math.round(size * k)}px ${o.fontFamily}`;
  const cx = STORY_W / 2;
  const maxW = STORY_W - 200;

  // רקע: מעבר צבע אנכי ושני עיגולים רכים
  const g = c.createLinearGradient(0, 0, 0, STORY_H);
  g.addColorStop(0, dark);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, backdrop(o.color, 0.5));
  c.fillStyle = g;
  c.fillRect(0, 0, STORY_W, STORY_H);
  c.fillStyle = "rgba(255,255,255,0.07)";
  c.beginPath();
  c.arc(STORY_W * 0.95, 340, 330, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(STORY_W * 0.05, 1500, 420, 0, Math.PI * 2);
  c.fill();

  c.direction = "rtl";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#fff";
  let y = 215;

  // לוגו ושם השבט
  if (o.logo) {
    const s = 120 * k;
    c.save();
    rr(c, cx - s / 2, y, s, s, 26 * k);
    c.clip();
    c.fillStyle = "rgba(255,255,255,0.95)";
    c.fillRect(cx - s / 2, y, s, s);
    const f = Math.min(s / o.logo.naturalWidth, s / o.logo.naturalHeight) * 0.86;
    const w = o.logo.naturalWidth * f;
    const h = o.logo.naturalHeight * f;
    c.drawImage(o.logo, cx - w / 2, y + (s - h) / 2, w, h);
    c.restore();
    y += s + 28 * k;
  }
  c.fillStyle = "#fff";
  c.font = font(800, 44);
  c.fillText(o.tribe || "שבט מעוז", cx, y + 36 * k);
  y += 78 * k;

  // תגית "הזמנה"
  c.font = font(800, 36);
  const tag = "הזמנה לפעולה";
  const tw = c.measureText(tag).width + 80 * k;
  rr(c, cx - tw / 2, y, tw, 68 * k, 34 * k);
  c.fillStyle = "rgba(255,255,255,0.18)";
  c.fill();
  c.fillStyle = "#fff";
  c.fillText(tag, cx, y + 46 * k);
  y += 68 * k + 40 * k;

  // שם הפעולה: גודל גופן יורד עד שנכנס בשלוש שורות
  let size = 104;
  let lines: string[] = [];
  for (; size >= 56; size -= 4) {
    c.font = font(800, size);
    const r = wrapLines((t) => c.measureText(t).width, o.fields.title, maxW, 3);
    lines = r.lines;
    if (!r.cut) break;
  }
  c.font = font(800, size);
  c.fillStyle = "#fff";
  lines.forEach((l, i) => c.fillText(l, cx, y + size * k * 0.9 + i * size * k * 1.15));
  y += lines.length * size * k * 1.15 + 18 * k;

  // משפט הזמנה
  if (o.fields.line.trim()) {
    c.font = font(500, 42);
    c.fillStyle = "rgba(255,255,255,0.92)";
    const r = wrapLines((t) => c.measureText(t).width, o.fields.line, maxW, 2);
    r.lines.forEach((l, i) => c.fillText(l, cx, y + 40 * k + i * 54 * k));
    y += r.lines.length * 54 * k + 22 * k;
  }

  // כרטיס הפרטים
  const rows: [string, string][] = [
    ["מתי", whenText(o.fields)],
    ["איפה", o.fields.place.trim()],
    ["מה להביא", o.fields.bring.trim()],
  ].filter((r): r is [string, string] => !!r[1]);
  if (rows.length) {
    const cardW = STORY_W - 160;
    c.font = font(700, 42);
    const wrapped = rows.map(([label, v]) => ({ label, lines: wrapLines((t) => c.measureText(t).width, v, cardW - 120, 2).lines }));
    const cardH = 72 * k + wrapped.reduce((a, r) => a + 34 * k + r.lines.length * 54 * k + 22 * k, 0) - 22 * k;
    rr(c, 80, y, cardW, cardH, 40 * k);
    c.fillStyle = "rgba(255,255,255,0.15)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 3;
    c.stroke();
    let ry = y + 36 * k;
    for (const r of wrapped) {
      c.fillStyle = "rgba(255,255,255,0.78)";
      c.font = font(800, 32);
      c.fillText(r.label, cx, ry + 28 * k);
      ry += 34 * k;
      c.fillStyle = "#fff";
      c.font = font(700, 42);
      r.lines.forEach((l, i) => c.fillText(l, cx, ry + 40 * k + i * 54 * k));
      ry += r.lines.length * 54 * k + 22 * k;
    }
    y += cardH + 36 * k;
  }

  // QR לאישור הגעה, מיד אחרי הכרטיס (בלי לדרוס אותו)
  if (o.qr) {
    const box = 290 * k;
    const pad = 18 * k;
    rr(c, cx - box / 2 - pad, y, box + pad * 2, box + pad * 2, 32 * k);
    c.fillStyle = "#fff";
    c.fill();
    c.drawImage(o.qr, cx - box / 2, y + pad, box, box);
    y += box + pad * 2;
    c.fillStyle = "#fff";
    c.font = font(700, 36);
    const cap = wrapLines((t) => c.measureText(t).width, o.qrCaption, STORY_W - 220, 2).lines;
    cap.forEach((l, i) => c.fillText(l, cx, y + 46 * k + i * 46 * k));
    y += 20 * k + cap.length * 46 * k;
  }
  return y;
}

export function drawStory(canvas: HTMLCanvasElement, o: StoryOptions): void {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const c = canvas.getContext("2d");
  if (!c) return;
  for (const k of [1, 0.92, 0.84, 0.76, 0.68]) {
    c.save();
    const bottom = paint(c, o, k);
    c.restore();
    if (bottom <= SAFE_BOTTOM) break;
  }
}

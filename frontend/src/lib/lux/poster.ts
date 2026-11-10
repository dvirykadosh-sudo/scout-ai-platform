// שלב 61 (רעיון 11): כרטיס/כרזה אוטומטי לכל פעולה. SVG שנוצר מהכותרת, הערך המוביל והגיל, בלי שרת ובלי תמונות.
// אותו מחולל משמש במאגר (תמונה ממוזערת), בעמוד הפעולה (הורדה ושיתוף), בכרטיסים להדפסה ובייצוא.
import { tribeOrDefault } from "./tribe";

export type PosterTheme = "tribe" | "dark" | "paper";
export type PosterFormat = "story" | "og" | "card";
export const POSTER_SIZE: Record<PosterFormat, [number, number]> = { story: [1080, 1350], og: [1200, 630], card: [600, 800] };

export interface PosterInput {
  title: string;
  value?: string;
  age?: string;
  minutes?: number;
  stages?: number;
}

/* איורי קו בקופסה של 96×96 (אותו סגנון כמו סט האיורים באתר) */
export const GLYPHS: Record<string, string> = {
  campfire: '<path d="M48 14c6 10 16 16 16 30a16 16 0 01-32 0c0-8 4-12 8-18 2 6 5 8 8 10-1-8-2-14 0-22z" class="a"/><path d="M48 44c3 5 8 7 8 13a8 8 0 01-16 0c0-4 3-6 8-13z" class="f"/><path d="M20 84l56-14M76 84L20 70"/>',
  compass: '<circle cx="48" cy="48" r="32"/><circle cx="48" cy="48" r="26" class="t"/><path d="M48 20v6M48 70v6M20 48h6M70 48h6"/><path d="M60 36L53 53 36 60l7-17z" class="a"/>',
  knot: '<path d="M14 62c0-18 14-24 22-24 10 0 12 12 12 12s2 12 12 12c8 0 22-6 22-24" class="t"/><path d="M14 34c0 18 14 24 22 24 10 0 12-12 12-12s2-12 12-12c8 0 22 6 22 24" class="a"/>',
  tent: '<path d="M10 78L48 20l38 58z" class="a"/><path d="M48 20v58M48 78l-14 0 14-30 14 30"/><path d="M6 82h84" class="t"/>',
  flag: '<path d="M26 86V12"/><path d="M26 14c14-6 20 6 34 0v30c-14 6-20-6-34 0z" class="a"/><path d="M18 86h16" class="t"/>',
  backpack: '<path d="M30 34a18 18 0 0136 0v44a6 6 0 01-6 6H36a6 6 0 01-6-6z" class="a"/><path d="M38 20a10 10 0 0120 0M36 56h24v18H36zM44 56v-6h8v6"/>',
  trail: '<path d="M14 20l22 6 24-8 22 6v52l-22-6-24 8-22-6z" class="t"/><path d="M22 66c10-4 12-14 22-14s10 10 22 6" class="a"/><circle cx="66" cy="58" r="5" class="f"/>',
  star: '<path d="M48 12l10 22 24 3-18 16 5 24-21-12-21 12 5-24L14 37l24-3z" class="a"/>',
};
const GLYPH_NAMES = Object.keys(GLYPHS);

const KEYWORDS: [RegExp, string][] = [
  [/טבע|סביבה|שטח|טיול|הליכה/, "tent"],
  [/חבר|שותפ|צוות|קבוצ|אחוו|ערבות/, "knot"],
  [/אומץ|מנהיג|יוזמ|מנהיגות/, "flag"],
  [/אחריות|עצמא|הכנה|ציוד/, "backpack"],
  [/מסורת|טקס|מורשת|ציונ|זיכרון|שבת|חג/, "campfire"],
  [/דרך|ניווט|בחירה|ערכים|זהות/, "compass"],
  [/שביל|מסע|תכנון/, "trail"],
];
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const glyphFor = (p: PosterInput): string => {
  const hay = `${p.value ?? ""} ${p.title}`;
  for (const [re, g] of KEYWORDS) if (re.test(hay)) return g;
  return GLYPH_NAMES[hash(p.value || p.title) % GLYPH_NAMES.length];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** שבירת שורות עיוורת-לשפה לפי רוחב מוערך (תו עברי בולט ≈ 0.5 מגודל הגופן) */
export function wrap(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface Colors {
  bg1: string;
  bg2: string;
  glow: string;
  accent: string;
  accent2: string;
  ink: string;
  muted: string;
  chipBg: string;
}
function colorsFor(theme: PosterTheme, seed: number): Colors {
  const t = tribeOrDefault();
  if (theme === "paper") return { bg1: "#ffffff", bg2: "#f5f1ff", glow: t.wc, accent: t.wb, accent2: t.wc, ink: "#14102a", muted: "#4b4566", chipBg: "rgba(20,16,42,.07)" };
  if (theme === "tribe") return { bg1: "#0d0820", bg2: "#1b1140", glow: t.a, accent: t.a, accent2: t.b, ink: "#ffffff", muted: "#d9d0f5", chipBg: "rgba(255,255,255,.12)" };
  // dark: גוון עדין שמשתנה מפעולה לפעולה, בסגנון הכהה של האתר
  const hue = [262, 24, 330, 200, 150][seed % 5];
  return { bg1: "#0b0716", bg2: `hsl(${hue} 55% 16%)`, glow: `hsl(${hue} 90% 60%)`, accent: `hsl(${hue} 95% 72%)`, accent2: "#fb923c", ink: "#ffffff", muted: "#e0d8f7", chipBg: "rgba(255,255,255,.12)" };
}

const FONT = "Heebo, 'Segoe UI', 'Noto Sans Hebrew', Arial, sans-serif";

export function posterSvg(p: PosterInput, opts: { theme?: PosterTheme; format?: PosterFormat; logo?: string; textless?: boolean } = {}): string {
  const theme = opts.theme ?? "tribe";
  const format = opts.format ?? "story";
  const [W, H] = POSTER_SIZE[format];
  const wide = format === "og";
  const seed = hash(p.title);
  const c = colorsFor(theme, seed);
  const glyph = GLYPHS[glyphFor(p)];

  // כותרת: מקטינים עד שנכנסת בארבע שורות
  const maxW = (wide ? 0.58 : 0.84) * W;
  let fs = (wide ? 0.105 : 0.088) * W;
  let lines = wrap(p.title, Math.floor(maxW / (fs * 0.5)));
  while (lines.length > (wide ? 3 : 4) && fs > W * 0.045) {
    fs *= 0.92;
    lines = wrap(p.title, Math.floor(maxW / (fs * 0.5)));
  }
  const lh = fs * 1.2;

  const cx = wide ? W * 0.3 : W / 2; // ציר הטקסט
  const gSize = wide ? H * 0.5 : W * 0.3;
  const gx = wide ? W * 0.8 - gSize / 2 : W / 2 - gSize / 2;
  const gy = wide ? H / 2 - gSize / 2 : H * 0.12;
  const titleTop = wide ? H / 2 - ((lines.length - 1) * lh) / 2 : H * 0.12 + gSize + H * 0.09;

  const chips = [p.age, p.minutes ? `${p.minutes} דקות` : "", p.stages ? `${p.stages} שלבים` : ""].filter(Boolean) as string[];
  const chipFs = (wide ? 0.034 : 0.036) * W;
  let chipX = 0;
  const chipEls: string[] = [];
  const widths = chips.map((t) => t.length * chipFs * 0.55 + chipFs * 1.4);
  const total = widths.reduce((a, b) => a + b, 0) + (chips.length - 1) * chipFs * 0.5;
  chipX = cx + total / 2;
  const chipY = wide ? H * 0.82 : H * 0.8;
  chips.forEach((t, i) => {
    const w = widths[i];
    chipX -= w;
    chipEls.push(`<rect x="${chipX.toFixed(1)}" y="${(chipY - chipFs * 1.05).toFixed(1)}" width="${w.toFixed(1)}" height="${(chipFs * 1.7).toFixed(1)}" rx="${(chipFs * 0.85).toFixed(1)}" fill="${c.chipBg}"/><text x="${(chipX + w / 2).toFixed(1)}" y="${chipY.toFixed(1)}" font-size="${chipFs.toFixed(1)}" text-anchor="middle" fill="${c.ink}" font-weight="600">${esc(t)}</text>`);
    chipX -= chipFs * 0.5;
  });

  const rings = [0.35, 0.55, 0.78, 1.05]
    .map((r, i) => `<circle cx="${(wide ? W * 0.8 : W / 2).toFixed(0)}" cy="${(wide ? H / 2 : H * 0.27).toFixed(0)}" r="${(W * r * (wide ? 0.5 : 0.62)).toFixed(0)}" fill="none" stroke="${c.accent}" stroke-opacity="${(0.22 - i * 0.045).toFixed(3)}" stroke-width="${wide ? 2 : 3}"/>`)
    .join("");

  const tl = !!opts.textless; // לתמונות שיתוף: הטקסט מצויר בנפרד, כאן רק הרקע והאיור
  const valueLine = p.value && !tl
    ? `<text x="${cx.toFixed(1)}" y="${(titleTop - fs * 1.15).toFixed(1)}" font-size="${(fs * 0.4).toFixed(1)}" text-anchor="middle" fill="${c.accent}" font-weight="700" letter-spacing="1">${esc(p.value)}</text>`
    : "";
  const titleEls = tl ? "" : lines.map((l, i) => `<text x="${cx.toFixed(1)}" y="${(titleTop + i * lh + fs * 0.9).toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle" fill="${c.ink}" font-weight="800">${esc(l)}</text>`).join("");
  const logo = opts.logo ? `<image href="${opts.logo}" x="${(W * 0.045).toFixed(0)}" y="${(W * 0.045).toFixed(0)}" width="${(W * 0.11).toFixed(0)}" height="${(W * 0.11).toFixed(0)}"/>` : "";
  const brandY = H - W * 0.05;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" direction="rtl" font-family="${FONT}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient>
<radialGradient id="gl" cx="${wide ? 0.8 : 0.5}" cy="${wide ? 0.5 : 0.27}" r="0.6"><stop offset="0" stop-color="${c.glow}" stop-opacity="${theme === "paper" ? 0.16 : 0.5}"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="ln" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.accent}"/><stop offset="1" stop-color="${c.accent2}"/></linearGradient>
<style>.g{fill:none;stroke:${c.ink};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.g .a{fill:${c.accent};fill-opacity:.28;stroke:${c.accent}}.g .f{fill:${c.accent};stroke:none}.g .t{opacity:.45;stroke-width:2}</style>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#gl)"/>${rings}
<g class="g" transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)}) scale(${(gSize / 96).toFixed(3)})">${glyph}</g>
${valueLine}${titleEls}
${tl ? "" : `<rect x="${(cx - W * 0.07).toFixed(1)}" y="${(titleTop + lines.length * lh + fs * 0.35).toFixed(1)}" width="${(W * 0.14).toFixed(1)}" height="${Math.max(4, W * 0.006).toFixed(1)}" rx="3" fill="url(#ln)"/>`}
${tl ? "" : chipEls.join("")}${logo}
${tl ? "" : `<text x="${W / 2}" y="${brandY.toFixed(0)}" font-size="${(W * 0.03).toFixed(1)}" text-anchor="middle" fill="${c.muted}" font-weight="600">שבט מעוז · מחולל פעולות</text>`}
</svg>`;
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** כרזה כקובץ PNG (ברזולוציה המלאה של הפורמט). רץ בדפדפן בלבד. */
export async function posterPng(svg: string, format: PosterFormat): Promise<Blob> {
  const [W, H] = POSTER_SIZE[format];
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("poster"));
    i.src = svgDataUri(svg);
  });
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  g.drawImage(img, 0, 0, W, H);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
}

let logoCache: string | null = null;
/** הלוגו כ-data URI (כדי שייכנס לתוך ה-SVG וה-PNG). מחזיר "" אם אין. */
export async function logoDataUri(): Promise<string> {
  if (logoCache !== null) return logoCache;
  for (const u of ["/api/logo", "/logo-maoz.png"]) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = await r.blob();
      const d = await new Promise<string>((res, rej) => {
        const f = new FileReader();
        f.onload = () => res(String(f.result));
        f.onerror = () => rej(new Error("read"));
        f.readAsDataURL(b);
      });
      logoCache = d;
      return d;
    } catch {
      /* next */
    }
  }
  logoCache = "";
  return "";
}

/** פריסת הכותרת (גודל גופן ושורות) לפי הפורמט. משותף לכרזת ה-SVG ולתמונת השיתוף בשרת. */
export function titleLayout(title: string, format: PosterFormat): { fs: number; lines: string[]; lh: number } {
  const [W] = POSTER_SIZE[format];
  const wide = format === "og";
  const maxW = (wide ? 0.58 : 0.84) * W;
  let fs = (wide ? 0.105 : 0.088) * W;
  let lines = wrap(title, Math.floor(maxW / (fs * 0.5)));
  while (lines.length > (wide ? 3 : 4) && fs > W * 0.045) {
    fs *= 0.92;
    lines = wrap(title, Math.floor(maxW / (fs * 0.5)));
  }
  return { fs, lines, lh: fs * 1.2 };
}

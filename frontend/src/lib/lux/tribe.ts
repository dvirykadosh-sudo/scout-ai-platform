// שלב 61 (רעיון 14): ערכת צבעים שנשאבת מהלוגו של השבט (הלוגו שהאדמין העלה, ואם אין: הלוגו המובנה).
// התוצאה נשמרת בדפדפן, מוחלת על האתר כשבוחרים "צבעי הלוגו", ומשמשת גם בכרזות, בכרטיסים ובייצוא.
// חישוב הצבעים כולו מקומי (canvas באותו origin), בלי שליחת הלוגו לשום מקום.

export interface TribePal {
  a: string; // הדגש בכהה
  b: string; // גוון שני לגרדיאנט
  ink: string; // צבע הטקסט על כפתור גרדיאנט
  glow: string;
  wa: string; // כהה מאוד (בהיר)
  wb: string; // הדגש בתצוגה בהירה (ניגודיות מול לבן)
  wc: string;
  v: string; // גרסת הלוגו שממנה חושב
}

export const TRIBE_KEY = "scout.tribe.pal";
/** ברירת מחדל: סגול הלוגו של שבט מעוז, לפני שהחישוב רץ */
export const TRIBE_DEFAULT: TribePal = { a: "#a78bfa", b: "#c4b5fd", ink: "#150a33", glow: "#c4b5fd", wa: "#2e1065", wb: "#5b21b6", wc: "#6d28d9", v: "default" };

type RGB = [number, number, number];
const hex = ([r, g, b]: RGB) => "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
const parse = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a: RGB, b: RGB) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** משנה בהירות עד שהניגודיות מול הרקע מגיעה ליעד (בכיוון הבהיר או הכהה) */
function fit(h: number, s: number, l: number, bg: RGB, target: number, dir: 1 | -1): RGB {
  let cur = l;
  for (let i = 0; i < 60; i++) {
    const c = fromHsl(h, s, cur);
    if (contrast(c, bg) >= target) return c;
    cur = Math.max(0.04, Math.min(0.96, cur + dir * 0.015));
  }
  return fromHsl(h, s, cur);
}

/** בונה ערכה מצבע ראשי ושני (hue). טהור, נבדק בלי דפדפן. */
export function buildPalette(h1: number, s1: number, h2: number | null, v: string): TribePal {
  const dark: RGB = [11, 13, 18];
  const white: RGB = [255, 255, 255];
  const s = Math.max(0.45, Math.min(0.9, s1));
  const a = fit(h1, s, 0.66, dark, 7, 1);
  const hb = h2 ?? h1 - 24;
  const b = fit(hb, Math.max(0.4, s - 0.1), 0.76, dark, 8, 1);
  const wb = fit(h1, s, 0.4, white, 6.2, -1);
  const wc = fit(h1, s, 0.46, white, 4.7, -1);
  const wa = fromHsl(h1, Math.min(0.8, s), 0.17);
  const ink: RGB = Math.min(contrast(a, [0, 0, 0]), contrast(b, [0, 0, 0])) >= Math.min(contrast(a, white), contrast(b, white)) ? [12, 6, 24] : [255, 255, 255];
  return { a: hex(a), b: hex(b), ink: hex(ink), glow: hex(fit(hb, 0.9, 0.82, dark, 10, 1)), wa: hex(wa), wb: hex(wb), wc: hex(wc), v };
}

/** מתוך פיקסלים (RGBA) מוצא את שני הגוונים הבולטים. null אם הלוגו חסר צבע (שחור-לבן). */
export function dominantHues(px: Uint8ClampedArray | number[]): { h1: number; s1: number; h2: number | null } | null {
  const W = new Array(24).fill(0);
  const S = new Array(24).fill(0);
  let any = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const [h, s, l] = toHsl([px[i], px[i + 1], px[i + 2]]);
    if (s < 0.3 || l < 0.1 || l > 0.93) continue;
    const k = Math.floor(h / 15) % 24;
    const w = s * (1 - Math.abs(l - 0.5));
    W[k] += w;
    S[k] += s * w;
    any += w;
  }
  if (any < 4) return null;
  // חלון של 3 דליים: גוון יציב ולא "פיצול" בין דליים סמוכים
  const win = (k: number) => W[k] + 0.6 * (W[(k + 23) % 24] + W[(k + 1) % 24]);
  let best = 0;
  for (let k = 1; k < 24; k++) if (win(k) > win(best)) best = k;
  const h1 = best * 15 + 7.5;
  const s1 = S[best] / Math.max(1e-6, W[best]);
  let second: number | null = null;
  let bw = win(best) * 0.18;
  for (let k = 0; k < 24; k++) {
    const dist = Math.min(Math.abs(k - best), 24 - Math.abs(k - best)) * 15;
    if (dist >= 45 && win(k) > bw) {
      bw = win(k);
      second = k * 15 + 7.5;
    }
  }
  return { h1, s1, h2: second };
}

export function readTribe(): TribePal | null {
  try {
    const j = JSON.parse(localStorage.getItem(TRIBE_KEY) ?? "null") as TribePal | null;
    return j && typeof j.a === "string" ? j : null;
  } catch {
    return null;
  }
}
export const tribeOrDefault = (): TribePal => readTribe() ?? TRIBE_DEFAULT;

const VARS = { "--pal-a": "a", "--pal-b": "b", "--pal-ink": "ink", "--pal-glow": "glow", "--pal-wa": "wa", "--pal-wb": "wb", "--pal-wc": "wc" } as const;
/** מחיל את הערכה על html כשהערכה "צבעי הלוגו" נבחרה, ומנקה אחרת */
export function applyTribe(): void {
  const d = document.documentElement;
  if (d.dataset.palette !== "tribe") {
    for (const k of Object.keys(VARS)) d.style.removeProperty(k);
    return;
  }
  const p = tribeOrDefault();
  for (const [k, f] of Object.entries(VARS)) d.style.setProperty(k, String(p[f as keyof TribePal]));
}

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("logo"));
    im.src = src;
  });

/** שואב את הצבעים מהלוגו. מחזיר null כשאי אפשר (אין לוגו, או לוגו בלי צבע). */
export async function extractTribe(version: string): Promise<TribePal | null> {
  let im: HTMLImageElement;
  try {
    im = await loadImg(`/api/logo?v=${encodeURIComponent(version)}`);
  } catch {
    try {
      im = await loadImg("/logo-maoz.png");
    } catch {
      return null;
    }
  }
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(im, 0, 0, 96, 96);
  const hues = dominantHues(g.getImageData(0, 0, 96, 96).data);
  return hues ? buildPalette(hues.h1, hues.s1, hues.h2, version) : null;
}

/** מוודא שיש ערכה עדכנית שמורה (לפי גרסת הלוגו מהשרת), ומחיל אותה */
export async function ensureTribe(): Promise<void> {
  let checked = 0;
  try {
    checked = Number(localStorage.getItem("scout.tribe.chk") ?? 0);
  } catch {
    /* ignore */
  }
  if (readTribe() && Date.now() - checked < 24 * 3600_000) return applyTribe(); // פעם ביום מספיק
  let version = "builtin";
  try {
    const m = (await (await fetch("/api/meta")).json()) as { logoVersion?: string | number | null };
    if (m.logoVersion != null) version = String(m.logoVersion);
  } catch {
    /* ללא רשת: נשארים עם מה ששמור */
  }
  const cur = readTribe();
  if (!cur || cur.v !== version) {
    const p = await extractTribe(version);
    try {
      if (p) localStorage.setItem(TRIBE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.setItem("scout.tribe.chk", String(Date.now()));
  } catch {
    /* ignore */
  }
  applyTribe();
}

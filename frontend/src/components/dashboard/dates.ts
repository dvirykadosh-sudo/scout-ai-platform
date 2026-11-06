// עזרי תאריכים לדשבורד. כל התאריכים כמחרוזות YYYY-MM-DD לפי השעון המקומי של הדפדפן (ישראל).
export const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
export const DOW_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const DOW_LONG = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

const p2 = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayIso = (): string => toIso(new Date());
const parse = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (s: string, n: number): string => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toIso(d);
};

/** כמה ימים מ-a עד b (שלילי אם b קודם) */
export const daysBetween = (a: string, b: string): number => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86_400_000);
const ymd = (s: string): [number, number, number] => {
  const [y, m, d] = s.split("-").map(Number);
  return [y, (m || 1) - 1, d || 1];
};

export const weekdayOf = (s: string): number => parse(s).getDay();
export const fmtShort = (s: string): string => `${parse(s).getDate()}.${parse(s).getMonth() + 1}`;
export const fmtLong = (s: string): string => `${DOW_LONG[weekdayOf(s)]}, ${fmtShort(s)}`;

export interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** 42 תאים (6 שבועות), השבוע מתחיל ביום ראשון */
export function monthGrid(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { iso: toIso(d), day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

export const monthKey = (s: string): string => s.slice(0, 7);

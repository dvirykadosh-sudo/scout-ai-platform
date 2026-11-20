// שלב 71: כרטיס הזמנה בפורמט סטורי. לוגיקה טהורה: מספר וואטסאפ, קישור אישור הגעה, שבירת שורות והודעה להעתקה.
// תחביר "מחיק" בלבד (בלי enum), כי בדיקות השרת טוענות את הקובץ ישירות.

/** מספר ישראלי (או בינלאומי) לפורמט של wa.me: ספרות בלבד, עם קידומת מדינה. null אם לא נראה כמו מספר. */
export function waNumber(raw: string): string | null {
  let d = String(raw ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `972${d.slice(1)}`;
  return /^\d{10,15}$/.test(d) && !d.startsWith("0") ? d : null;
}

/** קישור שפותח צ'אט עם המספר שלכם, עם הודעה מוכנה "אישור הגעה: כן #מפתח". הבוט מזהה את המפתח ורושם את התשובה. */
export function rsvpLink(phone: string, key: string): string | null {
  const n = waNumber(phone);
  if (!n || !/^[a-z0-9]{6}$/.test(key)) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(`אישור הגעה: כן #${key}`)}`;
}

export interface InviteFields {
  title: string;
  line: string;
  date: string;
  time: string;
  place: string;
  bring: string;
}

const heDate = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
};
/** "יום חמישי, 20 בנובמבר · 17:30", או רק מה שמולא. */
export const whenText = (f: Pick<InviteFields, "date" | "time">): string => [f.date ? heDate(f.date) : "", f.time].filter(Boolean).join(" · ");

/** ההודעה שמצרפים לסטורי (לסטטוס אי אפשר ללחוץ על קישור, לכן שולחים גם טקסט). */
export function inviteMessage(f: InviteFields, link: string | null, pageUrl: string | null): string {
  const rows: string[] = [`*${f.title.trim()}*`];
  if (f.line.trim()) rows.push(f.line.trim());
  const when = whenText(f);
  if (when) rows.push(`מתי: ${when}`);
  if (f.place.trim()) rows.push(`איפה: ${f.place.trim()}`);
  if (f.bring.trim()) rows.push(`מה להביא: ${f.bring.trim()}`);
  if (link) rows.push("", `לאישור הגעה (כן / לא / אולי): ${link}`);
  else if (pageUrl) rows.push("", `פרטים: ${pageUrl}`);
  return rows.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** שבירת שורות לפי רוחב נמדד (מקבל פונקציית מדידה, כדי שאפשר יהיה לבדוק בלי canvas). לא חותך מילים, ואם מילה אחת ארוכה מדי היא נשארת בשורה לבדה. */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number, maxLines = 4): { lines: string[]; cut: boolean } {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return { lines, cut: false };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:!?-]+$/, "")}…`;
  return { lines: kept, cut: true };
}

/** צבע כהה יותר (factor 0..1) וחישוב בהירות, כדי שטקסט לבן תמיד יהיה קריא על רקע הכרטיס. */
export function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#2a1458";
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - factor))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`;
}
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
/** צבע רקע שמבטיח ניגודיות לטקסט לבן (יחס 4.5 לפחות): מכהים עד שמגיעים לשם. */
export function backdrop(hex: string, factor = 0.35): string {
  let f = factor;
  let c = shade(hex, f);
  while (f < 0.9 && (1.05 / (luminance(c) + 0.05)) < 4.5) {
    f += 0.05;
    c = shade(hex, f);
  }
  return c;
}

// שלב 69: פונקציות טהורות לארגז כלי השטח (מד רעש, חלוקה הוגנת לקבוצות, קריאת SSE). תחביר "מחיק" כדי שגם בדיקות השרת יטענו אותו.

/** עוצמה (RMS של דגימות בין -1 ל-1) לרמה יחסית 0..100. -70dBFS ומטה = 0, -10dBFS ומעלה = 100. לא dB SPL מכויל. */
export function rmsToLevel(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.round(Math.min(100, Math.max(0, ((db + 70) / 60) * 100)));
}

/** ממוצע נע: רמה חדשה משפיעה בחלקה (alpha), כדי שהמד לא ירקוד */
export const smooth = (prev: number, next: number, alpha = 0.35): number => prev + (next - prev) * alpha;

/** ערבוב פישר-ייטס. rnd ניתן להחלפה כדי שאפשר יהיה לבדוק תוצאה קבועה. */
export function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** חלוקה הוגנת: מערבבים ומחלקים בסבב, ולכן גדלי הקבוצות נבדלים לכל היותר באחד, ואף אחד לא מופיע פעמיים. */
export function splitGroups<T>(items: readonly T[], groups: number, rnd: () => number): T[][] {
  const k = Math.max(1, Math.min(Math.floor(groups) || 1, Math.max(1, items.length)));
  const out: T[][] = Array.from({ length: k }, () => []);
  shuffle(items, rnd).forEach((x, i) => out[i % k].push(x));
  return out;
}

/** מספר קבוצות לפי גודל רצוי לקבוצה */
export const groupsForSize = (people: number, size: number): number => Math.max(1, Math.round(people / Math.max(1, size)));

/** שמות מרשימה (שורה לכל שם): מנקה רווחים, מסיר כפילויות ושורות ריקות, ומגביל לאורך סביר */
export function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n|,/)) {
    const t = line.trim().replace(/\s+/g, " ").slice(0, 40);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 200);
}

export interface SseMessage {
  event: string;
  data: string;
}

/** מפרק מקטע טקסט של SSE להודעות שלמות. מחזיר גם את מה שנשאר (הודעה חלקית) להמשך. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  const messages: SseMessage[] = [];
  for (const p of parts) {
    let event = "message";
    const data: string[] = [];
    for (const line of p.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length) messages.push({ event, data: data.join("\n") });
  }
  return { messages, rest };
}

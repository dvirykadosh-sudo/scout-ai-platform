// חישובי הדשבורד: מאחדים יומן אישי, אירועי שבט ותזכורות לרשימת אירועים אחת, וסופרים לפי שבועות. פונקציות טהורות.
import type { Reminder, ScheduleItem } from "@/lib/organizer";
import { addDays, daysBetween, monthKey } from "./dates";

export type EventKind = "library" | "free" | "team" | "remind";

export interface TeamEvent {
  id: number;
  title: string;
  date: string;
  ageGroup: string;
  leader: string;
  mine: boolean;
}

export interface DashEvent {
  id: string;
  kind: EventKind;
  title: string;
  date: string;
  time: string;
  sub: string;
  href: string;
}

export const KIND_LABEL: Record<EventKind, string> = {
  library: "פעולה מהמאגר",
  free: "אירוע חופשי",
  team: "אירוע שבט",
  remind: "דורש טיפול",
};

/** יומן אישי (עם פעולה מהמאגר או בלעדיה), אירועי שבט, ותזכורות פתוחות, לפי תאריך ושעה */
export function toEvents(schedule: ScheduleItem[], team: TeamEvent[], reminders: Reminder[]): DashEvent[] {
  const out: DashEvent[] = [
    ...schedule.map((s) => ({
      id: `s${s.id}`,
      kind: (s.activityId ? "library" : "free") as EventKind,
      title: s.title || "אירוע ביומן",
      date: s.date,
      time: s.time || "",
      sub: s.groupLabel || "",
      href: s.activityId ? `/library/${s.activityId}` : "/calendar",
    })),
    ...team.map((t) => ({ id: `t${t.id}`, kind: "team" as EventKind, title: t.title, date: t.date, time: "", sub: [t.ageGroup, t.mine ? "שלי" : t.leader].filter(Boolean).join(" · "), href: "/team" })),
    ...reminders.map((r) => ({ id: `r${r.id}${r.type}`, kind: "remind" as EventKind, title: r.message || r.title, date: r.date, time: r.time || "", sub: r.type === "log" ? "לתעד" : "להכין", href: "/calendar" })),
  ];
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** ספירה לפי שבועות. past: weeks שבועות שמסתיימים היום (ישן ← חדש). future: מהיום קדימה (קרוב ← רחוק). */
export function weekCounts(dates: string[], today: string, weeks: number, dir: "past" | "future"): number[] {
  const out = Array<number>(weeks).fill(0);
  for (const d of dates) {
    const diff = daysBetween(today, d);
    if (dir === "past" && diff <= 0 && -diff < weeks * 7) out[weeks - 1 - Math.floor(-diff / 7)]++;
    if (dir === "future" && diff >= 0 && diff < weeks * 7) out[Math.floor(diff / 7)]++;
  }
  return out;
}

/** ספירה ליום, לשבוע הקרוב (להיום ושישה ימים אחריו) */
export const nextDays = (dates: string[], today: string, n = 7): number[] => Array.from({ length: n }, (_, i) => dates.filter((d) => d === addDays(today, i)).length);

/** אחוז שלם, או null אם אין מכנה */
export const percent = (part: number, total: number): number | null => (total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : null);

export const inMonth = (dates: string[], ym: string): number => dates.filter((d) => monthKey(d) === ym).length;

/** האירוע הבא ביומן האישי (היום ואילך; היום רק אם השעה עוד לא עברה) */
export function nextOwn(schedule: ScheduleItem[], today: string, nowHm: string): ScheduleItem | null {
  const upcoming = schedule.filter((s) => s.date > today || (s.date === today && (!s.time || s.time >= nowHm)));
  return upcoming.sort((a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00")))[0] ?? null;
}

/** "היום", "מחר" או "בעוד N ימים" */
export function relDay(days: number): string {
  if (days <= 0) return "היום";
  if (days === 1) return "מחר";
  return `בעוד ${days} ימים`;
}

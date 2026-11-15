// שלב 67: פס סיכום מעל תוצאות הספרייה. מחושב רק מהפעולות שכבר נטענו בעמוד הנוכחי (בלי בקשה נוספת לשרת), והתוויות אומרות זאת.
import type { Activity } from "@/lib/types";
import { KIND_LABELS } from "@/lib/kind-labels";
import { StatStrip, type StatTile } from "./StatStrip";
import { StatPill } from "./StatPill";

export function LibraryStats({ items, total }: { items: Activity[]; total: number }) {
  if (items.length === 0) return null;
  const rated = items.filter((a) => a.rating && a.rating.count > 0);
  const avgRating = rated.length ? rated.reduce((s, a) => s + (a.rating?.average ?? 0), 0) / rated.length : 0;
  const avgMin = Math.round(items.reduce((s, a) => s + a.durationMin, 0) / items.length);
  const kinds = new Map<string, number>();
  for (const a of items) if (a.kind && KIND_LABELS[a.kind]) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
  const top = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0];
  const tiles: StatTile[] = [
    { key: "total", hero: "dark", label: "נמצאו במאגר", value: total, sub: `מוצגות בעמוד הזה: ${items.length}` },
    { key: "min", hero: "brand", label: "משך ממוצע בעמוד", value: <>{avgMin}<small> דק'</small></>, pill: <StatPill tone="brand" srPrefix="">לפי הפעולות המוצגות</StatPill> },
    rated.length
      ? { key: "rate", label: "דירוג ממוצע בעמוד", value: avgRating.toFixed(1), sub: `מתוך ${rated.length} פעולות מדורגות`, ring: { value: avgRating / 5, label: "דירוג ממוצע מתוך חמישה" } }
      : { key: "rate", label: "דירוג ממוצע בעמוד", value: "—", sub: "אין עדיין דירוגים בעמוד הזה" },
    top
      ? { key: "kind", label: "הסוג הנפוץ בעמוד", value: <span className="v21-stat-text">{KIND_LABELS[top[0]]}</span>, pill: <StatPill tone="flat" srPrefix="">{top[1]} פעולות</StatPill> }
      : { key: "kind", label: "הסוג הנפוץ בעמוד", value: <span className="v21-stat-text">כללי</span> },
  ];
  return <StatStrip tiles={tiles} label="סיכום התוצאות בעמוד הנוכחי" />;
}

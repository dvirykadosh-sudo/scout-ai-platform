"use client";

// שלב 67: טבעת התקדמות נקייה (Donut) לכרטיסי סטטיסטיקה. המספר מופיע גם בטקסט (aria-label), והציור עצמו דקורטיבי.
// ההבדל מ-lux-pring ב-TodayCard: מעבר צבע בקשת, אפשר לשים בפנים כל תוכן, וגודל משתנה.
import { useId, type ReactNode } from "react";

export function Ring({
  value,
  label,
  size = 84,
  stroke = 9,
  children,
}: {
  /** 0 עד 1 */
  value: number;
  /** מה הטבעת מודדת, לקורא מסך: "<label>: 40 אחוז" */
  label: string;
  size?: number;
  stroke?: number;
  /** ברירת מחדל: האחוז. אפשר להחליף למספר אחר (למשל "3/5") */
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = 50 - stroke / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="v21-ring" style={{ width: size, height: size, fontSize: Math.round(size * 0.25) }} role="img" aria-label={`${label}: ${Math.round(v * 100)} אחוז`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`rg-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="v21-ring-s1" />
            <stop offset="100%" className="v21-ring-s2" />
          </linearGradient>
        </defs>
        <circle className="v21-ring-bg" cx="50" cy="50" r={r} strokeWidth={stroke} />
        <circle
          className="v21-ring-fg"
          cx="50"
          cy="50"
          r={r}
          strokeWidth={stroke}
          stroke={`url(#rg-${id})`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="v21-ring-num" aria-hidden="true">
        {children ?? `${Math.round(v * 100)}%`}
      </span>
    </div>
  );
}

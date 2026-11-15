// שלב 67: תגית שינוי או סטטוס אלגנטית (Pill). לא נשענת על צבע בלבד: יש חץ או סימן ומילה לקורא מסך.
import type { ReactNode } from "react";

export type PillTone = "up" | "down" | "flat" | "brand";

const MARK: Record<PillTone, string> = { up: "▲", down: "▼", flat: "●", brand: "◆" };
const WORD: Record<PillTone, string> = { up: "עלייה", down: "ירידה", flat: "ללא שינוי", brand: "" };

export function StatPill({ tone = "flat", children, srPrefix }: { tone?: PillTone; children: ReactNode; /** מחליף את המילה לקורא מסך */ srPrefix?: string }) {
  const word = srPrefix ?? WORD[tone];
  return (
    <span className={`v21-pill v21-pill-${tone}`}>
      <span aria-hidden="true" className="v21-pill-mark">
        {MARK[tone]}
      </span>
      {word && <span className="sr-only">{word}: </span>}
      {children}
    </span>
  );
}

/** שינוי באחוזים מול תקופה קודמת. אם אין תקופה קודמת (0) אין מה להשוות, ולכן לא מציגים אחוז מומצא. */
export function deltaPill(now: number, before: number, unit = "מול התקופה הקודמת"): ReactNode {
  if (before <= 0) return <StatPill tone="brand">חדש</StatPill>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <StatPill tone="flat">0% {unit}</StatPill>;
  return (
    <StatPill tone={pct > 0 ? "up" : "down"}>
      {pct > 0 ? "+" : ""}
      {pct}% {unit}
    </StatPill>
  );
}

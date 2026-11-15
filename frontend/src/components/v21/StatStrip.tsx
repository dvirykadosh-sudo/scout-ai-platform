// שלב 67: פס כרטיסי סטטיסטיקה אחיד (Bento) לכל עמוד: מדד גדול, תגית שינוי או סטטוס (Pill), טבעת או מיני-גרף.
// עד שני כרטיסי Hero בפס: "dark" (כהה עמוק עם מדד זוהר) ו-"brand" (גרדיאנט המותג).
import type { ReactNode } from "react";
import { Ring } from "./Ring";

export interface StatTile {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  pill?: ReactNode;
  ring?: { value: number; label: string };
  spark?: ReactNode;
  hero?: "dark" | "brand";
}

export function StatStrip({ tiles, label, className = "" }: { tiles: StatTile[]; label: string; className?: string }) {
  return (
    <ul className={`v21-stats ${className}`.trim()} aria-label={label}>
      {tiles.map((t) => (
        <li key={t.key} className={`v21-card v21-stat${t.hero ? ` v21-hero-${t.hero}` : ""}`}>
          <span className="v21-stat-label">{t.label}</span>
          <span className="v21-stat-num">{t.value}</span>
          {t.sub && <span className="v21-stat-sub">{t.sub}</span>}
          {t.spark}
          {(t.pill || t.ring) && (
            <span className="v21-stat-row">
              {t.pill}
              {t.ring && <Ring value={t.ring.value} label={t.ring.label} size={54} stroke={11} />}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

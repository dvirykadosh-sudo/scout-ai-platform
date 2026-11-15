"use client";

// שלב 67: בר התקדמות בסגנון קפסולת זכוכית זוהרת עם מונה אחוזים גדול.
// value: 0 עד 100. estimated=true כשאין דיווח התקדמות אמיתי מהשרת: המספר הוא הערכה, והתווית אומרת זאת במפורש.
import { useEffect, useState } from "react";

export function GlassProgress({ value, label, estimated = false }: { value: number; label: string; estimated?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="v21-gp" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <span className="v21-gp-num" aria-hidden="true">
        {v}
        <small>%</small>
      </span>
      <span className="v21-gp-track" aria-hidden="true">
        <i style={{ width: `${v}%` }} />
      </span>
      {estimated && (
        <span className="v21-gp-note" aria-hidden="true">
          הערכה בלבד, השרת לא מדווח התקדמות
        </span>
      )}
    </div>
  );
}

/** התקדמות מוערכת בזמן המתנה: עולה בהאטה עד 92 אחוז ונשארת שם עד שהפעולה מסתיימת, ואז קופצת ל-100. */
export function useEstimatedProgress(active: boolean, expectedMs = 9000): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) {
      setP(0);
      return;
    }
    setP(2);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const x = (Date.now() - t0) / expectedMs;
      setP(Math.min(92, Math.round(92 * (1 - Math.exp(-2.4 * x)))));
    }, 220);
    return () => window.clearInterval(id);
  }, [active, expectedMs]);
  return p;
}

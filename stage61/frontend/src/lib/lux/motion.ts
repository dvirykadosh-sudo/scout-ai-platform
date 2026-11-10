"use client";

import { useEffect, useState } from "react";

/** האם להקטין תנועה: העדפת מערכת, או מצב חיסכון של האתר. */
export const calmMotion = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("saver") || document.documentElement.dataset.motion === "off" || document.documentElement.dataset.motion === "calm";
  } catch {
    return true;
  }
};

/** מספר שעולה מאפס ליעד. במצב רגוע מציג את היעד מיד. */
export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (calmMotion() || target <= 0) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

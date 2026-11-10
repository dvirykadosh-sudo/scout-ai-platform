"use client";

// שלב 61 (רעיון 8): זוהר שעוקב אחרי העכבר על כרטיסי הזכוכית. רק במכשיר עם עכבר, ורק בלי הפחתת תנועה.
import { useEffect } from "react";

export function CursorGlow() {
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;
    let raf = 0;
    let cur: HTMLElement | null = null;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      if (!cur) return;
      const r = cur.getBoundingClientRect();
      cur.style.setProperty("--mx", `${px - r.left}px`);
      cur.style.setProperty("--my", `${py - r.top}px`);
    };
    const clear = () => {
      cur?.style.setProperty("--glow", "0");
      cur = null;
    };
    const onMove = (e: PointerEvent) => {
      if (document.documentElement.classList.contains("saver") || document.documentElement.classList.contains("hc")) return;
      const el = (e.target as Element | null)?.closest?.(".lux .glass, .lux .lux-glow") as HTMLElement | null;
      if (el !== cur) {
        clear();
        cur = el;
        cur?.style.setProperty("--glow", "1");
      }
      if (!cur) return;
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", clear);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", clear);
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, []);
  return null;
}

"use client";

// שלב 67: אינדיקטור פעיל חלק לכל רשימת לשוניות (role="tablist"). הלשונית הפעילה נמצאת לפי aria-selected, ולכן לא צריך לשנות את הכפתורים.
// שימוש:  const t = useTabIndicator(tab);
//         <div role="tablist" ref={t.ref} className={`... ${t.cls}`} data-switch={t.sw}>{t.ind} ...לשוניות... </div>
// המדידה פיזית (offsetLeft), ולכן נכונה גם ב-RTL. אם הרשימה מוסתרת (חלון שעוד לא נפתח) לא מציגים כלום, והלשונית הפעילה נשארת בעיצוב שלה.
import { createElement, useCallback, useEffect, useRef, useState, type ReactElement } from "react";

export function useTabIndicator(active: string): {
  ref: (el: HTMLElement | null) => void;
  cls: string;
  sw: "1" | undefined;
  ind: ReactElement;
} {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [live, setLive] = useState(false);
  const [switching, setSwitching] = useState(false);
  const first = useRef(true);

  const measure = useCallback(() => {
    if (!el) return;
    const btn = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!btn || btn.offsetWidth === 0) {
      setLive(false);
      return;
    }
    el.style.setProperty("--ind-x", `${btn.offsetLeft}px`);
    el.style.setProperty("--ind-y", `${btn.offsetTop}px`);
    el.style.setProperty("--ind-w", `${btn.offsetWidth}px`);
    el.style.setProperty("--ind-h", `${btn.offsetHeight}px`);
    el.style.setProperty("--ind-r", getComputedStyle(btn).borderTopLeftRadius || "14px");
    setLive(true);
  }, [el]);

  useEffect(() => {
    measure();
    if (!el) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [el, measure, active]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSwitching(true);
    const t = window.setTimeout(() => setSwitching(false), 800);
    return () => window.clearTimeout(t);
  }, [active]);

  return {
    ref: setEl,
    cls: live ? "v21-live" : "",
    sw: switching ? "1" : undefined,
    ind: createElement("span", { className: "v21-ind", "aria-hidden": true }),
  };
}

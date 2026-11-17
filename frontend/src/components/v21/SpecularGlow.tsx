"use client";

// שלב 68: Specular Glow. כתם אור שעוקב אחרי העכבר, האצבע או העט על כרטיסי Bento ועל כרטיס הפיקוד (צמתים ומנהרת הכרטיסים).
// הרכיב רק כותב את המשתנים --mx ו---my (מיקום בתוך הכרטיס, בפיקסלים) ו---sg (0 או 1); הציור כולו ב-v21.css.
// מאזינים פסיביים, עדכון פעם אחת בכל פריים, ואף פעם לא מונעים גלילה או לחיצה. בהפחתת תנועה, בחיסכון ובניגודיות גבוהה: כבוי.
import { useEffect } from "react";

const SEL = ".v21-card, .v21-command, .v21-node, .v21-tcard-link";

export function SpecularGlow() {
  useEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    let on: HTMLElement[] = [];
    let raf = 0;
    let px = 0;
    let py = 0;

    const off = () => {
      for (const el of on) el.style.setProperty("--sg", "0");
      on = [];
    };
    const paint = () => {
      raf = 0;
      for (const el of on) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${Math.round(px - r.left)}px`);
        el.style.setProperty("--my", `${Math.round(py - r.top)}px`);
      }
    };
    const blocked = () => calm.matches || root.classList.contains("hc") || root.classList.contains("saver");
    // הכרטיס עצמו וכל הכרטיסים שמכילים אותו (צומת בתוך כרטיס הפיקוד), עד שלושה
    const chain = (t: EventTarget | null): HTMLElement[] => {
      const out: HTMLElement[] = [];
      let el = (t as Element | null)?.closest?.(SEL) as HTMLElement | null;
      while (el && out.length < 3) {
        out.push(el);
        el = el.parentElement?.closest(SEL) as HTMLElement | null;
      }
      return out;
    };
    const move = (e: PointerEvent) => {
      if (blocked()) {
        if (on.length) off();
        return;
      }
      const next = chain(e.target);
      for (const el of on) if (!next.includes(el)) el.style.setProperty("--sg", "0");
      for (const el of next) if (!on.includes(el)) el.style.setProperty("--sg", "1");
      on = next;
      px = e.clientX;
      py = e.clientY;
      if (on.length && !raf) raf = requestAnimationFrame(paint);
    };
    const end = (e: PointerEvent) => {
      // עכבר שיוצא מהכרטיס מטופל ב-move; אצבע או עט שהורמו מכבים מיד (ה-CSS מעמעם בהדרגה)
      if (e.pointerType !== "mouse") off();
    };
    const leave = () => off();

    document.addEventListener("pointerdown", move, { passive: true });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", end, { passive: true });
    document.addEventListener("pointercancel", end, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      document.removeEventListener("pointerdown", move);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      if (raf) cancelAnimationFrame(raf);
      off();
    };
  }, []);
  return null;
}

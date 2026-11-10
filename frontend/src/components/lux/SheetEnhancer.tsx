"use client";

// שלב 61 (רעיון 3): במובייל כל חלון (Modal) הוא גיליון תחתון: צמוד לאגודל, עם ידית, ואפשר לסגור במשיכה למטה.
// הסגירה עצמה היא לחיצה על כפתור "סגירה" הקיים, כך שהמצב ב-React תמיד מסונכרן.
import { useEffect } from "react";

export function SheetEnhancer() {
  useEffect(() => {
    const mq = matchMedia("(max-width: 720px)");
    let st: { y: number; t: number; dlg: HTMLDialogElement; head: Element; id: number } | null = null;

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !mq.matches) return;
      const tgt = e.target as Element | null;
      const head = tgt?.closest?.("dialog.modal .modal-head");
      if (!head || tgt?.closest("button, a, input, select, textarea")) return;
      const dlg = head.closest("dialog") as HTMLDialogElement | null;
      if (!dlg) return;
      st = { y: e.clientY, t: Date.now(), dlg, head, id: e.pointerId };
      try {
        head.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const move = (e: PointerEvent) => {
      if (!st) return;
      const dy = Math.max(0, e.clientY - st.y);
      st.dlg.style.transition = "none";
      st.dlg.style.transform = `translateY(${dy}px)`;
    };
    const up = (e: PointerEvent) => {
      if (!st) return;
      const { dlg, head, y, t } = st;
      st = null;
      const dy = Math.max(0, e.clientY - y);
      const v = dy / Math.max(1, Date.now() - t);
      dlg.style.transition = "transform 0.2s ease";
      if (dy > 120 || (dy > 40 && v > 0.6)) {
        dlg.style.transform = "translateY(100%)";
        window.setTimeout(() => {
          (dlg.querySelector(".modal-head .icon-btn") as HTMLButtonElement | null)?.click();
          dlg.style.transform = "";
          dlg.style.transition = "";
        }, 190);
      } else {
        dlg.style.transform = "";
        window.setTimeout(() => (dlg.style.transition = ""), 220);
      }
      void head;
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, []);
  return null;
}

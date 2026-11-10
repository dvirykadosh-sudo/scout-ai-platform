"use client";

// שלב 61 (רעיון 6): מעבר חלק בין כרטיס במאגר לעמוד הפעולה (View Transitions API).
// כרטיס הפעולה "גולש" אל הכותרת של העמוד. בלי תמיכה בדפדפן, בהפחתת תנועה, בחיסכון בנתונים או בניגודיות גבוהה: ניווט רגיל.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type VT = { finished: Promise<unknown> };
type Doc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => VT };
const NAME = "lux-morph";

export function ViewTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  const waiter = useRef<(() => void) | null>(null);

  // אחרי הניווט: מסמנים את היעד, ומשחררים את המעבר ברגע שהעמוד מוכן (או אחרי חצי שנייה)
  useEffect(() => {
    const w = waiter.current;
    if (!w) return;
    let frames = 0;
    const tick = () => {
      const dest = document.querySelector<HTMLElement>("main article.printable, main .page-title");
      if (dest || frames++ > 30) {
        dest?.style.setProperty("view-transition-name", NAME);
        waiter.current = null;
        w();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [pathname]);

  useEffect(() => {
    const doc = document as Doc;
    if (!doc.startViewTransition) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/^\/library\/\d+\/?$/.test(url.pathname) || url.pathname === location.pathname) return;
      const root = document.documentElement;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("saver") || root.classList.contains("hc")) return;
      e.preventDefault();
      e.stopPropagation();
      const from = (a.closest("li, article, .card") as HTMLElement | null) ?? a;
      from.style.setProperty("view-transition-name", NAME);
      let t: VT;
      try {
        t = doc.startViewTransition!(
          () =>
            new Promise<void>((resolve) => {
              waiter.current = resolve;
              router.push(url.pathname + url.search + url.hash);
              window.setTimeout(resolve, 1200); // רשת אחרונה: אף פעם לא נתקעים
            }),
        );
      } catch {
        router.push(url.pathname + url.search + url.hash);
        return;
      }
      const clean = () => {
        from.style.removeProperty("view-transition-name");
        document.querySelectorAll<HTMLElement>(`[style*="${NAME}"]`).forEach((n) => n.style.removeProperty("view-transition-name"));
      };
      void t.finished.then(clean, clean);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}

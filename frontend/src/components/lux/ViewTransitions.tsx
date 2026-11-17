"use client";

// שלב 61 (רעיון 6): מעבר חלק בין כרטיס במאגר לעמוד הפעולה (View Transitions API): הכרטיס "גולש" אל הכותרת של העמוד.
// שלב 68: אותו מנגנון גם לכל ניווט פנימי (דעיכה והחלקה קלה של העמוד) ולמעבר בין לשוניות (רק אזור התוכן של הלשונית).
// העיקרון: ה-API מצלם את המצב הישן לפני שהקוד שמשנה את הדף רץ, ולכן את הלחיצה האמיתית עוצרים, מתחילים מעבר, ובתוכו מריצים
// מחדש לחיצה זהה על אותו אלמנט (כך כל ה-onClick של האתר, כולל Link של Next, רצים כרגיל ובדיוק פעם אחת).
// בלי תמיכה בדפדפן, בהפחתת תנועה (מערכת או "תנועה רגועה" באתר), בחיסכון בנתונים או בניגודיות גבוהה: אין שום התערבות והכול קורה מיד.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { calmMotion } from "@/lib/lux/motion";

type VT = { finished: Promise<unknown> };
type Doc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => VT };
const NAME = "lux-morph";
const PANEL = "v21-panel";
/** רשת ביטחון: בזמן מעבר המסך קפוא, ולכן אף פעם לא מחכים יותר מזה */
const NAV_MAX = 700;

// חשוב: בזמן שהמעבר מצלם את המצב הישן ומריץ את הקוד שלנו, הדפדפן לא מריץ requestAnimationFrame (הרינדור מושהה), ולכן כל המתנה כאן
// נעשית עם setTimeout בלבד. requestAnimationFrame בתוך הקוד הזה פשוט לא חוזר, והמסך נתקע עד רשת הביטחון.
const settle = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** האם מותר מעבר מונפש כרגע */
const allowed = (): boolean => {
  if (typeof document === "undefined" || !(document as Doc).startViewTransition) return false;
  if (calmMotion() || document.documentElement.classList.contains("hc")) return false;
  try {
    // דפדפן אוטומטי (בדיקות) מקבל ניווט מיידי, אלא אם הופעל במפורש: localStorage scout.vt = "1"
    if (navigator.webdriver && localStorage.getItem("scout.vt") !== "1") return false;
  } catch {
    /* ignore */
  }
  return true;
};

export function ViewTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  const waiter = useRef<{ done: () => void; morph: boolean } | null>(null);
  const replaying = useRef(false);
  const busy = useRef(false);

  // אחרי הניווט: מסמנים את היעד, ומשחררים את המעבר ברגע שהעמוד מוכן (או אחרי חצי שנייה)
  useEffect(() => {
    const w = waiter.current;
    if (!w) return;
    let tries = 0;
    const tick = () => {
      const dest = document.querySelector<HTMLElement>(w.morph ? "main article.printable, main .page-title" : "main article.printable, main .page-title, main h1");
      if (dest || tries++ > 30) {
        if (w.morph) dest?.style.setProperty("view-transition-name", NAME);
        waiter.current = null;
        w.done();
        return;
      }
      window.setTimeout(tick, 16);
    };
    window.setTimeout(tick, 16);
  }, [pathname]);

  useEffect(() => {
    const doc = document as Doc;
    if (!doc.startViewTransition) return;

    const clean = () => {
      busy.current = false;
      document.querySelectorAll<HTMLElement>(`[style*="${NAME}"], [style*="${PANEL}"]`).forEach((n) => {
        n.style.removeProperty("view-transition-name");
      });
    };
    /** מריץ מחדש לחיצה על אותו אלמנט. מחזיר false אם מישהו עצר אותה (כלומר האתר טיפל בה בעצמו) */
    const replay = (el: HTMLElement): boolean => {
      replaying.current = true;
      try {
        return el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } finally {
        replaying.current = false;
      }
    };
    /** ממתינים לשינוי הכתובת; אם לא קרה בזמן, משחררים (והמסך חוזר לחיות) */
    const arm = (done: () => void, morph: boolean, ms: number) => {
      const w = { done, morph };
      waiter.current = w;
      window.setTimeout(() => {
        if (waiter.current === w) waiter.current = null;
        done();
      }, ms);
    };
    const run = (update: () => Promise<void> | void, fallback: () => void): boolean => {
      let t: VT;
      try {
        t = doc.startViewTransition!(update);
      } catch {
        fallback();
        return false;
      }
      busy.current = true;
      void t.finished.then(clean, clean);
      return true;
    };

    // לשוניות: מעבר רק על אזור התוכן של הלשונית. אם אי אפשר לזהות בדיוק אזור אחד, לא מתערבים.
    const onTab = (e: MouseEvent, tab: HTMLButtonElement): boolean => {
      if (tab.getAttribute("aria-selected") === "true" || tab.disabled || busy.current || !allowed()) return false;
      const region = tab.closest('[role="tablist"]')?.parentElement;
      if (!region) return false;
      const visible = () => Array.from(region.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter((p) => !p.hasAttribute("hidden") && p.offsetParent !== null);
      const old = visible();
      if (old.length !== 1) return false;
      e.preventDefault();
      e.stopPropagation();
      old[0].style.setProperty("view-transition-name", PANEL);
      run(
        async () => {
          old[0].style.removeProperty("view-transition-name");
          replaying.current = true;
          try {
            tab.click();
          } finally {
            replaying.current = false;
          }
          await settle(40);
          const now = visible();
          if (now.length === 1) now[0].style.setProperty("view-transition-name", PANEL);
        },
        () => {
          old[0].style.removeProperty("view-transition-name");
          tab.click();
        },
      );
      return true;
    };

    const onClick = (e: MouseEvent) => {
      if (replaying.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target as Element | null;
      const tab = el?.closest?.('button[role="tab"]') as HTMLButtonElement | null;
      if (tab) {
        onTab(e, tab);
        return;
      }
      const a = el?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute("download") || a.dataset.noVt !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (!allowed()) return;
      const dest = url.pathname + url.search + url.hash;

      // כרטיס במאגר -> עמוד הפעולה: הכרטיס עצמו גולש אל הכותרת
      if (/^\/library\/\d+\/?$/.test(url.pathname)) {
        e.preventDefault();
        e.stopPropagation();
        const from = (a.closest("li, article, .card") as HTMLElement | null) ?? a;
        from.style.setProperty("view-transition-name", NAME);
        run(
          () =>
            new Promise<void>((resolve) => {
              arm(resolve, true, 1200); // רשת אחרונה: אף פעם לא נתקעים
              router.push(dest);
            }),
          () => router.push(dest),
        );
        return;
      }

      // כל קישור פנימי אחר שהאתר מנווט בו בצד הלקוח. קבצים וכתובות API נשארים כרגיל.
      if (/^\/api\//.test(url.pathname) || /\.[a-z0-9]{2,5}$/i.test(url.pathname) || busy.current) return;
      e.preventDefault();
      e.stopPropagation();
      run(
        () =>
          new Promise<void>((resolve) => {
            const handled = !replay(a);
            if (!handled) return resolve(); // לא נוהל בצד הלקוח (ניווט רגיל של הדפדפן): אין על מה לחכות
            arm(resolve, false, NAV_MAX);
          }),
        () => {
          replay(a);
        },
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}

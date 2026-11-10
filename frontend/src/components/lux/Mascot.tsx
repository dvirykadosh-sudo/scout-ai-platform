"use client";

// שלב 61 (רעיון 10): הנשר "מעוז". כפתור קטן בפינה: טיפ לפי העמוד, חגיגה כשמשהו הצליח, וסיור מודרך עם זרקור.
// לא קופץ מעצמו ולא חוסם. אפשר להסתיר (נשמר), ולהחזיר מההגדרות או מ"נוחות קריאה".
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { storageGet, storageSet } from "@/lib/api";
import { Eagle, type EagleMood } from "./illus";

export const MASCOT_KEY = "scout.mascot"; // "off" = מוסתר

const TIPS: { match: RegExp; id: string; text: string }[] = [
  { match: /^\/$/, id: "home", text: "רוצים פעולה מהר? כתבו נושא וערך מוביל, והמחולל יבנה חמישה שלבים עם זמנים." },
  { match: /^\/library\/\d+/, id: "activity", text: "בשטח? לחצו על 'מצב במה': שלב אחד על המסך, טיימר ענק, והחלקה לשלב הבא." },
  { match: /^\/library/, id: "library", text: "אפשר לסנן לפי גיל וערך. לחצו על כרטיס כדי לפתוח פעולה ולהפעיל אותה." },
  { match: /^\/(write|assistant)/, id: "write", text: "הטיוטה נשמרת אוטומטית. הוסיפו תאריך לפעולה, וביום המפגש היא תופיע במסך 'היום'." },
  { match: /^\/plan/, id: "plan", text: "תכנון תקופתי: מלאו שבועות, והמערכת תראה אילו ערכים עדיין חסרים." },
  { match: /^\/calendar/, id: "calendar", text: "ביומן אפשר לראות מה מתוכנן, ולהדפיס את החודש לסניף." },
  { match: /^\/dashboard/, id: "dash", text: "זה הלוח שלכם: מה מתוכנן, מה חסר, ומה כדאי להכין לשבוע הקרוב." },
  { match: /^\/account/, id: "account", text: "כאן מנהלים אימות דו-שלבי, התראות והעדפות נוחות קריאה." },
];

interface Step {
  sel?: string;
  text: string;
}
const TOUR: Step[] = [
  { text: "שלום, אני מעוז! אעשה לכם סיור קצר של דקה באתר." },
  { sel: 'a[href="/"].sh-link, nav[aria-label="ניווט צד"] a[href="/"]', text: "כאן יוצרים פעולה חכמה: כותבים נושא, והמחולל בונה פעולה בחמישה שלבים." },
  { sel: 'nav[aria-label="ניווט צד"] a[href="/library"]', text: "המאגר: פעולות מוכנות לפי גיל וערך. אפשר לפתוח, לדרג ולהפעיל." },
  { sel: 'nav[aria-label="ניווט צד"] a[href="/write"]', text: "פעולה משלכם: עורך עם שלבים, שמירה אוטומטית וגרסאות." },
  { sel: 'nav[aria-label="ניווט צד"] a[href="/plan"]', text: "תכנון תקופתי: רואים אילו ערכים כיסיתם ומה חסר." },
  { sel: 'nav[aria-label="ניווט צד"] a[href="/calendar"]', text: "ביומן הכול מתוזמן. פעולה עם תאריך תופיע בבית במסך 'היום'." },
  { text: "ובשטח: פתחו פעולה ולחצו 'מצב במה'. יום מצוין, ובהצלחה בפעולה!" },
];

const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

export function Mascot() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [off, setOff] = useState(true); // מתחילים מוסתר, כדי לא להבהב לפני שנקרא ההעדפה
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<EagleMood>("idle");
  const [flash, setFlash] = useState("");
  const [seen, setSeen] = useState<string[]>([]);
  const [tour, setTour] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOff(storageGet(MASCOT_KEY) === "off");
    try {
      setSeen(JSON.parse(storageGet("scout.mascot.seen") ?? "[]"));
    } catch {
      setSeen([]);
    }
    const sync = () => setOff(storageGet(MASCOT_KEY) === "off");
    window.addEventListener("scout:mascot", sync);
    return () => window.removeEventListener("scout:mascot", sync);
  }, []);

  // חגיגה
  useEffect(() => {
    let t: number | undefined;
    const cheer = () => {
      setMood("cheer");
      setFlash("כל הכבוד! 🎉");
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        setMood("idle");
        setFlash("");
      }, 3200);
    };
    window.addEventListener("scout:celebrate", cheer);
    return () => {
      window.removeEventListener("scout:celebrate", cheer);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const tip = TIPS.find((t) => t.match.test(pathname));
  const fresh = !!tip && !seen.includes(tip.id);
  const markSeen = useCallback(() => {
    if (!tip || seen.includes(tip.id)) return;
    const n = [...seen, tip.id];
    setSeen(n);
    storageSet("scout.mascot.seen", JSON.stringify(n));
  }, [tip, seen]);

  // סיור: מיקום הזרקור
  useEffect(() => {
    if (tour === null) return;
    const step = TOUR[tour];
    const place = () => {
      const el = step.sel ? document.querySelector(step.sel) : null;
      if (visible(el)) {
        el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        setRect(el.getBoundingClientRect());
      } else setRect(null);
    };
    place();
    const t = window.setTimeout(place, 320);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    nextBtn.current?.focus();
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [tour]);

  const endTour = useCallback(() => {
    setTour(null);
    setRect(null);
    storageSet("scout.tour.lux", "1");
    btn.current?.focus();
  }, []);

  useEffect(() => {
    if (tour === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour();
      else if (e.key === "ArrowLeft") setTour((i) => (i === null ? i : Math.min(TOUR.length - 1, i + 1)));
      else if (e.key === "ArrowRight") setTour((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tour, endTour]);

  if (off) return null;

  const startTour = () => {
    setOpen(false);
    if (pathname !== "/") router.push("/");
    setTour(0);
  };

  const step = tour !== null ? TOUR[tour] : null;

  return (
    <>
      <div className="lux-mascot no-print">
        {flash && (
          <p className="lux-mascot-flash" role="status">
            {flash}
          </p>
        )}
        {open && tour === null && (
          <div className="lux-mascot-panel" role="dialog" aria-label="מעוז, העוזר שלכם" aria-modal="false">
            <p>{tip?.text ?? "אני מעוז. אפשר לשאול אותי על כל מסך באתר דרך הסיור."}</p>
            <div className="actions">
              <button type="button" className="btn btn-small btn-primary" onClick={startTour}>
                סיור באתר
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  storageSet(MASCOT_KEY, "off");
                  setOff(true);
                }}
              >
                הסתרת הנשר
              </button>
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                סגירה
              </button>
            </div>
          </div>
        )}
        <button
          ref={btn}
          type="button"
          className={`lux-mascot-btn ${fresh ? "has-tip" : ""}`}
          aria-expanded={open}
          aria-label={fresh ? "מעוז, העוזר שלכם. יש טיפ חדש" : "מעוז, העוזר שלכם"}
          onClick={() => {
            setOpen((o) => !o);
            markSeen();
            setMood(open ? "idle" : "wave");
            window.setTimeout(() => setMood((m) => (m === "wave" ? "idle" : m)), 1600);
          }}
        >
          <Eagle mood={mood} size={52} />
        </button>
      </div>

      {step && (
        <div className="lux-tour" role="dialog" aria-modal="false" aria-label={`סיור באתר, שלב ${tour! + 1} מתוך ${TOUR.length}`}>
          {rect ? <div className="lux-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden="true" /> : <div className="lux-dim" aria-hidden="true" />}
          <div className={`lux-tour-card ${rect ? "" : "is-center"}`} style={rect && rect.top > innerHeight / 2 ? { top: "auto", bottom: 24 } : undefined}>
            <Eagle mood={tour === TOUR.length - 1 ? "cheer" : "idle"} size={64} />
            <div>
              <p className="lux-tour-count">
                {tour! + 1} מתוך {TOUR.length}
              </p>
              <p>{step.text}</p>
              <div className="actions">
                {tour! > 0 && (
                  <button type="button" className="btn btn-small" onClick={() => setTour(tour! - 1)}>
                    הקודם
                  </button>
                )}
                <button ref={nextBtn} type="button" className="btn btn-small btn-primary" onClick={() => (tour! >= TOUR.length - 1 ? endTour() : setTour(tour! + 1))}>
                  {tour! >= TOUR.length - 1 ? "סיום" : "הבא"}
                </button>
                {tour! < TOUR.length - 1 && (
                  <button type="button" className="btn btn-small" onClick={endTour}>
                    דילוג
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

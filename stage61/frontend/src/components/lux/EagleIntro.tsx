"use client";

// שלב 61: אנימציית הנשר הפותחת ("מעוז מציג"). נשר מתעופף מעל נוף, ומציג תחנה אחרי תחנה את כל מה שיש באתר.
// נגישות: דיאלוג עם פוקוס ו-Esc, כפתור "דלגו" בולט, השהיה, ניווט בחצים, והכרזות לקורא מסך.
// במצב "תנועה רגועה" (או prefers-reduced-motion) אין טיסה ואין התקדמות אוטומטית: מעבר ידני בין התחנות.
import Link from "next/link";
import { Accessibility, Activity, BookOpen, CalendarDays, ChevronLeft, ChevronRight, FileDown, Pause, PenLine, Play, Presentation, Route, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { INTRO_STATIONS, type IntroStation } from "@/lib/lux/intro";
import { calmMotion } from "@/lib/lux/motion";
import { useAuth } from "../Providers";
import { Eagle } from "./illus";

const ICON: Record<IntroStation["icon"], ReactNode> = {
  sparkles: <Sparkles size={34} aria-hidden="true" />,
  book: <BookOpen size={34} aria-hidden="true" />,
  calendar: <CalendarDays size={34} aria-hidden="true" />,
  stage: <Presentation size={34} aria-hidden="true" />,
  export: <FileDown size={34} aria-hidden="true" />,
  route: <Route size={34} aria-hidden="true" />,
  chart: <Activity size={34} aria-hidden="true" />,
  pen: <PenLine size={34} aria-hidden="true" />,
  access: <Accessibility size={34} aria-hidden="true" />,
};

// פסאודו-אקראי קבוע: אותו נוף בכל פעם, בלי תלות ב-Math.random
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
function ridgePath(seed: number, base: number, amp: number): string {
  const H = 300;
  const pts: string[] = [];
  for (let x = 0; x <= 2400; x += 30) {
    const y = H - (base + amp * (0.55 * Math.sin((2 * Math.PI * x) / 1200 + seed) + 0.3 * Math.sin((4 * Math.PI * x) / 1200 + seed * 2.3) + 0.15 * Math.sin((10 * Math.PI * x) / 1200 + seed * 4.1)));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M0,${H} L${pts.join(" L")} L2400,${H} Z`;
}
const STAR_N = 46;
const EMBER_N = 16;
const CONF_N = 30;
const CONF_COL = ["#f97316", "#a78bfa", "#facc15", "#34d399", "#60a5fa", "#f472b6"];

export function EagleIntro({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const calm = useMemo(() => calmMotion(), []);
  const S = INTRO_STATIONS.length;
  const last = S + 1;
  const [i, setI] = useState(0); // 0 = כניסה, 1..S = תחנות, S+1 = סיום
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(calm);
  const [hover, setHover] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);

  const go = useCallback(
    (n: number) => {
      setI((cur) => {
        const t = Math.max(0, Math.min(last, n));
        setDir(t >= cur ? 1 : -1);
        return t;
      });
    },
    [last],
  );
  const close = useCallback(() => {
    if (calm) return onClose();
    setLeaving(true);
    window.setTimeout(onClose, 320);
  }, [calm, onClose]);

  // התקדמות אוטומטית (רק כשלא מושהה, ולא כשהסמן על הכרטיס)
  const dur = i === 0 ? 4200 : 4200;
  useEffect(() => {
    if (paused || hover || i >= last) return;
    const t = window.setTimeout(() => go(i + 1), dur);
    return () => window.clearTimeout(t);
  }, [i, paused, hover, last, go, dur]);

  // דיאלוג: נעילת גלילה, השבתת שאר הדף, פוקוס וחזרה אליו
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.documentElement.classList.add("eg-open");
    const me = root.current;
    const others = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== me && !el.hasAttribute("inert") && el.tagName !== "SCRIPT");
    others.forEach((el) => el.setAttribute("inert", ""));
    skip.current?.focus();
    return () => {
      document.documentElement.classList.remove("eg-open");
      others.forEach((el) => el.removeAttribute("inert"));
      prev?.focus?.();
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(i - 1);
    } else if (e.key === "Tab" && root.current) {
      const f = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const a = f[0];
      const b = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    }
  };

  const ridges = useMemo(() => [ridgePath(0.4, 70, 38), ridgePath(2.1, 40, 30), ridgePath(4.0, 18, 22)], []);
  const st = i >= 1 && i <= S ? INTRO_STATIONS[i - 1] : null;
  const say = i === 0 ? "שלום, אני מעוז הנשר. אציג לכם מה יש באתר." : st ? `תחנה ${i} מתוך ${S}: ${st.title}. ${st.text}` : "זה הכול. אפשר להתחיל.";
  const running = !paused && !hover && !calm && i < last;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={root} className={`eg-intro ${calm ? "calm" : ""} ${leaving ? "leaving" : ""}`} role="dialog" aria-modal="true" aria-labelledby="eg-title" aria-describedby="eg-live" onKeyDown={onKey}>
      <div className="eg-sky" aria-hidden="true">
        {Array.from({ length: STAR_N }, (_, k) => (
          <i key={k} className="eg-star" style={{ left: `${rnd(k + 1) * 100}%`, top: `${rnd(k + 91) * 62}%`, ["--s" as string]: 1 + rnd(k + 5) * 2.2, ["--t" as string]: `${2 + rnd(k + 33) * 4}s`, ["--d" as string]: `${rnd(k + 9) * 4}s` }} />
        ))}
        <span className="eg-orb" />
        {ridges.map((d, k) => (
          <svg key={k} className={`eg-ridge r${k + 1}`} viewBox="0 0 2400 300" preserveAspectRatio="none">
            <path d={d} />
          </svg>
        ))}
        {Array.from({ length: EMBER_N }, (_, k) => (
          <b key={k} className="eg-ember" style={{ left: `${6 + rnd(k + 50) * 88}%`, ["--d" as string]: `${rnd(k + 8) * 6}s`, ["--t" as string]: `${5 + rnd(k + 20) * 5}s`, ["--x" as string]: `${(rnd(k + 70) - 0.5) * 80}px` }} />
        ))}
      </div>

      {i === 0 && (
        <svg className="eg-swoop" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1080 -60 C 780 40, 700 380, 520 330 S 330 200, 470 250" pathLength="1" />
        </svg>
      )}

      <header className="eg-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-maoz.png" alt="" width={44} height={44} />
        <span>שבט מעוז מציג</span>
        <button ref={skip} type="button" className="eg-skip" onClick={close}>
          <X size={16} aria-hidden="true" /> {i >= last ? "סגירה" : "דלגו"}
        </button>
      </header>

      <div className="eg-stage" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
        <div className={`eg-eagle ${i === 0 ? "enter" : "hop"}`} key={`e${i}`}>
          <Eagle mood={i >= last ? "cheer" : i === 0 ? "wave" : "idle"} size={170} />
          <span className="eg-shadow" aria-hidden="true" />
        </div>

        {i === 0 && (
          <div className={`eg-card eg-hello ${dir > 0 ? "fwd" : "back"}`} key="hello">
            <h1 id="eg-title">
              <span>מחולל</span> <span>הפעולות</span>
            </h1>
            <p>היי, אני מעוז. בואו אראה לכם מה יש כאן, בסיור של חצי דקה.</p>
            <button type="button" className="eg-cta" onClick={() => go(1)}>
              יוצאים לדרך
            </button>
          </div>
        )}
        {st && (
          <article className={`eg-card ${dir > 0 ? "fwd" : "back"}`} key={st.id} aria-labelledby="eg-title">
            <span className="eg-medal" aria-hidden="true">
              <i className="ring" />
              {ICON[st.icon]}
            </span>
            <p className="eg-step">
              תחנה {i} מתוך {S}
            </p>
            <h2 id="eg-title">{st.title}</h2>
            <p>{st.text}</p>
            {user ? (
              <Link href={st.href} className="eg-link" onClick={close}>
                לעמוד הזה
              </Link>
            ) : (
              <p className="eg-hint">זמין אחרי כניסה לחשבון</p>
            )}
          </article>
        )}
        {i >= last && (
          <div className="eg-card eg-end fwd" key="end">
            <div className="eg-conf" aria-hidden="true">
              {Array.from({ length: CONF_N }, (_, k) => (
                <i key={k} style={{ left: `${rnd(k + 3) * 100}%`, background: CONF_COL[k % CONF_COL.length], ["--d" as string]: `${rnd(k + 17) * 1.2}s`, ["--r" as string]: `${rnd(k + 41) * 720 - 360}deg`, ["--x" as string]: `${(rnd(k + 61) - 0.5) * 160}px` }} />
              ))}
            </div>
            <h2 id="eg-title">זה הכול. בהצלחה בפעולות!</h2>
            <p>אפשר לחזור לסיור הזה בכל רגע מהגדרות המראה, או מהנשר שבפינה.</p>
            <div className="eg-end-actions">
              <button type="button" className="eg-cta" onClick={close}>
                בואו נתחיל
              </button>
              <button type="button" className="eg-ghost" onClick={() => go(0)}>
                שוב מההתחלה
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="eg-ctrl">
        <button type="button" className="eg-btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="תחנה קודמת">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <ol className="eg-dots" aria-label="התקדמות הסיור">
          {Array.from({ length: S + 2 }, (_, k) => (
            <li key={k} className={k < i ? "done" : k === i ? "on" : ""} style={{ ["--dur" as string]: `${dur}ms` }}>
              <button type="button" onClick={() => go(k)} aria-label={k === 0 ? "פתיחה" : k > S ? "סיום" : `תחנה ${k}: ${INTRO_STATIONS[k - 1].title}`} aria-current={k === i ? "step" : undefined}>
                <span className={k === i && running ? "fill" : ""} />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="eg-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? "המשך ניגון אוטומטי" : "השהיית הניגון האוטומטי"}>
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="eg-btn" onClick={() => go(i + 1)} disabled={i >= last} aria-label="תחנה הבאה">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      </footer>
      <p id="eg-live" className="sr-only" role="status" aria-live="polite">
        {say}
      </p>
    </div>,
    document.body,
  );
}

"use client";

// שלב 61 (רעיון 17): "סיכום השנה" כסיפור של כרטיסים: אישי, ולצידו סיכום שבטי של מונים בלבד (בלי שמות).
// אין ניגון אוטומטי כברירת מחדל: מי שרוצה מפעיל. ניווט בחצים, בנקודות ובמקלדת.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { calmMotion, useCountUp } from "@/lib/lux/motion";
import { useAuth, useToast } from "../Providers";
import { PageTitle, Skeleton } from "../ui";
import { Eagle, EmptyState, type EagleMood } from "./illus";

interface Mix {
  label: string;
  n: number;
  minutes?: number;
}
interface W {
  year: number;
  from: string;
  to: string;
  asOf: string;
  total: number;
  activeDays: number;
  minutes: number;
  authored: number;
  topValue: Mix | null;
  topMethod: Mix | null;
  values: Mix[];
  methods: Mix[];
  bestWeekday: { name: string; n: number } | null;
  bestMonth: { name: string; n: number } | null;
  bestStreakWeeks: number;
  avgRating: number | null;
  firstDate: string | null;
  highlights: { title: string; date: string; rating: number | null }[];
}
interface Tribe {
  year: number;
  hidden: boolean;
  minGuides?: number;
  guides?: number;
  total?: number;
  minutes?: number;
  authored?: number;
  values?: Mix[];
  methods?: Mix[];
}

const hours = (m: number) => Math.round((m / 60) * 10) / 10;
const he = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("he-IL", { day: "numeric", month: "long", timeZone: "UTC" });

function Big({ n, dec = 0 }: { n: number; dec?: number }) {
  const v = useCountUp(Math.round(n * 10 ** dec));
  return <b className="wr-big">{(v / 10 ** dec).toLocaleString("he-IL", { minimumFractionDigits: dec, maximumFractionDigits: dec })}</b>;
}

interface Slide {
  id: string;
  mood: EagleMood;
  body: React.ReactNode;
}

function buildSlides(w: W): Slide[] {
  const s: Slide[] = [
    {
      id: "intro",
      mood: "wave",
      body: (
        <>
          <p className="wr-kicker">הסיכום שלכם</p>
          <h2 className="wr-title">שנת הצופים {w.year} עד {w.year + 1}</h2>
          <p>נעבור יחד על מה שעשיתם עד {he(w.asOf)}. מוכנים?</p>
        </>
      ),
    },
    {
      id: "total",
      mood: "cheer",
      body: (
        <>
          <p className="wr-kicker">התקיימו</p>
          <Big n={w.total} />
          <p className="wr-sub">פעולות, ב-{w.activeDays} ימים שונים</p>
          {w.minutes > 0 && <p>כ-{hours(w.minutes)} שעות עם החניכים.</p>}
        </>
      ),
    },
  ];
  if (w.topValue)
    s.push({
      id: "value",
      mood: "idle",
      body: (
        <>
          <p className="wr-kicker">הערך שליווה אתכם</p>
          <h2 className="wr-title">{w.topValue.label}</h2>
          <p>{w.topValue.n} פעולות סביב הערך הזה.</p>
          {w.values.length > 1 && <p className="wr-mini">אחריו: {w.values.slice(1, 4).map((v) => `${v.label} (${v.n})`).join(", ")}</p>}
        </>
      ),
    });
  if (w.topMethod)
    s.push({
      id: "method",
      mood: "think",
      body: (
        <>
          <p className="wr-kicker">המתודה האהובה</p>
          <h2 className="wr-title">{w.topMethod.label}</h2>
          <p>
            הופיעה ב-{w.topMethod.n} פעולות
            {w.topMethod.minutes ? `, כ-${w.topMethod.minutes} דקות בסך הכול` : ""}.
          </p>
          {w.methods.length > 1 && <p className="wr-mini">אחריה: {w.methods.slice(1, 4).map((v) => `${v.label} (${v.n})`).join(", ")}</p>}
        </>
      ),
    });
  if (w.bestWeekday || w.bestStreakWeeks > 1)
    s.push({
      id: "rhythm",
      mood: "idle",
      body: (
        <>
          <p className="wr-kicker">הקצב שלכם</p>
          {w.bestWeekday && (
            <p className="wr-line">
              יום <b>{w.bestWeekday.name}</b> הוא היום הפעיל ביותר ({w.bestWeekday.n})
            </p>
          )}
          {w.bestMonth && (
            <p className="wr-line">
              החודש העמוס: <b>{w.bestMonth.name}</b> ({w.bestMonth.n})
            </p>
          )}
          {w.bestStreakWeeks > 1 && (
            <p className="wr-line">
              הרצף הארוך: <b>{w.bestStreakWeeks}</b> שבועות ברצף
            </p>
          )}
        </>
      ),
    });
  if (w.authored > 0 || w.avgRating !== null)
    s.push({
      id: "made",
      mood: "cheer",
      body: (
        <>
          <p className="wr-kicker">יצירה ומשוב</p>
          {w.authored > 0 && (
            <p className="wr-line">
              יצרתם <b>{w.authored}</b> פעולות חדשות
            </p>
          )}
          {w.avgRating !== null && (
            <p className="wr-line">
              דירוג ממוצע שנתתם לפעולות: <b>{w.avgRating.toLocaleString("he-IL")}</b> מתוך 5
            </p>
          )}
        </>
      ),
    });
  if (w.highlights.length)
    s.push({
      id: "hl",
      mood: "idle",
      body: (
        <>
          <p className="wr-kicker">רגעים בולטים</p>
          <ol className="wr-hl">
            {w.highlights.map((h, i) => (
              <li key={i}>
                <b>{h.title}</b>
                <span>
                  {he(h.date)}
                  {h.rating ? ` · ${"★".repeat(h.rating)}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </>
      ),
    });
  return s;
}

const summaryText = (w: W) =>
  [
    `סיכום שנת הצופים ${w.year} עד ${w.year + 1}`,
    `${w.total} פעולות ב-${w.activeDays} ימים${w.minutes ? `, כ-${hours(w.minutes)} שעות` : ""}`,
    w.topValue ? `ערך מוביל: ${w.topValue.label} (${w.topValue.n})` : "",
    w.topMethod ? `מתודה אהובה: ${w.topMethod.label} (${w.topMethod.n})` : "",
    w.bestStreakWeeks > 1 ? `רצף ארוך: ${w.bestStreakWeeks} שבועות` : "",
    "נוצר ב״מחולל פעולות״ של שבט מעוז",
  ]
    .filter(Boolean)
    .join("\n");

function Story({ w }: { w: W }) {
  const toast = useToast();
  const slides = useMemo(() => buildSlides(w), [w]);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const [dir, setDir] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const total = slides.length + 1; // + שקופית סיום
  const go = useCallback((n: number) => {
    setI((cur) => {
      const t = Math.max(0, Math.min(total - 1, n));
      setDir(t >= cur ? 1 : -1);
      return t;
    });
  }, [total]);
  useEffect(() => {
    if (!auto || calmMotion()) return;
    if (i >= total - 1) {
      setAuto(false);
      return;
    }
    const t = window.setTimeout(() => go(i + 1), 5500);
    return () => window.clearTimeout(t);
  }, [auto, i, total, go]);

  // חיצים עובדים בכל מקום בעמוד (חוץ משדות קלט ותפריטים), לא רק כשהסיפור בפוקוס. כיוון RTL: שמאלה = קדימה
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || t?.closest("input, textarea, select, [role='tab'], [contenteditable='true']")) return;
      if (e.key === "ArrowLeft") go(i + 1);
      else if (e.key === "ArrowRight") go(i - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, i]);
  const last = i === total - 1;
  const cur = slides[i];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(w));
      toast("הסיכום הועתק", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. אפשר להדפיס במקום", { kind: "error" });
    }
  };

  return (
    <div className="lux-wrap" ref={box} role="group" aria-roledescription="סיפור" aria-label={`סיכום השנה, שקופית ${i + 1} מתוך ${total}`} tabIndex={0}>
      <ol className="wr-prog" aria-hidden="true">
        {Array.from({ length: total }, (_, k) => (
          <li key={k} className={k < i ? "done" : k === i ? "on" : ""}>
            <button type="button" tabIndex={-1} onClick={() => go(k)} aria-label={`לשקופית ${k + 1}`} />
          </li>
        ))}
      </ol>
      <div className={`wr-slide ${dir > 0 ? "fwd" : "back"}`} key={i} aria-live="polite">
        <div className="wr-eagle" aria-hidden="true">
          <Eagle mood={last ? "cheer" : cur.mood} size={96} />
        </div>
        {last ? (
          <>
            <p className="wr-kicker">תודה על שנה מדהימה</p>
            <h2 className="wr-title">המשיכו כך!</h2>
            <p>לפעמים מספר אחד לא מספר את כל הסיפור. מה שחשוב הוא החניכים שפגשתם.</p>
            <div className="actions wr-actions">
              <button type="button" className="btn btn-primary" onClick={copy}>
                העתקת הסיכום
              </button>
              <button type="button" className="btn" onClick={() => window.print()}>
                הדפסה
              </button>
              <button type="button" className="btn" onClick={() => go(0)}>
                מההתחלה
              </button>
            </div>
          </>
        ) : (
          cur.body
        )}
      </div>
      <div className="wr-nav no-print">
        <button type="button" className="btn btn-small" onClick={() => go(i - 1)} disabled={i === 0} aria-label="שקופית קודמת">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-small" onClick={() => setAuto((a) => !a)} aria-pressed={auto}>
          {auto ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} {auto ? "עצירה" : "ניגון אוטומטי"}
        </button>
        <button type="button" className="btn btn-small" onClick={() => go(i + 1)} disabled={last} aria-label="שקופית הבאה">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      </div>
      <pre className="wr-print" aria-hidden="true">
        {summaryText(w)}
      </pre>
    </div>
  );
}

function TribeView({ t }: { t: Tribe }) {
  if (t.hidden)
    return (
      <p className="card glass" role="status">
        הסיכום השבטי יוצג כשיהיו לפחות {t.minGuides} מדריכים פעילים בשבט. זה כדי שלא יהיה אפשר לזהות פעילות של אדם אחד.
      </p>
    );
  const bars = (list: Mix[] = []) => {
    const max = Math.max(...list.map((x) => x.n), 1);
    return (
      <ul className="lux-hbars">
        {list.map((x) => (
          <li key={x.label}>
            <span>{x.label}</span>
            <i style={{ width: `${(x.n / max) * 100}%` }} />
            <b>{x.n}</b>
          </li>
        ))}
      </ul>
    );
  };
  return (
    <div className="lux-ins">
      <div className="lux-counters">
        <div className="lux-counter card glass">
          <b>{t.guides}</b>
          <span>מדריכים פעילים</span>
        </div>
        <div className="lux-counter card glass">
          <b>{t.total}</b>
          <span>פעולות שהתקיימו</span>
        </div>
        <div className="lux-counter card glass">
          <b>{hours(t.minutes ?? 0)}</b>
          <span>שעות עם החניכים</span>
        </div>
        <div className="lux-counter card glass">
          <b>{t.authored}</b>
          <span>פעולות חדשות שנכתבו</span>
        </div>
      </div>
      <div className="lux-ins-grid">
        <section className="card glass" aria-labelledby="tr-v">
          <h2 id="tr-v" className="section-title">
            הערכים של השבט
          </h2>
          {bars(t.values)}
        </section>
        <section className="card glass" aria-labelledby="tr-m">
          <h2 id="tr-m" className="section-title">
            המתודות של השבט
          </h2>
          {bars(t.methods)}
        </section>
      </div>
      <p className="hint">המספרים מצטברים מכל המדריכים, בלי שמות ובלי פירוט לפי אדם.</p>
    </div>
  );
}

export function Wrapped() {
  const { token } = useAuth();
  const [w, setW] = useState<W | null>(null);
  const [t, setT] = useState<Tribe | null>(null);
  const [tab, setTab] = useState<"me" | "tribe">("me");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    api<W>("/api/lux/wrapped", { token })
      .then(setW)
      .catch((e) => setError(errorMessage(e)));
  }, [token]);
  useEffect(() => {
    if (tab !== "tribe" || t || !token) return;
    api<Tribe>("/api/lux/wrapped/tribe", { token })
      .then(setT)
      .catch((e) => setError(errorMessage(e)));
  }, [tab, t, token]);

  if (!token) return <p className="card">צריך להתחבר כדי לראות את סיכום השנה.</p>;
  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!w) return <Skeleton lines={6} />;

  return (
    <div className="lux-wrapped">
      <PageTitle lead="הסיפור של השנה שלכם, מהנתונים שכבר קיימים באתר.">סיכום השנה</PageTitle>
      <div className="actions no-print" role="tablist" aria-label="סוג הסיכום">
        {(["me", "tribe"] as const).map((k) => (
          <button key={k} type="button" role="tab" id={`wr-tab-${k}`} aria-selected={tab === k} aria-controls="wr-panel" className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {k === "me" ? "הסיכום שלי" : "סיכום השבט"}
          </button>
        ))}
      </div>
      <div id="wr-panel" role="tabpanel" aria-labelledby={`wr-tab-${tab}`}>
        {tab === "me" ? (
          w.total === 0 ? (
            <EmptyState kind="compass" title="עוד אין מה לסכם" text="אחרי שפעולות יתקיימו (בתאריך שתזמנתם ביומן), הסיכום יתמלא.">
              <Link className="btn btn-primary" href="/calendar">
                ליומן הפעולות
              </Link>
            </EmptyState>
          ) : (
            <Story w={w} />
          )
        ) : t ? (
          <TribeView t={t} />
        ) : (
          <Skeleton lines={4} />
        )}
      </div>
    </div>
  );
}

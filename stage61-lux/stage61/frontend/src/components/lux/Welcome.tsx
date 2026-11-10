"use client";

// שלב 61 (רעיון 19): דף נחיתה ציבורי עם סיפור גלילה. צילומי המסך הם מהאתר עצמו, מנתוני דמו בלבד (בלי משתמשים אמיתיים).
// הנשר מלווה את הגלילה. במצב תנועה רגועה הוא עומד במקום והכול מופיע מיד.
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { replayIntro } from "@/lib/lux/intro";
import { calmMotion } from "@/lib/lux/motion";
import { Eagle } from "./illus";

interface Feature {
  id: string;
  title: string;
  text: string;
  bullets: string[];
  shot: string;
  alt: string;
}
const FEATURES: Feature[] = [
  { id: "gen", title: "פעולה שלמה בדקות", text: "כותבים נושא, ערך וגיל, בוחרים שיטות וזמנים, ומקבלים פעולה בחמישה שלבים שאפשר לייצא ל-Word.", bullets: ["חלוקת זמנים אוטומטית", "שיטות לפי גיל", "אפשר לערוך כל שלב"], shot: "home", alt: "מסך יצירת פעולה: טופס עם נושא, ערך, גיל ושיטות" },
  { id: "lib", title: "מאגר פעולות מוכן", text: "פעולות לפי גיל וערך. פותחים, מדרגים ומפעילים, וכל פעולה מקבלת כרזה משלה.", bullets: ["סינון לפי גיל, ערך ומשך", "כרזה אוטומטית לכל פעולה", "שיתוף עם תצוגה מקדימה יפה"], shot: "library", alt: "מאגר הפעולות: כרטיסים עם כרזה לכל פעולה" },
  { id: "stage", title: "מצב במה בשטח", text: "שלב אחד על המסך, טיימר גדול והתרעה כשהזמן נגמר. אפשר להקרין לכל הקבוצה.", bullets: ["טיימר טבעת ענק", "מצב מקרן עם QR", "עובד גם בלי חיבור יציב"], shot: "stage", alt: "מצב במה: שלב נוכחי בטקסט גדול וטיימר עגול" },
  { id: "trail", title: "מפת שביל השנה", text: "חגים, מחנות, טקסים והפעולות שלכם כתחנות על שביל אחד, מספטמבר עד אוגוסט.", bullets: ["תאריכי החגים מהלוח העברי", "סינון לפי סוג תחנה", "רשימה נגישה לכל חודש"], shot: "trail", alt: "מפת שביל השנה: שביל מתפתל עם תחנות לפי חודשים" },
  { id: "ins", title: "תובנות והסיכום של השנה", text: "מפת חום של הפעילות, ערכים ומתודות, וסיפור שנתי שאפשר לדפדף בו.", bullets: ["סיכום שבטי בלי שמות", "הכול מנתונים שכבר באתר", "גרפים עם חלופה טקסטואלית"], shot: "insights", alt: "תובנות: מפת חום שנתית, רדאר ערכים ותמהיל מתודות" },
  { id: "studio", title: "סטודיו ייצוא", text: "Word, PDF וכרטיסים בצבעי השבט, עם תצוגה מקדימה חיה לפני שמורידים.", bullets: ["לוגו וצבעים מהשבט", "כרטיסי הפעלה להדפסה", "ערכות נושא להדפסה"], shot: "studio", alt: "סטודיו ייצוא: תצוגה מקדימה של מסמך עם בחירת ערכת נושא" },
];
const STEPS = [
  ["1", "מתארים", "נושא, ערך וגיל."],
  ["2", "מקבלים", "פעולה שלמה בחמישה שלבים."],
  ["3", "מפעילים", "במצב במה, עם טיימר, בשטח."],
] as const;

export function Welcome() {
  const bird = useRef<HTMLDivElement>(null);
  const [calm, setCalm] = useState(true);

  useEffect(() => {
    const c = calmMotion();
    setCalm(c);
    const els = [...document.querySelectorAll<HTMLElement>(".wl-rev")];
    if (c || typeof IntersectionObserver === "undefined") {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    els.forEach((e) => io.observe(e));
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? window.scrollY / max : 0;
        if (bird.current) bird.current.style.transform = `translate(${Math.sin(p * Math.PI * 4) * 40}px, ${p * (window.innerHeight - 160)}px) rotate(${Math.cos(p * Math.PI * 4) * 8}deg)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="lux wl">
      {!calm && (
        <div className="wl-bird" ref={bird} aria-hidden="true">
          <Eagle mood="idle" size={84} />
        </div>
      )}
      <header className="wl-hero">
        <span className="lux-orb lux-orb-a" aria-hidden="true" />
        <span className="lux-orb lux-orb-b" aria-hidden="true" />
        <p className="lux-eyebrow">שבט מעוז</p>
        <h1 className="lux-title">מרעיון לפעולה מלאה, בדקות</h1>
        <p className="lead lux-lead">מחולל פעולות למדריכים: כותבים, מפעילים בשטח, מייצאים ומסכמים שנה. הכול בעברית, נגיש ופרטי.</p>
        <div className="actions wl-cta">
          <Link className="btn btn-primary" href="/login">
            כניסה לאתר
          </Link>
          <button type="button" className="btn" onClick={replayIntro}>
            לסיור עם הנשר
          </button>
          <Link className="btn" href="/library">
            לצפייה במאגר
          </Link>
        </div>
      </header>

      <section className="wl-steps wl-rev" aria-label="איך זה עובד">
        <ol>
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="card glass">
              <span className="n">{n}</span>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </section>

      {FEATURES.map((f, i) => (
        <section key={f.id} className={`wl-feat wl-rev ${i % 2 ? "alt" : ""}`} aria-labelledby={`wl-${f.id}`}>
          <div className="wl-copy">
            <h2 id={`wl-${f.id}`} className="section-title">
              {f.title}
            </h2>
            <p>{f.text}</p>
            <ul>
              {f.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <figure className="wl-frame">
            <div className="wl-bar" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <Image unoptimized src={`/shots/${f.shot}.webp`} alt={f.alt} width={1280} height={800} loading={i === 0 ? "eager" : "lazy"} sizes="(max-width: 900px) 94vw, 620px" />
            <figcaption className="sr-only">{f.alt}</figcaption>
          </figure>
        </section>
      ))}

      <section className="wl-trust wl-rev" aria-labelledby="wl-trust">
        <h2 id="wl-trust" className="section-title">
          פרטיות ונגישות
        </h2>
        <ul className="wl-trust-grid">
          <li className="card glass">
            <b>סיכום שבטי בלי שמות</b>
            <span>המספרים של השבט הם מונים מצטברים, ומוצגים רק כשיש לפחות שלושה מדריכים פעילים.</span>
          </li>
          <li className="card glass">
            <b>נגישות מובנית</b>
            <span>ניגודיות גבוהה, הגדלת טקסט, תנועה מופחתת, צבעים בטוחים לעיוורון צבעים והקראה בקול.</span>
          </li>
          <li className="card glass">
            <b>עובד בטלפון</b>
            <span>מותאם למסך קטן, וניתן להתקין כאפליקציה.</span>
          </li>
        </ul>
      </section>

      <section className="wl-end wl-rev">
        <Eagle mood="cheer" size={110} />
        <h2 className="section-title">מוכנים להתחיל?</h2>
        <Link className="btn btn-primary" href="/login">
          כניסה או הרשמה
        </Link>
      </section>
    </div>
  );
}

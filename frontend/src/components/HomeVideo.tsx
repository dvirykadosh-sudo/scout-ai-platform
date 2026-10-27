"use client";

import { useEffect, useRef, useState } from "react";
import { storageGet, storageSet } from "@/lib/api";

const STEPS = [
  "כותבים נושא, בוחרים גיל וערך מוביל.",
  "מסמנים שיטות, והזמן מתחלק לבד.",
  "מקבלים פעולה שלמה בחמישה שלבים.",
  "מייצאים ל-Word, מדפיסים או משתפים בלחיצה אחת.",
  "מעדיפים לכתוב לבד? עורך הכתיבה מציע שיטות ומראה מה חסר.",
  "בודקים קול, בטיחות והתאמה לגיל.",
  "מאגר פעולות מוכן, עם חיפוש לפי נושא.",
];

/** סרטון הסבר של דקה בדף הבית. מתנגן בלי קול, אפשר להשהות, להפעיל קול, ולהסתיר. */
export function HomeVideo() {
  const [hidden, setHidden] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setHidden(storageGet("scout.video.hidden") === "1");
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v || hidden) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }, { threshold: 0.5 });
    io.observe(v);
    return () => io.disconnect();
  }, [hidden]);
  const hide = () => { storageSet("scout.video.hidden", "1"); setHidden(true); };
  if (hidden) {
    return (
      <p className="hint">
        <button type="button" className="btn btn-small" onClick={() => { storageSet("scout.video.hidden", "0"); setHidden(false); }}>
          הצגת סרטון ההסבר (דקה)
        </button>
      </p>
    );
  }
  return (
    <section className="card glass home-video" aria-labelledby="hv-title">
      <h2 id="hv-title" className="section-title">איך משתמשים באתר: סרטון של דקה</h2>
      <video ref={ref} controls muted playsInline preload="metadata" poster="/intro-poster.jpg" aria-describedby="hv-steps">
        <source src="/intro.mp4" type="video/mp4" />
        <track kind="captions" src="/intro.vtt" srcLang="he" label="עברית" default />
      </video>
      <p className="hint">הסרטון מתנגן בלי קול. להפעלת הקריינות לחצו על סמל הרמקול.</p>
      <details>
        <summary>תמלול הסרטון</summary>
        <ol id="hv-steps">
          {STEPS.map((s) => (<li key={s}>{s}</li>))}
        </ol>
      </details>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={hide}>הסתרת הסרטון</button>
      </div>
    </section>
  );
}

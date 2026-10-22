"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { Skeleton } from "./ui";

const MIDOT = {
  d: { label: "מידה ד'", text: "הצופה רע לכל אדם ואח לכל צופה" },
  h: { label: "מידה ח'", text: "הצופה אינו נופל ברוחו ובצר לו מצטחק" },
};

interface Slide {
  kicker: string;
  title: string;
  body: string[];
  foot?: string;
}

function buildSlides(a: Activity): Slide[] {
  const slides: Slide[] = [
    { kicker: a.tribe, title: a.title, body: [`${a.ageGroup} · ${a.durationMin} דקות`, `ערך: ${a.leadingValue}`], foot: a.instructor ? `מדריך/ה: ${a.instructor}` : undefined },
  ];
  let at = 0;
  for (const s of a.stages) {
    slides.push({ kicker: `דקה ${at} · ${s.minutes} דקות · ${s.layer}`, title: s.name, body: s.content.split(/\n+/).filter(Boolean) });
    at += s.minutes;
  }
  slides.push({ kicker: "לסיום", title: "מה לוקחים מכאן", body: [a.conclusionNote || a.leadingValue, `${MIDOT.d.label}: ${MIDOT.d.text}`, `${MIDOT.h.label}: ${MIDOT.h.text}`] });
  return slides;
}

/** מצגת מסך מלא: שקופית לכל שלב. במקלדת: חצים, רווח, F למסך מלא. בהדפסה: שקופית בכל עמוד (שמירה כ-PDF). */
export function PresentMode() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [big, setBig] = useState(false);

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`)
      .then(setA)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "הפעולה לא נמצאה" : errorMessage(e)));
  }, [id]);

  const total = a ? a.stages.length + 2 : 0;
  const go = useCallback((n: number) => setI((cur) => Math.max(0, Math.min(total - 1, cur + n))), [total]);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      // בעברית "קדימה" הוא שמאלה
      if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowRight" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(total - 1);
      else if (e.key.toLowerCase() === "f") fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, total]);

  if (error)
    return (
      <div className="error-box" role="alert">
        <p>{error}</p>
        <Link href="/library">חזרה למאגר</Link>
      </div>
    );
  if (!a) return <Skeleton lines={4} />;
  const slides = buildSlides(a);

  return (
    <div className={`present ${big ? "present-big" : ""}`}>
      <div className="present-bar no-print">
        <Link className="btn btn-small" href={`/library/${a.id}`}>
          חזרה לפעולה
        </Link>
        <span aria-live="polite" role="status">
          שקופית {i + 1} מתוך {slides.length}
        </span>
        <span className="actions">
          <button type="button" className="btn btn-small" onClick={() => setBig(!big)} aria-pressed={big}>
            טקסט גדול
          </button>
          <button type="button" className="btn btn-small" onClick={fullscreen}>
            מסך מלא
          </button>
          <button type="button" className="btn btn-small" onClick={() => window.print()}>
            שמירה כ-PDF
          </button>
        </span>
      </div>
      {slides.map((s, n) => (
        <section key={n} className={`slide ${n === i ? "slide-on" : ""}`} aria-hidden={n === i ? undefined : true} aria-label={`שקופית ${n + 1}: ${s.title}`}>
          <p className="slide-kicker">{s.kicker}</p>
          {n === 0 ? <h1 className="slide-title">{s.title}</h1> : <h2 className="slide-title">{s.title}</h2>}
          {s.body.map((b) => (
            <p key={b} className="slide-text">
              {b}
            </p>
          ))}
          {s.foot && <p className="slide-foot">{s.foot}</p>}
        </section>
      ))}
      <div className="present-nav no-print">
        <button type="button" className="btn" onClick={() => go(-1)} disabled={i === 0}>
          הקודמת
        </button>
        <button type="button" className="btn btn-primary" onClick={() => go(1)} disabled={i === slides.length - 1}>
          הבאה
        </button>
      </div>
      <p className="hint no-print">מקשים: חץ שמאלה, רווח או PageDown קדימה. חץ ימינה אחורה. F למסך מלא.</p>
    </div>
  );
}

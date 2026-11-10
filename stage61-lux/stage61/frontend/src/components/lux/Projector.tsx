"use client";

// שלב 61 (רעיון 4): מצב מקרן למפקדה. טקסט ענק שנקרא מהקצה השני של החדר, קוד QR לפתיחה בטלפון, בלי רעש.
// הבקרים מופיעים רק בתנועת עכבר, העכבר נעלם אחרי שניות. שלט מצגות (חצים / PageUp / PageDown) עובד.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";

const clock = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

export function Projector() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [i, setI] = useState(-1); // -1 = שער
  const [qr, setQr] = useState("");
  const [time, setTime] = useState("");
  const [ui, setUi] = useState(true);
  const [black, setBlack] = useState(false);
  const hide = useRef<number | undefined>(undefined);

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`)
      .then(setA)
      .catch((e) => (e instanceof ApiError && e.status === 404 ? setNotFound(true) : setError(errorMessage(e))));
  }, [id]);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((Q) => Q.toDataURL(`${location.origin}/library/${id}`, { margin: 1, width: 640, color: { dark: "#12081f", light: "#ffffff" } }))
      .then((u) => alive && setQr(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    setTime(clock());
    const t = window.setInterval(() => setTime(clock()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  const poke = useCallback(() => {
    setUi(true);
    window.clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setUi(false), 2800);
  }, []);
  useEffect(() => {
    poke();
    return () => window.clearTimeout(hide.current);
  }, [poke]);

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* unsupported */
    }
  };

  const max = a ? a.stages.length - 1 : 0;
  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      poke();
      if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " " || e.key === "Enter") (e.preventDefault(), setI((x) => Math.min(max, x + 1)));
      else if (e.key === "ArrowRight" || e.key === "PageUp" || e.key === "Backspace") (e.preventDefault(), setI((x) => Math.max(-1, x - 1)));
      else if (e.key === "Home") setI(-1);
      else if (e.key === "End") setI(max);
      else if (e.key === "b" || e.key === "." || e.key === "ב") setBlack((x) => !x);
      else if (e.key === "f") void fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a, max, poke]);

  if (notFound)
    return (
      <div className="prj prj-center">
        <h1>הפעולה לא נמצאה</h1>
        <Link className="prj-btn" href="/library">
          חזרה למאגר
        </Link>
      </div>
    );
  if (error)
    return (
      <div className="prj prj-center" role="alert">
        <p>{error}</p>
      </div>
    );
  if (!a)
    return (
      <div className="prj prj-center" role="status" aria-busy="true">
        <span className="sr-only">טוען</span>
      </div>
    );

  const st = i >= 0 ? a.stages[i] : null;
  // גודל הגופן לפי אורך הטקסט, כדי שהכול ייכנס למסך בלי גלילה
  const len = st?.content.length ?? 0;
  const bodySize = len < 140 ? "clamp(2rem,4.6vw,4.4rem)" : len < 320 ? "clamp(1.6rem,3.4vw,3.2rem)" : "clamp(1.3rem,2.6vw,2.4rem)";

  return (
    <div className={`prj ${ui ? "" : "prj-idle"}`} onPointerMove={poke} onClick={(e) => (e.target as HTMLElement).closest("button,a") ? undefined : setI((x) => Math.min(max, x + 1))}>
      {black && <div className="prj-black" aria-label="מסך שחור. B או נקודה לחזרה" role="img" />}

      <header className="prj-top" aria-hidden={!ui}>
        <span className="prj-clock" dir="ltr">
          {time}
        </span>
        <span className="prj-brand">שבט מעוז</span>
      </header>

      {st === null ? (
        <main className="prj-main prj-cover">
          <div className="prj-cover-text">
            <p className="prj-kicker">{a.leadingValue}</p>
            <h1 className="prj-h1">{a.title}</h1>
            <ul className="prj-meta" aria-label="פרטי הפעולה">
              <li>{a.ageGroup}</li>
              <li>{a.durationMin} דקות</li>
              <li>{a.stages.length} שלבים</li>
            </ul>
            {!/^(אין|ללא)/.test(a.equipment.trim()) && (
              <p className="prj-gear">
                <strong>ציוד:</strong> {a.equipment}
              </p>
            )}
          </div>
          <figure className="prj-qr">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="קוד QR לפתיחת הפעולה בטלפון" width={320} height={320} />
            ) : (
              <div className="prj-qr-skel" />
            )}
            <figcaption>סרקו כדי לפתוח את הפעולה בטלפון</figcaption>
          </figure>
        </main>
      ) : (
        <main className="prj-main prj-stage" key={i}>
          <p className="prj-kicker">
            שלב {i + 1} מתוך {a.stages.length} · {st.minutes} דקות
          </p>
          <h1 className="prj-h1">{st.name}</h1>
          <p className="prj-body" style={{ fontSize: bodySize }}>
            {st.content}
          </p>
        </main>
      )}

      <footer className="prj-bar">
        <Link className="prj-btn" href={`/library/${a.id}`}>
          יציאה
        </Link>
        <button type="button" className="prj-btn" onClick={() => setI((x) => Math.max(-1, x - 1))} disabled={i < 0}>
          ‹ הקודם
        </button>
        <ol className="prj-dots" aria-label="שלבים">
          <li>
            <button type="button" className={i === -1 ? "on" : ""} onClick={() => setI(-1)} aria-label="שער" />
          </li>
          {a.stages.map((s, k) => (
            <li key={s.name + k}>
              <button type="button" className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`שלב ${k + 1}: ${s.name}`} />
            </li>
          ))}
        </ol>
        <button type="button" className="prj-btn" onClick={() => setI((x) => Math.min(max, x + 1))} disabled={i >= max}>
          הבא ›
        </button>
        <button type="button" className="prj-btn" onClick={() => setBlack(!black)} aria-pressed={black}>
          מסך שחור
        </button>
        <button type="button" className="prj-btn" onClick={fullscreen}>
          מסך מלא
        </button>
      </footer>
      <p className="sr-only" aria-live="polite">
        {st ? `שלב ${i + 1}: ${st.name}` : `שער: ${a.title}`}
      </p>
    </div>
  );
}

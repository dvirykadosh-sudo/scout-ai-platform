"use client";

// שלב 61 (רעיון 1 + 5): מצב במה. שלב אחד על המסך, טיימר טבעת ענק, החלקה בין שלבים, רטט וצלילים.
// בנוי כך שאפשר להפעיל אותו מהכיס, באור שמש, ביד אחת. מצב השטח הקיים (/field) נשאר כמו שהוא.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { buzz, chime, getSoundPrefs, isFireOn, setSoundPrefs, startFire, stopFire, unlock, whistle } from "@/lib/lux/sound";
import { Eagle } from "./illus";

const fmt = (sec: number): string => {
  const a = Math.abs(sec);
  return `${sec < 0 ? "+" : ""}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};
const R = 108;
const C = 2 * Math.PI * R;

export function StageMode() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [sound, setSound] = useState(false);
  const [fire, setFire] = useState(false);
  const [fs, setFs] = useState(false);
  const [showText, setShowText] = useState(true);
  const [drag, setDrag] = useState(0);

  const endAt = useRef(0);
  const alarmed = useRef(false);
  const warned = useRef(false);
  const wake = useRef<WakeLockSentinel | null>(null);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);

  const load = useCallback(() => {
    api<Activity>(`/api/activities/${id}`)
      .then((d) => {
        setA(d);
        let start = 0;
        try {
          const s = Number(sessionStorage.getItem(`scout.stage.${id}`));
          if (Number.isInteger(s) && s > 0 && s < d.stages.length) start = s;
        } catch {
          /* ignore */
        }
        setIdx(start);
        setRemaining(d.stages[start].minutes * 60);
        setError("");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(errorMessage(e));
      });
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    const p = getSoundPrefs();
    setSound(p.on);
    setFire(p.fire);
    const sync = () => {
      const n = getSoundPrefs();
      setSound(n.on);
      setFire(n.fire);
    };
    window.addEventListener("scout:sound", sync);
    return () => window.removeEventListener("scout:sound", sync);
  }, []);

  // מדורה ברקע: רק כשהצלילים דולקים, המדורה דולקת והטיימר רץ
  useEffect(() => {
    if (sound && fire && running && !done) startFire();
    else stopFire();
    return () => stopFire();
  }, [sound, fire, running, done]);

  // טיימר מבוסס חותמת זמן, לא נסחף כשהלשונית מוגבלת
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setRemaining(Math.round((endAt.current - Date.now()) / 1000)), 250);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!running || !a) return;
    if (remaining <= 60 && remaining > 0 && !warned.current && a.stages[idx].minutes >= 3) {
      warned.current = true;
      chime(false);
      buzz(60);
      setAnnounce("נשארה דקה אחרונה בשלב");
    }
    if (remaining <= 0 && !alarmed.current) {
      alarmed.current = true;
      whistle();
      buzz([320, 140, 320, 140, 320]);
      setAnnounce("הזמן לשלב הסתיים");
    }
  }, [remaining, running, a, idx]);

  // המסך נשאר דלוק בזמן ריצה
  useEffect(() => {
    const acquire = async () => {
      try {
        if (running && "wakeLock" in navigator) wake.current = await navigator.wakeLock.request("screen");
      } catch {
        /* unsupported */
      }
    };
    if (running) void acquire();
    const vis = () => document.visibilityState === "visible" && running && void acquire();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      wake.current?.release().catch(() => {});
      wake.current = null;
    };
  }, [running]);

  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const goTo = useCallback(
    (i: number, direction?: "next" | "prev") => {
      if (!a || i < 0 || i >= a.stages.length) return;
      const secs = a.stages[i].minutes * 60;
      setDir(direction ?? (i >= idx ? "next" : "prev"));
      setIdx(i);
      setRemaining(secs);
      alarmed.current = false;
      warned.current = false;
      endAt.current = Date.now() + secs * 1000;
      buzz(24);
      try {
        sessionStorage.setItem(`scout.stage.${id}`, String(i));
      } catch {
        /* ignore */
      }
      setAnnounce(`שלב ${i + 1} מתוך ${a.stages.length}: ${a.stages[i].name}, ${a.stages[i].minutes} דקות`);
    },
    [a, id, idx],
  );

  const finish = useCallback(() => {
    setRunning(false);
    setDone(true);
    buzz([60, 40, 60, 40, 200]);
    chime(true);
    window.dispatchEvent(new Event("scout:celebrate"));
    try {
      sessionStorage.removeItem(`scout.stage.${id}`);
    } catch {
      /* ignore */
    }
  }, [id]);

  const next = useCallback(() => {
    if (!a) return;
    if (idx >= a.stages.length - 1) finish();
    else goTo(idx + 1, "next");
  }, [a, idx, finish, goTo]);
  const prev = useCallback(() => goTo(idx - 1, "prev"), [goTo, idx]);

  const toggle = useCallback(() => {
    unlock();
    if (running) {
      setRunning(false);
      setAnnounce("הטיימר הושהה");
    } else {
      endAt.current = Date.now() + remaining * 1000;
      setRunning(true);
      setAnnounce("הטיימר הופעל");
      buzz(18);
    }
  }, [running, remaining]);

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* unsupported */
    }
  };

  // מקלדת. בעברית "קדימה" זה שמאלה.
  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" || e.key === "PageDown") (e.preventDefault(), next());
      else if (e.key === "ArrowRight" || e.key === "PageUp") (e.preventDefault(), prev());
      else if (e.key === " " && t?.tagName !== "BUTTON" && t?.tagName !== "A") (e.preventDefault(), toggle());
      else if (e.key === "f") void fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a, next, prev, toggle]);

  // החלקה: ימינה = שלב הבא (כיוון הקריאה בעברית), שמאלה = קודם
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = touch.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.4) setDrag(Math.max(-90, Math.min(90, dx / 2.2)));
  };
  const onUp = (e: React.PointerEvent) => {
    const s = touch.current;
    touch.current = null;
    setDrag(0);
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - s.t > 900) return;
    if (dx > 0) next();
    else prev();
  };

  if (notFound)
    return (
      <div className="stg stg-center">
        <h1>הפעולה לא נמצאה</h1>
        <Link className="stg-btn" href="/library">
          חזרה למאגר
        </Link>
      </div>
    );
  if (error)
    return (
      <div className="stg stg-center" role="alert">
        <p>{error}</p>
        <button type="button" className="stg-btn" onClick={load}>
          ניסיון חוזר
        </button>
      </div>
    );
  if (!a)
    return (
      <div className="stg stg-center" role="status" aria-busy="true">
        <div className="stg-ring-skel" />
        <span className="sr-only">טוען את הפעולה</span>
      </div>
    );

  if (done)
    return (
      <div className="stg stg-center stg-done">
        <Eagle mood="cheer" size={150} className="stg-eagle" title="הנשר מעוז חוגג" />
        <h1>כל הכבוד, הפעולה הסתיימה!</h1>
        <p>{a.title}</p>
        <div className="stg-actions">
          <Link className="stg-btn stg-btn-main" href={`/library/${a.id}#ratings`}>
            דירוג הפעולה
          </Link>
          <button
            type="button"
            className="stg-btn"
            onClick={() => {
              setDone(false);
              goTo(0, "prev");
            }}
          >
            התחלה מחדש
          </button>
          <Link className="stg-btn" href={`/library/${a.id}`}>
            חזרה לפעולה
          </Link>
        </div>
      </div>
    );

  const st = a.stages[idx];
  const total = st.minutes * 60;
  const frac = Math.min(1, Math.max(0, remaining / total));
  const last = idx === a.stages.length - 1;
  const phase = remaining < 0 ? "over" : remaining <= 10 ? "crit" : remaining <= 60 && total >= 180 ? "warn" : "ok";
  const hue = 262 - Math.round((idx / Math.max(1, a.stages.length - 1)) * 70); // סגול ← כתום לאורך הפעולה

  return (
    <div className={`stg stg-${phase}`} style={{ ["--stg-h" as string]: hue }}>
      <header className="stg-top">
        <Link className="stg-icon" href={`/library/${a.id}`} aria-label="יציאה ממצב במה">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <p className="stg-title">{a.title}</p>
        <div className="stg-tools" role="group" aria-label="הגדרות">
          <button
            type="button"
            className="stg-icon"
            aria-pressed={sound}
            aria-label={sound ? "כיבוי צלילים" : "הפעלת צלילים"}
            onClick={() => {
              unlock();
              setSoundPrefs({ on: !sound });
              if (!sound) chime(false);
            }}
          >
            {sound ? "🔔" : "🔕"}
          </button>
          {sound && (
            <button
              type="button"
              className="stg-icon"
              aria-pressed={fire}
              aria-label={fire ? "כיבוי מדורה" : "הדלקת מדורה ברקע"}
              onClick={() => setSoundPrefs({ fire: !fire })}
              title={isFireOn() ? "המדורה דולקת" : "מדורה ברקע בזמן ריצה"}
            >
              🔥
            </button>
          )}
          <button type="button" className="stg-icon" aria-pressed={fs} aria-label="מסך מלא" onClick={fullscreen}>
            ⛶
          </button>
        </div>
      </header>

      <ol className="stg-dots" aria-label="התקדמות בפעולה">
        {a.stages.map((s, i) => (
          <li key={s.name + i}>
            <button type="button" className={i === idx ? "on" : i < idx ? "past" : ""} aria-label={`שלב ${i + 1}: ${s.name}`} aria-current={i === idx ? "step" : undefined} onClick={() => goTo(i)} />
          </li>
        ))}
      </ol>

      <main className="stg-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => ((touch.current = null), setDrag(0))} style={{ touchAction: "pan-y" }}>
        <div key={idx} className={`stg-slide stg-in-${dir}`} style={{ transform: drag ? `translateX(${drag}px)` : undefined }}>
          <p className="stg-kicker">
            שלב {idx + 1} מתוך {a.stages.length}
          </p>
          <h1 className="stg-name">{st.name}</h1>

          <div className="stg-ring" role="timer" aria-label="זמן שנותר בשלב">
            <svg viewBox="0 0 240 240" aria-hidden="true">
              <circle className="stg-ring-bg" cx="120" cy="120" r={R} />
              <circle className="stg-ring-fg" cx="120" cy="120" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 120 120)" />
            </svg>
            <span dir="ltr" className="stg-time">
              {fmt(remaining)}
            </span>
          </div>

          {remaining <= 0 && (
            <p className="stg-over-msg" role="alert">
              {last ? "הזמן האחרון נגמר. אפשר לסיים." : "הזמן נגמר. אפשר להמשיך לשלב הבא."}
            </p>
          )}

          <button type="button" className="stg-textbtn" aria-expanded={showText} onClick={() => setShowText(!showText)}>
            {showText ? "הסתרת ההנחיות" : "הצגת ההנחיות"}
          </button>
          {showText && (
            <div className="stg-card">
              <p className="stg-layer">{st.layer}</p>
              <p className="stg-content">{st.content}</p>
            </div>
          )}
        </div>
      </main>

      <footer className="stg-bar">
        <button type="button" className="stg-btn stg-side" onClick={prev} disabled={idx === 0} aria-label="שלב קודם">
          ‹ קודם
        </button>
        <button type="button" className="stg-btn stg-btn-main stg-play" onClick={toggle}>
          {running ? "השהיה" : remaining < total ? "המשך" : "התחלה"}
        </button>
        <button type="button" className="stg-btn stg-side" onClick={next} aria-label={last ? "סיום הפעולה" : "שלב הבא"}>
          {last ? "סיום ✓" : "הבא ›"}
        </button>
      </footer>
      <p className="stg-hint" aria-hidden="true">
        אפשר גם להחליק ימינה לשלב הבא · רווח = התחלה/השהיה
      </p>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

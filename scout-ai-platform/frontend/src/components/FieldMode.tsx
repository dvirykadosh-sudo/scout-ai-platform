"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { useA11y } from "./Providers";
import { Skeleton } from "./ui";

const fmt = (sec: number): string => {
  const a = Math.abs(sec);
  const m = Math.floor(a / 60);
  const s = a % 60;
  return `${sec < 0 ? "+" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

type AudioCtor = typeof AudioContext;

export function FieldMode() {
  const { id } = useParams<{ id: string }>();
  const { highContrast, largeText, toggleContrast, toggleLarge } = useA11y();

  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [big, setBig] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const endAt = useRef(0);
  const alarmed = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // ───────── load ─────────
  const load = useCallback(() => {
    api<Activity>(`/api/activities/${id}`)
      .then((d) => {
        setA(d);
        setRemaining(d.stages[0].minutes * 60);
        setError("");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(errorMessage(e));
      });
  }, [id]);
  useEffect(load, [load]);

  // ───────── sound / vibration ─────────
  const ensureAudio = () => {
    try {
      if (!audio.current) {
        const AC: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        if (AC) audio.current = new AC();
      }
      void audio.current?.resume();
    } catch {
      /* sound unavailable */
    }
  };
  const alarm = useCallback(() => {
    try {
      navigator.vibrate?.([300, 150, 300, 150, 300]);
    } catch {
      /* ignore */
    }
    const ctx = audio.current;
    if (!ctx || mutedRef.current) return;
    try {
      [0, 0.4, 0.8].forEach((d) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        const t = ctx.currentTime + d;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.32);
      });
    } catch {
      /* ignore */
    }
  }, []);

  // ───────── timer (timestamp based, so it does not drift when the tab is throttled) ─────────
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setRemaining(Math.round((endAt.current - Date.now()) / 1000));
    }, 250);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!running || !a) return;
    const stage = a.stages[idx];
    if (remaining <= 0 && !alarmed.current) {
      alarmed.current = true;
      setTimeUp(true);
      alarm();
    } else if (remaining > 0 && remaining % 60 === 0 && remaining !== stage.minutes * 60) {
      setAnnounce(`נותרו ${remaining / 60} דקות בשלב`);
    }
  }, [remaining, running, a, idx, alarm]);

  // ───────── keep the screen on while running ─────────
  useEffect(() => {
    const acquire = async () => {
      try {
        if (running && "wakeLock" in navigator) wake.current = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed or unsupported */
      }
    };
    const release = () => {
      wake.current?.release().catch(() => {});
      wake.current = null;
    };
    if (running) void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible" && running) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      release();
    };
  }, [running]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ───────── actions ─────────
  const goTo = (i: number) => {
    if (!a) return;
    const st = a.stages[i];
    const secs = st.minutes * 60;
    setIdx(i);
    setRemaining(secs);
    setTimeUp(false);
    alarmed.current = false;
    endAt.current = Date.now() + secs * 1000; // continues automatically if the timer is already running
    setAnnounce(`שלב ${i + 1} מתוך ${a.stages.length}: ${st.name}, ${st.minutes} דקות`);
  };

  const toggle = () => {
    ensureAudio();
    if (running) {
      setRunning(false);
      setAnnounce("הטיימר הושהה");
    } else {
      endAt.current = Date.now() + remaining * 1000;
      setRunning(true);
      setAnnounce("הטיימר הופעל");
    }
  };

  const speak = (text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      if (synth.speaking) {
        synth.cancel();
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "he-IL";
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    } catch {
      setSpeaking(false);
    }
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not supported */
    }
  };

  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const onButton = t?.tagName === "BUTTON" || t?.tagName === "A";
      if (e.key === "n" && idx < a.stages.length - 1) goTo(idx + 1);
      else if (e.key === "p" && idx > 0) goTo(idx - 1);
      else if (e.key === " " && !onButton) {
        e.preventDefault();
        toggle();
      } else if (e.key === "r") speak(a.stages[idx].content);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ───────── render ─────────
  if (notFound)
    return (
      <div className="field-center card">
        <h1>הפעולה לא נמצאה</h1>
        <Link className="btn btn-primary" href="/library">
          חזרה למאגר
        </Link>
      </div>
    );
  if (error)
    return (
      <div className="field-center error-box" role="alert">
        <p>{error}</p>
        <button type="button" className="btn" onClick={load}>
          ניסיון חוזר
        </button>
      </div>
    );
  if (!a)
    return (
      <div className="field-center">
        <Skeleton lines={4} />
      </div>
    );

  const stage = a.stages[idx];
  const last = idx === a.stages.length - 1;
  const laterMin = a.stages.slice(idx + 1).reduce((s, x) => s + x.minutes, 0);
  const leftMin = Math.ceil(laterMin + Math.max(0, remaining) / 60);
  const pct = Math.min(100, Math.max(0, (1 - Math.max(0, remaining) / (stage.minutes * 60)) * 100));

  return (
    <div className={`field ${timeUp ? "time-up" : ""} ${big ? "field-big" : ""}`}>
      <header className="field-top">
        <Link className="btn btn-small" href={`/library/${a.id}`}>
          יציאה ממצב שטח
        </Link>
        <h1 className="field-title">{a.title}</h1>
        <div className="field-tools" role="group" aria-label="הגדרות תצוגה">
          <button type="button" className="a11y-btn" aria-pressed={muted} onClick={() => setMuted(!muted)}>
            השתקת צלצול
          </button>
          <button type="button" className="a11y-btn" aria-pressed={fullscreen} onClick={toggleFullscreen}>
            מסך מלא
          </button>
          <button type="button" className="a11y-btn" aria-pressed={big} onClick={() => setBig(!big)}>
            כפתורים ענקיים
          </button>
          <button type="button" className="a11y-btn" aria-pressed={highContrast} onClick={toggleContrast}>
            ניגודיות גבוהה
          </button>
          <button type="button" className="a11y-btn" aria-pressed={largeText} onClick={toggleLarge}>
            הגדלת טקסט
          </button>
        </div>
      </header>

      <nav aria-label="שלבי הפעולה">
        <ol className="field-steps">
          {a.stages.map((s, i) => (
            <li key={s.name} className={`${i < idx ? "done" : ""} ${i === idx ? "current" : ""}`}>
              <button type="button" aria-current={i === idx ? "step" : undefined} onClick={() => goTo(i)}>
                <span className="step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  {s.name}
                  <small>{s.minutes} דקות</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="field-main" aria-labelledby="field-stage">
        <h2 id="field-stage">
          שלב {idx + 1}: {stage.name}
        </h2>
        <p className="field-layer">{stage.layer}</p>

        <div className="field-timer" role="timer" aria-label="זמן שנותר בשלב">
          <span dir="ltr" className={remaining < 0 ? "over" : ""}>
            {fmt(remaining)}
          </span>
        </div>
        <div className="field-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        {timeUp && (
          <p className="field-alert" role="alert">
            {last ? "הזמן לשלב האחרון הסתיים. אפשר לסיים את הפעולה." : "הזמן לשלב הסתיים. אפשר לעבור לשלב הבא."}
          </p>
        )}

        <div className="field-controls">
          <button type="button" className="btn btn-primary field-btn" onClick={toggle}>
            {running ? "השהיה" : remaining < stage.minutes * 60 ? "המשך" : "התחלה"}
          </button>
          <button type="button" className="btn field-btn" onClick={() => goTo(idx)}>
            איפוס שלב
          </button>
          <button type="button" className="btn field-btn" aria-pressed={speaking} onClick={() => speak(stage.content)}>
            {speaking ? "עצירת ההקראה" : "הקראת השלב"}
          </button>
          <button type="button" className="btn field-btn" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
            שלב קודם
          </button>
          {last ? (
            <Link className="btn btn-primary field-btn" href={`/library/${a.id}#ratings`}>
              סיום ודירוג הפעולה
            </Link>
          ) : (
            <button type="button" className="btn btn-primary field-btn" onClick={() => goTo(idx + 1)}>
              שלב הבא
            </button>
          )}
        </div>

        <div className="field-content">{stage.content}</div>
      </section>

      <details className="field-keys">
        <summary>קיצורי מקלדת</summary>
        <p>רווח: התחלה והשהיה · N: שלב הבא · P: שלב קודם · R: הקראת השלב</p>
      </details>
      <p className="field-foot">
        נותרו בפעולה כ-{leftMin} דקות מתוך {a.durationMin}
      </p>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

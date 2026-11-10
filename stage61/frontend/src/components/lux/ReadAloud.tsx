"use client";

// שלב 61 (רעיון 20): הקראה בקול של תוכן העמוד, באמצעות הדפדפן (speechSynthesis). כפתור קטן וצף, רק למי שהפעיל באשף הנוחות.
// הקריאה מתקדמת פסקה אחרי פסקה, ומסמנת את הפסקה הנוכחית. אם במכשיר אין קול בעברית נאמר את זה ולא מנסים.
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readComfort } from "@/lib/lux/comfort";

const BLOCKS = "#main h1, #main h2, #main h3, #main p, #main li, #main .lead";

export function ReadAloud() {
  const path = usePathname();
  const [on, setOn] = useState(false);
  const [rate, setRate] = useState(1);
  const [state, setState] = useState<"idle" | "play" | "pause">("idle");
  const [note, setNote] = useState("");
  const idx = useRef(0);
  const list = useRef<HTMLElement[]>([]);
  const alive = useRef(false);

  useEffect(() => {
    const sync = () => {
      const c = readComfort();
      setOn(c.readAloud && typeof window !== "undefined" && "speechSynthesis" in window);
      setRate(c.rate);
    };
    sync();
    window.addEventListener("scout:comfort", sync);
    return () => window.removeEventListener("scout:comfort", sync);
  }, []);

  const clear = () => document.querySelectorAll(".lux-reading").forEach((e) => e.classList.remove("lux-reading"));
  const stop = useCallback(() => {
    alive.current = false;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    clear();
    setState("idle");
  }, []);
  useEffect(() => () => stop(), [path, stop]); // מחליפים עמוד: עוצרים

  const speakNext = useCallback(() => {
    if (!alive.current) return;
    const el = list.current[idx.current];
    if (!el) return stop();
    clear();
    el.classList.add("lux-reading");
    el.scrollIntoView({ block: "center", behavior: "auto" });
    const u = new SpeechSynthesisUtterance((el.textContent || "").replace(/\s+/g, " ").trim());
    u.lang = "he-IL";
    u.rate = rate;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith("he"));
    if (v) u.voice = v;
    u.onend = () => {
      idx.current += 1;
      speakNext();
    };
    u.onerror = () => stop();
    window.speechSynthesis.speak(u);
  }, [rate, stop]);

  const start = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length && !voices.some((v) => v.lang.toLowerCase().startsWith("he"))) {
      setNote("במכשיר הזה אין קול בעברית. אפשר להתקין קול עברי בהגדרות המערכת.");
      return;
    }
    setNote("");
    list.current = [...document.querySelectorAll<HTMLElement>(BLOCKS)].filter((e) => (e.textContent || "").trim().length > 1 && !e.closest("nav, [aria-hidden='true'], dialog, .no-print"));
    if (!list.current.length) return;
    idx.current = 0;
    alive.current = true;
    setState("play");
    speakNext();
  };
  const pause = () => {
    if (state === "play") {
      window.speechSynthesis.pause();
      setState("pause");
    } else {
      window.speechSynthesis.resume();
      setState("play");
    }
  };

  if (!on) return null;
  return (
    <div className="lux-readaloud no-print" role="region" aria-label="הקראת העמוד">
      {state === "idle" ? (
        <button type="button" className="btn btn-small" onClick={start}>
          <Volume2 size={16} aria-hidden="true" /> הקראת העמוד
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-small" onClick={pause} aria-label={state === "play" ? "השהיית ההקראה" : "המשך הקראה"}>
            {state === "play" ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <button type="button" className="btn btn-small" onClick={stop} aria-label="עצירת ההקראה">
            <Square size={16} aria-hidden="true" />
          </button>
        </>
      )}
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

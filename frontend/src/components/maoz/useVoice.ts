"use client";

// שלב 68: דיבור בדפדפן, בלי ספרייה ובלי עלות. זיהוי דיבור (SpeechRecognition) והקראה (speechSynthesis) הם של הדפדפן עצמו.
// בכרום ובאדג' האודיו לזיהוי נשלח לשירות של גוגל; ההקראה נעשית במכשיר. לכן אין כאן שום שמירה, ושום דבר לא נשלח לשרת של האתר חוץ מהטקסט שהמשתמש אישר.
import { useCallback, useEffect, useRef, useState } from "react";

type RecEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

const getRec = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const hasTts = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** מנקה טקסט להקראה ומחלק למקטעים קצרים (כרום קוטע הקראה ארוכה). */
export function speakChunks(text: string, max = 170): string[] {
  const clean = text
    .replace(/[*_`#>«»]+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?:;])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (p.length > max) {
      if (cur) out.push(cur);
      cur = "";
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
      continue;
    }
    if ((cur + " " + p).trim().length > max) {
      out.push(cur);
      cur = p;
    } else cur = (cur + " " + p).trim();
  }
  if (cur) out.push(cur);
  return out;
}

const ERR: Record<string, string> = {
  "not-allowed": "אין הרשאת מיקרופון. אפשר לאשר אותה בהגדרות הדפדפן, או לכתוב את השאלה.",
  "service-not-allowed": "אין הרשאת מיקרופון. אפשר לאשר אותה בהגדרות הדפדפן, או לכתוב את השאלה.",
  "no-speech": "לא שמעתי כלום. לחצו שוב ודברו.",
  "audio-capture": "לא נמצא מיקרופון במכשיר.",
  network: "אין חיבור לשירות זיהוי הדיבור של הדפדפן. אפשר לכתוב את השאלה.",
  "language-not-supported": "הדפדפן לא מזהה עברית מדוברת. אפשר לכתוב את השאלה.",
};

export function useVoice({ onFinal, lang = "he-IL" }: { onFinal: (text: string) => void; lang?: string }) {
  const [stt, setStt] = useState(false);
  const [tts, setTts] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;
  const run = useRef(0);

  useEffect(() => {
    setStt(!!getRec());
    setTts(hasTts());
  }, []);

  const cancel = useCallback(() => {
    run.current++;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    try {
      rec.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRec();
    if (!Ctor) {
      setError("הדפדפן הזה לא תומך בזיהוי דיבור (עובד בכרום, באדג' ובספארי). אפשר לכתוב את השאלה.");
      return;
    }
    cancel(); // לא מקשיבים לקול של עצמנו
    setError("");
    setInterim("");
    let last = "";
    let got = false;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let live = "";
      let fin = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t;
        else live += t;
      }
      if (live) {
        last = live;
        setInterim(live);
      }
      if (fin.trim()) {
        got = true;
        setInterim("");
        cb.current(fin.trim());
      }
    };
    r.onerror = (e) => {
      if (e.error && e.error !== "aborted") setError(ERR[e.error] ?? "זיהוי הדיבור נעצר. אפשר לנסות שוב או לכתוב.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      rec.current = null;
      if (!got && last.trim().length > 1) cb.current(last.trim()); // חלק מהדפדפנים מסיימים בלי תוצאה סופית
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("לא הצלחתי להפעיל את המיקרופון. נסו שוב.");
    }
  }, [cancel, lang]);

  const say = useCallback(
    (text: string) => {
      if (!hasTts()) return;
      const chunks = speakChunks(text);
      if (!chunks.length) return;
      try {
        const synth = window.speechSynthesis;
        synth.cancel();
        const id = ++run.current;
        const voice = synth.getVoices().find((v) => /^he/i.test(v.lang));
        setSpeaking(true);
        chunks.forEach((c, i) => {
          const u = new SpeechSynthesisUtterance(c);
          u.lang = lang;
          if (voice) u.voice = voice;
          const done = () => {
            if (run.current === id && i === chunks.length - 1) setSpeaking(false);
          };
          u.onend = done;
          u.onerror = done;
          synth.speak(u);
        });
      } catch {
        setSpeaking(false);
      }
    },
    [lang],
  );

  useEffect(
    () => () => {
      try {
        rec.current?.abort();
      } catch {
        /* ignore */
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { stt, tts, listening, interim, speaking, error, setError, start, stop, say, cancel };
}

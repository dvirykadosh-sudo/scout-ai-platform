"use client";

// שלב 75: ״הקרא לי״. הקראה בקול של השלב, של המשך המסמך או של כולו, באמצעות הקול שבדפדפן (Web Speech).
// ההקראה נעשית אצלכם במכשיר: הטקסט לא נשלח לשרת שלנו. איכות הקול בעברית ואפשרות ההקראה תלויות בדפדפן ובמערכת ההפעלה.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readChunks, readFlow, readSeconds, countTokens } from "@/lib/write75";
import { Modal } from "./ui";
import type { Block } from "./WriteParts";

type Scope = "block" | "fromHere" | "all";
const dur = (sec: number) => (sec < 90 ? `${sec} שניות` : `${Math.round(sec / 6) / 10} דקות`);

export function ReadMeModal({ open, onClose, blocks, activeIdx, onJump }: { open: boolean; onClose: () => void; blocks: Block[]; activeIdx: number; onJump: (blockIndex: number) => void }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  const [scope, setScope] = useState<Scope>("block");
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState(-1);
  const [error, setError] = useState("");
  const run = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const voiceRef = useRef("");
  voiceRef.current = voice;
  const jumpRef = useRef(onJump);
  jumpRef.current = onJump;

  const chunks = useMemo(() => (open ? readChunks(blocks, activeIdx, scope) : []), [open, blocks, activeIdx, scope]);
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const words = useMemo(() => chunks.reduce((s, c) => s + countTokens(c.text), 0), [chunks]);
  const flow = useMemo(() => (open ? readFlow(blocks, rate).filter((f) => f.note && (scope === "all" || (scope === "block" ? f.b === activeIdx : f.b >= activeIdx))) : []), [open, blocks, rate, scope, activeIdx]);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);
  const heVoices = useMemo(() => voices.filter((v) => /^(he|iw)/i.test(v.lang)), [voices]);

  const stop = useCallback(() => {
    run.current++;
    if (supported) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setPos(-1);
  }, [supported]);
  useEffect(() => {
    if (!open) stop();
    return () => {
      if (supported) {
        run.current++;
        window.speechSynthesis.cancel();
      }
    };
  }, [open, stop, supported]);

  const speakAt = useCallback((i: number, token: number) => {
    if (token !== run.current) return;
    const list = chunksRef.current;
    if (i >= list.length) {
      setPlaying(false);
      setPos(-1);
      return;
    }
    const c = list[i];
    setPos(i);
    jumpRef.current(c.b);
    const u = new SpeechSynthesisUtterance(c.text);
    u.lang = "he-IL";
    u.rate = rateRef.current;
    const v = window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceRef.current);
    if (v) u.voice = v;
    u.onend = () => speakAt(i + 1, token);
    u.onerror = (ev) => {
      if (token !== run.current || ev.error === "canceled" || ev.error === "interrupted") return;
      setError(`הדפדפן לא הצליח להקריא (${ev.error}). אפשר לנסות קול אחר, או דפדפן אחר.`);
      setPlaying(false);
    };
    window.speechSynthesis.speak(u);
  }, []);

  const start = () => {
    if (!supported || !chunks.length) return;
    setError("");
    window.speechSynthesis.cancel();
    const token = ++run.current;
    setPlaying(true);
    setPaused(false);
    speakAt(0, token);
  };
  const togglePause = () => {
    if (!supported) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const current = pos >= 0 ? chunks[pos] : null;
  return (
    <Modal open={open} onClose={onClose} title="הקרא לי" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {!supported ? (
        <p className="warn-box" role="status">
          הדפדפן הזה לא מספק הקראה בקול. אפשר לנסות Chrome, Edge או Safari עדכניים, או להשתמש בהקראה של מערכת ההפעלה.
        </p>
      ) : (
        <>
          <p className="hint">הקול והמהירות הם של הדפדפן והמכשיר שלכם, והטקסט לא נשלח אלינו. הקראה בקול רם היא דרך טובה לשמוע איפה המשפט נתקע ואיפה הוא ארוך מדי.</p>
          {heVoices.length === 0 && voices.length > 0 && <p className="warn-box">לא נמצא במכשיר קול בעברית, ולכן ההקראה עלולה להישמע מוזר או לא לעבוד. בהגדרות המערכת אפשר להוסיף קול בעברית.</p>}
          <div className="inline-form">
            <label htmlFor="rd-scope">מה להקריא</label>
            <select
              id="rd-scope"
              value={scope}
              onChange={(e) => {
                stop();
                setScope(e.target.value as Scope);
              }}
            >
              <option value="block">את השלב הנוכחי (שלב {activeIdx + 1})</option>
              <option value="fromHere">מהשלב הנוכחי ועד הסוף</option>
              <option value="all">את כל המסמך</option>
            </select>
          </div>
          <div className="inline-form">
            <label htmlFor="rd-rate">מהירות</label>
            <select id="rd-rate" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              <option value={0.8}>איטית (0.8)</option>
              <option value={1}>רגילה (1)</option>
              <option value={1.25}>מהירה (1.25)</option>
              <option value={1.5}>מהירה מאוד (1.5)</option>
            </select>
          </div>
          {heVoices.length > 0 && (
            <div className="inline-form">
              <label htmlFor="rd-voice">קול</label>
              <select id="rd-voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
                <option value="">ברירת המחדל של הדפדפן</option>
                {heVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="hint" role="status">
            {chunks.length ? `${chunks.length} משפטים, כ-${words} מילים. ההקראה תימשך בערך ${dur(readSeconds(words, rate))}.` : "אין טקסט להקראה בטווח שבחרתם."}
          </p>
          {flow.map((f) => (
            <p key={f.b} className="hint warn-text">
              שלב {f.b + 1}: {f.note}
            </p>
          ))}
          <div className="actions">
            {!playing ? (
              <button type="button" className="btn btn-primary" onClick={start} disabled={!chunks.length}>
                התחלת הקראה
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={togglePause} aria-pressed={paused}>
                  {paused ? "המשך" : "השהיה"}
                </button>
                <button type="button" className="btn" onClick={stop}>
                  עצירה
                </button>
              </>
            )}
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {current && (
            <div className="read75-now">
              <p className="hint">
                משפט {pos + 1} מתוך {chunks.length}, שלב {current.b + 1}
              </p>
              <p className="read75-sentence">{current.text}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

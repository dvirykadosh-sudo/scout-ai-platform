"use client";

// שלב 68: "מכשיר קשר מעוז". שואלים בקול, מקבלים תשובה כתובה ומוקראת. בעמוד העוזר ובמצב שטח.
// השאלה היא טקסט רגיל שנשלח לאותו מנוע של "שאלו את מעוז" (בלי מפתח הוא עונה מקומית, בחינם). אין הקלטה, אין שמירה.
// במצב שטח אפשר גם לשלוט בפעולה בקול (שלב הבא, התחל, עצור...). בנוסף יש תמיד שדה כתיבה, למי שהדפדפן שלו לא מזהה דיבור.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "../Providers";
import type { Reply } from "../lux/EagleChat";
import { useVoice } from "./useVoice";
import { Waveform, type WavePhase } from "./Waveform";

const MAX = 400;
const safeHref = (h: string) => (/^\/(?!\/)[\w\-./?=&#%+]*$/.test(h) ? h : null);

export interface WalkieProps {
  variant: "assistant" | "field";
  /** פקודה מקומית (מצב שטח). מחזירה טקסט לתשובה אם טיפלה בפקודה, אחרת null והשאלה עוברת למעוז. */
  onCommand?: (text: string) => string | null;
  starters?: string[];
}

const ASSIST_STARTERS = ["חניכים היפראקטיביים, מה עושים?", "נשאר לי 10 דקות, מה אפשר לעשות?", "משחק היכרות קצר בלי ציוד"];
const FIELD_STARTERS = ["ירד גשם, מה עושים?", "נשאר לי 10 דקות", "חניכים היפראקטיביים"];

/** מה מוקרא בקול: התשובה, הרשימה ושמות הכרטיסים (במצב שטח גם תוכן הרעיון). */
function spokenOf(r: Reply, withCardText: boolean): string {
  const bits: string[] = [r.answer];
  if (r.items?.length) bits.push(r.items.slice(0, 6).map((x, i) => `${i + 1}. ${x}`).join(". "));
  if (r.cards?.length) bits.push(r.cards.slice(0, 3).map((c) => (withCardText && c.text ? `${c.title}. ${c.text}` : c.title)).join(". "));
  return bits.join(" ").slice(0, 900);
}

export function Walkie({ variant, onCommand, starters }: WalkieProps) {
  const { token } = useAuth();
  const [reply, setReply] = useState<Reply | null>(null);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [text, setText] = useState("");
  const [fail, setFail] = useState("");
  const abort = useRef<AbortController | null>(null);
  const cmd = useRef(onCommand);
  cmd.current = onCommand;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const busyRef = useRef(false);
  const field = variant === "field";

  const ask = useCallback(
    async (raw: string) => {
      const q = raw.replace(/\s+/g, " ").trim().slice(0, MAX);
      if (q.length < 2 || busyRef.current) return;
      setHeard(q);
      setFail("");
      const handled = cmd.current?.(q) ?? null;
      if (handled !== null) {
        const r: Reply = { answer: handled };
        setReply(r);
        voiceRef.current?.say(handled);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      try {
        const r = await api<Reply>("/api/lux/eagle/ask", { method: "POST", body: { q }, token: token ?? undefined, signal: ac.signal });
        setReply(r);
        if (autoRef.current) voiceRef.current?.say(spokenOf(r, field));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setReply(null);
        setFail(e instanceof ApiError && e.status === 429 ? "שאלתם הרבה בזמן קצר. נסו שוב בעוד דקה." : "לא הצלחתי לענות כרגע. נסו שוב בעוד רגע.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [token, field],
  );

  const voice = useVoice({ onFinal: (t) => void ask(t) });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => () => abort.current?.abort(), []);

  const phase: WavePhase = voice.listening ? "listening" : busy ? "thinking" : voice.speaking ? "speaking" : "idle";
  const status = voice.listening ? "מקשיב... דברו עכשיו" : busy ? "מעוז בודק..." : voice.speaking ? "מעוז מדבר" : voice.stt ? "מוכן. לחצו על הכפתור ודברו" : "זיהוי דיבור לא זמין בדפדפן הזה. אפשר לכתוב";

  const ptt = () => {
    if (voice.listening) voice.stop();
    else if (voice.speaking) voice.cancel();
    else voice.start();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text;
    setText("");
    void ask(t);
  };
  const chips = starters ?? (field ? FIELD_STARTERS : ASSIST_STARTERS);

  return (
    <div className={`maoz-walkie ${field ? "is-field" : ""}`} data-phase={phase}>
      <div className="maoz-walkie-top">
        <button type="button" className="maoz-ptt" aria-pressed={voice.listening} disabled={!voice.stt && !voice.speaking} onClick={ptt}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          <span>{voice.listening ? "סיימתי לדבר" : voice.speaking ? "עצירת ההקראה" : "לחצו ודברו"}</span>
        </button>
        <Waveform phase={phase} />
      </div>

      <p className="maoz-status" role="status" aria-live="polite">
        {status}
      </p>
      {voice.error && (
        <p className="maoz-err" role="alert">
          {voice.error}
        </p>
      )}
      {(voice.interim || heard) && (
        <p className="maoz-heard">
          <span className="maoz-lbl">שמעתי:</span> {voice.interim || heard}
        </p>
      )}

      <form className="maoz-type" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX} placeholder={field ? "או כתבו: ירד גשם, נשאר לי 10 דקות..." : "או כתבו שאלה"} aria-label="שאלה כתובה למכשיר הקשר" autoComplete="off" enterKeyHint="send" dir="auto" />
        <button type="submit" className="btn btn-small" disabled={busy || text.trim().length < 2}>
          שליחה
        </button>
      </form>

      {voice.tts && (
        <label className="maoz-auto">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              if (!e.target.checked) voice.cancel();
            }}
          />
          <span>להקריא את התשובה בקול</span>
        </label>
      )}

      {!reply && !fail && (
        <div className="maoz-chips" role="group" aria-label="דוגמאות לשאלות">
          {chips.map((s) => (
            <button key={s} type="button" className="maoz-chip" onClick={() => void ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      {fail && (
        <p className="maoz-err" role="alert">
          {fail}
        </p>
      )}

      {reply && (
        <div className="maoz-reply" aria-live="polite">
          <p className="maoz-answer">{reply.answer}</p>
          {reply.understood && <p className="maoz-note">הבנתי: «{reply.understood}»</p>}
          {reply.items && reply.items.length > 0 && (
            <ol className="maoz-items">
              {reply.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ol>
          )}
          {reply.cards && reply.cards.length > 0 && (
            <ul className="maoz-cards">
              {reply.cards.map((c) => {
                const h = field ? null : safeHref(c.href);
                const body = (
                  <>
                    <strong>{c.title}</strong>
                    {c.meta && <span>{c.meta}</span>}
                    {c.text && <span className="maoz-snip">{c.text}</span>}
                  </>
                );
                return (
                  <li key={c.href + c.title}>
                    {h ? (
                      <Link href={h} className="maoz-card">
                        {body}
                      </Link>
                    ) : (
                      <div className="maoz-card">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {reply.source === "ai" && <p className="maoz-note">נוסח בעזרת בינה מלאכותית. כדאי לבדוק מול הנהלים שלכם.</p>}
          {reply.suggestions && reply.suggestions.length > 0 && (
            <div className="maoz-chips" role="group" aria-label="המשך שיחה">
              {reply.suggestions.slice(0, 3).map((s) => (
                <button key={s} type="button" className="maoz-chip" onClick={() => void ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="maoz-actions">
            {voice.tts && (
              <button type="button" className="btn btn-small" onClick={() => (voice.speaking ? voice.cancel() : voice.say(spokenOf(reply, field)))}>
                {voice.speaking ? "עצירת ההקראה" : "הקראה שוב"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                voice.cancel();
                setReply(null);
                setHeard("");
              }}
            >
              שאלה חדשה
            </button>
          </div>
        </div>
      )}

      <p className="maoz-privacy">
        אל תגידו שמות או פרטים מזהים של חניכים. בכרום ובאדג' זיהוי הדיבור נעשה בשירות של הדפדפן (גוגל או מיקרוסופט), לא בשרת שלנו. האתר לא מקליט ולא שומר את מה שנאמר.
      </p>
    </div>
  );
}

"use client";

// שלב 68: סימולטור חניכים (ספארינג). המדריך כותב (או מקליד בקול) מה הוא אומר לקבוצה, וחניכים בדויים מגיבים.
// אחרי כל תור יש טיפ אחד, ובסוף ציון מוכנות. בלי מפתח התגובות מגיעות ממאגר מקומי; עם מפתח (וכשמחוברים) הן מנוסחות בחופשיות.
// הציון הוא הערכה לפי כללי אצבע ולא מבחן. שום דבר לא נשמר: התרגיל נמצא בזיכרון הדפדפן בלבד.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { dnaBody } from "@/lib/dna";
import { useAuth } from "../Providers";
import { Ring } from "../v21/Ring";
import { useVoice } from "./useVoice";

interface Persona {
  id: string;
  label: string;
  blurb: string;
}
interface Scenario {
  id: string;
  title: string;
  setup: string;
  ageGroup: string;
  personas: Persona[];
}
interface Axis {
  id: string;
  label: string;
  score: number;
}
interface Report {
  score: number;
  level: string;
  axes: Axis[];
  strengths: string[];
  improve: string[];
  turns: number;
  note: string;
}
interface TurnReply {
  replies: { persona: string; label: string; text: string }[];
  tip: string;
  mood: string;
  turn: number;
  report?: Report;
  distress?: boolean;
  source?: "local" | "ai";
}
interface Line {
  id: number;
  from: string;
  label: string;
  text: string;
}

const MAX = 500;
const MOOD: Record<string, string> = { open: "פתיחה", hostile: "הקבוצה מתרחקת", neutral: "הקבוצה מחכה", engaged: "הקבוצה איתכם" };

export function Spar() {
  const { token } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [sc, setSc] = useState<Scenario | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [tip, setTip] = useState("");
  const [mood, setMood] = useState("");
  const [turns, setTurns] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiOn, setAiOn] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const id = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  const voice = useVoice({ onFinal: (t) => setText((cur) => ((cur ? cur.replace(/\s+$/, "") + " " : "") + t).slice(0, MAX)) });

  useEffect(() => {
    api<{ ai: boolean; scenarios: Scenario[] }>("/api/lux/spar/scenarios")
      .then((r) => setScenarios(r.scenarios))
      .catch(() => setLoadErr("לא הצלחתי לטעון את התרגילים. נסו לרענן את הדף."));
  }, []);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [lines.length, busy]);

  const history = (ls: Line[]) => ls.slice(-30).map((l) => ({ from: l.from, text: l.text }));

  const turn = useCallback(
    async (scenario: Scenario, prior: Line[], leader: string, finish: boolean) => {
      setBusy(true);
      setError("");
      try {
        const r = await api<TurnReply>("/api/lux/spar/turn", { method: "POST", body: { scenario: scenario.id, history: history(prior), leader, finish, ...dnaBody() }, token: token ?? undefined });
        setAiOn(r.source === "ai");
        setTip(r.tip);
        if (r.distress) {
          // הודעה אנושית במקום ציון: התור לא נספר
          setLines(prior);
          return;
        }
        setMood(r.mood);
        setTurns(r.turn);
        const add: Line[] = r.replies.map((x) => ({ id: ++id.current, from: x.persona, label: x.label, text: x.text }));
        setLines([...prior, ...add]);
        if (r.report) setReport(r.report);
        if (readAloud && add.length) voice.say(add.map((x) => `${x.label}: ${x.text}`).join(". "));
      } catch (e) {
        setLines(prior);
        setError(e instanceof ApiError && e.status === 429 ? "תרגלתם הרבה בזמן קצר. נסו שוב בעוד דקה." : "לא הצלחתי להמשיך את התרגיל. נסו שוב.");
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, readAloud],
  );

  const begin = (s: Scenario) => {
    voice.cancel();
    setSc(s);
    setLines([]);
    setTip("");
    setMood("");
    setTurns(0);
    setReport(null);
    setText("");
    void turn(s, [], "", false);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const t = text.replace(/\s+/g, " ").trim().slice(0, MAX);
    if (!sc || !t || busy || report) return;
    if (voice.listening) voice.stop();
    const mine: Line = { id: ++id.current, from: "leader", label: "אתם", text: t };
    const prior = [...lines, mine];
    setLines(prior);
    setText("");
    void turn(sc, prior, t, false);
    ta.current?.focus();
  };

  const finish = () => {
    if (!sc || busy || report) return;
    void turn(sc, lines, "", true);
  };

  const quit = () => {
    voice.cancel();
    setSc(null);
    setLines([]);
    setReport(null);
    setTip("");
  };

  if (loadErr)
    return (
      <p className="maoz-err" role="alert">
        {loadErr}
      </p>
    );
  if (!scenarios) return <p className="hint">טוען תרגילים...</p>;

  if (!sc)
    return (
      <div className="maoz-spar">
        <p className="hint">בחרו תרגיל. חניכים בדויים יגיבו למה שתגידו, ובסוף תקבלו טיפ וציון מוכנות. זה תרגול בלבד: שום דבר לא נשמר.</p>
        <ul className="maoz-scs">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button type="button" className="maoz-sc" onClick={() => begin(s)}>
                <strong>{s.title}</strong>
                <span>{s.setup}</span>
                <small>
                  {s.ageGroup} · {s.personas.map((p) => p.label).join(", ")}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="maoz-spar">
      <div className="maoz-spar-head">
        <div>
          <strong>{sc.title}</strong>
          <p className="hint">{sc.setup}</p>
        </div>
        <button type="button" className="btn btn-small" onClick={quit}>
          תרגיל אחר
        </button>
      </div>

      <div ref={log} className="maoz-log" role="log" aria-live="polite" aria-label="השיחה עם החניכים" tabIndex={0}>
        {lines.map((l) => (
          <p key={l.id} className={`maoz-line ${l.from === "leader" ? "is-me" : "is-kid"}`}>
            <span className="maoz-who">{l.label}</span>
            {l.text}
          </p>
        ))}
        {busy && (
          <p className="maoz-line is-kid maoz-typing" role="status">
            החניכים מגיבים...
          </p>
        )}
      </div>

      {tip && (
        <p className="maoz-tip" role="status">
          <strong>טיפ:</strong> {tip}
        </p>
      )}
      {error && (
        <p className="maoz-err" role="alert">
          {error}
        </p>
      )}
      {voice.error && (
        <p className="maoz-err" role="alert">
          {voice.error}
        </p>
      )}

      {!report && (
        <form className="maoz-compose" onSubmit={send}>
          <label htmlFor="maoz-spar-say" className="sr-only">
            מה אתם אומרים לקבוצה
          </label>
          <textarea
            id="maoz-spar-say"
            ref={ta}
            rows={3}
            maxLength={MAX}
            value={voice.interim ? `${text} ${voice.interim}`.trim() : text}
            onChange={(e) => setText(e.target.value)}
            placeholder="מה אתם אומרים לקבוצה? למשל: ״אני רואה שאתם עייפים. בואו נעמוד במעגל, ומי שמוכן מרים יד״"
            dir="auto"
          />
          <div className="maoz-compose-row">
            <button type="submit" className="btn btn-primary" disabled={busy || text.trim().length < 2}>
              אמרתי
            </button>
            {voice.stt && (
              <button type="button" className="btn" aria-pressed={voice.listening} onClick={() => (voice.listening ? voice.stop() : voice.start())}>
                {voice.listening ? "סיימתי להכתיב" : "הכתבה בקול"}
              </button>
            )}
            <button type="button" className="btn" onClick={finish} disabled={busy || turns < 1}>
              סיום וציון
            </button>
            {voice.tts && (
              <label className="maoz-auto">
                <input
                  type="checkbox"
                  checked={readAloud}
                  onChange={(e) => {
                    setReadAloud(e.target.checked);
                    if (!e.target.checked) voice.cancel();
                  }}
                />
                <span>להקריא את תגובות החניכים</span>
              </label>
            )}
          </div>
          <p className="maoz-privacy">
            {MOOD[mood] ? `מצב הקבוצה: ${MOOD[mood]}. ` : ""}
            {aiOn ? "התגובות מנוסחות בעזרת בינה מלאכותית. " : "התגובות מהמאגר המקומי של מעוז. "}
            אל תכתבו שמות אמיתיים של חניכים. אחרי כשישה תורות מתקבל ציון אוטומטית.
          </p>
        </form>
      )}

      {report && (
        <section className="maoz-report" aria-labelledby="maoz-report-h">
          <h3 id="maoz-report-h">ציון מוכנות</h3>
          <div className="maoz-report-top">
            <Ring value={report.score / 100} label="ציון מוכנות" size={96}>
              {report.score}
            </Ring>
            <div>
              <p className="maoz-level">{report.level}</p>
              <p className="hint">{report.turns === 1 ? "תור אחד שלכם נבדק" : `${report.turns} תורות שלכם נבדקו`}</p>
            </div>
          </div>
          <ul className="maoz-axes">
            {report.axes.map((a) => (
              <li key={a.id}>
                <span>{a.label}</span>
                <span className="maoz-axis-bar" role="img" aria-label={`${a.label}: ${a.score} מתוך 100`}>
                  <i style={{ width: `${a.score}%` }} />
                </span>
                <b>{a.score}</b>
              </li>
            ))}
          </ul>
          {report.strengths.length > 0 && (
            <p>
              <strong>מה עבד:</strong> {report.strengths.join(", ")}
            </p>
          )}
          {report.improve.length > 0 && (
            <p>
              <strong>לשפר:</strong> {report.improve.join(" ")}
            </p>
          )}
          <p className="maoz-privacy">{report.note}</p>
          <div className="maoz-compose-row">
            <button type="button" className="btn btn-primary" onClick={() => begin(sc)}>
              עוד סיבוב באותו תרגיל
            </button>
            <button type="button" className="btn" onClick={quit}>
              תרגיל אחר
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

// שלב 71: זירת משחק. חידון חי שנבנה מהפעולה, גלגל מזל, ולוח ניקוד מונפש עם אפקטים קוליים.
// נפתח כשכבה מעל מצב הבמה ומעל מצב המקרן. הכול נשאר בדפדפן: שמות הקבוצות, הניקוד ורשימת הגלגל לא נשלחים לשרת
// ונמחקים כשסוגרים את הלשונית (sessionStorage). מומלץ לכתוב בגלגל שמות קבוצות או משימות, לא שמות חניכים.
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_TEAMS, TEAM_COLORS, WHEEL_TASKS, award, buildQuiz, landing, newTeams, parseCustom, pickWinner, rank, secureRandom, spinTarget, type Question, type Team } from "@/lib/arena";
import { buzz, correct, fanfare, getSoundPrefs, scoreUp, setSoundPrefs, tick, unlock, whoosh, wrong } from "@/lib/lux/sound";
import type { Activity } from "@/lib/types";

const MARK = ["▲", "◆", "●", "■"];
const LETTER = ["א", "ב", "ג", "ד"];
const SPIN_MS = 4200;
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = sessionStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

/** מספר שעולה בהדרגה (ולא קופץ), כדי שהתוספת תורגש. */
function Count({ value, reduced }: { value: number; reduced: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced || from.current === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 500);
      setShown(Math.round(a + (value - a) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <span dir="ltr">{shown}</span>;
}

export function Arena({ activity, stageIndex, variant = "stage", onClose }: { activity: Activity; stageIndex: number; variant?: "stage" | "projector"; onClose: () => void }) {
  const reduced = !!useReducedMotion();
  const KEY = `maoz.arena.${activity.id}`;
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"quiz" | "wheel">("quiz");
  const [teams, setTeams] = useState<Team[]>(() => store.get<Team[]>(`${KEY}.teams`, newTeams(3)));
  const [history, setHistory] = useState<Team[][]>([]);
  const [sound, setSound] = useState(false);
  const [say, setSay] = useState("");

  useEffect(() => {
    const sync = () => setSound(getSoundPrefs().on);
    sync();
    window.addEventListener("scout:sound", sync);
    return () => window.removeEventListener("scout:sound", sync);
  }, []);
  useEffect(() => store.set(`${KEY}.teams`, teams), [KEY, teams]);

  /* ───── ניקוד ───── */
  const change = useCallback((fn: (t: Team[]) => Team[]) => {
    setTeams((cur) => {
      setHistory((h) => [...h.slice(-29), cur]);
      return fn(cur);
    });
  }, []);
  const give = (id: string, pts: number) => {
    change((t) => award(t, id, pts));
    if (pts > 0) scoreUp(pts >= 20);
    const name = teams.find((t) => t.id === id)?.name ?? "";
    setSay(`${pts > 0 ? "נוספו" : "הורדו"} ${Math.abs(pts)} נקודות ל${name}`);
  };
  const undo = () => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setTeams(prev);
      return h.slice(0, -1);
    });
  };
  const ranked = useMemo(() => rank(teams), [teams]);
  const max = Math.max(10, ...teams.map((t) => t.score));

  /* ───── חידון ───── */
  const [phase, setPhase] = useState<"setup" | "play" | "end">("setup");
  const [scope, setScope] = useState<"all" | "stage">("all");
  const [count, setCount] = useState(8);
  const [secs, setSecs] = useState(20);
  const [custom, setCustom] = useState("");
  const [qs, setQs] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [shown, setShown] = useState(false);
  const [left, setLeft] = useState(0);
  const [info, setInfo] = useState("");
  const q = qs[qi];
  const bonus = phase === "play" && qi === qs.length - 1 && qs.length > 2;
  const pts = bonus ? 20 : 10;

  const start = () => {
    const seed = Math.floor(secureRandom() * 1e9);
    const built = buildQuiz(activity.stages, { stageIndex: scope === "stage" ? stageIndex : null, count, seed });
    const mine = parseCustom(custom, seed);
    const all = [...mine.questions, ...built.questions].slice(0, Math.max(count, mine.questions.length));
    if (!all.length) {
      setInfo("אין מספיק טקסט בפעולה כדי לבנות שאלות. אפשר להוסיף שאלות משלכם בשדה למטה.");
      return;
    }
    setInfo([built.widened ? "בשלב הזה אין מספיק טקסט, ולכן השאלות הן מכל הפעולה." : "", mine.bad.length ? `שורות שלא הובנו בשאלות שלכם: ${mine.bad.join(", ")}` : ""].filter(Boolean).join(" "));
    setQs(all);
    setQi(0);
    setShown(false);
    setLeft(secs);
    setPhase("play");
    unlock();
    whoosh();
  };
  const reveal = useCallback(() => {
    setShown((s) => {
      if (!s) correct();
      return true;
    });
  }, []);
  const next = useCallback(() => {
    setQi((i) => {
      if (i + 1 >= qs.length) {
        setPhase("end");
        fanfare();
        buzz([60, 40, 60, 40, 200]);
        window.dispatchEvent(new Event("scout:celebrate"));
        return i;
      }
      return i + 1;
    });
    setShown(false);
    setLeft(secs);
    whoosh();
  }, [qs.length, secs]);

  // טיימר לשאלה: נעצר כשהתשובה נחשפת, ובסיומו חושף לבד
  useEffect(() => {
    if (phase !== "play" || shown || !secs) return;
    const t = window.setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          window.clearInterval(t);
          wrong();
          setShown(true);
          return 0;
        }
        if (l <= 6) tick(l);
        return l - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, shown, secs, qi]);

  /* ───── גלגל מזל ───── */
  const [wheelText, setWheelText] = useState(() => store.get<string>(`${KEY}.wheel`, activity.stages.map((s) => s.name).join("\n")));
  const [drop, setDrop] = useState(false);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const items = useMemo(() => wheelText.split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 16), [wheelText]);
  useEffect(() => store.set(`${KEY}.wheel`, wheelText), [KEY, wheelText]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const spin = () => {
    if (spinning || items.length < 2) return;
    unlock();
    const n = items.length;
    const winner = pickWinner(n);
    const target = Math.ceil(rot / 360) * 360 + spinTarget(n, winner, 5, (secureRandom() - 0.5) * 0.6);
    const total = target - rot;
    const seg = 360 / n;
    setWon(null);
    setSpinning(true);
    setRot(target);
    whoosh();
    const finish = () => {
      const w = items[landing(target, n)];
      setWon(w);
      setSpinning(false);
      fanfare();
      buzz([40, 30, 120]);
      setSay(`הגלגל נעצר על: ${w}`);
      if (drop) setWheelText(items.filter((_, i) => i !== landing(target, n)).join("\n"));
    };
    if (reduced) {
      tick();
      finish();
      return;
    }
    // תקתוקים בקצב שמאט: פלח אחרי פלח, לפי עקומת האטה
    const crossings = Math.floor(total / seg);
    const every = Math.max(1, Math.ceil(crossings / 60));
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    for (let k = every; k <= crossings; k += every) {
      const p = (k * seg) / total;
      timers.current.push(window.setTimeout(() => tick(k), SPIN_MS * (1 - (1 - p) ** (1 / 3))));
    }
    timers.current.push(window.setTimeout(finish, SPIN_MS + 80));
  };

  /* ───── מקלדת, פוקוס וסגירה ───── */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => prev?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && root.current) {
        const f = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
        return;
      }
      if (typing || t?.tagName === "BUTTON") return;
      if (mode === "quiz" && phase === "play") {
        if (e.key === " ") (e.preventDefault(), shown ? next() : reveal());
        else if (e.key === "ArrowLeft") (e.preventDefault(), next());
      } else if (mode === "wheel" && e.key === " ") (e.preventDefault(), spin());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, shown, next, reveal, onClose, spinning, items, rot, drop]);

  const addTeam = () => change((t) => (t.length >= MAX_TEAMS ? t : [...t, { id: `t${Date.now() % 1e6}`, name: `קבוצה ${t.length + 1}`, color: TEAM_COLORS[t.length % TEAM_COLORS.length], score: 0 }]));
  const dropTeam = (id: string) => change((t) => (t.length <= 2 ? t : t.filter((x) => x.id !== id)));
  const rename = (id: string, name: string) => setTeams((t) => t.map((x) => (x.id === id ? { ...x, name: name.slice(0, 24) } : x)));
  const resetScores = () => change((t) => t.map((x) => ({ ...x, score: 0 })));

  const top = ranked[0];
  const tied = ranked.filter((t) => t.place === 1).length > 1;

  return (
    <div ref={root} className={`arn arn-${variant}`} role="dialog" aria-modal="true" aria-label="זירת משחק" tabIndex={-1}>
      <header className="arn-top">
        <button type="button" className="arn-icon" onClick={onClose} aria-label="סגירת הזירה">
          ✕
        </button>
        <h2 className="arn-title">זירת משחק · {activity.title}</h2>
        <button type="button" className="arn-icon" aria-pressed={sound} aria-label={sound ? "כיבוי צלילים" : "הפעלת צלילים"} onClick={() => (unlock(), setSoundPrefs({ on: !sound }), !sound && correct())}>
          {sound ? "🔔" : "🔕"}
        </button>
      </header>

      <div className="arn-body">
        <main className="arn-main">
          <div role="tablist" aria-label="מצב הזירה" className="arn-tabs">
            {(
              [
                ["quiz", "חידון"],
                ["wheel", "גלגל מזל"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} className={`arn-tab${mode === k ? " on" : ""}`} onClick={() => setMode(k)}>
                {l}
              </button>
            ))}
          </div>

          {mode === "quiz" && phase === "setup" && (
            <section className="arn-panel" aria-label="הגדרת החידון">
              <p>החידון נבנה אוטומטית מהמשפטים של הפעולה (בלי AI). יש שאלות שלא יצאו מוצלחות, ואפשר לדלג עליהן או להוסיף שאלות משלכם.</p>
              <div className="arn-row">
                <label>
                  מאיפה השאלות
                  <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "stage")}>
                    <option value="all">כל הפעולה</option>
                    <option value="stage">השלב הנוכחי: {activity.stages[stageIndex]?.name}</option>
                  </select>
                </label>
                <label>
                  כמה שאלות
                  <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[5, 8, 12].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  זמן לשאלה
                  <select value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
                    <option value={0}>בלי טיימר</option>
                    {[15, 20, 30, 45].map((n) => (
                      <option key={n} value={n}>
                        {n} שניות
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <details>
                <summary>להוסיף שאלות משלכם</summary>
                <label>
                  שורה לכל שאלה: שאלה | תשובה נכונה | שגויה | שגויה | שגויה
                  <textarea rows={4} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="מה צבע המטפחת של השבט? | סגול | ירוק | כחול" />
                </label>
              </details>
              {info && (
                <p className="arn-warn" role="status">
                  {info}
                </p>
              )}
              <button type="button" className="arn-btn arn-main-btn" onClick={start}>
                התחלת החידון
              </button>
            </section>
          )}

          {mode === "quiz" && phase === "play" && q && (
            <section className="arn-panel arn-q" aria-label={`שאלה ${qi + 1} מתוך ${qs.length}`}>
              <p className="arn-kicker">
                שאלה {qi + 1} מתוך {qs.length} · {q.source}
                {bonus && <strong className="arn-bonus"> · שאלת בונוס, כפול נקודות</strong>}
              </p>
              <h3 className="arn-prompt">{q.prompt}</h3>
              {secs > 0 && (
                <div className="arn-timer" role="timer" aria-label={`נשארו ${left} שניות`}>
                  <span style={{ width: `${(left / secs) * 100}%` }} className={left <= 5 && !shown ? "warn" : ""} />
                  <b dir="ltr">{left}</b>
                </div>
              )}
              <ul className="arn-opts">
                {q.options.map((o, i) => (
                  <li key={o + i} className={`arn-opt o${i}${shown ? (i === q.answer ? " right" : " dim") : ""}`}>
                    <span aria-hidden="true">{MARK[i]}</span>
                    <span className="arn-letter">{LETTER[i]}.</span> {o}
                    {shown && i === q.answer && <span className="sr-only"> (התשובה הנכונה)</span>}
                    {shown && i === q.answer && <span aria-hidden="true"> ✓</span>}
                  </li>
                ))}
              </ul>
              {!shown ? (
                <div className="arn-row">
                  <button type="button" className="arn-btn arn-main-btn" onClick={reveal}>
                    גלו את התשובה
                  </button>
                  <button type="button" className="arn-btn" onClick={next}>
                    דילוג
                  </button>
                </div>
              ) : (
                <>
                  <p className="arn-ask">מי ענתה נכון? הקישו על קבוצה (+{pts})</p>
                  <div className="arn-row">
                    {teams.map((t) => (
                      <button key={t.id} type="button" className="arn-btn arn-team" style={{ ["--c" as string]: t.color }} onClick={() => give(t.id, pts)}>
                        {t.name} +{pts}
                      </button>
                    ))}
                    <button type="button" className="arn-btn arn-main-btn" onClick={next}>
                      {qi + 1 >= qs.length ? "לסיכום" : "השאלה הבאה"}
                    </button>
                  </div>
                </>
              )}
              <p className="arn-hint" aria-hidden="true">
                רווח = גלו / הבאה · חץ שמאלה = דילוג · Esc = סגירה
              </p>
            </section>
          )}

          {mode === "quiz" && phase === "end" && (
            <section className="arn-panel arn-end" aria-label="סיכום החידון">
              <h3>{tied ? "תיקו בצמרת!" : `${top?.name} מנצחת!`}</h3>
              <ol className="arn-podium">
                {ranked.slice(0, 3).map((t) => (
                  <li key={t.id} style={{ ["--c" as string]: t.color, ["--h" as string]: `${40 + (t.score / max) * 60}%` }} className={`p${t.place}`}>
                    <span className="arn-place">{t.place}</span>
                    <strong>{t.name}</strong>
                    <span dir="ltr">{t.score}</span>
                  </li>
                ))}
              </ol>
              <div className="arn-row">
                <button type="button" className="arn-btn arn-main-btn" onClick={() => setPhase("setup")}>
                  חידון חדש
                </button>
                <button type="button" className="arn-btn" onClick={resetScores}>
                  איפוס הניקוד
                </button>
              </div>
            </section>
          )}

          {mode === "wheel" && (
            <section className="arn-panel arn-wheel" aria-label="גלגל מזל">
              <div className="arn-wheel-box">
                <div className="arn-pointer" aria-hidden="true" />
                <svg viewBox="-110 -110 220 220" className="arn-disc" style={{ transform: `rotate(${rot}deg)`, transition: reduced || !spinning ? "none" : `transform ${SPIN_MS}ms cubic-bezier(.12,.7,.1,1)` }} role="img" aria-label={`גלגל עם ${items.length} אפשרויות`}>
                  {items.map((label, i) => {
                    const n = items.length;
                    const a0 = ((i * 360) / n - 90) * (Math.PI / 180);
                    const a1 = (((i + 1) * 360) / n - 90) * (Math.PI / 180);
                    const big = 360 / n > 180 ? 1 : 0;
                    const mid = (((i + 0.5) * 360) / n);
                    return (
                      <g key={label + i}>
                        <path d={`M0 0 L${100 * Math.cos(a0)} ${100 * Math.sin(a0)} A100 100 0 ${big} 1 ${100 * Math.cos(a1)} ${100 * Math.sin(a1)} Z`} fill={TEAM_COLORS[i % TEAM_COLORS.length]} stroke="#0a0714" strokeWidth="1.5" />
                        <text transform={`rotate(${mid - 90}) translate(92 0)`} textAnchor="end" dominantBaseline="middle" fontSize={n > 10 ? 7 : 9} fontWeight="700" fill="#fff" direction="rtl">
                          {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                        </text>
                      </g>
                    );
                  })}
                  <circle r="9" fill="#0a0714" />
                </svg>
              </div>
              <div className="arn-wheel-side">
                <p className="arn-won" role="status" aria-live="polite">
                  {spinning ? "מסתובב..." : won ? <>נבחר: <strong>{won}</strong></> : items.length < 2 ? "כתבו לפחות שתי אפשרויות" : "לחצו כדי לסובב"}
                </p>
                <button type="button" className="arn-btn arn-main-btn" onClick={spin} disabled={spinning || items.length < 2}>
                  סיבוב
                </button>
                <div className="arn-row">
                  <button type="button" className="arn-btn" onClick={() => setWheelText(activity.stages.map((s) => s.name).join("\n"))}>
                    שלבי הפעולה
                  </button>
                  <button type="button" className="arn-btn" onClick={() => setWheelText(teams.map((t) => t.name).join("\n"))}>
                    הקבוצות
                  </button>
                  <button type="button" className="arn-btn" onClick={() => setWheelText(WHEEL_TASKS.join("\n"))}>
                    משימות
                  </button>
                </div>
                <label>
                  אפשרויות (שורה לכל אחת, עד 16)
                  <textarea rows={5} value={wheelText} onChange={(e) => setWheelText(e.target.value)} />
                </label>
                <label className="arn-check">
                  <input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} /> להסיר את הנבחר אחרי כל סיבוב
                </label>
                <p className="arn-hint">הרשימה נשמרת רק בדפדפן הזה ונמחקת כשסוגרים אותו. מומלץ לא לכתוב שמות חניכים אם המסך מוצג לכולם.</p>
              </div>
            </section>
          )}
        </main>

        <aside className="arn-board" aria-label="לוח ניקוד">
          <div className="arn-board-head">
            <h3>לוח ניקוד</h3>
            <div className="arn-row">
              <button type="button" className="arn-mini" onClick={undo} disabled={!history.length} aria-label="ביטול הפעולה האחרונה בניקוד">
                ↶ ביטול
              </button>
              <button type="button" className="arn-mini" onClick={addTeam} disabled={teams.length >= MAX_TEAMS}>
                + קבוצה
              </button>
            </div>
          </div>
          <ol className="arn-teams">
            {ranked.map((t) => (
              <motion.li key={t.id} layout={!reduced} transition={{ type: "spring", stiffness: 380, damping: 32 }} className={`arn-team-row${t.place === 1 && t.score > 0 ? " lead" : ""}`} style={{ ["--c" as string]: t.color }}>
                <span className="arn-rank" aria-label={`מקום ${t.place}`}>
                  {t.place}
                </span>
                <input className="arn-name" value={t.name} onChange={(e) => rename(t.id, e.target.value)} aria-label="שם הקבוצה" maxLength={24} />
                <b className="arn-score">
                  <Count value={t.score} reduced={reduced} />
                </b>
                <span className="arn-bar" aria-hidden="true">
                  <i style={{ width: `${(t.score / max) * 100}%` }} />
                </span>
                <span className="arn-btns">
                  {[10, 5, -5].map((p) => (
                    <button key={p} type="button" className="arn-mini" onClick={() => give(t.id, p)} aria-label={`${p > 0 ? "הוספת" : "הורדת"} ${Math.abs(p)} נקודות ל${t.name}`}>
                      {p > 0 ? `+${p}` : `−${-p}`}
                    </button>
                  ))}
                  {teams.length > 2 && (
                    <button type="button" className="arn-mini" onClick={() => dropTeam(t.id)} aria-label={`הסרת ${t.name}`}>
                      ✕
                    </button>
                  )}
                </span>
              </motion.li>
            ))}
          </ol>
          <p className="arn-hint">שמות הקבוצות והניקוד נשמרים רק בדפדפן הזה.</p>
        </aside>
      </div>
      <div className="sr-only" aria-live="polite">
        {say}
      </div>
    </div>
  );
}

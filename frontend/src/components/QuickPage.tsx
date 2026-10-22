"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { KIND_LABELS } from "@/lib/kind-labels";
import type { Brief } from "@/lib/organizer";
import { useQuickMake } from "./QuickMake";
import { ScheduleModal } from "./ScheduleModal";
import { useAuth } from "./Providers";
import { Field } from "./ui";

interface QuickResult {
  pick: Brief | null;
  alternatives: Brief[];
  candidates: number;
  nearest: Brief | null;
}

const AGE_KEY = "scout.quick.age";
const TIMES = [10, 20, 30, 45, 60];

/** מצב מהיר: גיל וזמן פנוי, ולחיצה אחת מחזירה פעולה מוכנה מהמאגר. */
export function QuickPage() {
  const { token } = useAuth();
  const { make, busy } = useQuickMake();
  const [age, setAge] = useState("כיתה ח' - מעורב");
  const [minutes, setMinutes] = useState(30);
  const [minimal, setMinimal] = useState(false);
  const [energetic, setEnergetic] = useState(false);
  const [res, setRes] = useState<QuickResult | null>(null);
  const [skip, setSkip] = useState<number[]>([]);
  const [seed, setSeed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sched, setSched] = useState<Brief | null>(null);

  useEffect(() => {
    const saved = storageGet(AGE_KEY);
    if (saved && AGE_GROUPS.includes(saved)) setAge(saved);
  }, []);

  const run = async (nextSkip: number[], nextSeed: number) => {
    setLoading(true);
    setError("");
    storageSet(AGE_KEY, age);
    const p = new URLSearchParams({ age, minutes: String(minutes), seed: String(nextSeed) });
    if (minimal) p.set("minimalGear", "1");
    if (energetic) p.set("energetic", "1");
    if (nextSkip.length) p.set("skip", nextSkip.slice(-40).join(","));
    try {
      setRes(await api<QuickResult>(`/api/quick?${p}`, { token }));
    } catch (e) {
      setError(errorMessage(e));
    }
    setLoading(false);
  };

  const first = () => {
    setSkip([]);
    setSeed(0);
    void run([], 0);
  };
  const another = () => {
    const next = res?.pick ? [...skip, res.pick.id] : skip;
    setSkip(next);
    setSeed(seed + 1);
    void run(next, seed + 1);
  };

  const card = (a: Brief, main = false) => (
    <article key={a.id} className={`card glass ${main ? "quick-main" : ""}`} aria-label={a.title}>
      {a.kind && KIND_LABELS[a.kind] && (
        <p className="kind-line">
          <span className="chip chip-accent">{KIND_LABELS[a.kind]}</span>
        </p>
      )}
      <h2 className="card-title">
        <Link href={`/library/${a.id}`}>{a.title}</Link>
      </h2>
      <ul className="chips" aria-label="פרטי הפעולה">
        <li className="chip">{a.durationMin} דקות</li>
        <li className="chip">{a.ageGroup}</li>
        <li className="chip">ערך: {a.leadingValue}</li>
      </ul>
      {a.reasons && (
        <ul className="reason-list" aria-label="למה דווקא הפעולה הזאת">
          {a.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <Link className="btn btn-primary" href={`/library/${a.id}`}>
          פתיחת הפעולה
        </Link>
        <Link className="btn" href={`/field/${a.id}`}>
          מצב הדרכה בשטח
        </Link>
        {token && (
          <button type="button" className="btn" onClick={() => setSched(a)}>
            שיבוץ ביומן
          </button>
        )}
      </div>
    </article>
  );

  return (
    <>
      <form
        className="card glass"
        onSubmit={(e) => {
          e.preventDefault();
          first();
        }}
        aria-label="מצב מהיר"
      >
        <div className="form-grid">
          <Field label="שכבת גיל" htmlFor="qk-age">
            <select id="qk-age" value={age} onChange={(e) => setAge(e.target.value)}>
              {AGE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="grade-picker">
          <legend>כמה זמן יש לכם?</legend>
          <div className="grade-options">
            {TIMES.map((m) => (
              <label key={m} className="check">
                <input type="radio" name="qk-min" checked={minutes === m} onChange={() => setMinutes(m)} />
                <span>{m} דקות</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grade-options">
          <label className="check">
            <input type="checkbox" checked={minimal} onChange={(e) => setMinimal(e.target.checked)} />
            <span>בלי ציוד (או כמעט)</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={energetic} onChange={(e) => setEnergetic(e.target.checked)} />
            <span>שיהיה תנועתי</span>
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary quick-go" disabled={loading}>
            {loading ? "מחפש..." : "תנו לי פעולה עכשיו"}
          </button>
        </div>
      </form>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {res?.pick && (
          <>
            {card(res.pick, true)}
            <div className="actions">
              <button type="button" className="btn" onClick={another} disabled={loading}>
                עוד אחת
              </button>
            </div>
            {res.alternatives.length > 0 && (
              <section aria-labelledby="qk-alt">
                <h2 id="qk-alt" className="section-title">
                  אפשרויות נוספות
                </h2>
                <div className="list">
                  {res.alternatives.map((a) => card(a))}
                </div>
              </section>
            )}
          </>
        )}
        {res && !res.pick && (
          <section className="card glass" aria-labelledby="qk-none">
            <h2 id="qk-none" className="section-title">
              לא מצאנו פעולה מוכנה שמתאימה
            </h2>
            {res.nearest && (
              <p>
                {res.nearest.reasons?.[0]}: <Link href={`/library/${res.nearest.id}`}>{res.nearest.title}</Link>.
              </p>
            )}
            <p>אפשר לבקש מהאתר לכתוב פעולה חדשה באורך הזה.</p>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => make({ minutes: Math.max(10, minutes) })}>
                {busy ? "יוצר..." : `צרו לי פעולה חדשה של ${Math.max(10, minutes)} דקות`}
              </button>
            </div>
          </section>
        )}
      </div>
      {sched && <ScheduleModal open onClose={() => setSched(null)} activity={{ id: sched.id, title: sched.title, durationMin: sched.durationMin }} />}
    </>
  );
}

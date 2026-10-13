"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, downloadDocx, errorMessage, storageGet, storageSet, ApiError } from "@/lib/api";
import { AGE_GROUPS, METHODS, ROLES } from "@/lib/constants";
import type { Activity } from "@/lib/types";
import { ActivityBody, ActivityMeta } from "./ActivityView";
import { useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

const STEPS = ["פרטי הפעולה", "מצבים פדגוגיים", "שיטות וזמנים", "סקירה ויצירה"];

interface Form {
  topic: string;
  value: string;
  tribe: string;
  battalion: string;
  instructor: string;
  role: string;
  participants: string;
  ageGroup: string;
  activeScouting: boolean;
  energeticMode: boolean;
}

const EMPTY: Form = {
  topic: "",
  value: "",
  tribe: "שבט מעוז",
  battalion: "",
  instructor: "",
  role: ROLES[0],
  participants: "20",
  ageGroup: "כיתה ח' - מעורב",
  activeScouting: false,
  energeticMode: false,
};

type Errors = Record<string, string>;
const REMEMBER_KEY = "scout.form";

export function Generator() {
  const toast = useToast();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Activity | null>(null);
  const [exporting, setExporting] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // remembered fields + method preselected from the methods library
  useEffect(() => {
    const raw = storageGet(REMEMBER_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<Form>;
        setForm((f) => ({ ...f, tribe: saved.tribe ?? f.tribe, battalion: saved.battalion ?? f.battalion, instructor: saved.instructor ?? f.instructor, role: saved.role ?? f.role }));
      } catch {
        /* ignore */
      }
    }
    const m = params.get("method");
    if (m && METHODS.some((x) => x.name === m)) setSel({ [m]: "10" });
  }, [params]);

  // move keyboard/screen-reader focus to the new step heading
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepHeading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  const total = Object.values(sel).reduce((s, v) => s + (Number(v) || 0), 0);
  const methodCount = Object.keys(sel).length;

  const validate = (s: number): Errors => {
    const e: Errors = {};
    if (s === 0) {
      if (form.topic.trim().length < 2) e.topic = "יש להזין נושא לפעולה";
      if (!form.instructor.trim()) e.instructor = "יש להזין שם מדריך/ה";
      const n = Number(form.participants);
      if (!Number.isInteger(n) || n < 1 || n > 200) e.participants = "מספר משתתפים בין 1 ל-200";
      if (!form.tribe.trim()) e.tribe = "יש להזין שם שבט";
    }
    if (s === 2) {
      if (methodCount === 0) e.methods = "יש לבחור לפחות שיטה אחת";
      else {
        for (const [name, v] of Object.entries(sel)) {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 120) e[`m:${name}`] = "בין 1 ל-120 דקות";
        }
        if (!Object.keys(e).length && (total < 5 || total > 180)) e.methods = `זמן הפעולה הכולל הוא ${total} דקות, וחייב להיות בין 5 ל-180`;
      }
    }
    return e;
  };

  const go = (target: number) => {
    // going forward validates every step on the way
    if (target > step) {
      for (let s = step; s < target; s++) {
        const e = validate(s);
        if (Object.keys(e).length) {
          setErrors(e);
          setStep(s);
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
  };

  const toggleMethod = (name: string, on: boolean) => {
    setSel((s) => {
      const n = { ...s };
      if (on) n[name] = n[name] ?? "10";
      else delete n[name];
      return n;
    });
    setErrors((e) => {
      const n = { ...e };
      delete n.methods;
      delete n[`m:${name}`];
      return n;
    });
  };

  const create = async () => {
    for (const s of [0, 2]) {
      const e = validate(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    setBusy(true);
    setErrors({});
    try {
      const a = await api<Activity>("/api/activities/generate", {
        method: "POST",
        body: {
          topic: form.topic.trim(),
          value: form.value.trim(),
          ageGroup: form.ageGroup,
          participants: Number(form.participants),
          tribe: form.tribe.trim(),
          battalion: form.battalion.trim(),
          instructor: form.instructor.trim(),
          role: form.role,
          activeScouting: form.activeScouting,
          energeticMode: form.energeticMode,
          methods: Object.entries(sel).map(([name, minutes]) => ({ name, minutes: Number(minutes) })),
        },
      });
      storageSet(REMEMBER_KEY, JSON.stringify({ tribe: form.tribe, battalion: form.battalion, instructor: form.instructor, role: form.role }));
      setResult(a);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        const next: Errors = {};
        let target = 3;
        for (const [k, msgs] of Object.entries(e.fields)) {
          const root = k.split(".")[0];
          next[root] = msgs[0];
          target = Math.min(target, root === "methods" ? 2 : 0);
        }
        setErrors(next);
        setStep(target);
      }
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  const exportWord = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await downloadDocx(result.id, result.title);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setExporting(false);
  };

  const reset = () => {
    setResult(null);
    setSel({});
    setErrors({});
    setStep(0);
    setForm((f) => ({ ...EMPTY, tribe: f.tribe, battalion: f.battalion, instructor: f.instructor, role: f.role }));
  };

  /* ───────── result ───────── */
  if (busy) {
    return (
      <div aria-live="polite">
        <h2 className="section-title">יוצר את הפעולה...</h2>
        <Skeleton lines={6} label="הפעולה נוצרת, זה לוקח כמה שניות" />
      </div>
    );
  }

  if (result) {
    return (
      <article className="card glass result" aria-labelledby="result-title">
        <h2 id="result-title" ref={resultHeading} tabIndex={-1}>
          {result.title}
        </h2>
        <p className="hint">{result.source === "ai" ? "הפעולה נוצרה בעזרת AI ונשמרה במאגר." : "הפעולה נוצרה ממחולל התבניות המובנה ונשמרה במאגר."}</p>
        <ActivityMeta a={result} />
        <ActivityBody a={result} />
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={exportWord} disabled={exporting}>
            {exporting ? "מכין קובץ..." : "ייצוא ל-Word"}
          </button>
          <Link className="btn" href={`/library/${result.id}`}>
            פתיחה במאגר
          </Link>
          <button type="button" className="btn" onClick={reset}>
            יצירת פעולה נוספת
          </button>
        </div>
      </article>
    );
  }

  /* ───────── wizard ───────── */
  const err = (k: string) => errors[k];
  const ageOptions = AGE_GROUPS;

  return (
    <form
      className="wizard"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (step < 3) go(step + 1);
        else create();
      }}
    >
      <ol className="stepper" aria-label="שלבי יצירת הפעולה">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""}>
            <button type="button" onClick={() => go(i)}>
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              {label}
              {i < step && <span className="sr-only"> (הושלם)</span>}
            </button>
          </li>
        ))}
      </ol>

      <section className="card glass" aria-labelledby="step-title">
        <h2 id="step-title" className="section-title" ref={stepHeading} tabIndex={-1}>
          {STEPS[step]}
        </h2>

        {step === 0 && (
          <div className="form-grid">
            <Field label="נושא הפעולה" htmlFor="topic" error={err("topic")}>
              <input id="topic" value={form.topic} onChange={(e) => set("topic", e.target.value)} aria-invalid={!!err("topic")} aria-describedby={err("topic") ? "topic-err" : undefined} autoComplete="off" />
            </Field>
            <Field label="ערך מוביל" htmlFor="value" hint="לא חובה. אם ריק, הנושא ישמש כערך." error={err("value")}>
              <input id="value" value={form.value} onChange={(e) => set("value", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="שם השבט" htmlFor="tribe" error={err("tribe")}>
              <input id="tribe" value={form.tribe} onChange={(e) => set("tribe", e.target.value)} />
            </Field>
            <Field label="גדוד" htmlFor="battalion" error={err("battalion")}>
              <input id="battalion" value={form.battalion} onChange={(e) => set("battalion", e.target.value)} />
            </Field>
            <Field label="שם המדריך/ה" htmlFor="instructor" error={err("instructor")}>
              <input id="instructor" value={form.instructor} onChange={(e) => set("instructor", e.target.value)} aria-invalid={!!err("instructor")} aria-describedby={err("instructor") ? "instructor-err" : undefined} autoComplete="name" />
            </Field>
            <Field label="תפקיד" htmlFor="role">
              <select id="role" value={form.role} onChange={(e) => set("role", e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="מספר משתתפים" htmlFor="participants" error={err("participants")}>
              <input id="participants" type="number" min={1} max={200} value={form.participants} onChange={(e) => set("participants", e.target.value)} aria-invalid={!!err("participants")} aria-describedby={err("participants") ? "participants-err" : undefined} />
            </Field>
            <Field label="שכבת גיל" htmlFor="ageGroup" error={err("ageGroup")}>
              <select id="ageGroup" value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)}>
                {ageOptions.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="toggle-grid">
            <label className={`toggle-card ${form.activeScouting ? "on" : ""}`}>
              <input type="checkbox" checked={form.activeScouting} onChange={(e) => set("activeScouting", e.target.checked)} />
              <span>
                <strong>זמן צופיות מעשי</strong>
                <small>שלב מעשי אמיתי בפעולה: קשרים, פיוניריה או עזרה ראשונה.</small>
              </span>
            </label>
            <label className={`toggle-card ${form.energeticMode ? "on" : ""}`}>
              <input type="checkbox" checked={form.energeticMode} onChange={(e) => set("energeticMode", e.target.checked)} />
              <span>
                <strong>מצב תנועתי</strong>
                <small>משחקי ישיבה הופכים למשימות ריצה ותנועה.</small>
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <>
            <p className="hint">בחרו שיטה אחת או יותר, וכתבו כמה זמן כל שיטה תיקח. זמן הפעולה הכולל הוא הסכום.</p>
            <div className="method-grid" role="group" aria-label="12 שיטות הדרכה">
              {METHODS.map((m, idx) => {
                const on = m.name in sel;
                const eid = `method-min-${idx}`;
                return (
                  <div key={m.name} className={`method-card ${on ? "on" : ""}`}>
                    <label className="method-check">
                      <input type="checkbox" checked={on} onChange={(e) => toggleMethod(m.name, e.target.checked)} />
                      <span>
                        <strong>{m.name}</strong>
                        <small>{m.description}</small>
                      </span>
                    </label>
                    {on && (
                      <div className={`method-time ${err(`m:${m.name}`) ? "has-error" : ""}`}>
                        <label htmlFor={eid}>כמה זמן היא תיקח? (בדקות)</label>
                        <input
                          id={eid}
                          type="number"
                          min={1}
                          max={120}
                          value={sel[m.name]}
                          onChange={(e) => setSel((s) => ({ ...s, [m.name]: e.target.value }))}
                          aria-invalid={!!err(`m:${m.name}`)}
                          aria-describedby={err(`m:${m.name}`) ? `${eid}-err` : undefined}
                        />
                        {err(`m:${m.name}`) && (
                          <p className="error-text" id={`${eid}-err`} role="alert">
                            {err(`m:${m.name}`)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="total" aria-live="polite">
              זמן הפעולה הכולל: <strong>{total}</strong> דקות ({methodCount} שיטות)
            </p>
            {err("methods") && (
              <p className="error-text" role="alert">
                {err("methods")}
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <div>
            <dl className="review">
              <div>
                <dt>נושא</dt>
                <dd>{form.topic}</dd>
              </div>
              <div>
                <dt>ערך מוביל</dt>
                <dd>{form.value || form.topic}</dd>
              </div>
              <div>
                <dt>מדריך/ה</dt>
                <dd>
                  {form.instructor} ({form.role})
                </dd>
              </div>
              <div>
                <dt>שבט</dt>
                <dd>
                  {form.tribe}
                  {form.battalion ? `, גדוד ${form.battalion}` : ""}
                </dd>
              </div>
              <div>
                <dt>שכבת גיל</dt>
                <dd>
                  {form.ageGroup}, {form.participants} משתתפים
                </dd>
              </div>
              <div>
                <dt>מצבים</dt>
                <dd>{[form.activeScouting && "זמן צופיות מעשי", form.energeticMode && "מצב תנועתי"].filter(Boolean).join(", ") || "ללא"}</dd>
              </div>
              <div>
                <dt>שיטות</dt>
                <dd>{Object.entries(sel).map(([n, m]) => `${n} (${m} דק')`).join(", ")}</dd>
              </div>
              <div>
                <dt>זמן כולל</dt>
                <dd>{total} דקות</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="wizard-nav">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => go(step - 1)}>
              חזרה
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            {step < 3 ? "המשך" : "צור פעולה חכמה"}
          </button>
        </div>
      </section>
    </form>
  );
}

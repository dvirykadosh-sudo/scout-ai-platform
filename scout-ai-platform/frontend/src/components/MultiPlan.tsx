"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { GENDER_GROUPS, GRADES } from "@/lib/constants";
import { useToast } from "./Providers";
import { Field } from "./ui";

interface Cell {
  ageGroup: string;
  activity: { id: number; title: string; durationMin: number } | null;
  note: string;
}
interface MultiResult {
  values: string[];
  ageGroups: string[];
  rows: { week: number; date: string | null; value: string | null; cells: Cell[] }[];
  missing: string[];
}

/** One plan for several age groups: the same value every week, and an activity for each group. */
export function MultiPlan() {
  const toast = useToast();
  const [weeks, setWeeks] = useState("6");
  const [grades, setGrades] = useState<string[]>(["ו'", "ז'", "ח'"]);
  const [gender, setGender] = useState("מעורב");
  const [values, setValues] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MultiResult | null>(null);

  const toggle = (g: string) => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weeks);
    if (!Number.isInteger(w) || w < 1 || w > 52) return toast("מספר השבועות חייב להיות בין 1 ל-52", { kind: "error" });
    if (!grades.length) return toast("בחרו לפחות שכבה אחת", { kind: "error" });
    if (grades.length > 8) return toast("אפשר עד 8 שכבות בבת אחת", { kind: "error" });
    setBusy(true);
    try {
      const ageGroups = GRADES.filter((g) => grades.includes(g)).map((g) => `כיתה ${g} - ${gender}`);
      const vals = values.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
      setRes(await api<MultiResult>("/api/plan/multi", { method: "POST", body: { weeks: w, ageGroups, values: vals, ...(start ? { startDate: start } : {}) } }));
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="mp-title">
      <h2 id="mp-title" className="section-title">
        תכנון לכמה שכבות יחד
      </h2>
      <p className="hint">כל השכבות עוסקות באותו ערך באותו שבוע, וכל שכבה מקבלת פעולה שמתאימה לגיל שלה. טוב לתכנון של שבט שלם.</p>
      <form className="card glass no-print" onSubmit={submit} aria-label="פרטי התכנון לכמה שכבות">
        <div className="form-grid">
          <Field label="כמה שבועות" htmlFor="mp-weeks">
            <input id="mp-weeks" type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </Field>
          <Field label="בנים, בנות או מעורב" htmlFor="mp-gender">
            <select id="mp-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              {GENDER_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="תאריך הפעולה הראשונה (לא חובה)" htmlFor="mp-start">
            <input id="mp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="ערכים, מופרדים בפסיק (לא חובה)" htmlFor="mp-values" hint="ריק: האתר בוחר מהערכים הנפוצים במאגר." className="span-2">
            <input id="mp-values" value={values} onChange={(e) => setValues(e.target.value)} />
          </Field>
        </div>
        <fieldset className="grade-picker">
          <legend>אילו שכבות</legend>
          <div className="grade-options">
            {GRADES.map((g) => (
              <label key={g} className="check">
                <input type="checkbox" checked={grades.includes(g)} onChange={() => toggle(g)} />
                <span>{g}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "מתכנן..." : "תכנון משותף לשכבות"}
        </button>
      </form>
      {res && (
        <div role="region" aria-label="תוצאות התכנון לכל השכבות" aria-live="polite">
          {res.missing.length > 0 && (
            <p className="card warn-box" role="note">
              <strong>ערכים בלי פעולה במאגר:</strong> {res.missing.join(", ")}
            </p>
          )}
          <div className="table-wrap">
            <table className="plan-table">
              <caption className="sr-only">תכנון שבועי לכל השכבות</caption>
              <thead>
                <tr>
                  <th scope="col">שבוע</th>
                  <th scope="col">ערך</th>
                  {res.ageGroups.map((g) => (
                    <th key={g} scope="col">
                      {g.replace("כיתה ", "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.week}>
                    <th scope="row">
                      {r.week}
                      {r.date && <span className="hint"> ({new Date(`${r.date}T12:00:00`).toLocaleDateString("he-IL")})</span>}
                    </th>
                    <td>{r.value ?? "-"}</td>
                    {r.cells.map((c) => (
                      <td key={c.ageGroup}>
                        {c.activity ? <Link href={`/library/${c.activity.id}`}>{c.activity.title}</Link> : "אין פעולה מתאימה"}
                        {c.note && <span className="hint"> ({c.note})</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions no-print">
            <button type="button" className="btn" onClick={() => window.print()}>
              הדפסה
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { PlanResponse } from "@/lib/types";
import { useToast } from "./Providers";
import { Field } from "./ui";

export function PlanPage() {
  const toast = useToast();
  const [weeks, setWeeks] = useState("8");
  const [age, setAge] = useState("כיתה ח' - מעורב");
  const [values, setValues] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weeks);
    if (!Number.isInteger(w) || w < 1 || w > 52) {
      toast("מספר השבועות חייב להיות בין 1 ל-52", { kind: "error" });
      return;
    }
    setBusy(true);
    try {
      const vals = values.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
      setPlan(await api<PlanResponse>("/api/plan", { method: "POST", body: { weeks: w, ageGroup: age, values: vals, ...(start ? { startDate: start } : {}) } }));
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
    setBusy(false);
  };

  const csv = () => {
    if (!plan) return;
    const rows = [["שבוע", "תאריך", "ערך מבוקש", "פעולה", "משך", "הערה"], ...plan.slots.map((s) => [s.week, s.date ?? "", s.wantedValue ?? "", s.activity?.title ?? "אין פעולה מתאימה", s.activity?.durationMin ?? "", s.note])];
    const text = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "תכנון-תקופתי.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <>
      <form className="card glass no-print" onSubmit={submit} aria-label="פרטי התכנון">
        <div className="form-grid">
          <Field label="כמה שבועות לתכנן" htmlFor="pl-weeks">
            <input id="pl-weeks" type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </Field>
          <Field label="שכבת גיל" htmlFor="pl-age">
            <select id="pl-age" value={age} onChange={(e) => setAge(e.target.value)}>
              {AGE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="תאריך הפעולה הראשונה (לא חובה)" htmlFor="pl-start">
            <input id="pl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="ערכים שרוצים לכסות, מופרדים בפסיק" htmlFor="pl-values" hint="למשל: אחריות, חברות, מנהיגות. אפשר להשאיר ריק." className="span-2">
            <input id="pl-values" value={values} onChange={(e) => setValues(e.target.value)} />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "מתכנן..." : "בניית תכנון"}
        </button>
      </form>

      {plan && (
        <div role="region" aria-label="תוצאות התכנון" aria-live="polite">
          {plan.missing.length > 0 && (
            <div className="card warn-box" role="note">
              <p>
                <strong>ערכים שאין להם פעולה במאגר:</strong> {plan.missing.join(", ")}. כדאי ליצור פעולות חדשות בנושאים האלה.
              </p>
              <Link className="btn" href="/">
                יצירת פעולה חדשה
              </Link>
            </div>
          )}
          <div className="table-wrap">
            <table className="plan-table">
              <caption className="sr-only">תכנון שבועי</caption>
              <thead>
                <tr>
                  <th scope="col">שבוע</th>
                  <th scope="col">תאריך</th>
                  <th scope="col">ערך</th>
                  <th scope="col">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {plan.slots.map((s) => (
                  <tr key={s.week}>
                    <th scope="row">{s.week}</th>
                    <td>{s.date ? new Date(`${s.date}T12:00:00`).toLocaleDateString("he-IL") : "-"}</td>
                    <td>{s.activity?.leadingValue ?? s.wantedValue ?? "-"}</td>
                    <td>
                      {s.activity ? (
                        <Link href={`/library/${s.activity.id}`}>{s.activity.title}</Link>
                      ) : (
                        "אין פעולה מתאימה במאגר"
                      )}
                      {s.note && <span className="hint"> ({s.note})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="section-title">כיסוי ערכים</h2>
          <ul className="plain-list">
            {plan.coverage.map((c) => (
              <li key={c.value}>
                {c.value}: {c.planned > 0 ? `מתוכנן ${c.planned} פעמים` : "לא מתוכנן"} (במאגר {c.count})
              </li>
            ))}
          </ul>
          <div className="actions no-print">
            <button type="button" className="btn" onClick={csv}>
              הורדה כקובץ CSV (אקסל)
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              הדפסה
            </button>
          </div>
        </div>
      )}
    </>
  );
}

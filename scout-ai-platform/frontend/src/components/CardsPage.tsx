"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { Field, Skeleton } from "./ui";

const clean = (l: string) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim();
const lines = (t: string) => t.split(/\n+/).map(clean).filter((l) => l.length > 3);

export function CardsPage() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [roles, setRoles] = useState("");
  const [kind, setKind] = useState<"questions" | "tasks" | "roles">("questions");

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`).then(setA).catch((e) => setError(errorMessage(e)));
  }, [id]);

  const { questions, tasks } = useMemo(() => {
    if (!a) return { questions: [] as string[], tasks: [] as string[] };
    const disc = a.stages.filter((s) => s.name.includes("דיון")).flatMap((s) => lines(s.content));
    const q = disc.filter((l) => l.includes("?"));
    const act = a.stages.filter((s) => !s.name.includes("דיון") && !s.name.includes("סיכום") && !s.name.includes("פתיחה")).flatMap((s) => lines(s.content));
    return { questions: q.length ? q : disc, tasks: act };
  }, [a]);

  useEffect(() => {
    if (a && !roles) setRoles(["מוביל/ה", "מתזמן/ת", "מתעד/ת", "דובר/ת הקבוצה", "אחראי/ת ציוד", "שומר/ת הכללים"].join("\n"));
  }, [a, roles]);

  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!a) return <Skeleton lines={4} />;

  const items = kind === "questions" ? questions : kind === "tasks" ? tasks : lines(roles);
  const heading = kind === "questions" ? "שאלה" : kind === "tasks" ? "משימה" : "תפקיד";

  return (
    <>
      <div className="no-print">
        <p>
          <Link href={`/library/${a.id}`}>חזרה לפעולה</Link>
        </p>
        <h1>כרטיסים להדפסה: {a.title}</h1>
        <fieldset className="card glass">
          <legend>סוג הכרטיסים</legend>
          <div className="actions" role="radiogroup" aria-label="סוג הכרטיסים">
            {(
              [
                ["questions", "שאלות לדיון"],
                ["tasks", "משימות"],
                ["roles", "תפקידים"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="check">
                <input type="radio" name="cards-kind" checked={kind === k} onChange={() => setKind(k)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {kind === "roles" && (
            <Field label="תפקידים, כל אחד בשורה" htmlFor="cards-roles">
              <textarea id="cards-roles" rows={6} value={roles} onChange={(e) => setRoles(e.target.value)} />
            </Field>
          )}
          <p className="hint">{items.length} כרטיסים. בהדפסה מופיעים שמונה כרטיסים בעמוד, וקווי חיתוך מקווקווים.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={items.length === 0}>
            הדפסה / שמירה כ-PDF
          </button>
        </fieldset>
        {items.length === 0 && <p>אין בפעולה הזאת טקסט מתאים לכרטיסים מסוג זה. אפשר לערוך את הפעולה ולהוסיף שורות.</p>}
      </div>
      <ul className="cards-sheet" aria-label="הכרטיסים">
        {items.map((t, i) => (
          <li key={i} className="print-card">
            <span className="print-card-kind">
              {heading} {i + 1}
            </span>
            <span className="print-card-text">{t}</span>
            <span className="print-card-foot">{a.title}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

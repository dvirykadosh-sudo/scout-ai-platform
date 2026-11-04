"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

export function SubstituteBrief() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`).then(setA).catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!a) return <Skeleton lines={5} />;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const briefUrl = `${origin}/library/${a.id}/brief`;
  const fieldUrl = `${origin}/field/${a.id}`;
  const message = [
    `היי, תודה שאתה מחליף! הפעולה: "${a.title}" (${a.ageGroup}, ${a.durationMin} דקות).`,
    `כל מה שצריך כתוב כאן: ${briefUrl}`,
    `מצב הדרכה עם טיימר, מתאים לטלפון: ${fieldUrl}`,
    a.equipment ? `ציוד: ${a.equipment}` : "",
    note.trim() ? `ממני: ${note.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast("ההודעה הועתקה. אפשר להדביק בוואטסאפ", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. סמנו את ההודעה והעתיקו ידנית", { kind: "error" });
    }
  };

  return (
    <article className="printable">
      <p className="no-print">
        <Link href={`/library/${a.id}`}>חזרה לפעולה</Link>
      </p>
      <h1>דף למדריך מחליף: {a.title}</h1>
      <p>
        {a.ageGroup} · {a.groupSize} משתתפים · {a.durationMin} דקות · ערך מוביל: {a.leadingValue}
      </p>
      <section className="card glass no-print" aria-labelledby="sub-share">
        <h2 id="sub-share" className="section-title">
          שליחה למחליף
        </h2>
        <p className="hint">אין צורך בחשבון. הקישורים פתוחים לכל מי שמקבל אותם.</p>
        <Field label="הערה אישית למחליף (לא חובה)" htmlFor="sub-note">
          <textarea id="sub-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: הקבוצה אוהבת משחקים, אז אל תתעכבו על ההסבר" />
        </Field>
        <label htmlFor="sub-msg" className="sr-only">
          ההודעה שתישלח
        </label>
        <textarea id="sub-msg" rows={6} readOnly value={message} onFocus={(e) => e.currentTarget.select()} />
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={copy}>
            העתקת ההודעה
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            הדפסה
          </button>
          <Link className="btn" href={`/field/${a.id}`}>
            פתיחת מצב שטח
          </Link>
        </div>
      </section>
      <section className="card glass">
        <h2 className="section-title">מה להכין</h2>
        <p>
          <strong>ציוד:</strong> {a.equipment}
        </p>
        <p>
          <strong>בטיחות ורגישות:</strong> {a.safetyNotes}
        </p>
      </section>
      <section className="card glass">
        <h2 className="section-title">מהלך הפעולה</h2>
        <ol className="brief-stages">
          {a.stages.map((s) => (
            <li key={s.name}>
              <h3>
                {s.name} <span className="meta">({s.minutes} דקות)</span>
              </h3>
              <p className="pre-line">{s.content}</p>
            </li>
          ))}
        </ol>
        {a.conclusionNote && (
          <p>
            <strong>לסיום:</strong> {a.conclusionNote}
          </p>
        )}
      </section>
    </article>
  );
}

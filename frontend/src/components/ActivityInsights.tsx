"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";

/** Loads its data the first time the section is opened. */
function useLazy<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    if (data || error) return;
    api<T>(path)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  };
  return { data, error, load };
}

const useCopy = () => {
  const toast = useToast();
  return async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(ok, { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק", { kind: "error" });
    }
  };
};

interface Levels {
  value: string;
  levels: { key: string; label: string; note: string; questions: string[] }[];
}

export function DiscussionQuestions({ activityId }: { activityId: number }) {
  const copy = useCopy();
  const { data, error, load } = useLazy<Levels>(`/api/activities/${activityId}/questions`);
  const text = data ? data.levels.map((l) => `${l.label}\n${l.questions.map((q) => `- ${q}`).join("\n")}`).join("\n\n") : "";
  return (
    <details id="questions" className="card glass insight no-print" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>שאלות לדיון בארבע רמות</summary>
      {error && <p className="error-box" role="alert">{error}</p>}
      {!data && !error && <p role="status">טוען...</p>}
      {data && (
        <>
          {data.levels.map((l) => (
            <section key={l.key} aria-label={l.label}>
              <h3 className="sub-title">{l.label}</h3>
              <p className="hint">{l.note}</p>
              <ul>
                {l.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          ))}
          <button type="button" className="btn" onClick={() => copy(text, "השאלות הועתקו")}>
            העתקת השאלות
          </button>
        </>
      )}
    </details>
  );
}

export function SummaryBox({ activityId }: { activityId: number }) {
  const copy = useCopy();
  const { data, error, load } = useLazy<{ parents: string; leader: string }>(`/api/activities/${activityId}/summary`);
  return (
    <details className="card glass insight no-print" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>סיכום קצר להורים ולמדריך</summary>
      {error && <p className="error-box" role="alert">{error}</p>}
      {!data && !error && <p role="status">טוען...</p>}
      {data && (
        <>
          <h3 className="sub-title">להורים (מוכן לוואטסאפ)</h3>
          <pre className="copy-text" tabIndex={0} aria-label="סיכום להורים">{data.parents}</pre>
          <button type="button" className="btn" onClick={() => copy(data.parents, "הסיכום להורים הועתק")}>
            העתקה להורים
          </button>
          <h3 className="sub-title">למדריך ולהנהגה</h3>
          <pre className="copy-text" tabIndex={0} aria-label="סיכום למדריך">{data.leader}</pre>
          <button type="button" className="btn" onClick={() => copy(data.leader, "הסיכום למדריך הועתק")}>
            העתקה למדריך
          </button>
          <p className="hint">הסיכום נבנה אוטומטית מתוכן הפעולה. כדאי לקרוא אותו לפני ששולחים.</p>
        </>
      )}
    </details>
  );
}

interface Review {
  score: number;
  ok: number;
  total: number;
  checks: { id: string; label: string; ok: boolean; tip: string }[];
}

export function ReviewPanel({ activityId }: { activityId: number }) {
  const { data, error, load } = useLazy<Review>(`/api/activities/${activityId}/review`);
  return (
    <details className="card glass insight no-print" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>בדיקת מבנה אוטומטית</summary>
      {error && <p className="error-box" role="alert">{error}</p>}
      {!data && !error && <p role="status">בודק...</p>}
      {data && (
        <>
          <p>
            עברו {data.ok} מתוך {data.total} בדיקות. זו בדיקה גסה לפי מילים ומספרים, והיא לא מחליפה את שיקול הדעת שלכם.
          </p>
          <ul className="plain-list review-list">
            {data.checks.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{c.ok ? "עבר" : "כדאי לשפר"}: </strong>
                  {c.label}
                  {!c.ok && <span className="hint"> · {c.tip}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

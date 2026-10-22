"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";

const MODE_KEY = "scout.newbie.mode";

/** מצב מדריך חדש: נשמר במכשיר. */
export function useNewbieMode() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(storageGet(MODE_KEY) === "1"), []);
  const set = (v: boolean) => {
    setOn(v);
    storageSet(MODE_KEY, v ? "1" : "0");
  };
  return { on, set };
}

interface Tips {
  before: string[];
  during: { minute: number; stage: string; minutes: number; tip: string; longStage: boolean }[];
  ifThen: { problem: string; answer: string }[];
  after: string[];
  totalMinutes: number;
}

/** טיפים לפעולה מסוימת עבור מי שמפעיל בפעם הראשונה. פתוח כברירת מחדל כשמצב מדריך חדש פעיל. */
export function NewbieTips({ activityId }: { activityId: number }) {
  const { on, set } = useNewbieMode();
  const [open, setOpen] = useState(false);
  const [tips, setTips] = useState<Tips | null>(null);
  const [error, setError] = useState("");

  useEffect(() => setOpen(on), [on]);
  useEffect(() => {
    if (!open || tips || error) return;
    api<Tips>(`/api/activities/${activityId}/newbie`)
      .then(setTips)
      .catch((e) => setError(errorMessage(e)));
  }, [open, tips, error, activityId]);

  return (
    <details id="newbie" className="card glass insight no-print" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>טיפים למדריך חדש</summary>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!tips && !error && <p role="status">טוען...</p>}
      {tips && (
        <>
          <h3 className="sub-title">לפני הפעולה</h3>
          <ul>
            {tips.before.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <h3 className="sub-title">במהלך הפעולה, שלב אחר שלב</h3>
          <ol className="newbie-steps">
            {tips.during.map((d) => (
              <li key={d.stage}>
                <strong>
                  דקה {d.minute}: {d.stage}
                </strong>{" "}
                <span className="meta">({d.minutes} דקות)</span>
                <p>{d.tip}</p>
                {d.longStage && <p className="hint">זה שלב ארוך. כדאי לבדוק באמצע שהקבוצה עדיין איתכם.</p>}
              </li>
            ))}
          </ol>
          <h3 className="sub-title">אם משהו משתבש</h3>
          <dl className="glossary">
            {tips.ifThen.map((x) => (
              <div key={x.problem}>
                <dt>{x.problem}</dt>
                <dd>{x.answer}</dd>
              </div>
            ))}
          </dl>
          <h3 className="sub-title">אחרי הפעולה</h3>
          <ul>
            {tips.after.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            <Link href="/new">למדריך המלא למדריך חדש</Link> ·{" "}
            <button type="button" className="btn btn-small" onClick={() => set(!on)}>
              {on ? "כיבוי מצב מדריך חדש" : "הפעלת מצב מדריך חדש"}
            </button>
          </p>
        </>
      )}
    </details>
  );
}

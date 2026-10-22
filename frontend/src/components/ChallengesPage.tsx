"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AgeField, useQuickMake } from "./QuickMake";
import { Skeleton } from "./ui";

interface Challenge {
  id: string;
  label: string;
  desc: string;
  topic: string;
  value: string;
  kind: string;
  care: string;
  guidance: string;
}

/** Real situations in a group, each with a ready activity and a note on how to handle it with care. */
export function ChallengesPage() {
  const [items, setItems] = useState<Challenge[] | null>(null);
  const { age, setAge, busy, make } = useQuickMake();
  useEffect(() => {
    api<Challenge[]>("/api/challenges").then(setItems).catch(() => setItems([]));
  }, []);
  if (!items) return <Skeleton lines={5} />;
  return (
    <>
      <form className="card glass" onSubmit={(e) => e.preventDefault()} aria-label="שכבת הגיל">
        <div className="form-grid">
          <AgeField id="ch-age" age={age} setAge={setAge} />
        </div>
        <p className="hint">הפעולות האלה לא פותרות בעיה לבד. הן פותחות שיחה עם כל הקבוצה, בלי להצביע על אף חניך.</p>
      </form>
      {busy && <p role="status">בונה פעולה, זה לוקח כמה שניות...</p>}
      <ul className="kind-guide">
        {items.map((c) => (
          <li key={c.id} className="card glass">
            <h2 className="card-title">{c.label}</h2>
            <p>{c.desc}</p>
            <p className="warn-box" role="note">
              <strong>שימו לב: </strong>
              {c.care}
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={busy} aria-label={`יצירת פעולה לאתגר: ${c.label}`} onClick={() => make({ topic: c.topic, value: c.value, kind: c.kind, seedText: c.guidance })}>
                יצירת פעולה מתאימה
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

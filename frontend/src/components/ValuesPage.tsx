"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AgeField, KindField, useQuickMake } from "./QuickMake";
import { Skeleton } from "./ui";

interface ValueItem {
  id: string;
  label: string;
  short: string;
  midah?: string;
  topics: string[];
}

/** Pick a scouting value, then one of its topics, and the site builds the activity. */
export function ValuesPage() {
  const [items, setItems] = useState<ValueItem[] | null>(null);
  const [kind, setKind] = useState("");
  const { age, setAge, busy, make } = useQuickMake();
  useEffect(() => {
    api<ValueItem[]>("/api/values").then(setItems).catch(() => setItems([]));
  }, []);
  if (!items) return <Skeleton lines={5} />;
  return (
    <>
      <form className="card glass" onSubmit={(e) => e.preventDefault()} aria-label="הגדרות היצירה">
        <div className="form-grid">
          <AgeField id="val-age" age={age} setAge={setAge} />
          <KindField id="val-kind" kind={kind} setKind={setKind} empty="האתר יבחר" />
        </div>
        <p className="hint">בוחרים נושא בכל ערך, ומקבלים פעולה מלאה בשכבת הגיל שבחרתם.</p>
      </form>
      {busy && <p role="status">בונה פעולה, זה לוקח כמה שניות...</p>}
      <ul className="kind-guide">
        {items.map((v) => (
          <li key={v.id} className="card glass">
            <h2 className="card-title">{v.label}</h2>
            <p className="lead-small">{v.short}</p>
            {v.midah && <p className="meta">קשור למידה {v.midah}'</p>}
            <ul className="plain-list">
              {v.topics.map((t) => (
                <li key={t}>
                  <span>{t}</span>
                  <button type="button" className="btn btn-small" disabled={busy} aria-label={`יצירת פעולה בנושא ${t} (${v.label})`} onClick={() => make({ topic: t, value: v.label, ...(kind ? { kind } : {}) })}>
                    יצירת פעולה
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

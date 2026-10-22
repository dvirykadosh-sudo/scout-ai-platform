"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

export interface Story {
  id: string;
  title: string;
  type: string;
  value: string;
  text: string;
  question: string;
}

export const storyText = (s: Story) => `${s.title}\n\n${s.text}\n\nשאלה לשיחה: ${s.question}`;

/** A small library of original short stories and parables, to read in an activity. */
export function StoriesPage() {
  const toast = useToast();
  const [all, setAll] = useState<Story[] | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    api<Story[]>("/api/stories").then(setAll).catch(() => setAll([]));
  }, []);
  const values = useMemo(() => [...new Set((all ?? []).map((s) => s.value))], [all]);
  if (!all) return <Skeleton lines={5} />;
  const shown = value ? all.filter((s) => s.value === value) : all;
  const copy = async (s: Story) => {
    try {
      await navigator.clipboard.writeText(storyText(s));
      toast("הסיפור הועתק", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק", { kind: "error" });
    }
  };
  return (
    <>
      <form className="card glass" onSubmit={(e) => e.preventDefault()} aria-label="סינון סיפורים">
        <Field label="ערך" htmlFor="st-value">
          <select id="st-value" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">כל הערכים</option>
            {values.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <p className="hint">הסיפורים קצרים וכתובים במיוחד לאתר. אפשר להקריא אותם כמו שהם, או לספר במילים שלכם. בתוך פעולה שיצרתם אפשר להוסיף סיפור ישירות לשלב.</p>
      </form>
      <div role="region" aria-live="polite" aria-label="סיפורים">
        <ul className="list">
          {shown.map((s) => (
            <li key={s.id} className="card glass">
              <h2 className="card-title">{s.title}</h2>
              <p className="meta">
                {s.type} · ערך: {s.value}
              </p>
              <p>{s.text}</p>
              <p>
                <strong>שאלה לשיחה: </strong>
                {s.question}
              </p>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => copy(s)} aria-label={`העתקת הסיפור ${s.title}`}>
                  העתקה
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

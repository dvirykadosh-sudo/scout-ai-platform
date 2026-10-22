"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage, storageGet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { quickCreate } from "@/lib/kinds";
import { useAuth, useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

interface Idea {
  id: string;
  category: string;
  title: string;
  value: string;
  minutes: number;
  equipment: string;
  how: string;
}

/** A bank of big ideas for peak activities, each one can become a full activity. */
export function PeakIdeas() {
  const router = useRouter();
  const toast = useToast();
  const { token, user } = useAuth();
  const [data, setData] = useState<{ categories: string[]; items: Idea[] } | null>(null);
  const [cat, setCat] = useState("");
  const [age, setAge] = useState("כיתה ח' - מעורב");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api<{ categories: string[]; items: Idea[] }>("/api/peak-ideas")
      .then(setData)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
    const saved = storageGet("scout.quick.age");
    if (saved && AGE_GROUPS.includes(saved)) setAge(saved);
  }, [toast]);

  const build = async (i: Idea) => {
    setBusy(i.id);
    try {
      const a = await quickCreate(token, { kind: "peak", topic: i.title, value: i.value, seedText: i.how, ageGroup: age, ...(user ? { instructor: user.displayName } : {}) });
      toast(`נוצרה פעולת שיא: ${a.title}`, { kind: "success" });
      router.push(`/library/${a.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusy("");
    }
  };

  if (!data) return <Skeleton lines={5} label="טוען רעיונות" />;
  const items = cat ? data.items.filter((i) => i.category === cat) : data.items;

  return (
    <>
      <div className="form-grid">
        <Field label="סוג הרעיון" htmlFor="idea-cat">
          <select id="idea-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">הכול</option>
            {data.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="שכבת גיל לפעולה" htmlFor="idea-age">
          <select id="idea-age" value={age} onChange={(e) => setAge(e.target.value)}>
            {AGE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="count" role="status" aria-live="polite">
        {items.length} רעיונות
      </p>
      <ul className="examples-list">
        {items.map((i) => (
          <li key={i.id} className="card glass">
            <h2 className="card-title">{i.title}</h2>
            <ul className="chips" aria-label="פרטי הרעיון">
              <li className="chip chip-accent">{i.category}</li>
              <li className="chip">{i.minutes} דקות</li>
              <li className="chip">ערך: {i.value}</li>
            </ul>
            <p>{i.how}</p>
            <p className="meta">ציוד: {i.equipment}</p>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => build(i)}>
                {busy === i.id ? "בונה..." : "בנו מזה פעולת שיא"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

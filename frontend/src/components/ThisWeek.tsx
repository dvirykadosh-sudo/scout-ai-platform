"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage, storageGet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { KIND_LABELS } from "@/lib/kind-labels";
import { quickCreate } from "@/lib/kinds";
import { useAuth, useToast } from "./Providers";

interface Sug {
  topic: string;
  value: string;
  kind: string;
  reason: string;
}
interface Featured {
  topic: string;
  value: string;
  kind: string;
  note: string;
}
interface Gaps {
  suggest: string;
  message: string;
  kinds: { id: string; label: string; daysAgo: number | null }[];
}

const AGE_KEY = "scout.quick.age";

function useQuick() {
  const router = useRouter();
  const toast = useToast();
  const { token, user } = useAuth();
  const [busyKey, setBusyKey] = useState("");
  const run = async (key: string, body: { topic?: string; value?: string; kind?: string }) => {
    setBusyKey(key);
    try {
      const saved = storageGet(AGE_KEY);
      const a = await quickCreate(token, {
        ...body,
        ageGroup: saved && AGE_GROUPS.includes(saved) ? saved : "כיתה ח' - מעורב",
        ...(user ? { instructor: user.displayName } : {}),
      });
      toast(`נוצרה פעולה: ${a.title}`, { kind: "success" });
      router.push(`/library/${a.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusyKey("");
    }
  };
  return { run, busyKey };
}

const prefill = (s: { topic: string; value: string; kind: string }) => `/?topic=${encodeURIComponent(s.topic)}&value=${encodeURIComponent(s.value)}&kind=${s.kind}`;

/** Home page: what is missing for this instructor, three suggestions for the week, and picks from the tribe leader. */
export function ThisWeek() {
  const { token } = useAuth();
  const [week, setWeek] = useState<Sug[]>([]);
  const [gaps, setGaps] = useState<Gaps | null>(null);
  const [featured, setFeatured] = useState<Featured[]>([]);
  const { run, busyKey } = useQuick();

  useEffect(() => {
    api<{ items: Sug[] }>("/api/suggest/week", { token })
      .then((d) => setWeek(d.items))
      .catch(() => {});
    api<Gaps>("/api/me/gaps", { token })
      .then(setGaps)
      .catch(() => {});
    api<{ items: Featured[] }>("/api/featured")
      .then((d) => setFeatured(d.items))
      .catch(() => {});
  }, [token]);

  return (
    <>
      {featured.length > 0 && (
        <section className="card glass featured" aria-labelledby="featured-title">
          <h2 id="featured-title" className="section-title">
            הצעות ממנהל השבט
          </h2>
          <ul className="suggest-list">
            {featured.map((f) => (
              <li key={f.topic}>
                <span className="chip chip-accent">{KIND_LABELS[f.kind] ?? f.kind}</span>
                <strong>{f.topic}</strong>
                {f.note && <span className="meta">{f.note}</span>}
                <span className="actions">
                  <button type="button" className="btn btn-primary" disabled={!!busyKey} onClick={() => run(`f:${f.topic}`, { topic: f.topic, value: f.value, kind: f.kind })}>
                    {busyKey === `f:${f.topic}` ? "יוצר..." : "צרו פעולה"}
                  </button>
                  <Link className="btn" href={prefill(f)}>
                    לערוך בטופס
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gaps && (
        <section className="card glass gap-box" aria-labelledby="gap-title">
          <h2 id="gap-title" className="section-title">
            מה חסר לך
          </h2>
          <p>{gaps.message}</p>
          <ul className="gap-list" aria-label="מתי יצרת או הפעלת כל סוג">
            {gaps.kinds.map((k) => (
              <li key={k.id} className={k.id === gaps.suggest ? "gap-top" : ""}>
                <span>{k.label}</span>
                <span className="meta">{k.daysAgo === null ? "עוד לא" : k.daysAgo === 0 ? "היום" : `לפני ${k.daysAgo} ימים`}</span>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={!!busyKey} onClick={() => run("gap", { kind: gaps.suggest })}>
              {busyKey === "gap" ? "יוצר..." : `צרו ${KIND_LABELS[gaps.suggest] ?? "פעולה"} עכשיו`}
            </button>
          </div>
        </section>
      )}

      {week.length > 0 && (
        <section className="card glass this-week" aria-labelledby="week-title">
          <h2 id="week-title" className="section-title">
            מה לעשות השבוע
          </h2>
          <p className="hint">שלוש הצעות שנבחרו לפי התאריך, העונה ומה שחסר לך. ההצעות נשארות אותו דבר כל השבוע.</p>
          <ul className="suggest-list">
            {week.map((s) => (
              <li key={s.topic}>
                <span className="chip chip-accent">{KIND_LABELS[s.kind] ?? s.kind}</span>
                <strong>{s.topic}</strong>
                <span className="meta">{s.reason}</span>
                <span className="actions">
                  <button type="button" className="btn btn-primary" disabled={!!busyKey} onClick={() => run(`w:${s.topic}`, { topic: s.topic, value: s.value, kind: s.kind })}>
                    {busyKey === `w:${s.topic}` ? "יוצר..." : "צרו פעולה"}
                  </button>
                  <Link className="btn" href={prefill(s)}>
                    לערוך בטופס
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

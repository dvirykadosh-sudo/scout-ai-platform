"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, storageGet, storageSet } from "@/lib/api";
import { useNewbieMode } from "./NewbieTips";
import { useQuickMake } from "./QuickMake";
import { AgeField } from "./QuickMake";

interface Guide {
  journey: { id: string; title: string; text: string; href: string; cta: string }[];
  glossary: { term: string; text: string }[];
}

const KEY = "scout.newbie.done";

/** דף פתיחה למדריך חדש: מסלול בשישה צעדים, מילון קצר, ופעולה ראשונה בלחיצה. */
export function NewbieGuide() {
  const { on, set } = useNewbieMode();
  const { age, setAge, busy, make } = useQuickMake();
  const [g, setG] = useState<Guide | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    api<Guide>("/api/newbie/guide")
      .then(setG)
      .catch((e) => setError(errorMessage(e)));
    try {
      setDone(JSON.parse(storageGet(KEY) ?? "[]"));
    } catch {
      setDone([]);
    }
  }, []);

  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    storageSet(KEY, JSON.stringify(next));
  };

  return (
    <>
      <section className="card glass" aria-labelledby="nb-mode">
        <h2 id="nb-mode" className="section-title">
          מצב מדריך חדש
        </h2>
        <p>כשהמצב פעיל, בכל עמוד פעולה מופיעים טיפים צעד אחר צעד: מה להכין, מה לעשות בכל שלב ומה עושים כשמשהו משתבש.</p>
        <label className="check">
          <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
          <span>להפעיל מצב מדריך חדש</span>
        </label>
      </section>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      {g && (
        <section aria-labelledby="nb-journey">
          <h2 id="nb-journey" className="section-title">
            שישה צעדים לפעולה הראשונה ({done.length} מתוך {g.journey.length})
          </h2>
          <ol className="journey">
            {g.journey.map((s) => (
              <li key={s.id} className="card glass">
                <label className="check">
                  <input type="checkbox" checked={done.includes(s.id)} onChange={() => toggle(s.id)} />
                  <span>
                    <strong>{s.title}</strong>
                  </span>
                </label>
                <p>{s.text}</p>
                <Link className="btn btn-small" href={s.href}>
                  {s.cta}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card glass" aria-labelledby="nb-first">
        <h2 id="nb-first" className="section-title">
          הפעולה הראשונה שלי
        </h2>
        <p>פעולת היכרות קצרה וקלה, בלי ציוד מיוחד. בחרו שכבה והאתר יכין אותה.</p>
        <div className="form-grid">
          <AgeField id="nb-age" age={age} setAge={setAge} />
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => make({ kind: "intro", minutes: 30 })}>
            {busy ? "יוצר..." : "צרו לי פעולה ראשונה"}
          </button>
          <Link className="btn" href="/quick">
            או מצב מהיר מהמאגר
          </Link>
        </div>
      </section>

      {g && (
        <section id="glossary" aria-labelledby="nb-gloss">
          <h2 id="nb-gloss" className="section-title">
            מילון קצר
          </h2>
          <dl className="glossary card glass">
            {g.glossary.map((x) => (
              <div key={x.term}>
                <dt>{x.term}</dt>
                <dd>{x.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}

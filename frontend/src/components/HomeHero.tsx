"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, storageGet, storageSet } from "@/lib/api";
import type { Activity, ListResponse } from "@/lib/types";
import { Coverflow } from "./Depth3D";
import { ActivityGlance } from "./ActivityView";
import { TopicSuggestions } from "./TopicSuggestions";

const SEEN = "scout.hero.seen";

const STEPS = [
  ["ממלאים", "נושא, גיל וערך מוביל. שתי דקות."],
  ["בוחרים", "שיטות וזמנים, ואיך אתם רוצים שהפעולה תישמע."],
  ["מקבלים", "פעולה שלמה בחמישה שלבים, אפשר לערוך, להדפיס ולהוריד ל-Word."],
];

/** First-visit welcome and real examples from the library. */
export function HomeHero() {
  return <HomeWelcome />;
}

/** הכרטיס שמופיע רק בביקור הראשון. */
export function HomeWelcome() {
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    setSeen(storageGet(SEEN) === "1");
  }, []);

  const close = () => {
    storageSet(SEEN, "1");
    setSeen(true);
  };

  return (
    <>
      {!seen && (
        <section className="card glass hero" aria-labelledby="hero-title">
          <h2 id="hero-title" className="section-title">
            ברוכים הבאים, בשלוש לחיצות מגיעים לפעולה
          </h2>
          <ol className="hero-steps">
            {STEPS.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ol>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                close();
                window.setTimeout(() => document.getElementById("step-title")?.focus(), 50);
              }}
            >
              מתחילים
            </button>
            <Link className="btn" href="/library">
              קודם להציץ במאגר
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

/** השראה: נושאים מוצעים ודוגמאות מהמאגר. */
export function HomeInspiration() {
  const [examples, setExamples] = useState<Activity[]>([]);
  useEffect(() => {
    api<ListResponse>("/api/activities?sort=rating&pageSize=3")
      .then((d) => setExamples(d.items))
      .catch(() => {});
  }, []);
  return (
    <>
      <TopicSuggestions />
      {examples.length > 0 && (
        <section className="examples" aria-labelledby="ex-title">
          <h2 id="ex-title" className="section-title">
            מהמאגר, כדי לקבל השראה
          </h2>
          <Coverflow label="פעולות מומלצות מהמאגר">
            {examples.map((a) => (
              <div key={a.id} className="card glass">
                <h3 className="card-title">
                  <Link href={`/library/${a.id}`}>{a.title}</Link>
                </h3>
                <ActivityGlance a={a} />
              </div>
            ))}
          </Coverflow>
        </section>
      )}
    </>
  );
}

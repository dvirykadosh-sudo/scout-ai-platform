"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, storageGet, storageSet } from "@/lib/api";
import type { Activity, ListResponse } from "@/lib/types";
import { Coverflow } from "./Depth3D";
import { ActivityGlance } from "./ActivityView";
import { TopicSuggestions } from "./TopicSuggestions";

const SEEN = "scout.hero.seen";

/** אייקונים קטנים לשלושת השלבים (קו דק, בצבע ההדגשה). דקורטיביים בלבד. */
const ICONS = [
  <path key="a" d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 8.5l3 3" />,
  <path key="b" d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" />,
  <path key="c" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />,
];

const STEPS = [
  ["ממלאים", "נושא, גיל וערך מוביל. שתי דקות."],
  ["בוחרים", "שיטות וזמנים, ואיך אתם רוצים שהפעולה תישמע."],
  ["מקבלים", "פעולה שלמה בחמישה שלבים, אפשר לערוך, להדפיס ולהוריד ל-Word."],
];

/** First-visit welcome and real examples from the library. */
export function HomeHero() {
  return <HomeWelcome />;
}

/** הכרטיס שמופיע רק בביקור הראשון: שלושה אריחי זכוכית עם אייקון, ושתי פעולות. */
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
        <section className="card glass hero lux-welcome" aria-labelledby="hero-title">
          <span className="lux-orb lux-orb-a" aria-hidden="true" />
          <div className="lux-welcome-head">
            <p className="lux-eyebrow">ביקור ראשון</p>
            <h2 id="hero-title" className="section-title">
              ברוכים הבאים, בשלוש לחיצות מגיעים לפעולה
            </h2>
          </div>
          <ol className="hero-steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <svg className="lux-ico" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  {ICONS[i]}
                </svg>
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
        <section className="examples lux-examples" aria-labelledby="ex-title">
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

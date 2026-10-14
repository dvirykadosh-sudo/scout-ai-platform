"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Sug {
  topic: string;
  value: string;
}
interface Resp {
  events: { name: string; date: string; inDays: number; suggestions: Sug[] }[];
  seasonal: { name: string; suggestions: Sug[] }[];
  evergreen: Sug[];
}

const href = (s: Sug) => `/?topic=${encodeURIComponent(s.topic)}&value=${encodeURIComponent(s.value)}`;

/** Topic ideas for the coming weeks: holidays, the season, and always-relevant themes. */
export function TopicSuggestions() {
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => {
    api<Resp>("/api/topics/suggest?days=45")
      .then(setD)
      .catch(() => {});
  }, []);
  if (!d) return null;
  const when = (e: Resp["events"][number]) => (e.inDays === 0 ? "היום" : e.inDays === 1 ? "מחר" : `בעוד ${e.inDays} ימים`);
  return (
    <section className="card glass topic-ideas" aria-labelledby="topics-title">
      <h2 id="topics-title" className="section-title">
        רעיונות לנושא
      </h2>
      <p className="hint">לחיצה על רעיון ממלאת את הנושא והערך בטופס. תאריכי החגים הם התאריך העברי הרגיל, ויום השואה והזיכרון עשויים לזוז ביום.</p>
      {d.events.map((e) => (
        <div key={e.name}>
          <h3 className="sub-title">
            {e.name} <span className="meta">({when(e)}, {new Date(`${e.date}T12:00:00`).toLocaleDateString("he-IL")})</span>
          </h3>
          <ul className="tags">
            {e.suggestions.map((s) => (
              <li key={s.topic}>
                <Link href={href(s)}>{s.topic}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {d.seasonal.map((e) => (
        <div key={e.name}>
          <h3 className="sub-title">{e.name}</h3>
          <ul className="tags">
            {e.suggestions.map((s) => (
              <li key={s.topic}>
                <Link href={href(s)}>{s.topic}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <h3 className="sub-title">תמיד רלוונטי</h3>
      <ul className="tags">
        {d.evergreen.map((s) => (
          <li key={s.topic}>
            <Link href={href(s)}>{s.topic}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

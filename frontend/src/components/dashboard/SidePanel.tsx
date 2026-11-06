"use client";

// הפאנל הכהה בשמאל: קוביות סטטיסטיקה, לוח שנה חודשי, ורשימת האירועים הקרובים (או של היום שנבחר).
import { useMemo, useState } from "react";
import Link from "next/link";
import type { DashEvent } from "./dash-calc";
import { KIND_LABEL } from "./dash-calc";
import { fmtLong, todayIso } from "./dates";
import { MonthCalendar } from "./MonthCalendar";

export interface Cube {
  label: string;
  value: number;
}

export function SidePanel({ cubes, events }: { cubes: Cube[]; events: DashEvent[] }) {
  const [day, setDay] = useState<string | null>(null);
  const today = todayIso();
  const list = useMemo(() => (day ? events.filter((e) => e.date === day) : events.filter((e) => e.date >= today && e.kind !== "remind").slice(0, 6)), [events, day, today]);

  return (
    <aside className="db-side" aria-label="סיכום ולוח שנה">
      <h2>במבט מהיר</h2>
      <ul className="db-cubes" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {cubes.map((c) => (
          <li key={c.label} className="db-cube">
            <b>{c.value}</b>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>

      <MonthCalendar events={events} selected={day} onSelect={setDay} />

      <section aria-label={day ? `אירועים ב-${fmtLong(day)}` : "אירועים קרובים"}>
        <h2>{day ? fmtLong(day) : "אירועים קרובים"}</h2>
        {list.length === 0 ? (
          <p style={{ color: "var(--db-side-muted)", margin: "8px 0 0" }}>{day ? "אין אירועים ביום הזה." : "אין אירועים קרובים. אפשר לשבץ פעולה ביומן."}</p>
        ) : (
          <ul className="up-list" style={{ marginTop: 10 }}>
            {list.map((e) => (
              <li key={e.id}>
                <i className={`dot-${e.kind}`} aria-hidden="true" />
                <div>
                  <Link href={e.href} style={{ color: "inherit" }}><b>{e.title}</b></Link>
                  <small>{[KIND_LABEL[e.kind], day ? "" : fmtLong(e.date), e.time, e.sub].filter(Boolean).join(" · ")}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

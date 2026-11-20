"use client";

// שלב 71: מי תופס איזה חדר ואיזה ציוד ומתי (כל המדריכים בשבט). מתרענן לבד, כדי שהתנגשות תופיע בלי לרענן את הדף.
// מוצגים רק שם המדריך, השעות והמשאב. בלי שמות פעולות או קבוצות.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtDay, type Reservation } from "@/lib/organizer";
import { useAuth } from "../Providers";

const key = (r: Reservation) => `${r.date}|${r.time}`;

/** שם החדר/הציוד שתפוסים בשיבוץ אחד */
const whatOf = (r: Reservation) => [r.room, ...r.gear.map((g) => g.label)].filter(Boolean).join(" · ");

export function Reservations({ from, to, title = "מי תופס מה", pollMs = 45_000, showCalendarLink = false }: { from: string; to: string; title?: string; pollMs?: number; showCalendarLink?: boolean }) {
  const { token } = useAuth();
  const [list, setList] = useState<Reservation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      api<Reservation[]>(`/api/me/reservations?from=${from}&to=${to}`, { token })
        .then((r) => {
          if (live) {
            setList(r);
            setFailed(false);
          }
        })
        .catch(() => live && setFailed(true));
    };
    load();
    const t = window.setInterval(load, pollMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, [token, from, to, pollMs]);

  const days = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of [...(list ?? [])].sort((a, b) => key(a).localeCompare(key(b)))) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [list]);

  if (!token) return null;
  return (
    <section className="card glass res71 no-print" aria-labelledby="res71-title">
      <h2 id="res71-title" className="section-title">
        {title}
      </h2>
      {failed && <p className="hint">לא הצלחנו לטעון את התפוסה. מנסים שוב אוטומטית.</p>}
      {list && days.length === 0 && <p className="hint">אין שיבוצים עם חדר או ציוד בטווח הזה. בעורך השיבוץ ביומן אפשר לסמן חדר וציוד, ואז כפל שיבוץ יתפס מראש.</p>}
      {days.length > 0 && (
        <ul className="res71-days">
          {days.map(([date, rows]) => (
            <li key={date}>
              <h3>{fmtDay(date)}</h3>
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className={r.mine ? "is-mine" : ""}>
                    <span dir="ltr" className="res71-time">
                      {r.time}–{r.until}
                    </span>
                    <span>{whatOf(r)}</span>
                    <span className="hint">{r.by}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {showCalendarLink && (
        <p>
          <Link href="/calendar">ליומן לשיבוץ וביטול</Link>
        </p>
      )}
    </section>
  );
}

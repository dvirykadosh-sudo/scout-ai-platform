"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, storageGet, storageSet } from "@/lib/api";
import { fmtDay, todayLocal, type Reminder } from "@/lib/organizer";
import { useAuth } from "./Providers";

/** תזכורות פעילות: מה להכין לפעולה קרובה, ופעולות שעוד לא תועדו. */
export function RemindersBanner({ limit = 3, showEmpty = false }: { limit?: number; showEmpty?: boolean }) {
  const { token } = useAuth();
  const [items, setItems] = useState<Reminder[] | null>(null);

  const load = useCallback(() => {
    if (!token) {
      setItems(null);
      return;
    }
    api<{ items: Reminder[] }>(`/api/me/reminders?today=${todayLocal()}`, { token })
      .then((r) => {
        setItems(r.items);
        // התראת דפדפן, פעם אחת לכל תזכורת ביום, רק אם המדריך אישר
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const it of r.items.filter((x) => x.type === "prep")) {
            const key = `scout.notified.${todayLocal()}.${it.id}`;
            if (storageGet(key)) continue;
            storageSet(key, "1");
            try {
              new Notification("תזכורת לפעולה", { body: it.message, lang: "he", dir: "rtl" });
            } catch {
              /* notifications unavailable */
            }
          }
        }
      })
      .catch(() => setItems(null));
  }, [token]);
  useEffect(load, [load]);

  const dismiss = async (r: Reminder) => {
    await api(`/api/me/reminders/${r.id}/dismiss`, { method: "POST", token, body: { type: r.type } }).catch(() => {});
    load();
  };

  if (!items) return null;
  if (items.length === 0) {
    return showEmpty ? (
      <p className="card glass" role="status">
        אין תזכורות כרגע. שבצו פעולה ביומן כדי לקבל תזכורת הכנה.
      </p>
    ) : null;
  }
  const shown = items.slice(0, limit);
  return (
    <section className="card glass reminders" aria-labelledby="rem-title">
      <h2 id="rem-title" className="section-title">
        תזכורות
      </h2>
      <ul className="suggest-list">
        {shown.map((r) => (
          <li key={`${r.type}-${r.id}`}>
            <span className="chip chip-accent">{r.type === "prep" ? (r.daysLeft === 0 ? "היום" : r.daysLeft === 1 ? "מחר" : fmtDay(r.date)) : "לתיעוד"}</span>
            <span className="reminder-text">{r.message}</span>
            <span className="actions">
              {r.type === "log" && r.activityId && (
                <Link className="btn btn-primary" href={`/library/${r.activityId}#runs`}>
                  לתיעוד ההפעלה
                </Link>
              )}
              {r.type === "prep" && r.activityId && (
                <Link className="btn" href={`/library/${r.activityId}`}>
                  לפעולה
                </Link>
              )}
              <button type="button" className="btn" onClick={() => dismiss(r)}>
                {r.type === "prep" ? "הכנתי" : "לא רלוונטי"}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <p>
          ועוד {items.length - shown.length} תזכורות. <Link href="/calendar">ליומן</Link>
        </p>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";

interface Summary {
  count: number;
  average: number;
  distribution: number[];
  more: { yes: number; maybe: number; no: number };
  comments: { id: number; text: string; rating: number; createdAt: string }[];
}

/** For the activity's owner: what the children said, with no names. */
export function FeedbackPanel({ activityId, token }: { activityId: number; token: string }) {
  const toast = useToast();
  const [s, setS] = useState<Summary | null>(null);

  const load = useCallback(() => {
    api<Summary>(`/api/activities/${activityId}/feedback`, { token })
      .then(setS)
      .catch(() => setS(null));
  }, [activityId, token]);
  useEffect(load, [load]);

  const remove = async (id: number) => {
    try {
      await api(`/api/feedback/${id}`, { method: "DELETE", token });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  if (!s) return null;
  return (
    <section className="card glass no-print" aria-labelledby="fb-title">
      <h2 id="fb-title" className="section-title">
        משוב מחניכים (אנונימי)
      </h2>
      {s.count === 0 ? (
        <p>עוד לא התקבל משוב. בכפתור "משוב מחניכים" יש קישור וקוד QR שאפשר להקרין או להדפיס.</p>
      ) : (
        <>
          <p>
            {s.count} תשובות, ממוצע <strong>{s.average}</strong> מתוך 5. רוצים עוד: כן {s.more.yes}, אולי {s.more.maybe}, לא {s.more.no}.
          </p>
          <ul className="plain-list" aria-label="התפלגות הדירוגים">
            {s.distribution.map((c, i) => (
              <li key={i}>
                {i + 1} כוכבים: {c}
              </li>
            ))}
          </ul>
          {s.comments.length > 0 && (
            <ul className="plain-list notes-list" aria-label="מה אהבו">
              {s.comments.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.text} <span className="meta">({c.rating} מתוך 5)</span>
                  </span>
                  <button type="button" className="btn btn-small" onClick={() => remove(c.id)} aria-label="מחיקת התגובה">
                    מחיקה
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

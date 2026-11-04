"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, fieldErrorLines, fmtDate } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import type { RatingsResponse } from "@/lib/types";
import { isAdminUser, useAuth, useToast } from "./Providers";
import { Field } from "./ui";

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(value) ? "on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

export function RatingBadge({ average, count }: { average: number; count: number }) {
  if (!count) return <span className="hint">עדיין אין דירוגים</span>;
  return (
    <span className="rating-badge">
      <Stars value={average} />
      <span className="sr-only">{`דירוג ממוצע ${average} מתוך 5, מבוסס על ${count} דירוגים`}</span>
      <span aria-hidden="true">
        {average} ({count})
      </span>
    </span>
  );
}

export function Ratings({ activityId, onSummary }: { activityId: number; onSummary?: (s: { count: number; average: number }) => void }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const isAdmin = !!token && isAdminUser(user);
  const [data, setData] = useState<RatingsResponse | null>(null);
  const [error, setError] = useState("");
  const [stars, setStars] = useState(0);
  const [author, setAuthor] = useState("");
  const [ageUsed, setAgeUsed] = useState("");
  const [comment, setComment] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<RatingsResponse>(`/api/activities/${activityId}/ratings`)
      .then((d) => {
        setData(d);
        setError("");
        onSummary?.({ count: d.count, average: d.average });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [activityId, onSummary]);
  useEffect(load, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stars < 1) return setFormErrors(["יש לבחור דירוג בין 1 ל-5 כוכבים"]);
    setBusy(true);
    setFormErrors([]);
    try {
      await api(`/api/activities/${activityId}/ratings`, {
        method: "POST",
        body: { stars, comment: comment.trim(), author: author.trim(), ...(ageUsed ? { ageUsed } : {}) },
      });
      setStars(0);
      setComment("");
      toast("תודה! הדירוג נשמר", { kind: "success" });
      load();
    } catch (err) {
      const lines = fieldErrorLines(err);
      setFormErrors(lines.length ? lines : [errorMessage(err)]);
    }
    setBusy(false);
  };

  const remove = async (id: number) => {
    try {
      await api(`/api/ratings/${id}`, { method: "DELETE", token });
      toast("התגובה נמחקה", { kind: "success" });
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };

  return (
    <section id="ratings" className="ratings" aria-labelledby="ratings-title">
      <h2 id="ratings-title" className="section-title">
        דירוגים ותגובות
      </h2>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {data && (
        <p className="rating-summary">
          <RatingBadge average={data.average} count={data.count} />
        </p>
      )}

      <form className="rating-form" onSubmit={submit} noValidate aria-label="הוספת דירוג">
        {formErrors.length > 0 && (
          <div className="error-box" role="alert">
            <ul>
              {formErrors.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <fieldset className="star-fieldset">
          <legend>איך הפעולה עבדה?</legend>
          <div className="star-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={`star-radio ${stars >= n ? "on" : ""}`}>
                <input type="radio" name={`stars-${activityId}`} value={n} checked={stars === n} onChange={() => setStars(n)} />
                <span aria-hidden="true">★</span>
                <span className="sr-only">{n === 1 ? "כוכב אחד" : `${n} כוכבים`}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <Field label="שם (לא חובה)" htmlFor={`rt-author-${activityId}`}>
            <input id={`rt-author-${activityId}`} value={author} maxLength={60} onChange={(e) => setAuthor(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="בקבוצה באיזה גיל הופעלה? (לא חובה)" htmlFor={`rt-age-${activityId}`}>
            <select id={`rt-age-${activityId}`} value={ageUsed} onChange={(e) => setAgeUsed(e.target.value)}>
              <option value="">לא צוין</option>
              {AGE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="תגובה או טיפ למדריכים הבאים (לא חובה)" htmlFor={`rt-comment-${activityId}`} hint={`${comment.length}/600 תווים`} className="span-2">
            <textarea id={`rt-comment-${activityId}`} rows={3} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "שולח..." : "שליחת דירוג"}
        </button>
      </form>

      {data && data.items.length > 0 && (
        <ul className="comments" aria-label="תגובות">
          {data.items.map((r) => (
            <li key={r.id} className="comment">
              <div className="comment-head">
                <RatingBadge average={r.stars} count={1} />
                <span>{r.author || "מדריך/ה"}</span>
                {r.ageUsed && <span className="chip">{r.ageUsed}</span>}
                <time dateTime={r.createdAt} className="hint">
                  {fmtDate(r.createdAt)}
                </time>
                {isAdmin && (
                  <button type="button" className="btn btn-small btn-danger" onClick={() => remove(r.id)}>
                    מחיקה
                  </button>
                )}
              </div>
              {r.comment && <p>{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

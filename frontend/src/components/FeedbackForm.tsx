"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { Field } from "./ui";

const FACES = [
  [1, "בכלל לא"],
  [2, "פחות"],
  [3, "בסדר"],
  [4, "טוב"],
  [5, "מעולה"],
] as const;

/** The page children open from a QR code. Anonymous: nothing identifies the child. */
export function FeedbackForm() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("");
  const [rating, setRating] = useState(0);
  const [liked, setLiked] = useState("");
  const [more, setMore] = useState<"yes" | "maybe" | "no">("maybe");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`).then((a) => setTitle(a.title)).catch(() => setError("הפעולה לא נמצאה"));
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("בחרו כמה אהבתם");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/activities/${id}/feedback`, { method: "POST", body: { rating, liked: liked.trim(), more } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  if (done)
    return (
      <section className="card glass" role="status">
        <h1>תודה רבה!</h1>
        <p>המשוב נשלח. אף אחד לא רואה מי כתב אותו.</p>
      </section>
    );

  return (
    <form className="card glass feedback-form" onSubmit={submit} noValidate>
      <h1>איך הייתה הפעולה?</h1>
      {title && <p className="lead">{title}</p>}
      <p className="hint">המשוב אנונימי. לא צריך לכתוב שם.</p>
      <fieldset className="rating-fieldset">
        <legend>כמה אהבתם?</legend>
        <div className="face-row">
          {FACES.map(([n, label]) => (
            <label key={n} className={`face ${rating === n ? "on" : ""}`}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
              <span className="face-num" aria-hidden="true">
                {n}
              </span>
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="מה אהבתם? (לא חובה)" htmlFor="fb-liked">
        <textarea id="fb-liked" rows={3} maxLength={200} value={liked} onChange={(e) => setLiked(e.target.value)} />
      </Field>
      <fieldset className="rating-fieldset">
        <legend>רוצים עוד פעולות כאלה?</legend>
        <div className="face-row">
          {(
            [
              ["yes", "כן"],
              ["maybe", "אולי"],
              ["no", "לא"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={`face ${more === k ? "on" : ""}`}>
              <input type="radio" name="more" value={k} checked={more === k} onChange={() => setMore(k)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary field-btn" disabled={busy}>
        {busy ? "שולח..." : "שליחה"}
      </button>
    </form>
  );
}

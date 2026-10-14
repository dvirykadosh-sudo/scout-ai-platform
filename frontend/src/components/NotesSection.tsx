"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import { isAdminUser, useAuth, useToast } from "./Providers";
import { Field } from "./ui";

interface Note {
  id: number;
  userId: number;
  author: string;
  body: string;
  createdAt: string;
}

/** Comments between instructors. Only signed-in instructors see and write them. */
export function NotesSection({ activityId, ownerId }: { activityId: number; ownerId: number | null }) {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api<Note[]>(`/api/activities/${activityId}/notes`, { token })
      .then(setNotes)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
      });
  }, [token, activityId, clear]);
  useEffect(load, [load]);

  if (!token || !user)
    return (
      <section className="card glass no-print" aria-labelledby="notes-title">
        <h2 id="notes-title" className="section-title">
          הערות מדריכים
        </h2>
        <p>
          מדריכים מחוברים יכולים להשאיר כאן הערות ורעיונות לשיפור. <Link href="/account">התחברות</Link>
        </p>
      </section>
    );

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/activities/${activityId}/notes`, { method: "POST", token, body: { body } });
      setBody("");
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
    setBusy(false);
  };
  const remove = async (n: Note) => {
    try {
      await api(`/api/notes/${n.id}`, { method: "DELETE", token });
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };

  return (
    <section className="card glass no-print" aria-labelledby="notes-title">
      <h2 id="notes-title" className="section-title">
        הערות מדריכים
      </h2>
      <p className="hint">הערות גלויות לכל המדריכים המחוברים, לא לציבור.</p>
      <form onSubmit={add}>
        <Field label="הערה או רעיון לשיפור" htmlFor={`note-${activityId}`}>
          <textarea id={`note-${activityId}`} rows={2} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy || body.trim().length < 2}>
          הוספת הערה
        </button>
      </form>
      {notes.length > 0 && (
        <ul className="plain-list notes-list" aria-label="הערות">
          {notes.map((n) => (
            <li key={n.id}>
              <span>
                <strong>{n.author}</strong> · {fmtDate(n.createdAt)}
                <br />
                {n.body}
              </span>
              {(n.userId === user.id || isAdminUser(user) || ownerId === user.id) && (
                <button type="button" className="btn btn-small" onClick={() => remove(n)} aria-label={`מחיקת ההערה של ${n.author}`}>
                  מחיקה
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

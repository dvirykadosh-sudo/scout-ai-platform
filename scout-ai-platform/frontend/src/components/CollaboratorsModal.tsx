"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Collaborator } from "@/lib/organizer";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";

/** שותפים לעריכה: הבעלים מוסיף מדריכים לפי שם משתמש, והם יכולים לערוך את הפעולה. */
export function CollaboratorsModal({ open, onClose, activityId, token, list, onChanged }: { open: boolean; onClose: () => void; activityId: number; token: string | null; list: Collaborator[]; onChanged: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    if (!username.trim()) return setError("יש להזין שם משתמש");
    setBusy(true);
    setError("");
    try {
      await api(`/api/activities/${activityId}/collaborators`, { method: "POST", token, body: { username: username.trim() } });
      setUsername("");
      toast("השותף נוסף", { kind: "success" });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };
  const remove = async (c: Collaborator) => {
    setBusy(true);
    try {
      await api(`/api/activities/${activityId}/collaborators/${c.id}`, { method: "DELETE", token });
      toast(`${c.displayName} הוסר/ה`, { kind: "success" });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="שותפים לעריכה" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      <p>שותף לעריכה יכול לערוך את הפעולה, לראות את היסטוריית הגרסאות ולהוסיף סיפור. הוא לא יכול למחוק אותה או לשתף אותה הלאה. אפשר עד 5 שותפים.</p>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="inline-form">
        <Field label="שם המשתמש של השותף" htmlFor="col-user">
          <input id="col-user" value={username} maxLength={60} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
          הוספה
        </button>
      </div>
      {list.length === 0 ? (
        <p>עוד אין שותפים.</p>
      ) : (
        <ul className="plain-list" aria-label="שותפים נוכחיים">
          {list.map((c) => (
            <li key={c.id}>
              <span>
                {c.displayName} <span className="meta">({c.username})</span>
              </span>
              <button type="button" className="btn btn-small" onClick={() => remove(c)} disabled={busy} aria-label={`הסרת ${c.displayName}`}>
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

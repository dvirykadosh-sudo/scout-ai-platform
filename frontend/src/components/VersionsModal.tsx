"use client";

import { useEffect, useState } from "react";
import { ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import { diffSnapshots } from "@/lib/diff";
import type { ActivitySnapshot, VersionItem } from "@/lib/types";
import { useToast } from "./Providers";
import { Modal } from "./ui";

export function VersionsModal({ open, activityId, token, onClose, onRestored, onAuthError }: { open: boolean; activityId: number; token: string | null; onClose: () => void; onRestored: () => void; onAuthError: (e: unknown) => boolean }) {
  const toast = useToast();
  const [data, setData] = useState<{ current: ActivitySnapshot; items: VersionItem[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    api<{ current: ActivitySnapshot; items: VersionItem[] }>(`/api/activities/${activityId}/versions`, { token })
      .then(setData)
      .catch((e) => {
        if (!onAuthError(e)) setError(errorMessage(e));
      });
  }, [open, activityId, token, onAuthError]);

  const restore = async (v: VersionItem) => {
    setBusy(v.id);
    try {
      await api(`/api/activities/${activityId}/versions/${v.id}/restore`, { method: "POST", token, body: {} });
      toast("הגרסה שוחזרה. הגרסה הנוכחית נשמרה בהיסטוריה", { kind: "success" });
      onRestored();
    } catch (e) {
      if (!(e instanceof ApiError && onAuthError(e))) toast(errorMessage(e), { kind: "error" });
    }
    setBusy(null);
  };

  return (
    <Modal open={open} onClose={onClose} wide title="היסטוריית גרסאות" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p>טוען...</p>}
      {data && data.items.length === 0 && <p>עדיין לא נערכה הפעולה. כל עריכה תישמר כאן, ואפשר יהיה לחזור אליה.</p>}
      {data && data.items.length > 0 && (
        <>
          <p className="hint">כל גרסה היא מצב הפעולה לפני עריכה. השוואה מול הנוכחי: מה היה אז, ומה כתוב עכשיו.</p>
          <ul className="plain-list versions">
            {data.items.map((v) => {
              const changes = diffSnapshots(v.snapshot, data.current);
              return (
                <li key={v.id}>
                  <details>
                    <summary>
                      {fmtDate(v.savedAt)} · {v.editor || "לא ידוע"} · {v.note || "גרסה"} ({changes.length ? `${changes.length} הבדלים מהנוכחי` : "זהה לנוכחי"})
                    </summary>
                    {changes.length > 0 && (
                      <ul className="bullets">
                        {changes.map((c, i) => (
                          <li key={i}>
                            <strong>{c.label}</strong>
                            <br />
                            <span>אז: {c.before || "(ריק)"}</span>
                            <br />
                            <span>עכשיו: {c.after || "(ריק)"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" className="btn btn-small" disabled={busy === v.id || changes.length === 0} onClick={() => restore(v)}>
                      {busy === v.id ? "משחזר..." : "שחזור הגרסה הזאת"}
                    </button>
                  </details>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}

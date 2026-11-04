"use client";

import { useState } from "react";
import { api, errorMessage, storageGet } from "@/lib/api";
import { useToast } from "./Providers";

/** Suggests a fresh version of one stage. The person accepts it or asks for another. */
export function StageRegen({ activityId, index, onAccept }: { activityId: number; index: number; onAccept: (content: string) => void }) {
  const toast = useToast();
  const [variant, setVariant] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      let style: unknown;
      try {
        style = JSON.parse(storageGet("scout.style.current") ?? "null") ?? undefined;
      } catch {
        style = undefined;
      }
      const v = variant + 1;
      const r = await api<{ content: string }>(`/api/activities/${activityId}/stages/${index}/regenerate`, { method: "POST", body: { variant: v, ...(style ? { style } : {}) } });
      setVariant(v);
      setText(r.content);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <div className="stage-regen">
      <button type="button" className="btn btn-small" onClick={ask} disabled={busy}>
        {busy ? "מכין הצעה..." : text ? "עוד הצעה לשלב הזה" : "הצעה חדשה לשלב הזה"}
      </button>
      {text && (
        <div className="regen-box" role="region" aria-label={`הצעה חדשה לשלב ${index + 1}`} aria-live="polite">
          <p className="regen-text">{text}</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => {
                onAccept(text);
                setText("");
                toast("ההצעה הוכנסה לשלב. אל תשכחו לשמור", { kind: "info" });
              }}
            >
              החלפת התוכן בהצעה
            </button>
            <button type="button" className="btn btn-small" onClick={() => setText("")}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

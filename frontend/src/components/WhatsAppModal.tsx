"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field, Modal } from "./ui";

interface Resp {
  modes: { id: string; label: string; hint: string }[];
  mode: string;
  text: string;
}

const MAX_LINK = 3500;

/** טקסט מוכן לוואטסאפ: לצוות, לחניכים, להורים או הפעולה המלאה. */
export function WhatsAppModal({ open, onClose, activityId }: { open: boolean; onClose: () => void; activityId: number }) {
  const toast = useToast();
  const [mode, setMode] = useState("staff");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [withLink, setWithLink] = useState(true);
  const [data, setData] = useState<Resp | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const p = new URLSearchParams({ mode });
    if (date) p.set("date", date);
    if (time) p.set("time", time);
    if (place.trim()) p.set("place", place.trim());
    let live = true;
    api<Resp>(`/api/activities/${activityId}/whatsapp?${p}`)
      .then((r) => {
        if (!live) return;
        setData(r);
        setText(r.text);
        setError("");
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [open, activityId, mode, date, time, place]);

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/library/${activityId}`;
  const final = withLink && mode !== "parents" ? `${text}\n\n${link}` : text;
  const tooLong = final.length > MAX_LINK;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(final);
      toast("ההודעה הועתקה. אפשר להדביק בוואטסאפ", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. סמנו את הטקסט והעתיקו ידנית", { kind: "info" });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="שיתוף בוואטסאפ"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={copy}>
            העתקת ההודעה
          </button>
          {tooLong ? (
            <span className="hint">ההודעה ארוכה מכדי להיפתח ישירות. העתיקו אותה והדביקו בוואטסאפ.</span>
          ) : (
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(final)}`} target="_blank" rel="noopener noreferrer">
              פתיחה בוואטסאפ
            </a>
          )}
          <button type="button" className="btn" onClick={onClose}>
            סגירה
          </button>
        </>
      }
    >
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <fieldset className="grade-picker">
        <legend>למי ההודעה?</legend>
        <div className="grade-options">
          {(data?.modes ?? []).map((m) => (
            <label key={m.id} className="check">
              <input type="radio" name="wa-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span>
                {m.label} <small className="meta">({m.hint})</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {(mode === "kids" || mode === "staff" || mode === "full") && (
        <div className="form-grid">
          <Field label="תאריך (לא חובה)" htmlFor="wa-date">
            <input id="wa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="שעה (לא חובה)" htmlFor="wa-time">
            <input id="wa-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="מקום (לא חובה)" htmlFor="wa-place">
            <input id="wa-place" value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} />
          </Field>
        </div>
      )}
      <Field label="ההודעה (אפשר לערוך לפני ההעתקה)" htmlFor="wa-text">
        <textarea id="wa-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {mode !== "parents" && (
        <label className="check">
          <input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} />
          <span>להוסיף קישור לפעולה באתר</span>
        </label>
      )}
    </Modal>
  );
}

"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useToast } from "./Providers";
import { Modal } from "./ui";

export function ShareModal({ open, onClose, activityId, title, path, heading = "שיתוף הפעולה", intro = "הקישור פותח את הפעולה לקריאה בלבד, בלי התחברות." }: { open: boolean; onClose: () => void; activityId: number; title: string; path?: string; heading?: string; intro?: string }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [canShare, setCanShare] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const u = `${window.location.origin}${path ?? `/library/${activityId}`}`;
    setUrl(u);
    setCanShare(typeof navigator.share === "function");
    QRCode.toDataURL(u, { width: 260, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [open, activityId, path]);

  const isLocal = /^(localhost|127\.|\[::1\])/.test(typeof window === "undefined" ? "" : window.location.hostname);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("הקישור הועתק", { kind: "success" });
    } catch {
      input.current?.select();
      toast("לא הצלחתי להעתיק אוטומטית. הקישור סומן, אפשר ללחוץ Ctrl+C", { kind: "info" });
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading}
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={copy}>
            העתקת קישור
          </button>
          {canShare && (
            <button type="button" className="btn" onClick={nativeShare}>
              שיתוף באפליקציה
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            סגירה
          </button>
        </>
      }
    >
      <p>{intro}</p>
      <label htmlFor="share-url">הקישור</label>
      <input id="share-url" ref={input} readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
      {qr && (
        <div className="qr-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={260} height={260} alt={`קוד QR לקישור של "${title}"`} />
        </div>
      )}
      {isLocal && (
        <div className="error-box" role="note">
          <p>
            <strong>שימו לב:</strong> האתר רץ כרגע רק במחשב הזה (localhost), ולכן הקישור ו-QR לא ייפתחו במכשירים אחרים. כדי לשתף עם אחרים צריך להעלות את האתר לאינטרנט (או לפתוח אותו דרך כתובת ה-IP של המחשב ברשת המקומית).
          </p>
        </div>
      )}
    </Modal>
  );
}

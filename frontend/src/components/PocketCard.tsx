"use client";

// שלב 74 (פריט 18): כרטיס כיס A5 להדפסה. דף אחד שמדריך מכניס לכיס: שלבים עם זמנים, ציוד, בטיחות, וקוד QR למצב ההדרכה בטלפון.
// הגיליון לבן תמיד, גם במצב כהה, כי הוא נועד לנייר.

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { timelineCheck } from "@/lib/lab74";
import type { Activity } from "@/lib/types";
import { Skeleton } from "./ui";

/** משפט או שניים מתחילת הטקסט, בלי לחתוך באמצע מילה. */
export function shortText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const sp = cut.lastIndexOf(" ");
  return `${cut.slice(0, sp > 0 ? sp : max)}…`;
}

export function PocketCard() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);
  const [qr, setQr] = useState("");

  useEffect(() => {
    api<Activity>(`/api/activities/${id}`)
      .then(setA)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const fieldUrl = typeof window !== "undefined" && a ? `${window.location.origin}/field/${a.id}` : "";
  useEffect(() => {
    if (!fieldUrl) return;
    QRCode.toDataURL(fieldUrl, { width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [fieldUrl]);

  const t = useMemo(() => (a ? timelineCheck(a.stages, a.durationMin) : null), [a]);

  if (error)
    return (
      <p className="error-box" role="alert">
        {error}
      </p>
    );
  if (!a || !t) return <Skeleton lines={6} />;

  return (
    <>
      <div className="no-print pocket-tools">
        <p>
          <Link href={`/library/${a.id}`}>חזרה לפעולה</Link>
        </p>
        <h1 className="section-title">כרטיס כיס להדפסה</h1>
        <p className="hint">הכרטיס מתאים לדף A5. בחלון ההדפסה בחרו גודל נייר A5 (או A4 וחיתוך באמצע), והסירו כותרות עליונות ותחתונות של הדפדפן.</p>
        <label className="check">
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
          <span>להציג את כל הטקסט של השלבים (הכרטיס עשוי לגלוש לדף שני)</span>
        </label>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            הדפסה
          </button>
        </div>
      </div>
      <article className="pocket" aria-label={`כרטיס כיס: ${a.title}`}>
        <header className="pocket-head">
          <div>
            <h2 className="pocket-title">{a.title}</h2>
            <p className="pocket-meta">
              {a.ageGroup} · {a.groupSize} משתתפים · {a.durationMin} דקות
            </p>
            <p className="pocket-meta">
              <strong>ערך:</strong> {a.leadingValue}
            </p>
          </div>
          {qr && (
            <figure className="pocket-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`קוד QR למצב הדרכה בטלפון של הפעולה ${a.title}`} width={96} height={96} />
              <figcaption>מצב הדרכה בטלפון, עם טיימר</figcaption>
            </figure>
          )}
        </header>
        <ol className="pocket-stages">
          {a.stages.map((s) => (
            <li key={s.name}>
              <p className="pocket-stage-head">
                <strong>{s.name}</strong> <span>{s.minutes} דק׳</span>
              </p>
              <p>{full ? s.content : shortText(s.content, 170)}</p>
            </li>
          ))}
        </ol>
        {t.warnings.some((w) => w.id === "sum") && <p className="pocket-note">שימו לב: סכום הדקות בשלבים ({t.total}) שונה מהמשך שהוגדר ({a.durationMin}).</p>}
        <section className="pocket-box">
          <p>
            <strong>ציוד:</strong> {shortText(a.equipment || "אין", full ? 1000 : 160)}
          </p>
          <p>
            <strong>בטיחות:</strong> {shortText(a.safetyNotes || "לא צוינו הערות בטיחות", full ? 1000 : 220)}
          </p>
        </section>
        <footer className="pocket-foot">
          <span>{a.tribe}</span>
          <span dir="ltr">{fieldUrl.replace(/^https?:\/\//, "")}</span>
        </footer>
      </article>
    </>
  );
}

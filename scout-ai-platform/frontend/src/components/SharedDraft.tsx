"use client";

// תצוגה לקריאה בלבד של טיוטה משותפת מעוזר הכתיבה, עם אפשרות להגיב על קטע מסומן.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./Providers";
import { Field } from "./ui";

interface Shared {
  title: string;
  text: string;
  ownerName: string;
  updatedAt: string;
  comments: { id: number; authorName: string; quote: string; body: string; resolved: boolean; createdAt: string }[];
}

export function SharedDraft() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [d, setD] = useState<Shared | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async (t: string) => {
    try {
      setD(await api<Shared>(`/api/assist/shared/${encodeURIComponent(t)}`));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t || "");
    if (t) void load(t);
    else setError("הקישור חסר או לא תקין");
    try {
      setName(window.localStorage.getItem("scout.assist.guest") || "");
    } catch {
      /* ללא אחסון */
    }
  }, [load]);

  // שומרים את הטקסט שסומן בתוך הטיוטה, כדי לצטט אותו בתגובה
  const captureSelection = () => {
    const sel = window.getSelection();
    const t = sel?.toString().trim() ?? "";
    if (t && box.current && sel?.anchorNode && box.current.contains(sel.anchorNode)) setQuote(t.slice(0, 200));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      await api(`/api/assist/shared/${encodeURIComponent(token)}/comments`, { method: "POST", body: { name, text: body, quote } });
      try {
        window.localStorage.setItem("scout.assist.guest", name);
      } catch {
        /* ללא אחסון */
      }
      setBody("");
      setQuote("");
      toast("התגובה נשלחה", { kind: "success" });
      await load(token);
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
    setBusy(false);
  };

  if (error) {
    return (
      <>
        <h1>טיוטה משותפת</h1>
        <p className="error-text" role="alert">
          {error}. ייתכן שהשיתוף בוטל. בקשו מהכותב/ת קישור חדש.
        </p>
      </>
    );
  }
  if (!d) return <p className="hint">טוען...</p>;

  return (
    <>
      <h1>{d.title}</h1>
      <p className="lead">
        טיוטה של {d.ownerName}. אפשר לקרוא ולהגיב, לא לערוך. כדי להגיב על קטע, סמנו אותו בטקסט.
      </p>
      <div ref={box} className="assist-shared-text card glass" tabIndex={0} role="region" aria-label="טקסט הטיוטה" onMouseUp={captureSelection} onKeyUp={captureSelection}>
        {d.text}
      </div>

      <section className="card glass" aria-labelledby="shared-comment-title">
        <h2 id="shared-comment-title" className="section-title">
          תגובה חדשה
        </h2>
        <form onSubmit={send} noValidate>
          {quote && (
            <p className="hint">
              על הקטע: <q>{quote}</q>{" "}
              <button type="button" className="btn btn-small" onClick={() => setQuote("")}>
                ניקוי הקטע
              </button>
            </p>
          )}
          <Field label="השם שלכם" htmlFor="sh-name">
            <input id="sh-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="התגובה" htmlFor="sh-body">
            <textarea id="sh-body" rows={4} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={busy || body.trim().length < 2}>
            {busy ? "שולח..." : "שליחת תגובה"}
          </button>
        </form>
      </section>

      <section aria-labelledby="shared-list-title">
        <h2 id="shared-list-title" className="section-title">
          תגובות ({d.comments.length})
        </h2>
        {d.comments.length === 0 && <p className="hint">עוד אין תגובות.</p>}
        {d.comments.map((c) => (
          <div key={c.id} className="assist-comment">
            <strong>{c.authorName}</strong>
            {c.quote && (
              <>
                {" "}
                על <q>{c.quote}</q>
              </>
            )}
            {c.resolved && <span className="pill pill-ok"> טופל</span>}
            <p>{c.body}</p>
          </div>
        ))}
      </section>
    </>
  );
}

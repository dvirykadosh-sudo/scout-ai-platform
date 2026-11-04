"use client";

// שלב 52: אבטחה אישית (379–381, 383) ודף הצטרפות בהזמנה (368).
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/api";
import { RegisterForm } from "./AuthForms";
import { useAuth, useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

interface Score { score: number; level: string; items: { key: string; label: string; points: number; ok: boolean; action: string }[]; sessions: number; passwordAgeDays: number }
interface Hist { logins: { at: string; kind: string; country: string; device: string }[]; sessions: { at: string; device: string; method: string; newDevice: boolean }[] }
const fmt = (s: string) => new Date(s).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });

export function SecurityPlus() {
  const { token, clear } = useAuth();
  const toast = useToast();
  const [score, setScore] = useState<Score | null>(null);
  const [hist, setHist] = useState<Hist | null>(null);
  const [events, setEvents] = useState<{ at: string; label: string }[] | null>(null);
  const [del, setDel] = useState({ password: "", confirm: "", activities: "keep" });
  const [delOpen, setDelOpen] = useState(false);
  useEffect(() => {
    if (!token) return;
    api<Score>("/api/me/security-score", { token }).then(setScore).catch(() => {});
    api<Hist>("/api/me/login-history", { token }).then(setHist).catch(() => {});
    api<{ events: { at: string; label: string }[] }>("/api/me/security-events", { token }).then((r) => setEvents(r.events)).catch(() => {});
  }, [token]);
  const remove = async () => {
    try {
      await api("/api/me/delete", { method: "POST", token, body: del });
      toast("החשבון נמחק", { kind: "success" });
      clear();
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  };
  if (!score) return <Skeleton lines={2} />;
  const cls = score.score >= 80 ? "high" : score.score < 50 ? "low" : "";
  return (
    <section className="card glass" aria-labelledby="secplus-title">
      <h2 id="secplus-title" className="section-title">ציון האבטחה שלי</h2>
      <div className="actions">
        <span className={`score-ring ${cls}`} role="img" aria-label={`ציון אבטחה ${score.score} מתוך 100, רמה ${score.level}`}>{score.score}</span>
        <p><strong>רמה: {score.level}</strong><br />{score.items.filter((i) => !i.ok).length === 0 ? "הכול מוגדר מצוין." : "כדאי לתקן את הסעיפים שלמטה."}</p>
      </div>
      <ul className="plain-list">
        {score.items.map((i) => (<li key={i.key}><span><strong>{i.ok ? "תקין" : "לתיקון"}:</strong> {i.label}{!i.ok && <> · {i.action}</>}</span></li>))}
      </ul>
      <details>
        <summary>כניסות אחרונות לחשבון</summary>
        {hist && (<ul className="plain-list">{hist.sessions.map((s, i) => (<li key={i}><span>{fmt(s.at)} · {s.device} · {s.method}{s.newDevice ? " · מכשיר חדש" : ""}</span></li>))}</ul>)}
        <p className="hint">אם יש כניסה שאתם לא מזהים, החליפו סיסמה ונתקו את שאר המכשירים.</p>
      </details>
      <details>
        <summary>אירועי אבטחה בחשבון</summary>
        {!events ? <p>טוען…</p> : events.length === 0 ? <p>אין אירועים להצגה.</p> : (<ul className="plain-list">{events.map((e, i) => (<li key={i}><span>{fmt(e.at)} · {e.label}</span></li>))}</ul>)}
      </details>
      <div className="danger-zone">
        <button type="button" className="btn" aria-expanded={delOpen} onClick={() => setDelOpen(!delOpen)}>מחיקת החשבון שלי</button>
        {delOpen && (
          <div>
            <p>המחיקה סופית. הפעולות שיצרתם יישארו במאגר בלי שם בעלים, או יועברו לארכיון לפי הבחירה. אפשר להוריד קודם את הנתונים שלכם באזור הייצוא.</p>
            <Field label="מה לעשות עם הפעולות שלי" htmlFor="del-act">
              <select id="del-act" value={del.activities} onChange={(e) => setDel({ ...del, activities: e.target.value })}><option value="keep">להשאיר במאגר (בלי שם בעלים)</option><option value="archive">להעביר לארכיון</option></select>
            </Field>
            <Field label="סיסמה נוכחית" htmlFor="del-pw"><input id="del-pw" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /></Field>
            <Field label='לאישור כתבו: מחיקה' htmlFor="del-confirm"><input id="del-confirm" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} /></Field>
            <button type="button" className="btn btn-primary" onClick={() => void remove()} disabled={del.confirm !== "מחיקה" || !del.password}>מחיקה סופית</button>
          </div>
        )}
      </div>
    </section>
  );
}

/** 368: דף הצטרפות בהזמנה. */
export function JoinPage({ code }: { code: string }) {
  const [state, setState] = useState<{ valid: boolean; label?: string } | null>(null);
  useEffect(() => { api<{ valid: boolean; label?: string }>(`/api/auth/invite/${encodeURIComponent(code)}`).then(setState).catch(() => setState({ valid: false })); }, [code]);
  if (!state) return <Skeleton lines={3} />;
  if (!state.valid)
    return (
      <section className="card glass narrow" role="alert">
        <h2 className="section-title">ההזמנה לא תקפה</h2>
        <p>ייתכן שפג תוקפה או שכבר נוצלה. בקשו ממנהל השבט הזמנה חדשה, או <Link href="/account">חזרו לדף ההתחברות</Link>.</p>
      </section>
    );
  return (
    <>
      <p className="hint" role="status">הוזמנתם להצטרף: {state.label}</p>
      <RegisterForm needsCode={false} inviteCode={code} />
    </>
  );
}

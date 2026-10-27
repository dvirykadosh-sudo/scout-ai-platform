"use client";

// שלב 38 (251–260): פיילוט ומשוב.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

interface Task {
  id: string;
  title: string;
  href: string;
  done: boolean;
}
interface PilotState {
  tasks: Task[];
  done: number;
  next: Task | null;
  accountAgeDays: number;
}

export function usePilot() {
  const { token } = useAuth();
  const [p, setP] = useState<PilotState | null>(null);
  const load = useCallback(() => {
    if (!token) return;
    api<PilotState>("/api/me/pilot", { token }).then(setP).catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  return { p, reload: load };
}

/** 251: הודעת הצטרפות לשליחה בוואטסאפ. */
export function PilotPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const { p, reload } = usePilot();
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const msg = `היי! אני מזמין/ה אותך לנסות את מחולל הפעולות של שבט מעוז: ${site}\nנרשמים עם קוד ההרשמה: [הקוד שאקבל מהרכז]\nהמשימה: לכתוב פעולה אחת באתר, לייצא אותה ל-Word ולספר לי מה חסר. זה לוקח כ-15 דקות. תודה!`;
  return (
    <>
      <section className="card">
        <h2>הצטרפות לפיילוט</h2>
        <ol>
          <li>נרשמים לאתר עם קוד ההרשמה של השבט.</li>
          <li>מבצעים את חמש המשימות למטה (הן מסומנות לבד).</li>
          <li>ממלאים שאלון קצר ומצביעים על מה שחסר.</li>
        </ol>
        <p className="hint">הודעה מוכנה להעברה למדריכים:</p>
        <textarea readOnly rows={5} value={msg} aria-label="הודעה לשליחה" />
        <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(msg).then(() => toast("ההודעה הועתקה", { kind: "success" }))}>
          העתקת ההודעה
        </button>
      </section>
      {ready && !user && <p>כדי לראות את המשימות צריך <Link href="/account">להתחבר או להירשם</Link>.</p>}
      {p && (
        <section className="card" aria-labelledby="pl-tasks" style={{ marginTop: 16 }}>
          <h2 id="pl-tasks">המשימות שלי ({p.done} מתוך {p.tasks.length})</h2>
          <progress max={p.tasks.length} value={p.done} aria-label="התקדמות במשימות" />
          <ul className="plain-list">
            {p.tasks.map((t) => (
              <li key={t.id}>
                <span>{t.done ? "✅" : "⬜"} {t.title}</span>
                {!t.done && <Link className="btn btn-small" href={t.href}>למשימה</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {user && <SurveyForm onDone={reload} />}
      <p style={{ marginTop: 16 }}>
        יש רעיון למה שחסר? <Link href="/vote">מציעים ומצביעים על מה לבנות הבא</Link>.
      </p>
    </>
  );
}

/** 253: שאלון קצר. */
export function SurveyForm({ onDone }: { onDone?: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ ease: 0, missing: "", wouldUse: true });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!token) return;
    api<{ ease: number; missing: string; wouldUse: boolean } | null>("/api/me/survey", { token }).then((s) => { if (s) { setF(s); setSaved(true); } }).catch(() => {});
  }, [token]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.ease) return toast("בחרו ציון בין 1 ל-5", { kind: "error" });
    try {
      await api("/api/me/survey", { method: "POST", token, body: f });
      setSaved(true);
      toast("תודה! התשובות נשמרו.", { kind: "success" });
      onDone?.();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  return (
    <form className="card" onSubmit={send} aria-labelledby="sv-h" style={{ marginTop: 16 }}>
      <h2 id="sv-h">שאלון קצר{saved ? " (נשמר, אפשר לעדכן)" : ""}</h2>
      <fieldset>
        <legend>כמה קל היה להשתמש באתר? (1 קשה, 5 קל מאוד)</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="check">
            <input type="radio" name="ease" checked={f.ease === n} onChange={() => setF({ ...f, ease: n })} />
            <span>{n}</span>
          </label>
        ))}
      </fieldset>
      <Field label="מה הכי חסר לכם?" htmlFor="sv-missing">
        <textarea id="sv-missing" rows={3} maxLength={600} value={f.missing} onChange={(e) => setF({ ...f, missing: e.target.value })} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.wouldUse} onChange={(e) => setF({ ...f, wouldUse: e.target.checked })} />
        <span>הייתי משתמש/ת באתר גם בפעולות הבאות</span>
      </label>
      <button type="submit" className="btn btn-primary">שמירת התשובות</button>
    </form>
  );
}

/** 259: הצעד הבא למדריך חדש, בדף הבית. */
export function NextStepCard() {
  const { user } = useAuth();
  const { p } = usePilot();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("scout.nextstep.hide") === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (!user || !p || hidden || !p.next || p.accountAgeDays > 45 || p.done >= p.tasks.length) return null;
  return (
    <section className="card" aria-labelledby="ns-h" style={{ marginBottom: 16 }}>
      <h2 id="ns-h">הצעד הבא שלך</h2>
      <p>
        {p.next.title}. כבר סיימת {p.done} מתוך {p.tasks.length} משימות.
      </p>
      <div className="actions">
        <Link className="btn btn-primary" href={p.next.href}>
          בואו נעשה את זה
        </Link>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem("scout.nextstep.hide", "1");
            } catch {
              /* ignore */
            }
          }}
        >
          לא עכשיו
        </button>
      </div>
    </section>
  );
}

/** 254: משהו לא עובד. */
export function ReportButton() {
  const { token } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const send = async () => {
    try {
      await api("/api/report", { method: "POST", token, body: { text, page: window.location.pathname, device: `${navigator.userAgent.slice(0, 120)} · ${window.innerWidth}x${window.innerHeight}` } });
      toast("תודה! הדיווח התקבל.", { kind: "success" });
      setText("");
      setOpen(false);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <>
      <button type="button" className="a11y-btn" onClick={() => setOpen(true)}>
        משהו לא עובד
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="דיווח על תקלה" footer={<><button type="button" className="btn" onClick={() => setOpen(false)}>ביטול</button><button type="button" className="btn btn-primary" onClick={send} disabled={text.trim().length < 3}>שליחה</button></>}>
        <p className="hint">העמוד וסוג המכשיר יצורפו אוטומטית. אל תכתבו סיסמאות.</p>
        <Field label="מה קרה?" htmlFor="rp-text">
          <textarea id="rp-text" rows={4} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

interface Req {
  id: number;
  title: string;
  status: string;
  votes: number;
  voted: boolean;
  mine: boolean;
}
const STATUS: Record<string, string> = { open: "פתוח", planned: "בתכנון", done: "נבנה", declined: "לא מתאים" };

/** 260: מה לבנות הבא. */
export function VotePage() {
  const { token, user, ready } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Req[] | null>(null);
  const [title, setTitle] = useState("");
  const load = useCallback(() => {
    if (!token) return;
    api<Req[]>("/api/feature-requests", { token }).then(setList).catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [token, toast]);
  useEffect(load, [load]);
  if (!ready) return null;
  if (!user) return <p>כדי להצביע צריך <Link href="/account">להתחבר</Link>.</p>;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/feature-requests", { method: "POST", token, body: { title } });
      setTitle("");
      load();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  const vote = async (id: number) => {
    try {
      await api(`/api/feature-requests/${id}/vote`, { method: "POST", token, body: {} });
      load();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/api/admin/feature-requests/${id}`, { method: "PATCH", token, body: { status } });
      load();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  return (
    <>
      <form className="card" onSubmit={add} aria-label="הצעת רעיון">
        <Field label="הצעה חדשה (עד 3 רעיונות פתוחים לכל מדריך)" htmlFor="vt-title">
          <input id="vt-title" required minLength={4} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <button className="btn btn-primary" type="submit">הוספה</button>
      </form>
      <ul className="plain-list" aria-label="הרעיונות" style={{ marginTop: 16 }}>
        {(list ?? []).map((r) => (
          <li key={r.id}>
            <span>
              <strong>{r.title}</strong> · {r.votes} קולות · {STATUS[r.status] ?? r.status}
            </span>
            <span className="actions">
              <button type="button" className="btn btn-small" aria-pressed={r.voted} onClick={() => vote(r.id)}>
                {r.voted ? "ביטול הצבעה" : "מצביעים"}
              </button>
              {user.role === "ADMIN" && (
                <select aria-label={`סטטוס: ${r.title}`} value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </span>
          </li>
        ))}
        {list && !list.length && <li>עוד אין הצעות. תהיו הראשונים.</li>}
      </ul>
    </>
  );
}

interface AdminData {
  surveys: { n: number; avgEase: number | null; wouldUsePct: number | null; comments: { text: string; at: string }[] };
  bugs: { id: number; username: string | null; page: string; text: string; device: string; status: string; createdAt: string }[];
  pages: { page: string; n: number }[];
  firstDoc: { users: number; medianMinutes: number | null; neverWrote: number };
  users: { id: number; username: string; displayName: string; tasksDone: number }[];
  report: { text: string };
}

/** 255–258: "מה אומרים עלינו" לאדמין. */
export function AdminPilot() {
  const { token } = useAuth();
  const toast = useToast();
  const [d, setD] = useState<AdminData | null>(null);
  const load = useCallback(() => {
    api<AdminData>("/api/admin/pilot", { token }).then(setD).catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  if (!d) return null;
  const max = Math.max(1, ...d.pages.map((p) => p.n));
  const resolve = async (id: number, status: string) => {
    await api(`/api/admin/bugs/${id}`, { method: "PATCH", token, body: { status } }).catch((e) => toast(errorMessage(e), { kind: "error" }));
    load();
  };
  const mail = async () => {
    try {
      await api("/api/admin/pilot/report", { method: "POST", token, body: {} });
      toast("הדוח נשלח למייל", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <section className="card" aria-labelledby="ap-h" style={{ marginBottom: 16 }}>
      <h2 id="ap-h">מה אומרים עלינו (פיילוט)</h2>
      <p>
        שאלונים: {d.surveys.n}
        {d.surveys.avgEase != null ? ` · קלות שימוש ממוצעת ${d.surveys.avgEase} מתוך 5 · ${d.surveys.wouldUsePct}% ימשיכו להשתמש` : ""}
      </p>
      <p>
        זמן עד המסמך הראשון (חציון): {d.firstDoc.medianMinutes != null ? `${d.firstDoc.medianMinutes} דקות` : "אין עדיין נתונים"} · נרשמו ולא כתבו כלום: {d.firstDoc.neverWrote}
      </p>
      {d.surveys.comments.length > 0 && (
        <>
          <h3>מה חסר, במילים שלהם</h3>
          <ul>{d.surveys.comments.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
        </>
      )}
      <h3>דיווחי תקלה</h3>
      {d.bugs.length === 0 ? <p>אין דיווחים.</p> : (
        <ul className="plain-list">
          {d.bugs.map((b) => (
            <li key={b.id}>
              <span>
                {b.status === "open" ? "🔴" : "✅"} {b.text}<br />
                <small>{b.username ?? "אנונימי"} · {b.page} · {fmtDate(b.createdAt)}</small>
              </span>
              <button type="button" className="btn btn-small" onClick={() => resolve(b.id, b.status === "open" ? "done" : "open")}>{b.status === "open" ? "טופל" : "פתיחה מחדש"}</button>
            </li>
          ))}
        </ul>
      )}
      <h3>אילו עמודים נפתחים (30 ימים)</h3>
      <ul className="plain-list" aria-label="מפת שימוש">
        {d.pages.map((p) => (
          <li key={p.page}>
            <span style={{ display: "grid", gridTemplateColumns: "10rem 1fr 3rem", gap: 8, alignItems: "center", width: "100%" }}>
              <code dir="ltr">{p.page}</code>
              <span aria-hidden="true" style={{ display: "block", height: 10, width: `${(p.n / max) * 100}%`, background: "currentColor", opacity: 0.6, borderRadius: 4 }} />
              <span>{p.n}</span>
            </span>
          </li>
        ))}
        {!d.pages.length && <li>עוד אין נתונים.</li>}
      </ul>
      <h3>התקדמות מדריכים במשימות</h3>
      <ul className="plain-list">
        {d.users.slice(0, 20).map((u) => (
          <li key={u.id}>{u.displayName || u.username}: {u.tasksDone} מתוך 5</li>
        ))}
      </ul>
      <h3>דוח שבועי</h3>
      <pre style={{ whiteSpace: "pre-wrap" }}>{d.report.text}</pre>
      <button type="button" className="btn" onClick={mail}>שליחת הדוח למייל עכשיו</button>
      <p className="hint">כשהמייל מוגדר, הדוח נשלח אוטומטית פעם בשבוע.</p>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import { addDaysIso, fmtDay, todayLocal, type ScheduleItem } from "@/lib/organizer";
import { isAdminUser, useAuth, useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

interface Brief {
  id: number;
  title: string;
  ageGroup: string;
  durationMin: number;
}

// ───────── 43. תגיות אישיות ─────────
export function TagsPanel({ activityId }: { activityId: number }) {
  const { token } = useAuth();
  const toast = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!token) return;
    api<string[]>(`/api/activities/${activityId}/tags`, { token })
      .then(setTags)
      .catch(() => {});
  }, [activityId, token]);
  if (!token) return null;
  const save = async (next: string[]) => {
    try {
      setTags(await api<string[]>(`/api/activities/${activityId}/tags`, { method: "PUT", token, body: { tags: next } }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const add = () => {
    const t = text.trim();
    if (!t || tags.includes(t)) return setText("");
    setText("");
    void save([...tags, t]);
  };
  return (
    <section className="card glass no-print" aria-labelledby="tags-title">
      <h2 id="tags-title" className="section-title">
        התגיות שלי
      </h2>
      <p className="hint">תגיות פרטיות, רק אתם רואים אותן. למשל "לחורף" או "פעולה שאהבו".</p>
      <ul className="tag-list" aria-label="התגיות של הפעולה">
        {tags.map((t) => (
          <li key={t} className="pill">
            {t}{" "}
            <button type="button" className="link-btn" aria-label={`הסרת התגית ${t}`} onClick={() => save(tags.filter((x) => x !== t))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="תגית חדשה" htmlFor="tag-new">
          <input id="tag-new" value={text} maxLength={24} onChange={(e) => setText(e.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={tags.length >= 8}>
          הוספת תגית
        </button>
      </form>
    </section>
  );
}

export function MyTags() {
  const { token } = useAuth();
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Brief[]>([]);
  useEffect(() => {
    api<{ tag: string; count: number }[]>("/api/me/tags", { token })
      .then(setTags)
      .catch(() => {});
  }, [token]);
  const show = (tag: string) => {
    setOpen(tag);
    api<Brief[]>(`/api/me/tagged?tag=${encodeURIComponent(tag)}`, { token })
      .then(setItems)
      .catch(() => setItems([]));
  };
  if (tags.length === 0) return null;
  return (
    <section className="card glass" aria-labelledby="mytags-title">
      <h2 id="mytags-title" className="section-title">
        התגיות שלי
      </h2>
      <div className="actions">
        {tags.map((t) => (
          <button key={t.tag} type="button" className="btn btn-small" aria-pressed={open === t.tag} onClick={() => show(t.tag)}>
            {t.tag} ({t.count})
          </button>
        ))}
      </div>
      {open && (
        <ul className="plain-list">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`/library/${a.id}`}>{a.title}</Link>
              <span className="hint">{a.ageGroup}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────── 49. פעולות ששכחתי ─────────
export function Forgotten() {
  const { token } = useAuth();
  const [items, setItems] = useState<(Brief & { lastRun: string | null })[] | null>(null);
  useEffect(() => {
    api<{ items: (Brief & { lastRun: string | null })[] }>("/api/me/forgotten?days=60", { token })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [token]);
  if (!items || items.length === 0) return null;
  return (
    <section className="card glass" aria-labelledby="forgot-title">
      <h2 id="forgot-title" className="section-title">
        פעולות שלכם שלא הופעלו זמן רב
      </h2>
      <p className="hint">פעולות שיצרתם ולא הפעלתם ב-60 הימים האחרונים. אולי הגיע הזמן.</p>
      <ul className="plain-list">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/library/${a.id}`}>{a.title}</Link>
            <span className="hint">{a.lastRun ? `הופעלה לאחרונה ב-${a.lastRun}` : "עוד לא הופעלה"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────── 44. לוח בקשות ─────────
interface Req {
  id: number;
  text: string;
  author: string;
  status: "OPEN" | "DONE";
  activityId: number | null;
  votes: number;
  voted: boolean;
}

export function RequestsPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Req[] | null>(null);
  const [text, setText] = useState("");
  const load = useCallback(() => {
    api<Req[]>("/api/requests", { token })
      .then(setItems)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [token, toast]);
  useEffect(load, [load]);
  const send = async () => {
    try {
      await api("/api/requests", { method: "POST", token, body: { text } });
      setText("");
      toast("הבקשה נוספה", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const vote = async (id: number) => {
    try {
      await api(`/api/requests/${id}/vote`, { method: "POST", token });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const resolve = async (id: number, status: "DONE" | "DISMISSED") => {
    try {
      await api(`/api/admin/requests/${id}/resolve`, { method: "POST", token, body: { status } });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  if (!items) return <Skeleton lines={3} />;
  return (
    <>
      {token ? (
        <form
          className="card glass"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field label="איזו פעולה חסרה לכם?" htmlFor="req-text" hint="למשל: פעולה על חנוכה לשכבה ו'">
            <input id="req-text" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-primary">
            שליחת בקשה
          </button>
        </form>
      ) : (
        <p className="card glass">
          כדי להוסיף בקשה או להצביע צריך <Link href="/account">להתחבר</Link>.
        </p>
      )}
      {items.length === 0 ? (
        <p className="hint">עוד אין בקשות.</p>
      ) : (
        <ul className="plain-list">
          {items.map((r) => (
            <li key={r.id}>
              <span>
                {r.text}
                <br />
                <span className="hint">
                  {r.author}
                  {r.status === "DONE" && (r.activityId ? <> · טופל: <Link href={`/library/${r.activityId}`}>לפעולה</Link></> : " · טופל")}
                </span>
              </span>
              <span className="actions">
                {r.status === "OPEN" && token && (
                  <button type="button" className="btn btn-small" aria-pressed={r.voted} onClick={() => vote(r.id)}>
                    {r.voted ? "ביטול הצבעה" : "גם אני רוצה"} ({r.votes})<span className="sr-only"> לבקשה: {r.text}</span>
                  </button>
                )}
                {r.status === "DONE" && <span className="pill pill-ok">טופל</span>}
                {r.status === "OPEN" && user && isAdminUser(user) && (
                  <>
                    <button type="button" className="btn btn-small" onClick={() => resolve(r.id, "DONE")}>
                      סימון כטופל<span className="sr-only"> לבקשה: {r.text}</span>
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => resolve(r.id, "DISMISSED")}>
                      הסרה<span className="sr-only"> של הבקשה: {r.text}</span>
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ───────── 45. היכל התהילה ─────────
interface Hall {
  topRated: (Brief & { average: number; count: number })[];
  mostRun: (Brief & { runs: number })[];
  newest: Brief[];
}

export function HallPage() {
  const [h, setH] = useState<Hall | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Hall>("/api/hall")
      .then(setH)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <p className="error-box" role="alert">{error}</p>;
  if (!h) return <Skeleton lines={5} />;
  const block = (title: string, id: string, rows: { id: number; title: string; note: string }[], empty: string) => (
    <section className="card glass" aria-labelledby={id}>
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ol className="plain-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/library/${r.id}`}>{r.title}</Link>
              <span className="hint">{r.note}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  return (
    <>
      {block("הכי אהובות ב-30 הימים האחרונים", "hall-rated", h.topRated.map((x) => ({ id: x.id, title: x.title, note: `${x.average} כוכבים (${x.count} דירוגים)` })), "עוד אין דירוגים החודש.")}
      {block("הכי הרבה הופעלו", "hall-run", h.mostRun.map((x) => ({ id: x.id, title: x.title, note: `${x.runs} הפעלות` })), "עוד אין הפעלות מתועדות החודש.")}
      {block("חדשות במאגר", "hall-new", h.newest.map((x) => ({ id: x.id, title: x.title, note: x.ageGroup })), "אין פעולות חדשות.")}
    </>
  );
}

// ───────── 46. דף שבועי להדפסה ─────────
export function PrintWeek() {
  const { token, ready } = useAuth();
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const from = todayLocal();
  const to = addDaysIso(from, 6);
  useEffect(() => {
    if (!token) return;
    api<ScheduleItem[]>(`/api/me/schedule?from=${from}&to=${to}`, { token })
      .then(setItems)
      .catch(() => setItems([]));
  }, [token, from, to]);
  if (!ready) return <Skeleton lines={3} />;
  if (!token) return <p>כדי לראות את השבוע שלכם צריך <Link href="/account">להתחבר</Link>.</p>;
  if (!items) return <Skeleton lines={3} />;
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
  return (
    <div className="printable">
      <p className="no-print actions">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          הדפסה או שמירה כ-PDF
        </button>
        <Link className="btn" href="/calendar">
          חזרה ליומן
        </Link>
      </p>
      <p className="print-only">שבט מעוז · השבוע שלי</p>
      <table className="week-table">
        <caption>השבוע הקרוב, {fmtDay(from)} עד {fmtDay(to)}</caption>
        <thead>
          <tr>
            <th scope="col">יום</th>
            <th scope="col">מה מתוכנן</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const todays = items.filter((x) => x.date === d);
            return (
              <tr key={d}>
                <th scope="row">{fmtDay(d)}</th>
                <td>
                  {todays.length === 0
                    ? "—"
                    : todays.map((x) => (
                        <div key={x.id}>
                          <strong>{x.time ? `${x.time} · ` : ""}{x.title}</strong>
                          {x.groupLabel ? ` · ${x.groupLabel}` : ""}
                          {x.durationMin ? ` · ${x.durationMin} דק׳` : ""}
                          {x.note ? <div className="hint">{x.note}</div> : null}
                        </div>
                      ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────── 50. הודעות שבט ─────────
interface Ann {
  id: number;
  text: string;
  createdAt: string;
}

export function AnnouncementsBanner() {
  const [items, setItems] = useState<Ann[]>([]);
  useEffect(() => {
    api<Ann[]>("/api/announcements")
      .then(setItems)
      .catch(() => {});
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="card glass announce" aria-labelledby="ann-title">
      <h2 id="ann-title" className="section-title">
        הודעות מהשבט
      </h2>
      <ul className="plain-list">
        {items.map((a) => (
          <li key={a.id}>
            <span>{a.text}</span>
            <span className="hint">{fmtDate(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminAnnouncements() {
  const { token } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Ann[]>([]);
  const [text, setText] = useState("");
  const load = useCallback(() => {
    api<Ann[]>("/api/announcements")
      .then(setItems)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  const add = async () => {
    try {
      await api("/api/admin/announcements", { method: "POST", token, body: { text } });
      setText("");
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const del = async (id: number) => {
    await api(`/api/admin/announcements/${id}`, { method: "DELETE", token }).catch(() => {});
    load();
  };
  return (
    <section className="card glass" aria-labelledby="adm-ann-title">
      <h2 id="adm-ann-title" className="section-title">
        הודעות שבט בדף הבית
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Field label="הודעה חדשה" htmlFor="ann-text" hint="מופיעה בדף הבית לכולם. מוצגות שלוש האחרונות.">
          <input id="ann-text" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary">
          פרסום הודעה
        </button>
      </form>
      <ul className="plain-list">
        {items.map((a) => (
          <li key={a.id}>
            <span>{a.text}</span>
            <button type="button" className="btn btn-small" onClick={() => del(a.id)}>
              הסרה<span className="sr-only"> של ההודעה: {a.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────── 48. איחוד כפילויות (אדמין, בעמוד הפעולה) ─────────
export function MergeTool({ fromId, candidates, onDone }: { fromId: number; candidates: { id: number; title: string }[]; onDone: () => void }) {
  const { token, user } = useAuth();
  const toast = useToast();
  if (!user || !isAdminUser(user) || candidates.length === 0) return null;
  const merge = async (c: { id: number; title: string }) => {
    if (!window.confirm(`לאחד את הפעולה הזאת לתוך "${c.title}"? ההפעלות, הדירוגים וההערות יעברו אליה, והפעולה הנוכחית תעבור לארכיון.`)) return;
    try {
      await api(`/api/admin/activities/${fromId}/merge`, { method: "POST", token, body: { intoId: c.id } });
      toast("הפעולות אוחדו", { kind: "success" });
      onDone();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <details className="no-print merge-tool">
      <summary>איחוד כפילות (אדמין)</summary>
      <ul className="plain-list">
        {candidates.map((c) => (
          <li key={c.id}>
            <span>{c.title}</span>
            <button type="button" className="btn btn-small" onClick={() => merge(c)}>
              איחוד לתוך זו<span className="sr-only">: {c.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

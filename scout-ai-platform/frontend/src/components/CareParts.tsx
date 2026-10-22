"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_URL, ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { MergeTool } from "./CommunityParts";
import { Field, Modal } from "./ui";

/** הורדת קובץ שדורש הרשאה (טוקן) */
async function downloadAuth(path: string, token: string | null, fallbackName: string) {
  const res = await fetch(API_URL + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "DL", "ההורדה נכשלה");
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ───────── 34. בטיחות ─────────
interface Safety {
  risks: { id: string; label: string; stages: string[]; suggestion: string; covered: boolean }[];
  missingCount: number;
  ok: boolean;
  addition: string;
}

export function SafetyPanel({ activityId, canManage, onChanged }: { activityId: number; canManage: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<Safety | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Safety>(`/api/activities/${activityId}/safety`)
      .then(setS)
      .catch((e) => setError(errorMessage(e)));
  }, [activityId]);
  useEffect(load, [load]);

  const apply = async () => {
    setBusy(true);
    try {
      await api(`/api/activities/${activityId}/safety/apply`, { method: "POST", token, body: {} });
      toast("הנחיות הבטיחות נוספו, והגרסה הקודמת נשמרה בהיסטוריה", { kind: "success" });
      load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <details id="safety" className="card glass insight no-print">
      <summary>
        בדיקת בטיחות{s && !s.ok ? ` (${s.missingCount} הערות)` : ""}
      </summary>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {s && s.risks.length === 0 && <p>לא זוהו בפעולה גורמי סיכון מיוחדים. הבדיקה מבוססת על מילות מפתח ולא מחליפה שיקול דעת.</p>}
      {s && s.risks.length > 0 && (
        <ul className="plain-list">
          {s.risks.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.label}</strong> ({r.stages.join(", ")})
                <br />
                <span className="hint">{r.covered ? "כבר מופיע בהערות הבטיחות." : r.suggestion}</span>
              </span>
              <span className={r.covered ? "pill pill-ok" : "pill pill-warn"}>{r.covered ? "מכוסה" : "חסר"}</span>
            </li>
          ))}
        </ul>
      )}
      {s && !s.ok && canManage && s.addition && (
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
            {busy ? "מוסיף..." : "הוספת ההנחיות החסרות"}
          </button>
        </div>
      )}
      <p className="hint">הבדיקה אוטומטית ומבוססת על מילות מפתח. היא עוזרת לא לפספס, אבל האחריות על הבטיחות נשארת אצל המדריך.</p>
    </details>
  );
}

// ───────── 36. דיווח ─────────
export function FlagButton({ activityId }: { activityId: number }) {
  const toast = useToast();
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<{ id: string; label: string }[]>([]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && reasons.length === 0) api<{ id: string; label: string }[]>("/api/flag-reasons").then(setReasons).catch(() => {});
  }, [open, reasons.length]);

  const send = async () => {
    if (!reason) return toast("בחרו סיבה לדיווח", { kind: "error" });
    setBusy(true);
    try {
      await api(`/api/activities/${activityId}/flags`, { method: "POST", token, body: { reason, note } });
      toast("תודה, הדיווח הועבר למנהל השבט", { kind: "success" });
      setOpen(false);
      setReason("");
      setNote("");
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        דיווח על בעיה
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="דיווח על בעיה בפעולה"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              ביטול
            </button>
            <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
              {busy ? "שולח..." : "שליחת דיווח"}
            </button>
          </>
        }
      >
        <Field label="מה הבעיה?" htmlFor="flag-reason">
          <select id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">בחרו...</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="פרטים (לא חובה)" htmlFor="flag-note" hint="עד 300 תווים">
          <textarea id="flag-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

// ───────── 37. התראות ─────────
interface Notif {
  id: number;
  kind: string;
  text: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  const { token } = useAuth();
  const [data, setData] = useState<{ unread: number; items: Notif[] }>({ unread: 0, items: [] });
  const load = useCallback(() => {
    if (!token) return setData({ unread: 0, items: [] });
    api<{ unread: number; items: Notif[] }>("/api/me/notifications", { token })
      .then(setData)
      .catch(() => {});
  }, [token]);
  useEffect(() => {
    load();
    if (!token) return;
    const t = window.setInterval(load, 60_000);
    window.addEventListener("scout:notif", load);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("scout:notif", load);
    };
  }, [load, token]);
  return data;
}

/** תג מספר ההתראות שלא נקראו, לתפריט הראשי */
export function NavBadge() {
  const { unread } = useNotifications();
  if (!unread) return null;
  return (
    <span className="nav-badge" role="status">
      <span aria-hidden="true">{unread}</span>
      <span className="sr-only"> {unread} התראות חדשות</span>
    </span>
  );
}

export function NotificationsPanel() {
  const { token } = useAuth();
  const { items, unread } = useNotifications();
  const mark = async (body: unknown) => {
    await api("/api/me/notifications/read", { method: "POST", token, body }).catch(() => {});
    window.dispatchEvent(new Event("scout:notif"));
  };
  return (
    <section className="card glass" aria-labelledby="notif-title">
      <h2 id="notif-title" className="section-title">
        התראות{unread ? ` (${unread} חדשות)` : ""}
      </h2>
      {items.length === 0 ? (
        <p className="hint">אין התראות. כאן יופיעו אישורי פעולות, שיתופים ודיווחים.</p>
      ) : (
        <>
          <ul className="plain-list">
            {items.map((n) => (
              <li key={n.id} className={n.read ? "" : "notif-new"}>
                <span>
                  {!n.read && <strong>חדש · </strong>}
                  {n.link ? (
                    <Link href={n.link} onClick={() => mark({ ids: [n.id] })}>
                      {n.text}
                    </Link>
                  ) : (
                    n.text
                  )}
                  <br />
                  <span className="hint">{fmtDate(n.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
          {unread > 0 && (
            <div className="actions">
              <button type="button" className="btn" onClick={() => mark({ all: true })}>
                סימון הכל כנקרא
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ───────── 41. ייצוא נתונים ─────────
export function ExportMine() {
  const { token } = useAuth();
  const toast = useToast();
  return (
    <section className="card glass" aria-labelledby="export-title">
      <h2 id="export-title" className="section-title">
        הנתונים שלי
      </h2>
      <p>קובץ אחד עם הפעולות שיצרתם, תיעוד ההפעלות, היומן, ההערות, האוספים והסגנון. אפשר לשמור אותו כגיבוי אישי.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => downloadAuth("/api/me/export", token, "my-scout-data.json").catch((e) => toast(errorMessage(e), { kind: "error" }))}>
          הורדת הנתונים שלי
        </button>
      </div>
    </section>
  );
}

// ───────── 42. פעולות דומות ─────────
interface Sim {
  id: number;
  title: string;
  ageGroup: string;
  durationMin: number;
  leadingValue: string;
  score: number;
  nearDuplicate: boolean;
}

export function SimilarActivities({ activityId, onMerged }: { activityId: number; onMerged?: () => void }) {
  const [items, setItems] = useState<Sim[] | null>(null);
  useEffect(() => {
    api<Sim[]>(`/api/activities/${activityId}/similar`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [activityId]);
  if (!items || items.length === 0) return null;
  return (
    <section className="card glass no-print" aria-labelledby="sim-title">
      <h2 id="sim-title" className="section-title">
        פעולות דומות
      </h2>
      <ul className="plain-list">
        {items.map((s) => (
          <li key={s.id}>
            <Link href={`/library/${s.id}`}>{s.title}</Link>
            <span className="hint">
              {s.ageGroup} · {s.durationMin} דק׳{s.nearDuplicate ? " · כמעט זהה" : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">הדמיון נקבע לפי מילים משותפות, ולכן הוא הערכה בלבד.</p>
      <MergeTool fromId={activityId} candidates={items.filter((s) => s.nearDuplicate).map((s) => ({ id: s.id, title: s.title }))} onDone={() => onMerged?.()} />
    </section>
  );
}

// ───────── אדמין: דיווחים, אחסון, דוח ─────────
interface FlagRow {
  id: number;
  activityId: number;
  title: string;
  reasonLabel: string;
  note: string;
  reporter: string;
  createdAt: string;
}

export function AdminFlags() {
  const { token, clear } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<FlagRow[]>([]);
  const load = useCallback(() => {
    api<FlagRow[]>("/api/admin/flags", { token })
      .then(setRows)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
      });
  }, [token, clear]);
  useEffect(load, [load]);
  const act = async (id: number, action: "dismiss" | "resolved" | "archive") => {
    try {
      await api(`/api/admin/flags/${id}/resolve`, { method: "POST", token, body: { action } });
      toast(action === "archive" ? "הפעולה הועברה לארכיון" : "הדיווח נסגר", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="flags-title" className="card glass">
      <h2 id="flags-title" className="section-title">
        דיווחים על פעולות{rows.length ? ` (${rows.length})` : ""}
      </h2>
      {rows.length === 0 ? (
        <p className="hint">אין דיווחים פתוחים.</p>
      ) : (
        <ul className="plain-list">
          {rows.map((f) => (
            <li key={f.id}>
              <span>
                <Link href={`/library/${f.activityId}`}>{f.title}</Link> · <strong>{f.reasonLabel}</strong>
                {f.note && <> · {f.note}</>}
                <br />
                <span className="hint">
                  {f.reporter} · {fmtDate(f.createdAt)}
                </span>
              </span>
              <span className="actions">
                <button type="button" className="btn btn-small" onClick={() => act(f.id, "dismiss")}>
                  לא רלוונטי<span className="sr-only"> לדיווח על {f.title}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => act(f.id, "resolved")}>
                  טופל<span className="sr-only"> בדיווח על {f.title}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => act(f.id, "archive")}>
                  העברה לארכיון<span className="sr-only"> של {f.title}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface Storage {
  dbPath: string;
  sizeBytes: number | null;
  persistent: boolean;
  backups: number;
  lastBackup: string | null;
  warning: string;
}

export function AdminStorage() {
  const { token } = useAuth();
  const [s, setS] = useState<Storage | null>(null);
  useEffect(() => {
    api<Storage>("/api/admin/storage", { token })
      .then(setS)
      .catch(() => {});
  }, [token]);
  if (!s) return null;
  return (
    <section aria-labelledby="storage-title" className="card glass">
      <h2 id="storage-title" className="section-title">
        מצב האחסון
      </h2>
      {s.warning ? (
        <p className="warn-box" role="alert">
          {s.warning}
        </p>
      ) : (
        <p className="ok-box" role="status">
          המסד נשמר על דיסק קבוע.
        </p>
      )}
      <p className="hint">
        גיבויים: {s.backups}
        {s.lastBackup ? ` · אחרון: ${fmtDate(s.lastBackup)}` : ""}
        {s.sizeBytes != null ? ` · גודל המסד: ${Math.max(1, Math.round(s.sizeBytes / 1024))} KB` : ""}
      </p>
    </section>
  );
}

interface Report {
  from: string;
  to: string;
  totals: Record<string, number>;
  instructors: { name: string; created: number; runs: number }[];
  mostRun: { id: number; title: string; runs: number }[];
  topRated: { id: number; title: string; average: number; count: number }[];
}

const TOTAL_LABELS: [string, string][] = [
  ["created", "פעולות חדשות"],
  ["published", "פורסמו"],
  ["pending", "ממתינות לאישור"],
  ["archived", "נמחקו"],
  ["runs", "הפעלות שתועדו"],
  ["ratings", "דירוגים"],
  ["averageRating", "דירוג ממוצע"],
  ["feedback", "משובי חניכים"],
  ["openFlags", "דיווחים פתוחים"],
];

export function AdminReport() {
  const { token } = useAuth();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [r, setR] = useState<Report | null>(null);
  const qs = `from=${from}&to=${to}`;
  const load = useCallback(() => {
    api<Report>(`/api/admin/report?${qs}`, { token })
      .then(setR)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [qs, token, toast]);
  useEffect(load, [load]);
  return (
    <section aria-labelledby="report-title" className="card glass">
      <h2 id="report-title" className="section-title">
        דוח תקופתי
      </h2>
      <div className="row">
        <Field label="מתאריך" htmlFor="rep-from">
          <input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="עד תאריך" htmlFor="rep-to">
          <input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {r && (
        <>
          <dl className="stat-grid">
            {TOTAL_LABELS.map(([k, label]) => (
              <div key={k}>
                <dt>{label}</dt>
                <dd>{r.totals[k]}</dd>
              </div>
            ))}
          </dl>
          {r.instructors.length > 0 && (
            <ul className="plain-list">
              {r.instructors.map((i) => (
                <li key={i.name}>
                  <span>{i.name}</span>
                  <span className="hint">
                    {i.created} פעולות · {i.runs} הפעלות
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={() => downloadAuth(`/api/admin/report.csv?${qs}`, token, "report.csv").catch((e) => toast(errorMessage(e), { kind: "error" }))}>
          הורדת הדוח כקובץ CSV
        </button>
      </div>
    </section>
  );
}

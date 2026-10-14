"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import { useAuth, useToast } from "./Providers";

interface UserRow {
  id: number;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "INSTRUCTOR";
  disabled: boolean;
  createdAt: string;
  activities: number;
}

export function AdminUsers() {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    api<UserRow[]>("/api/admin/users", { token })
      .then(setRows)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
        else toast(errorMessage(e), { kind: "error" });
      });
  }, [token, clear, toast]);
  useEffect(load, [load]);

  const patch = async (u: UserRow, body: Record<string, unknown>, okMsg: string) => {
    setBusyId(u.id);
    try {
      const r = await api<{ tempPassword?: string }>(`/api/admin/users/${u.id}`, { method: "PATCH", token, body });
      if (r.tempPassword) setTemp({ name: u.displayName || u.username, pw: r.tempPassword });
      toast(okMsg, { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusyId(null);
  };

  return (
    <section aria-labelledby="users-title" className="card glass">
      <h2 id="users-title" className="section-title">
        משתמשים
      </h2>
      <p className="hint">מדריכים נרשמים בעצמם עם קוד ההרשמה של השבט. כאן אפשר להשבית משתמש, לאפס סיסמה או למנות אדמין.</p>
      {temp && (
        <div className="error-box" role="status">
          <p>
            הסיסמה הזמנית של <strong>{temp.name}</strong>: <code dir="ltr">{temp.pw}</code>
          </p>
          <p className="hint">מוצגת פעם אחת בלבד. מעבירים אותה למדריך, והוא יתבקש להחליף אותה בכניסה.</p>
          <button type="button" className="btn btn-small" onClick={() => setTemp(null)}>
            הבנתי, אפשר להסתיר
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">רשימת משתמשים</caption>
          <thead>
            <tr>
              <th scope="col">שם</th>
              <th scope="col">שם משתמש</th>
              <th scope="col">תפקיד</th>
              <th scope="col">פעולות</th>
              <th scope="col">סטטוס</th>
              <th scope="col">ניהול</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const me = u.id === user?.id;
              return (
                <tr key={u.id}>
                  <th scope="row">{u.displayName || u.username}</th>
                  <td data-label="שם משתמש" dir="ltr">{u.username}</td>
                  <td data-label="תפקיד">{u.role === "ADMIN" ? "אדמין" : "מדריך/ה"}</td>
                  <td data-label="פעולות">{u.activities}</td>
                  <td data-label="סטטוס">{u.disabled ? "מושבת" : "פעיל"}</td>
                  <td data-label="ניהול">
                    <div className="actions">
                      {!me && (
                        <>
                          <button type="button" className="btn btn-small" disabled={busyId === u.id} onClick={() => patch(u, { disabled: !u.disabled }, u.disabled ? "המשתמש הופעל" : "המשתמש הושבת")}>
                            {u.disabled ? "הפעלה" : "השבתה"}
                            <span className="sr-only"> של {u.displayName || u.username}</span>
                          </button>
                          <button type="button" className="btn btn-small" disabled={busyId === u.id} onClick={() => patch(u, { resetPassword: true }, "נוצרה סיסמה זמנית")}>
                            איפוס סיסמה<span className="sr-only"> של {u.displayName || u.username}</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={busyId === u.id}
                            onClick={() => patch(u, { role: u.role === "ADMIN" ? "INSTRUCTOR" : "ADMIN" }, u.role === "ADMIN" ? "ההרשאה הוסרה" : "המשתמש מונה לאדמין")}
                          >
                            {u.role === "ADMIN" ? "הסרת אדמין" : "מינוי לאדמין"}
                            <span className="sr-only"> ל{u.displayName || u.username}</span>
                          </button>
                        </>
                      )}
                      {me && <span className="hint">זה אתם</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface BackupRow {
  name: string;
  size: number;
  createdAt: string;
}

export function AdminBackups() {
  const { token, clear } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ items: BackupRow[] }>("/api/admin/backups", { token })
      .then((r) => setItems(r.items))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
      });
  }, [token, clear]);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api("/api/admin/backups", { method: "POST", token });
      toast("הגיבוי נוצר", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  // the download needs the admin token, so it goes through fetch and not through a plain link
  const download = async (name: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/backups/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new ApiError(res.status, "DL", "הורדת הגיבוי נכשלה");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <section aria-labelledby="backups-title" className="card glass">
      <h2 id="backups-title" className="section-title">
        גיבויים
      </h2>
      <p className="hint">המערכת מגבה את מסד הנתונים אוטומטית פעם ביום ושומרת את האחרונים. מומלץ להוריד גיבוי מדי פעם למקום אחר (מחשב או דרייב), כי גיבוי שנשמר על אותו שרת לא יעזור אם השרת נמחק.</p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
          {busy ? "יוצר..." : "יצירת גיבוי עכשיו"}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="hint">עדיין אין גיבויים.</p>
      ) : (
        <ul className="plain-list">
          {items.slice(0, 10).map((b) => (
            <li key={b.name}>
              <span>
                {fmtDate(b.createdAt)} · {kb(b.size)}
              </span>
              <button type="button" className="btn btn-small" onClick={() => download(b.name)}>
                הורדה<span className="sr-only"> של הגיבוי מ-{fmtDate(b.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminLogo() {
  const { token } = useAuth();
  const toast = useToast();
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ logoVersion: string | null }>("/api/meta")
      .then((m) => setVersion(m.logoVersion))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/logo`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: file });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "ERR", data?.error?.message ?? "ההעלאה נכשלה");
      toast("הלוגו הוחלף. ברענון הדף הוא יופיע בכותרת", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  const remove = async () => {
    try {
      await api("/api/admin/logo", { method: "DELETE", token });
      setVersion(null);
      toast("הלוגו הוסר", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  return (
    <section className="card glass" aria-labelledby="logo-title">
      <h2 id="logo-title" className="section-title">
        לוגו השבט
      </h2>
      {version ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="logo-preview" src={`${API_URL}/api/logo?v=${version}`} alt="הלוגו הנוכחי של השבט" />
      ) : (
        <p>עוד לא הועלה לוגו, ולכן מוצג סמל ברירת מחדל.</p>
      )}
      <div className="field">
        <label htmlFor="logo-file">העלאת לוגו (PNG, JPG או WebP, עד 700KB)</label>
        <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {version && (
        <button type="button" className="btn" onClick={remove}>
          הסרת הלוגו
        </button>
      )}
    </section>
  );
}

export function AdminApproval() {
  const { token } = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState<{ id: number; title: string; author: string | null; createdAt: string }[]>([]);

  const load = useCallback(() => {
    api<{ requireApproval: boolean }>("/api/admin/settings", { token })
      .then((s) => setOn(s.requireApproval))
      .catch(() => {});
    api<typeof pending>("/api/admin/pending", { token })
      .then(setPending)
      .catch(() => {});
  }, [token]);
  useEffect(load, [load]);

  const toggle = async (v: boolean) => {
    try {
      await api("/api/admin/settings", { method: "PUT", token, body: { requireApproval: v } });
      setOn(v);
      toast(v ? "פעולות חדשות של מדריכים ימתינו לאישור שלכם" : "פעולות חדשות מתפרסמות מיד", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const decide = async (id: number, what: "approve" | "reject") => {
    try {
      await api(`/api/admin/activities/${id}/${what}`, { method: "POST", token, body: {} });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  return (
    <section className="card glass" aria-labelledby="appr-title">
      <h2 id="appr-title" className="section-title">
        אישור פעולות לפני פרסום
      </h2>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} />
        <span>פעולה חדשה של מדריך תופיע במאגר המשותף רק אחרי שאאשר אותה</span>
      </label>
      <p className="hint">עד האישור הפעולה לא מופיעה בחיפוש, אבל מי שיש לו את הקישור יכול לפתוח אותה. פעולות שאדמין יוצר מתפרסמות מיד.</p>
      {pending.length === 0 ? (
        <p>אין פעולות שממתינות לאישור.</p>
      ) : (
        <ul className="plain-list">
          {pending.map((p) => (
            <li key={p.id}>
              <span>
                <a href={`/library/${p.id}`}>{p.title}</a> · {p.author ?? "לא ידוע"} · {fmtDate(p.createdAt)}
              </span>
              <span className="actions">
                <button type="button" className="btn btn-primary btn-small" onClick={() => decide(p.id, "approve")} aria-label={`אישור ${p.title}`}>
                  אישור
                </button>
                <button type="button" className="btn btn-small" onClick={() => decide(p.id, "reject")} aria-label={`דחיית ${p.title}`}>
                  דחייה
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface Insights {
  published: number;
  pending: number;
  values: { value: string; count: number }[];
  weeks: { weekStart: string; created: number }[];
  instructors: { name: string; activities: number; runs: number }[];
  neverRun: { id: number; title: string }[];
  mostRun: { id: number; title: string; runs: number }[];
  feedback: { count: number; average: number };
}

export function AdminInsights() {
  const { token } = useAuth();
  const [d, setD] = useState<Insights | null>(null);
  useEffect(() => {
    api<Insights>("/api/admin/insights", { token })
      .then(setD)
      .catch(() => {});
  }, [token]);
  if (!d) return null;
  const maxV = Math.max(1, ...d.values.map((v) => v.count));
  const maxW = Math.max(1, ...d.weeks.map((w) => w.created));
  return (
    <section className="card glass" aria-labelledby="ins-title">
      <h2 id="ins-title" className="section-title">
        תובנות
      </h2>
      <p>
        {d.published} פעולות במאגר, {d.pending} ממתינות לאישור. משוב מחניכים: {d.feedback.count} תשובות{d.feedback.count ? `, ממוצע ${d.feedback.average}` : ""}.
      </p>
      <h3 className="sub-title">איזה ערכים מכוסים</h3>
      <ul className="bars" aria-label="פעולות לפי ערך">
        {d.values.map((v) => (
          <li key={v.value}>
            <span className="bar-label">{v.value}</span>
            <span className="bar" aria-hidden="true">
              <span style={{ width: `${(v.count / maxV) * 100}%` }} />
            </span>
            <span className="bar-num">{v.count}</span>
          </li>
        ))}
      </ul>
      <h3 className="sub-title">פעולות חדשות בשמונה השבועות האחרונים</h3>
      <ul className="bars" aria-label="פעולות חדשות לפי שבוע">
        {d.weeks.map((w) => (
          <li key={w.weekStart}>
            <span className="bar-label">{new Date(`${w.weekStart}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}</span>
            <span className="bar" aria-hidden="true">
              <span style={{ width: `${(w.created / maxW) * 100}%` }} />
            </span>
            <span className="bar-num">{w.created}</span>
          </li>
        ))}
      </ul>
      <div className="table-wrap">
        <table className="data-table">
          <caption>מדריכים פעילים</caption>
          <thead>
            <tr>
              <th scope="col">מדריך</th>
              <th scope="col">פעולות</th>
              <th scope="col">הפעלות שנרשמו</th>
            </tr>
          </thead>
          <tbody>
            {d.instructors.map((i) => (
              <tr key={i.name}>
                <th scope="row">{i.name}</th>
                <td>{i.activities}</td>
                <td>{i.runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.mostRun.length > 0 && (
        <>
          <h3 className="sub-title">הכי מופעלות</h3>
          <ul className="plain-list">
            {d.mostRun.map((a) => (
              <li key={a.id}>
                <a href={`/library/${a.id}`}>{a.title}</a> ({a.runs})
              </li>
            ))}
          </ul>
        </>
      )}
      {d.neverRun.length > 0 && (
        <>
          <h3 className="sub-title">עוד לא הופעלו (לפי היומנים)</h3>
          <ul className="plain-list">
            {d.neverRun.map((a) => (
              <li key={a.id}>
                <a href={`/library/${a.id}`}>{a.title}</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

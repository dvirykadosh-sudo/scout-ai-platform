"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/constants";
import type { LogRow, SessionRow, Stats } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

interface LoginResponse {
  token: string;
  user: { username: string; role: string; mustChangePw: boolean };
}

function LoginForm() {
  const { setSession } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError("יש למלא שם משתמש וסיסמה");
    setBusy(true);
    setError("");
    try {
      const r = await api<LoginResponse>("/api/auth/login", { method: "POST", body: { username: username.trim(), password } });
      setSession(r.token, { username: r.user.username, mustChangePw: r.user.mustChangePw });
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <form className="card glass narrow" onSubmit={submit} noValidate aria-labelledby="login-title">
      <h2 id="login-title" className="section-title">
        התחברות אדמין
      </h2>
      <p className="hint">יצירת פעולות וצפייה במאגר פתוחות לכולם. עריכה, מחיקה ולוח הבקרה דורשים התחברות.</p>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Field label="שם משתמש" htmlFor="login-user">
        <input id="login-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      </Field>
      <Field label="סיסמה" htmlFor="login-pass">
        <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "מתחבר..." : "כניסה"}
      </button>
    </form>
  );
}

function ChangePassword() {
  const { token, user, setSession, clear } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
    if (next !== again) return setError("הסיסמאות החדשות אינן זהות");
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token: string }>("/api/auth/change-password", { method: "POST", token, body: { currentPassword: current, newPassword: next } });
      setSession(r.token, { username: user?.username ?? "admin", mustChangePw: false });
      toast("הסיסמה הוחלפה", { kind: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clear();
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <form className="card glass narrow" onSubmit={submit} noValidate aria-labelledby="pw-title">
      <h2 id="pw-title" className="section-title">
        החלפת סיסמה
      </h2>
      <p className="hint">{user?.mustChangePw ? "לפני שממשיכים יש להחליף את הסיסמה הראשונית." : "בחרו סיסמה חדשה."}</p>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Field label="סיסמה נוכחית" htmlFor="pw-cur">
        <input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="סיסמה חדשה" htmlFor="pw-new" hint="לפחות 8 תווים">
        <input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="סיסמה חדשה, פעם נוספת" htmlFor="pw-again">
        <input id="pw-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "שומר..." : "החלפת סיסמה"}
      </button>
    </form>
  );
}

function BarList({ title, data }: { title: string; data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  return (
    <section className="card glass" aria-label={title}>
      <h3 className="card-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="hint">אין נתונים</p>
      ) : (
        <ul className="bars">
          {rows.map(([k, v]) => (
            <li key={k}>
              <span className="bar-label">{k}</span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span className="bar-num">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function summarize(d: Record<string, unknown> | null): string {
  if (!d) return "";
  if (typeof d.title === "string") return d.title;
  if (typeof d.from === "number" && typeof d.id === "number") return `העתק של פעולה ${d.from} (פעולה חדשה ${d.id})`;
  if (typeof d.username === "string") return d.username;
  if (typeof d.id === "number") return `פעולה ${d.id}`;
  if (typeof d.ip === "string") return `IP ${d.ip}`;
  if (typeof d.error === "string") return d.error;
  const s = JSON.stringify(d);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

const LOG_FILTERS: [string, string][] = [
  ["", "כל הפעולות"],
  ["activity.", "פעולות במאגר"],
  ["login.", "התחברויות"],
  ["email.", "מיילים"],
  ["password.", "סיסמאות"],
];

function Dashboard() {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logFilter, setLogFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = logFilter ? `?action=${encodeURIComponent(logFilter)}` : "";
      const [s, ss, l] = await Promise.all([
        api<Stats>("/api/admin/stats", { token }),
        api<SessionRow[]>("/api/admin/sessions", { token }),
        api<LogRow[]>(`/api/admin/logs${q}`, { token }),
      ]);
      setStats(s);
      setSessions(ss);
      setLogs(l);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clear();
        toast("ההתחברות פגה. יש להתחבר שוב", { kind: "error" });
        return;
      }
      setError(errorMessage(e));
    }
    setLoading(false);
  }, [token, logFilter, clear, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = () => {
    clear();
    toast("התנתקת מהמערכת", { kind: "info" });
  };

  return (
    <>
      <div className="admin-head">
        <p>
          מחובר/ת כ-<strong>{user?.username}</strong>
        </p>
        <div className="actions">
          <button type="button" className="btn" onClick={load} disabled={loading}>
            רענון
          </button>
          <button type="button" className="btn" onClick={logout}>
            התנתקות
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
      {loading && !stats && <Skeleton lines={5} />}

      {stats && (
        <>
          <section aria-labelledby="stats-title">
            <h2 id="stats-title" className="section-title">
              סטטיסטיקות
            </h2>
            <ul className="stat-tiles">
              <li className="card glass">
                <span className="stat-num">{stats.total}</span>
                <span>פעולות במאגר</span>
              </li>
              <li className="card glass">
                <span className="stat-num">{stats.generatedLast7Days}</span>
                <span>נוצרו ב-7 הימים האחרונים</span>
              </li>
              <li className="card glass">
                <span className="stat-num">{stats.emailQueue.find((x) => x.status === "SENT")?.c ?? 0}</span>
                <span>מיילים שנשלחו</span>
              </li>
              <li className="card glass">
                <span className="stat-num">{(stats.emailQueue.find((x) => x.status === "FAILED")?.c ?? 0) + (stats.emailQueue.find((x) => x.status === "PENDING")?.c ?? 0)}</span>
                <span>מיילים ממתינים או שנכשלו</span>
              </li>
            </ul>
            <div className="grid-list">
              <BarList title="לפי שכבת גיל" data={stats.byAgeGroup} />
              <BarList title="לפי ערך מוביל" data={stats.byValue} />
              <BarList title="לפי שיטה" data={stats.byMethod} />
            </div>
          </section>

          <section aria-labelledby="manage-title" className="card glass">
            <h2 id="manage-title" className="section-title">
              ניהול פעולות
            </h2>
            <p>עריכה, מחיקה ושחזור של פעולות נעשים במאגר. כשמחוברים כאדמין מופיעים שם כפתורי עריכה ומחיקה.</p>
            <Link className="btn btn-primary" href="/library">
              למאגר הפעולות
            </Link>
          </section>

          <section aria-labelledby="sessions-title" className="card glass">
            <h2 id="sessions-title" className="section-title">
              חיבורים אחרונים
            </h2>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">חיבורים אחרונים לשרת</caption>
                <thead>
                  <tr>
                    <th scope="col">כתובת IP</th>
                    <th scope="col">פעילות אחרונה</th>
                    <th scope="col">כניסה ראשונה</th>
                    <th scope="col">סוג</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i}>
                      <td data-label="כתובת IP" dir="ltr">
                        {s.ip}
                      </td>
                      <td data-label="פעילות אחרונה">{fmtDate(s.lastSeen)}</td>
                      <td data-label="כניסה ראשונה">{fmtDate(s.firstSeen)}</td>
                      <td data-label="סוג">{s.username ? `אדמין (${s.username})` : "אורח"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="logs-title" className="card glass">
            <h2 id="logs-title" className="section-title">
              יומן פעילות
            </h2>
            <Field label="הצגה" htmlFor="log-filter">
              <select id="log-filter" value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
                {LOG_FILTERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">יומן פעילות</caption>
                <thead>
                  <tr>
                    <th scope="col">זמן</th>
                    <th scope="col">מי</th>
                    <th scope="col">פעולה</th>
                    <th scope="col">פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td data-label="זמן">{fmtDate(l.at)}</td>
                      <td data-label="מי">{l.actor === "anonymous" ? "אורח" : l.actor}</td>
                      <td data-label="פעולה">{ACTION_LABELS[l.action] ?? l.action}</td>
                      <td data-label="פרטים">{summarize(l.details)}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4}>אין רשומות</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function AdminPanel() {
  const { token, user, ready } = useAuth();
  if (!ready) return <Skeleton lines={3} />;
  if (!token || !user) return <LoginForm />;
  if (user.mustChangePw) return <ChangePassword />;
  return <Dashboard />;
}

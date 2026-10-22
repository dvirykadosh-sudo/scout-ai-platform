"use client";

// אדמין: ניהול משתמשים, תפקידי צוות ויומן פעולות (רעיונות 88–90).
import { useCallback, useEffect, useState } from "react";
import { API_URL, ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/constants";
import { STAFF_LABEL, type Staff } from "@/lib/staff";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { downloadCsv } from "./AdminAccess";

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  role: "ADMIN" | "INSTRUCTOR";
  staffRole: Staff | null;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  totpEnabled: boolean;
  activities: number;
}
interface Detail extends UserRow {
  sessions: { id: string; device: string; ip: string; lastSeenAt: string }[];
  recent: { at: string; action: string }[];
}
interface RoleInfo {
  key: Staff;
  label: string;
  desc: string;
}

const roleText = (u: { role: string; staffRole: Staff | null }) => (u.role === "ADMIN" ? STAFF_LABEL[u.staffRole ?? "SUPER"] : "מדריך/ה");

export function AdminUsers() {
  const { token, user, clear } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const pageSize = 15;
  const isSuper = (user?.staffRole ?? "SUPER") === "SUPER";

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(q.trim() ? { q: q.trim() } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}) });
    api<{ items: UserRow[]; total: number }>(`/api/admin/users?${qs}`, { token })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
        else toast(errorMessage(e), { kind: "error" });
      });
  }, [token, page, q, role, status, clear, toast]);
  useEffect(() => {
    const t = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    api<RoleInfo[]>("/api/admin/roles", { token })
      .then(setRoles)
      .catch(() => {});
  }, [token]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section aria-labelledby="users-title" className="card glass">
      <h2 id="users-title" className="section-title">
        משתמשים
      </h2>
      <p className="hint">מדריכים נרשמים בעצמם עם קוד ההרשמה של השבט. כאן מנהלים חשבונות, תפקידים, אימות מייל וטלפון וחיבורים.</p>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={() => downloadCsv("/api/admin/users/export.csv", "users.csv", token).catch((e) => toast(errorMessage(e), { kind: "error" }))}>
          ייצוא משתמשים ל-Excel (CSV)
        </button>
      </div>
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
      <div className="assist-settings">
        <Field label="חיפוש (שם, שם משתמש, מייל או טלפון)" htmlFor="au-q">
          <input id="au-q" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        </Field>
        <Field label="סוג חשבון" htmlFor="au-role">
          <select id="au-role" value={role} onChange={(e) => (setRole(e.target.value), setPage(1))}>
            <option value="">הכול</option>
            <option value="INSTRUCTOR">מדריכים</option>
            <option value="ADMIN">צוות ניהול</option>
          </select>
        </Field>
        <Field label="מצב" htmlFor="au-status">
          <select id="au-status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">הכול</option>
            <option value="active">פעילים</option>
            <option value="disabled">מושבתים</option>
          </select>
        </Field>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          יצירת משתמש
        </button>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="רשימת משתמשים">
        <table className="data-table">
          <caption className="sr-only">רשימת משתמשים, {total} תוצאות</caption>
          <thead>
            <tr>
              <th scope="col">שם</th>
              <th scope="col">שם משתמש</th>
              <th scope="col">תפקיד</th>
              <th scope="col">מאומת</th>
              <th scope="col">כניסה אחרונה</th>
              <th scope="col">מצב</th>
              <th scope="col">ניהול</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <th scope="row">{u.displayName}</th>
                <td data-label="שם משתמש" dir="ltr">
                  {u.username}
                </td>
                <td data-label="תפקיד">{roleText(u)}</td>
                <td data-label="מאומת">
                  {[u.emailVerified && "מייל", u.phoneVerified && "טלפון", u.totpEnabled && "2FA"].filter(Boolean).join(", ") || "לא"}
                </td>
                <td data-label="כניסה אחרונה">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "עוד לא"}</td>
                <td data-label="מצב">{u.disabled ? "מושבת" : "פעיל"}</td>
                <td data-label="ניהול">
                  <button type="button" className="btn btn-small" onClick={() => setOpen(u.id)}>
                    פרטים וניהול<span className="sr-only"> של {u.displayName}</span>
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>לא נמצאו משתמשים</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          הקודם
        </button>
        <span aria-live="polite">
          עמוד {page} מתוך {pages}
        </span>
        <button type="button" className="btn btn-small" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          הבא
        </button>
      </div>

      {roles.length > 0 && (
        <details>
          <summary>מה כל תפקיד יכול לעשות</summary>
          <ul className="plain-list">
            {roles.map((r) => (
              <li key={r.key}>
                <span>
                  <strong>{r.label}</strong>: {r.desc}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {creating && <CreateUser isSuper={isSuper} roles={roles} onClose={() => setCreating(false)} onDone={(name, pw) => (setTemp({ name, pw }), setCreating(false), load())} />}
      {open !== null && <UserDialog id={open} meId={user?.id ?? 0} isSuper={isSuper} roles={roles} onClose={() => setOpen(null)} onChanged={load} onTemp={(name, pw) => setTemp({ name, pw })} />}
    </section>
  );
}

function CreateUser({ isSuper, roles, onClose, onDone }: { isSuper: boolean; roles: RoleInfo[]; onClose: () => void; onDone: (name: string, pw: string) => void }) {
  const { token } = useAuth();
  const [f, setF] = useState({ username: "", displayName: "", email: "", phone: "", role: "INSTRUCTOR", staffRole: "CONTENT", markVerified: false });
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const r = await api<{ tempPassword: string }>("/api/admin/users", {
        method: "POST",
        token,
        body: { username: f.username.trim(), displayName: f.displayName.trim(), role: f.role, markVerified: f.markVerified, ...(f.email ? { email: f.email } : {}), ...(f.phone ? { phone: f.phone } : {}), ...(f.role === "ADMIN" ? { staffRole: f.staffRole } : {}) },
      });
      onDone(f.displayName, r.tempPassword);
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="יצירת משתמש"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" form="create-user-form" className="btn btn-primary" disabled={f.username.trim().length < 3 || f.displayName.trim().length < 2}>
            יצירה
          </button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} noValidate>
        {err && (
          <p className="error-box" role="alert">
            {err}
          </p>
        )}
        <Field label="שם להצגה" htmlFor="cu-name">
          <input id="cu-name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        </Field>
        <Field label="שם משתמש" htmlFor="cu-user">
          <input id="cu-user" dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </Field>
        <Field label="מייל (לא חובה)" htmlFor="cu-email">
          <input id="cu-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="טלפון (לא חובה)" htmlFor="cu-phone">
          <input id="cu-phone" type="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <label className="assist-check">
          <input type="checkbox" checked={f.markVerified} onChange={(e) => setF({ ...f, markVerified: e.target.checked })} />
          <span>המייל והטלפון שבדקתי בעצמי נחשבים מאומתים</span>
        </label>
        {isSuper && (
          <>
            <Field label="סוג חשבון" htmlFor="cu-role">
              <select id="cu-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="INSTRUCTOR">מדריך/ה</option>
                <option value="ADMIN">צוות ניהול</option>
              </select>
            </Field>
            {f.role === "ADMIN" && (
              <Field label="תפקיד בצוות" htmlFor="cu-staff">
                <select id="cu-staff" value={f.staffRole} onChange={(e) => setF({ ...f, staffRole: e.target.value })}>
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
        <p className="hint">תיווצר סיסמה זמנית שמוצגת פעם אחת. המשתמש יתבקש להחליף אותה בכניסה הראשונה.</p>
      </form>
    </Modal>
  );
}

function UserDialog({ id, meId, isSuper, roles, onClose, onChanged, onTemp }: { id: number; meId: number; isSuper: boolean; roles: RoleInfo[]; onClose: () => void; onChanged: () => void; onTemp: (name: string, pw: string) => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const load = useCallback(() => {
    api<Detail>(`/api/admin/users/${id}`, { token })
      .then((r) => {
        setD(r);
        setEmail(r.email);
        setPhone(r.phone);
      })
      .catch((e) => setErr(errorMessage(e)));
  }, [id, token]);
  useEffect(load, [load]);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    if (!d) return;
    setErr("");
    try {
      const r = await api<{ tempPassword?: string }>(`/api/admin/users/${id}`, { method: "PATCH", token, body });
      if (r.tempPassword) onTemp(d.displayName, r.tempPassword);
      toast(ok, { kind: "success" });
      load();
      onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const remove = async () => {
    if (!d || !window.confirm(`למחוק את ${d.displayName}? אי אפשר לבטל.`)) return;
    try {
      await api(`/api/admin/users/${id}`, { method: "DELETE", token });
      toast("המשתמש נמחק", { kind: "success" });
      onChanged();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const patchPurge = async () => {
    if (!window.confirm("למחוק את כתובות ה-IP ששמורות על המשתמש ביומן הכניסות ובחיבורים?")) return;
    try {
      const r = await api<{ cleared: number }>(`/api/admin/users/${id}/purge-ip`, { method: "POST", token });
      toast(`נמחקו ${r.cleared} כתובות`, { kind: "success" });
      load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const dropSession = async (sid: string) => {
    try {
      await api(`/api/admin/users/${id}/sessions/${sid}`, { method: "DELETE", token });
      load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const me = id === meId;
  return (
    <Modal open onClose={onClose} title={d ? `${d.displayName} (${d.username})` : "משתמש"} wide footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      {d && (
        <>
          <p>
            {roleText(d)} · {d.disabled ? "מושבת" : "פעיל"} · {d.activities} פעולות · נוצר {fmtDate(d.createdAt)}
            {me && " · זה אתם"}
          </p>
          {!me && (
            <div className="actions">
              <button type="button" className="btn btn-small" onClick={() => patch({ disabled: !d.disabled }, d.disabled ? "המשתמש הופעל" : "המשתמש הושבת")}>
                {d.disabled ? "הפעלה" : "השבתה"}
              </button>
              <button type="button" className="btn btn-small" onClick={() => patch({ resetPassword: true }, "נוצרה סיסמה זמנית")}>
                איפוס סיסמה
              </button>
              <button type="button" className="btn btn-small" onClick={() => patch({ revokeSessions: true }, "כל החיבורים נותקו")}>
                ניתוק כל החיבורים
              </button>
              {d.totpEnabled && (
                <button type="button" className="btn btn-small" onClick={() => patch({ reset2fa: true }, "האימות הדו-שלבי אופס")}>
                  איפוס אימות דו-שלבי
                </button>
              )}
              <button type="button" className="btn btn-small" onClick={() => patchPurge()}>
                מחיקת כתובות ה-IP שלו
              </button>
              <button type="button" className="btn btn-small" onClick={remove}>
                מחיקה
              </button>
            </div>
          )}
          {isSuper && !me && (
            <div className="assist-settings">
              <Field label="סוג חשבון" htmlFor="ud-role">
                <select id="ud-role" value={d.role} onChange={(e) => patch({ role: e.target.value }, "הסוג עודכן")}>
                  <option value="INSTRUCTOR">מדריך/ה</option>
                  <option value="ADMIN">צוות ניהול</option>
                </select>
              </Field>
              {d.role === "ADMIN" && (
                <Field label="תפקיד בצוות" htmlFor="ud-staff">
                  <select id="ud-staff" value={d.staffRole ?? "SUPER"} onChange={(e) => patch({ staffRole: e.target.value }, "התפקיד עודכן")}>
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}

          <h3>מייל וטלפון</h3>
          <div className="assist-settings">
            <Field label="מייל" htmlFor="ud-email">
              <input id="ud-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="טלפון" htmlFor="ud-phone">
              <input id="ud-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-small" disabled={email === d.email && phone === d.phone} onClick={() => patch({ email: email || null, phone: phone || null }, "הפרטים עודכנו")}>
              שמירת פרטים
            </button>
            {d.email && (
              <button type="button" className="btn btn-small" onClick={() => patch({ verifyEmail: !d.emailVerified }, d.emailVerified ? "האימות הוסר" : "המייל סומן כמאומת")}>
                {d.emailVerified ? "ביטול אימות מייל" : "אימות מייל ידני"}
              </button>
            )}
            {d.phone && (
              <button type="button" className="btn btn-small" onClick={() => patch({ verifyPhone: !d.phoneVerified }, d.phoneVerified ? "האימות הוסר" : "הטלפון סומן כמאומת")}>
                {d.phoneVerified ? "ביטול אימות טלפון" : "אימות טלפון ידני"}
              </button>
            )}
          </div>
          <p className="hint">אימות ידני מיועד למקרה שהאתר עוד לא שולח הודעות. סמנו מאומת רק אחרי שבדקתם שהפרט באמת שייך למשתמש.</p>

          <h3>חיבורים פעילים</h3>
          {d.sessions.length === 0 ? (
            <p className="hint">אין חיבורים פעילים.</p>
          ) : (
            <ul className="plain-list">
              {d.sessions.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.device} · IP {s.ip} · פעיל לאחרונה {fmtDate(s.lastSeenAt)}
                  </span>
                  <button type="button" className="btn btn-small" onClick={() => dropSession(s.id)}>
                    ניתוק<span className="sr-only">: {s.device}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3>פעילות אחרונה</h3>
          <ul className="plain-list">
            {d.recent.map((r, i) => (
              <li key={i}>
                <span>
                  {fmtDate(r.at)} · {ACTION_LABELS[r.action] ?? r.action}
                </span>
              </li>
            ))}
            {d.recent.length === 0 && <li>אין פעילות</li>}
          </ul>
        </>
      )}
    </Modal>
  );
}

// ───────────── יומן פעולות ─────────────

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  details: Record<string, unknown> | null;
}

export function AdminAudit() {
  const { token } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [f, setF] = useState({ q: "", actor: "", action: "", from: "", to: "" });
  const [verify, setVerify] = useState<{ ok: boolean; checked: number; reason?: string; brokenAt?: number } | null>(null);
  const limit = 50;
  const qs = useCallback(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [f]);

  const load = useCallback(() => {
    api<{ items: AuditRow[]; total: number }>(`/api/admin/audit?${qs()}&limit=${limit}&offset=${offset}`, { token })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [token, qs, offset, toast]);
  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const csv = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/audit.csv?${qs()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("הייצוא נכשל");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-log.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const check = async () => {
    try {
      setVerify(await api(`/api/admin/audit/verify`, { token }));
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const set = (k: keyof typeof f, v: string) => (setF({ ...f, [k]: v }), setOffset(0));
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  return (
    <section aria-labelledby="audit-title" className="card glass">
      <h2 id="audit-title" className="section-title">
        יומן פעולות מלא
      </h2>
      <p className="hint">כל כניסה, שינוי הרשאה ופעולה רגישה נרשמים. אי אפשר לערוך או למחוק רשומות, וכל רשומה מחוברת לקודמת בשרשרת גיבוב כדי לגלות שינוי בדיעבד.</p>
      <div className="assist-settings">
        <Field label="חיפוש חופשי" htmlFor="audit-q">
          <input id="audit-q" value={f.q} onChange={(e) => set("q", e.target.value)} />
        </Field>
        <Field label="מי (שם משתמש)" htmlFor="audit-actor">
          <input id="audit-actor" value={f.actor} onChange={(e) => set("actor", e.target.value)} />
        </Field>
        <Field label="סוג פעולה (למשל login)" htmlFor="audit-action">
          <input id="audit-action" dir="ltr" value={f.action} onChange={(e) => set("action", e.target.value)} />
        </Field>
        <Field label="מתאריך" htmlFor="audit-from">
          <input id="audit-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} />
        </Field>
        <Field label="עד תאריך" htmlFor="audit-to">
          <input id="audit-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} />
        </Field>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={csv}>
          ייצוא ל-Excel (CSV)
        </button>
        <button type="button" className="btn" onClick={check}>
          בדיקת תקינות היומן
        </button>
      </div>
      {verify && (
        <p className={verify.ok ? "ok-box" : "error-box"} role="status">
          {verify.ok ? `היומן תקין: נבדקו ${verify.checked} רשומות ולא נמצא שינוי.` : `נמצאה בעיה ברשומה ${verify.brokenAt}: ${verify.reason}`}
        </p>
      )}
      <div className="table-wrap" tabIndex={0} role="region" aria-label="יומן פעולות">
        <table className="data-table">
          <caption className="sr-only">יומן פעולות, {total} רשומות</caption>
          <thead>
            <tr>
              <th scope="col">זמן</th>
              <th scope="col">מי</th>
              <th scope="col">פעולה</th>
              <th scope="col">פרטים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="זמן">{fmtDate(r.at)}</td>
                <td data-label="מי">{r.actor === "anonymous" ? "אורח" : r.actor}</td>
                <td data-label="פעולה">{ACTION_LABELS[r.action] ?? r.action}</td>
                <td data-label="פרטים" dir="auto">
                  {r.details ? JSON.stringify(r.details).slice(0, 100) : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>אין רשומות</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          הקודם
        </button>
        <span aria-live="polite">
          עמוד {page} מתוך {pages}
        </span>
        <button type="button" className="btn btn-small" disabled={page >= pages} onClick={() => setOffset(offset + limit)}>
          הבא
        </button>
      </div>
    </section>
  );
}

// ───────────── מצב האבטחה של הצוות ─────────────

interface Sec {
  providers: { email: boolean; phone: boolean };
  admins: { id: number; username: string; displayName: string; staffRole: Staff | null; disabled: boolean; totpEnabled: boolean }[];
  adminsWithout2fa: number;
}
export function AdminSecurity() {
  const { token } = useAuth();
  const [s, setS] = useState<Sec | null>(null);
  useEffect(() => {
    api<Sec>("/api/admin/security", { token })
      .then(setS)
      .catch(() => {});
  }, [token]);
  if (!s) return null;
  return (
    <section aria-labelledby="sec-title" className="card glass">
      <h2 id="sec-title" className="section-title">
        אבטחת הצוות
      </h2>
      {s.adminsWithout2fa > 0 ? (
        <p className="warn-box">
          {s.adminsWithout2fa} חשבונות ניהול בלי אימות דו-שלבי. מומלץ שכל אחד יפעיל אותו במסך החשבון שלו.
        </p>
      ) : (
        <p className="ok-box">לכל חשבונות הניהול הפעילים יש אימות דו-שלבי.</p>
      )}
      <p className="hint">
        שליחת מיילים: {s.providers.email ? "מוגדרת" : "לא מוגדרת"} · שליחת SMS: {s.providers.phone ? "מוגדרת" : "לא מוגדרת"}. בלי הגדרה, איפוס סיסמה וקישור כניסה לא יעבדו, והאדמין מאמת ומאפס ידנית.
      </p>
      <ul className="plain-list">
        {s.admins.map((a) => (
          <li key={a.id}>
            <span>
              {a.displayName} ({a.username}) · {STAFF_LABEL[a.staffRole ?? "SUPER"]}
              {a.disabled ? " · מושבת" : ""}
            </span>
            <span className={a.totpEnabled ? "pill pill-ok" : "pill pill-warn"}>{a.totpEnabled ? "2FA פעיל" : "בלי 2FA"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

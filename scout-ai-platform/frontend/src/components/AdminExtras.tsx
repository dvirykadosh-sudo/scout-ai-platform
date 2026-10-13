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

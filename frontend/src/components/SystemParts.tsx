"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, api, errorMessage, fmtDate } from "@/lib/api";
import { useAuth, useToast } from "./Providers";

type Sys = {
  startedAt: string;
  uptimeSec: number;
  dbBytes: number | null;
  integrity: string;
  counts: { users: number; activities: number; writeDocs: number };
  persist: { configured: boolean; lastGoodAt: number | null; lastSavedAt: number | null; lastError: string | null; saves: number };
  warnings: string[];
};

const kb = (n: number | null) => (n == null ? "—" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const ago = (ms: number | null) => {
  if (!ms) return "עדיין לא";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "ממש עכשיו" : m < 60 ? `לפני ${m} דק׳` : `לפני ${Math.round(m / 60)} שעות`;
};

export function AdminSystem() {
  const { token } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<Sys | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Sys>("/api/admin/system", { token }).then(setS).catch(() => {});
  }, [token]);
  useEffect(load, [load]);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/backup/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("הורדת הגיבוי נכשלה");
      const cd = res.headers.get("content-disposition") ?? "";
      const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? "maoz-backup.db";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("הגיבוי ירד למחשב. שמרו אותו במקום בטוח.");
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const saveNow = async () => {
    try {
      await api("/api/admin/persist/save", { method: "POST", token });
      toast("הנתונים נשמרו ב-GitHub");
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  return (
    <section className="card" aria-labelledby="sys-h" style={{ marginBottom: 16 }}>
      <h2 id="sys-h">מצב המערכת וגיבוי</h2>
      {s?.warnings.map((w) => (
        <p key={w} role="alert" className="field-error">
          ⚠ {w}
        </p>
      ))}
      {s && (
        <ul style={{ lineHeight: 1.9 }}>
          <li>בסיס הנתונים: {kb(s.dbBytes)} · בדיקת תקינות: {s.integrity === "ok" ? "תקין ✓" : s.integrity}</li>
          <li>משתמשים: {s.counts.users} · פעולות: {s.counts.activities} · מסמכי כתיבה: {s.counts.writeDocs}</li>
          <li>
            שמירה חיצונית (GitHub): {s.persist.configured ? `פעילה, שמירה תקינה אחרונה ${ago(s.persist.lastGoodAt)}` : "לא מוגדרת"}
            {s.persist.lastError ? ` · שגיאה אחרונה: ${s.persist.lastError}` : ""}
          </li>
          <li>השרת עלה: {fmtDate(s.startedAt)}</li>
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={download} disabled={busy}>
          {busy ? "מכין גיבוי…" : "⬇ הורדת גיבוי עכשיו"}
        </button>
        {s?.persist.configured && (
          <button className="btn" onClick={saveNow}>
            שמור ב-GitHub עכשיו
          </button>
        )}
      </div>
      <p className="muted">מומלץ להוריד גיבוי פעם בשבוע. הקובץ (‎.db‎) מכיל את כל הנתונים, כולל סיסמאות מוצפנות, אז שמרו אותו פרטי.</p>
    </section>
  );
}

// באנר: האתר עודכן (השרת עלה מחדש עם גרסה חדשה) / אין חיבור לאינטרנט
export function StatusBanners() {
  const [offline, setOffline] = useState(false);
  const [updated, setUpdated] = useState(false);
  const first = useRef<string | null>(null);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const h = await api<{ startedAt?: string }>("/api/health");
        if (stop || !h.startedAt) return;
        if (first.current === null) first.current = h.startedAt;
        else if (first.current !== h.startedAt) setUpdated(true);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(poll, 5 * 60 * 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  if (!offline && !updated) return null;
  return (
    <div className="status-banner" role="status">
      {offline ? "אין חיבור לאינטרנט. מה שכבר נטען עדיין זמין, אבל שמירה וחיפוש יחכו לחיבור." : (
        <>
          האתר עודכן או הופעל מחדש. <button className="btn btn-sm" onClick={() => location.reload()}>רענון</button>
        </>
      )}
    </div>
  );
}

export function InstallGuide() {
  return (
    <div className="card prose">
      <h2>האתר כאפליקציה בטלפון</h2>
      <p>אין צורך בחנות אפליקציות. מוסיפים את האתר למסך הבית והוא נפתח במסך מלא, כמו אפליקציה.</p>
      <h3>אייפון (Safari)</h3>
      <ol>
        <li>פותחים את האתר ב-Safari (לא בדפדפן אחר).</li>
        <li>לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה).</li>
        <li>בוחרים &quot;הוסף למסך הבית&quot; ואז &quot;הוסף&quot;.</li>
      </ol>
      <h3>אנדרואיד (Chrome)</h3>
      <ol>
        <li>פותחים את האתר ב-Chrome.</li>
        <li>לוחצים על שלוש הנקודות בפינה.</li>
        <li>בוחרים &quot;התקנת אפליקציה&quot; או &quot;הוספה למסך הבית&quot;.</li>
      </ol>
      <h3>מחשב</h3>
      <p>ב-Chrome או Edge: בסרגל הכתובת יופיע סמל התקנה. אפשר גם להשאיר את האתר כסימנייה.</p>
      <p className="muted">טיפ: השרת החינמי נרדם אחרי חוסר פעילות, ולכן הפתיחה הראשונה בבוקר עשויה לקחת חצי דקה. זה תקין.</p>
    </div>
  );
}

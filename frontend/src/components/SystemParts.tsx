"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, api, errorMessage, fmtDate } from "@/lib/api";
import { useAuth, useToast } from "./Providers";

type Sys = {
  clientIp?: { seen: string; forwardedFor: string; trustProxy: number | string | boolean; headerOverride: string; cfConnectingIp: string; trueClientIp: string };
  startedAt: string;
  uptimeSec: number;
  dbBytes: number | null;
  integrity: string;
  counts: { users: number; activities: number; writeDocs: number };
  schema?: { version: number; expected: number };
  ai?: { used: number; cap: number; blocked: number; configured: boolean };
  serverErrors?: { at: string; kind: string; message: string; where?: string; count: number; path?: string }[];
  persist: { lastVerifiedAt?: string | null; verifyOk?: boolean | null; verifyError?: string | null; configured: boolean; lastGoodAt: number | null; lastSavedAt: number | null; lastError: string | null; saves: number; blocked?: string | null; failStreak?: number; encrypted?: boolean | null };
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
  const verifyNow = async () => {
    try {
      const r = await api<{ ok: boolean; error?: string }>("/api/admin/persist/verify", { method: "POST", token });
      toast(r.ok ? "הגיבוי ב-GitHub נפתח ונבדק: אפשר לשחזר ממנו ✓" : `אי אפשר לשחזר מהגיבוי: ${r.error}`, r.ok ? undefined : { kind: "error" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const mailTest = async () => {
    try {
      const r = await api<{ ok: boolean; to: string; mode: string }>("/api/admin/mail/test", { method: "POST", token });
      toast(`מייל בדיקה נשלח אל ${r.to} (ערוץ: ${r.mode}). בדקו שהוא הגיע, כולל בתיקיית הספאם.`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const saveNow = async () => {
    try {
      await api("/api/admin/persist/save", { method: "POST", token });
      toast("הנתונים נשמרו ב-GitHub");
      load();
    } catch (e) {
      // שלב 64: השמירה עצורה כדי לא לדרוס גיבוי טוב. דורסים רק באישור מפורש.
      if ((e as { code?: string })?.code === "PERSIST_BLOCKED") {
        if (window.confirm(`${errorMessage(e)}\n\nזה יחליף את הגיבוי ששמור ב-GitHub במסד הנוכחי. להמשיך?`)) {
          try {
            await api("/api/admin/persist/save", { method: "POST", token, body: { override: true } });
            toast("הנתונים נשמרו ב-GitHub");
            load();
          } catch (e2) {
            toast(errorMessage(e2), { kind: "error" });
          }
        }
        return;
      }
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
          {s.persist.configured && (
            <li>
              הצפנה: {s.persist.encrypted ? "הצילום ב-GitHub מוצפן ✓" : s.persist.encrypted === false ? "הצילום אינו מוצפן" : "תיבדק בשמירה הבאה"} · בדיקת שחזור:{" "}
              {s.persist.verifyOk == null ? "עדיין לא רצה (רצה אוטומטית פעם בשבוע)" : s.persist.verifyOk ? `תקינה ✓ (${fmtDate(s.persist.lastVerifiedAt ?? "")})` : `נכשלה: ${s.persist.verifyError}`}
            </li>
          )}
          {s.ai && <li>קריאות AI היום: {s.ai.used} מתוך {s.ai.cap}{s.ai.configured ? "" : " (אין מפתח, המחולל המקומי פעיל)"}</li>}
          {s.schema && <li>גרסת מסד הנתונים: {s.schema.version}{s.schema.version === s.schema.expected ? "" : ` (צפויה ${s.schema.expected})`}</li>}
          <li>השרת עלה: {fmtDate(s.startedAt)}</li>
        </ul>
      )}
      {s?.serverErrors && s.serverErrors.length > 0 && (
        <details style={{ marginBlock: 8 }}>
          <summary>שגיאות שרת אחרונות ({s.serverErrors.length})</summary>
          <ul dir="ltr" style={{ textAlign: "left" }}>
            {s.serverErrors.slice(0, 10).map((e, i) => (
              <li key={i}>
                {fmtDate(e.at)} · {e.kind}{e.path ? ` ${e.path}` : ""} · {e.message}{e.count > 1 ? ` (×${e.count})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {s?.clientIp && (
        <details style={{ marginBlock: 8 }}>
          <summary>איזו כתובת השרת רואה אצלי? (בדיקה חד-פעמית של ההגבלות לפי כתובת)</summary>
          <p>
            השרת רואה אצלכם: <strong dir="ltr">{s.clientIp.seen || "?"}</strong>. אם זו לא הכתובת שלכם (אפשר לבדוק באתר כמו whatismyip.com), הגבלות הקצב וחסימות כתובת חלות על שרת ביניים ולא על המבקר, ויש להגדיר ב-Render את TRUST_PROXY (למשל 2) או את CLIENT_IP_HEADER.
          </p>
          <ul dir="ltr" style={{ textAlign: "left" }}>
            <li>X-Forwarded-For: {s.clientIp.forwardedFor || "(ריק)"}</li>
            <li>CF-Connecting-IP: {s.clientIp.cfConnectingIp || "(אין)"}</li>
            <li>True-Client-IP: {s.clientIp.trueClientIp || "(אין)"}</li>
            <li>TRUST_PROXY: {String(s.clientIp.trustProxy)}{s.clientIp.headerOverride ? ` · CLIENT_IP_HEADER: ${s.clientIp.headerOverride}` : ""}</li>
          </ul>
        </details>
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
        <button className="btn" onClick={mailTest}>
          ✉ שלח מייל בדיקה
        </button>
        {s?.persist.configured && (
          <button className="btn" onClick={verifyNow}>
            בדוק שאפשר לשחזר מהגיבוי
          </button>
        )}
      </div>
      <p className="muted">מומלץ להוריד גיבוי פעם בשבוע. הקובץ (‎.db‎) מכיל את כל הנתונים, כולל סיסמאות מוצפנות, אז שמרו אותו פרטי.</p>
    </section>
  );
}

// שלב 66 (ממצא 91): מה שואלים את מעוז ואין לו תשובה. טקסט מוסתר, בלי משתמש ובלי כתובת, נמחק אחרי 60 יום.
type Unanswered = { id: number; q: string; count: number; firstAt: string; lastAt: string };
export function AdminEagleGaps() {
  const { token } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Unanswered[] | null>(null);
  const [logging, setLogging] = useState(true);
  const load = useCallback(() => {
    api<{ items: Unanswered[]; logging: boolean }>("/api/admin/eagle/unanswered", { token })
      .then((r) => {
        setRows(r.items);
        setLogging(r.logging);
      })
      .catch(() => setRows([]));
  }, [token]);
  useEffect(load, [load]);
  const remove = async (id?: number) => {
    if (id == null && !window.confirm("למחוק את כל הרשימה?")) return;
    try {
      await api(id == null ? "/api/admin/eagle/unanswered" : `/api/admin/eagle/unanswered/${id}`, { method: "DELETE", token });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="eagle-gaps-title" className="card glass">
      <h2 id="eagle-gaps-title" className="section-title">
        שאלות שמעוז לא ידע לענות עליהן{rows?.length ? ` (${rows.length})` : ""}
      </h2>
      <p className="muted">
        הרשימה עוזרת להבין מה כדאי להוסיף למאגר הידע. נשמר רק נוסח השאלה (בלי מיילים וטלפונים), בלי שם משתמש ובלי כתובת, ונמחק אחרי 60 יום.
        {!logging && " הרישום כבוי כרגע (EAGLE_LOG_UNANSWERED=0)."}
      </p>
      {rows === null ? (
        <p className="hint">טוען…</p>
      ) : rows.length === 0 ? (
        <p className="hint">אין שאלות שלא נענו.</p>
      ) : (
        <>
          <ul className="plain-list">
            {rows.map((r) => (
              <li key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <span>
                  <strong>{r.count > 1 ? `${r.count}× ` : ""}</strong>
                  {r.q} <span className="muted">· {fmtDate(r.lastAt)}</span>
                </span>
                <button type="button" className="btn btn-small" onClick={() => remove(r.id)} aria-label={`מחיקת השאלה: ${r.q}`}>
                  הסרה
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={() => remove()}>
            ניקוי הרשימה
          </button>
        </>
      )}
    </section>
  );
}

// באנר: האתר עודכן (השרת עלה מחדש עם גרסה חדשה) / אין חיבור לאינטרנט
export function StatusBanners() {
  const [offline, setOffline] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [maint, setMaint] = useState("");
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
        const h = await api<{ boot?: string; startedAt?: string; maintenance?: string }>("/api/health");
        const bootId = h.boot ?? h.startedAt;
        if (stop || !bootId) return;
        setMaint(h.maintenance ?? "");
        if (first.current === null) first.current = bootId;
        else if (first.current !== bootId) setUpdated(true);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(poll, 2 * 60 * 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  if (!offline && !updated && !maint) return null;
  return (
    <div className="status-banner" role="status">
      {maint ? `האתר בתחזוקה: ${maint}. אפשר לקרוא, אבל לא לשמור שינויים.` : offline ? "אין חיבור לאינטרנט. מה שכבר נטען עדיין זמין, אבל שמירה וחיפוש יחכו לחיבור." : (
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

/** 239: תצוגה קומפקטית, שומרת מקום על המסך. */
export function CompactToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("scout.compact") === "1";
      setOn(v);
      document.documentElement.classList.toggle("compact", v);
    } catch {
      /* ignore */
    }
    const sync = () => setOn(document.documentElement.classList.contains("compact")); // שינוי מחלון "הגדרות מראה"
    window.addEventListener("scout:appearance", sync);
    return () => window.removeEventListener("scout:appearance", sync);
  }, []);
  return (
    <button
      type="button"
      className="a11y-btn"
      aria-pressed={on}
      onClick={() => {
        const v = !on;
        setOn(v);
        document.documentElement.classList.toggle("compact", v);
        try {
          localStorage.setItem("scout.compact", v ? "1" : "0");
        } catch {
          /* ignore */
        }
      }}
    >
      תצוגה קומפקטית
    </button>
  );
}

/** 231: חיפוש מהיר בכל האתר עם Ctrl+K (או Cmd+K). */
const PAGES: [string, string][] = [
  ["דף הבית", "/"], ["כתיבת פעולה משלי", "/write"], ["מאגר הפעולות", "/library"], ["עוזר הכתיבה", "/assistant"], ["פעולת חירום", "/quick"],
  ["תכנון תקופתי", "/plan"], ["ספריית המתודות", "/methods"], ["כלים ורעיונות", "/tools"], ["סיפורים", "/stories"], ["משחקי היכרות", "/icebreakers"],
  ["אתגרים", "/challenges"], ["מה יש בארון", "/cupboard"], ["יומן ותזכורות", "/calendar"], ["לוח צוות", "/team"], ["מה חדש", "/whats-new"],
  ["התקנה בטלפון", "/install"], ["עזרה", "/help"], ["החשבון שלי", "/account"], ["נגישות", "/accessibility"], ["לוח ניהול", "/admin"],
];
export function CommandPalette() {
  const { token } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<{ id: number; title: string }[]>([]);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    if (token) api<{ id: number; title: string }[]>("/api/write/docs", { token }).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [open, token]);
  const items = useMemo(() => {
    const n = q.trim();
    const all = [...PAGES.map(([t, h]) => ({ t, h, kind: "עמוד" })), ...docs.map((d) => ({ t: d.title || "מסמך ללא שם", h: `/write/${d.id}`, kind: "מסמך שלי" }))];
    return (n ? all.filter((i) => i.t.includes(n)) : all.slice(0, 12)).slice(0, 12);
  }, [q, docs]);
  if (!open) return null;
  const go = (h: string) => {
    setOpen(false);
    router.push(h);
  };
  return (
    <div className="cmdk-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk card" role="dialog" aria-modal="true" aria-label="חיפוש מהיר">
        <input
          autoFocus
          type="search"
          aria-label="חיפוש עמוד או מסמך"
          placeholder="לאן עוברים? (Esc לסגירה)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && items[sel]) go(items[sel].h);
          }}
        />
        <ul className="plain-list" aria-label="תוצאות">
          {items.map((i, n) => (
            <li key={i.h} className={n === sel ? "is-sel" : ""}>
              <button type="button" className="btn btn-small" onClick={() => go(i.h)}>
                {i.t} <small>({i.kind})</small>
              </button>
            </li>
          ))}
          {!items.length && <li>לא נמצא</li>}
        </ul>
      </div>
    </div>
  );
}

/** 241–243, 246: תפעול לאדמין. */
export function AdminOps() {
  const { token } = useAuth();
  const toast = useToast();
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState("");
  const [hist, setHist] = useState<{ rows: { day: string; dbBytes: number | null; users: number | null; writeDocs: number | null }[]; mailBackup: { configured: boolean; last: number | null } } | null>(null);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<{ message: string }>("/api/admin/maintenance", { token }).then((m) => setOn(m.message)).catch(() => {});
    api<NonNullable<typeof hist>>("/api/admin/system/history", { token }).then(setHist).catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  const setMaintenance = async (message: string) => {
    try {
      await api("/api/admin/maintenance", { method: "PUT", token, body: { message } });
      setOn(message);
      toast(message ? "מצב תחזוקה פעיל" : "מצב תחזוקה כבוי");
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const mail = async () => {
    try {
      await api("/api/admin/backup/mail", { method: "POST", token, body: {} });
      toast("הגיבוי המוצפן נשלח למייל", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const restore = async (f: File) => {
    if (word !== "שחזור") return toast('כדי לשחזר, כתבו בשדה האישור את המילה "שחזור"', { kind: "error" });
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", "X-Confirm": encodeURIComponent(word) }, body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message ?? "השחזור נכשל");
      toast("הקובץ נבדק ונקלט. השרת מופעל מחדש עכשיו, ותוך חצי דקה הנתונים מהקובץ יהיו באתר.", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };
  const pts = (hist?.rows ?? []).filter((r) => r.dbBytes != null);
  const max = Math.max(1, ...pts.map((r) => r.dbBytes ?? 0));
  const path = pts.map((r, i) => `${pts.length > 1 ? (i / (pts.length - 1)) * 300 : 150},${58 - ((r.dbBytes ?? 0) / max) * 52}`).join(" ");
  return (
    <section className="card" aria-labelledby="ops-h" style={{ marginBottom: 16 }}>
      <h2 id="ops-h">תפעול ושחזור</h2>
      <h3>גודל בסיס הנתונים ב-90 הימים האחרונים</h3>
      {pts.length > 1 ? (
        <svg viewBox="0 0 300 62" role="img" aria-label={`גרף גודל המסד: מ-${Math.round((pts[0].dbBytes ?? 0) / 1024)}KB עד ${Math.round((pts[pts.length - 1].dbBytes ?? 0) / 1024)}KB`} style={{ width: "100%", maxWidth: 480, height: 80 }}>
          <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      ) : (
        <p className="hint">הגרף יתמלא לאחר כמה ימים של פעילות.</p>
      )}
      {pts.length > 0 && <p className="hint">משתמשים כרגע: {pts[pts.length - 1].users ?? "?"} · מסמכי כתיבה: {pts[pts.length - 1].writeDocs ?? "?"}</p>}

      <h3>מצב תחזוקה</h3>
      <p className="hint">גולשים יוכלו לקרוא אבל לא לשמור, ויראו את ההודעה. מתאים לרגע לפני עדכון.</p>
      <label htmlFor="mt-msg">הודעה לגולשים</label>
      <input id="mt-msg" value={msg} maxLength={200} placeholder="מעדכנים את האתר, נחזור בעוד כמה דקות" onChange={(e) => setMsg(e.target.value)} />
      <div className="actions">
        <button type="button" className="btn" disabled={!msg.trim()} onClick={() => void setMaintenance(msg.trim())}>הפעלת מצב תחזוקה</button>
        <button type="button" className="btn" disabled={!on} onClick={() => void setMaintenance("")}>כיבוי</button>
      </div>
      {on && <p role="status">פעיל כעת: {on}</p>}

      <h3>גיבוי מוצפן למייל</h3>
      <p className="hint">{hist?.mailBackup.configured ? `פעיל, נשלח פעם בשבוע. נשלח לאחרונה: ${hist.mailBackup.last ? fmtDate(new Date(hist.mailBackup.last).toISOString()) : "עוד לא"}` : "לא מוגדר. נדרש ב-Render: SMTP_HOST, SMTP_USER, SMTP_PASS, ADMIN_EMAIL ו-BACKUP_PASSPHRASE (לפחות 8 תווים)."}</p>
      <button type="button" className="btn" disabled={!hist?.mailBackup.configured} onClick={mail}>שליחת גיבוי למייל עכשיו</button>

      <h3>שחזור מקובץ גיבוי</h3>
      <p className="hint">מחליף את כל הנתונים באתר בנתונים שבקובץ שהורדתם בעבר. הקובץ נבדק לפני החלפה, והנתונים הנוכחיים נשמרים בשרת כ-before-restore.</p>
      <label htmlFor="rs-word">לאישור כתבו: שחזור</label>
      <input id="rs-word" value={word} onChange={(e) => setWord(e.target.value)} />
      <input type="file" accept=".db" aria-label="קובץ גיבוי לשחזור" disabled={busy || word !== "שחזור"} onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
    </section>
  );
}

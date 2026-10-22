"use client";

// אדמין: יומן כניסות, מבקרים, חסימות והגדרות פרטיות (רעיונות 91–98).
import { useCallback, useEffect, useState } from "react";
import { API_URL, api, errorMessage, fmtDate } from "@/lib/api";
import { effectiveStaffOf } from "@/lib/staff";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

export async function downloadCsv(path: string, name: string, token: string | null) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("הייצוא נכשל");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const KIND: Record<string, string> = { login: "כניסה", login_fail: "כניסה כושלת", logout: "יציאה", register: "הרשמה", visit: "ביקור" };

// ───────────── סיכום ─────────────
interface Overview {
  days: { day: string; newUsers: number; logins: number; failures: number; visitors: number }[];
  totals: { users: number; activeDevices: number; flagged: number; blocks: number; adminsWithout2fa: number; withoutTerms: number };
  countries: { country: string; name: string; count: number }[];
  recentFlags: AccessRow[];
}
interface AccessRow {
  id: number;
  at: string;
  kind: string;
  username: string;
  ip: string;
  country: string;
  countryName: string;
  device: string;
  page: string;
  flags: string[];
  note: string;
}

export function AdminSecurityOverview() {
  const { token } = useAuth();
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    api<Overview>("/api/admin/security/overview", { token })
      .then(setO)
      .catch(() => {});
  }, [token]);
  if (!o) return null;
  const t = o.totals;
  const max = Math.max(1, ...o.days.flatMap((d) => [d.logins, d.failures, d.visitors]));
  return (
    <section aria-labelledby="ov-title" className="card glass">
      <h2 id="ov-title" className="section-title">
        לוח אבטחה ושימוש
      </h2>
      <ul className="plain-list">
        <li>
          <span>משתמשים רשומים</span>
          <strong>{t.users}</strong>
        </li>
        <li>
          <span>מכשירים מחוברים (30 יום אחרונים)</span>
          <strong>{t.activeDevices}</strong>
        </li>
        <li>
          <span>אירועים חריגים ב-14 הימים האחרונים</span>
          <span className={t.flagged ? "pill pill-warn" : "pill pill-ok"}>{t.flagged}</span>
        </li>
        <li>
          <span>כתובות חסומות כרגע</span>
          <strong>{t.blocks}</strong>
        </li>
        <li>
          <span>אדמינים בלי אימות דו-שלבי</span>
          <span className={t.adminsWithout2fa ? "pill pill-warn" : "pill pill-ok"}>{t.adminsWithout2fa}</span>
        </li>
        <li>
          <span>משתמשים שלא אישרו את הנוסח הנוכחי של התנאים</span>
          <strong>{t.withoutTerms}</strong>
        </li>
      </ul>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="14 ימים אחרונים: הרשמות, כניסות, כשלונות ומבקרים">
        <table className="data-table">
          <caption className="sr-only">14 ימים אחרונים: הרשמות, כניסות, כשלונות ומבקרים</caption>
          <thead>
            <tr>
              <th scope="col">יום</th>
              <th scope="col">הרשמות</th>
              <th scope="col">כניסות</th>
              <th scope="col">כשלונות</th>
              <th scope="col">מבקרים</th>
            </tr>
          </thead>
          <tbody>
            {o.days.map((d) => (
              <tr key={d.day}>
                <td data-label="יום">{d.day.slice(5).split("-").reverse().join(".")}</td>
                <td data-label="הרשמות">{d.newUsers}</td>
                <td data-label="כניסות">{d.logins}</td>
                <td data-label="כשלונות">{d.failures}</td>
                <td data-label="מבקרים">
                  {d.visitors}
                  <span aria-hidden="true" style={{ display: "inline-block", marginInlineStart: 8, height: 8, width: `${Math.round((d.visitors / max) * 80)}px`, background: "currentColor", opacity: 0.35, borderRadius: 4 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {o.countries.length > 0 && (
        <p className="hint">
          כניסות לפי מדינה: {o.countries.map((c) => `${c.name || "לא ידוע"} (${c.count})`).join(" · ")}
        </p>
      )}
      {o.recentFlags.length > 0 && (
        <>
          <h3 className="subtitle">אירועים חריגים אחרונים</h3>
          <ul className="plain-list">
            {o.recentFlags.map((r) => (
              <li key={r.id}>
                <span>
                  {fmtDate(r.at)} · {r.username || "לא ידוע"} · {r.countryName || "מדינה לא ידועה"} {r.ip && `· ${r.ip}`}
                </span>
                <span className="pill pill-warn">{r.flags.join(", ") || KIND[r.kind]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ───────────── יומן כניסות ─────────────
export function AdminAccessLog() {
  const { token } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [ipMode, setIpMode] = useState("raw");
  const [offset, setOffset] = useState(0);
  const [f, setF] = useState({ kind: "", user: "", ip: "", country: "", flag: "", from: "", to: "" });
  const limit = 50;
  const qs = useCallback(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [f]);
  const load = useCallback(() => {
    api<{ items: AccessRow[]; total: number; ipMode: string }>(`/api/admin/access?${qs()}&limit=${limit}&offset=${offset}`, { token })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
        setIpMode(r.ipMode);
      })
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [token, qs, offset, toast]);
  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);
  const set = (k: keyof typeof f, v: string) => (setF({ ...f, [k]: v }), setOffset(0));
  const block = async (ip: string) => {
    if (!ip || !window.confirm(`לחסום את ${ip}?`)) return;
    try {
      await api("/api/admin/blocks", { method: "POST", token, body: { target: ip, note: "נחסם מיומן הכניסות", hours: 24 * 7 } });
      toast("הכתובת נחסמה לשבוע", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  return (
    <section aria-labelledby="acc-title" className="card glass">
      <h2 id="acc-title" className="section-title">
        יומן כניסות וכתובות IP
      </h2>
      <p className="hint">
        {ipMode === "hashed" ? "האתר במצב פרטיות: כתובות IP לא נשמרות, רק גיבוב לספירת מבקרים." : "כל כניסה, ניסיון כושל וביקור נרשמים עם כתובת IP, מדינה, מכשיר ועמוד. הרשומות נמחקות אוטומטית לפי תקופת השמירה בהגדרות."}
      </p>
      <div className="assist-settings">
        <Field label="סוג אירוע" htmlFor="acc-kind">
          <select id="acc-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="">הכול</option>
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="שם משתמש" htmlFor="acc-user">
          <input id="acc-user" value={f.user} onChange={(e) => set("user", e.target.value)} />
        </Field>
        <Field label="כתובת IP" htmlFor="acc-ip">
          <input id="acc-ip" dir="ltr" value={f.ip} onChange={(e) => set("ip", e.target.value)} />
        </Field>
        <Field label="קוד מדינה (IL, US...)" htmlFor="acc-country">
          <input id="acc-country" dir="ltr" maxLength={2} value={f.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="מתאריך" htmlFor="acc-from">
          <input id="acc-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} />
        </Field>
        <Field label="עד תאריך" htmlFor="acc-to">
          <input id="acc-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} />
        </Field>
      </div>
      <label className="check" htmlFor="acc-flag">
        <input id="acc-flag" type="checkbox" checked={!!f.flag} onChange={(e) => set("flag", e.target.checked ? "1" : "")} />
        <span>רק אירועים חריגים</span>
      </label>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => downloadCsv(`/api/admin/access.csv?${qs()}`, "access-log.csv", token).catch((e) => toast(errorMessage(e), { kind: "error" }))}
        >
          ייצוא ל-Excel (CSV)
        </button>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="יומן כניסות">
        <table className="data-table">
          <caption className="sr-only">יומן כניסות, {total} רשומות</caption>
          <thead>
            <tr>
              <th scope="col">זמן</th>
              <th scope="col">אירוע</th>
              <th scope="col">משתמש</th>
              <th scope="col">IP</th>
              <th scope="col">מדינה</th>
              <th scope="col">מכשיר ועמוד</th>
              <th scope="col">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="זמן">{fmtDate(r.at)}</td>
                <td data-label="אירוע">
                  {KIND[r.kind] ?? r.kind}
                  {r.flags.length > 0 && <span className="pill pill-warn">{r.flags.join(", ")}</span>}
                </td>
                <td data-label="משתמש">{r.username || "אורח"}</td>
                <td data-label="IP" dir="ltr">
                  {r.ip || "לא נשמר"}
                </td>
                <td data-label="מדינה">{r.countryName || "לא ידוע"}</td>
                <td data-label="מכשיר ועמוד" dir="auto">
                  {r.device}
                  {r.page && ` · ${r.page}`}
                </td>
                <td data-label="פעולות">
                  {r.ip && (
                    <button type="button" className="btn btn-small" onClick={() => block(r.ip)}>
                      חסימה<span className="sr-only">: {r.ip}</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>אין רשומות</td>
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

// ───────────── מבקרים ─────────────
interface Visitors {
  days: number;
  total: number;
  perDay: { day: string; unique: number; loggedIn: number }[];
  countries: { country: string; name: string; count: number }[];
  pages: { page: string; count: number }[];
}
export function AdminVisitors() {
  const { token } = useAuth();
  const [v, setV] = useState<Visitors | null>(null);
  useEffect(() => {
    api<Visitors>("/api/admin/visitors?days=14", { token })
      .then(setV)
      .catch(() => {});
  }, [token]);
  if (!v) return null;
  return (
    <section aria-labelledby="vis-title" className="card glass">
      <h2 id="vis-title" className="section-title">
        מבקרים באתר
      </h2>
      <p>
        ב-{v.days} הימים האחרונים ביקרו <strong>{v.total}</strong> מבקרים ייחודיים (לפי כתובת ומכשיר, בלי לזהות אנשים).
      </p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="מבקרים לפי מדינה ועמודים נצפים">
        <table className="data-table">
          <caption className="sr-only">מבקרים לפי מדינה ועמודים נצפים</caption>
          <thead>
            <tr>
              <th scope="col">מדינה</th>
              <th scope="col">מבקרים</th>
            </tr>
          </thead>
          <tbody>
            {v.countries.map((c) => (
              <tr key={c.country || "?"}>
                <td data-label="מדינה">{c.name || "לא ידוע"}</td>
                <td data-label="מבקרים">{c.count}</td>
              </tr>
            ))}
            {v.countries.length === 0 && (
              <tr>
                <td colSpan={2}>עדיין אין נתונים</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {v.pages.length > 0 && (
        <p className="hint">
          העמודים הנצפים ביותר: {v.pages.map((p) => `${p.page} (${p.count})`).join(" · ")}
        </p>
      )}
    </section>
  );
}

// ───────────── חסימות ─────────────
interface Block {
  id: number;
  target: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}
export function AdminBlocks() {
  const { token } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Block[]>([]);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api<Block[]>("/api/admin/blocks", { token })
      .then(setList)
      .catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/admin/blocks", { method: "POST", token, body: { target: target.trim(), note: note.trim() || undefined, hours: hours ? Number(hours) : undefined } });
      setTarget("");
      setNote("");
      setHours("");
      toast("הכתובת נחסמה", { kind: "success" });
      load();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const remove = async (b: Block) => {
    try {
      await api(`/api/admin/blocks/${b.id}`, { method: "DELETE", token });
      toast("החסימה הוסרה", { kind: "success" });
      load();
    } catch (x) {
      toast(errorMessage(x), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="blk-title" className="card glass">
      <h2 id="blk-title" className="section-title">
        חסימת כתובות IP
      </h2>
      <p className="hint">כתובת חסומה לא מגיעה לאתר בכלל. אפשר לחסום כתובת בודדת או טווח כמו 203.0.113.0/24. לא ניתן לחסום את הכתובת שלכם.</p>
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <form className="assist-settings" onSubmit={add} noValidate>
        <Field label="כתובת או טווח" htmlFor="blk-target">
          <input id="blk-target" dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="הערה" htmlFor="blk-note">
          <input id="blk-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
        <Field label="למשך (שעות, ריק = ללא הגבלה)" htmlFor="blk-hours">
          <input id="blk-hours" type="number" min={1} dir="ltr" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <button className="btn btn-primary">חסימה</button>
      </form>
      {list.length > 0 ? (
        <ul className="plain-list">
          {list.map((b) => (
            <li key={b.id}>
              <span>
                <strong dir="ltr">{b.target}</strong> {b.note && `· ${b.note}`}
                <br />
                <span className="hint">
                  נחסם בידי {b.createdBy} · {fmtDate(b.createdAt)} · {b.expiresAt ? `עד ${fmtDate(b.expiresAt)}` : "ללא הגבלה"}
                </span>
              </span>
              <button type="button" className="btn btn-small" onClick={() => remove(b)}>
                הסרה<span className="sr-only">: {b.target}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">אין כתובות חסומות.</p>
      )}
    </section>
  );
}

// ───────────── הגדרות פרטיות ואבטחה ─────────────
interface Settings {
  ipRetentionDays: number;
  visitorIpMode: "raw" | "hashed";
  strictPasswords: 0 | 1;
  passwordMaxAgeDays: number;
  autoBlockAfter: number;
}
export function AdminSecuritySettings() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState("");
  const canEdit = effectiveStaffOf(user?.staffRole) === "SUPER";
  useEffect(() => {
    api<Settings>("/api/admin/security/settings", { token })
      .then(setS)
      .catch(() => {});
  }, [token]);
  if (!s) return null;
  const num = (k: keyof Settings, v: string) => setS({ ...s, [k]: Number(v) || 0 });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const { ipRetentionDays, visitorIpMode, strictPasswords, passwordMaxAgeDays, autoBlockAfter } = s;
      setS(await api<Settings>("/api/admin/security/settings", { method: "PUT", token, body: { ipRetentionDays, visitorIpMode, strictPasswords, passwordMaxAgeDays, autoBlockAfter } }));
      toast("ההגדרות נשמרו", { kind: "success" });
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const purge = async () => {
    try {
      const r = await api<Record<string, number>>("/api/admin/security/purge", { method: "POST", token });
      toast(`הניקוי הסתיים (${Object.values(r).reduce((a, b) => a + b, 0)} רשומות נמחקו)`, { kind: "success" });
    } catch (x) {
      toast(errorMessage(x), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="set-title" className="card glass">
      <h2 id="set-title" className="section-title">
        הגדרות פרטיות ואבטחה
      </h2>
      {!canEdit && <p className="hint">רק אדמין ראשי יכול לשנות את ההגדרות. אפשר לצפות בהן.</p>}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <form className="assist-settings" onSubmit={save} noValidate>
        <Field label="שמירת יומן כניסות (ימים)" htmlFor="set-ret" hint="7 עד 365. אחרי התקופה הרשומות נמחקות אוטומטית">
          <input id="set-ret" type="number" min={7} max={365} dir="ltr" disabled={!canEdit} value={s.ipRetentionDays} onChange={(e) => num("ipRetentionDays", e.target.value)} />
        </Field>
        <Field label="אופן שמירת כתובות IP של מבקרים" htmlFor="set-mode" hint="גיבוב לא מאפשר לשחזר את הכתובת, אבל גם לא לחסום לפי הכתובת מהיומן">
          <select id="set-mode" disabled={!canEdit} value={s.visitorIpMode} onChange={(e) => setS({ ...s, visitorIpMode: e.target.value as Settings["visitorIpMode"] })}>
            <option value="raw">כתובת מלאה</option>
            <option value="hashed">גיבוב בלבד (פרטיות מירבית)</option>
          </select>
        </Field>
        <Field label="סיסמאות חזקות לכל המשתמשים" htmlFor="set-strict" hint="לאדמינים זה תמיד פעיל. חוסם סיסמאות נפוצות וסיסמה זהה לשם המשתמש">
          <select id="set-strict" disabled={!canEdit} value={s.strictPasswords} onChange={(e) => setS({ ...s, strictPasswords: Number(e.target.value) === 1 ? 1 : 0 })}>
            <option value={0}>כבוי</option>
            <option value={1}>פעיל</option>
          </select>
        </Field>
        <Field label="תוקף סיסמה (ימים, 0 = ללא הגבלה)" htmlFor="set-age">
          <input id="set-age" type="number" min={0} max={730} dir="ltr" disabled={!canEdit} value={s.passwordMaxAgeDays} onChange={(e) => num("passwordMaxAgeDays", e.target.value)} />
        </Field>
        <Field label="חסימה אוטומטית אחרי כשלונות כניסה מאותה כתובת (0 = כבוי)" htmlFor="set-auto" hint="לפחות 5. זהירות: רשת משותפת כמו בית ספר עלולה להיחסם כולה">
          <input id="set-auto" type="number" min={0} max={1000} dir="ltr" disabled={!canEdit} value={s.autoBlockAfter} onChange={(e) => num("autoBlockAfter", e.target.value)} />
        </Field>
        {canEdit && <button className="btn btn-primary">שמירת הגדרות</button>}
      </form>
      {canEdit && (
        <div className="actions">
          <button type="button" className="btn" onClick={purge}>
            ניקוי רשומות ישנות עכשיו
          </button>
        </div>
      )}
    </section>
  );
}

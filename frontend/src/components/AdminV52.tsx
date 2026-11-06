"use client";

// שלב 52 (367–387): בקרת גישה והרשמה בלוח הבקרה: הזמנות, הרשמה, ייבוא, חשבונות והקשחה.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

type Tab = "invites" | "reg" | "import" | "accounts" | "hard";
const TABS: [Tab, string][] = [["invites", "הזמנות"], ["reg", "הרשמה ואישורים"], ["import", "ייבוא משתמשים"], ["accounts", "חשבונות ונעילות"], ["hard", "הקשחה"]];
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "אף פעם");
const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

function useApi() {
  const { token } = useAuth();
  const toast = useToast();
  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T | null> => {
    try { return await api<T>(path, { method, token, ...(body !== undefined ? { body } : {}) }); }
    catch (e) { toast(errorMessage(e), { kind: "error" }); return null; }
  }, [token, toast]);
  return { call, toast };
}
const copyText = async (t: string, toast: ReturnType<typeof useToast>) => { try { await navigator.clipboard.writeText(t); toast("הועתק", { kind: "success" }); } catch { toast("לא הצלחתי להעתיק", { kind: "error" }); } };

/* 367, 368: הזמנות */
interface Invite { id: number; label: string; hint: string; maxUses: number; uses: number; expiresAt: string; status: string }
const ST: Record<string, string> = { active: "פעילה", used: "נוצלה", expired: "פגה", revoked: "בוטלה" };
function Invites() {
  const { call, toast } = useApi();
  const [rows, setRows] = useState<Invite[]>([]);
  const [f, setF] = useState({ label: "", maxUses: 1, days: 7 });
  const [fresh, setFresh] = useState("");
  const load = useCallback(() => { void call<Invite[]>("/api/admin/security/invites").then((r) => r && setRows(r)); }, [call]);
  useEffect(load, [load]);
  const create = async () => {
    const r = await call<{ code: string }>("/api/admin/security/invites", "POST", { ...f, maxUses: Number(f.maxUses), days: Number(f.days) });
    if (r) { setFresh(r.code); load(); }
  };
  const link = fresh ? `${origin()}/join/${fresh}` : "";
  return (
    <>
      <Field label="שם ההזמנה (למשל: מדריכי שכבה ז')" htmlFor="inv-label"><input id="inv-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <Field label="כמה אנשים יכולים להשתמש" htmlFor="inv-uses"><input id="inv-uses" type="number" min={1} max={200} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: Number(e.target.value) })} /></Field>
      <Field label="תוקף בימים" htmlFor="inv-days"><input id="inv-days" type="number" min={1} max={60} value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></Field>
      <button type="button" className="btn btn-primary" onClick={() => void create()}>יצירת הזמנה</button>
      {fresh && (
        <div role="status" className="meter-tip">
          <p><strong>הקישור מוצג פעם אחת בלבד:</strong></p>
          <p dir="ltr">{link}</p>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => void copyText(link, toast)}>העתקת קישור</button>
            <a className="btn btn-small" href={`https://wa.me/?text=${encodeURIComponent(`הוזמנת להצטרף למחולל הפעולות של השבט: ${link}`)}`} target="_blank" rel="noopener noreferrer">שליחה בוואטסאפ</a>
          </div>
        </div>
      )}
      <table className="sec-table"><caption className="sr-only">הזמנות</caption>
        <thead><tr><th scope="col">שם</th><th scope="col">סיומת</th><th scope="col">שימושים</th><th scope="col">תוקף</th><th scope="col">מצב</th><th scope="col"><span className="sr-only">פעולה</span></th></tr></thead>
        <tbody>{rows.map((r) => (<tr key={r.id}><td>{r.label}</td><td dir="ltr">…{r.hint}</td><td>{r.uses}/{r.maxUses}</td><td>{fmt(r.expiresAt)}</td><td>{ST[r.status]}</td>
          <td>{r.status === "active" && <button type="button" className="btn btn-small" onClick={() => void call(`/api/admin/security/invites/${r.id}`, "DELETE").then(load)} aria-label={`ביטול ההזמנה ${r.label}`}>ביטול</button>}</td></tr>))}</tbody></table>
    </>
  );
}

/* 369–374: הרשמה */
interface RegS { codeOverride: boolean; codeSet: boolean; approval: boolean; domains: string[]; dailyCap: number; reserved: string[]; builtinReserved: string[] }
interface Pend { id: number; username: string; displayName: string; email: string | null; createdAt: string }
function Registration() {
  const { call, toast } = useApi();
  const [s, setS] = useState<RegS | null>(null);
  const [domains, setDomains] = useState("");
  const [reserved, setReserved] = useState("");
  const [cap, setCap] = useState(0);
  const [code, setCode] = useState("");
  const [pend, setPend] = useState<Pend[]>([]);
  const load = useCallback(() => {
    void call<RegS>("/api/admin/security/registration").then((r) => { if (r) { setS(r); setDomains(r.domains.join(", ")); setReserved(r.reserved.join(", ")); setCap(r.dailyCap); } });
    void call<Pend[]>("/api/admin/security/pending").then((r) => r && setPend(r));
  }, [call]);
  useEffect(load, [load]);
  const put = async (body: object, msg: string) => { const r = await call("/api/admin/security/registration", "PUT", body); if (r) { toast(msg, { kind: "success" }); setCode(""); load(); } };
  if (!s) return <p role="status">טוען…</p>;
  const list = (t: string) => t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <p>{s.codeSet ? "ההרשמה העצמית מוגנת בקוד" : "אין קוד הרשמה: בשרת בפרודקשן ההרשמה העצמית סגורה, וההצטרפות אפשרית בהזמנה בלבד."}{s.codeOverride ? " (הקוד הוחלף מכאן)" : ""}</p>
      <Field label="קוד הרשמה חדש (לפחות 6 תווים)" htmlFor="reg-newcode" hint="מחליף את הקוד שהוגדר בשרת, בלי לפרוס מחדש">
        <input id="reg-newcode" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
      </Field>
      <div className="actions">
        <button type="button" className="btn" disabled={code.trim().length < 6} onClick={() => void put({ newCode: code.trim() }, "קוד ההרשמה הוחלף")}>החלפת הקוד</button>
        {s.codeOverride && <button type="button" className="btn" onClick={() => void put({ clearCode: true }, "חזרנו לקוד של השרת")}>חזרה לקוד של השרת</button>}
      </div>
      <label className="check"><input type="checkbox" checked={s.approval} onChange={(e) => void put({ approval: e.target.checked }, e.target.checked ? "כל הרשמה תחכה לאישור" : "ההרשמה ללא אישור")} /> כל הרשמה עצמית ממתינה לאישור מנהל (הזמנות מדלגות על האישור)</label>
      <Field label="דומיינים מותרים להרשמה (מופרדים בפסיק, ריק = הכול)" htmlFor="reg-dom"><input id="reg-dom" dir="ltr" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="tzofim.org.il" /></Field>
      <Field label="מקסימום הרשמות ביממה (0 = בלי הגבלה)" htmlFor="reg-cap"><input id="reg-cap" type="number" min={0} max={1000} value={cap} onChange={(e) => setCap(Number(e.target.value))} /></Field>
      <Field label="שמות שמורים נוספים (פסיק בין שם לשם)" htmlFor="reg-res" hint={`מובנים: ${s.builtinReserved.slice(0, 8).join(", ")}…`}><input id="reg-res" value={reserved} onChange={(e) => setReserved(e.target.value)} /></Field>
      <button type="button" className="btn btn-primary" onClick={() => void put({ domains: list(domains), dailyCap: cap, reserved: list(reserved) }, "ההגדרות נשמרו")}>שמירת ההגדרות</button>
      <h3>ממתינים לאישור ({pend.length})</h3>
      {pend.length === 0 ? <p>אין בקשות ממתינות.</p> : (
        <ul className="plain-list">{pend.map((p) => (<li key={p.id}><span><strong>{p.displayName}</strong> ({p.username}){p.email ? ` · ${p.email}` : ""} · {fmt(p.createdAt)}</span>
          <span className="actions"><button type="button" className="btn btn-small" onClick={() => void call(`/api/admin/security/pending/${p.id}`, "POST", { approve: true }).then(load)} aria-label={`אישור ${p.displayName}`}>אישור</button>
            <button type="button" className="btn btn-small" onClick={() => void call(`/api/admin/security/pending/${p.id}`, "POST", { approve: false }).then(load)} aria-label={`דחייה של ${p.displayName}`}>דחייה</button></span></li>))}</ul>
      )}
    </>
  );
}

/* 375, 376: ייבוא והודעת קבלה */
interface Made { username: string; displayName: string; email: string | null; tempPassword: string }
const welcome = (m: Made) => `שלום ${m.displayName}!\nנוצר לך חשבון במחולל הפעולות של השבט.\nכתובת: ${origin()}\nשם משתמש: ${m.username}\nסיסמה זמנית: ${m.tempPassword}\nבכניסה הראשונה תתבקש/י לבחור סיסמה חדשה.`;
function Import() {
  const { call, toast } = useApi();
  const [text, setText] = useState("");
  const [res, setRes] = useState<{ created: Made[]; skipped: { row: number; reason: string }[] } | null>(null);
  const go = async () => {
    const rows = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [name, email] = l.split(/[,;\t]/).map((x) => x.trim()); return { displayName: name, ...(email ? { email } : {}) }; });
    const r = await call<NonNullable<typeof res>>("/api/admin/security/import-users", "POST", { rows });
    if (r) setRes(r);
  };
  const csv = () => {
    if (!res) return;
    const body = ["שם,שם משתמש,סיסמה זמנית,מייל", ...res.created.map((c) => [c.displayName, c.username, c.tempPassword, c.email ?? ""].map((x) => `"${x.replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
    a.download = "משתמשים-חדשים.csv";
    a.click();
  };
  return (
    <>
      <Field label="שורה לכל משתמש: שם מלא, ומייל (לא חובה) אחרי פסיק. עד 100" htmlFor="imp-text"><textarea id="imp-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"דנה כהן, dana@example.com\nרון לוי"} /></Field>
      <button type="button" className="btn btn-primary" onClick={() => void go()} disabled={!text.trim()}>יצירת המשתמשים</button>
      {res && (
        <div role="status">
          <p className="meter-tip">הסיסמאות הזמניות מוצגות פעם אחת בלבד. הורידו את הקובץ או העתיקו הודעות קבלה עכשיו. כל משתמש יחליף סיסמה בכניסה הראשונה.</p>
          <p>נוצרו {res.created.length}, דולגו {res.skipped.length}{res.skipped.length ? `: ${res.skipped.map((s) => `שורה ${s.row} (${s.reason})`).join(", ")}` : ""}.</p>
          <button type="button" className="btn" onClick={csv}>הורדת קובץ CSV</button>
          <ul className="plain-list">{res.created.map((c) => (<li key={c.username}><span><strong>{c.displayName}</strong> · <span dir="ltr">{c.username}</span> · <span dir="ltr">{c.tempPassword}</span></span>
            <span className="actions"><button type="button" className="btn btn-small" onClick={() => void copyText(welcome(c), toast)} aria-label={`העתקת הודעת קבלה ל${c.displayName}`}>הודעת קבלה</button>
              <a className="btn btn-small" href={`https://wa.me/?text=${encodeURIComponent(welcome(c))}`} target="_blank" rel="noopener noreferrer" aria-label={`שליחה בוואטסאפ ל${c.displayName}`}>וואטסאפ</a></span></li>))}</ul>
        </div>
      )}
    </>
  );
}

/* 382, 385, 387: חשבונות */
interface Inact { id: number; username: string; displayName: string | null; lastLoginAt: string | null }
interface Lock { key: string; who: string; count: number; locked: boolean; lockedUntil: string | null }
function Accounts() {
  const { call, toast } = useApi();
  const [days, setDays] = useState(180);
  const [inact, setInact] = useState<Inact[]>([]);
  const [pick, setPick] = useState<number[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [exp, setExp] = useState<{ id: number; username: string; displayName: string | null; expiresAt: string }[]>([]);
  const [ef, setEf] = useState({ username: "", date: "" });
  const load = useCallback(() => {
    void call<{ users: Inact[] }>(`/api/admin/security/inactive?days=${days}`).then((r) => { if (r) { setInact(r.users); setPick([]); } });
    void call<Lock[]>("/api/admin/security/lockouts").then((r) => r && setLocks(r));
    void call<typeof exp>("/api/admin/security/expiring").then((r) => r && setExp(r));
  }, [call, days]);
  useEffect(load, [load]);
  const setExpiry = async (date: string | null, id?: number) => {
    let uid = id;
    if (!uid) {
      const r = await call<{ items?: { id: number; username: string }[]; users?: { id: number; username: string }[] }>(`/api/admin/users?q=${encodeURIComponent(ef.username)}&role=INSTRUCTOR`);
      const list = r?.items ?? r?.users ?? [];
      uid = list.find((u) => u.username.toLowerCase() === ef.username.trim().toLowerCase())?.id;
      if (!uid) return toast("לא נמצא מדריך בשם המשתמש הזה", { kind: "error" });
    }
    if (await call("/api/admin/security/expiry", "POST", { id: uid, date })) { toast("נשמר", { kind: "success" }); load(); }
  };
  return (
    <>
      <h3>חשבונות לא פעילים</h3>
      <Field label="לא התחברו מעל (ימים)" htmlFor="inact-days"><select id="inact-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[60, 90, 180, 365].map((d) => (<option key={d} value={d}>{d}</option>))}</select></Field>
      {inact.length === 0 ? <p>אין חשבונות לא פעילים.</p> : (
        <>
          <ul className="check-list">{inact.map((u) => (<li key={u.id}><label className="check"><input type="checkbox" checked={pick.includes(u.id)} onChange={() => setPick(pick.includes(u.id) ? pick.filter((x) => x !== u.id) : [...pick, u.id])} /> {u.displayName || u.username} · כניסה אחרונה: {fmt(u.lastLoginAt)}</label></li>))}</ul>
          <button type="button" className="btn" disabled={!pick.length} onClick={() => { if (window.confirm(`להשעות ${pick.length} חשבונות? אפשר להפעיל אותם שוב.`)) void call("/api/admin/security/inactive/disable", "POST", { ids: pick }).then(load); }}>השעיית המסומנים ({pick.length})</button>
        </>
      )}
      <h3>חשבון זמני עם תפוגה</h3>
      <Field label="שם משתמש של המדריך" htmlFor="exp-user"><input id="exp-user" value={ef.username} onChange={(e) => setEf({ ...ef, username: e.target.value })} /></Field>
      <Field label="תאריך תפוגה" htmlFor="exp-date"><input id="exp-date" type="date" value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} /></Field>
      <button type="button" className="btn" disabled={!ef.username || !ef.date} onClick={() => void setExpiry(ef.date)}>הגדרת תפוגה</button>
      {exp.length > 0 && (<ul className="plain-list">{exp.map((e) => (<li key={e.id}><span>{e.displayName || e.username} · עד {fmt(e.expiresAt)}</span><button type="button" className="btn btn-small" onClick={() => void setExpiry(null, e.id)} aria-label={`ביטול התפוגה של ${e.username}`}>ביטול</button></li>))}</ul>)}
      <h3>ניסיונות כניסה כושלים ונעילות (24 שעות)</h3>
      {locks.length === 0 ? <p>אין.</p> : (<ul className="plain-list">{locks.map((l) => (<li key={l.key}><span><strong>{l.who}</strong> · {l.count} ניסיונות{l.locked ? " · נעול" : ""}</span><button type="button" className="btn btn-small" onClick={() => void call("/api/admin/security/lockouts/release", "POST", { key: l.key }).then(load)} aria-label={`שחרור ${l.who}`}>שחרור</button></li>))}</ul>)}
    </>
  );
}

/* 384, 386: הקשחה */
interface Check { key: string; label: string; ok: boolean; detail: string; severity: string }
function Hardening() {
  const { call, toast } = useApi();
  const [r, setR] = useState<{ score: number; checks: Check[] } | null>(null);
  const [incl, setIncl] = useState(false);
  useEffect(() => { void call<NonNullable<typeof r>>("/api/admin/security/hardening").then(setR); }, [call]);
  const panic = async () => {
    if (!window.confirm(incl ? "לנתק את כל המשתמשים, כולל אדמינים (חוץ מכם)?" : "לנתק את כל המדריכים? כולם יצטרכו להתחבר מחדש.")) return;
    const x = await call<{ revoked: number }>("/api/admin/security/revoke-all", "POST", { includeAdmins: incl });
    if (x) toast(`נותקו ${x.revoked} חיבורים`, { kind: "success" });
  };
  if (!r) return <p role="status">בודק…</p>;
  return (
    <>
      <p><strong>ציון הקשחה: {r.score} מתוך 100</strong></p>
      <ul className="plain-list">{r.checks.map((c) => (<li key={c.key}><span><strong>{c.ok ? "תקין" : c.severity === "high" ? "חשוב" : "כדאי"}:</strong> {c.label}{!c.ok && c.detail ? ` · ${c.detail}` : ""}</span></li>))}</ul>
      <div className="danger-zone">
        <h3>ניתוק כל החיבורים</h3>
        <p>שימושי אם יש חשד לדליפת סיסמאות. כולם יצטרכו להתחבר מחדש.</p>
        <label className="check"><input type="checkbox" checked={incl} onChange={(e) => setIncl(e.target.checked)} /> לנתק גם אדמינים (אתם תישארו מחוברים)</label>
        <button type="button" className="btn btn-primary" onClick={() => void panic()}>ניתוק עכשיו</button>
      </div>
    </>
  );
}

export function AdminAccessControl() {
  const [tab, setTab] = useState<Tab>("invites");
  return (
    <section className="card glass" aria-labelledby="acl-title">
      <h2 id="acl-title" className="section-title">הצטרפות, הרשאות והקשחה</h2>
      <div className="sec-tabs" role="group" aria-label="אזורי ניהול">
        {TABS.map(([k, l]) => (<button key={k} type="button" className="btn" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>))}
      </div>
      {tab === "invites" && <Invites />}
      {tab === "reg" && <Registration />}
      {tab === "import" && <Import />}
      {tab === "accounts" && <Accounts />}
      {tab === "hard" && <Hardening />}
    </section>
  );
}

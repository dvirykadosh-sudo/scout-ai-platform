"use client";

// שלב 54: ניטור ואיכות בלוח הבקרה. שגיאות, ביצועים, דגלי תכונות, תרגיל שחזור, שביעות רצון וחותמות איכות.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

type Tab = "errors" | "vitals" | "flags" | "drill" | "nps" | "stamps";
const TABS: [Tab, string][] = [["errors", "שגיאות"], ["vitals", "ביצועים"], ["flags", "דגלי תכונות"], ["drill", "בדיקת גיבוי"], ["nps", "שביעות רצון"], ["stamps", "חותמות איכות"]];
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL") : "—");

function useApi() {
  const { token } = useAuth();
  const toast = useToast();
  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T | null> => {
    try { return await api<T>(path, { method, token, ...(body !== undefined ? { body } : {}) }); }
    catch (e) { toast(errorMessage(e), { kind: "error" }); return null; }
  }, [token, toast]);
  return { call, toast };
}

interface ErrGroup { sig: string; message: string; page: string; count: number; lastAt: string; firstAt: string; stack: string; users: number }
function Errors() {
  const { call } = useApi();
  const [g, setG] = useState<ErrGroup[] | null>(null);
  const load = useCallback(() => { void call<{ groups: ErrGroup[] }>("/api/admin/security/errors").then((r) => r && setG(r.groups)); }, [call]);
  useEffect(load, [load]);
  if (!g) return <p role="status">טוען…</p>;
  return (
    <>
      <p>שגיאות שקרו בדפדפן של משתמשים בשבועיים האחרונים, מקובצות לפי סוג. הכתובות והמיילים מוסרים מהטקסט.</p>
      {g.length === 0 ? <p>לא דווחו שגיאות. כל הכבוד.</p> : (
        <table className="sec-table"><caption className="sr-only">שגיאות מהדפדפן</caption>
          <thead><tr><th scope="col">שגיאה</th><th scope="col">דף</th><th scope="col">פעמים</th><th scope="col">משתמשים</th><th scope="col">אחרונה</th></tr></thead>
          <tbody>{g.map((r) => (<tr key={r.sig}><td><details><summary>{r.message.slice(0, 80)}</summary><pre className="lab-card" tabIndex={0} aria-label="פירוט השגיאה">{r.message}{"\n"}{r.stack}</pre></details></td><td dir="ltr">{r.page || "—"}</td><td>{r.count}</td><td>{r.users}</td><td>{fmt(r.lastAt)}</td></tr>))}</tbody></table>
      )}
      {g.length > 0 && <button type="button" className="btn btn-small" onClick={() => void call("/api/admin/security/errors", "DELETE").then(load)}>ניקוי הרשימה</button>}
    </>
  );
}

interface Vital { metric: string; samples: number; p50: number | null; p75: number | null; good: number; poor: number; rating: "good" | "needs" | "poor" | null }
const RATE = { good: "טוב", needs: "דורש שיפור", poor: "איטי" } as const;
function Vitals() {
  const { call } = useApi();
  const [d, setD] = useState<{ metrics: Vital[]; slowPages: { page: string; samples: number; avg: number }[] } | null>(null);
  useEffect(() => { void call<typeof d>("/api/admin/security/vitals").then(setD); }, [call]);
  if (!d) return <p role="status">טוען…</p>;
  const unit = (m: string) => (m === "CLS" ? "" : " מילישניות");
  return (
    <>
      <p>מדידות אמיתיות ממכשירי המדריכים בשבועיים האחרונים. ציון נקבע לפי אחוזון 75, כמו שמקובל באינטרנט.</p>
      <table className="sec-table"><caption className="sr-only">מדדי ביצועים</caption>
        <thead><tr><th scope="col">מדד</th><th scope="col">דגימות</th><th scope="col">חציון</th><th scope="col">אחוזון 75</th><th scope="col">ציון</th></tr></thead>
        <tbody>{d.metrics.map((m) => (<tr key={m.metric}><th scope="row">{m.metric}</th><td>{m.samples}</td><td>{m.p50 ?? "—"}</td><td>{m.p75 != null ? `${m.p75}${unit(m.metric)}` : "—"}</td><td>{m.rating ? RATE[m.rating] : "אין נתונים"}</td></tr>))}</tbody></table>
      {d.slowPages.length > 0 && (<><h3>הדפים האיטיים ביותר (LCP ממוצע)</h3><ul className="plain-list">{d.slowPages.map((p) => (<li key={p.page}><span dir="ltr">{p.page}</span><span> · {p.avg} מילישניות · {p.samples} דגימות</span></li>))}</ul></>)}
    </>
  );
}

interface Flag { key: string; enabled: boolean; percent: number; note: string; updatedAt: string }
function Flags() {
  const { call, toast } = useApi();
  const [rows, setRows] = useState<Flag[]>([]);
  const [f, setF] = useState({ key: "", percent: 100, note: "" });
  const load = useCallback(() => { void call<{ flags: Flag[] }>("/api/admin/security/flags").then((r) => r && setRows(r.flags)); }, [call]);
  useEffect(load, [load]);
  const save = async (key: string, enabled: boolean, percent: number, note: string) => { const r = await call(`/api/admin/security/flags/${key}`, "PUT", { enabled, percent, note }); if (r) { toast("נשמר", { kind: "success" }); load(); } };
  return (
    <>
      <p>דגל מאפשר לכבות או להפעיל תכונה לכולם, או לחלק מהמשתמשים, בלי לפרוס מחדש. כרגע האתר קורא את הדגל <code dir="ltr">voice-search</code> (חיפוש בקול). דגל שלא הוגדר נחשב פעיל.</p>
      <Field label="שם הדגל (אותיות לועזיות קטנות, למשל voice-search)" htmlFor="fl-key"><input id="fl-key" dir="ltr" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>
      <Field label="אחוז המשתמשים שיראו אותו" htmlFor="fl-pct"><input id="fl-pct" type="number" min={0} max={100} value={f.percent} onChange={(e) => setF({ ...f, percent: Number(e.target.value) })} /></Field>
      <Field label="הערה" htmlFor="fl-note"><input id="fl-note" value={f.note} maxLength={120} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button type="button" className="btn btn-primary" disabled={!f.key} onClick={() => void save(f.key.trim(), true, f.percent, f.note).then(() => setF({ key: "", percent: 100, note: "" }))}>הוספה או עדכון</button>
      <table className="sec-table"><caption className="sr-only">דגלי תכונות</caption>
        <thead><tr><th scope="col">דגל</th><th scope="col">מצב</th><th scope="col">אחוז</th><th scope="col">הערה</th><th scope="col"><span className="sr-only">פעולות</span></th></tr></thead>
        <tbody>{rows.map((r) => (<tr key={r.key}><td dir="ltr">{r.key}</td><td>{r.enabled ? "פעיל" : "כבוי"}</td><td>{r.percent}%</td><td>{r.note}</td>
          <td><button type="button" className="btn btn-small" onClick={() => void save(r.key, !r.enabled, r.percent, r.note)} aria-label={`${r.enabled ? "כיבוי" : "הפעלה"} של ${r.key}`}>{r.enabled ? "כיבוי" : "הפעלה"}</button>{" "}
            <button type="button" className="btn btn-small" onClick={() => void call(`/api/admin/security/flags/${r.key}`, "DELETE").then(load)} aria-label={`מחיקת ${r.key}`}>מחיקה</button></td></tr>))}</tbody></table>
    </>
  );
}

interface Drill { ok: boolean; status: string; created?: boolean; backup: { name: string; createdAt?: string; ageHours?: number }; integrity: string; tables: { table: string; backup: number | null; live: number | null; diff: number | null }[]; warnings: string[] }
function DrillTab() {
  const { call } = useApi();
  const [r, setR] = useState<Drill | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setR(await call<Drill>("/api/admin/security/drill", "POST", {})); setBusy(false); };
  return (
    <>
      <p>הבדיקה פותחת את הגיבוי האחרון במצב קריאה בלבד, מריצה בדיקת שלמות ומשווה כמויות לנתונים החיים. היא לא משנה כלום באתר.</p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>{busy ? "בודק…" : "הריצו בדיקת שחזור"}</button>
      {r && (
        <div role="status">
          <h3>{r.ok ? "הגיבוי תקין ואפשר לשחזר ממנו" : "הגיבוי לא עבר את הבדיקה"}</h3>
          <p>קובץ: <span dir="ltr">{r.backup.name}</span>{r.backup.ageHours != null ? ` · בן ${r.backup.ageHours} שעות` : ""}{r.created ? " · נוצר עכשיו כי לא היה גיבוי" : ""} · בדיקת שלמות: {r.integrity}</p>
          {r.tables.length > 0 && (<table className="sec-table"><caption className="sr-only">השוואת טבלאות</caption><thead><tr><th scope="col">טבלה</th><th scope="col">בגיבוי</th><th scope="col">בחי</th><th scope="col">הפרש</th></tr></thead>
            <tbody>{r.tables.map((t) => (<tr key={t.table}><th scope="row" dir="ltr">{t.table}</th><td>{t.backup ?? "חסרה"}</td><td>{t.live ?? "—"}</td><td>{t.diff ?? "—"}</td></tr>))}</tbody></table>)}
          {r.warnings.map((w) => (<p key={w} className="warn-box">{w}</p>))}
        </div>
      )}
    </>
  );
}

interface Nps { responses: number; dismissed: number; nps: number | null; promoters: number; passives: number; detractors: number; average: number | null; comments: { score: number; comment: string; at: string }[] }
function NpsTab() {
  const { call } = useApi();
  const [d, setD] = useState<Nps | null>(null);
  useEffect(() => { void call<Nps>("/api/admin/security/nps").then(setD); }, [call]);
  if (!d) return <p role="status">טוען…</p>;
  if (!d.responses) return <p>עוד אין תשובות. מדריכים שנרשמו לפני יומיים ויותר יקבלו שאלה אחת בשבועיים.</p>;
  return (
    <>
      <p>ציון NPS: <strong>{d.nps}</strong> (בין -100 ל-100) · ממוצע {d.average} · {d.responses} תשובות · {d.dismissed} דחו</p>
      <p>ממליצים (9–10): {d.promoters} · אדישים (7–8): {d.passives} · מבקרים (0–6): {d.detractors}</p>
      {d.comments.length > 0 && (<ul className="plain-list">{d.comments.map((c, i) => (<li key={i}><span>{c.score}/10: {c.comment}</span></li>))}</ul>)}
    </>
  );
}

interface Stamp { id: number; title: string; value: string; verifiedAt: string | null; verifiedBy: string | null; note: string | null }
function Stamps() {
  const { call, toast } = useApi();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Stamp[]>([]);
  const [stamped, setStamped] = useState(0);
  const load = useCallback(() => { void call<{ items: Stamp[]; stamped: number }>(`/api/admin/security/stamps?q=${encodeURIComponent(q)}`).then((r) => { if (r) { setRows(r.items); setStamped(r.stamped); } }); }, [call, q]);
  useEffect(load, [load]);
  const set = async (r: Stamp, verified: boolean) => { const x = await call(`/api/admin/security/stamps/${r.id}`, "PUT", { verified, note: verified ? "נבדקה בשטח" : "" }); if (x) { toast(verified ? "החותמת נוספה" : "החותמת הוסרה", { kind: "success" }); load(); } };
  return (
    <>
      <p>חותמת "נבדקה על ידי הצוות" מופיעה בדף הפעולה ומעניקה אמון. כרגע {stamped} פעולות מחותמות.</p>
      <Field label="חיפוש פעולה" htmlFor="st-q"><input id="st-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <table className="sec-table"><caption className="sr-only">פעולות וחותמות</caption>
        <thead><tr><th scope="col">פעולה</th><th scope="col">חותמת</th><th scope="col"><span className="sr-only">פעולה</span></th></tr></thead>
        <tbody>{rows.map((r) => (<tr key={r.id}><th scope="row">{r.title}</th><td>{r.verifiedAt ? `נבדקה ${new Date(r.verifiedAt).toLocaleDateString("he-IL")} (${r.verifiedBy})` : "ללא"}</td>
          <td><button type="button" className="btn btn-small" onClick={() => void set(r, !r.verifiedAt)} aria-label={`${r.verifiedAt ? "הסרת חותמת מ" : "הוספת חותמת ל"}${r.title}`}>{r.verifiedAt ? "הסרה" : "חתימה"}</button></td></tr>))}</tbody></table>
    </>
  );
}

export function AdminMonitor() {
  const [tab, setTab] = useState<Tab>("errors");
  return (
    <section className="card glass" aria-labelledby="mon-title">
      <h2 id="mon-title" className="section-title">ניטור, איכות ותפעול</h2>
      <div className="sec-tabs" role="group" aria-label="אזורי ניטור">
        {TABS.map(([k, l]) => (<button key={k} type="button" className="btn" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>))}
      </div>
      {tab === "errors" && <Errors />}
      {tab === "vitals" && <Vitals />}
      {tab === "flags" && <Flags />}
      {tab === "drill" && <DrillTab />}
      {tab === "nps" && <NpsTab />}
      {tab === "stamps" && <Stamps />}
    </section>
  );
}

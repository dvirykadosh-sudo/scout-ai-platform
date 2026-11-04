"use client";

// שלב 54: עמודי סטטוס (431), מפת כיסוי (446) וקליטת שיתוף מהטלפון (426).
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { SeenMark } from "./Discover54";
import { useAuth, useToast } from "./Providers";
import { Field, Skeleton } from "./ui";

interface Status { ok: boolean; version: string; startedAt: string | null; uptimeSec: number; time: string; db: { ok: boolean; latencyMs: number }; lastBackupAt: string | null; ai: boolean; email: boolean; maintenance: string | null }
const dur = (s: number) => (s < 120 ? `${s} שניות` : s < 7200 ? `${Math.round(s / 60)} דקות` : s < 172800 ? `${Math.round(s / 3600)} שעות` : `${Math.round(s / 86400)} ימים`);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL") : "עדיין לא נוצר");

export function StatusPage() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => api<Status>("/api/status").then((d) => { if (live) { setS(d); setErr(""); } }).catch((e) => live && setErr(errorMessage(e)));
    load();
    const id = window.setInterval(load, 30_000);
    return () => { live = false; window.clearInterval(id); };
  }, []);
  if (err && !s) return <div className="error-box" role="alert"><p>{err}</p></div>;
  if (!s) return <Skeleton lines={4} />;
  const rows: [string, string][] = [
    ["מצב כללי", s.ok ? "תקין" : "יש תקלה"],
    ["זמן הפעלה רצוף", dur(s.uptimeSec)],
    ["מסד הנתונים", s.db.ok ? `תקין (תגובה תוך ${s.db.latencyMs} מילישניות)` : "לא זמין"],
    ["גיבוי אחרון", when(s.lastBackupAt)],
    ["שליחת מיילים", s.email ? "מוגדרת" : "לא מוגדרת"],
    ["עוזר AI", s.ai ? "מחובר" : "לא מחובר (עובדים בכללים בלבד)"],
    ["גרסה", s.version],
  ];
  return (
    <section className="card glass" aria-labelledby="st-h">
      <SeenMark id="status" />
      <h2 id="st-h" className="h3"><span aria-hidden="true">{s.ok ? "● " : "○ "}</span>{s.ok ? "האתר פועל כרגיל" : "יש תקלה באתר"}</h2>
      {s.maintenance && <p className="warn-box" role="status">{s.maintenance}</p>}
      <dl className="status-list" aria-live="polite">
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
      <p className="meter-tip">הדף מתרענן לבד כל חצי דקה. אם האתר לא ענה זמן מה, הוא כנראה מתעורר ויחזור תוך כחצי דקה.</p>
    </section>
  );
}

interface Cov { grades: string[]; matrix: { value: string; total: number; counts: Record<string, number> }[]; gradeTotals: Record<string, number>; gaps: { value: string; grade: string; text: string }[]; emptyGrades: string[]; activities: number }
export function CoveragePage() {
  const [d, setD] = useState<Cov | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Cov>("/api/coverage").then(setD).catch((e) => setErr(errorMessage(e))); }, []);
  if (err) return <div className="error-box" role="alert"><p>{err}</p></div>;
  if (!d) return <Skeleton lines={5} />;
  const max = Math.max(1, ...d.matrix.flatMap((r) => Object.values(r.counts)));
  return (
    <>
      <SeenMark id="coverage" />
      <section className="card glass" aria-labelledby="cov-h">
        <h2 id="cov-h" className="h3">איפה המאגר חזק ואיפה חסר ({d.activities} פעולות)</h2>
        <div className="table-wrap" role="region" aria-label="מפת כיסוי לפי ערך וכיתה" tabIndex={0}>
          <table className="cov-table">
            <caption className="sr-only">מספר הפעולות בכל ערך לפי כיתה. תא עם 0 הוא פער.</caption>
            <thead><tr><th scope="col">ערך</th>{d.grades.map((g) => (<th key={g} scope="col">{g}</th>))}</tr></thead>
            <tbody>
              {d.matrix.map((r) => (
                <tr key={r.value}>
                  <th scope="row">{r.value}</th>
                  {d.grades.map((g) => { const n = r.counts[g]; return (<td key={g} className={n === 0 ? "cov-zero" : `cov-l${Math.min(3, Math.ceil((n / max) * 3))}`}>{n}</td>); })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card glass" aria-labelledby="gap-h">
        <h2 id="gap-h" className="h3">מה כדאי לכתוב הבא</h2>
        {d.gaps.length === 0 ? <p>אין פערים בולטים כרגע.</p> : (
          <ul className="plain-list">{d.gaps.map((g) => (<li key={`${g.value}${g.grade}`}><span>{g.text}</span> <Link className="btn btn-small" href="/write">כתיבת פעולה</Link></li>))}</ul>
        )}
        {d.emptyGrades.length > 0 && <p className="meter-tip">עדיין אין שום פעולה לכיתות: {d.emptyGrades.join(", ")}.</p>}
      </section>
    </>
  );
}

function ShareTargetInner() {
  const sp = useSearchParams();
  const { token, ready } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const parts = [sp.get("title"), sp.get("text"), sp.get("url")].filter(Boolean) as string[];
    setText(parts.join("\n\n").slice(0, 40000));
  }, [sp]);
  const go = async () => {
    setBusy(true);
    try {
      const parsed = await api<{ title: string; blocks: { id: string; title: string; kind: string; minutes: number | null; text: string; note: string }[] }>("/api/write/lab/from-text", { method: "POST", token, body: { text, title: sp.get("title") ?? "" } });
      const d = await api<{ id: number; meta: unknown; rev: number }>("/api/write/docs", { method: "POST", token, body: { template: "classic" } });
      await api(`/api/write/docs/${d.id}`, { method: "PUT", token, body: { title: parsed.title || "פעולה שיובאה", meta: d.meta, blocks: parsed.blocks, baseRev: d.rev } });
      toast("הטקסט פורק לשלבים ונשמר כמסמך חדש.", { kind: "success" });
      router.push(`/write/${d.id}`);
    } catch (e) { toast(errorMessage(e), { kind: "error" }); setBusy(false); }
  };
  if (!ready) return <Skeleton lines={3} />;
  return (
    <section className="card glass" aria-labelledby="sh-h">
      <h2 id="sh-h" className="h3">קיבלנו טקסט ששיתפתם</h2>
      {!token ? (
        <p>כדי לשמור את הטקסט כפעולה, <Link href="/account">התחברו</Link> ושתפו שוב.</p>
      ) : (
        <>
          <Field label="הטקסט (אפשר לערוך לפני הפירוק)" htmlFor="sh-text"><textarea id="sh-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 30} onClick={() => void go()}>{busy ? "שומר…" : "פרקו לשלבים ושמרו כמסמך"}</button>
            <Link className="btn" href="/write">פתיחת עורך ריק</Link>
          </div>
          {text.trim().length < 30 && <p className="meter-tip">הטקסט קצר מדי לפירוק (צריך לפחות 30 תווים).</p>}
        </>
      )}
    </section>
  );
}
export function ShareTargetPage() {
  return (
    <Suspense fallback={<Skeleton lines={3} />}>
      <ShareTargetInner />
    </Suspense>
  );
}

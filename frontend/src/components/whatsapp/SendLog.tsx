"use client";

// יומן שליחות: חיפוש וסינון, דפדוף, ייצוא ל-CSV, וסיכום לפי יום. ללא מספרי טלפון מלאים (רק סוף המספר).
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { downloadLogCsv, waApi } from "@/lib/wa-api";
import { Alert, fmtTime, useAct, useLoad } from "./wa-ui";

const PAGE = 25;
const STATUS: Record<string, string> = { sent: "נשלחה", failed: "נכשלה", cancelled: "בוטלה", queued: "בתור", leased: "בשליחה" };
const label = (s: string) => STATUS[s] ?? s;

export function SendLog({ token }: { token: string }) {
  const api = waApi(token);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const log = useLoad(() => api.log({ q: q.trim() || undefined, status: status || undefined, limit: PAGE, offset: page * PAGE }), [token, q, status, page], 15000);
  const stats = useLoad(() => api.stats(), [token], 60000);
  const { act, busy } = useAct();

  const total = log.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const perDay = useMemo(() => {
    const m = new Map<string, { sent: number; failed: number }>();
    for (const r of stats.data?.days ?? []) {
      const cur = m.get(r.day) ?? { sent: 0, failed: 0 };
      if (r.status === "sent") cur.sent += r.c;
      else if (r.status === "failed") cur.failed += r.c;
      m.set(r.day, cur);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  }, [stats.data]);
  const max = Math.max(1, ...perDay.map(([, v]) => v.sent + v.failed));

  return (
    <section className="wa-card" aria-label="יומן שליחות">
      <div className="wa-row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>יומן שליחות</h2>
        <button type="button" className="wa-btn soft" disabled={busy} onClick={() => act(() => downloadLogCsv(token), "הקובץ ירד.")}><Download size={18} aria-hidden="true" />ייצוא ל-CSV</button>
      </div>
      {(log.error || stats.error) && <Alert>{log.error || stats.error}</Alert>}

      {perDay.length > 0 && (
        <div style={{ margin: "14px 0" }}>
          <h3>14 הימים האחרונים</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {perDay.map(([day, v]) => (
              <li key={day} className="wa-row" style={{ flexWrap: "nowrap" }}>
                <span style={{ minWidth: 92 }} dir="ltr">{day}</span>
                <span
                  aria-hidden="true"
                  style={{ display: "block", height: 12, borderRadius: 999, width: `${Math.max(4, ((v.sent + v.failed) / max) * 100)}%`, maxWidth: "70%", background: "var(--wa-btn)" }}
                />
                <span className="wa-muted">נשלחו {v.sent}{v.failed ? `, נכשלו ${v.failed}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="wa-row" style={{ alignItems: "flex-end", margin: "10px 0" }}>
        <div className="wa-field">
          <label htmlFor="log-q">חיפוש</label>
          <input id="log-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <div className="wa-field">
          <label htmlFor="log-s">מצב</label>
          <select id="log-s" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            <option value="">הכל</option>
            {Object.keys(stats.data?.counts ?? {}).map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
      </div>

      {(log.data?.rows ?? []).length === 0 ? (
        <p className="wa-muted">אין רשומות להצגה.</p>
      ) : (
        <div className="wa-table-wrap">
          <table className="wa-table">
            <caption className="sh-only-sr">יומן השליחות</caption>
            <thead><tr><th scope="col">מתי</th><th scope="col">נמען</th><th scope="col">מצב</th><th scope="col">פירוט</th></tr></thead>
            <tbody>
              {(log.data?.rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{fmtTime(r.at)}</td>
                  <td>{r.contactName || "—"}{r.hint ? <small className="wa-muted" style={{ display: "block" }} dir="ltr">{r.hint}</small> : null}</td>
                  <td><span className={`wa-tag ${r.status}`}>{label(r.status)}</span></td>
                  <td>{r.detail || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="wa-row" style={{ marginTop: 10, justifyContent: "space-between" }}>
        <button type="button" className="wa-btn soft small" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>הקודם</button>
        <span className="wa-muted" role="status">עמוד {page + 1} מתוך {pages} ({total} רשומות)</span>
        <button type="button" className="wa-btn soft small" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>הבא</button>
      </div>
    </section>
  );
}

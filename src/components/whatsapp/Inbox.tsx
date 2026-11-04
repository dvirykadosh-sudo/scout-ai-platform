"use client";

// תיבת הודעות: שיחות עם אנשי קשר מוכרים (14 ימים אחרונים בלבד), והודעות שנשלחו אליהם, עם תשובה אישית.
// תשובה אישית עוברת באותו תור, עם אותן הגנות, ויוצאת גם בשעות שקט (היא תשובה למי שפנה).
import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { waApi } from "@/lib/wa-api";
import { Alert, fmtTime, useAct, useLoad } from "./wa-ui";

export function Inbox({ token }: { token: string }) {
  const api = waApi(token);
  const inbox = useLoad(() => api.inbox(), [token], 6000);
  const [sel, setSel] = useState<number | null>(null);
  const [text, setText] = useState("");
  const { act, busy } = useAct();

  const convs = useMemo(() => {
    const m = new Map<number, { id: number; name: string; last: string; at: string; unhandled: number }>();
    for (const i of inbox.data ?? []) {
      if (i.contactId == null) continue;
      const cur = m.get(i.contactId);
      if (!cur) m.set(i.contactId, { id: i.contactId, name: i.contactName || "איש קשר", last: i.text, at: i.at, unhandled: i.handled ? 0 : 1 });
      else if (!i.handled) cur.unhandled++;
    }
    return [...m.values()];
  }, [inbox.data]);
  const active = sel ?? convs[0]?.id ?? null;

  const thread = useLoad(async () => {
    if (active == null) return [];
    const [jobs, items] = await Promise.all([api.jobs({ contactId: active, limit: 30 }), api.inbox(active)]);
    return [
      ...items.map((i) => ({ key: `i${i.id}`, out: false, text: i.text, at: i.at })),
      ...jobs.filter((j) => j.status === "sent").map((j) => ({ key: `j${j.id}`, out: true, text: j.body, at: j.sentAt ?? j.runAt })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  }, [token, active], 6000);

  const send = async () => {
    if (active == null || !text.trim()) return;
    if (await act(() => api.reply(active, text.trim()), "התשובה נכנסה לתור.")) {
      setText("");
      void thread.reload();
    }
  };

  return (
    <section className="wa-card" aria-label="תיבת הודעות">
      <h2>תיבת הודעות</h2>
      <p className="wa-muted">מוצגות רק הודעות מאנשי קשר שמופיעים ברשימה, ורק 14 ימים אחורה. הודעות מאנשים לא מוכרים לא נשמרות.</p>
      {inbox.error && <Alert>{inbox.error}</Alert>}
      {convs.length === 0 ? (
        <p className="wa-muted">אין עדיין הודעות נכנסות.</p>
      ) : (
        <div className="wa-inbox">
          <ul className="wa-conv-list" aria-label="שיחות">
            {convs.map((c) => (
              <li key={c.id}>
                <button type="button" className="wa-conv" aria-current={active === c.id} onClick={() => setSel(c.id)}>
                  <strong>{c.name}{c.unhandled ? ` (${c.unhandled} חדשות)` : ""}</strong>
                  <small>{c.last}</small>
                </button>
              </li>
            ))}
          </ul>
          <div>
            <div className="wa-thread" role="log" aria-label="השיחה">
              {(thread.data ?? []).map((m) => (
                <div key={m.key} className={`wa-bubble${m.out ? " out" : ""}`}>
                  {m.text}
                  <small>{m.out ? "נשלח" : "התקבל"} · {fmtTime(m.at)}</small>
                </div>
              ))}
            </div>
            <div className="wa-field" style={{ marginTop: 10 }}>
              <label htmlFor="wa-reply">תשובה אישית</label>
              <textarea id="wa-reply" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
            </div>
            <button type="button" className="wa-btn" style={{ marginTop: 8 }} disabled={busy || !text.trim()} onClick={send}><Send size={18} aria-hidden="true" />שליחה</button>
          </div>
        </div>
      )}
    </section>
  );
}

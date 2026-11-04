"use client";

// אישורי הגעה: בחירת אירוע וסיכום כן / לא / אולי / עוד לא ענו. התשובות נאספות מהודעות נכנסות של אנשי קשר מוכרים.
import { useState } from "react";
import { waApi } from "@/lib/wa-api";
import { Alert, Field, fmtTime, useLoad } from "./wa-ui";

const ANSWER: Record<string, string> = { yes: "מגיע/ה", no: "לא מגיע/ה", maybe: "אולי" };

export function Rsvp({ token }: { token: string }) {
  const api = waApi(token);
  const events = useLoad(() => api.rsvpEvents(), [token]);
  const [pick, setPick] = useState("");
  const key = pick || events.data?.[0]?.key || "";
  const sum = useLoad(async () => (key ? api.rsvp(key) : null), [token, key], 10000);
  const s = sum.data;

  return (
    <section className="wa-card" aria-label="אישורי הגעה">
      <h2>אישורי הגעה</h2>
      {events.error && <Alert>{events.error}</Alert>}
      {(events.data ?? []).length === 0 ? (
        <p className="wa-muted">עוד לא נשלחה הודעה עם בקשת אישור הגעה. סמנו "לבקש אישור הגעה" בלשונית "שליחה".</p>
      ) : (
        <>
          <Field label="אירוע">
            {(id) => (
              <select id={id} value={key} onChange={(e) => setPick(e.target.value)}>
                {(events.data ?? []).map((e) => <option key={e.key} value={e.key}>{e.title} ({e.sent} נשלחו)</option>)}
              </select>
            )}
          </Field>
          {sum.error && <Alert>{sum.error}</Alert>}
          {s && (
            <>
              <dl className="wa-row" style={{ gap: 22, margin: "12px 0" }}>
                <div><dt className="wa-muted">מגיעים</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: "1.6rem" }}>{s.yes}</dd></div>
                <div><dt className="wa-muted">לא מגיעים</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: "1.6rem" }}>{s.no}</dd></div>
                <div><dt className="wa-muted">אולי</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: "1.6rem" }}>{s.maybe}</dd></div>
                <div><dt className="wa-muted">עוד לא ענו</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: "1.6rem" }}>{s.none}</dd></div>
              </dl>
              <div className="wa-table-wrap">
                <table className="wa-table">
                  <caption className="sh-only-sr">מי ענה מה</caption>
                  <thead><tr><th scope="col">שם</th><th scope="col">גדוד</th><th scope="col">תשובה</th><th scope="col">מתי</th></tr></thead>
                  <tbody>
                    {s.people.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.battalion || "—"}</td>
                        <td>{p.answer ? ANSWER[p.answer] ?? p.answer : <span className="wa-muted">עוד לא ענה/תה</span>}</td>
                        <td>{fmtTime(p.at) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

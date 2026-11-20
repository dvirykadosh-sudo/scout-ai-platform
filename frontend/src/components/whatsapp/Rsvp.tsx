"use client";

// אישורי הגעה: בחירת אירוע וסיכום כן / לא / אולי / עוד לא ענו. התשובות נאספות מהודעות נכנסות של אנשי קשר מוכרים.
import Link from "next/link";
import { useEffect, useState } from "react";
import { storageGet, storageSet } from "@/lib/api";
import { rsvpLink, waNumber } from "@/lib/invite";
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
  // שלב 71: קישור אישור הגעה לאירוע (לכרטיס הזמנה / להדבקה בקבוצה). המפתח הוא 6 תווים ונוצר בכרטיס ההזמנה
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setPhone(storageGet("maoz.rsvp.phone") ?? ""), []);
  const link = /^[a-z0-9]{6}$/.test(key) ? rsvpLink(phone, key) : null;
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="wa-card" aria-label="אישורי הגעה">
      <h2>אישורי הגעה</h2>
      {events.error && <Alert>{events.error}</Alert>}
      {(events.data ?? []).length === 0 ? (
        <p className="wa-muted">
          עוד לא נשלחה הודעה עם בקשת אישור הגעה. סמנו "לבקש אישור הגעה" בלשונית "שליחה", או צרו כרטיס הזמנה לסטורי עם קישור אישור הגעה: בכל פעולה במאגר, בסטודיו הייצוא, לשונית "סטורי הזמנה". <Link href="/library">למאגר הפעולות</Link>
        </p>
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
          {/^[a-z0-9]{6}$/.test(key) && (
            <div className="wa-card" style={{ marginBlock: 10 }}>
              <Field label="מספר הוואטסאפ שלכם לקישור (נשמר רק בדפדפן הזה)">
                {(id) => <input id={id} dir="ltr" inputMode="tel" value={phone} onChange={(e) => (setPhone(e.target.value), storageSet("maoz.rsvp.phone", e.target.value))} aria-invalid={!!phone && !waNumber(phone)} autoComplete="off" />}
              </Field>
              {link ? (
                <p>
                  <button type="button" className="wa-btn" onClick={copy}>
                    {copied ? "הועתק ✓" : "העתקת קישור לאישור הגעה"}
                  </button>
                </p>
              ) : (
                <p className="wa-muted">כתבו מספר תקין כדי לקבל קישור. אירוע שנוצר מכרטיס הזמנה סופר גם תשובות מהקישור.</p>
              )}
            </div>
          )}
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

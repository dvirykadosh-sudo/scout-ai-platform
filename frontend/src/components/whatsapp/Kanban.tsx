"use client";

// לוח קנבן של התור: מתוזמנות, ממתינות, בשליחה, נשלחו, נכשלו. מתרענן כל 5 שניות. ביטול וניסיון חוזר בכפתורים (נגיש גם במקלדת).
import { motion } from "framer-motion";
import type { WaJob } from "@/lib/wa-api";
import { waApi } from "@/lib/wa-api";
import { fmtTime, useAct, useLoad, Alert } from "./wa-ui";

const COLS = [
  { key: "scheduled", title: "מתוזמנות" },
  { key: "ready", title: "ממתינות לשליחה" },
  { key: "sending", title: "בשליחה" },
  { key: "sent", title: "נשלחו" },
  { key: "failed", title: "נכשלו או בוטלו" },
] as const;
type ColKey = (typeof COLS)[number]["key"];

const SOURCE: Record<string, string> = { manual: "ידני", rule: "כלל", bot: "בוט", reply: "תשובה", broadcast: "שליחה לרבים", tool: "כלי" };

/** לאיזו עמודה שייכת משימה (ברגע נתון) */
export function columnOf(j: WaJob, now = Date.now()): ColKey {
  if (j.status === "sent") return "sent";
  if (j.status === "failed" || j.status === "cancelled") return "failed";
  if (j.status === "leased") return "sending";
  return new Date(j.runAt).getTime() > now + 60_000 ? "scheduled" : "ready";
}

export function Kanban({ token }: { token: string }) {
  const api = waApi(token);
  const { data, error, reload } = useLoad(() => api.jobs({ limit: 150 }), [token], 5000);
  const { act, busy } = useAct();
  const jobs = data ?? [];
  const now = Date.now();

  return (
    <section aria-label="לוח התור">
      <h2 style={{ margin: "0 0 10px", color: "var(--wa-ink)" }}>תור השליחה</h2>
      {error && <Alert>{error}</Alert>}
      <div className="wa-kanban" role="group" aria-label="עמודות התור, אפשר לגלול הצידה" tabIndex={0}>
        {COLS.map((c) => {
          const items = jobs.filter((j) => columnOf(j, now) === c.key).slice(0, c.key === "sent" || c.key === "failed" ? 12 : 40);
          return (
            <div key={c.key} className="wa-col" role="group" aria-label={c.title}>
              <div className="wa-col-h"><span>{c.title}</span><b>{jobs.filter((j) => columnOf(j, now) === c.key).length}</b></div>
              {items.length === 0 && <p className="wa-muted" style={{ margin: "4px" }}>אין כאן כלום.</p>}
              {items.map((j) => (
                <motion.article key={j.id} className="wa-job" whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
                  <strong>{j.contactName || "ללא שם"}</strong>
                  <p>{j.body.length > 90 ? `${j.body.slice(0, 90)}…` : j.body}</p>
                  <small>
                    {fmtTime(j.sentAt ?? j.runAt)} · {SOURCE[j.source] ?? j.source}
                    {j.attempts > 0 ? ` · ניסיון ${j.attempts}/${j.maxAttempts}` : ""}
                    {j.expectsRsvp ? " · עם אישור הגעה" : ""}
                  </small>
                  {j.error && <small className="wa-bad" style={{ display: "block" }}>{j.error}</small>}
                  <div className="wa-row">
                    {(c.key === "scheduled" || c.key === "ready") && (
                      <button type="button" className="wa-btn danger small" disabled={busy} onClick={async () => { if (await act(() => api.cancelJob(j.id), "המשימה בוטלה.")) void reload(); }}>ביטול</button>
                    )}
                    {c.key === "failed" && j.status === "failed" && (
                      <button type="button" className="wa-btn soft small" disabled={busy} onClick={async () => { if (await act(() => api.retryJob(j.id), "המשימה חזרה לתור.")) void reload(); }}>ניסיון חוזר</button>
                    )}
                  </div>
                </motion.article>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// לולאת שליחה: שואבת משימה מהאתר, שולחת דרך המתאם ומדווחת תוצאה.
// הקצב, המכסות והשעות השקטות נקבעים באתר. הגשר רק מציית לתשובת retryInMs, ולא שולח כלום מעצמו.
import { AuthError } from "../site-client.js";
import { clamp, sleep } from "../humanize.js";
import { hint } from "../log.js";

const TARGET = /^\d{5,25}(-\d{5,25})?@(c|g)\.us$/;

/** בדיקה אחרונה לפני שליחה: יעד ונוסח תקינים. כשל כאן הוא סופי (לא מנסים שוב). */
export function checkJob(job) {
  if (!job || !Number.isInteger(job.id)) return "משימה לא תקינה";
  if (!TARGET.test(String(job.to || ""))) return "יעד לא תקין";
  const t = String(job.text ?? "");
  if (!t.trim() || t.length > 4096) return "נוסח ריק או ארוך מדי";
  return null;
}

/** ctx: { adapter, client, outbox, log, flags, signal, onAuthError } */
export function startOutbound(ctx, { idleMs = 3000 } = {}) {
  const { adapter, client, outbox, log, flags, signal, onAuthError } = ctx;
  let wakeNow = null;
  flags.onResume = () => wakeNow?.(); // האתר חזר לאפשר שליחה: לא מחכים לסיום ההמתנה

  async function once() {
    // קודם מדווחים מה שנשאר; בלי זה לא לוקחים משימה חדשה (אחרת האתר עלול לשלוח פעמיים)
    if (!(await outbox.flush(client))) return idleMs;
    if (adapter.getState().state !== "connected") return idleMs;
    if (flags.sendingEnabled === false) return 10_000; // האתר השהה את השליחה (הגדרות)

    const r = await client.next();
    if (!r?.job) return clamp(r?.retryInMs ?? idleMs, 1000, 15_000) + Math.round(Math.random() * 400);

    const job = r.job;
    const bad = checkJob(job);
    if (bad) { outbox.begin(job.id); outbox.finish(job.id, { ok: false, error: bad, permanent: true }); await outbox.flush(client); return 200; }
    if (outbox.hasSent(job.id)) { // האתר החכיר שוב משימה שכבר נשלחה (הדיווח הקודם לא הגיע)
      outbox.begin(job.id); outbox.finish(job.id, { ok: true }); await outbox.flush(client); return 200;
    }

    outbox.begin(job.id);
    try {
      await adapter.send(job.to, job.text, { typingMs: job.typingMs });
      outbox.finish(job.id, { ok: true });
      log.info(`נשלחה משימה ${job.id} אל ${hint(job.to)}`);
    } catch (e) {
      outbox.finish(job.id, { ok: false, error: e.message || "שגיאה", permanent: !!e.permanent });
      log.warn(`משימה ${job.id} נכשלה: ${e.message}${e.permanent ? " (סופי)" : ""}`);
    }
    await outbox.flush(client);
    return 300;
  }

  const done = (async () => {
    outbox.recover();
    let wait = 0;
    while (!signal.aborted) {
      await Promise.race([sleep(wait, signal), new Promise((r) => { wakeNow = r; })]);
      wakeNow = null;
      if (signal.aborted) break;
      try {
        wait = await once();
      } catch (e) {
        if (e instanceof AuthError) return onAuthError(e);
        log.debug(`שאיבה נכשלה: ${e.message}`);
        wait = Math.max(idleMs, 5000);
      }
    }
  })();

  return { done };
}

// לולאת פעימת חיים: מדווחת לאתר את מצב החיבור (וה-QR כשצריך סריקה), ומסנכרנת רשימת קבוצות.
import { AuthError } from "../site-client.js";
import { sleep } from "../humanize.js";

/** ctx: { adapter, client, log, flags, signal, onAuthError } */
export function startHeartbeat(ctx, { intervalMs = 5000, groupsEveryMs = 10 * 60_000 } = {}) {
  const { adapter, client, log, flags, signal, onAuthError } = ctx;
  let poke = () => {};
  let lastGroups = 0;
  let wasConnected = false;
  let lastErr = "";

  async function beat() {
    const s = adapter.getState();
    const body = { state: s.state, version: flags.version || "1.0.0", ...(s.state === "qr" && s.qr ? { qr: s.qr } : {}), ...(s.account ? { account: s.account } : {}) };
    const res = await client.heartbeat(body);
    const was = flags.sendingEnabled !== false;
    flags.sendingEnabled = res?.sendingEnabled !== false;
    if (!was && flags.sendingEnabled) flags.onResume?.();
    lastErr = "";
    if (s.state === "connected" && (!wasConnected || Date.now() - lastGroups > groupsEveryMs)) {
      lastGroups = Date.now();
      try { await client.groups(await adapter.groups()); } catch (e) { if (e instanceof AuthError) throw e; log.debug("סנכרון קבוצות נכשל"); }
    }
    wasConnected = s.state === "connected";
  }

  // שינוי מצב (למשל QR חדש או התחברות) מדווח מיד, בלי לחכות לפעימה הבאה
  let dirty = false;
  let wake = null;
  poke = () => { dirty = true; wake?.(); };
  adapter.on("state", poke);

  const done = (async () => {
    while (!signal.aborted) {
      dirty = false;
      try {
        await beat();
      } catch (e) {
        if (e instanceof AuthError) return onAuthError(e);
        if (e.message !== lastErr) log.warn(`פעימת חיים נכשלה: ${e.message}`);
        lastErr = e.message;
      }
      if (dirty) { await sleep(300, signal); continue; } // המצב השתנה בזמן הדיווח
      await Promise.race([sleep(intervalMs, signal), new Promise((r) => { wake = r; })]);
      wake = null;
    }
  })();

  return { done, poke: () => poke(), stop: () => adapter.off("state", poke) };
}

/** פעימה אחרונה בכיבוי: האתר יודע מיד שהגשר ירד ולא ממתין 45 שניות */
export async function farewell(client) {
  try { await client.heartbeat({ state: "disconnected" }); } catch { /* האתר לא זמין, לא נורא */ }
}

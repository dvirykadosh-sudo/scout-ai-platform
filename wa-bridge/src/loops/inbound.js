// לולאת קבלה: מעבירה לאתר הודעות נכנסות. האתר מחליט (בוט, כללים, רישום הגעה) ומשים תשובה בתור השליחה.
import { AuthError } from "../site-client.js";
import { backoff, sleep } from "../humanize.js";

const MAX_SEEN = 500;
const MAX_PER_MIN = 90; // הגנה מפני הצפה (למשל קבוצה ערה מאוד)

/** ctx: { adapter, client, log, signal, onAuthError } */
export function startInbound(ctx) {
  const { adapter, client, log, signal, onAuthError } = ctx;
  const seen = new Set();
  let windowStart = Date.now();
  let count = 0;

  const duplicate = (id) => {
    if (!id) return false;
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
    return false;
  };

  const overLimit = () => {
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); count = 0; }
    return ++count > MAX_PER_MIN;
  };

  async function forward(m) {
    for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
      try { return await client.inbound(m); } catch (e) {
        if (e instanceof AuthError) return onAuthError(e);
        if (attempt < 2) await sleep(backoff(attempt, 1000, 5000), signal);
      }
    }
    log.warn("הודעה נכנסת לא הועברה לאתר (אין חיבור)");
  }

  const onMessage = (m) => {
    if (!m || m.fromMe || !m.text?.trim() || !m.from) return;
    if (duplicate(m.id)) return;
    if (overLimit()) return;
    forward({ ...(m.id ? { id: m.id } : {}), from: m.from, isGroup: !!m.isGroup, ...(m.groupId ? { groupId: m.groupId } : {}), text: m.text.slice(0, 4000), ...(m.name ? { name: m.name } : {}) });
  };

  adapter.on("message", onMessage);
  return { stop: () => adapter.off("message", onMessage) };
}

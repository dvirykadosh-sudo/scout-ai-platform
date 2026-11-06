// הגשר: חיבור הלולאות, פיקוח על המתאם (הפעלה מחדש עם המתנה גדלה) וכיבוי מסודר.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ConfigError, loadConfig } from "./config.js";
import { createLogger } from "./log.js";
import { SiteClient } from "./site-client.js";
import { Outbox } from "./outbox.js";
import { createAdapter } from "./adapters/index.js";
import { farewell, startHeartbeat } from "./loops/heartbeat.js";
import { startOutbound } from "./loops/outbound.js";
import { startInbound } from "./loops/inbound.js";
import { backoff, sleep } from "./humanize.js";

const STATE_HE = { starting: "מתחיל", qr: "ממתין לסריקת QR באתר", connected: "מחובר", disconnected: "מנותק", reconnecting: "מתחבר מחדש", conflict: "התנגשות (וואטסאפ ווב פתוח במקום אחר)" };

/** בונה גשר. כל התלויות מוזרקות כדי שאפשר יהיה לבדוק עם מתאם מדמה ושרת אמיתי בזיכרון. */
export function createBridge({ adapter, client, outbox, log, intervals = {} }) {
  const ctl = new AbortController();
  const flags = { sendingEnabled: true, version: "1.0.0" };
  const bridge = { fatal: null, finished: null };
  let stopped = false;
  let loops = {};
  let supervisor = null;

  const onAuthError = (e) => {
    bridge.fatal = e;
    log.error("אסימון הגשר לא תקין או שבוטל. צרו אסימון חדש באתר והריצו שוב את setup-bridge.bat");
    queueMicrotask(() => stop()); // לא מחכים כאן: הלולאה שקראה לנו חלק ממה ש-stop ממתין לו
  };
  const ctx = { adapter, client, outbox, log, flags, signal: ctl.signal, onAuthError };
  const aborted = new Promise((r) => ctl.signal.addEventListener("abort", r, { once: true }));

  /** מפעיל את המתאם; אם נפל או נסגר, מפעיל מחדש עם המתנה גדלה (5 שניות עד 2 דקות) */
  async function supervise() {
    let attempt = 0;
    while (!ctl.signal.aborted) {
      let onClosed;
      const closed = new Promise((r) => { onClosed = r; adapter.once("closed", r); });
      const t0 = Date.now();
      const started = adapter.start().then(() => "up", (e) => { log.error(`הפעלת וואטסאפ נכשלה: ${e.message}`); return "failed"; });
      const first = await Promise.race([started, closed.then(() => "closed"), aborted.then(() => "abort")]);
      if (first === "up") await Promise.race([closed, aborted]);
      adapter.off("closed", onClosed);
      if (ctl.signal.aborted) break;
      if (first === "up" && Date.now() - t0 > 60_000) attempt = 0; // היה יציב: מתחילים את ההמתנה מחדש
      log.warn("החיבור לוואטסאפ ירד. מתחבר מחדש...");
      try { await adapter.stop(); } catch { /* כבר סגור */ }
      adapter.setState("reconnecting");
      await sleep(backoff(attempt++, intervals.restartMs ?? 5000, 120_000), ctl.signal);
    }
  }

  function start() {
    loops = { heartbeat: startHeartbeat(ctx, intervals.heartbeat), outbound: startOutbound(ctx, intervals.outbound), inbound: startInbound(ctx) };
    supervisor = supervise();
    bridge.finished = new Promise((r) => { bridge.resolveFinished = r; });
    return bridge;
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    ctl.abort();
    loops.inbound?.stop();
    loops.heartbeat?.stop();
    await Promise.allSettled([loops.heartbeat?.done, loops.outbound?.done, supervisor]);
    await outbox.flush(client).catch(() => {});
    await farewell(client);
    await adapter.stop().catch(() => {});
    bridge.resolveFinished?.();
  }

  return Object.assign(bridge, { start, stop, flags });
}

async function main() {
  const bridgeDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  let config;
  try { config = loadConfig({ bridgeDir }); } catch (e) {
    console.error(`\n${e instanceof ConfigError ? e.message : e}\n`);
    process.exit(1);
  }
  const log = createLogger({ level: config.logLevel, secrets: [config.token] });
  const client = new SiteClient({ siteUrl: config.siteUrl, token: config.token });
  const adapter = createAdapter(config, log);
  adapter.on("state", (s) => log.info(`וואטסאפ: ${STATE_HE[s.state] || s.state}${s.state === "qr" ? ` (${config.siteUrl}/whatsapp)` : ""}`));
  process.on("unhandledRejection", (e) => log.error(`שגיאה לא צפויה: ${e?.message || e}`));
  process.on("uncaughtException", (e) => log.error(`שגיאה לא צפויה: ${e?.message || e}`));

  log.info(`גשר שבט מעוז מתחבר אל ${config.siteUrl} (מתאם: ${config.adapter}). לעצירה: Ctrl+C`);
  const bridge = createBridge({ adapter, client, outbox: new Outbox(config.outboxFile), log }).start();
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.once(sig, () => { log.info("נסגר..."); bridge.stop(); });
  await bridge.finished;
  process.exit(bridge.fatal ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

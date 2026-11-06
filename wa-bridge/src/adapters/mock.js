// מתאם הדמיה: בלי וואטסאפ אמיתי. משמש לבדיקות ולהדגמה (ADAPTER=mock): QR מדומה, חיבור, שליחה שנרשמת בזיכרון.
import { BaseAdapter, sendError } from "./base.js";

export class MockAdapter extends BaseAdapter {
  name = "mock";
  sent = [];
  failures = [];
  groupList = [];
  #timers = [];
  #n = 0;

  /** autoScanMs: אחרי כמה זמן "נסרק" ה-QR אוטומטית. null = ידנית עם scan() */
  constructor({ autoScanMs = null, qrDelayMs = 20, groups = [] } = {}) {
    super();
    this.autoScanMs = autoScanMs;
    this.qrDelayMs = qrDelayMs;
    this.groupList = groups;
  }

  async start() {
    this.setState("starting");
    this.#later(() => {
      this.setState("qr", { qr: `MOCK-QR-${++this.#n}-${Math.random().toString(36).slice(2, 12)}` });
      if (this.autoScanMs != null) this.#later(() => this.scan(), this.autoScanMs);
    }, this.qrDelayMs);
  }

  /** "סורקים" את ה-QR */
  scan() { this.setState("connected", { account: { hint: "0000", name: "הדמיה" } }); }
  disconnect(state = "disconnected") { this.setState(state); }

  async send(to, text, { typingMs = 0 } = {}) {
    if (this.getState().state !== "connected") throw sendError("וואטסאפ לא מחובר");
    if (this.failures.length) throw this.failures.shift();
    this.sent.push({ to, text, typingMs });
    return `mock-${this.sent.length}`;
  }

  simulateInbound({ from, text, isGroup = false, groupId, name = "" }) {
    this.emit("message", { id: `in-${Date.now()}-${++this.#n}`, from, isGroup, groupId, text, name });
  }
  simulateClose() { this.emit("closed"); }

  async groups() { return this.groupList; }

  async stop() {
    for (const t of this.#timers) clearTimeout(t);
    this.#timers = [];
    this.setState("disconnected");
  }

  #later(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref?.();
    this.#timers.push(t);
  }
}

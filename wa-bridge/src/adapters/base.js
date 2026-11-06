// חוזה אחיד לכל מתאם וואטסאפ. הלולאות מדברות רק עם החוזה הזה, ולכן אפשר להחליף ספרייה בלי לגעת בהן.
//
// אירועים:  "state" ({state, qr, account})   "message" ({id, from, isGroup, groupId, text, name})   "closed" (המתאם מת, צריך להפעיל מחדש)
// מצבים:    starting | qr | connected | disconnected | reconnecting | conflict
import { EventEmitter } from "node:events";

export class BaseAdapter extends EventEmitter {
  #s = { state: "starting", qr: null, account: null };

  getState() { return { ...this.#s }; }

  /** מעדכן מצב ומפיץ אירוע רק אם משהו השתנה. QR מוצג רק במצב qr, חשבון רק במצב connected. */
  setState(state, extra = {}) {
    const next = { state, qr: state === "qr" ? extra.qr ?? null : null, account: state === "connected" ? extra.account ?? null : null };
    const changed = next.state !== this.#s.state || next.qr !== this.#s.qr;
    this.#s = next;
    if (changed) this.emit("state", this.getState());
  }

  async start() { throw new Error("start לא ממומש"); }
  async stop() {}
  async send() { throw new Error("send לא ממומש"); }
  async groups() { return []; }
}

/** שגיאת שליחה. permanent = אין טעם לנסות שוב (מספר לא קיים וכד'). */
export function sendError(message, permanent = false) {
  return Object.assign(new Error(message), { permanent });
}

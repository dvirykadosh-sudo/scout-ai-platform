// מתאם OpenWA (@open-wa/wa-automate 5.x) – וואטסאפ ווב אמיתי דרך Chrome.
// חשוב: נכתב לפי ממשק הספרייה (typings גרסה 5.10.0) ונבדק מול מדמה בלבד, לא מול וואטסאפ אמיתי.
// כל קריאה לא-חיונית עטופה כך שאם הספרייה משתנה, הגשר לא נופל.
import { BaseAdapter, sendError } from "./base.js";
import { sleep, typingWait } from "../humanize.js";

const SESSION_ID = "maoz";
const MAX_QR = 90_000;
const PERMANENT = /not (a )?(valid|registered|on whatsapp|exist)|invalid (number|wid|id)|לא רשום/i;

// ---- פונקציות טהורות (נבדקות ביחידות) ----

/** מזהה וואטסאפ כמחרוזת: מקבל מחרוזת או אובייקט {_serialized} / {user, server} */
export function idStr(x) {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (typeof x._serialized === "string") return x._serialized;
  if (x.user && x.server) return `${x.user}@${x.server}`;
  return "";
}

/** מצב הספרייה (STATE) → מצב הגשר */
export function mapState(s) {
  switch (String(s || "").toUpperCase()) {
    case "CONNECTED": return "connected";
    case "CONFLICT": return "conflict";
    case "OPENING": case "PAIRING": return "reconnecting";
    default: return "disconnected";
  }
}

/** הודעה נכנסת מהספרייה → הצורה האחידה של הגשר. null = לא רלוונטית (שלי, סטטוס, לא טקסט, ערוץ). */
export function normalizeMessage(m) {
  if (!m || m.fromMe === true || m.isStatusV3) return null;
  if (m.type && m.type !== "chat") return null;
  const text = typeof m.body === "string" ? m.body.trim() : "";
  if (!text) return null;
  const chat = idStr(m.chatId) || idStr(m.chat?.id) || idStr(m.from);
  if (!chat || /@(broadcast|newsletter)$/.test(chat) || chat.startsWith("status@")) return null;
  const isGroup = m.isGroupMsg === true || chat.endsWith("@g.us");
  const from = isGroup ? idStr(m.author) || idStr(m.sender?.id) : idStr(m.sender?.id) || idStr(m.from);
  if (!from) return null;
  return {
    id: idStr(m.id) || undefined,
    from,
    isGroup,
    ...(isGroup ? { groupId: chat } : {}),
    text: text.slice(0, 4000),
    name: String(m.sender?.pushname || m.notifyName || "").slice(0, 60),
  };
}

/** תוצאת sendText → שגיאה אם נכשל (הספרייה מחזירה לפעמים false או מחרוזת שגיאה) */
export function checkSendResult(res) {
  if (!res || (typeof res === "string" && /^error/i.test(res))) {
    const msg = typeof res === "string" ? res.slice(0, 200) : "השליחה נכשלה";
    throw sendError(msg, PERMANENT.test(msg));
  }
  return res;
}

// ---- המתאם ----

export class OpenWaAdapter extends BaseAdapter {
  name = "openwa";
  #client = null;
  #watchdog = null;
  #stopping = false;

  constructor({ sessionDir, headless = true, chromePath = "", log, loader = () => import("@open-wa/wa-automate") }) {
    super();
    Object.assign(this, { sessionDir, headless, chromePath, log, loader });
  }

  /** מתחיל חיבור. מסתיים כשהחיבור הצליח (אחרי סריקת QR בפעם הראשונה) או נכשל בשגיאה. */
  async start() {
    this.#stopping = false;
    this.setState("starting");
    let mod;
    try { mod = await this.loader(); } catch { throw new Error("חבילת OpenWA לא מותקנת. הריצו npm install בתיקיית wa-bridge"); }
    const api = mod.create ? mod : mod.default;
    if (!api?.create) throw new Error("גרסת OpenWA לא נתמכת");

    api.ev?.on(`qr.${SESSION_ID}`, (qr) => {
      if (typeof qr === "string" && qr.length > 10 && qr.length <= MAX_QR) this.setState("qr", { qr });
    });

    this.#client = await api.create({
      sessionId: SESSION_ID,
      sessionDataPath: this.sessionDir,
      headless: this.headless,
      useChrome: true,
      ...(this.chromePath ? { executablePath: this.chromePath } : {}),
      qrTimeout: 0, // ממתינים לסריקה בלי הגבלת זמן
      authTimeout: 0,
      disableSpins: true,
      logConsole: false,
      popup: false,
      qrLogSkip: true,
      killProcessOnBrowserClose: false,
      restartOnCrash: false,
    });
    this.#wire(this.#client);
    await this.#markConnected();
    this.#startWatchdog();
  }

  #wire(c) {
    c.onMessage?.((m) => { const n = normalizeMessage(m); if (n) this.emit("message", n); });
    c.onStateChanged?.((s) => {
      if (this.#stopping) return;
      const st = mapState(s);
      if (st === "connected") this.#markConnected(); else this.setState(st);
    });
    c.onLogout?.(() => { this.log?.warn("החשבון נותק מוואטסאפ (Logout). צריך לסרוק QR מחדש"); this.emit("closed"); });
  }

  async #markConnected() {
    let hint = "", name = "";
    try { const n = String((await this.#client.getHostNumber?.()) || ""); hint = n.slice(-4); } catch { /* לא קריטי */ }
    try { name = String((await this.#client.getMe?.())?.pushname || ""); } catch { /* לא קריטי */ }
    this.setState("connected", { account: { hint, name } });
  }

  /** בודק כל דקה שהדפדפן עדיין חי. אחרי 3 כשלונות מבקש הפעלה מחדש. */
  #startWatchdog() {
    let fails = 0;
    this.#watchdog = setInterval(async () => {
      try { await this.#client.getConnectionState?.(); fails = 0; } catch { if (++fails >= 3 && !this.#stopping) { clearInterval(this.#watchdog); this.emit("closed"); } }
    }, 60_000);
    this.#watchdog.unref?.();
  }

  async send(to, text, { typingMs = 0 } = {}) {
    const c = this.#client;
    if (!c || this.getState().state !== "connected") throw sendError("וואטסאפ לא מחובר");
    if (to.endsWith("@c.us")) {
      try {
        const st = await c.checkNumberStatus?.(to);
        if (st && st.numberExists === false) throw sendError("המספר לא רשום בוואטסאפ", true);
      } catch (e) { if (e?.permanent) throw e; /* הבדיקה עצמה נכשלה: ממשיכים לשליחה */ }
    }
    try { await c.simulateTyping?.(to, true); } catch { /* אופציונלי */ }
    await sleep(typingWait(typingMs));
    let res;
    try { res = await c.sendText(to, text); } finally { try { await c.simulateTyping?.(to, false); } catch { /* אופציונלי */ } }
    return checkSendResult(res);
  }

  async groups() {
    const chats = (await this.#client?.getAllChats?.()) || [];
    return chats
      .map((ch) => ({ id: idStr(ch.id), name: String(ch.name || ch.formattedTitle || ""), size: ch.groupMetadata?.participants?.length || 0 }))
      .filter((g) => g.id.endsWith("@g.us"));
  }

  async stop() {
    this.#stopping = true;
    clearInterval(this.#watchdog);
    try { await this.#client?.kill?.(); } catch { /* כבר סגור */ }
    this.#client = null;
    this.setState("disconnected");
  }
}

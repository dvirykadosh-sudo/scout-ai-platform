// תיבת יוצא מקומית: מונעת שליחה כפולה כשהאתר לא זמין רגע אחרי שהודעה כבר נשלחה.
// נשמרת בקובץ: משימה בביצוע, דיווחים שממתינים לאתר, ומשימות שנשלחו (24 שעות).
import fs from "node:fs";
import path from "node:path";
import { AuthError, HttpError } from "./site-client.js";

const KEEP_SENT_MS = 24 * 3600_000;
const MAX_SENT = 500;
const MAX_PENDING = 200;

export class Outbox {
  constructor(file, { now = Date.now } = {}) {
    this.file = file;
    this.now = now;
    this.data = { inflight: null, pending: [], sent: {} };
    if (file) this.#load();
  }

  #load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.data = { inflight: d.inflight ?? null, pending: Array.isArray(d.pending) ? d.pending : [], sent: d.sent && typeof d.sent === "object" ? d.sent : {} };
    } catch { /* קובץ חסר או פגום: מתחילים נקי */ }
  }

  #save() {
    if (!this.file) return;
    const t = this.now();
    for (const [id, at] of Object.entries(this.data.sent)) if (t - at > KEEP_SENT_MS) delete this.data.sent[id];
    const ids = Object.keys(this.data.sent);
    if (ids.length > MAX_SENT) for (const id of ids.sort((a, b) => this.data.sent[a] - this.data.sent[b]).slice(0, ids.length - MAX_SENT)) delete this.data.sent[id];
    if (this.data.pending.length > MAX_PENDING) this.data.pending = this.data.pending.slice(-MAX_PENDING);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data), { mode: 0o600 });
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch { /* כתיבה נכשלה: ממשיכים בזיכרון */ }
  }

  /** אחרי הפעלה מחדש: אם הגשר נעצר באמצע שליחה, לא יודעים אם יצאה. מדווחים ככשל סופי כדי שלא תישלח פעמיים. */
  recover() {
    const id = this.data.inflight;
    if (id == null) return null;
    this.data.inflight = null;
    this.data.pending.push({ jobId: id, ok: false, permanent: true, error: "הגשר נעצר באמצע השליחה, לא ברור אם ההודעה יצאה. בדקו ושלחו שוב ידנית אם צריך" });
    this.#save();
    return id;
  }

  begin(jobId) { this.data.inflight = jobId; this.#save(); }

  finish(jobId, { ok, error, permanent }) {
    this.data.inflight = null;
    if (ok) this.data.sent[jobId] = this.now();
    this.data.pending.push({ jobId, ok: !!ok, ...(error ? { error: String(error).slice(0, 300) } : {}), ...(permanent ? { permanent: true } : {}) });
    this.#save();
  }

  hasSent(jobId) { return jobId in this.data.sent; }
  pending() { return [...this.data.pending]; }

  /** מדווח לאתר מה שממתין. נעצר בשגיאת רשת ומשאיר לניסיון הבא. 409 = האתר כבר לא מחזיק במשימה: מסירים. */
  async flush(client) {
    for (const p of this.pending()) {
      try {
        await client.result(p);
      } catch (e) {
        if (e instanceof AuthError) throw e;
        if (!(e instanceof HttpError && [409, 400].includes(e.status))) return false;
      }
      this.data.pending = this.data.pending.filter((x) => x !== p && x.jobId !== p.jobId);
      this.#save();
    }
    return true;
  }
}

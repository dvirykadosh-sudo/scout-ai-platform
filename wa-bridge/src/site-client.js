// לקוח HTTP לנתיבי הגשר באתר. שולח את האסימון בכותרת בלבד ולא מדפיס אותו.

export class AuthError extends Error {}
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class NetworkError extends Error {}

export class SiteClient {
  constructor({ siteUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 15_000 }) {
    this.base = siteUrl.replace(/\/$/, "");
    this.token = token;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async #call(method, path, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(this.base + path, {
        method,
        headers: { "content-type": "application/json", "x-maoz-bridge": this.token },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
        redirect: "error", // שלא יעקוב אחרי הפניה לאתר אחר עם האסימון
      });
    } catch (e) {
      throw new NetworkError(e?.name === "AbortError" ? "תם הזמן לבקשה לאתר" : "אין חיבור לאתר");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new AuthError("אסימון הגשר לא תקין או שבוטל");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, data?.error?.message || `שגיאה ${res.status}`);
    return data;
  }

  heartbeat(state) { return this.#call("POST", "/api/wa/bridge/heartbeat", state); }
  next() { return this.#call("GET", "/api/wa/bridge/next"); }
  result(r) { return this.#call("POST", "/api/wa/bridge/result", r); }
  inbound(m) { return this.#call("POST", "/api/wa/bridge/inbound", m); }
  groups(groups) { return this.#call("POST", "/api/wa/bridge/groups", { groups }); }
}

// בדיקות יחידה לגשר: הגדרות, נרמול הודעות של OpenWA, תיבת יוצא, זמני המתנה, לקוח האתר.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { ConfigError, cleanSiteUrl, loadConfig, parseEnv } from "../src/config.js";
import { backoff, clamp, sleep } from "../src/humanize.js";
import { checkJob } from "../src/loops/outbound.js";
import { Outbox } from "../src/outbox.js";
import { AuthError, HttpError, NetworkError, SiteClient } from "../src/site-client.js";
import { checkSendResult, idStr, mapState, normalizeMessage } from "../src/adapters/openwa.js";
import { OpenWaAdapter } from "../src/adapters/openwa.js";
import { createLogger, hint } from "../src/log.js";

const TOKEN = "wb_" + "a1".repeat(24);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "wab-"));

describe("הגדרות", () => {
  it("מפענח .env עם הערות וגרשיים", () => {
    assert.deepEqual(parseEnv("# הערה\nA=1\n B = \"x y\" \n\nC='z'\nבלי שווה"), { A: "1", B: "x y", C: "z" });
  });
  it("דורש https חוץ מ-localhost", () => {
    assert.equal(cleanSiteUrl("https://shevet-maoz-app.onrender.com/"), "https://shevet-maoz-app.onrender.com");
    assert.equal(cleanSiteUrl("http://localhost:4000"), "http://localhost:4000");
    for (const bad of ["http://example.com", "ftp://x.y", "לא כתובת", ""]) assert.throws(() => cleanSiteUrl(bad), ConfigError, bad);
  });
  it("טוען הגדרות, בודק אסימון, ומשתני סביבה גוברים על קובץ", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, ".env"), `SITE_URL=https://a.example.com\nBRIDGE_TOKEN=${TOKEN}\nADAPTER=mock\n`);
    const c = loadConfig({ env: {}, bridgeDir: tmp(), dataDirOverride: dir });
    assert.equal(c.adapter, "mock");
    assert.equal(c.headless, true);
    assert.equal(c.sessionDir, path.join(dir, "session"));
    assert.equal(loadConfig({ env: { ADAPTER: "openwa", SHOW_BROWSER: "true" }, bridgeDir: tmp(), dataDirOverride: dir }).headless, false);
    assert.throws(() => loadConfig({ env: { BRIDGE_TOKEN: "wb_קצר" }, bridgeDir: tmp(), dataDirOverride: dir }), ConfigError);
    assert.throws(() => loadConfig({ env: {}, bridgeDir: tmp(), dataDirOverride: tmp() }), /חסרות הגדרות/);
  });
});

describe("נרמול הודעות OpenWA", () => {
  it("הודעה פרטית רגילה", () => {
    const m = normalizeMessage({ id: "false_972521234567@c.us_ABC", type: "chat", body: " שלום ", from: "972521234567@c.us", sender: { id: "972521234567@c.us", pushname: "נועה" }, isGroupMsg: false });
    assert.deepEqual(m, { id: "false_972521234567@c.us_ABC", from: "972521234567@c.us", isGroup: false, text: "שלום", name: "נועה" });
  });
  it("הודעת קבוצה: השולח הוא author והקבוצה ב-chatId", () => {
    const m = normalizeMessage({ id: "g1", type: "chat", body: "!מעוז עזרה", from: "120363012345678901@g.us", chatId: "120363012345678901@g.us", author: "972521234567@c.us", isGroupMsg: true });
    assert.equal(m.from, "972521234567@c.us");
    assert.equal(m.groupId, "120363012345678901@g.us");
    assert.equal(m.isGroup, true);
  });
  it("מתעלם מהודעות שלי, סטטוסים, ערוצים, תמונות והודעות ריקות", () => {
    const base = { type: "chat", body: "היי", from: "972521234567@c.us" };
    for (const bad of [{ ...base, fromMe: true }, { ...base, from: "status@broadcast" }, { ...base, from: "1203@newsletter" }, { ...base, type: "image" }, { ...base, body: "   " }, { ...base, isStatusV3: true }, null, {}]) assert.equal(normalizeMessage(bad), null);
  });
  it("טקסט ארוך נחתך, ומזהה כאובייקט מפוענח", () => {
    assert.equal(normalizeMessage({ type: "chat", body: "א".repeat(9000), from: "972521234567@c.us" }).text.length, 4000);
    assert.equal(idStr({ _serialized: "x@c.us" }), "x@c.us");
    assert.equal(idStr({ user: "972521234567", server: "c.us" }), "972521234567@c.us");
    assert.equal(idStr(null), "");
  });
  it("מיפוי מצבים ותוצאת שליחה", () => {
    assert.deepEqual(["CONNECTED", "CONFLICT", "OPENING", "UNPAIRED", "TIMEOUT", ""].map(mapState), ["connected", "conflict", "reconnecting", "disconnected", "disconnected", "disconnected"]);
    assert.equal(checkSendResult("true_972521234567@c.us_XYZ"), "true_972521234567@c.us_XYZ");
    assert.throws(() => checkSendResult(false), /נכשלה/);
    assert.throws(() => checkSendResult("ERROR: not a valid number"), (e) => e.permanent === true);
    assert.throws(() => checkSendResult("Error: timeout"), (e) => e.permanent === false);
  });
});

describe("מתאם OpenWA מול ספרייה מדומה", () => {
  const fakeLib = () => {
    const handlers = {};
    const calls = [];
    const client = {
      onMessage: (f) => { handlers.message = f; },
      onStateChanged: (f) => { handlers.state = f; },
      onLogout: (f) => { handlers.logout = f; },
      getHostNumber: async () => "972521234567",
      getMe: async () => ({ pushname: "שבט" }),
      getConnectionState: async () => "CONNECTED",
      checkNumberStatus: async (to) => ({ numberExists: !to.startsWith("972500") }),
      simulateTyping: async () => {},
      sendText: async (to, text) => { calls.push([to, text]); return "true_id"; },
      getAllChats: async () => [{ id: { _serialized: "120363012345678901@g.us" }, name: "גדוד", groupMetadata: { participants: [1, 2, 3] } }, { id: "972521234567@c.us", name: "נועה" }],
      kill: async () => {},
    };
    const listeners = {};
    const lib = { ev: { on: (k, f) => { listeners[k] = f; } }, create: (opts) => new Promise((r) => { lib.opts = opts; lib.finish = () => r(client); }) }; // create מסתיים רק אחרי הסריקה
    return { lib, handlers, calls, listeners };
  };

  it("QR, חיבור, שליחה, קבוצות והודעה נכנסת", async () => {
    const f = fakeLib();
    const a = new OpenWaAdapter({ sessionDir: "/x", headless: true, loader: async () => f.lib });
    const states = [];
    a.on("state", (s) => states.push(s.state));
    const p = a.start();
    await new Promise((r) => setImmediate(r));
    f.listeners["qr.maoz"]("data:image/png;base64,AAAA" + "A".repeat(20));
    assert.equal(a.getState().state, "qr");
    f.lib.finish();
    await p;
    assert.deepEqual(states, ["qr", "connected"]);
    assert.equal(a.getState().account.hint, "4567");
    assert.equal(f.lib.opts.qrTimeout, 0);
    assert.equal(f.lib.opts.killProcessOnBrowserClose, false);
    await a.send("972521234567@c.us", "היי", { typingMs: 5 });
    assert.deepEqual(f.calls, [["972521234567@c.us", "היי"]]);
    await assert.rejects(a.send("972500000000@c.us", "x"), (e) => e.permanent === true && /לא רשום/.test(e.message));
    assert.deepEqual(await a.groups(), [{ id: "120363012345678901@g.us", name: "גדוד", size: 3 }]);
    const got = new Promise((r) => a.once("message", r));
    f.handlers.message({ id: "m1", type: "chat", body: "הסר", from: "972521234567@c.us" });
    assert.equal((await got).text, "הסר");
    f.handlers.state("CONFLICT");
    assert.equal(a.getState().state, "conflict");
    const closed = new Promise((r) => a.once("closed", r));
    f.handlers.logout();
    await closed;
    await a.stop();
  });

  it("חבילה חסרה: שגיאה ברורה בעברית", async () => {
    const a = new OpenWaAdapter({ sessionDir: "/x", loader: async () => { throw new Error("Cannot find package"); } });
    await assert.rejects(a.start(), /npm install/);
  });
});

describe("תיבת יוצא", () => {
  it("שומרת בקובץ וטוענת מחדש", () => {
    const file = path.join(tmp(), "outbox.json");
    const o = new Outbox(file);
    o.begin(7);
    o.finish(7, { ok: true });
    const again = new Outbox(file);
    assert.ok(again.hasSent(7));
    assert.deepEqual(again.pending(), [{ jobId: 7, ok: true }]);
  });
  it("אחרי קריסה באמצע שליחה: מדווחת כשל סופי ולא שולחת שוב", () => {
    const file = path.join(tmp(), "outbox.json");
    new Outbox(file).begin(9);
    const o = new Outbox(file);
    assert.equal(o.recover(), 9);
    assert.equal(o.pending()[0].permanent, true);
    assert.equal(o.pending()[0].ok, false);
    assert.equal(o.recover(), null);
  });
  it("flush: נעצר בשגיאת רשת ומשאיר, מוריד על 409, מעביר שגיאת אסימון", async () => {
    const o = new Outbox(null);
    for (const id of [1, 2, 3]) { o.begin(id); o.finish(id, { ok: true }); }
    const seen = [];
    const client = { result: async (p) => { seen.push(p.jobId); if (p.jobId === 1) throw new HttpError(409, "x"); if (p.jobId === 2) throw new NetworkError("down"); } };
    assert.equal(await o.flush(client), false);
    assert.deepEqual(seen, [1, 2]);
    assert.deepEqual(o.pending().map((p) => p.jobId), [2, 3]);
    assert.equal(await o.flush({ result: async () => {} }), true);
    assert.equal(o.pending().length, 0);
    o.begin(4); o.finish(4, { ok: false });
    await assert.rejects(o.flush({ result: async () => { throw new AuthError("x"); } }), AuthError);
  });
  it("קובץ פגום לא מפיל", () => {
    const file = path.join(tmp(), "outbox.json");
    fs.writeFileSync(file, "{לא json");
    assert.deepEqual(new Outbox(file).pending(), []);
  });
});

describe("משימות, זמנים ולוג", () => {
  it("checkJob דוחה יעד או נוסח לא תקינים", () => {
    assert.equal(checkJob({ id: 1, to: "972521234567@c.us", text: "שלום" }), null);
    assert.equal(checkJob({ id: 1, to: "120363012345678901@g.us", text: "שלום" }), null);
    for (const bad of [{ id: "1", to: "972521234567@c.us", text: "x" }, { id: 1, to: "evil@example.com", text: "x" }, { id: 1, to: "972521234567@c.us", text: "  " }, { id: 1, to: "972521234567@c.us", text: "x".repeat(5000) }, null]) assert.ok(checkJob(bad), JSON.stringify(bad));
  });
  it("backoff גדל עם תקרה, clamp חותך, sleep מתבטל", async () => {
    const r = () => 0.5;
    assert.deepEqual([0, 1, 2, 10].map((n) => backoff(n, 1000, 8000, r)), [1050, 2100, 4200, 8400]);
    assert.equal(clamp(99999, 0, 20000), 20000);
    assert.equal(clamp("abc", 5, 9), 5);
    const ctl = new AbortController();
    const p = sleep(10_000, ctl.signal);
    ctl.abort();
    assert.equal(await p, false);
  });
  it("הלוג מסתיר אסימון ומספר", () => {
    const lines = [];
    const log = createLogger({ secrets: [TOKEN], out: { log: (s) => lines.push(s), warn: (s) => lines.push(s), error: (s) => lines.push(s) } });
    log.info(`token ${TOKEN} נשלח`);
    assert.ok(!lines[0].includes(TOKEN));
    assert.equal(hint("972521234567@c.us"), "…4567");
    assert.equal(hint("120363012345678901@g.us"), "קבוצה");
  });
});

describe("לקוח האתר", () => {
  const fakeFetch = (status, body) => async (url, init) => ({ status, ok: status < 400, json: async () => body, url, init });
  it("שולח את האסימון בכותרת בלבד ולא בכתובת", async () => {
    let seen;
    const c = new SiteClient({ siteUrl: "https://x.example.com/", token: TOKEN, fetchImpl: async (u, i) => { seen = { u, i }; return { status: 200, ok: true, json: async () => ({ ok: true }) }; } });
    await c.heartbeat({ state: "qr" });
    assert.equal(seen.u, "https://x.example.com/api/wa/bridge/heartbeat");
    assert.equal(seen.i.headers["x-maoz-bridge"], TOKEN);
    assert.ok(!seen.u.includes(TOKEN));
    assert.equal(seen.i.redirect, "error");
  });
  it("401 = AuthError, שגיאת שרת = HttpError, נפילת רשת = NetworkError", async () => {
    await assert.rejects(new SiteClient({ siteUrl: "https://x.y", token: TOKEN, fetchImpl: fakeFetch(401, {}) }).next(), AuthError);
    await assert.rejects(new SiteClient({ siteUrl: "https://x.y", token: TOKEN, fetchImpl: fakeFetch(409, { error: { message: "לא חכורה" } }) }).result({}), (e) => e instanceof HttpError && e.status === 409 && e.message === "לא חכורה");
    await assert.rejects(new SiteClient({ siteUrl: "https://x.y", token: TOKEN, fetchImpl: async () => { throw new TypeError("fetch failed"); } }).next(), NetworkError);
  });
});

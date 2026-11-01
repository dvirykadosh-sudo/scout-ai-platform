"use client";

// שלב 54: ניטור בצד הלקוח. לכידת שגיאות (429), מדדי ביצועים (430), סנכרון לשוניות (436),
// אזהרת פקיעת התחברות (435), מסך ער בהצגה (451) ומעבר עדין בין דפים (441).
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, ApiError, api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";

export function reportClientError(message: string, stack?: string) {
  try {
    void fetch(`${API_URL}/api/client-error`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: String(message).slice(0, 500), stack: stack?.slice(0, 2500), page: window.location.pathname }), keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

const tokenExp = (t: string | null): number | null => {
  try {
    if (!t) return null;
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return p.exp ? p.exp * 1000 : null;
  } catch { return null; }
};

const SESSION_KEY = "scout.session";
const TAB = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

export function SiteMonitor() {
  const { token, user, setSession, clear } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const [warn, setWarn] = useState(false);
  const [left, setLeft] = useState(0);
  const chan = useRef<BroadcastChannel | null>(null);
  const remote = useRef(false);
  const lastUser = useRef<number | null>(null);
  const firstPage = useRef(typeof window !== "undefined" ? window.location.pathname : "/");

  /* 429: שגיאות שלא נתפסו */
  useEffect(() => {
    let sent = 0;
    const send = (m: string, s?: string) => { if (sent++ < 5) reportClientError(m, s); };
    const onErr = (e: ErrorEvent) => { if (!e.message || /ResizeObserver|Script error|Non-Error promise/i.test(e.message)) return; send(e.message, e.error?.stack); };
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string; stack?: string } | undefined;
      if (r instanceof ApiError && r.status < 500) return;
      if (r instanceof ApiError && r.status === 0) return;
      if (r?.name === "AbortError") return;
      send(String(r?.message ?? r), r?.stack);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);

  /* 430: מדדי ביצועים אמיתיים, נשלחים פעם אחת כשהדף נסגר או מוסתר */
  useEffect(() => {
    if (!("PerformanceObserver" in window)) return;
    const m: Record<string, number> = {};
    let cls = 0, inp = 0, sent = false;
    const obs: PerformanceObserver[] = [];
    const watch = (type: string, cb: (e: PerformanceEntry & Record<string, number | boolean>) => void, extra: object = {}) => {
      try {
        const o = new PerformanceObserver((l) => l.getEntries().forEach((e) => cb(e as never)));
        o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        obs.push(o);
      } catch { /* לא נתמך */ }
    };
    watch("largest-contentful-paint", (e) => { m.LCP = e.startTime; });
    watch("paint", (e) => { if (e.name === "first-contentful-paint") m.FCP = e.startTime; });
    watch("layout-shift", (e) => { if (!e.hadRecentInput) { cls += e.value as number; m.CLS = cls; } });
    watch("event", (e) => { if (e.interactionId && e.duration > inp) { inp = e.duration; m.INP = inp; } }, { durationThreshold: 40 });
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.responseStart) m.TTFB = nav.responseStart;
    const flush = () => {
      if (sent) return;
      const metrics = Object.entries(m).map(([metric, value]) => ({ metric, value: Math.round(value * 1000) / 1000, page: firstPage.current }));
      if (!metrics.length) return;
      sent = true;
      void fetch(`${API_URL}/api/vitals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics }), keepalive: true }).catch(() => {});
    };
    const vis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", flush); obs.forEach((o) => o.disconnect()); };
  }, []);

  /* 436: סנכרון בין לשוניות: התחברות, התנתקות, ועריכה כפולה של אותו מסמך */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel("scout-sync");
    chan.current = c;
    c.onmessage = (ev: MessageEvent<{ t: string; tab: string; doc?: string }>) => {
      const d = ev.data;
      if (!d || d.tab === TAB) return;
      if (d.t === "logout") { remote.current = true; clear(); toast("התנתקתם בלשונית אחרת, ולכן גם כאן.", { kind: "info" }); }
      if (d.t === "login") {
        try {
          const raw = window.localStorage.getItem(SESSION_KEY);
          const s = raw ? (JSON.parse(raw) as { token: string; user: Parameters<typeof setSession>[1] }) : null;
          if (s?.token && s.user) { remote.current = true; setSession(s.token, s.user); }
        } catch { /* ignore */ }
      }
      if (d.t === "doc-open" && d.doc && window.location.pathname === `/write/${d.doc}`) {
        toast("המסמך הזה פתוח גם בלשונית אחרת. עריכה בשתיהן יחד עלולה לדרוס שינויים.", { kind: "error" });
        c.postMessage({ t: "doc-here", tab: TAB, doc: d.doc });
      }
      if (d.t === "doc-here" && d.doc && window.location.pathname === `/write/${d.doc}`) toast("המסמך הזה פתוח גם בלשונית אחרת. עריכה בשתיהן יחד עלולה לדרוס שינויים.", { kind: "error" });
    };
    return () => { c.close(); chan.current = null; };
  }, [clear, setSession, toast]);
  useEffect(() => {
    const id = user?.id ?? null;
    if (lastUser.current !== id) {
      if (!remote.current) chan.current?.postMessage({ t: id ? "login" : lastUser.current ? "logout" : "", tab: TAB });
      remote.current = false;
      lastUser.current = id;
    }
  }, [user]);
  useEffect(() => {
    const m = pathname.match(/^\/write\/(\d+)$/);
    if (m) chan.current?.postMessage({ t: "doc-open", tab: TAB, doc: m[1] });
  }, [pathname]);

  /* 435: אזהרה לפני פקיעת ההתחברות */
  useEffect(() => {
    if (!token) { setWarn(false); return; }
    const tick = () => {
      const exp = tokenExp(token);
      if (!exp) return;
      const ms = exp - Date.now();
      setLeft(Math.max(0, Math.round(ms / 60000)));
      setWarn(ms > 0 && ms <= 10 * 60_000);
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [token]);
  const extend = useCallback(async () => {
    try {
      const r = await api<{ token: string }>("/api/auth/extend", { method: "POST", token, body: {} });
      if (user) setSession(r.token, user);
      setWarn(false);
      toast("נשארתם מחוברים.", { kind: "success" });
    } catch (e) { toast(errorMessage(e), { kind: "error" }); }
  }, [token, user, setSession, toast]);

  /* 441: מעבר עדין בין דפים */
  useEffect(() => {
    const el = document.getElementById("main");
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("route-in");
    void el.offsetWidth;
    el.classList.add("route-in");
    const id = window.setTimeout(() => el.classList.remove("route-in"), 400);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (!warn) return null;
  return (
    <div className="session-warn card" role="alertdialog" aria-labelledby="sw-t" aria-describedby="sw-d">
      <p id="sw-t"><strong>ההתחברות עומדת לפוג</strong></p>
      <p id="sw-d">נשארו {left <= 1 ? "פחות מדקה" : `כ-${left} דקות`}. אפשר להישאר מחוברים בלי לאבד עבודה.</p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => void extend()}>הישארו מחוברים</button>
        <button type="button" className="btn" onClick={() => clear()}>התנתקות</button>
      </div>
    </div>
  );
}

/** 451: מסך ער בזמן הצגה, כדי שהטלפון לא יכבה באמצע פעולה. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const take = () => { navigator.wakeLock.request("screen").then((l) => { if (dead) void l.release(); else lock = l; }).catch(() => {}); };
    take();
    const vis = () => { if (document.visibilityState === "visible" && (!lock || lock.released)) take(); };
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => {}); };
  }, [active]);
}

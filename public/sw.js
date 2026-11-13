/* Service worker: lets saved activities and the field mode work without a signal. */
// שלב 64: v3. הגרסה החדשה מוחקת מטמונים ישנים שאולי שמרו תשובות אישיות. לא שומרים בקשות עם Authorization או תשובות private/no-store, והמטמון מוגבל בגודל.
const VERSION = "v3";
const MAX_ENTRIES = 60;
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OK_API = [/^\/api\/activities\/\d+$/, /^\/api\/meta$/];

self.addEventListener("install", () => self.skipWaiting());
// התנתקות: מוחקים את מטמון הדפים והתשובות
self.addEventListener("message", (e) => {
  if (e.data === "clear-private") e.waitUntil(caches.delete(PAGES));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const shareable = (req, res) => {
  if (!res || !res.ok || res.status !== 200) return false;
  if (req.headers.has("authorization")) return false;
  return !/no-store|private/i.test(res.headers.get("cache-control") || "");
};

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (shareable(req, res)) cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (shareable(req, res)) cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const p = url.pathname;
  // וידאו וכתוביות: לא עוברים דרך ה-service worker (בקשות טווח ו-206 לא נשמרות במטמון)
  if (req.headers.has("range") || /\.(mp4|vtt|webm|mp3)$/i.test(p)) return;
  if (p.startsWith("/api/")) {
    // בקשה עם הרשאה (משתמש מחובר) עוברת ישר לרשת ולא נשמרת ולא מוגשת ממטמון
    if (!req.headers.has("authorization") && OK_API.some((r) => r.test(p))) e.respondWith(networkFirst(req, PAGES));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (p.startsWith("/_next/static/")) return void e.respondWith(cacheFirst(req));
  if (p.startsWith("/_next/")) return;
  e.respondWith(networkFirst(req, PAGES));
});

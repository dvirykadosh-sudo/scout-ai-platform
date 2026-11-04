/* Service worker: lets saved activities and the field mode work without a signal. */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OK_API = [/^\/api\/activities\/\d+$/, /^\/api\/meta$/];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
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
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const p = url.pathname;
  if (p.startsWith("/api/")) {
    if (OK_API.some((r) => r.test(p))) e.respondWith(networkFirst(req, PAGES));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (p.startsWith("/_next/static/")) return void e.respondWith(cacheFirst(req));
  if (p.startsWith("/_next/")) return;
  e.respondWith(networkFirst(req, PAGES));
});

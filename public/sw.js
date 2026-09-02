/* Superstore Health Suite offline shell.
 *
 * Deliberately never cache /api, /edge-api, or any authenticated response.
 * API payloads can contain clinical and financial data; operational snapshots
 * are owned by the application and are separately scoped to the signed-in
 * tenant/user.  This worker only retains static assets and safe route shells.
 */
const VERSION = "2026-09-02-1";
const STATIC_CACHE = `superstore-static-${VERSION}`;
const RUNTIME_CACHE = `superstore-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const TENANT_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OFFLINE_ROUTE = new RegExp(`^/t/${TENANT_ID}/(?:pos|inventory|sync)/?$`, "i");

function isSafeDocument(url) {
  return url.pathname === "/" || OFFLINE_ROUTE.test(url.pathname);
}

function clearRuntimeCaches() {
  return caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("superstore-runtime-"))
    .map((key) => caches.delete(key))));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("superstore-") && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "superstore:purge-offline-data") event.waitUntil(clearRuntimeCaches());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API traffic, including same-origin Next rewrites.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/edge-api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && isSafeDocument(url)) {
        const copy = response.clone();
        event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL))));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())));
      return response;
    })));
  }
});

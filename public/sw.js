/* Superstore Health Suite offline shell.
 *
 * Deliberately never cache /api, /edge-api, or any authenticated response.
 * API payloads can contain clinical and financial data. This worker retains
 * only static assets and the generic offline page.
 */
const VERSION = "2026-09-07-1";
const STATIC_CACHE = `superstore-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

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
  const url = new URL(request.url);

  // Never proxy or modify cross-origin requests. In particular, adding
  // ngrok's opt-out header here turns a browser request into a CORS
  // preflight, which a free ngrok endpoint can reject before the API sees it.
  // Production browser traffic uses the same-origin /edge-api rewrite.
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.method !== "GET") return;
  // Never cache API traffic, including same-origin Next rewrites.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/edge-api/")) return;

  if (request.mode === "navigate") {
    // Authenticated route documents can contain account-specific markup.
    // Never retain them in Cache Storage; only the generic offline page is
    // available when navigation cannot reach the network.
    event.respondWith(fetch(request).catch(async () => await caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      // Clone before returning the response to the browser. Deferring clone()
      // until the cache opens races the browser's body consumption.
      if (response.ok) {
        const cacheCopy = response.clone();
        event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, cacheCopy)));
      }
      return response;
    })));
  }
});

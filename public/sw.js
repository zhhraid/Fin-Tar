// FinTar service worker: keeps the app shell available offline.
// API calls (Finix, receipt scan) always go to the network.
const CACHE = "fintar-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const store = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };

  // Pages: fresh from the network, cached copy when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(store).catch(() => caches.match(request).then((hit) => hit || caches.match("/"))));
    return;
  }
  // Static files: cached copy first, refreshed in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request).then(store).catch(() => hit);
      return hit || fresh;
    }),
  );
});

// public/sw.js
// Caches the app shell so the interface itself loads with no connection.
// Actual data always lives in IndexedDB (see js/db.js), not in this cache.
const CACHE_NAME = "clearway-shell-v1";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/admin.html",
  "/css/styles.css",
  "/js/db.js",
  "/js/api.js",
  "/js/sync.js",
  "/js/app.js",
  "/js/admin.js",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for API calls (so data is fresh when online), cache-first
// for the app shell (so the UI itself always loads instantly, offline too).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ offline: true }), { headers: { "Content-Type": "application/json" } })));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return res;
    }).catch(() => cached))
  );
});

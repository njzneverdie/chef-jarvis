const CACHE = "chef-jarvis-20260717-risk-hardening-3";
const CORE = [
  "/",
  "/index.html",
  "/styles.css?v=20260717-risk-hardening-3",
  "/guided-cooking.css?v=20260717-risk-hardening-3",
  "/chef-mode.css?v=20260717-risk-hardening-3",
  "/shopping-list.css?v=20260717-risk-hardening-3",
  "/usda-reference.css?v=20260717-risk-hardening-3",
  "/personalized-swaps.css?v=20260717-risk-hardening-3",
  "/plan-persistence.css?v=20260717-risk-hardening-3",
  "/shopping-page.css?v=20260717-risk-hardening-3",
  "/product-features.css?v=20260717-risk-hardening-3",
  "/i18n.js?v=20260717-risk-hardening-3",
  "/domain.js?v=20260717-risk-hardening-3",
  "/boot.js?v=20260717-risk-hardening-3",
  "/vendor/supabase-2.110.5.min.js",
  "/app.js?v=20260717-risk-hardening-3",
  "/chef-mode.js?v=20260717-risk-hardening-3",
  "/manifest.webmanifest?v=20260717-risk-hardening-3",
  "/fonts/dm-serif-display-latin-400.woff2",
  "/fonts/dm-serif-display-latin-400-italic.woff2",
  "/fonts/manrope-latin-400-800.woff2",
  "/chef-jarvis-icon-192.png?v=20260717-risk-hardening-3",
  "/apple-touch-icon.png?v=20260717-risk-hardening-3",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const results = await Promise.allSettled(
        CORE.map((asset) => cache.add(asset)),
      );
      const failed = results
        .map((result, index) => (result.status === "rejected" ? CORE[index] : null))
        .filter(Boolean);
      if (failed.length) {
        await caches.delete(CACHE);
        throw new Error(
          `Offline update was not installed because required assets failed: ${failed.join(", ")}`,
        );
      }
      await self.skipWaiting();
    }),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isAppIcon =
    url.origin === self.location.origin &&
    /^\/(?:chef-jarvis-(?:icon-\d+|maskable-512)|apple-touch-icon)\.png$/.test(
      url.pathname,
    );
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }
  if (isAppIcon) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

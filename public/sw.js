const CACHE = "chef-jarvis-20261101-web-feedback";
const CORE = [
  "/",
  "/index.html",
  "/privacy.html",
  "/styles.css?v=20261101-web-feedback",
  "/guided-cooking.css?v=20261101-web-feedback",
  "/chef-mode.css?v=20261101-web-feedback",
  "/shopping-list.css?v=20261101-web-feedback",
  "/usda-reference.css?v=20261101-web-feedback",
  "/personalized-swaps.css?v=20261101-web-feedback",
  "/plan-persistence.css?v=20261101-web-feedback",
  "/shopping-page.css?v=20261101-web-feedback",
  "/product-features.css?v=20261101-web-feedback",
  "/i18n.js?v=20261101-web-feedback",
  "/domain.js?v=20261101-web-feedback",
  "/boot.js?v=20261101-web-feedback",
  "/vendor/supabase-2.110.5.min.js",
  "/app.js?v=20261101-web-feedback",
  "/chef-mode.js?v=20261101-web-feedback",
  "/privacy.js?v=20261101-web-feedback",
  "/manifest.webmanifest?v=20261101-web-feedback",
  "/fonts/dm-serif-display-latin-400.woff2",
  "/fonts/dm-serif-display-latin-400-italic.woff2",
  "/fonts/manrope-latin-400-800.woff2",
  "/chef-jarvis-app-icon-v2-192.png?v=20261101-web-feedback",
  "/chef-jarvis-app-icon-v2-apple-180.png?v=20261101-web-feedback",
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
    /^\/chef-jarvis-app-icon-v2-(?:192|512|1024|maskable-512|apple-180)\.png$/.test(
      url.pathname,
    );
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  )
    return;
  if (request.mode === "navigate") {
    const isAppShellNavigation =
      url.pathname === "/" || url.pathname === "/index.html";
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) =>
              cache.put(isAppShellNavigation ? "/index.html" : request, copy),
            );
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(
            isAppShellNavigation ? "/index.html" : request,
          );
          return cached || caches.match("/index.html");
        }),
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

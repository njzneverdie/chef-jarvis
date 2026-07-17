const CACHE = "chef-jarvis-20260717-upper-body-icon";
const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/dist/umd/supabase.min.js";
const SUPABASE_INTEGRITY =
  "sha384-Fntl9b+IRzm2GKZK0c129fQFknWsn8pyxDejLO4wwds1LF9DSob2K2QXlfw8EIXn";
const CORE = [
  "/",
  "/index.html",
  "/styles.css?v=20260717-upper-body-icon",
  "/guided-cooking.css?v=20260717-upper-body-icon",
  "/chef-mode.css?v=20260717-upper-body-icon",
  "/shopping-list.css?v=20260717-upper-body-icon",
  "/usda-reference.css?v=20260717-upper-body-icon",
  "/personalized-swaps.css?v=20260717-upper-body-icon",
  "/plan-persistence.css?v=20260717-upper-body-icon",
  "/shopping-page.css?v=20260717-upper-body-icon",
  "/product-features.css?v=20260717-upper-body-icon",
  "/i18n.js?v=20260717-upper-body-icon",
  "/domain.js?v=20260717-upper-body-icon",
  "/app.js?v=20260717-upper-body-icon",
  "/chef-mode.js?v=20260717-upper-body-icon",
  "/manifest.webmanifest?v=20260717-upper-body-icon",
  "/fonts/dm-serif-display-latin-400.woff2",
  "/fonts/dm-serif-display-latin-400-italic.woff2",
  "/fonts/manrope-latin-400-800.woff2",
  "/chef-jarvis-icon-192.png",
  "/apple-touch-icon.png",
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
      if (failed.length)
        console.warn("Some offline assets could not be cached", failed);
      try {
        const supabaseBundle = await fetch(SUPABASE_CDN, {
          mode: "cors",
          integrity: SUPABASE_INTEGRITY,
        });
        if (supabaseBundle.ok) await cache.put(SUPABASE_CDN, supabaseBundle);
      } catch (error) {
        console.warn("Supabase bundle could not be cached", error);
      }
    }),
  );
  self.skipWaiting();
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
  const isSupabaseBundle = request.url === SUPABASE_CDN;
  const isAppIcon =
    url.origin === self.location.origin &&
    /^\/(?:chef-jarvis-(?:icon-\d+|maskable-512)|apple-touch-icon)\.png$/.test(
      url.pathname,
    );
  if (
    request.method !== "GET" ||
    (url.origin !== self.location.origin && !isSupabaseBundle)
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

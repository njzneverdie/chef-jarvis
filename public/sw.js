const CACHE = "chef-jarvis-product-loops-v3";
const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/dist/umd/supabase.min.js";
const SUPABASE_INTEGRITY =
  "sha384-Fntl9b+IRzm2GKZK0c129fQFknWsn8pyxDejLO4wwds1LF9DSob2K2QXlfw8EIXn";
const CORE = [
  "/",
  "/index.html",
  "/styles.css?v=20260716-product-loops",
  "/guided-cooking.css?v=20260716-product-loops",
  "/chef-mode.css?v=20260716-product-loops",
  "/shopping-list.css?v=20260716-product-loops",
  "/usda-reference.css?v=20260716-product-loops",
  "/personalized-swaps.css?v=20260716-product-loops",
  "/plan-persistence.css?v=20260716-product-loops",
  "/shopping-page.css?v=20260716-product-loops",
  "/product-features.css?v=20260716-product-loops",
  "/i18n.js?v=20260716-product-loops",
  "/domain.js?v=20260716-product-loops",
  "/app.js?v=20260716-product-loops",
  "/chef-mode.js?v=20260716-product-loops",
  "/manifest.webmanifest",
  "/chef-jarvis-icon.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(CORE);
      const supabaseBundle = await fetch(SUPABASE_CDN, {
        mode: "cors",
        integrity: SUPABASE_INTEGRITY,
      });
      await cache.put(SUPABASE_CDN, supabaseBundle);
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

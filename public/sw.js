const CACHE_NAME = "ndns-static-v2";

const PRECACHE_URLS = [
  "/favicon.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    PRECACHE_URLS.includes(pathname)
  );
}

function canCacheResponse(request, response) {
  const contentType = response.headers.get("content-type") ?? "";

  return (
    request.method === "GET" &&
    response.ok &&
    !response.redirected &&
    !contentType.includes("text/html")
  );
}

async function putInCache(request, response) {
  if (!canCacheResponse(request, response)) return;

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

// Install: precache app shell, skip waiting
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches, claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: route-aware caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // Never cache API routes
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Never cache document navigations. These are auth-sensitive and can otherwise
  // pin the installed PWA to a stale /login response.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          void putInCache(request, response);
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        void putInCache(request, response);
        return response;
      })
      .catch(() => caches.match(request))
  );
});

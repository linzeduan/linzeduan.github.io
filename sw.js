const CACHE_PREFIX = "zhongxiang-guide";
const VERSION = "v4";
const CORE_CACHE = `${CACHE_PREFIX}-core-${VERSION}`;
const ROUTE_CACHE = `${CACHE_PREFIX}-routes-${VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}-assets-${VERSION}`;
const CURRENT_CACHES = new Set([CORE_CACHE, ROUTE_CACHE, ASSET_CACHE]);
const CORE_ROUTES = [
  "/",
  "/learn",
  "/diagnose",
  "/practice",
  "/dashboard",
  "/review",
  "/wrong",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ROUTES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(key)).map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

const canCache = (response) => response && response.ok && (response.type === "basic" || response.type === "default");
const isPrivatePath = (pathname) => pathname.startsWith("/api/") || pathname.startsWith("/admin");

async function broadcast(type) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type });
}

async function networkFirstNavigation(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    void broadcast("ZX_NETWORK_RESTORED");
    if (canCache(response) && !isPrivatePath(url.pathname)) {
      const cache = await caches.open(ROUTE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    void broadcast("ZX_NETWORK_OFFLINE");
    const exact = await caches.match(request);
    if (exact) return exact;
    if (url.pathname === "/learn") {
      const learningShell = await caches.match("/learn");
      if (learningShell) return learningShell;
    }
    return caches.match("/offline.html");
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (canCache(response)) {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    void broadcast("ZX_NETWORK_OFFLINE");
    const pathnameFallback = await caches.match(new URL(request.url).pathname);
    if (pathnameFallback) return pathnameFallback;
    if (request.destination === "image") return caches.match("/icons/icon.svg");
    throw new Error("asset_unavailable_offline");
  }
}

async function networkFirstRsc(request) {
  try {
    return await fetch(request);
  } catch {
    void broadcast("ZX_NETWORK_OFFLINE");
    return new Response(null, { status: 204, headers: { "X-ZX-Offline": "1" } });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirstRsc(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || ["style", "script", "font", "image"].includes(request.destination)) {
    event.respondWith(cacheFirstAsset(request));
  }
});

function sanitizeOfflineUrls(values) {
  return [...new Set(values)].flatMap((value) => {
    try {
      const url = new URL(value, self.location.origin);
      if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return [];
      return [url.pathname + url.search];
    } catch {
      return [];
    }
  });
}

function extractPageAssets(html) {
  const values = [];
  const pattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico")) values.push(url.pathname + url.search);
    } catch { }
  }
  return [...new Set(values)];
}

async function cachePageWithAssets(value, routeCache, assetCache) {
  const request = new Request(value, { headers: { Accept: "text/html" }, credentials: "same-origin" });
  const response = await fetch(request);
  if (!canCache(response)) throw new Error(`HTTP ${response.status}`);
  const pageCopy = response.clone();
  const html = await response.text();
  await routeCache.put(request, pageCopy);
  for (const assetUrl of extractPageAssets(html)) {
    if (await assetCache.match(assetUrl)) continue;
    try {
      const assetResponse = await fetch(assetUrl);
      if (canCache(assetResponse)) await assetCache.put(assetUrl, assetResponse);
    } catch { }
  }
}

self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (!port) return;

  if (event.data?.type === "CACHE_URLS") {
    const urls = sanitizeOfflineUrls(Array.isArray(event.data.urls) ? event.data.urls : []);
    event.waitUntil((async () => {
      const cache = await caches.open(ROUTE_CACHE);
      const assetCache = await caches.open(ASSET_CACHE);
      let completed = 0;
      let failed = 0;
      for (const value of urls) {
        try {
          await cachePageWithAssets(value, cache, assetCache);
          completed += 1;
        } catch {
          failed += 1;
        }
        port.postMessage({ type: "CACHE_PROGRESS", completed, failed, total: urls.length });
      }
      port.postMessage({ type: "CACHE_COMPLETE", completed, failed, total: urls.length });
    })());
    return;
  }

  if (event.data?.type === "GET_CACHE_STATUS") {
    const urls = sanitizeOfflineUrls(Array.isArray(event.data.urls) ? event.data.urls : []);
    event.waitUntil((async () => {
      const cache = await caches.open(ROUTE_CACHE);
      let cached = 0;
      for (const value of urls) if (await cache.match(value)) cached += 1;
      port.postMessage({ type: "CACHE_STATUS", cached, total: urls.length });
    })());
  }
});

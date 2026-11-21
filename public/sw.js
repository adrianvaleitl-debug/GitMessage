const CACHE_NAME = "gitmessage-shell-v1";
const APP_ROOT = self.registration.scope;
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new URL("./", APP_ROOT));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("gitmessage-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) await (await caches.open(CACHE_NAME)).put(new URL("./", APP_ROOT), response.clone());
        return response;
      } catch {
        return (await caches.match(new URL("./", APP_ROOT))) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith(new URL(APP_ROOT).pathname) && /\.(?:js|css|svg|png|webp|ico)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    })());
  }
});
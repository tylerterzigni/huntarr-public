/* eslint-disable no-undef */
// Increment OFFLINE_VERSION to bust the offline page cache on deploy.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OFFLINE_VERSION = 1;
const CACHE_NAME = "offline";
const OFFLINE_URL = "/offline.html";

// Service workers require a secure context (HTTPS or localhost).
// On LAN HTTP (http://192.168.x.x) iOS Safari may not register this worker.

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }
    })()
  );
  clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }
        return await fetch(event.request);
      } catch (error) {
        console.log("Fetch failed; returning offline page instead.", error);
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_URL);
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    })()
  );
});

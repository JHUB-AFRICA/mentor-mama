/* global self, caches, fetch, URL */

const SHELL_CACHE = "mentormama-portal-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/", "/index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

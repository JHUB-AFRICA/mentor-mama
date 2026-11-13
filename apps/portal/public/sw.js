/* global self, caches, fetch, URL */

/*
 * MentorMAMA portal service worker. It exists for one reason: the app shell opens when the network is down, so a mentor
 * on a ward with no signal can still reach the offline session queue.
 *
 * Rules (do not loosen without thinking about shared phones and stale data):
 *  - API calls and anything else dynamic are NEVER intercepted or cached. They always go to the network, so people never
 *    see stale data and one person's cached responses can never be replayed to the next person on the same device.
 *  - Pages (navigations) go to the network first; the cached shell is only a fallback when offline.
 *  - Built files under /assets/ have content hashes in their names, so they are safe to cache first.
 *
 * Bump CACHE when this logic changes: activation deletes every cache with a different name, which also clears whatever
 * an earlier version of this worker stored.
 */
const CACHE = "mentormama-portal-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first, cached shell only when the network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  // Hashed build output: cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (notably /api/): not handled here, so the browser goes straight to the network.
});

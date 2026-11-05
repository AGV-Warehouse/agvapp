const CACHE_NAME = "agv-fleet-control-v4";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./bridge.js",
  "./map.js",
  "./roslib.min.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      // Take over immediately instead of waiting for every tab to close.
      // Without this, an old worker keeps serving stale app.js/styles.css
      // even after a hard reload, which silently ships mismatched
      // HTML + JS to the tablet.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Network-first, cache as fallback.
//
// Cache-first is wrong for this app: the whole point is driving a real robot,
// and shipping a stale app.js against live firmware is worse than not loading
// at all. The warehouse-offline requirement is still met -- when the network
// is unreachable we fall straight back to the precached copy.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    // no-cache: revalidate with the server every time. A plain fetch() may
    // answer from the browser's HTTP cache, mixing a new index.html with an
    // old app.js/styles.css.
    fetch(request, { cache: "no-cache" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))),
  );
});

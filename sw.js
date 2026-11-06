const CACHE_NAME = "fleetserver-operations-v4";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./fleet-api.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    !APP_FILES.some(
      (file) => new URL(file, self.location).pathname === url.pathname,
    )
  )
    return;
  const network = fetch(event.request);
  event.waitUntil(
    network
      .then((response) => {
        if (response.ok)
          return caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, response.clone()));
      })
      .catch(() => {}),
  );
  event.respondWith(network.catch(() => caches.match(event.request)));
});

/* Tutor Amma service worker — installable app + offline shell.
   Static build assets are cache-first (they are content-hashed); pages are
   network-first with a cached fallback; API calls and realtime are never cached. */
const VERSION = "ta-v4";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/brand/tutor-amma-logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/rt/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /\.(png|jpg|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            /* clone before the page consumes the body */
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit || new Response("You're offline. Reconnect to keep learning with Tutor Amma.", { headers: { "content-type": "text/plain" } })))
    );
  }
});

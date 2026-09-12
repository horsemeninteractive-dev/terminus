const VERSION = 'terminus-cache-v2';

/** App shell — cached at install. Icons + manifest + the offline fallback. */
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/terminus-skull-192.png',
  '/icons/terminus-skull-512.png',
  '/icons/terminus-skull-maskable-192.png',
  '/icons/terminus-skull-maskable-512.png',
  '/icons/favicon-32.png',
  '/icons/terminus-skull-192.svg',
  '/icons/terminus-skull-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations (the HTML shell) go network-first so a deployed new build is
  // picked up on the next visit/reload and the app can tell the user an update
  // is available — with the cached shell as the offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: cache-first with a background revalidate so static
  // assets (JS/CSS/images) still load instantly offline but converge on the
  // newest deployed versions after one visit.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/**
 * Service worker — offline-first caching for Notebook Studio.
 * Caches the app shell (HTML, JS, CSS, WASM) for offline use.
 */
const CACHE_VERSION = '1';
const CACHE_NAME = `notebook-studio-${CACHE_VERSION}`;

// Assets to pre-cache on install
const PRECACHE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy: cache-first for app shell, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML (so navigation works offline but gets fresh content)
  if (event.request.method === 'GET' && (event.request.mode === 'navigate')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, WASM, fonts, images)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => {
          if (cached) return cached;
          return fetch(event.request)
            .then((res) => {
              // Don't cache non-successful responses
              if (!res.ok) return res;
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
              return res;
            })
            .catch(() => cached);
        })
    );
  }
});

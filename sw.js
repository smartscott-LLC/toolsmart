/* ============================================================
   Sirens — Service Worker  (Cache-first for app shell)
   ============================================================ */
const CACHE_NAME = 'sirens-v3';

// App-shell files that live in this origin
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/app.js',
  '/js/editor.js',
  '/js/preview.js',
  '/js/smartbar.js',
  '/js/vault.js',
  '/js/themes.js',
  '/js/snippets.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Vendored libraries (bundled locally for true offline support)
  '/vendor/bulma/bulma.min.css',
  '/vendor/codemirror/codemirror.js',
  '/vendor/codemirror/codemirror.css',
  '/vendor/codemirror/addon/hint/show-hint.js',
  '/vendor/codemirror/addon/hint/show-hint.css',
  '/vendor/codemirror/addon/mode/simple.js',
  '/vendor/codemirror/addon/edit/matchbrackets.js',
  '/vendor/codemirror/addon/display/placeholder.js',
  '/vendor/codemirror/addon/selection/active-line.js',
  '/vendor/codemirror/addon/search/searchcursor.js',
  '/vendor/mermaid/mermaid.min.js',
];

// CDN resources — cache on first use
const CDN_CACHE = 'sirens-cdn-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== CDN_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // App shell — cache first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // CDN resources — network first, fallback to cache
  if (
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('unpkg.com')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CDN_CACHE).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

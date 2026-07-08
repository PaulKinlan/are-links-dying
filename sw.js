// Service Worker for Are Links Dying? — caches the 14MB SQLite DB after user consent
const CACHE_NAME = 'are-links-dying-v1';
const DB_URL = 'link-study.db';
const DB_CACHE_KEY = 'are-links-dying-db-v1'; // bump this when the DB changes
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== DB_CACHE_KEY).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Respond from cache for the DB; fetch from network for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // DB file: serve from cache if available, otherwise fetch and cache
  if (url.pathname.endsWith(DB_URL)) {
    event.respondWith(
      caches.open(DB_CACHE_KEY).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(resp => {
            // Clone and cache the response
            const clone = resp.clone();
            cache.put(event.request, clone);
            return resp;
          });
        })
      )
    );
    return;
  }

  // App shell: stale-while-revalidate
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(resp => {
            cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});

// Message handler: allows the page to check DB cache status and force-refresh
self.addEventListener('message', (event) => {
  if (event.data?.type === 'DB_CACHE_STATUS') {
    caches.open(DB_CACHE_KEY).then(cache =>
      cache.match(new Request(DB_URL)).then(resp => {
        event.source.postMessage({ type: 'DB_CACHE_STATUS', cached: !!resp });
      })
    );
  }
  if (event.data?.type === 'DB_CACHE_CLEAR') {
    caches.delete(DB_CACHE_KEY).then(() => {
      event.source.postMessage({ type: 'DB_CACHE_CLEARED' });
    });
  }
});

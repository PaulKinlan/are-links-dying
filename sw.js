// Service Worker for Are Links Dying? — stale-while-revalidate for the DB
const CACHE_NAME = 'are-links-dying-v2';
const DB_CACHE_KEY = 'are-links-dying-db-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches from v1
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DB_CACHE_KEY).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // DB file: stale-while-revalidate
  // Serve from cache immediately if available, fetch fresh in background
  if (url.pathname.endsWith('link-study.db')) {
    event.respondWith(
      caches.open(DB_CACHE_KEY).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request).then((resp) => {
          // Only cache successful responses
          if (resp && resp.ok) {
            cache.put(event.request, resp.clone());
          }
          return resp;
        }).catch(() => {
          // Network failed — if we have cache, already returned it above
          // If no cache either, this will throw and the page shows an error
        });
        
        // Return cached immediately, fall back to network
        return cached || networkFetch;
      })
    );
    return;
  }

  // HTML/JS/CSS: stale-while-revalidate too
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request).then((resp) => {
          if (resp && resp.ok) {
            cache.put(event.request, resp.clone());
          }
          return resp;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data?.type === 'DB_CACHE_STATUS') {
    caches.open(DB_CACHE_KEY).then(cache =>
      cache.match(new Request(self.location.origin + '/link-study.db')).then(resp => {
        event.source.postMessage({ type: 'DB_CACHE_STATUS', cached: !!resp });
      })
    );
  }
  if (event.data?.type === 'DB_CACHE_CLEAR') {
    Promise.all([
      caches.delete(DB_CACHE_KEY),
      caches.delete(CACHE_NAME)
    ]).then(() => {
      event.source.postMessage({ type: 'DB_CACHE_CLEARED' });
    });
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

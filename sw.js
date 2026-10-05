// ═══════════════════════════════════════════════════
// SECUREPLUG RETAILER — SERVICE WORKER v1.0
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'secureplug-retailer-v1';
const RUNTIME_CACHE = 'secureplug-runtime-v1';

// Files to cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// CDN URLs to cache on first use
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

// ═══════════════════════════════════════════════════
// INSTALL EVENT — Cache core files
// ═══════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching core files');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Precaching complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Precache failed:', err);
      })
  );
});

// ═══════════════════════════════════════════════════
// ACTIVATE EVENT — Clean old caches
// ═══════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// ═══════════════════════════════════════════════════
// FETCH EVENT — Serve from cache, fallback to network
// ═══════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Supabase API calls (always network)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch((err) => {
        console.warn('[SW] Supabase fetch failed:', err);
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Network-first for HTML (so updates are picked up)
  if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Cache-first for everything else (CDN, assets)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          // Don't cache non-success responses
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch((err) => {
          console.warn('[SW] Fetch failed:', request.url, err);
          // Return offline fallback for navigation
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});

// ═══════════════════════════════════════════════════
// MESSAGE EVENT — Handle skipWaiting
// ═══════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded');

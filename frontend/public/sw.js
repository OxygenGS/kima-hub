// Kima Service Worker — offline navigation shell only.
// Authenticated image URLs belong to the user's session. Never serve private
// /api/* media from a token-stripped, cross-account service worker cache.
const CACHE_NAME = 'kima-v3';
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/assets/images/kima.webp',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        // Remove the old image cache containing token-independent keys. Leave
        // caches belonging to other applications on the same origin alone.
        .filter((name) => name.startsWith('kima-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Navigation: network-first, with a static offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/offline.html')) ??
          new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Do not cache or intercept /api/ endpoints, including protected artwork,
  // audio, podcasts and audiobooks. Each request must be authorized by Kima.
  // Also let Next.js manage its own immutable static assets and HTTP caching.
});

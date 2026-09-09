/**
 * Service worker — caching strategy per resource type:
 *
 *   app shell (HTML/CSS/JS/fonts/icons)
 *     → cache-first: immutable between deploys (hashed filenames), instant
 *       boots, works offline
 *
 *   news data (data/*.json, /api/*)
 *     → network-first with cache fallback: fresh headlines when online, last
 *       known data when offline. /api responses are cached too so the app
 *       boots offline in API mode.
 *
 *   article photos (external CDNs)
 *     → network-only: too many unique URLs to cache usefully
 *
 * Bumped on every deploy (CI rewrites it with the build hash) so clients
 * pick up new shells immediately.
 */

const VERSION = 'v__BUILD_HASH__';
const SHELL_CACHE = `newsdash-shell-${VERSION}`;
const DATA_CACHE = `newsdash-data-${VERSION}`;

const SHELL_PRECACHE = [
  './',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Same-origin only; article photos on external CDNs go to the network.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  // Live API: network-first with cache fallback (works offline in API mode).
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  // Static news snapshots: network-first (they change every 15 min).
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  // App shell: cache-first (hashed filenames are immutable per deploy).
  event.respondWith(cacheFirst(event.request, SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      // Stale-but-serviceable: flag it so the UI can show an offline banner.
      const headers = new Headers(cached.headers);
      headers.set('x-newsdash-stale', '1');
      return new Response(await cached.clone().blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers
      });
    }
    throw new Error('offline and uncached');
  }
}

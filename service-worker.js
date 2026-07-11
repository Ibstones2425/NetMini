/* ============================================================
   service-worker.js — NetMini PWA service worker
   Strategy: Network-First, Fallback-to-Cache for local app
   shell (HTML, CSS, JS, images, manifest). External requests
   (TMDB API, video embed iframes, YouTube trailers, Google
   Fonts) pass through to the network and are never cached.
   ============================================================ */

const CACHE_VERSION = 'netmini-v3';

/* Local app-shell assets to precache on install. These are the
   static files that make up the app's UI structure. */
const PRECACHE_URLS = [
  './',
  './index.html',
  './discover.html',
  './search.html',
  './details.html',
  './watch.html',
  './playlist.html',
  './more.html',

  './manifest.json',
  './logo.png',
  './logo-square.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',

  './css/base.css',
  './css/layout.css',
  './css/home.css',
  './css/details.css',
  './css/discover.css',
  './css/search.css',
  './css/watch.css',
  './css/playlist.css',
  './css/more.css',

  './js/config.js',
  './js/api.js',
  './js/utils.js',
  './js/nav.js',
  './js/components.js',
  './js/anilist.js',
  './js/home.js',
  './js/discover.js',
  './js/search.js',
  './js/details.js',
  './js/watch.js',
  './js/playlist.js',
  './js/splash.js',
];

/* Hosts that must ALWAYS go to the network (never cached, never
   intercepted beyond a transparent pass-through). */
const NETWORK_ONLY_HOSTS = [
  'api.themoviedb.org',
  'image.tmdb.org',
  'graphql.anilist.co',
  'anilist.co',
  'www.youtube.com',
  'youtube.com',
  'i.ytimg.com',
  'player.cinezo.live',
  'vidbolt.xyz',
  'vsembed.ru',
  'vidsrc.to',
  'vidsrc.net',
  'vidsrc.xyz',
  'vidsrc.cc',
  'www.2embed.cc',
  '2embed.cc',
  'databasegdriveplayer.co',
  'firebasestorage.googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
];

/* ── INSTALL: precache the local app shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Use individual fetches so one missing file doesn't break the whole install
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (res && res.ok) {
              await cache.put(url, res.clone());
            }
          } catch (err) {
            // Silently skip files that don't exist yet
            console.warn('[SW] precache skip:', url, err.message);
          }
        })
      );
      // Activate immediately
      await self.skipWaiting();
    })()
  );
});

/* ── ACTIVATE: clean up old caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/* ── FETCH: Network-First, Fallback-to-Cache ──
   - For external hosts (TMDB, video embeds, YouTube): pass
     straight through to the network — do NOT intercept.
   - For iframe/embed navigations (req.destination === 'iframe'
     or 'embed'): ALWAYS pass through, even if same-origin, so
     third-party embed providers never see a service-worker
     response that would trigger their anti-framing checks.
   - For same-origin local assets (HTML, CSS, JS, images):
     try network first; on failure fall back to cache; on
     total failure, fall back to the cached index.html so the
     app shell still loads offline. */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // ── CRITICAL: never interfere with iframe / embed requests.
  //    Video embed providers (Cinezo, VidSrc, 2Embed, vsembed…)
  //    will refuse to render if they receive a synthetic
  //    service-worker response, and the installed-PWA WebView
  //    on MIUI / iOS is especially picky about this. Let the
  //    browser issue these directly to the network.
  if (req.destination === 'iframe' || req.destination === 'embed') {
    return;
  }

  // Pass through cross-origin requests to known external hosts
  if (url.origin !== self.location.origin) {
    // Let the browser handle it normally — no caching, no fallback
    return;
  }

  // Same-origin request → Network-First with cache fallback
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      try {
        // 1) Try the network
        const networkRes = await fetch(req);
        // Only cache successful, basic (same-origin) responses
        if (networkRes && networkRes.ok && networkRes.type === 'basic') {
          cache.put(req, networkRes.clone());
        }
        return networkRes;
      } catch (err) {
        // 2) Network failed — try the cache
        const cachedRes = await cache.match(req);
        if (cachedRes) return cachedRes;

        // 3) Cache miss for a navigation request → serve cached index.html
        //    so the PWA still launches offline.
        if (req.mode === 'navigate') {
          const fallback = await cache.match('./index.html');
          if (fallback) return fallback;
        }

        // 4) Total failure — return a minimal offline response
        return new Response(
          'Offline and resource not cached.',
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          }
        );
      }
    })()
  );
});

/* ── MESSAGE: allow pages to trigger skipWaiting ── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

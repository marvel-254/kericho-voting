/* Kericho Voting — minimal PWA SW */
const CACHE = 'kericho-voting-v2';
const ASSETS = [
  '/',
  '/public/index.html',
  '/public/style.css',
  '/public/app.js',
  '/public/manifest.json',
  '/public/icon-192.png',
  '/public/icon-512.png',
  '/public/og-image.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only handle same-origin GET
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Network-first for API, cache-first for assets
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetchPromise = fetch(req).then((res) => {
        // cache successful static responses
        if (res.ok && (url.pathname.startsWith('/public/') || url.pathname === '/' || url.pathname === '/manifest.json')) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => hit);
      return hit || fetchPromise;
    })
  );
});

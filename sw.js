// Offline shell. Our files: network first, cache as fallback — online launches always get one
// consistent version (a half-refreshed cache could pair a new app.js with an old scene.js).
// The CDN bundle is pinned by version, so cache first. Photos are blob: URLs and never pass through here.
const CACHE = 'habit-tower-v2';
const CDN = 'https://cdn.jsdelivr.net/';
const SHELL = [
  './', 'index.html', 'app.js', 'logic.js', 'db.js', 'localdb.js', 'devdb.js', 'manifest.webmanifest',
  'ui/h.js', 'ui/sprites.js', 'ui/monsters.js', 'ui/scene.js', 'ui/windows.js',
  'fonts/Galmuri11.woff2', 'icons/icon-192.png', 'icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js',
];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = () => c.match(e.request, { ignoreSearch: true });
    if (e.request.url.startsWith(CDN)) return (await cached()) ?? fetch(e.request);
    try {
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch {
      return (await cached()) ?? Response.error();
    }
  }));
});

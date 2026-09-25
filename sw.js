// Offline shell. Each launch uses ONE source for all our files, so a new app.js never meets an old scene.js:
// the page request decides — network if it answers within 2.5s, else the whole launch runs from cache
// (weak signal in a gym basement shouldn't mean a blank screen). The CDN bundle is pinned by version,
// so cache first. Photos are blob: URLs and never pass through here.
const CACHE = 'habit-tower-v3';
const fromCache = new Set(); // client (page) ids whose launch fell back to the cache
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
    const net = async () => { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; };
    if (e.request.url.startsWith(CDN)) return (await cached()) ?? fetch(e.request);
    if (e.request.mode === 'navigate') {
      const slow = new Promise((_, no) => setTimeout(() => no(new Error('slow')), 2500));
      try {
        const r = await Promise.race([fetch(e.request), slow]);
        if (r.ok) c.put(e.request, r.clone()); // only a page that won the race may replace the cached one
        return r;
      } catch {
        const hit = await cached();
        if (hit) { fromCache.add(e.resultingClientId); return hit; }
        return net(); // never cached yet: nothing better than waiting
      }
    }
    if (fromCache.has(e.clientId)) return (await cached()) ?? net();
    try { return await net(); } catch { return (await cached()) ?? Response.error(); }
  }));
});

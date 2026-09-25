// App shell cache: serve from cache instantly, refresh it from the network in the background
// (a new deploy shows up on the next launch). Photos are blob: URLs and never pass through here.
const CACHE = 'habit-tower-v1';
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
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit ?? Response.error());
    return hit ?? net;
  }));
});

// Offline shell. Each launch uses ONE source for all our files, so a new app.js never meets an old scene.js:
// the page request decides — network if it answers within 2.5s, else the whole launch runs from cache
// (weak signal in a gym basement shouldn't mean a blank screen). The CDN bundle is pinned by version,
// so cache first. Photos are blob: URLs and never pass through here; Supabase requests bypass the worker.
// Our own files are always revalidated (cache: 'no-cache'): GitHub Pages lets browsers keep them 10 minutes,
// which right after a deploy could pair a new app.js with an old windows.js and break the page.
const CACHE = 'habit-tower-v7';
const fromCache = new Set(); // client (page) ids whose launch fell back to the cache
const CDN = 'https://cdn.jsdelivr.net/';
const SHELL = [
  './', 'index.html', 'app.js', 'logic.js', 'db.js', 'localdb.js', 'devdb.js', 'cloud.js', 'config.js', 'image.js', 'report.js', 'manifest.webmanifest',
  'ui/h.js', 'ui/sprites.js', 'ui/monsters.js', 'ui/scene.js', 'ui/windows.js',
  'fonts/Galmuri11.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js',
];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE)
  .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (!url.startsWith(self.location.origin) && !url.startsWith(CDN)) return; // Supabase API and storage: straight to the network
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = () => c.match(e.request, { ignoreSearch: true });
    const net = async () => { const r = await fetch(e.request, { cache: 'no-cache' }); if (r.ok) c.put(e.request, r.clone()); return r; };
    if (url.startsWith(CDN)) return (await cached()) ?? net(); // pinned versions: keep what we fetch (supabase-js pulls in its own modules)
    if (e.request.mode === 'navigate') {
      const slow = new Promise((_, no) => setTimeout(() => no(new Error('slow')), 2500));
      try {
        const r = await Promise.race([fetch(e.request.url, { cache: 'no-cache' }), slow]);
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

// 9pm reminder from supabase/functions/remind. Tapping it brings the app forward (or opens it).
self.addEventListener('push', (e) => {
  const { title = '해빗 타워', body = '' } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'remind' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((ws) => (ws[0] ? ws[0].focus() : self.clients.openWindow('./'))));
});

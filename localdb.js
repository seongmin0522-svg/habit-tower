// Phone-only storage for the installed PWA: the same doc/collection API the app uses,
// persisted in IndexedDB ('docs': path -> body, 'photos': id -> Blob).
import { createDevDb } from './devdb.js';
import { validBackup } from './logic.js';
import { shrink } from './image.js';

// Brick-size copy of every photo ('t:<id>'; partner ones 'pt:<path>' in the cloud store): a 30-floor tower
// would otherwise decode 30-60 full photos at once. 360px = 3x the 120px brick. A photo that won't decode goes without.
const THUMB = 360;
const makeThumb = (blob) => shrink(blob, THUMB).catch(() => null);

const open = () => new Promise((ok, no) => {
  const r = indexedDB.open('habit-tower', 2);
  r.onupgradeneeded = (e) => {
    if (e.oldVersion < 1) { r.result.createObjectStore('docs'); r.result.createObjectStore('photos'); }
    if (e.oldVersion < 2) r.result.createObjectStore('cloud'); // couple mode: 'me', 'partner', 'partnerDays', 'ph:<path>' photos
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});

// One transaction; resolves with fn's request result once it has committed.
const run = (idb, store, mode, fn) => new Promise((ok, no) => {
  const t = idb.transaction(store, mode);
  const req = fn(t.objectStore(store));
  t.oncomplete = () => ok(req?.result);
  t.onerror = t.onabort = () => no(t.error);
});
const entries = async (idb, store) => {
  const [keys, vals] = await Promise.all([
    run(idb, store, 'readonly', (s) => s.getAllKeys()), run(idb, store, 'readonly', (s) => s.getAll())]);
  return keys.map((k, i) => [k, vals[i]]);
};

const toDataUrl = (blob) => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => no(r.error);
  r.readAsDataURL(blob);
});

// urls: shared id -> object URL map that photoUrl() reads.
export async function openLocal(urls) {
  const idb = await open();
  navigator.storage?.persist?.().catch(() => {}); // ask Chrome not to evict; harmless if refused
  const mem = createDevDb();
  for (const [path, body] of await entries(idb, 'docs')) await mem.doc(path).set(body);
  for (const [id, blob] of await entries(idb, 'photos')) urls.set(id, URL.createObjectURL(blob));
  for (const [k, blob] of await entries(idb, 'cloud')) {
    if (k.startsWith('ph:')) urls.set(k.slice(3), URL.createObjectURL(blob));
    if (k.startsWith('pt:')) urls.set('t:' + k.slice(3), URL.createObjectURL(blob));
  }
  const setUrl = (key, blob) => { URL.revokeObjectURL(urls.get(key)); urls.set(key, URL.createObjectURL(blob)); };
  const dropUrl = (key) => { URL.revokeObjectURL(urls.get(key)); urls.delete(key); };

  // Disk first, then memory: a failed write never shows up as saved.
  const doc = (path) => {
    const ref = mem.doc(path);
    return { ...ref, set: async (body) => { await run(idb, 'docs', 'readwrite', (s) => s.put(body, path)); await ref.set(body); } };
  };
  const db = { doc, collection: mem.collection };

  const assets = {
    get: (id) => run(idb, 'photos', 'readonly', (s) => s.get(id)),
    async put(id, blob) {
      await run(idb, 'photos', 'readwrite', (s) => s.put(blob, id));
      setUrl(id, blob);
      const t = await makeThumb(blob);
      if (t) { await run(idb, 'photos', 'readwrite', (s) => s.put(t, 't:' + id)); setUrl('t:' + id, t); }
    },
    async upload(blob) {
      const id = crypto.randomUUID();
      await assets.put(id, blob);
      return { id, url: urls.get(id), sizeBytes: blob.size, contentType: blob.type };
    },
    async delete(id) {
      await run(idb, 'photos', 'readwrite', (s) => { s.delete('t:' + id); return s.delete(id); });
      dropUrl(id);
      dropUrl('t:' + id);
      return { deleted: true };
    },
  };

  // Couple-mode cache. Partner photos live under 'ph:<cloud path>' and show through photoUrl(path).
  const cloud = {
    get: (k) => run(idb, 'cloud', 'readonly', (s) => s.get(k)),
    put: (k, v) => run(idb, 'cloud', 'readwrite', (s) => s.put(v, k)),
    keys: () => run(idb, 'cloud', 'readonly', (s) => s.getAllKeys()),
    async putPhoto(path, blob) {
      await cloud.put('ph:' + path, blob);
      setUrl(path, blob);
      const t = await makeThumb(blob);
      if (t) { await cloud.put('pt:' + path, t); setUrl('t:' + path, t); }
    },
    async dropPhoto(path) {
      await run(idb, 'cloud', 'readwrite', (s) => { s.delete('pt:' + path); return s.delete('ph:' + path); });
      dropUrl(path);
      dropUrl('t:' + path);
    },
  };

  const backup = {
    async save() {
      const docs = await entries(idb, 'docs');
      const photos = [];
      for (const [id, blob] of await entries(idb, 'photos')) if (!id.startsWith('t:')) photos.push([id, await toDataUrl(blob)]); // thumbnails rebuild
      return new Blob([JSON.stringify({ version: 1, docs, photos })], { type: 'application/json' });
    },
    // Merges into what's on the phone: same day/photo ids are overwritten, nothing is deleted.
    async restore(file) {
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('백업 파일을 읽을 수 없어요'); }
      if (!validBackup(data)) throw new Error('해빗 타워 백업 파일이 아니에요');
      for (const [id, url] of data.photos) await assets.put(id, await (await fetch(url)).blob());
      for (const [path, body] of data.docs) await doc(path).set(body);
      return { days: data.docs.filter(([p]) => p.startsWith('days/')).length, photos: data.photos.length };
    },
    // Wipes every record and photo on this phone. The caller reloads the page afterwards.
    async reset() {
      for (const store of ['docs', 'photos', 'cloud']) await run(idb, store, 'readwrite', (s) => s.clear());
    },
  };

  // Photos saved before thumbnails existed: make theirs in the background, one at a time, after the first screen.
  setTimeout(async () => {
    for (const [id, blob] of await entries(idb, 'photos')) {
      if (id.startsWith('t:') || urls.has('t:' + id)) continue;
      const t = await makeThumb(blob);
      if (t) { await run(idb, 'photos', 'readwrite', (s) => s.put(t, 't:' + id)); setUrl('t:' + id, t); }
    }
    for (const [k, blob] of await entries(idb, 'cloud')) {
      if (!k.startsWith('ph:') || urls.has('t:' + k.slice(3))) continue;
      const t = await makeThumb(blob);
      if (t) { await cloud.put('pt:' + k.slice(3), t); setUrl('t:' + k.slice(3), t); }
    }
  }, 3000);

  return { db, assets, cloud, backup };
}

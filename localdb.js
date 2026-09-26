// Phone-only storage for the installed PWA: the same doc/collection API the app uses,
// persisted in IndexedDB ('docs': path -> body, 'photos': id -> Blob).
import { createDevDb } from './devdb.js';
import { validBackup } from './logic.js';

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
  for (const [k, blob] of await entries(idb, 'cloud')) if (k.startsWith('ph:')) urls.set(k.slice(3), URL.createObjectURL(blob));

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
      urls.set(id, URL.createObjectURL(blob));
    },
    async upload(blob) {
      const id = crypto.randomUUID();
      await assets.put(id, blob);
      return { id, url: urls.get(id), sizeBytes: blob.size, contentType: blob.type };
    },
    async delete(id) {
      await run(idb, 'photos', 'readwrite', (s) => s.delete(id));
      URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
      return { deleted: true };
    },
  };

  // Couple-mode cache. Partner photos live under 'ph:<cloud path>' and show through photoUrl(path).
  const cloud = {
    get: (k) => run(idb, 'cloud', 'readonly', (s) => s.get(k)),
    put: (k, v) => run(idb, 'cloud', 'readwrite', (s) => s.put(v, k)),
    keys: () => run(idb, 'cloud', 'readonly', (s) => s.getAllKeys()),
    async putPhoto(path, blob) { await cloud.put('ph:' + path, blob); urls.set(path, URL.createObjectURL(blob)); },
    async dropPhoto(path) {
      await run(idb, 'cloud', 'readwrite', (s) => s.delete('ph:' + path));
      URL.revokeObjectURL(urls.get(path));
      urls.delete(path);
    },
  };

  const backup = {
    async save() {
      const docs = await entries(idb, 'docs');
      const photos = [];
      for (const [id, blob] of await entries(idb, 'photos')) photos.push([id, await toDataUrl(blob)]);
      return new Blob([JSON.stringify({ version: 1, docs, photos })], { type: 'application/json' });
    },
    // Merges into what's on the phone: same day/photo ids are overwritten, nothing is deleted.
    async restore(file) {
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('백업 파일을 읽을 수 없어요'); }
      if (!validBackup(data)) throw new Error('해빗 타워 백업 파일이 아니에요');
      for (const [id, url] of data.photos) {
        const blob = await (await fetch(url)).blob();
        await run(idb, 'photos', 'readwrite', (s) => s.put(blob, id));
        urls.set(id, URL.createObjectURL(blob));
      }
      for (const [path, body] of data.docs) await doc(path).set(body);
      return { days: data.docs.length - (data.docs.some(([p]) => p === 'habit/me') ? 1 : 0), photos: data.photos.length };
    },
    // Wipes every record and photo on this phone. The caller reloads the page afterwards.
    async reset() {
      for (const store of ['docs', 'photos', 'cloud']) await run(idb, store, 'readwrite', (s) => s.clear());
    },
  };

  return { db, assets, cloud, backup };
}

// In-memory stand-in for the Artifact `db` capability.
// Used by db.test.mjs and by the `?dev` local preview. Only the calls this app makes.

export function createDevDb() {
  const docs = new Map(); // path -> body
  const subs = new Set(); // listeners re-run on every change
  const notify = () => subs.forEach((f) => f());
  const meta = { fromCache: false, hasPendingWrites: false };
  const snap = (path) => ({
    id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path), metadata: meta,
  });
  const listen = (f) => { subs.add(f); f(); return () => subs.delete(f); };

  const doc = (path) => ({
    id: path.split('/').pop(),
    path,
    get: async () => snap(path),
    set: async (body) => { docs.set(path, structuredClone(body)); notify(); },
    update: async (body) => {
      if (!docs.has(path)) throw { code: 'invalid_argument', message: 'document does not exist' };
      docs.set(path, { ...docs.get(path), ...structuredClone(body) });
      notify();
    },
    delete: async () => { docs.delete(path); notify(); },
    onSnapshot: (next) => listen(() => next(snap(path))),
  });

  let seq = 0;
  const collection = (path) => {
    const depth = path.split('/').length + 1;
    const query = () => {
      const ds = [...docs.keys()]
        .filter((k) => k.startsWith(path + '/') && k.split('/').length === depth)
        .sort()
        .map(snap);
      return { docs: ds, size: ds.length, empty: ds.length === 0, metadata: meta };
    };
    return {
      path,
      doc: (id = `d${++seq}${Date.now().toString(36)}`) => doc(`${path}/${id}`),
      add: async (body) => { const ref = collection(path).doc(); await ref.set(body); return ref; },
      get: async () => query(),
      onSnapshot: (next) => listen(() => next(query())),
    };
  };

  return { doc, collection };
}

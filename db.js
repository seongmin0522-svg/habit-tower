// All persistence goes through here. The page never writes to db or assets directly.
import { todayKST, addDays } from './logic.js';
import { CHARACTERS } from './ui/sprites.js';

const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const MAX_TITLE = 40;
const devUrls = new Map(); // dev and phone modes: asset id -> object/data URL

// Where data lives: claude.ai Artifact (db + assets), ?dev (in memory), or the phone (IndexedDB PWA).
export const MODE = window.claude?.use ? 'artifact' : DEV ? 'dev' : window.indexedDB ? 'local' : 'none';

// Artifact assets serve at /_blob/<id>; dev and phone photos are object URLs.
export const photoUrl = (id) => devUrls.get(id) ?? `/_blob/${id}`;

let local; // one IndexedDB connection shared by db, assets and backup
const openLocalOnce = () => (local ??= import('./localdb.js').then((m) => m.openLocal(devUrls)));
export const localBackup = () => (MODE === 'local' ? openLocalOnce().then((l) => l.backup) : Promise.resolve(null));

export async function connect() {
  if (MODE === 'artifact') return window.claude.use('db');
  if (MODE === 'local') return (await openLocalOnce()).db;
  if (MODE !== 'dev') return null;
  const db = (await import('./devdb.js')).createDevDb();
  await seedDev(db, params.get('seed'));
  return db;
}

export async function connectAssets() {
  if (MODE === 'artifact') return window.claude.use('assets');
  if (MODE === 'local') return (await openLocalOnce()).assets;
  if (MODE !== 'dev') return null;
  let n = 0;
  return {
    async upload(blob) {
      const id = `dev${++n}`;
      devUrls.set(id, URL.createObjectURL(blob));
      return { id, url: devUrls.get(id), sizeBytes: blob.size, contentType: blob.type };
    },
    async delete(id) { URL.revokeObjectURL(devUrls.get(id)); devUrls.delete(id); return { deleted: true }; },
  };
}

// `loaded` flips true only after server-definitive snapshots of both sources.
export function subscribe(db, onState, onError) {
  const st = { habit: null, days: {}, loaded: false };
  const seen = new Set();
  const emit = (part, s) => {
    if (!s.metadata.fromCache) seen.add(part);
    st.loaded = seen.size === 2;
    onState({ ...st });
  };
  const offs = [
    db.doc('habit/me').onSnapshot((s) => { st.habit = s.exists ? s.data() : null; emit('habit', s); }, onError),
    db.collection('days').onSnapshot((s) => {
      st.days = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      emit('days', s);
    }, onError),
  ];
  return () => offs.forEach((off) => off());
}

// Longest side 1280px JPEG: a phone photo drops from ~4MB to ~200KB.
async function shrink(file, max = 1280) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('사진을 읽을 수 없어요 (JPG/PNG로 찍어주세요)'); }
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('사진 변환 실패'))), 'image/jpeg', 0.8));
}

export function makeActions(db, assets, getState) {
  const ready = () => {
    const s = getState();
    if (!s?.loaded) throw new Error('데이터를 아직 불러오는 중이에요');
    return s;
  };
  return {
    async setHabit({ title, character }) {
      const s = ready();
      const t = String(title ?? '').trim().slice(0, MAX_TITLE);
      if (!t) throw new Error('습관 이름을 적어주세요');
      const c = CHARACTERS.some((x) => x.id === character) ? character : CHARACTERS[0].id;
      await db.doc('habit/me').set({ seenFall: null, ...s.habit, title: t, character: c });
    },

    // Upload first, then record the day; a failed upload changes nothing.
    // Retaking today's photo replaces it and deletes the old asset.
    // onUploaded fires just before the db write, whose snapshot adds the block.
    async certify(file, onUploaded) {
      const s = ready();
      if (!assets) throw new Error('사진 저장을 쓸 수 없어요');
      const key = todayKST();
      const old = s.days[key]?.assetId;
      const { id } = await assets.upload(await shrink(file), { type: 'image/jpeg' });
      onUploaded?.({ retake: !!old });
      try {
        await db.doc(`days/${key}`).set({ assetId: id, at: new Date().toISOString() });
      } catch (e) {
        assets.delete(id).catch(() => {});
        throw e;
      }
      // ponytail: a failed delete leaves one orphan photo in the asset store; harmless.
      if (old) assets.delete(old).catch(() => {});
      return { retake: !!old };
    },

    async ackFall(endKey) {
      const s = ready();
      await db.doc('habit/me').set({ ...s.habit, seenFall: endKey });
    },
  };
}

// ?dev&seed=fall|30|album — fake history for checking animations locally.
const SEEDS = {
  fall: [[-13, 12]],          // 12 floors, missed yesterday → collapse
  30: [[-29, 29]],            // 29 floors through yesterday → today's photo tops it out
  album: [[-80, 30], [-45, 7], [-4, 5]],
};
async function seedDev(db, kind) {
  const spans = SEEDS[kind];
  if (!spans) return;
  const today = todayKST();
  let n = 0;
  for (const [start, len] of spans) {
    for (let i = 0; i < len; i++) {
      const key = addDays(today, start + i), id = `seed${n++}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="hsl(${(n * 37) % 360} 55% 65%)"/><text x="50%" y="55%" font-size="40" text-anchor="middle" fill="#fff">${key.slice(5)}</text></svg>`;
      devUrls.set(id, 'data:image/svg+xml,' + encodeURIComponent(svg));
      await db.doc(`days/${key}`).set({ assetId: id, at: '' });
    }
  }
  await db.doc('habit/me').set({ title: '운동 30분', character: 'warrior', seenFall: null });
}

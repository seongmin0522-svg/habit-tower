// All persistence goes through here. The page never writes to db or assets directly.
import { todayKST, addDays, shieldsLeft, boxes, roll, owned } from './logic.js';
import { REWARDS_FROM, POOL, COUPLE_POOL, ITEMS, TITLES, MONSTERS, SKINS } from './catalog.js';
import { CHARACTERS } from './ui/sprites.js';
import { shrink } from './image.js';

const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const MAX_TITLE = 40;
const devUrls = new Map(); // dev and phone modes: asset id -> object/data URL

// Boxes count from launch day; ?dev seeds live in the past, so there every photo day counts.
export const rewardsFrom = DEV ? '' : REWARDS_FROM;

// Where data lives: claude.ai Artifact (db + assets), ?dev (in memory), or the phone (IndexedDB PWA).
export const MODE = window.claude?.use ? 'artifact' : DEV ? 'dev' : window.indexedDB ? 'local' : 'none';

// Artifact assets serve at /_blob/<id>; dev and phone photos are object URLs.
// small: the brick-size copy when there is one (phone storage makes them; see localdb.js).
export const photoUrl = (id, small) => (small && devUrls.get('t:' + id)) || (devUrls.get(id) ?? `/_blob/${id}`);

let local; // one IndexedDB connection shared by db, assets and backup
const openLocalOnce = () => (local ??= import('./localdb.js').then((m) => m.openLocal(devUrls)));
export const localBackup = () => (MODE === 'local' ? openLocalOnce().then((l) => l.backup) : Promise.resolve(null));
export const localStore = () => (MODE === 'local' ? openLocalOnce() : Promise.resolve(null));

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

// `loaded` flips true only after server-definitive snapshots of all four sources.
export function subscribe(db, onState, onError) {
  const st = { habit: null, days: {}, pulls: {}, pets: {}, loaded: false };
  const seen = new Set();
  const emit = (part, s) => {
    if (!s.metadata.fromCache) seen.add(part);
    st.loaded = seen.size === 4;
    onState({ ...st });
  };
  const offs = [
    db.doc('habit/me').onSnapshot((s) => { st.habit = s.exists ? s.data() : null; emit('habit', s); }, onError),
    db.collection('days').onSnapshot((s) => {
      st.days = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      emit('days', s);
    }, onError),
    db.collection('pulls').onSnapshot((s) => {
      st.pulls = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      emit('pulls', s);
    }, onError),
    db.collection('pets').onSnapshot((s) => {
      st.pets = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      emit('pets', s);
    }, onError),
  ];
  return () => offs.forEach((off) => off());
}

export function makeActions(db, assets, getState) {
  const ready = () => {
    const s = getState();
    if (!s?.loaded) throw new Error('데이터를 아직 불러오는 중이에요');
    return s;
  };
  let petWrites = Promise.resolve(); // feeds write one after another: each reads the doc the last one wrote
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
        await db.doc(`days/${key}`).set({ ...s.days[key], assetId: id, at: new Date().toISOString() }); // a retake keeps the note
      } catch (e) {
        assets.delete(id).catch(() => {});
        throw e;
      }
      // ponytail: a failed delete leaves one orphan photo in the asset store; harmless.
      if (old) assets.delete(old).catch(() => {});
      return { retake: !!old };
    },

    async setNote(key, note) {
      const s = ready();
      if (!s.days[key]?.assetId) throw new Error('인증한 날에만 남길 수 있어요');
      await db.doc(`days/${key}`).set({ ...s.days[key], note: String(note ?? '').trim().slice(0, 40) });
    },

    // Fill a missed day so the tower stands again; limited per month (logic.js shieldsLeft).
    async useShield(key) {
      const s = ready();
      if (s.days[key]?.assetId || s.days[key]?.shield) return;
      if (!shieldsLeft(s.days, key)) throw new Error('이번 달 방어권을 이미 썼어요');
      await db.doc(`days/${key}`).set({ shield: true, at: new Date().toISOString() });
    },

    // Open one box: the result is saved before anything shows, so closing the app mid-reveal can't reroll it.
    // cdays: couple days (only once the partner is synced), for 'c:' boxes.
    async openBox(box, cdays = {}) {
      const s = ready();
      if (s.pulls[box]) return s.pulls[box];
      if (!boxes({ days: s.days, cdays, pulls: s.pulls, from: rewardsFrom }).includes(box)) throw new Error('열 수 있는 상자가 아니에요');
      const r = [...crypto.getRandomValues(new Uint32Array(3))].map((n) => n / 2 ** 32);
      const { item, shiny } = roll(box.startsWith('c:') ? COUPLE_POOL : POOL, r);
      const doc = { item: item.id, shiny, dup: owned(s.pulls).has(item.id + (shiny ? '*' : '')), at: new Date().toISOString() };
      await db.doc(`pulls/${box}`).set(doc);
      return doc;
    },

    // What I wear: habit/me.look = {monster, shiny, char, bg, brick, flag, badge}; null = the default.
    async equip(patch) {
      const s = ready();
      const have = owned(s.pulls);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || k === 'shiny') continue;
        const ok = k === 'badge' ? TITLES.some((t) => t.id === v)
          : k === 'monster' ? have.has(v + (patch.shiny ? '*' : ''))
          : have.has(v) && ITEMS.get(v)?.kind === k && !ITEMS.get(v).couple;
        if (!ok) throw new Error('아직 없는 아이템이에요');
      }
      await db.doc('habit/me').set({ ...s.habit, look: { ...s.habit?.look, ...patch } });
    },

    // Hearts for a pet: pets/<monsterId> = {gained, lost}. Both only grow; hearts = gained − lost.
    // Reads the doc itself, not React state, so two quick feeds can't overwrite each other.
    // async so a not-ready or bad call rejects instead of throwing inside the playroom's animation loop.
    async feedPet(id, n) {
      ready();
      if (!ITEMS.get(id)?.base || !(n > 0)) throw new Error('먹이를 줄 수 없어요');
      const run = petWrites.then(async () => {
        const ref = db.doc(`pets/${id}`), snap = await ref.get(), p = snap.exists ? snap.data() : {};
        await ref.set({ ...p, gained: (p.gained ?? 0) + n, lost: p.lost ?? 0 });
      });
      petWrites = run.catch(() => {});
      return run;
    },

    // Day markers on habit/me: seenFall / seenCoupleFall (collapse shown), cutMe / cutCouple (started over).
    async mark(field, key) {
      const s = ready();
      await db.doc('habit/me').set({ ...s.habit, [field]: key });
    },
  };
}

// ?dev&seed=fall|30|album|boxes|bag — fake history for checking animations locally.
const SEEDS = {
  boxes: [[-6, 6]],           // 6 unopened boxes, today not certified yet
  bag: [[-6, 6]],             // same, plus a half-full collection
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
  if (kind === 'bag') {
    const got = [...MONSTERS.filter((_, i) => i % 2 === 0), ...SKINS.filter((_, i) => i % 3 === 0)];
    for (const [i, it] of got.entries()) await db.doc(`pulls/b:${1000 + i}`).set({ item: it.id, shiny: i % 7 === 0 && !!it.base, dup: false, at: '' });
    for (let i = 0; i < 7; i++) await db.doc(`pulls/b:${2000 + i}`).set({ item: 'snail-green', shiny: false, dup: true, at: '' });
  }
  await db.doc('habit/me').set({ title: '운동 30분', character: 'warrior', seenFall: null });
}

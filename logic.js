// Pure logic for Habit Tower. No DOM, no db — everything here is unit-tested.
// Day keys are 'YYYY-MM-DD' strings in Korea time. A day counts when it has a photo.

const kstFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const todayKST = (now = new Date()) => kstFormat.format(now);

export function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export const TOWER_HEIGHT = 30;

export const MONSTERS = [
  { id: 'snail', name: '달팽이' }, { id: 'mushroom', name: '버섯' }, { id: 'slime', name: '슬라임' },
  { id: 'bat', name: '박쥐' }, { id: 'pig', name: '돼지' }, { id: 'skeleton', name: '해골' },
  { id: 'golem', name: '골렘' }, { id: 'dragon', name: '드래곤' },
];

// The monster buddy grows up every 4 floors and starts over when the tower falls.
export const buddyFor = (floors) => MONSTERS[Math.min(Math.floor(Math.max(floors - 1, 0) / 4), MONSTERS.length - 1)];

// Consecutive certified days, oldest first.
export function runs(days) {
  const out = [];
  for (const k of Object.keys(days).filter((k) => days[k]?.assetId).sort()) {
    const last = out.at(-1);
    if (last && addDays(last.end, 1) === k) { last.end = k; last.keys.push(k); } else out.push({ start: k, end: k, keys: [k] });
  }
  return out;
}

const chunks = (keys) => Array.from({ length: Math.ceil(keys.length / TOWER_HEIGHT) },
  (_, i) => keys.slice(i * TOWER_HEIGHT, (i + 1) * TOWER_HEIGHT));

// current = tower being built by the run ending today/yesterday (30 keys = flag day).
// past = finished towers, newest first: 'built' (30 floors) or 'fell' (run broke first).
export function towers(days, today) {
  const rs = runs(days);
  const live = rs.length && daysBetween(rs.at(-1).end, today) <= 1 ? rs.pop() : null;
  const past = [];
  for (const r of rs) for (const keys of chunks(r.keys)) past.push({ keys, kind: keys.length === TOWER_HEIGHT ? 'built' : 'fell' });
  let current = null;
  if (live) {
    const cs = chunks(live.keys);
    current = { keys: cs.pop() };
    for (const keys of cs) past.push({ keys, kind: 'built' });
  }
  return { current, past: past.reverse() };
}

// The newest broken tower whose collapse hasn't been shown yet.
export function pendingFall(days, today, seenFall) {
  const { current, past } = towers(days, today);
  const t = past[0];
  return !current && t?.kind === 'fell' && t.keys.at(-1) !== seenFall ? t : null;
}

// Backup files come from outside the app: accept only our own doc paths, plain-object bodies
// and image data URLs, so a bad or tampered file can't write anything else.
const DOC_PATH = /^(habit\/me|days\/\d{4}-\d{2}-\d{2})$/;
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validBackup(b) {
  return isPlain(b) && b.version === 1 && Array.isArray(b.docs) && Array.isArray(b.photos)
    && b.docs.every((d) => Array.isArray(d) && typeof d[0] === 'string' && DOC_PATH.test(d[0]) && isPlain(d[1]))
    && b.photos.every((p) => Array.isArray(p) && typeof p[0] === 'string' && p[0].length < 100
      && typeof p[1] === 'string' && p[1].startsWith('data:image/'));
}

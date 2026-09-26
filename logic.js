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

// Calendar: 'YYYY-MM' months. monthGrid = Sunday-first weeks of day keys, null outside the month.
export function monthGrid(ym) {
  const first = new Date(ym + '-01T00:00:00Z');
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(first.getUTCDay()).fill(null),
    ...Array.from({ length }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
export function addMonths(ym, n) {
  const d = new Date(ym + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
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

// Consecutive certified days, oldest first. cut: the day the user chose to start over — a run ends there.
// A shield day keeps a run going without adding a floor (it's in end, not in keys), and starts nothing by itself.
export function runs(days, cut) {
  const out = [];
  for (const k of Object.keys(days).filter((k) => days[k]?.assetId || days[k]?.shield).sort()) {
    const last = out.at(-1), photo = !!days[k].assetId;
    if (last && addDays(last.end, 1) === k && last.end !== cut) { last.end = k; if (photo) last.keys.push(k); }
    else if (photo) out.push({ start: k, end: k, keys: [k] });
  }
  return out;
}

const chunks = (keys) => Array.from({ length: Math.ceil(keys.length / TOWER_HEIGHT) },
  (_, i) => keys.slice(i * TOWER_HEIGHT, (i + 1) * TOWER_HEIGHT));

// current = tower being built by the run ending today/yesterday (30 keys = flag day).
// past = finished towers, newest first: 'built' (30 floors), 'reset' (started over at cut) or 'fell' (run broke first).
export function towers(days, today, cut) {
  const rs = runs(days, cut);
  const tail = rs.at(-1);
  const live = tail && tail.end !== cut && daysBetween(tail.end, today) <= 1 ? rs.pop() : null;
  const past = [];
  for (const r of rs) {
    for (const keys of chunks(r.keys)) {
      past.push({ keys, end: r.end, kind: keys.length === TOWER_HEIGHT ? 'built' : r.end === cut ? 'reset' : 'fell' });
    }
  }
  let current = null;
  if (live) {
    const cs = chunks(live.keys);
    current = { keys: cs.pop() };
    for (const keys of cs) past.push({ keys, kind: 'built' });
  }
  return { current, past: past.reverse() };
}

// The newest broken tower whose collapse hasn't been shown yet.
export function pendingFall(days, today, seenFall, cut) {
  const { current, past } = towers(days, today, cut);
  const t = past[0];
  return !current && t?.kind === 'fell' && t.keys.at(-1) !== seenFall ? t : null;
}

// Couple tower: days we both certified. The brick shows my photo left, my partner's right.
// A day where each of us has a photo or a shield, and at least one shield, bridges the couple tower too.
export function coupleDays(mine, theirs) {
  const out = {};
  for (const [k, d] of Object.entries(mine)) {
    const t = theirs[k];
    if (d?.assetId && t?.assetId) out[k] = { assetId: d.assetId, partnerAssetId: t.assetId };
    else if ((d?.assetId || d?.shield) && (t?.assetId || t?.shield)) out[k] = { shield: true };
  }
  return out;
}

// Shields: one a month (by the missed day's month) can fill the single day that broke a tower —
// only yesterday, since one shield can't cover a longer gap. t: a fallen tower from towers()/pendingFall().
export const SHIELDS_PER_MONTH = 1;
export function shieldDay(t, today) {
  const gap = addDays(t.end, 1);
  return daysBetween(gap, today) === 1 ? gap : null;
}
export const shieldsLeft = (days, day) => Math.max(0, SHIELDS_PER_MONTH
  - Object.keys(days).filter((k) => k.slice(0, 7) === day.slice(0, 7) && days[k]?.shield && !days[k]?.assetId).length);

// Cloud copy of my photo: '<user id>/<asset id>.jpg'. mine: day -> cloud path, as last seen.
export const photoPath = (uid, assetId) => `${uid}/${assetId}.jpg`;
export const toUpload = (days, mine, uid) =>
  Object.keys(days).filter((k) => days[k]?.assetId && mine[k] !== photoPath(uid, days[k].assetId)).sort();

// The rest of cloud.js's decisions; it only does the calls. rows: my cloud days {day, photo_path, at, note, shield}.
// Cloud rows this phone lacks (a new phone), with the local doc to write and the photo to download.
export const toRestore = (rows, have) => rows.filter((r) => !have[r.day]).map((r) => (r.photo_path
  ? { day: r.day, path: r.photo_path,
      doc: { assetId: r.photo_path.split('/')[1].replace(/\.jpg$/, ''), at: r.at ?? '', ...(r.note && { note: r.note }) } }
  : { day: r.day, path: null, doc: { shield: true, at: r.at ?? '' } }));

export function shieldsToPush(days, rows) {
  const known = new Set(rows.map((r) => r.day));
  return Object.keys(days).filter((k) => days[k]?.shield && !days[k]?.assetId && !known.has(k)).sort();
}

// Notes edited after their photo went up (a photo still to upload carries its note along).
export const notesToPush = (days, mine, notes, uid) => Object.keys(days).filter((k) => days[k]?.assetId
  && mine[k] === photoPath(uid, days[k].assetId) && (days[k].note ?? '') !== (notes[k] ?? '')).sort();

export function splitReactions(rows, uid) {
  const got = {}, gave = {};
  for (const r of rows) (r.owner === uid ? got : gave)[r.day] = r.emoji;
  return { got, gave };
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

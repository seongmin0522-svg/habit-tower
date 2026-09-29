// Pure logic for Habit Tower. No DOM, no db — everything here is unit-tested.
// Day keys are 'YYYY-MM-DD' strings in Korea time. A day counts when it has a photo.
import { TIERS, SHINY_RATE, DUPS_PER_BONUS, STARTER, ITEMS, MONSTERS } from './catalog.js';
import { levelOf, heartsOf, STAR_FULL } from './pet.js';

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

// Today's couple brick while only one of us has certified: that photo on its side ('l' mine, 'r' my partner's).
// It is drawn on top of the couple tower but is not a floor.
export function halfBrick(mine, theirs, today) {
  const a = mine[today]?.assetId, b = theirs[today]?.assetId;
  if (!a === !b) return null;
  return a ? { side: 'l', assetId: a } : { side: 'r', assetId: b };
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
const DOC_PATH = /^(habit\/me|days\/\d{4}-\d{2}-\d{2}|pulls\/([dc]:\d{4}-\d{2}-\d{2}|b:\d{1,5}|p:[a-z]+-[a-z]+:\d{1,2})|pets\/[a-z]+-[a-z]+)$/;
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validBackup(b) {
  return isPlain(b) && b.version === 1 && Array.isArray(b.docs) && Array.isArray(b.photos)
    && b.docs.every((d) => Array.isArray(d) && typeof d[0] === 'string' && DOC_PATH.test(d[0]) && isPlain(d[1]))
    && b.photos.every((p) => Array.isArray(p) && typeof p[0] === 'string' && p[0].length < 100
      && typeof p[1] === 'string' && p[1].startsWith('data:image/'));
}

// Rewards. A pull is pulls/<box> = {item, shiny, dup, at}; box ids: 'd:<day>' (my photo day),
// 'c:<day>' (we both certified), 'b:<n>' (bonus for every 10 duplicates).
// r: three random numbers in [0, 1) — tier, item within the tier, shiny.
export function roll(pool, [r1, r2, r3]) {
  const tiers = TIERS.filter((t) => pool.some((i) => i.tier === t.id));
  let x = r1 * tiers.reduce((a, t) => a + t.weight, 0), tier = tiers.at(-1);
  for (const t of tiers) { if (x < t.weight) { tier = t; break; } x -= t.weight; }
  const items = pool.filter((i) => i.tier === tier.id);
  const item = items[Math.min(Math.floor(r2 * items.length), items.length - 1)];
  return { item, shiny: !!item.base && r3 < SHINY_RATE };
}

// Box reveal: after `taps` taps a box still shut is at least the tier whose lower neighbor would have opened by now.
export function glowAt(taps) {
  let g = null;
  for (let i = 1; i < TIERS.length; i++) if (taps >= TIERS[i - 1].taps) g = TIERS[i].id;
  return g;
}

// What I have: item ids, a shiny monster as 'id*'. The starter snail comes free.
// pets: a pet with a full star gauge (STAR_FULL hearts) has its shiny form too.
export const owned = (pulls, pets = {}) => new Set([STARTER,
  ...Object.values(pulls).filter((p) => p?.item).map((p) => p.item + (p.shiny ? '*' : '')),
  ...Object.keys(pets).filter((id) => heartsOf(pets[id]) >= STAR_FULL).map((id) => id + '*')]);

const dupCount = (pulls) => Object.values(pulls).filter((p) => p?.dup).length;
export const shards = (pulls) => dupCount(pulls) % DUPS_PER_BONUS;

// Unopened boxes, oldest day first, then pet level boxes ('p:<monsterId>:<level>', levels 2+), bonus boxes last.
// Counted from the records, never stored.
export function boxes({ days, cdays, pulls, from, pets = {} }) {
  const dated = [
    ...Object.keys(days).filter((k) => days[k]?.assetId && k >= from).map((k) => 'd:' + k),
    ...Object.keys(cdays).filter((k) => cdays[k]?.partnerAssetId && k >= from).map((k) => 'c:' + k),
  ].sort((a, b) => (a.slice(2) + a[0]).localeCompare(b.slice(2) + b[0]));
  const bonus = Array.from({ length: Math.floor(dupCount(pulls) / DUPS_PER_BONUS) }, (_, i) => 'b:' + i);
  const levels = Object.keys(pets).sort().flatMap((id) =>
    Array.from({ length: levelOf(heartsOf(pets[id])) - 1 }, (_, i) => `p:${id}:${i + 2}`));
  return [...dated, ...levels, ...bonus].filter((b) => !pulls[b]);
}

const fullTowers = (days, today) => {
  const { current, past } = towers(days, today);
  return [...past.filter((t) => t.kind === 'built'), ...(current?.keys.length === TOWER_HEIGHT ? [current] : [])];
};
export function titles({ days, cdays, pulls, today }) {
  const out = new Set();
  const photos = Object.keys(days).filter((k) => days[k]?.assetId).length;
  const rs = runs(days);
  const built = fullTowers(days, today);
  const got = Object.values(pulls).filter((p) => p?.item);
  const species = new Set([STARTER, ...got.map((p) => p.item)].filter((id) => ITEMS.get(id)?.base)).size;
  if (photos >= 1) out.add('first');
  if (rs.some((r) => r.keys.length >= 7)) out.add('week');
  if (built.length >= 1) out.add('tower');
  if (built.length >= 3) out.add('towers3');
  if (built.some((t) => daysBetween(t.keys[0], t.keys.at(-1)) === TOWER_HEIGHT - 1)) out.add('straight'); // no shield gaps
  if (photos >= 100) out.add('days100');
  if (rs.some((r, i) => i > 0 && r.keys.length >= 7)) out.add('comeback');
  if (got.some((p) => p.shiny)) out.add('shiny');
  if (got.some((p) => ITEMS.get(p.item)?.tier === 'legend')) out.add('legend');
  if (species >= 50) out.add('dex50');
  if (species >= MONSTERS.length) out.add('dex100');
  if (fullTowers(cdays, today).length) out.add('couple');
  return out;
}

// rows: my cloud pulls {box, item, shiny, dup, at}.
export function pullsToPush(pulls, rows) {
  const known = new Set(rows.map((r) => r.box));
  return Object.keys(pulls).filter((b) => !known.has(b)).sort();
}
export const pullsToRestore = (rows, pulls) => rows.filter((r) => !pulls[r.box])
  .map((r) => ({ box: r.box, doc: { item: r.item, shiny: !!r.shiny, dup: !!r.dup, at: r.at ?? '' } }));

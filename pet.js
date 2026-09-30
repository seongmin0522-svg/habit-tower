// Pet playroom rules: throw physics, judgement, hearts. Pure: no DOM, no storage.
// World: x across the field (−1 left … 1 right), z depth (0 = my hand, 1 = far), y height.
// 1 world unit = half the screen width at z = 0. Time in seconds.
// Spec: docs/superpowers/specs/2026-09-29-pet-playroom-design.md
import { ACCESSORIES, ITEMS, TASTES } from './catalog.js';

// Every feel number lives here, to tune after the phone test.
export const THROW = {
  sampleMs: 100, // the release velocity comes from the last 100ms of the drag
  minUp: 1,      // screen widths per second upward; slower is a push, not a throw
  kx: 0.3, ky: 0.275, kz: 0.2, // flick speed (widths/s) -> world velocity
  y0: 0.15,      // release height
  gravity: 3,
  spinAcc: 0.8,  // sideways pull of a curve ball
  spinTurn: 1.8 * Math.PI, // about a full circle (sloppy fingers allowed) makes a curve ball
  bands: [['excellent', 0.06], ['great', 0.12], ['nice', 0.2]], // landing distance from the pet
};
export const FOOD_HEARTS = { excellent: 5, great: 3, nice: 2, miss: 1 };

// samples: pointer positions {x, y, t} in px and ms, oldest first. width: the screen width in px.
// Returns the world velocity {x, y, z}, or null when the finger didn't flick upward.
export function flick(samples, width) {
  const last = samples.at(-1);
  if (!last) return null;
  // The last sample at or before the window's start, so the span is at least sampleMs even when events are sparse.
  const first = samples.findLast((s) => s.t <= last.t - THROW.sampleMs) ?? samples[0];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return null;
  const up = (first.y - last.y) / width / dt, side = (last.x - first.x) / width / dt;
  if (up < THROW.minUp) return null;
  return { x: side * THROW.kx, y: up * THROW.ky, z: up * THROW.kz };
}

// Curve ball: 1 (clockwise on screen) or −1 when the finger circled about a full turn during the drag, else 0.
export function spinOf(samples) {
  let turn = 0, prev = null;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x, dy = samples[i].y - samples[i - 1].y;
    if (Math.hypot(dx, dy) < 2) continue; // jitter
    const a = Math.atan2(dy, dx);
    if (prev != null) turn += ((a - prev + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    prev = a;
  }
  return Math.abs(turn) >= THROW.spinTurn ? Math.sign(turn) : 0;
}

// Where the item is t seconds after release, thrown from x = 0.
export const at = (v, spin, t) => ({
  x: v.x * t + 0.5 * spin * THROW.spinAcc * t * t,
  y: THROW.y0 + v.y * t - 0.5 * THROW.gravity * t * t,
  z: v.z * t,
});

// When and where the item touches the ground (y = 0).
export function landing(v, spin) {
  const g = THROW.gravity, t = (v.y + Math.sqrt(v.y * v.y + 2 * g * THROW.y0)) / g;
  return { ...at(v, spin, t), y: 0, t };
}

// land, pet: ground points {x, z}.
export function judge(land, pet) {
  const d = Math.hypot(land.x - pet.x, land.z - pet.z);
  return THROW.bands.find(([, r]) => d <= r)?.[0] ?? 'miss';
}

// Daily limits (per phone, reset at local midnight): food pieces, toy hearts, petting hearts.
export const DAILY = { food: 5, toyHearts: 10, pet: 1, battles: 3 };

// Levels: Lv n -> n+1 takes 10 + 5(n − 1) hearts, Lv 1–10 (270 hearts). The star gauge ends at 770 (shiny).
export const MAX_LEVEL = 10, STAR_FULL = 770, WAKE_LOSS = 3;
export const levelStart = (n) => 10 * (n - 1) + (5 * (n - 1) * (n - 2)) / 2;
export function levelOf(hearts) {
  let n = 1;
  while (n < MAX_LEVEL && levelStart(n + 1) <= hearts) n++;
  return n;
}

// Waking a sleeping pet costs up to WAKE_LOSS hearts, but never drops a level or undoes a full star gauge.
export function wakeLoss(hearts) {
  const floor = hearts >= STAR_FULL ? STAR_FULL : levelStart(levelOf(hearts));
  return Math.max(0, Math.min(WAKE_LOSS, hearts - floor));
}

// The hour (0–23) in tz, or on the phone's clock when tz is left out.
export const localHour = (now = new Date(), tz = undefined) => (tz === undefined ? now.getHours()
  : Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now)));

// 23:00–05:59 local time: the pet sleeps.
export function isNight(now = new Date(), tz = undefined) {
  const h = localHour(now, tz);
  return h >= 23 || h < 6;
}

// play/<day> = {food: [kinds left], fed, toyHearts, petted}.
// rollFood: one piece per random number in [0, 1): cake under CAKE_RATE, else apple/meat/fish evenly.
export const CAKE_RATE = 0.1;
export const rollFood = (rs) => rs.map((r) => (r < CAKE_RATE ? 'cake' : ['apple', 'meat', 'fish'][Math.min(2, Math.floor(((r - CAKE_RATE) / (1 - CAKE_RATE)) * 3))]));
// The day's food, rolled once. A day started before food kinds (only `fed`) rolls what's left of it.
export const dayFood = (play, rs) => (play.food ? play : { ...play, food: rollFood(rs.slice(0, Math.max(0, DAILY.food - (play.fed ?? 0)))) });
// The day's record after one piece of that kind leaves the tray, or null when there's none.
export function useFood(play, kind) {
  const i = play.food?.indexOf(kind) ?? -1;
  if (i < 0) return null;
  return { ...play, food: play.food.filter((_, j) => j !== i), fed: (play.fed ?? 0) + 1 };
}

// 'like' | 'hate' | null for a monster and a food.
export function tasteOf(monsterId, food) {
  if (food === 'cake') return 'like';
  const t = TASTES[ITEMS.get(monsterId)?.base];
  return t?.like === food ? 'like' : t?.hate === food ? 'hate' : null;
}
export const foodHearts = (judgement, taste) => (taste === 'hate' ? 0 : FOOD_HEARTS[judgement] * (taste === 'like' ? 2 : 1));

// Battles: only the first DAILY.battles of a day count toward a pet's ⚔️ wins.
export const countBattle = (play) => ((play.battles ?? 0) >= DAILY.battles
  ? { counted: false, play } : { counted: true, play: { ...play, battles: (play.battles ?? 0) + 1 } });

// How many of n hearts a kind of play may still give today, and the day's record after it.
// 'food' is limited by useFood at the throw, 'toy' by the daily toy hearts, 'pet' to once a day.
export function grant(play, kind, n) {
  if (kind === 'toy') {
    const got = Math.max(0, Math.min(n, DAILY.toyHearts - (play.toyHearts ?? 0)));
    return { n: got, play: { ...play, toyHearts: (play.toyHearts ?? 0) + got } };
  }
  if (kind === 'pet') return play.petted ? { n: 0, play } : { n: Math.min(n, DAILY.pet), play: { ...play, petted: true } };
  return { n, play };
}

// pets: {<monsterId>: {gained, lost}} docs.
export const heartsOf = (p) => (p?.gained ?? 0) - (p?.lost ?? 0);
export function accsUnlocked(pets) {
  const top = Math.max(1, ...Object.values(pets).map((p) => levelOf(heartsOf(p))));
  return new Set(ACCESSORIES.filter((a) => top >= a.level).map((a) => a.id));
}

// Cloud sync. rows: my cloud pets {monster, gained, lost, tastes, wins}. Both counters only grow, so per pet the larger of
// each wins: push rows the cloud is behind on, restore docs the phone is behind on.
export function mergePets(local, rows) {
  const cloud = Object.fromEntries(rows.map((r) => [r.monster, r]));
  const push = [], restore = [];
  for (const id of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const l = local[id], c = cloud[id], tastes = { ...c?.tastes, ...l?.tastes }, n = Object.keys(tastes).length;
    const wins = Math.max(l?.wins ?? 0, c?.wins ?? 0);
    const m = { gained: Math.max(l?.gained ?? 0, c?.gained ?? 0), lost: Math.max(l?.lost ?? 0, c?.lost ?? 0), ...(n ? { tastes } : {}), ...(wins ? { wins } : {}) };
    const behind = (x) => !x || (x.gained ?? 0) !== m.gained || (x.lost ?? 0) !== m.lost || (x.wins ?? 0) !== wins
      || Object.keys(x.tastes ?? {}).length !== n;
    if (behind(l)) restore.push({ id, doc: { ...l, ...m } });
    if (behind(c)) push.push({ monster: id, ...m });
  }
  return { push, restore };
}

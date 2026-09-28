// Pet playroom rules: throw physics, judgement, hearts. Pure: no DOM, no storage.
// World: x across the field (−1 left … 1 right), z depth (0 = my hand, 1 = far), y height.
// 1 world unit = half the screen width at z = 0. Time in seconds.
// Spec: docs/superpowers/specs/2026-09-29-pet-playroom-design.md

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

// Daily limits (per phone, reset at KST midnight): food pieces, toy hearts, petting hearts.
export const DAILY = { food: 5, toyHearts: 10, pet: 1 };

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

// 23:00–05:59 KST: the pet sleeps.
export function isNight(now = new Date()) {
  const h = (now.getUTCHours() + 9) % 24;
  return h >= 23 || h < 6;
}

// play/<day> = {fed, toyHearts, petted}. useFood: the day's record after one more piece, or null when none are left.
export const useFood = (play) => ((play.fed ?? 0) >= DAILY.food ? null : { ...play, fed: (play.fed ?? 0) + 1 });

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

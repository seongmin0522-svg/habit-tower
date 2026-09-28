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

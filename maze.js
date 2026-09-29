// Daily fog maze (spec: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md). Pure.
// Rooms are [x, y], y down; the start is bottom-left, the exit top-right. open[y * SIZE + x] holds a bit per open side.
export const SIZE = 15, VISION = 2;
const BIT = { up: 1, right: 2, down: 4, left: 8 };
export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const BACK = { up: 'down', right: 'left', down: 'up', left: 'right' };

// Seeded randomness from the day, so everyone gets the same maze that day (FNV-1a hash into mulberry32).
function rngOf(day) {
  let a = 2166136261;
  for (const c of day) a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Recursive backtracker (depth-first carving): a perfect maze, one path between any two rooms, long winding corridors.
export function mazeOf(day) {
  const rng = rngOf(day), open = new Array(SIZE * SIZE).fill(0), seen = new Set();
  const start = [0, SIZE - 1], stack = [start];
  seen.add(start.join());
  while (stack.length) {
    const [x, y] = stack.at(-1);
    const next = Object.entries(DIRS).filter(([, [dx, dy]]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && !seen.has(`${nx},${ny}`);
    });
    if (!next.length) { stack.pop(); continue; }
    const [dir, [dx, dy]] = next[Math.floor(rng() * next.length)];
    const nx = x + dx, ny = y + dy;
    open[y * SIZE + x] |= BIT[dir];
    open[ny * SIZE + nx] |= BIT[BACK[dir]];
    seen.add(`${nx},${ny}`);
    stack.push([nx, ny]);
  }
  return { open, start, exit: [SIZE - 1, 0] };
}

export const isOpen = (m, [x, y], dir) => !!(m.open[y * SIZE + x] & BIT[dir]);
// The room one step that way, or null into a wall.
export const step = (m, p, dir) => (isOpen(m, p, dir) ? [p[0] + DIRS[dir][0], p[1] + DIRS[dir][1]] : null);
export const inSight = ([px, py], [x, y]) => Math.max(Math.abs(px - x), Math.abs(py - y)) <= VISION;

// Clears: local maze/<day> docs {ms, at} and cloud rows {day, ms, at}; per day the faster time wins.
export function mergeClears(local, rows) {
  const cloud = Object.fromEntries(rows.map((r) => [r.day, r]));
  return {
    restore: rows.filter((r) => !local[r.day] || r.ms < local[r.day].ms).map((r) => [r.day, { ms: r.ms, at: r.at ?? '' }]),
    push: Object.entries(local).filter(([d, c]) => !cloud[d] || c.ms < cloud[d].ms).map(([day, c]) => ({ day, ms: c.ms, at: c.at })),
  };
}

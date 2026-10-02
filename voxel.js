// Voxel figures from pixel art (spec: docs/superpowers/specs/2026-10-03-voxel-tower-design.md). Pure.
// cells: [x, y, color] as the 2D art paints them (y down; x/y may go outside 0..15 for accessories).
// Returns cubes [x, y, z, color] centred on x, standing on y = 0 (y up), z = 0 the middle layer.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DETAIL = new Set(['#2b1d14', '#ffffff']); // ink and white: face details

export function voxelize(cells, round = true) {
  const at = new Map(cells.map(([x, y, c]) => [`${x},${y}`, c]));
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), w = Math.max(...xs) - x0 + 1, y1 = Math.max(...ys);
  const on = (x, y) => at.has(`${x},${y}`);
  // d: distance to the nearest empty cell, 1 on the rim (breadth-first from the rim inward).
  const d = new Map(), q = [];
  for (const [x, y] of cells) if (N4.some(([a, b]) => !on(x + a, y + b))) { d.set(`${x},${y}`, 1); q.push([x, y]); }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i], k = d.get(`${x},${y}`);
    for (const [a, b] of N4) {
      const nx = x + a, ny = y + b, key = `${nx},${ny}`;
      if (on(nx, ny) && !d.has(key)) { d.set(key, k + 1); q.push([nx, ny]); }
    }
  }
  // Seen from behind, a face detail takes the most common body colour within 3 cells.
  const body = (x, y) => {
    const n = new Map();
    for (let r = 1; r <= 3; r++) for (const [a, b] of N4) {
      const c = at.get(`${x + a * r},${y + b * r}`);
      if (c && !DETAIL.has(c)) n.set(c, (n.get(c) ?? 0) + 1);
    }
    return [...n].sort((p, o) => o[1] - p[1])[0]?.[0];
  };
  const out = [];
  for (const [x, y, col] of cells) {
    const dd = d.get(`${x},${y}`), half = round ? Math.min(dd, 4) - 1 : 1;
    const back = dd > 1 && DETAIL.has(col) ? body(x, y) ?? col : col;
    for (let z = -half; z <= half; z++) out.push([x - x0 - w / 2 + 0.5, y1 - y + 0.5, z, z < 0 ? back : col]);
  }
  return out;
}

// The two colours of a background skin's grass gradient, or null.
export const grassOf = (css) => css?.match(/#[0-9a-f]{3,8}/gi)?.slice(0, 2) ?? null;

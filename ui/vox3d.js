// Shared voxel pieces for the 3D screens: small props drawn as pixel art (food, the ball, a heart), a model builder
// with a little colour variation per cube (flat colours look like plastic), and a particle system for bursts of
// crumbs, dust, leaves and floating hearts. Spec: docs/superpowers/specs/2026-10-03-island-design.md.
import { voxelize } from '../voxel.js';

// Pixel art: rows of palette keys, '.' empty (y down, as the 2D art). Ink #2b1d14 like the monsters.
const ART = {
  apple: [['....bb....', '....bLL...', '..rrbrrr..', '.rrrrrrrr.', 'rrwrrrrrrd', 'rwwrrrrrrd', 'rrrrrrrrdd', 'rrrrrrrrdd', '.rrrrrrdd.', '..rrddd...'],
    { b: '#6b4423', L: '#5cb23f', r: '#e8413a', w: '#ff9a8a', d: '#b02a2a' }],
  meat: [['.......ww.', '......wwww', '.....wwww.', '....kww...', '..kbbk....', '.kbBbbk...', 'kbBBbbbk..', 'kbbbbbbk..', '.kbbbbk...', '..kkkk....'],
    { w: '#fff6e8', k: '#6a3a1a', b: '#b0602a', B: '#e09050' }],
  fish: [['..........', '...bbb....', '.bbbbbb..t', 'bkbbbbbbtt', 'bbbbbbbbtt', '.wwwwwwb.t', '..wwww....'],
    { b: '#4a9ad8', k: '#2b1d14', w: '#dff0ff', t: '#2e78c0' }],
  cake: [['....r.....', '...rr.....', '..pppppp..', '.pwwwwwwp.', '.yyyyyyyy.', '.wwwwwwww.', '.yyyyyyyy.', '.YYYYYYYY.'],
    { r: '#e0303a', p: '#ff9ab8', w: '#fff8f0', y: '#ffd88a', Y: '#e8b860' }],
  ball: [['..wwwwww..', '.wwrwwrww.', 'wwwrwwrwww', 'wwrwwwwrww', 'wwrwwwwrww', 'wwrwwwwrww', 'wwwrwwrwww', '.wwrwwrww.', '..wwwwww..'],
    { w: '#fbfbf4', r: '#e0303a' }],
  heart: [['.kk.kk.', 'kRRkRRk', 'kRwRRRk', '.kRRRk.', '..kRk..', '...k...'], { k: '#2b1d14', R: '#ff4a5a', w: '#ffb0b8' }],
};
const cellsCache = new Map();
export function propCells(name) {
  if (!cellsCache.has(name)) {
    const [rows, pal] = ART[name] ?? ART.ball;
    cellsCache.set(name, rows.flatMap((row, y) => [...row].flatMap((k, x) => (pal[k] ? [[x, y, pal[k]]] : []))));
  }
  return cellsCache.get(name);
}

// A deterministic tiny brightness change per cube, so faces read as many blocks.
const jitter = (x, y, z) => ((Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1) - 0.5) * 0.1;
// cells → an InstancedMesh standing on y = 0. mirror: flip x (the monster art faces left).
export function voxModel(THREE, cells, { mirror = false, round = true, shadow = true } = {}) {
  const vs = voxelize(cells, round), mesh = new THREE.InstancedMesh(CUBE(THREE), new THREE.MeshLambertMaterial(), vs.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  vs.forEach(([x, y, z, col], i) => {
    mesh.setMatrixAt(i, m.makeTranslation(mirror ? -x : x, y, z));
    c.set(col).offsetHSL(0, 0, jitter(x, y, z)); mesh.setColorAt(i, c);
  });
  mesh.castShadow = shadow;
  return mesh;
}
let cube = null;
const CUBE = (THREE) => (cube ??= new THREE.BoxGeometry(1, 1, 1));

// Particles: small cubes that fly, fall and shrink; hearts that float up. update(dt) each frame.
export function particles(THREE, scene) {
  const live = [], mats = new Map();
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
  let heartArt = null;
  // at: Vector3. n cubes of the colours, thrown out at speed (up: extra upward), size, life in s, gravity.
  function burst(at, { n = 12, colors = ['#ffffff'], speed = 20, up = 15, size = 1, life = 0.7, gravity = 60, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(CUBE(THREE), mat(colors[i % colors.length])), a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      p.position.copy(at); p.scale.setScalar(size * (0.6 + Math.random() * 0.6)); p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      live.push({ p, v: new THREE.Vector3(Math.cos(a) * s * spread, up * (0.5 + Math.random()), Math.sin(a) * s * spread), life, max: life, gravity, size: p.scale.x });
      scene.add(p);
    }
  }
  // n voxel hearts rising from at, swaying.
  function hearts(at, n = 3, size = 0.55) {
    heartArt ??= propCells('heart');
    for (let i = 0; i < n; i++) {
      const h = voxModel(THREE, heartArt, { round: false, shadow: false });
      h.scale.setScalar(size); h.position.copy(at).add(new THREE.Vector3((i - (n - 1) / 2) * 4, 0, 0));
      live.push({ p: h, v: new THREE.Vector3(0, 9 + i * 2, 0), life: 1.3, max: 1.3, gravity: 0, size, sway: i, heart: true, delay: i * 0.15 });
      h.visible = false; scene.add(h);
    }
  }
  function update(dt, time) {
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i];
      if (q.delay > 0) { q.delay -= dt; continue; }
      q.p.visible = true;
      q.life -= dt; q.v.y -= q.gravity * dt; q.p.position.addScaledVector(q.v, dt);
      if (q.heart) { q.p.position.x += Math.sin(time * 5 + q.sway) * 0.08; q.p.scale.setScalar(q.size * Math.min(1, q.life * 2)); }
      else { q.p.rotation.x += dt * 6; q.p.scale.setScalar(Math.max(0.01, q.size * (q.life / q.max))); if (q.p.position.y < 0.3 && q.v.y < 0) { q.p.position.y = 0.3; q.v.set(q.v.x * 0.5, -q.v.y * 0.3, q.v.z * 0.5); } }
      if (q.life > 0) continue;
      scene.remove(q.p); if (q.heart) q.p.dispose();
      live.splice(i, 1);
    }
  }
  return { burst, hearts, update };
}
// The colours of a prop, for crumbs.
export const propColors = (name) => [...new Set(propCells(name).map((c) => c[2]))].filter((c) => c !== '#2b1d14');

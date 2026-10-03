// The daily maze in 3D (spec: docs/superpowers/specs/2026-10-03-island-design.md part 4): grass floors and hedge
// walls of voxel blocks, the pet as a voxel model walking room to room, a light that travels with it (the fog: rooms
// seen earlier stay dim, unseen rooms aren't built into view), checkpoint numbers and the flag as sprites. The rules
// and the screen around it stay in ui/maze.js; this only draws.
import { html, useRef, useEffect } from './h.js';
import { voxelize } from '../voxel.js';
import { monsterCells } from './monsters.js';
import { loadThree } from './scene3d.js';
import { SIZE, isOpen } from '../maze.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = 10, WALL_H = 7, WALL_T = 1.6; // room size, hedge height and thickness
const MARKS = ['①', '②', '③'];
const FACE = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 }; // the (mirrored) model looks toward +x

function build(THREE, host, maze, cps, cb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', () => cb.onFail?.());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 1, 1000);
  scene.add(new THREE.HemisphereLight(0xc8dcff, 0x2a3a20, 0.6)); // dim: what's out of sight
  const lamp = new THREE.PointLight(0xfff2d0, 420, 0, 2); // what the pet sees, fading with distance
  scene.add(lamp);
  const mats = new Map(), mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
  const floorGeo = new THREE.BoxGeometry(C, 1, C), wallX = new THREE.BoxGeometry(C + WALL_T, WALL_H, WALL_T), wallZ = new THREE.BoxGeometry(WALL_T, WALL_H, C + WALL_T);
  const at = (x, y) => [x * C, y * C]; // room (x, y) → world (x, z): y down the map = toward the camera

  // rooms: a group per room (its floor, its top and left hedges, plus bottom/right on the edge), shown once seen
  const rooms = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const g = new THREE.Group(), [wx, wz] = at(x, y), cp = cps.findIndex((c) => c[0] === x && c[1] === y);
    const floor = new THREE.Mesh(floorGeo, mat((x + y) % 2 ? '#8fc46e' : '#9bcf7a')); floor.position.set(wx, -0.5, wz); g.add(floor);
    g.userData = { floor, cp };
    const hedge = (geo, px, pz) => { const w = new THREE.Mesh(geo, mat((x * 3 + y) % 3 ? '#3f7a2c' : '#4a8a34')); w.position.set(px, WALL_H / 2, pz); g.add(w); };
    if (!isOpen(maze, [x, y], 'up')) hedge(wallX, wx, wz - C / 2);
    if (!isOpen(maze, [x, y], 'left')) hedge(wallZ, wx - C / 2, wz);
    if (y === SIZE - 1 && !isOpen(maze, [x, y], 'down')) hedge(wallX, wx, wz + C / 2);
    if (x === SIZE - 1 && !isOpen(maze, [x, y], 'right')) hedge(wallZ, wx + C / 2, wz);
    g.visible = false; scene.add(g); rooms.push(g);
  }
  const textures = new Map();
  const sprite = (ch, size) => {
    if (!textures.has(ch)) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'); g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2b1d14'; g.fillText(ch, 32, 36);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; textures.set(ch, t);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.get(ch) })); s.scale.setScalar(size); return s;
  };
  cps.forEach(([x, y], i) => { const s = sprite(MARKS[i], 5); s.position.set(x * C, 3, y * C); rooms[y * SIZE + x].add(s); });
  { const [x, y] = maze.exit, s = sprite('🚩', 7); s.position.set(x * C, 4, y * C); rooms[y * SIZE + x].add(s); }

  // the pet: glides to its room, turns the way it walks, a small shake on a bump
  let pet = null, cells = null, target = new THREE.Vector3(), yaw = -0.6, wantYaw = -0.6, bumpT = 1, joy = false; // a three-quarter view to start
  function setPet(c) {
    if (c === cells) return;
    cells = c;
    const vs = voxelize(c, true), m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), vs.length);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    vs.forEach(([x, y, z, k], i) => { m.setMatrixAt(i, mx.makeTranslation(-x, y, z)); m.setColorAt(i, col.set(k)); });
    m.scale.setScalar(0.5);
    if (pet) { m.position.copy(pet.position); scene.remove(pet); pet.dispose(); } else m.position.copy(target);
    pet = m; scene.add(m);
  }
  function setPos([x, y], dir) {
    const [wx, wz] = at(x, y);
    target.set(wx, 0, wz);
    if (dir) wantYaw = FACE[dir];
  }
  // seen: Set of room keys; reached: checkpoints passed (their floors turn gold)
  function setSeen(seen, reached) {
    rooms.forEach((g, k) => {
      g.visible = seen.has(k);
      const cp = g.userData.cp;
      if (cp >= 0) g.userData.floor.material = mat(cp < reached ? '#f2e08a' : '#cbe8a0');
    });
  }
  const bump = () => { bumpT = 0; };
  const win = (on) => { joy = on; };

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  let raf, last = performance.now(), first = true;
  const look = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000), time = now / 1000; last = now;
    if (document.hidden || !pet) return;
    if (first) { pet.position.copy(target); first = false; }
    const moving = pet.position.distanceTo(target) > 0.1;
    pet.position.x += (target.x - pet.position.x) * Math.min(1, dt * 14);
    pet.position.z += (target.z - pet.position.z) * Math.min(1, dt * 14);
    let d = wantYaw - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 12);
    bumpT = Math.min(1, bumpT + dt / 0.25);
    const shake = bumpT < 1 && !REDUCED ? Math.sin(bumpT * Math.PI * 6) * 0.6 * (1 - bumpT) : 0;
    const hop = REDUCED ? 0 : joy ? Math.abs(Math.sin(time * 8)) * 3 : moving ? Math.abs(Math.sin(time * 18)) * 0.6 : 0;
    pet.position.y = hop; pet.rotation.y = yaw + shake;
    lamp.position.set(pet.position.x, 14, pet.position.z);
    look.set(pet.position.x, 0, pet.position.z);
    camera.position.set(look.x, 50, look.z + 34); camera.lookAt(look);
    renderer.render(scene, camera);
  }
  resize();
  raf = requestAnimationFrame(frame);
  return {
    setPet, setPos, setSeen, bump, win,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
  };
}

// maze, cps: from maze.js. pos: the pet's room, dir: the way it last walked. seen: Set of room keys, reached: checkpoints
// passed. pet: {id, shiny, acc}, face. bump: a counter that shakes the pet. done: escaped. onReady(), onFail().
export function Maze3D({ maze, cps, pos, dir, seen, reached, pet, face, bump, done, onReady, onFail }) {
  const host = useRef(), world = useRef(null), latest = useRef(), art = useRef({});
  latest.current = { pos, dir, seen, reached, pet, face, done };
  const cb = useRef({}).current;
  Object.assign(cb, { onFail });
  const sync = () => {
    const w = world.current, s = latest.current;
    if (!w) return;
    const k = JSON.stringify([s.pet.id, s.pet.shiny, s.pet.acc, s.face]); // the same art array unless the look changes
    if (art.current.k !== k) art.current = { k, cells: monsterCells(s.pet.id, s.pet.shiny, s.face, s.pet.acc) };
    w.setPet(art.current.cells);
    w.setPos(s.pos, s.dir); w.setSeen(s.seen, s.reached); w.win(!!s.done);
  };
  useEffect(() => {
    let alive = true;
    loadThree().then((THREE) => {
      if (!alive) return;
      try { world.current = build(THREE, host.current, maze, cps, cb); } catch { cb.onFail?.(); return; }
      sync(); onReady?.();
    }, () => cb.onFail?.());
    return () => { alive = false; world.current?.dispose(); world.current = null; };
  }, [maze]);
  useEffect(sync, [pos, dir, seen, reached, face, done, pet.id, pet.shiny, pet.acc]);
  useEffect(() => { if (bump) world.current?.bump(); }, [bump]);
  return html`<div class="maze3d" ref=${host} aria-hidden="true" />`;
}

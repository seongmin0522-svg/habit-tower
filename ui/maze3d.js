// The daily maze in 3D (spec: docs/superpowers/specs/2026-10-03-island-design.md part 4): hedges of leafy voxel blocks
// with flowers in them, grass floors with tufts, pebbles and flowers, checkpoint stones and the exit flag, the pet as a
// voxel model walking room to room. Fog closes in past the pet's light; fireflies drift around it; its feet kick up
// dust and a bump shakes leaves loose. Unseen rooms aren't drawn. The rules and the screen around it are ui/maze.js.
import { html, useRef, useEffect } from './h.js';
import { monsterCells } from './monsters.js';
import { loadThree } from './scene3d.js';
import { voxModel, particles } from './vox3d.js';
import { SIZE, isOpen } from '../maze.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = 10, LEAF = 2, WALL_H = 8; // room size, hedge block size, hedge height
const MARKS = ['①', '②', '③'];
const FACE = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 }; // the (mirrored) model looks toward +x
const NIGHT = '#0d1a10';
const LEAVES = ['#2f6a24', '#3a7a2c', '#448a32', '#36722a', '#4e9638'];
const GRASS = ['#6aa84c', '#74b455', '#62a046', '#7bba5c'];
// deterministic noise per room and slot, 0..1
const rnd = (x, y, k) => (Math.abs(Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453)) % 1;

function build(THREE, host, maze, cps, cb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(NIGHT);
  host.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', () => cb.onFail?.());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 1, 400);
  scene.fog = new THREE.Fog(NIGHT, 52, 105); // rooms past the light fade into the night
  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x203018, 0.75));
  const moon = new THREE.DirectionalLight(0xfff0d0, 1.5); // follows the pet: soft shadows around it
  moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0008;
  Object.assign(moon.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 160 });
  scene.add(moon, moon.target);
  const lamp = new THREE.PointLight(0xffd890, 110, 0, 2); scene.add(lamp); // a warm glow around the pet
  const CUBE = new THREE.BoxGeometry(1, 1, 1), Q = new THREE.Quaternion(), V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Everything static goes into three instanced batches (floor, hedge, small things); a room's cubes are appended to
  // the drawn part of its batch when the room is first seen, so unseen rooms cost nothing.
  const batches = { floor: [], leaf: [], deco: [] };
  const put = (kind, room, x, y, z, sx, sy, sz, color, turn = 0) =>
    batches[kind].push({ room, m: new THREE.Matrix4().compose(V(x, y, z), turn ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)) : Q, V(sx, sy, sz)), color });
  // a hedge centred at (x0, z0), along x or z, owned by room r; (gx, gy) seeds its look
  const hedge = (r, x0, z0, alongX, gx, gy) => {
    const n = Math.round((C + LEAF) / LEAF);
    for (let i = 0; i < n; i++) for (let j = 0; j < WALL_H / LEAF; j++) {
      const k = i * 7 + j * 3 + (alongX ? 0 : 50), top = j === WALL_H / LEAF - 1;
      if (top && rnd(gx, gy, k) < 0.18) continue; // a ragged top
      const lift = top ? rnd(gx, gy, k + 1) * 0.6 : 0, a = i * LEAF - (C + LEAF) / 2 + LEAF / 2;
      const [px, pz] = alongX ? [x0 + a, z0] : [x0, z0 + a];
      put('leaf', r, px, j * LEAF + LEAF / 2 + lift, pz, LEAF * 1.02, LEAF * 1.02, LEAF * 1.02, LEAVES[Math.floor(rnd(gx, gy, k + 2) * LEAVES.length)]);
      if (rnd(gx, gy, k + 3) < 0.06) { // a flower in the hedge
        const side = (rnd(gx, gy, k + 4) < 0.5 ? -1 : 1) * (LEAF / 2 + 0.2);
        put('deco', r, alongX ? px : px + side, j * LEAF + LEAF / 2, alongX ? pz + side : pz, 0.6, 0.6, 0.6, rnd(gx, gy, k + 5) < 0.5 ? '#ff8ab0' : '#fff4c0');
      }
    }
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const r = y * SIZE + x, wx = x * C, wz = y * C;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) // four grass blocks per room
      put('floor', r, wx - C / 4 + (i * C) / 2, -1, wz - C / 4 + (j * C) / 2, C / 2, 2, C / 2, GRASS[Math.floor(rnd(x * 2 + i, y * 2 + j, 9) * GRASS.length)]);
    for (let k = 0; k < 7; k++) { // tufts, pebbles, a flower now and then
      const px = wx + (rnd(x, y, k) - 0.5) * (C - 3), pz = wz + (rnd(x, y, k + 20) - 0.5) * (C - 3), kind = rnd(x, y, k + 40);
      if (kind < 0.6) put('deco', r, px, 0.6, pz, 0.5, 1.2 + rnd(x, y, k + 60), 0.5, '#4c8c36', rnd(x, y, k + 80) * 3);
      else if (kind < 0.85) put('deco', r, px, 0.3, pz, 1.1, 0.6, 0.8, '#9c968a', rnd(x, y, k + 80) * 3);
      else { put('deco', r, px, 0.8, pz, 0.3, 1.6, 0.3, '#3f7a2c'); put('deco', r, px, 1.8, pz, 0.9, 0.9, 0.9, ['#ffd84a', '#ff8ab0', '#9ad0ff'][k % 3]); }
    }
    if (!isOpen(maze, [x, y], 'up')) hedge(r, wx, wz - C / 2, true, x, y);
    if (!isOpen(maze, [x, y], 'left')) hedge(r, wx - C / 2, wz, false, x, y);
    if (y === SIZE - 1 && !isOpen(maze, [x, y], 'down')) hedge(r, wx, wz + C / 2, true, x, y + 1);
    if (x === SIZE - 1 && !isOpen(maze, [x, y], 'right')) hedge(r, wx + C / 2, wz, false, x + 1, y);
  }
  // checkpoint stones (gold once passed) and the exit flag
  const textures = new Map();
  const label = (ch, size) => {
    if (!textures.has(ch)) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'); g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = '#2b1d14'; g.strokeText(ch, 32, 36); g.fillStyle = '#ffffff'; g.fillText(ch, 32, 36);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; textures.set(ch, t);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.get(ch), fog: false })); s.scale.setScalar(size); return s;
  };
  const stones = cps.map(([x, y], i) => {
    const g = new THREE.Group(), stone = new THREE.MeshLambertMaterial({ color: '#b8b2a4' });
    for (const [dy, s] of [[0.7, 3.6], [2.1, 2.6]]) { const b = new THREE.Mesh(CUBE, stone); b.scale.set(s, 1.4, s); b.position.y = dy; b.castShadow = b.receiveShadow = true; g.add(b); }
    const l = label(MARKS[i], 4.5); l.position.y = 6; g.add(l);
    g.position.set(x * C, 0, y * C); g.visible = false; scene.add(g);
    return { g, stone, label: l, room: y * SIZE + x };
  });
  const flag = new THREE.Group(), cloth = [];
  {
    const pole = new THREE.Mesh(CUBE, new THREE.MeshLambertMaterial({ color: '#6b4423' }));
    pole.scale.set(0.8, 13, 0.8); pole.position.y = 6.5; pole.castShadow = true; flag.add(pole);
    const red = new THREE.MeshLambertMaterial({ color: '#e8413a' });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const b = new THREE.Mesh(CUBE, red); b.scale.set(1.2, 1.2, 0.5); b.position.set(1 + i * 1.2, 11.5 - j * 1.2, 0); b.castShadow = true;
      flag.add(b); cloth.push(b);
    }
    const knob = new THREE.Mesh(CUBE, new THREE.MeshBasicMaterial({ color: '#ffd84a' })); knob.scale.setScalar(1.3); knob.position.y = 13.4; flag.add(knob);
    flag.position.set(maze.exit[0] * C - 2, 0, maze.exit[1] * C); flag.visible = false; scene.add(flag);
  }
  const exitRoom = maze.exit[1] * SIZE + maze.exit[0];

  const meshes = {}, color = new THREE.Color();
  for (const [kind, list] of Object.entries(batches)) {
    const m = new THREE.InstancedMesh(CUBE, new THREE.MeshLambertMaterial(), list.length);
    m.setColorAt(0, color); m.count = 0; // colour buffer made; nothing drawn yet
    m.castShadow = kind !== 'floor'; m.receiveShadow = true; m.frustumCulled = false; // the batches span the whole maze
    scene.add(m); meshes[kind] = m;
  }
  const byRoom = Array.from({ length: SIZE * SIZE }, () => []);
  for (const [kind, list] of Object.entries(batches)) list.forEach((e, i) => byRoom[e.room].push([kind, i]));
  const shown = new Set();
  // seen: Set of room keys; reached: checkpoints passed (their stones turn gold)
  function setSeen(seen, reached) {
    let changed = false;
    for (const r of seen) {
      if (shown.has(r)) continue;
      shown.add(r); changed = true;
      for (const [kind, i] of byRoom[r]) {
        const m = meshes[kind], at = m.count++;
        m.setMatrixAt(at, batches[kind][i].m); m.setColorAt(at, color.set(batches[kind][i].color));
      }
    }
    if (changed) for (const m of Object.values(meshes)) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    stones.forEach((s, i) => { s.g.visible = shown.has(s.room); s.stone.color.set(i < reached ? '#f2cf5a' : '#b8b2a4'); });
    flag.visible = shown.has(exitRoom);
  }

  // fireflies around the pet
  const flies = Array.from({ length: REDUCED ? 0 : 14 }, (_, i) => {
    const f = new THREE.Mesh(CUBE, new THREE.MeshBasicMaterial({ color: i % 3 ? '#fff6a0' : '#c8ff9a', fog: false }));
    f.scale.setScalar(0.45); scene.add(f);
    return { f, a: rnd(i, 1, 1) * 6.28, r: 6 + rnd(i, 2, 2) * 14, h: 3 + rnd(i, 3, 3) * 8, s: 0.3 + rnd(i, 4, 4) * 0.5 };
  });
  const parts = particles(THREE, scene);

  // the pet: glides to its room, turns the way it walks, a small shake on a bump
  let pet = null, cells = null, yaw = -0.6, wantYaw = -0.6, bumpT = 1, joy = false, stepT = 0; // a three-quarter view to start
  const target = new THREE.Vector3(), look = new THREE.Vector3(), camAt = new THREE.Vector3();
  function setPet(c) {
    if (c === cells) return;
    cells = c;
    const m = voxModel(THREE, c, { mirror: true });
    m.scale.setScalar(0.5);
    if (pet) { m.position.copy(pet.position); scene.remove(pet); pet.dispose(); } else m.position.copy(target);
    pet = m; scene.add(m);
  }
  function setPos([x, y], dir) { target.set(x * C, 0, y * C); if (dir) wantYaw = FACE[dir]; }
  const bump = () => {
    bumpT = 0;
    if (pet) parts.burst(pet.position.clone().add(V(Math.cos(wantYaw) * 4, 5, -Math.sin(wantYaw) * 4)), { n: 8, colors: LEAVES, speed: 10, up: 10, size: 0.7, life: 0.8, gravity: 25 });
  };
  const win = (on) => {
    if (on && !joy && pet) parts.burst(pet.position.clone().setY(8), { n: 30, colors: ['#ffd84a', '#ff5a6e', '#5ab4ff', '#78d06a'], speed: 24, up: 30, size: 0.8, life: 1.2, gravity: 30 });
    joy = on;
  };

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  let raf, last = performance.now(), first = true;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw), time = now / 1000; last = now;
    if (document.hidden || !pet) return;
    if (first) { pet.position.copy(target); camAt.copy(target); first = false; }
    const moving = pet.position.distanceTo(target) > 0.3;
    pet.position.x += (target.x - pet.position.x) * Math.min(1, raw * 14); // real time: a slow phone still keeps up
    pet.position.z += (target.z - pet.position.z) * Math.min(1, raw * 14);
    let d = wantYaw - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 12);
    bumpT = Math.min(1, bumpT + dt / 0.25);
    const shake = bumpT < 1 && !REDUCED ? Math.sin(bumpT * Math.PI * 6) * 0.6 * (1 - bumpT) : 0;
    const hop = REDUCED ? 0 : joy ? Math.abs(Math.sin(time * 8)) * 3 : moving ? Math.abs(Math.sin(time * 18)) * 0.8 : Math.abs(Math.sin(time * 2.2)) * 0.25;
    pet.position.y = hop; pet.rotation.y = yaw + shake;
    stepT -= dt;
    if (moving && stepT <= 0 && !REDUCED) { stepT = 0.12; parts.burst(pet.position.clone().setY(0.5), { n: 2, colors: ['#c8b890', '#a8c880'], speed: 5, up: 4, size: 0.6, life: 0.4, gravity: 20 }); }
    for (const f of flies) {
      const a = f.a + time * f.s;
      f.f.position.set(pet.position.x + Math.cos(a) * f.r, f.h + Math.sin(time * 1.7 + f.a) * 1.5, pet.position.z + Math.sin(a) * f.r);
      f.f.visible = Math.sin(time * 3 + f.a * 5) > -0.6; // twinkle
    }
    cloth.forEach((b, i) => { b.position.z = REDUCED ? 0 : Math.sin(time * 4 - Math.floor(i / 3) * 0.9) * 0.5; });
    stones.forEach((s, i) => { s.label.position.y = 6 + Math.sin(time * 2 + i) * 0.4; });
    parts.update(dt, time);
    lamp.position.set(pet.position.x, 10, pet.position.z + 2);
    camAt.lerp(pet.position, Math.min(1, raw * 6)); look.set(camAt.x, 0, camAt.z);
    moon.position.set(look.x - 25, 60, look.z + 30); moon.target.position.copy(look);
    camera.position.set(look.x, 60, look.z + 24); camera.lookAt(look); // steep enough that the hedge in front doesn't hide the pet
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

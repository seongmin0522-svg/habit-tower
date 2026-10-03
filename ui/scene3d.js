// Voxel 3D tower (spec: docs/superpowers/specs/2026-10-03-voxel-tower-design.md; pilot in
// docs/superpowers/prototypes/voxel-tower.tpl.html). Same props as ui/scene.js Scene, plus fallback (the 2D scene,
// shown until three.js is ready) and onFail (WebGL broke: the app switches to 2D). three.js loads on first use.
import { html, useRef, useEffect, useState } from './h.js';
import { voxelize, grassOf } from '../voxel.js';
import { monsterCells } from './monsters.js';
import { spriteCells } from './sprites.js';
import { brickColor } from './scene.js';
import { ITEMS, SHOP } from '../catalog.js';
import { SLOTS } from '../shop.js';
import { TOWER_HEIGHT } from '../logic.js';
import { photoUrl } from '../db.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';
import { tl } from '../i18n.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
let threeP;
export const loadThree = () => (threeP ??= import(THREE_URL).catch((e) => { threeP = null; throw e; }));
// WebGL once per launch; without it (or after a lost context) the app shows the 2D scene.
export const canWebGL = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BW = 28, BH = 13, BD = 14, BASE = 2, TOWER_X = 12, GRAV = 260, TILT = 0.2, TILT_MIN = 0.02, TILT_MAX = 1.25;
const restY = (i) => BASE + BH / 2 + i * BH;
// Play (spec: docs/superpowers/specs/2026-10-03-island-design.md): a playroom point {x, y, z} lands on the island at
// (PX + x·U, y·U, PZ − z·U), in front of the tower; the camera stands behind "my hand".
// PLAY_W: the half width the camera keeps in view where the pet strolls; PLAY_UP: how steeply it looks down.
const PX = -10, PZ = 70, U = 45, PLAY_AIM = [PX, 4, PZ - 0.7 * U], PLAY_W = 34, PLAY_UP = 0.5;

// The imperative world: three.js objects and the frame loop. cb holds the latest callbacks.
function build(THREE, host, cb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', () => cb.onFail?.());

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
  scene.add(new THREE.HemisphereLight(0xe2f2ff, 0x5b7a3a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.7);
  sun.castShadow = true;
  const map = devicePixelRatio >= 2 ? 2048 : 1024;
  sun.shadow.mapSize.set(map, map);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 240, bottom: -200, near: 1, far: 800 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const CUBE = new THREE.BoxGeometry(1, 1, 1), VOXEL = new THREE.MeshLambertMaterial();
  const mats = new Map(); // shared plain colours
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };

  function figure(cells, mirror) {
    const vs = voxelize(cells, true), mesh = new THREE.InstancedMesh(CUBE, VOXEL, vs.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    vs.forEach(([x, y, z, col], i) => { mesh.setMatrixAt(i, m.makeTranslation(mirror ? -x : x, y, z)); mesh.setColorAt(i, c.set(col)); });
    mesh.castShadow = true;
    return mesh;
  }

  // ---------- ground: a square island of grass blocks, a wooden plank under the tower ----------
  let ground = null;
  function setGround(colors) {
    if (ground) scene.remove(ground);
    ground = new THREE.Group();
    const [a, b] = colors.map((c) => new THREE.Color(c));
    const shades = [0, 0.33, 0.66, 1].map((t) => mat('#' + a.clone().lerp(b, t).getHexString()));
    const top = new THREE.BoxGeometry(10, 2, 10), side = new THREE.BoxGeometry(10, 8, 10);
    for (let gx = -10; gx <= 9; gx++) for (let gz = -9; gz <= 9; gz++) {
      const k = Math.abs(gx * 7 + gz * 13) % 4, dip = Math.abs(gx) > 3 && (gx * gz) % 3 === 0 ? -0.8 : 0;
      const g = new THREE.Mesh(top, shades[k]); g.position.set(gx * 10, -1 + dip, gz * 10); g.receiveShadow = true;
      const s = new THREE.Mesh(side, mat('#8a5a33')); s.position.set(gx * 10, -6 + dip, gz * 10);
      ground.add(g, s);
    }
    const petal = ['#ff7aa0', '#ffd84a', '#ffffff', '#9ad0ff'];
    for (let i = 0; i < 40; i++) {
      const x = ((i * 53) % 190) - 100, z = ((i * 37) % 170) - 85;
      if ((x > -90 && x < 30 && z > -12 && z < 22)) continue; // keep the crew's and the tower's plot clear
      const stem = new THREE.Mesh(CUBE, mat('#3f8a2a')); stem.scale.set(1, 3, 1); stem.position.set(x, 1.5, z);
      const head = new THREE.Mesh(CUBE, mat(petal[i % 4])); head.scale.set(2, 2, 2); head.position.set(x, 4, z);
      stem.castShadow = head.castShadow = true; ground.add(stem, head);
    }
    const plank = new THREE.Mesh(new THREE.BoxGeometry(36, 2, 20), mat('#6b4423'));
    plank.position.set(TOWER_X, 1, 0); plank.receiveShadow = plank.castShadow = true; ground.add(plank);
    scene.add(ground);
  }

  // ---------- bricks: the photo framed on front and back, the floor colour on the sides ----------
  const brickGeo = new THREE.BoxGeometry(BW, BH, BD);
  const images = new Map(); // photo url -> HTMLImageElement (shared between redraws)
  const imageOf = (url, redraw) => {
    let img = images.get(url);
    if (!img) { img = new Image(); img.decoding = 'async'; img.src = url; images.set(url, img); }
    if (!img.complete) img.addEventListener('load', redraw, { once: true });
    return img;
  };
  const cover = (g, img, x, y, w, h) => {
    if (!img?.complete || !img.naturalWidth) return;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s;
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  };
  // face: {color, photos: [url] (one or two), wait (half brick: '?' on the missing side), side: 'l'|'r', badges: {l, r}}
  function faceTexture(face) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 120;
    const g = c.getContext('2d'), t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const draw = () => {
      g.fillStyle = face.color; g.fillRect(0, 0, 256, 120);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(10, 8, 236, 104);
      const slots = face.photos.length === 2 ? [[12, 10, 115], [129, 10, 115]] : face.wait
        ? (face.side === 'l' ? [[12, 10, 115], null] : [null, [129, 10, 115]]) : [[12, 10, 232]];
      let p = 0;
      for (const s of slots) {
        if (!s) continue;
        cover(g, imageOf(face.photos[p++], draw), s[0], s[1], s[2], 100);
      }
      if (face.wait) {
        const x = face.side === 'l' ? 129 : 12;
        g.setLineDash([8, 6]); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(x + 4, 14, 107, 92);
        g.fillStyle = '#ffffff'; g.font = '48px Galmuri11, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', x + 57, 62);
      }
      g.font = '28px sans-serif'; g.textBaseline = 'bottom';
      if (face.badges?.l) { g.textAlign = 'left'; g.fillText(face.badges.l, 14, 116); }
      if (face.badges?.r) { g.textAlign = 'right'; g.fillText(face.badges.r, 242, 116); }
      t.needsUpdate = true;
    };
    draw();
    return t;
  }
  function makeBrick(face, key) {
    const side = mat(face.color), front = new THREE.MeshLambertMaterial({ map: faceTexture(face) });
    const mesh = new THREE.Mesh(brickGeo, [side, side, side, side, front, front]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { key, front };
    return mesh;
  }
  const dropBrick = (mesh) => { scene.remove(mesh); mesh.userData.front.map.dispose(); mesh.userData.front.dispose(); };

  // ---------- state ----------
  let crew = [], homeX = -24, homeW = 78, towerX = -14, towerW = 124, half = 0.3, towerH = 400;
  let bricks = [], halfBrick = null, flag = null, rubble = [], dust = [], flying = null, falling = false, homeT;
  // Camera: yaw (sideways), tilt (up/down drag), zoom 0 = the crew up close … 1 = the whole tower (pinch or wheel),
  // camY = the climb up the tower (two-finger drag), which only shows once zoomed out.
  let camY = 0, camTarget = 0, yaw = 0.3, spin = 0, tilt = TILT, zoom = 0, zoomTarget = 0, tagEl = null, raf, last = performance.now();
  const touches = new Map(); let pinch = null, drag = null;
  // Play: mode 'play' hands my pet to the playroom (pet: its last setPet), playK blends the camera over.
  let mode = 'tower', playK = 0, pet = null;

  function setCrew(list) { // list: [{cells, pet, mine, face}] left to right
    for (const f of crew) scene.remove(f.mesh);
    const step = 18, right = -20, left = right - step * (list.length - 1);
    crew = list.map((f, i) => {
      const mesh = figure(f.cells, f.pet); // monster art faces left: mirrored to face the tower
      const at = new THREE.Vector3(left + i * step, BASE, f.pet ? 14 : 10);
      if (f.pet) mesh.scale.setScalar(0.85);
      mesh.position.copy(at); mesh.userData = { pet: f.pet, mine: f.mine };
      scene.add(mesh);
      return { mesh, at, ...f };
    });
    const minX = left - 9;
    homeX = minX * 0.6 + TOWER_X * 0.4; homeW = Math.max(78, (TOWER_X - minX) * 0.9);
    towerX = (minX + TOWER_X + BW / 2) / 2; towerW = Math.max(124, TOWER_X + BW / 2 - minX + 24);
    resize();
  }
  // floors: [{key, face}] floor 1 first; half: a face or null.
  function setTower(floors, halfFace, flagIcon) {
    if (flying) { scene.remove(flying.mesh); flying = null; }
    for (const b of bricks) dropBrick(b.mesh);
    bricks = floors.map(({ key, face }, i) => {
      const mesh = makeBrick(face, key); mesh.position.set(TOWER_X, restY(i), 0); scene.add(mesh);
      return { mesh, v: new THREE.Vector3(), w: new THREE.Vector3() };
    });
    if (halfBrick) dropBrick(halfBrick);
    halfBrick = halfFace ? makeBrick(halfFace, null) : null;
    if (halfBrick) { halfBrick.position.set(TOWER_X, restY(floors.length), 0); scene.add(halfBrick); }
    if (flag) { scene.remove(flag); flag = null; }
    if (floors.length === TOWER_HEIGHT && flagIcon) {
      flag = new THREE.Group();
      const pole = new THREE.Mesh(CUBE, mat('#6b4423')); pole.scale.set(1.4, 26, 1.4); pole.position.y = 13;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(flagIcon, 32, 36);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
      cloth.position.set(7, 20, 0);
      flag.add(pole, cloth); flag.position.set(TOWER_X, restY(floors.length - 1) + BH / 2, 0);
      scene.add(flag);
    }
    falling = false;
  }
  function setRubble(on) {
    for (const r of rubble) scene.remove(r);
    rubble = on ? [[-6, 0], [5, 3], [0, -4], [9, -2], [-3, 5], [3, 0]].map(([dx, dz], i) => {
      const r = new THREE.Mesh(CUBE, mat(['#a7a7a7', '#8f8f8f', '#bdbdbd'][i % 3])); r.scale.setScalar(5 + (i % 3));
      r.position.set(TOWER_X + dx, 3 + (i === 5 ? 5 : 0), dz); r.rotation.set(i, i * 2, 0); r.castShadow = true;
      scene.add(r); return r;
    }) : [];
  }

  const hero = () => crew.find((f) => !f.pet);
  const mine = () => crew.find((f) => f.mine);

  // ---------- play: the playroom moves my pet and the thrown item; furniture stands where it was placed ----------
  const isle = (p, v = new THREE.Vector3()) => v.set(PX + p.x * U, (p.y ?? 0) * U, PZ - p.z * U);
  const emojis = new Map(); // icon -> texture
  const emoji = (ch) => {
    if (!emojis.has(ch)) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 36);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojis.set(ch, t);
    }
    return emojis.get(ch);
  };
  const sprite = (ch, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji(ch) })); s.scale.setScalar(size); return s; };
  const item = sprite('⚾', 7), shadow = new THREE.Mesh(new THREE.CircleGeometry(3, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; item.visible = shadow.visible = false; scene.add(item, shadow);
  // it: {icon, pos (playroom point), mode: 'fly' | 'ground' | 'held'} or null
  function setItem(it) {
    item.visible = !!it; shadow.visible = it?.mode === 'fly';
    if (!it) return;
    if (item.material.map !== emoji(it.icon)) { item.material.map = emoji(it.icon); item.material.needsUpdate = true; }
    const size = it.mode === 'held' ? 3.5 : 7;
    item.scale.setScalar(size); isle(it.pos, item.position).y += size / 2;
    isle({ ...it.pos, y: 0 }, shadow.position).y = 0.3;
  }
  let furniture = [];
  function setFurniture(list) { // [{icon, x, z}] in playroom units
    for (const f of furniture) scene.remove(f);
    furniture = list.map((f) => { const s = sprite(f.icon, 14); isle(f, s.position).y = 7; scene.add(s); return s; });
  }
  // p: {x, z, dir (±1), cells (the face's art; rebuilt when it changes), motion}
  function setPet(p) {
    const f = mine();
    if (!f || mode !== 'play') return;
    if (p.cells !== f.faceCells) {
      const m = figure(p.cells, true);
      m.scale.setScalar(0.85); m.position.copy(f.mesh.position); m.userData = f.mesh.userData;
      scene.remove(f.mesh); f.mesh.dispose(); scene.add(m);
      f.mesh = m; f.faceCells = p.cells;
    }
    f.base ??= f.mesh.position.clone(); f.yaw ??= 0;
    pet = { ...p, t0: p.motion && p.motion === pet?.motion ? pet.t0 : performance.now() };
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m; pet = null; setItem(null);
    const f = mine();
    if (m !== 'tower' || !f) return;
    if (f.faceCells) { const n = figure(f.cells, true); n.scale.setScalar(0.85); n.userData = f.mesh.userData; scene.remove(f.mesh); f.mesh.dispose(); scene.add(n); f.mesh = n; }
    f.faceCells = f.base = f.yaw = undefined;
    f.mesh.position.copy(f.at); f.mesh.rotation.set(0, 0, 0); f.mesh.scale.setScalar(0.85);
  }
  // A playroom point on screen, in the scene's pixels; k = pixels per island unit there.
  const shot = new THREE.Vector3();
  function project(p) {
    const w = host.clientWidth, h = host.clientHeight;
    isle(p, shot).project(camera);
    const left = (shot.x * 0.5 + 0.5) * w, top = (-shot.y * 0.5 + 0.5) * h;
    isle({ ...p, y: (p.y ?? 0) + 10 / U }, shot).project(camera);
    return { left, top, k: (top - (-shot.y * 0.5 + 0.5) * h) / 10 };
  }
  // A short body move for the pet's mood (the playroom's EMO motions), t seconds in.
  function moveFor(motion, t, o) {
    if (REDUCED) return;
    if (motion === 'jump') o.y += Math.abs(Math.sin(t * 9)) * 6;
    else if (motion === 'bounce') o.y += Math.abs(Math.sin(t * 7)) * 2.5;
    else if (motion === 'hop') o.y += t < 0.35 ? Math.sin((t / 0.35) * Math.PI) * 5 : 0;
    else if (motion === 'stomp') o.y += Math.abs(Math.sin(t * 14)) * 1.2;
    else if (motion === 'spin') o.turn += Math.min(1, t / 0.8) * Math.PI * 2;
    else if (motion === 'droop') o.sy = 0.88;
    else if (motion === 'chew') o.sy = 1 + Math.sin(t * 20) * 0.05;
    else if (motion === 'shake') o.x += Math.sin(t * 40) * 0.8;
    else if (motion === 'sway') o.roll = Math.sin(t * 2) * 0.12;
    else if (motion === 'wiggle') o.roll = Math.sin(t * 16) * 0.12;
  }
  function stack() { // the newest floor (or today's half brick) flies in from the hero
    const mesh = halfBrick ?? bricks.at(-1)?.mesh;
    const h = hero();
    if (!mesh || !h || REDUCED) { cb.onDone?.(); return; }
    const to = mesh.position.clone(), from = new THREE.Vector3(h.at.x + 6, BASE + 22, h.at.z);
    mesh.position.copy(from);
    clearTimeout(homeT);
    flying = { mesh, from, to, t: 0, dur: 0.85 };
    zoomTarget = 1; camTarget = focusOn(to.y);
  }
  function landed(mesh) {
    mesh.userData.squash = 1;
    sfx('brick'); buzz('stack');
    if (bricks.length === TOWER_HEIGHT && !halfBrick) {
      setTimeout(() => { sfx('top'); buzz('top'); }, 300);
      burst(mesh.position, 40, ['#ff5a6e', '#ffd84a', '#5ab4ff', '#78d06a']);
    } else burst(mesh.position, 16, ['#f3e3c3']);
    homeT = setTimeout(() => { camTarget = 0; zoomTarget = 0; setTimeout(() => cb.onDone?.(), 600); }, 1200);
  }
  function burst(at, n, colors) {
    if (REDUCED) return;
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(CUBE, mat(colors[i % colors.length])), a = (i / n) * Math.PI * 2;
      p.position.set(at.x + Math.cos(a) * 15, at.y - BH / 2, at.z + Math.sin(a) * 8); p.scale.setScalar(1.6);
      dust.push({ p, v: new THREE.Vector3(Math.cos(a) * 30, 18 + (i % 3) * 8 + (n > 20 ? 40 : 0), Math.sin(a) * 20), life: n > 20 ? 1.4 : 0.6 });
      scene.add(p);
    }
  }
  function fall() {
    falling = true;
    if (flag) { scene.remove(flag); flag = null; }
    bricks.forEach((b, i) => {
      b.v.set((Math.random() - 0.3) * 70, 30 + Math.random() * 40 + i * 1.5, (Math.random() - 0.5) * 60);
      b.w.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    });
    camTarget = 0; zoomTarget = 0.35; // a step back to watch it come down
  }

  // ---------- camera: the crew up close at home, climbing blends back to the whole tower ----------
  function view() {
    const t = zoom, w = homeW + (towerW - homeW) * t, d = w / 2 / (half * camera.aspect);
    return { t, d, h: 2 * half * d };
  }
  const focusOn = (y) => Math.max(0, y - towerH * 0.62);
  const climbTop = () => Math.max(0, restY(Math.max(0, bricks.length - 1)) - towerH * 0.45);
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); towerH = towerW / camera.aspect;
  }
  const ro = new ResizeObserver(resize); ro.observe(host);

  // ---------- touch: drag to circle and climb, tap a brick or my pet ----------
  const el = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // One finger: sideways turns (with momentum), up/down tilts. Two fingers: pinch zooms, moving together climbs.
  const spread = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2 }; };
  el.addEventListener('pointerdown', (e) => {
    if (mode === 'play') return; // the camera stays behind the hand while playing
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch { /* not a live pointer (synthetic events) */ }
    spin = 0; clearTimeout(homeT);
    if (touches.size === 2) { drag = null; const p = spread(); pinch = { d: p.d, y: p.y, zoom: zoomTarget }; return; }
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, x0: e.clientX, y0: e.clientY };
  });
  el.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const p = spread();
      zoomTarget = Math.min(1, Math.max(0, pinch.zoom + (pinch.d - p.d) / 220));
      camTarget = Math.min(climbTop(), Math.max(0, camTarget + (p.y - pinch.y) * (view().h / el.clientHeight)));
      pinch.y = p.y;
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.moved = true;
    const now = performance.now(), turn = (-(e.clientX - drag.x) / el.clientWidth) * Math.PI * 1.6;
    yaw += turn; spin = turn / Math.max(0.008, (now - drag.t) / 1000);
    tilt = Math.min(TILT_MAX, Math.max(TILT_MIN, tilt + ((e.clientY - drag.y) / el.clientHeight) * 2.2));
    drag = { ...drag, x: e.clientX, y: e.clientY, t: now };
  });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (mode !== 'play') zoomTarget = Math.min(1, Math.max(0, zoomTarget + e.deltaY * 0.0015)); }, { passive: false });
  el.addEventListener('pointerup', (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    const tap = drag && !drag.moved;
    drag = null;
    if (!tap || falling || flying) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...bricks.map((b) => b.mesh), ...crew.map((f) => f.mesh)], false)[0]?.object;
    if (hit?.userData.key) cb.onBlock?.(hit.userData.key);
    else if (hit?.userData.pet && hit.userData.mine) { const f = crew.find((c) => c.mesh === hit); if (f && !f.hop) f.hop = { t: 0 }; }
  });
  el.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; drag = null; });

  // ---------- frame loop ----------
  const feet = new THREE.Vector3(), probe = new THREE.Raycaster();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000), time = now / 1000; last = now;
    if (document.hidden) return;
    camY += (camTarget - camY) * Math.min(1, dt * 6);
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 6);
    if (!drag && spin) { yaw += spin * dt; spin *= Math.exp(-dt * 3.5); if (Math.abs(spin) < 0.02) spin = 0; }
    const v = view(), k = v.t, ax = homeX + (towerX - homeX) * k, az = 12 * (1 - k);
    const aimY = camY * k + 13 + (v.h * 0.36 - 13) * k;
    const flat = Math.cos(tilt) / Math.cos(TILT); // keep the distance along the ground when tilting
    camera.position.set(ax + Math.sin(yaw) * v.d * flat, aimY + v.d * Math.sin(tilt) / Math.cos(TILT), az + Math.cos(yaw) * v.d * flat);
    playK += ((mode === 'play' ? 1 : 0) - playK) * Math.min(1, dt * 4);
    const e = playK * playK * (3 - 2 * playK), aim = new THREE.Vector3(ax, aimY, az).lerp(shot.set(...PLAY_AIM), e);
    const pd = PLAY_W / (half * camera.aspect);
    camera.position.lerp(shot.set(PLAY_AIM[0], PLAY_AIM[1] + pd * Math.sin(PLAY_UP), PLAY_AIM[2] + pd * Math.cos(PLAY_UP)), e);
    camera.lookAt(aim);
    sun.position.set(ax + 90, aimY + 170, 120); sun.target.position.set(ax, aimY, 0);

    for (const [i, f] of crew.entries()) {
      if (f.mine && mode === 'play') {
        if (!pet || !f.base) continue;
        const to = isle(pet, shot), moving = f.base.distanceTo(to) > 0.05;
        f.base.lerp(to, Math.min(1, dt * 12));
        f.yaw += ((pet.dir > 0 ? -0.5 : Math.PI + 0.5) - f.yaw) * Math.min(1, dt * 8); // a three-quarter turn to us
        const o = { x: 0, y: moving && !REDUCED ? Math.abs(Math.sin(time * 10)) * 0.8 : 0, turn: 0, sy: 1, roll: 0 };
        moveFor(pet.motion, (now - pet.t0) / 1000, o);
        f.mesh.position.set(f.base.x + o.x, f.base.y + o.y, f.base.z);
        f.mesh.rotation.set(0, f.yaw + o.turn, o.roll); f.mesh.scale.set(0.85, 0.85 * o.sy, 0.85);
        continue;
      }
      if (f.hop) { // tapped: a hop and a full turn, then the playroom opens
        f.hop.t = REDUCED ? 1 : Math.min(1, f.hop.t + dt / 0.6);
        f.mesh.position.y = f.at.y + Math.sin(Math.PI * f.hop.t) * 12; f.mesh.rotation.y = f.hop.t * Math.PI * 2;
        if (f.hop.t >= 1) { f.hop = null; f.mesh.rotation.y = 0; sfx('tap'); cb.onPet?.(); }
        continue;
      }
      if (REDUCED) continue;
      if (f.pet) f.mesh.position.y = f.at.y + Math.abs(Math.sin(time * 2.4 + i)) * 1.4;
      else f.mesh.scale.y = 1 + Math.sin(time * 3 + i) * 0.012;
    }
    if (flying) {
      const f = flying, h = hero(); f.t = Math.min(1, f.t + dt / f.dur);
      const s = f.t, e = 1 - (1 - s) * (1 - s);
      f.mesh.position.lerpVectors(f.from, f.to, e); f.mesh.position.y += Math.sin(Math.PI * s) * 38; f.mesh.rotation.y = (1 - e) * Math.PI;
      if (h) h.mesh.position.y = h.at.y + Math.sin(Math.min(1, s * 3) * Math.PI) * 5;
      if (s >= 1) { f.mesh.rotation.y = 0; if (h) h.mesh.position.y = h.at.y; flying = null; landed(f.mesh); }
    }
    for (const m of [...bricks.map((b) => b.mesh), halfBrick].filter(Boolean)) {
      const q = m.userData.squash;
      if (!q) continue;
      m.userData.squash = q - dt * 5;
      if (m.userData.squash <= 0) { m.userData.squash = 0; m.scale.set(1, 1, 1); } else m.scale.set(1 + q * 0.08, 1 - q * 0.14, 1 + q * 0.08);
    }
    dust = dust.filter((d) => {
      d.life -= dt; d.v.y -= GRAV * 0.5 * dt; d.p.position.addScaledVector(d.v, dt); d.p.scale.setScalar(Math.max(0.01, d.life * 2.6));
      if (d.life > 0) return true; scene.remove(d.p); return false;
    });
    if (falling) for (const b of bricks) {
      b.v.y -= GRAV * dt; b.mesh.position.addScaledVector(b.v, dt);
      b.mesh.rotation.x += b.w.x * dt; b.mesh.rotation.y += b.w.y * dt; b.mesh.rotation.z += b.w.z * dt;
      if (b.mesh.position.y < BH / 2 + 1) {
        b.mesh.position.y = BH / 2 + 1; b.v.y = Math.abs(b.v.y) * 0.32; b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.55);
        if (Math.abs(b.v.y) < 6) { b.v.y = 0; b.w.multiplyScalar(0.8); }
      }
    }
    // the name tag under my hero, hidden off screen or behind the tower
    const h = hero();
    if (tagEl && h) {
      feet.set(h.at.x, -1, h.at.z);
      probe.set(camera.position, feet.clone().sub(camera.position).normalize());
      const blocked = probe.intersectObjects(bricks.map((b) => b.mesh), false)[0]?.distance < camera.position.distanceTo(feet);
      const p = feet.clone().project(camera), off = Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
      tagEl.style.visibility = off || blocked || playK > 0.05 ? 'hidden' : 'visible';
      tagEl.style.left = `${(p.x * 0.5 + 0.5) * host.clientWidth}px`; tagEl.style.top = `${(-p.y * 0.5 + 0.5) * host.clientHeight}px`;
    }
    renderer.render(scene, camera);
  }
  resize();
  raf = requestAnimationFrame(frame);

  return {
    setGround, setCrew, setTower, setRubble, stack, fall, setMode, setPet, setItem, setFurniture, project,
    setTag(elm) { tagEl = elm; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(homeT);
      for (const b of bricks) dropBrick(b.mesh);
      if (halfBrick) dropBrick(halfBrick);
      renderer.dispose(); el.remove();
    },
  };
}

// The 3D scene for props: what Scene draws, as a world. fallback: the 2D scene until three.js is ready.
// mode: 'tower' | 'play'. onBridge(bridge | null): the playroom's handle on my pet ({setPet, setItem, project}).
// room: furniture in its slots stands on the island.
export function Scene3D({ character, partnerCharacter, look, tag, keys, days, anim, rubble, onBlock, onDone, badge, half, onPet, fallback, onFail,
  mode = 'tower', onBridge, room }) {
  const host = useRef(), tagRef = useRef(), world = useRef(null), [ready, setReady] = useState(false);
  const cb = useRef({}).current; // one object for the world's lifetime, refilled with the latest callbacks each render
  Object.assign(cb, { onBlock, onDone, onPet, onFail, onBridge, pet: look.monsters[0] });
  useEffect(() => {
    let alive = true;
    loadThree().then((THREE) => {
      if (!alive) return;
      try { world.current = build(THREE, host.current, cb); } catch { cb.onFail?.(); return; }
      setReady(true);
      // The pet's face picks its art; the art is rebuilt only when the face (or the pet) changes.
      let art = {};
      const w = world.current;
      cb.onBridge?.({
        setPet({ face, ...p }) {
          const m = cb.pet;
          if (!m) return;
          if (art.m !== m || art.face !== face) art = { m, face, cells: monsterCells(m.id, m.shiny, face, m.acc) };
          w.setPet({ ...p, cells: art.cells });
        },
        setItem: w.setItem, project: w.project,
      });
    }, () => cb.onFail?.());
    return () => { alive = false; cb.onBridge?.(null); world.current?.dispose(); world.current = null; };
  }, []);

  const falling = anim?.kind === 'fall', shown = falling ? anim.keys : keys;
  const faceOf = (key, i) => {
    const d = days[key] ?? {};
    return { color: brickColor(look.brick, i), photos: [d.assetId, d.partnerAssetId].filter(Boolean).map((id) => photoUrl(id, true)), badges: badge?.(key) };
  };
  const grass = () => grassOf(getComputedStyle(document.documentElement).getPropertyValue('--grass')) ?? ['#9bcf7a', '#6fae4f'];
  const crewList = () => [
    ...look.monsters.map((m, i) => ({ cells: monsterCells(m.id, m.shiny, falling ? 'sad' : null, m.acc), pet: true, mine: i === 0 && !!onPet })),
    { cells: spriteCells(character, look.hero), pet: false },
    ...(partnerCharacter ? [{ cells: spriteCells(partnerCharacter, look.partnerHero), pet: false }] : []),
  ];
  const crewKey = JSON.stringify([character, partnerCharacter, look.monsters, look.hero, look.partnerHero, falling]);
  const towerKey = JSON.stringify([shown, look.brick, look.flag, half, shown.map((k) => [days[k]?.assetId, days[k]?.partnerAssetId, badge?.(k)])]);

  useEffect(() => { if (ready) world.current.setGround(grass()); }, [ready, look.bg]);
  useEffect(() => { if (ready) world.current.setCrew(crewList()); }, [ready, crewKey]);
  useEffect(() => {
    if (!ready) return;
    const halfFace = half && { color: brickColor(look.brick, shown.length), photos: [photoUrl(half.assetId, true)], wait: true, side: half.side };
    world.current.setTower(shown.map((key, i) => ({ key, face: faceOf(key, i) })), halfFace, ITEMS.get(look.flag)?.icon ?? '🚩');
  }, [ready, towerKey]);
  useEffect(() => { if (ready) world.current.setRubble(!!rubble && !shown.length && !half); }, [ready, rubble, shown.length, half]);
  useEffect(() => {
    if (!ready || !anim) return;
    if (anim.kind === 'stack') world.current.stack();
    else if (anim.kind === 'fall') world.current.fall();
  }, [ready, anim]);
  useEffect(() => { if (ready) world.current.setTag(tagRef.current); }, [ready, tag]);
  useEffect(() => { if (ready) world.current.setMode(mode); }, [ready, mode]);
  const slots = room?.slots ?? [];
  useEffect(() => {
    if (ready) world.current.setFurniture(slots.map((id, i) => SHOP.get(id) && { icon: SHOP.get(id).icon, ...SLOTS[i] }).filter(Boolean));
  }, [ready, slots.join()]);

  return html`<div class="scene3d" ref=${host}>
    ${!ready && fallback}
    ${ready && tag && html`<span class="nametag3d" ref=${tagRef}>${tag}</span>`}
    <div class="sr-only">${shown.map((key, i) => html`<button key=${key} type="button" onClick=${() => onBlock(key)}>${tl`${i + 1}층 · ${key} 인증 사진 보기`}</button>`)}</div>
  </div>`;
}

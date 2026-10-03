// The battle field in 3D (spec: docs/superpowers/specs/2026-10-03-island-design.md part 3): a round grass arena with
// the two pets as voxel models. The battle screen keeps its layout: each pet stands where its (now invisible) 2D box is,
// read every frame, so the entry slide, lunges and hurt shakes the screen already animates move the 3D pets too; the
// box's opacity blinks them, its .faint class tips them over. Element shots fly as 3D sprites.
import { html, useRef, useEffect } from './h.js';
import { voxelize, grassOf } from '../voxel.js';
import { monsterCells } from './monsters.js';
import { loadThree } from './scene3d.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ART_H = 16; // pet art height in voxels

function build(THREE, host, boxes, cb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', () => cb.onFail?.());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
  camera.position.set(0, 90, 110); camera.lookAt(0, 0, -10);
  scene.add(new THREE.HemisphereLight(0xe2f2ff, 0x5b7a3a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
  sun.position.set(60, 140, 80); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 400 });
  scene.add(sun);
  const CUBE = new THREE.BoxGeometry(1, 1, 1), VOXEL = new THREE.MeshLambertMaterial();

  // the arena: grass blocks inside an oval, dirt under them
  const css = getComputedStyle(document.documentElement).getPropertyValue('--grass');
  const [a, b] = (grassOf(css) ?? ['#9bcf7a', '#6fae4f']).map((c) => new THREE.Color(c));
  const tops = [0, 0.33, 0.66, 1].map((t) => new THREE.MeshLambertMaterial({ color: a.clone().lerp(b, t) }));
  const dirt = new THREE.MeshLambertMaterial({ color: '#8a5a33' }), top = new THREE.BoxGeometry(10, 2, 10), side = new THREE.BoxGeometry(10, 8, 10);
  for (let gx = -9; gx <= 9; gx++) for (let gz = -14; gz <= 7; gz++) {
    if ((gx / 9.5) ** 2 + ((gz + 3.5) / 11) ** 2 > 1) continue;
    const g = new THREE.Mesh(top, tops[Math.abs(gx * 7 + gz * 13) % 4]); g.position.set(gx * 10, -1, gz * 10); g.receiveShadow = true;
    const s = new THREE.Mesh(side, dirt); s.position.set(gx * 10, -6, gz * 10);
    scene.add(g, s);
  }

  // pets: {mesh, cells, faint (0 → 1 while tipping over)}
  const pets = {};
  function setPet(who, cells) {
    const p = pets[who];
    if (p?.cells === cells) return;
    const vs = voxelize(cells, true), mesh = new THREE.InstancedMesh(CUBE, VOXEL, vs.length);
    const m = new THREE.Matrix4(), c = new THREE.Color(), mirror = who === 'me'; // the art faces left; mine faces the foe
    vs.forEach(([x, y, z, col], i) => { mesh.setMatrixAt(i, m.makeTranslation(mirror ? -x : x, y, z)); mesh.setColorAt(i, c.set(col)); });
    mesh.castShadow = true; mesh.visible = false;
    if (p) { mesh.position.copy(p.mesh.position); mesh.scale.copy(p.mesh.scale); mesh.visible = p.mesh.visible; scene.remove(p.mesh); p.mesh.dispose(); }
    scene.add(mesh);
    pets[who] = { mesh, cells, faint: p?.faint ?? 0 };
  }

  // shots: an emoji sprite on an arc from one pet to the other
  const textures = new Map();
  const emoji = (ch) => {
    if (!textures.has(ch)) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'); g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 36);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; textures.set(ch, t);
    }
    return textures.get(ch);
  };
  let shots = [];
  const mid = (who) => { const p = pets[who]?.mesh; return p && p.position.clone().add(new THREE.Vector3(0, (ART_H / 2) * p.scale.y, 0)); };
  function shot(from, to, icon) {
    const a0 = mid(from), a1 = mid(to);
    if (!a0 || !a1 || REDUCED) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji(icon) }));
    s.scale.setScalar(12); scene.add(s);
    shots.push({ s, a0, a1, t: 0 });
  }

  // a box's bottom middle on the ground, and the size that makes the model as tall as the box
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), up = new THREE.Vector3();
  function follow(who, el, hr) {
    const p = pets[who];
    if (!p) return;
    if (!el) { p.mesh.visible = false; return; }
    const r = el.getBoundingClientRect();
    if (!r.width) { p.mesh.visible = false; return; }
    const faint = el.classList.contains('faint');
    if (faint) { // tip over where it stood
      p.faint = Math.min(1, p.faint + 1 / 50);
      p.mesh.rotation.z = (who === 'me' ? 1 : -1) * p.faint * Math.PI * 0.45;
      p.mesh.visible = true;
      return;
    }
    p.faint = 0; p.mesh.rotation.z = 0;
    ndc.set(((r.left + r.width / 2 - hr.left) / hr.width) * 2 - 1, -((r.bottom - hr.top) / hr.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(floor, hit)) { p.mesh.visible = false; return; }
    p.mesh.position.copy(hit);
    // pixels per world unit there, from a point 10 units up
    up.copy(hit).setY(10).project(camera);
    const base = hit.clone().project(camera), ppu = (((up.y - base.y) / 2) * hr.height) / 10;
    p.mesh.scale.setScalar(Math.max(0.2, r.height / ppu / ART_H));
    p.mesh.rotation.y = 0.4; // turned toward the other pet, a little toward us
    p.mesh.visible = +getComputedStyle(el).opacity > 0.6; // the hurt blink and the entry fade
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  let raf, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden) return;
    const hr = host.getBoundingClientRect();
    follow('me', boxes.me.current, hr); follow('foe', boxes.foe.current, hr);
    shots = shots.filter((f) => {
      f.t = Math.min(1, f.t + dt / 0.45);
      f.s.position.lerpVectors(f.a0, f.a1, f.t); f.s.position.y += Math.sin(Math.PI * f.t) * 18;
      f.s.material.rotation += dt * 12;
      if (f.t < 1) return true;
      scene.remove(f.s); f.s.material.dispose(); return false;
    });
    renderer.render(scene, camera);
  }
  resize();
  raf = requestAnimationFrame(frame);
  return {
    setPet, shot,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
  };
}

// sides: {me: {id, shiny, acc, face}, foe: {…} | null}. boxes: {me, foe} refs to the 2D pet boxes it stands in.
// api: a ref that gets {shot(from, to, icon)} once ready (null before and after). onReady(), onFail(): WebGL is up / broke.
export function Arena3D({ sides, boxes, api, onReady, onFail }) {
  const host = useRef(), world = useRef(null), latest = useRef(sides);
  latest.current = sides;
  const cb = useRef({}).current;
  Object.assign(cb, { onFail });
  useEffect(() => {
    let alive = true;
    loadThree().then((THREE) => {
      if (!alive) return;
      try { world.current = build(THREE, host.current, boxes, cb); } catch { cb.onFail?.(); return; }
      api.current = { shot: world.current.shot };
      onReady?.();
      setAll();
    }, () => cb.onFail?.());
    return () => { alive = false; api.current = null; world.current?.dispose(); world.current = null; };
  }, []);
  const setAll = () => {
    for (const who of ['me', 'foe']) {
      const s = latest.current[who];
      if (s && world.current) world.current.setPet(who, cellsOf(s));
    }
  };
  useEffect(setAll, [JSON.stringify(sides)]);
  return html`<div class="arena3d" ref=${host} aria-hidden="true" />`;
}
const cache = new Map(); // one art per pet + face, so setPet sees the same array and skips the rebuild
const cellsOf = ({ id, shiny, acc, face }) => {
  const k = JSON.stringify([id, shiny, acc, face]);
  if (!cache.has(k)) cache.set(k, monsterCells(id, shiny, face, acc));
  return cache.get(k);
};

// One pet as a voxel model in its own small canvas: a drop-in for <Monster> where the pet should feel solid (the
// playroom). It sways a little, lit from above; faces and accessories rebuild the model. Shown in 2D (Monster) until
// three.js is ready, and for good when WebGL fails. Spec: docs/superpowers/specs/2026-10-03-voxel-tower-design.md.
import { html, useRef, useEffect, useState } from './h.js';
import { Monster, monsterCells } from './monsters.js';
import { voxelize } from '../voxel.js';
import { loadThree } from './scene3d.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The canvas is a little bigger than the 16x16 art: room for the turn and for a hat (W x H art pixels).
const W = 20, H = 22;

export function VoxelPet({ id, shiny = false, face = null, acc = null, px = 2 }) {
  const box = useRef(), world = useRef(null), [ok, setOk] = useState(false), [broken, setBroken] = useState(false);
  useEffect(() => {
    let alive = true, raf;
    loadThree().then((THREE) => {
      if (!alive) return;
      try {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(W * px, H * px, false);
        // the canvas overhangs the 16x16 box: (W − 16) / 2 on each side, 1 below, the rest above for a hat
        Object.assign(renderer.domElement.style, { position: 'absolute', width: `${W * px}px`, height: `${H * px}px`, left: `${-((W - 16) / 2) * px}px`, bottom: `${-px}px` });
        box.current.prepend(renderer.domElement);
        renderer.domElement.addEventListener('webglcontextlost', () => setBroken(true));
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a40, 1.3));
        const sun = new THREE.DirectionalLight(0xfff0d8, 1.4); sun.position.set(-6, 14, 12); scene.add(sun);
        // Orthographic, a little from above: the art's 16 px fill the same width the 2D pet had.
        // bounds are around the view's centre line, which meets the pet at y = AIM: y −1 … H − 1 on screen
        const AIM = 8, camera = new THREE.OrthographicCamera(-W / 2, W / 2, H - 1 - AIM, -1 - AIM, 0.1, 200);
        camera.position.set(0, AIM + 6, 40); camera.lookAt(0, AIM, 0);
        const cube = new THREE.BoxGeometry(1, 1, 1), voxel = new THREE.MeshLambertMaterial();
        let mesh = null;
        const setModel = (cells) => {
          if (mesh) { scene.remove(mesh); mesh.dispose(); }
          const vs = voxelize(cells, true), m = new THREE.Matrix4(), c = new THREE.Color();
          mesh = new THREE.InstancedMesh(cube, voxel, vs.length);
          vs.forEach(([x, y, z, col], i) => { mesh.setMatrixAt(i, m.makeTranslation(x, y, z)); mesh.setColorAt(i, c.set(col)); });
          scene.add(mesh);
        };
        const frame = (now) => {
          raf = requestAnimationFrame(frame);
          if (document.hidden || !mesh) return;
          mesh.rotation.y = REDUCED ? -0.35 : -0.35 + Math.sin(now / 900) * 0.4; // a three-quarter view that sways
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(frame);
        world.current = { setModel, dispose() { cancelAnimationFrame(raf); renderer.dispose(); renderer.domElement.remove(); } };
        setOk(true);
      } catch { setBroken(true); }
    }, () => setBroken(true));
    return () => { alive = false; world.current?.dispose(); world.current = null; };
  }, []);
  useEffect(() => { if (ok) world.current.setModel(monsterCells(id, shiny, face, acc)); }, [ok, id, shiny, face, acc]);

  if (broken) return html`<${Monster} id=${id} shiny=${shiny} face=${face} acc=${acc} px=${px} />`;
  // Same footprint as Monster (16 x 16 art pixels, the hat sticking out above); the canvas overflows that box.
  return html`<span class="voxelpet" ref=${box} style=${{ width: `${16 * px}px`, height: `${16 * px}px` }}>${
    !ok && html`<${Monster} id=${id} shiny=${shiny} face=${face} acc=${acc} px=${px} />`}</span>`;
}

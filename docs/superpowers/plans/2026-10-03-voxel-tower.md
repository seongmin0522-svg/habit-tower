# Voxel 3D Tower Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tower screen in voxel 3D (the approved pilot, with the app's real photos, skins, crew and animations), falling back to the 2D scene when WebGL isn't there or the user picks the light screen.

**Architecture:** Pure cube building in `voxel.js` (Node-tested); `ui/scene3d.js` is a drop-in for `ui/scene.js`'s `Scene` (same props) that lazily imports three.js and ports the pilot (`docs/superpowers/prototypes/voxel-tower.tpl.html`); `app.js` chooses between them.

**Tech Stack:** three.js 0.170.0 ESM from jsdelivr, Preact/htm, `node --test`.

Spec: `docs/superpowers/specs/2026-10-03-voxel-tower-design.md`. Pilot source: `docs/superpowers/prototypes/voxel-tower.tpl.html` (+ `voxel-tower-art.json`).

---

## Ground rules

- Branch `feat/voxel-tower` from `main`. (Adventures stay on `feat/adventures`; whichever merges second rebases.)
- `npm test` baseline on main: `# pass 83`. Headless Chrome :9333 + scratchpad `cdp.mjs` (WebGL works there via SwiftShader); local app on :8766 with `?dev&seed=30|fall|album`.
- New strings through `tl` + `lang/en.js`. New files into `sw.js` SHELL; `CACHE` bump.
- Push only after 도균님's yes.

## File map

| File | Responsibility |
|---|---|
| `voxel.js` (new) + `voxel.test.mjs` | `voxelize(cells, round)`, `grassOf(css)` |
| `ui/monsters.js` | export `monsterCells(id, shiny, face, acc)` (body + accessory cells) |
| `ui/sprites.js` | export `spriteCells(id, skin)` |
| `ui/scene3d.js` (new) | `Scene3D` (same props as `Scene`) |
| `app.js` | choose `Scene3D`/`Scene`; `gfx` pref |
| `sound.js` | `gfx` in prefs defaults (`'3d'`) |
| `ui/windows.js` | "가벼운 화면 (2D)" switch in the sound box |
| `index.html`, `sw.js`, `lang/en.js` | CSS for the canvas/overlays, SHELL + `CACHE`, strings |

---

### Task 1: `voxel.js`

**Files:** Create `voxel.js`, `voxel.test.mjs`.

- [ ] **Step 1: Test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { voxelize, grassOf } from './voxel.js';

const square = (n, color = '#00ff00') => Array.from({ length: n * n }, (_, i) => [i % n, Math.floor(i / n), color]);
const depthAt = (cubes, x, y) => cubes.filter((c) => c[0] === x && c[1] === y).length;

test('rim is one cube deep, depth grows inward, caps at 7', () => {
  const g = voxelize(square(12), true), ox = 6, oy = 6; // cubes are centred: x - w/2 + .5, y flipped
  const at = (x, y) => depthAt(g, x - ox + 0.5, oy - y - 0.5);
  assert.equal(at(0, 0), 1);
  assert.equal(at(1, 1), 3);
  assert.equal(at(2, 2), 5);
  assert.equal(at(3, 3), 7);
  assert.equal(at(5, 5), 7);
});
test('flat: three layers everywhere', () => {
  const g = voxelize(square(4), false);
  assert.equal(g.length, 16 * 3);
});
test('the back half hides ink and white details under the body colour', () => {
  const cells = square(7, '#7ac35a'); cells[3 * 7 + 3] = [3, 3, '#2b1d14']; // an eye in the middle
  const g = voxelize(cells, true), eye = g.filter((c) => c[0] === 0 && c[1] === 0); // centre column
  assert.ok(eye.filter((c) => c[2] >= 0).every((c) => c[3] === '#2b1d14'));
  assert.ok(eye.filter((c) => c[2] < 0).every((c) => c[3] === '#7ac35a'));
});
test('cells may sit outside 0..15 (an accessory above the head)', () => {
  const g = voxelize([[0, -2, '#ff0000'], [0, -1, '#ff0000'], [0, 0, '#ff0000']], true);
  assert.equal(g.length, 3);
});
test('grassOf reads the two colours of a skin gradient', () => {
  assert.deepEqual(grassOf('linear-gradient(#9bcf7a,#6fae4f)'), ['#9bcf7a', '#6fae4f']);
  assert.equal(grassOf(undefined), null);
});
```

- [ ] **Step 2:** `npm test` → fails (no module).
- [ ] **Step 3: Implement**

```js
// Voxel figures from pixel art (spec: docs/superpowers/specs/2026-10-03-voxel-tower-design.md). Pure.
// cells: [x, y, color] as the 2D art paints them (y down; x/y may go outside 0..15 for accessories).
// Returns cubes [x, y, z, color] centred on x, standing on y = 0 (y up), z = 0 the middle layer.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DETAIL = new Set(['#2b1d14', '#ffffff']); // ink and white: face details

export function voxelize(cells, round = true) {
  const at = new Map(cells.map(([x, y, c]) => [`${x},${y}`, c]));
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys), w = x1 - x0 + 1;
  const on = (x, y) => at.has(`${x},${y}`);
  // d: distance to the nearest empty cell, 1 on the rim (breadth-first from the rim inward)
  const d = new Map(), q = [];
  for (const [x, y] of cells) if (N4.some(([a, b]) => !on(x + a, y + b))) { d.set(`${x},${y}`, 1); q.push([x, y]); }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i], k = d.get(`${x},${y}`);
    for (const [a, b] of N4) {
      const nx = x + a, ny = y + b, key = `${nx},${ny}`;
      if (on(nx, ny) && !d.has(key)) { d.set(key, k + 1); q.push([nx, ny]); }
    }
  }
  const body = (x, y) => { // the most common non-detail colour within 3 cells
    const n = new Map();
    for (let r = 1; r <= 3; r++) for (const [a, b] of N4) {
      const c = at.get(`${x + a * r},${y + b * r}`);
      if (c && !DETAIL.has(c)) n.set(c, (n.get(c) ?? 0) + 1);
    }
    return [...n].sort((p, q2) => q2[1] - p[1])[0]?.[0];
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
```

  (Note the y flip: `y1 - y + 0.5` puts the lowest pixel row on y = 0.5. Adjust the test's `at()` helper to the same mapping if the first run disagrees — the rule under test is the depth, not the offset.)
- [ ] **Step 4:** `npm test` → `# fail 0`. **Commit** `feat(voxel): rounded voxel figures from pixel art`.

---

### Task 2: Cells from the 2D art

**Files:** Modify `ui/monsters.js`, `ui/sprites.js`.

- [ ] **Step 1: `ui/monsters.js`** after `paint`:

```js
// Body cells plus the worn accessory's cells (above the head, y may be negative), for the voxel scene.
export function monsterCells(id, shiny = false, face = null, acc = null) {
  const { m, cells } = paint(id, shiny, face);
  const art = ACC_ART[acc];
  if (!art) return cells;
  const [cx, top] = headTop(m.base), ox = cx - Math.floor(art[0].length / 2), oy = top - art.length + 1;
  return [...cells, ...accCells(acc).map(([x, y, f]) => [ox + x, oy + y, f])];
}
```

  `Monster` uses the same offsets (keep them in one place: `Monster` may call `monsterCells` for its rects).
- [ ] **Step 2: `ui/sprites.js`** — move the palette pick out of `Sprite` and export:

```js
// [x, y, color] cells of a character, as Sprite paints them (skin: a 'char-<class>-<variant>' id).
export function spriteCells(id, skin) {
  const c = CHARACTERS.find((x) => x.id === id) ?? CHARACTERS[0], sk = ITEMS.get(skin);
  const pal = sk?.cls === c.id ? { ...c.pal, ...sk.pal } : c.pal, out = [];
  c.map.forEach((row, y) => [...row].forEach((k, x) => { const f = pal[k] || BASE[k]; if (f) out.push([x, y, f]); }));
  return out;
}
```

  and `Sprite` maps `spriteCells(id, skin)` to its rects.
- [ ] **Step 3: Check** (browser, `?dev`): the 2D tower looks exactly as before (screenshot before/after the change, compare). `import('/ui/monsters.js').then(m => m.monsterCells('snail-green', false, null, 'crown').length)` > the plain cell count. **Commit** `refactor(art): cells for the voxel scene`.

---

### Task 3: `Scene3D` — scene, bricks, crew, camera (static)

**Files:** Create `ui/scene3d.js`; modify `index.html` (CSS).

Port from the pilot, as a Preact component. Structure:

- [ ] **Step 1: Module skeleton**

```js
// Voxel 3D tower (spec: docs/superpowers/specs/2026-10-03-voxel-tower-design.md; pilot in
// docs/superpowers/prototypes/voxel-tower.tpl.html). Same props as ui/scene.js Scene; three.js loads on first use.
import { html, useRef, useEffect, useState } from './h.js';
import { voxelize, grassOf } from '../voxel.js';
import { monsterCells } from './monsters.js';
import { spriteCells } from './sprites.js';
import { brickColor } from './scene.js';
import { ITEMS } from '../catalog.js';
import { TOWER_HEIGHT } from '../logic.js';
import { photoUrl } from '../db.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';
import { tl } from '../i18n.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
let threeP;
export const loadThree = () => (threeP ??= import(THREE_URL));
// WebGL probe once per launch; a failure (or a lost context later) means the 2D scene.
export const canWebGL = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
```

- [ ] **Step 2: World builder** `build(THREE, canvas)` returning `{ renderer, scene, camera, sun, setLook(look, character, partnerCharacter), setBricks(keys, days, look, badge, half), dispose() }` — the pilot's renderer/lights/ground/plank, with:
  - ground colours from `grassOf(ITEMS.get(look.bg)?.grass) ?? ['#6fb04a', '#5f9e3e']` (blend four shades between the two);
  - `figure(cells)` = pilot `figure` over `voxelize(cells, true)`;
  - crew: `spriteCells(character, look.hero)`; partner hero `spriteCells(partnerCharacter, look.partnerHero)` when present; pets `monsterCells(m.id, m.shiny, face, m.acc)` for each of `look.monsters`, placed left of the tower in the 2D order (hero right next to the tower, pets further left; couple: me, my pet, partner, partner's pet spread along x with 2 units more spacing);
  - bricks: per floor `i` a box with materials `[side ×4, photo, photo]`; photo texture = a 256×120 canvas: frame in `brickColor(look.brick, i)`, the thumbnail `photoUrl(day.assetId, true)` drawn cover-fit inside (load via `new Image()`, redraw + `texture.needsUpdate = true` on load), couple days draw `partnerAssetId` on the right half, reaction badges `badge(key)?.l / .r` drawn as text in the bottom corners; the half brick draws its photo on its side and a dashed "?" on the other half; textures and materials disposed when a floor is rebuilt or the component unmounts.
- [ ] **Step 3: Camera** — the pilot's HOME/TOWER blend, `focusOn`, yaw + spin, `view()`; `camY` starts at 0 (the crew).
- [ ] **Step 4: Component**

```js
export function Scene3D(props) {
  const host = useRef(), world = useRef(null), [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadThree().then((THREE) => { if (alive) { world.current = build(THREE, host.current); setReady(true); } }, () => props.onFail?.());
    return () => { alive = false; world.current?.dispose(); };
  }, []);
  // props → world: look/crew, bricks, anim (Task 4), overlays (Task 5)
  …
  return html`<div class="scene3d" ref=${host}>${!ready && props.fallback}</div>`;
}
```

  `fallback` is the 2D `Scene` element (shown until three.js is ready). `onFail` tells `app.js` to switch to 2D for the session (also on `webglcontextlost`).
- [ ] **Step 5: CSS**: `.scene3d { position: relative; width: 100%; height: 100%; overflow: hidden; touch-action: none; } .scene3d canvas { display: block; width: 100%; height: 100%; }`.
- [ ] **Step 6: Check** headless `?dev&seed=30` with `Scene3D` mounted temporarily in place of `Scene`: the crew in front, 29 photo bricks with the seed's coloured photos, the tower behind. **Commit** `feat(voxel): 3D tower scene, bricks with photos, crew, camera`.

---

### Task 4: Motion and touch

**Files:** Modify `ui/scene3d.js`.

- [ ] **Stack:** when `anim?.kind === 'stack'` starts: the newest floor (or the half brick) flies from the hero in the pilot's arc (0.85 s), lands with squash + dust, `sfx('brick'); buzz('stack')` on landing (and `sfx('top'); buzz('top')` 300 ms later at floor 30 without a half brick), the camera follows up, glides home 1.2 s later, then `onDone()` once. Reduced motion: no flight, `onDone()` at once.
- [ ] **Fall:** when `anim?.kind === 'fall'`: the pilot's push/spin/gravity/bouncy floor over `anim.keys`; the pets use face `sad`; the 2D app's `FALL_MS` timing (2600 ms) still drives the notice. After the fall, with `rubble && !keys.length && !half`, a small pile of 6 grey cubes stays at the tower spot.
- [ ] **Top:** at `keys.length === TOWER_HEIGHT`: a voxel pole and a cloth plane with the flag skin's icon (drawn on a canvas), and 40 confetti cubes on the stack that tops it.
- [ ] **Idle:** pet bob, hero breathe, shiny sparkle (6 tiny white cubes orbiting slowly); skip all with reduced motion. Pause the loop on `visibilitychange` hidden.
- [ ] **Touch:** pointer drag > 6 px = orbit/climb (pilot); a tap raycasts bricks (`userData.key` → `onBlock(key)`) and my pet (`onPet()` when given). 
- [ ] **Check** headless: dispatch the app's stack (`?dev&seed=30`, check in a photo via `DOM.setFileInputFiles` or call the stack anim by toggling `anim` in a temporary harness): `onDone` fires once (log it); `?dev&seed=fall` shows the fall and the rubble. **Commit** `feat(voxel): stack, fall, top, idle, touch`.

---

### Task 5: Overlays and accessibility

- [ ] Name tag (`tag`) under the hero and, later, the adventure mood icon, as DOM elements placed each frame at the projected point, hidden off screen or when a brick is in front (pilot raycast).
- [ ] A visually hidden list of brick buttons (same labels as the 2D scene: `tl`${i + 1}층 · ${key} 인증 사진 보기``) so screen readers and keyboards reach every photo. **Commit** `feat(voxel): name tag overlay, accessible brick list`.

---

### Task 6: App switch, setting, fallback

**Files:** Modify `app.js`, `sound.js`, `ui/windows.js`, `sw.js`, `lang/en.js`.

- [ ] `sound.js` `DEFAULTS` gets `gfx: '3d'`.
- [ ] `app.js`: `const [gl3d, setGl3d] = useState(canWebGL);` and where `Scene` renders:

```js
const scene2d = html`<${Scene} key=${view} …same props… />`;
${sound.gfx !== '2d' && gl3d
  ? html`<${Scene3D} key=${view} …same props… fallback=${scene2d} onFail=${() => setGl3d(false)} />`
  : scene2d}
```

- [ ] Settings sound box: `${sw('gfx', tl('🧊 3D 화면'))}` style toggle between `'3d'`/`'2d'` (label `tl('3D 화면')` with 켜짐/꺼짐, stored as `gfx: p.gfx === '2d' ? '3d' : '2d'`), with a note `tl('끄면 가벼운 2D 화면으로 보여요')`.
- [ ] English: `'3D 화면': '3D view'`, `'끄면 가벼운 2D 화면으로 보여요': 'Turn off for the lighter 2D view'`.
- [ ] `sw.js`: SHELL + `'voxel.js', 'ui/scene3d.js'`; `CACHE` bump. (three.js comes through the CDN cache-first rule.)
- [ ] `npm test` → `# fail 0`. **Commit** `feat(voxel): 3D tower by default, 2D switch and fallback`.

---

### Task 7: Checks

- [ ] Headless at 360×740, Korean and English: home view, rotate 180°, climb, stack sequence with `onDone`, fall + rubble, couple tab (`?dev` with a fake partner is not available — check the four-figure layout by passing a two-monster `look` in a temporary harness), 30-floor top, tap a brick → photo window, setting off → 2D, WebGL forced off (`--disable-gpu --disable-software-rasterizer` headless run) → 2D with no errors.
- [ ] Ask 도균님 to try it on the Flip (and 타비's iPhone if possible) after deploy: smoothness with real photos. If it stutters: shadow map 1024, pixel ratio 1.5, then fewer dust cubes.

### Task 8: Deploy

- [ ] Ask 도균님. Merge `feat/voxel-tower` into `main` (fast-forward), `npm test`, push, Pages build, curl the new files. Update memory.

# Pet Playroom — Step 1 (throw feel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap my pet on the tower screen, open a full-screen playroom, flick an apple Pokémon GO–style, get a judgement, and save hearts for that pet.

**Architecture:** Pure throw rules (`pet.js`, tested with `node --test`) + one Preact component (`ui/playroom.js`) that runs a `requestAnimationFrame` loop and writes styles straight to three elements. Hearts are a new local doc `pets/<monsterId>` = `{ gained, lost }` written through `actions.feedPet`. No cloud sync yet (step 5).

**Tech Stack:** Preact + htm from the CDN (no build step), IndexedDB via the existing `db` API, `node:test`.

Spec: `docs/superpowers/specs/2026-09-29-pet-playroom-design.md`. This plan is build step 1 only. Steps 2–5 get their own plans after the phone check in Task 6, because the tuned throw constants change them.

In step 1 apples are unlimited so the throw can be tested freely. The daily 5 comes in step 2.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `pet.js` | create | Throw physics, spin, landing, judgement, food hearts. Pure. |
| `pet.test.mjs` | create | Tests for `pet.js`. |
| `logic.js` | modify `DOC_PATH` (line 138) | Backup accepts `pets/<id>` docs. |
| `logic.test.mjs` | modify | Backup test for `pets/`. |
| `db.js` | modify `subscribe`, `makeActions` | Load `pets`, `feedPet` action. |
| `ui/playroom.js` | create | The playroom window, input, loop, pet behavior. |
| `index.html` | modify `<style>` | Playroom and pet-button CSS. |
| `ui/scene.js` | modify crew render | My pet becomes a button. |
| `app.js` | modify | `pets` in state, open/close the playroom. |
| `sw.js` | modify | New files in SHELL, CACHE v12. |

---

### Task 1: Throw rules (`pet.js`)

**Files:**
- Create: `pet.js`
- Test: `pet.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `pet.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { THROW, FOOD_HEARTS, flick, spinOf, at, landing, judge } from './pet.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('flick: upward speed in screen widths per second becomes forward and up', () => {
  const v = flick([{ x: 200, y: 800, t: 0 }, { x: 200, y: 640, t: 100 }], 400); // 4 widths/s up
  near(v.x, 0);
  near(v.y, 4 * THROW.ky);
  near(v.z, 4 * THROW.kz);
});

test('flick: only the last sampleMs of the drag count', () => {
  const v = flick([{ x: 0, y: 1000, t: 0 }, { x: 200, y: 800, t: 500 }, { x: 200, y: 640, t: 600 }], 400);
  near(v.z, 4 * THROW.kz);
  near(v.x, 0);
});

test('flick: sideways speed becomes x', () => {
  const v = flick([{ x: 200, y: 800, t: 0 }, { x: 240, y: 640, t: 100 }], 400); // 1 width/s right
  near(v.x, 1 * THROW.kx);
});

test('flick: taps, slow pushes and downward swipes are not throws', () => {
  assert.equal(flick([], 400), null);
  assert.equal(flick([{ x: 0, y: 0, t: 0 }], 400), null);
  assert.equal(flick([{ x: 200, y: 800, t: 0 }, { x: 200, y: 790, t: 100 }], 400), null);
  assert.equal(flick([{ x: 200, y: 600, t: 0 }, { x: 200, y: 800, t: 100 }], 400), null);
});

// n points around a circle of radius 50; dir 1 = clockwise on screen (y grows downward)
const circle = (dir, n = 20) => Array.from({ length: n + 1 }, (_, i) => {
  const a = dir * i * 2 * Math.PI / 16;
  return { x: 200 + 50 * Math.cos(a), y: 700 + 50 * Math.sin(a), t: i * 16 };
});

test('spinOf: a full circle before the flick is a curve ball, its sign is the direction', () => {
  const up = (pts) => [...pts, { x: pts.at(-1).x, y: pts.at(-1).y - 150, t: pts.at(-1).t + 80 }];
  assert.equal(spinOf(up(circle(1))), 1);
  assert.equal(spinOf(up(circle(-1))), -1);
  assert.equal(spinOf([{ x: 200, y: 800, t: 0 }, { x: 200, y: 700, t: 50 }, { x: 205, y: 600, t: 100 }]), 0);
  assert.equal(spinOf(up(circle(1, 8))), 0); // half a turn is not enough
});

test('landing: the item touches the ground where at() reaches y = 0', () => {
  const v = { x: 0, y: 1.1, z: 0.8 };
  const land = landing(v, 0);
  assert.equal(land.y, 0);
  near(at(v, 0, land.t).y, 0);
  near(land.z, 0.8 * land.t);
  near(land.x, 0);
  assert.equal(at(v, 0, 0).y, THROW.y0);
});

test('landing: spin pulls the item sideways', () => {
  const v = { x: 0, y: 1.1, z: 0.8 };
  const t = landing(v, 0).t;
  near(landing(v, 1).x, 0.5 * THROW.spinAcc * t * t);
  near(landing(v, -1).x, -0.5 * THROW.spinAcc * t * t);
});

test('judge: bands by ground distance from the pet', () => {
  const pet = { x: 0.1, z: 0.6 };
  assert.equal(judge({ x: 0.1, z: 0.65 }, pet), 'excellent');
  assert.equal(judge({ x: 0.2, z: 0.6 }, pet), 'great');
  assert.equal(judge({ x: 0.1, z: 0.45 }, pet), 'nice');
  assert.equal(judge({ x: 0.5, z: 0.6 }, pet), 'miss');
  assert.deepEqual(FOOD_HEARTS, { excellent: 5, great: 3, nice: 2, miss: 1 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/habit-tower && node --test pet.test.mjs`
Expected: FAIL, `Cannot find module '.../pet.js'`.

- [ ] **Step 3: Write `pet.js`**

```js
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
  const first = samples.find((s) => s.t >= last.t - THROW.sampleMs);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/habit-tower && node --test`
Expected: all pass (26 existing + 8 new = 34), `# fail 0`.

If `spinOf(up(circle(1)))` returns 0: the 20-point circle turns 19 × 22.5° = 427°, so check the angle wrap line before changing the test.

- [ ] **Step 5: Commit**

```bash
cd ~/habit-tower && git add pet.js pet.test.mjs && git commit -m "feat(pet): throw physics, curve detection and judgement rules"
```
(End the message with the session's Co-Authored-By and Claude-Session lines.)

---

### Task 2: Store hearts (`pets/<monsterId>`)

**Files:**
- Modify: `logic.js:138` (`DOC_PATH`)
- Modify: `db.js` (`subscribe`, `makeActions`)
- Test: `logic.test.mjs`

- [ ] **Step 1: Write the failing backup test**

Append to `logic.test.mjs`:

```js
test('validBackup accepts pet heart docs', () => {
  assert.equal(validBackup({ version: 1, docs: [['pets/snail-green', { gained: 3, lost: 0 }]], photos: [] }), true);
  assert.equal(validBackup({ version: 1, docs: [['pets/Snail!', { gained: 3 }]], photos: [] }), false);
  assert.equal(validBackup({ version: 1, docs: [['pets/snail-green/x', {}]], photos: [] }), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/habit-tower && node --test logic.test.mjs`
Expected: FAIL on the first `assert.equal(..., true)`.

- [ ] **Step 3: Allow `pets/` in `DOC_PATH`**

In `logic.js` replace line 138:

```js
const DOC_PATH = /^(habit\/me|days\/\d{4}-\d{2}-\d{2}|pulls\/([dc]:\d{4}-\d{2}-\d{2}|b:\d{1,5})|pets\/[a-z]+-[a-z]+)$/;
```

- [ ] **Step 4: Run the tests**

Run: `cd ~/habit-tower && node --test`
Expected: `# fail 0`.

- [ ] **Step 5: Load `pets` in `subscribe`**

In `db.js` `subscribe`, change the state and the loaded count, and add a fourth listener:

```js
export function subscribe(db, onState, onError) {
  const st = { habit: null, days: {}, pulls: {}, pets: {}, loaded: false };
  const seen = new Set();
  const emit = (part, s) => {
    if (!s.metadata.fromCache) seen.add(part);
    st.loaded = seen.size === 4;
    onState({ ...st });
  };
```

and after the `pulls` listener inside `offs`:

```js
    db.collection('pets').onSnapshot((s) => {
      st.pets = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      emit('pets', s);
    }, onError),
```

Update the comment above `subscribe` from "all three sources" to "all four sources".

- [ ] **Step 6: Add `feedPet`**

In `db.js` `makeActions`, right after `const ready = () => {...};` add:

```js
  let petWrites = Promise.resolve(); // feeds write one after another: each reads the doc the last one wrote
```

and add this action after `equip`:

```js
    // Hearts for a pet: pets/<monsterId> = {gained, lost}. Both only grow; hearts = gained − lost.
    // Reads the doc itself, not React state, so two quick feeds can't overwrite each other.
    // async so a not-ready or bad call rejects instead of throwing inside the playroom's animation loop.
    async feedPet(id, n) {
      ready();
      if (!ITEMS.get(id)?.base || !(n > 0)) throw new Error('먹이를 줄 수 없어요');
      const run = petWrites.then(async () => {
        const ref = db.doc(`pets/${id}`), snap = await ref.get(), p = snap.exists ? snap.data() : {};
        await ref.set({ ...p, gained: (p.gained ?? 0) + n, lost: p.lost ?? 0 });
      });
      petWrites = run.catch(() => {});
      return run;
    },
```

- [ ] **Step 7: Check it in the dev console**

Run: `cd ~/habit-tower && node --check db.js && node --test`
Expected: no syntax error, `# fail 0`.

- [ ] **Step 8: Commit**

```bash
cd ~/habit-tower && git add logic.js logic.test.mjs db.js && git commit -m "feat(pet): pets/<id> heart docs, feedPet action, backup accepts them"
```

---

### Task 3: The playroom (`ui/playroom.js` + CSS)

**Files:**
- Create: `ui/playroom.js`
- Modify: `index.html` `<style>` (append before `</style>`)

- [ ] **Step 1: Write `ui/playroom.js`**

```js
// Pet playroom: flick an apple at my pet (spec: docs/superpowers/specs/2026-09-29-pet-playroom-design.md).
// One animation loop moves the pet and the thrown item by writing styles directly. Preact only renders the frame,
// the heart count and the judgement pop-up.
import { html, useState, useEffect, useRef } from './h.js';
import { Monster } from './monsters.js';
import { ITEMS } from '../catalog.js';
import { flick, spinOf, at, landing, judge, FOOD_HEARTS } from '../pet.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';

const HORIZON = 0.38, HAND = 0.92; // field heights: where the far ground meets the sky, where z = 0 is
const PET_PX = 9;                  // monster pixel size at z = 0
const WANDER = { x: 0.6, z: [0.45, 0.85], walk: 0.15, run: 0.6 }; // where the pet strolls, speeds in units/s
const GROUND = { x: [-0.9, 0.9], z: [0.15, 1.4] };                 // a missed item rolls back inside this
const EAT_MS = 700;
const SAY = { excellent: 'Excellent!', great: 'Great!', nice: 'Nice!', miss: '냠' };

const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const rand = ([a, b]) => a + Math.random() * (b - a);

// World point -> field px and scale. 1 world unit = half the field width at z = 0.
function project(p, w, h) {
  const s = 1 / (1 + 3 * p.z), ground = h * HORIZON + (h * HAND - h * HORIZON) * s;
  return { left: w / 2 + p.x * (w / 2) * s, top: ground - (p.y ?? 0) * (w / 2) * s, s };
}
// Bottom-center anchored: the element's bottom middle sits on (left, top).
const place = (el, left, top, sx, sy = Math.abs(sx)) => {
  el.style.transform = `translate(${left}px, ${top}px) scale(${sx}, ${sy}) translate(-50%, -100%)`;
};

// pet: {id, shiny}. hearts: the pet's current hearts. onFeed(n): save n more hearts.
export function Playroom({ pet, hearts, onFeed, onClose }) {
  const field = useRef(), petEl = useRef(), itemEl = useRef(), shadowEl = useRef();
  const feed = useRef(onFeed);
  feed.current = onFeed;
  const [pop, setPop] = useState(null); // {text, n, key}
  const st = useRef(null);
  st.current ??= {
    pet: { x: 0, z: 0.6, tx: 0, tz: 0.6, speed: WANDER.walk, face: 1, eatUntil: 0 },
    item: { mode: 'ready' }, // ready | drag | fly | ground | eaten
    samples: [],
  };

  const eat = (now, j) => {
    const { pet: p } = st.current, n = FOOD_HEARTS[j];
    st.current.item = { mode: 'eaten' };
    p.eatUntil = now + EAT_MS; p.tx = p.x; p.tz = p.z;
    sfx(j === 'excellent' ? 'rare' : 'common');
    buzz(j === 'excellent' ? 'rare' : 'tap');
    setPop({ text: SAY[j], n, key: now });
    feed.current(n);
    setTimeout(() => { if (st.current.item.mode === 'eaten') st.current.item = { mode: 'ready' }; }, EAT_MS);
  };

  // The item touched the ground: a hit is eaten at once, a miss waits for the pet to walk over.
  const settle = (now) => {
    const { pet: p, item: it } = st.current;
    const j = judge(it.land, p);
    if (j !== 'miss') return eat(now, j);
    it.mode = 'ground';
    it.pos = { x: clamp(it.land.x, GROUND.x), y: 0, z: clamp(it.land.z, GROUND.z) };
    p.tx = it.pos.x; p.tz = it.pos.z; p.speed = WANDER.run; p.eatUntil = 0;
  };

  const step = (now, dt) => {
    const { pet: p, item: it } = st.current;
    if (it.mode === 'fly') {
      const t = (now - it.t0) / 1000;
      if (t >= it.land.t) settle(now);
      else { const q = at(it.v, it.spin, t); it.pos = { ...q, x: q.x + it.x0 }; }
    }
    if (now < p.eatUntil) return;
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.01) {
      if (st.current.item.mode === 'ground') return eat(now, 'miss');
      p.tx = rand([-WANDER.x, WANDER.x]); p.tz = rand(WANDER.z); p.speed = WANDER.walk;
      return;
    }
    const m = Math.min(d, p.speed * dt);
    p.x += (dx / d) * m; p.z += (dz / d) * m;
    if (Math.abs(dx) > 0.001) p.face = Math.sign(dx);
  };

  const draw = () => {
    const f = field.current;
    if (!f) return;
    const w = f.clientWidth, h = f.clientHeight, { pet: p, item: it } = st.current;
    const pp = project(p, w, h);
    place(petEl.current, pp.left, pp.top, -p.face * pp.s, pp.s); // the art faces left
    petEl.current.style.zIndex = String(Math.round(1000 - p.z * 500));
    const ie = itemEl.current, se = shadowEl.current;
    ie.style.visibility = it.mode === 'eaten' ? 'hidden' : 'visible';
    se.style.visibility = it.mode === 'fly' ? 'visible' : 'hidden';
    if (it.mode === 'ready') place(ie, w / 2, h - 8, 1);
    else if (it.mode === 'drag') place(ie, it.fx, it.fy + 30, 1);
    else if (it.pos) {
      const q = project(it.pos, w, h), g = project({ ...it.pos, y: 0 }, w, h);
      place(ie, q.left, q.top, q.s * 1.6);
      ie.style.zIndex = String(Math.round(1000 - it.pos.z * 500));
      place(se, g.left, g.top + 4, g.s * 1.6);
      se.style.zIndex = '1';
    }
  };

  useEffect(() => {
    let raf, prev = performance.now();
    const frame = (now) => {
      step(now, Math.min(0.05, (now - prev) / 1000));
      prev = now;
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const local = (e) => { const r = field.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => {
    if (st.current.item.mode !== 'ready') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [fx, fy] = local(e);
    st.current.item = { mode: 'drag', fx, fy };
    st.current.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    sfx('tap');
  };
  const move = (e) => {
    const it = st.current.item;
    if (it.mode !== 'drag') return;
    [it.fx, it.fy] = local(e);
    st.current.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  };
  const up = (e) => {
    const it = st.current.item;
    if (it.mode !== 'drag') return;
    move(e);
    const w = field.current.clientWidth, v = flick(st.current.samples, w);
    if (!v) { st.current.item = { mode: 'ready' }; return; }
    const spin = spinOf(st.current.samples), x0 = (it.fx - w / 2) / (w / 2), land = landing(v, spin);
    st.current.item = { mode: 'fly', v, spin, x0, t0: performance.now(), land: { ...land, x: land.x + x0 }, pos: { x: x0, y: 0.15, z: 0 } };
  };
  const cancel = () => { if (st.current.item.mode === 'drag') st.current.item = { mode: 'ready' }; };

  return html`<div class="playroom" role="dialog" aria-label="펫과 놀기">
    <div class="pr-top"><b>${ITEMS.get(pet.id)?.name ?? '펫'}</b><span>💗 ${hearts}</span>
      <button class="x" onClick=${onClose} aria-label="닫기">✕</button></div>
    <div class="pr-field" ref=${field}>
      <span class="pr-shadow" ref=${shadowEl} />
      <span class=${'pr-pet' + (pet.shiny ? ' sparkle' : '')} ref=${petEl}><${Monster} id=${pet.id} shiny=${pet.shiny} px=${PET_PX} /></span>
      <span class="pr-item" ref=${itemEl} role="button" aria-label="사과 던지기"
        onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel}>🍎</span>
      ${pop && html`<p key=${pop.key} class="pr-pop">${pop.text} +${pop.n}💗</p>`}
      <p class="pr-hint">사과를 잡고 위로 튕겨 던져 보세요</p>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Add the CSS**

In `index.html`, append just before `</style>`:

```css
/* Pet playroom (ui/playroom.js) */
.playroom { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; background: var(--sky);
  touch-action: none; user-select: none; -webkit-user-select: none; overscroll-behavior: none; }
.pr-top { display: flex; align-items: center; gap: 10px; padding: max(10px, env(safe-area-inset-top)) 14px 10px;
  color: #fff; text-shadow: 0 1px 0 #000; }
.pr-top b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-top .x { background: none; border: 0; color: #fff; font-size: 18px; padding: 4px 8px; }
.pr-field { position: relative; flex: 1; overflow: hidden; }
.pr-field::before { content: ''; position: absolute; left: 0; right: 0; top: 38%; bottom: 0; background: var(--grass); border-top: 2px solid #3f6e2c; }
.pr-pet, .pr-item, .pr-shadow { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.pr-pet svg { display: block; }
.pr-item { font-size: 44px; line-height: 1; padding: 10px; cursor: grab; touch-action: none; }
.pr-shadow { width: 30px; height: 10px; border-radius: 50%; background: rgba(0,0,0,.25); }
.pr-pop { position: absolute; left: 50%; top: 14%; margin: 0; z-index: 2000; font-size: 22px; font-weight: bold; color: #fff;
  text-shadow: 0 2px 0 #000; white-space: nowrap; pointer-events: none; transform: translateX(-50%); animation: prpop 1.2s ease-out both; }
@keyframes prpop { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.6); } 20% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
  80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -20px); } }
.pr-hint { position: absolute; left: 0; right: 0; bottom: 76px; margin: 0; z-index: 2000; text-align: center; color: #fff; font-size: 12px;
  text-shadow: 0 1px 0 #000; pointer-events: none; }
.crew .pet { background: none; border: 0; padding: 0; cursor: pointer; }
```

- [ ] **Step 3: Syntax check**

Run: `cd ~/habit-tower && node --check ui/playroom.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd ~/habit-tower && git add ui/playroom.js index.html && git commit -m "feat(pet): playroom window with flick throwing and a wandering pet"
```

---

### Task 4: Open it from the tower

**Files:**
- Modify: `ui/scene.js` (Scene signature and crew render, around lines 63–126)
- Modify: `app.js` (state init line 22, imports, Scene props, modal render)
- Modify: `sw.js` (CACHE, SHELL)

- [ ] **Step 1: Make my pet a button in `ui/scene.js`**

Add `onPet` to the comment block and the signature:

```js
// onPet: open the playroom by tapping my pet (the first monster), or null when it isn't mine / not now.
export function Scene({ character, partnerCharacter, look, tag, keys, days, anim, rubble, onBlock, onDone, badge, half, onPet }) {
```

Replace the crew block's opening and children (the `<div class="crew" aria-hidden="true">` through the stars span) with:

```js
    <div class="crew">
      <i class="carried" aria-hidden="true" style=${{ '--c': brickColor(look.brick, half ? n : Math.max(n - 1, 0)) }}>${half
        ? html`<${HalfPhoto} half=${half} />` : html`<${Photo} day=${days[shown.at(-1)]} eager />`}</i>
      ${look.monsters.map((m, i) => i === 0 && onPet
        ? html`<button key=${i} type="button" class=${'mob pet' + (m.shiny ? ' sparkle' : '')} onClick=${onPet} aria-label="펫과 놀기"><${Monster} id=${m.id} shiny=${m.shiny} px=${px} /></button>`
        : html`<span key=${i} class=${'mob' + (m.shiny ? ' sparkle' : '')} aria-hidden="true"><${Monster} id=${m.id} shiny=${m.shiny} px=${px} /></span>`)}
      <span class="hero" aria-hidden="true"><${Sprite} id=${character} skin=${look.hero} px=${px} />${tag && html`<span class="nametag">${tag}</span>`}</span>
      ${partnerCharacter && html`<span class="hero" aria-hidden="true"><${Sprite} id=${partnerCharacter} skin=${look.partnerHero} px=${px} /></span>`}
      <span class="stars" aria-hidden="true">★ ☆ ★</span>
    </div>
```

- [ ] **Step 2: Wire `app.js`**

Imports (next to the other ui imports):

```js
import { Playroom } from './ui/playroom.js';
```

State init (line 22):

```js
  const [state, setState] = useState({ habit: null, days: {}, pulls: {}, pets: {}, loaded: false });
```

Update the `modal` comment to include `'play'`.

Right after `const myLook = ...` / `const look = {...}[view];` add:

```js
  const myPet = buddy(myLook);
  const petHearts = ((p) => (p?.gained ?? 0) - (p?.lost ?? 0))(state.pets[myPet.id]);
  const onPet = ready && state.habit && view !== 'partner' && !anim && !fall ? () => { sfx('tap'); setModal('play'); } : null;
```

Pass it to `<Scene ...>` (the element around line 286): add `onPet=${onPet}` to its props.

Render the window next to the other modals (after the `modal === 'bag'` line):

```js
    ${modal === 'play' && html`<${Playroom} pet=${myPet} hearts=${petHearts}
      onFeed=${(n) => actions.feedPet(myPet.id, n).catch(fail)} onClose=${() => setModal(null)} />`}
```

- [ ] **Step 3: Service worker**

In `sw.js`: `const CACHE = 'habit-tower-v12';` and add `'pet.js'` after `'haptic.js'` and `'ui/playroom.js'` after `'ui/bag.js'` in `SHELL`.

- [ ] **Step 4: Checks**

Run: `cd ~/habit-tower && for f in app.js ui/scene.js ui/playroom.js sw.js db.js pet.js; do node --check $f || echo FAIL $f; done; node --test 2>&1 | grep -E "^# (pass|fail)"`
Expected: no FAIL lines, `# pass 35`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd ~/habit-tower && git add ui/scene.js app.js sw.js && git commit -m "feat(pet): tap my pet on the tower to open the playroom"
```

---

### Task 5: Browser check (headless Chrome over CDP)

The Chrome extension is not connected on this Mac, so drive headless Chrome with a small bun script.

**Files:**
- Create (scratchpad, not committed): `$SCRATCH/pet-cdp.ts` where `SCRATCH=/private/tmp/claude-501/-Users-dk/88a78b5d-6b97-4ea1-95b0-5ceeb326ec4a/scratchpad`

- [ ] **Step 1: Start the server and Chrome**

```bash
cd ~/habit-tower && (python3 -m http.server 8766 >/dev/null 2>&1 &)
S=/private/tmp/claude-501/-Users-dk/88a78b5d-6b97-4ea1-95b0-5ceeb326ec4a/scratchpad
("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=$S/chrome-pet --window-size=412,860 about:blank >/dev/null 2>&1 &)
sleep 3; curl -s localhost:9333/json | grep -c webSocketDebuggerUrl
```
Expected: `1` (or more).

- [ ] **Step 2: Write the script**

```ts
// Open the playroom, flick the apple a few times with mouse pointer events, check hearts go up.
const S = '/private/tmp/claude-501/-Users-dk/88a78b5d-6b97-4ea1-95b0-5ceeb326ec4a/scratchpad';
const list = await (await fetch('http://localhost:9333/json')).json();
const ws = new WebSocket(list.find((t: any) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data as string); wait.get(m.id)?.(m); wait.delete(m.id); };
const send = (method: string, params = {}) => new Promise<any>((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr: string) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mouse = (type: string, x: number, y: number) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `navigator.vibrate = (p) => { (window.__v ||= []).push(p); return true; };` });
await send('Page.navigate', { url: 'http://localhost:8766/?dev&seed=30' });
await sleep(4000);
// seed=30 may show a notice first; close any open window
await js(`document.querySelector('.win .x')?.click()`);
await sleep(300);
console.log('pet button:', await js(`!!document.querySelector('button.pet')`));
await js(`document.querySelector('button.pet').click()`);
await sleep(800);
console.log('playroom open:', await js(`!!document.querySelector('.playroom')`));
const hearts = () => js(`document.querySelector('.pr-top span')?.textContent`);
console.log('hearts before:', await hearts());
for (let k = 0; k < 4; k++) {
  const r = await js(`(() => { const b = document.querySelector('.pr-item').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  let [x, y] = r;
  await mouse('mousePressed', x, y);
  for (let i = 0; i < 6; i++) { y -= 22; await mouse('mouseMoved', x, y); await sleep(16); }
  await mouse('mouseReleased', x, y);
  await sleep(4500); // flight + the pet walking over on a miss
  console.log(`throw ${k + 1}: hearts`, await hearts(), 'pop', await js(`document.querySelector('.pr-pop')?.textContent`));
}
console.log('vibrate calls:', JSON.stringify(await js('window.__v')));
await Bun.write(`${S}/playroom.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64'));
ws.close(); process.exit(0);
```

- [ ] **Step 3: Run it**

Run: `cd $S && perl -e 'alarm 90; exec @ARGV' bun pet-cdp.ts`
Expected:
- `pet button: true`, `playroom open: true`, `hearts before: 💗 0`
- hearts go up after throws (every throw gives at least 1: a hit at once, a miss once the pet reaches it)
- `vibrate calls` contains `40` (hit) or `[70,50,70]` (excellent) entries

If hearts stay at 0: check the `feedPet` call in the console (`Runtime.evaluate` of `window.__errors` is not available; use `Log.enable` or add a temporary `console.log` in `onFeed`), fix the cause, rerun.

- [ ] **Step 4: Look at the screenshot**

Read `$S/playroom.png`. Expected: sky on top, grass from about 38% down, the pet on the grass, the apple at the bottom center, hint text readable.

- [ ] **Step 5: Stop the processes**

```bash
pkill -f "remote-debugging-port=9333"; pkill -f "http.server 8766"
```

---

### Task 6: Phone check (gate before steps 2–5)

- [ ] **Step 1: Ask 도균님 to approve the push** (external action). On yes: `git push origin main`, then `gh api repos/seongmin0522-svg/habit-tower/pages/builds/latest --jq '.status + " " + .commit[0:7]'` until `built <sha>`.
- [ ] **Step 2: 도균님 plays on the Flip 7 (and 타비 on the iPhone if available)** and reports: throw distance too short/long, too easy/hard to hit, pet too small/fast, anything that feels off.
- [ ] **Step 3: Tune only the constants** in `THROW` (`pet.js`) and `WANDER` / `PET_PX` / `HORIZON` (`ui/playroom.js`). If a test pins a number that changed on purpose, update that test. Run `node --test`, commit `fix(pet): tune throw feel after phone test`, push after approval.
- [ ] **Step 4: Update memory** (`project_habit_tower.md`): step 1 done, final constants, what the phone test said.
- [ ] **Step 5: Write the step 2 plan** (four foods, tastes, daily refill with `play/<day>` docs and export skipping `play/`, combo, curve bonus) from the spec, using the tuned constants.

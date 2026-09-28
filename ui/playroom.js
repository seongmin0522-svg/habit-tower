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

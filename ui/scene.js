import { html, useRef, useLayoutEffect } from './h.js';
import { Sprite } from './sprites.js';
import { Monster } from './monsters.js';
import { TOWER_HEIGHT, buddyFor } from '../logic.js';

const TIER = ['#a7a7a7', '#c8643c', '#f2c230']; // floors 1-10 stone, 11-20 brick, 21-30 gold

// Fixed pseudo-random scatter per floor so re-renders never jump mid-collapse.
const rnd = (i, s) => Math.sin(i * 12.9898 + s * 78.233) * 43758.5453 % 1;
const scatter = (i, n) => ({
  '--dx': `${Math.round(20 + Math.abs(rnd(i, 1)) * 150)}px`, // away from the crew on the left
  '--rot': `${Math.round(rnd(i, 2) * 260)}deg`,
  '--pile': `${Math.abs(Math.round(rnd(i, 3) * 14))}px`,
  '--delay': `${(n - 1 - i) * 30}ms`, // top floor falls first
});

// keys: current tower's days, floor 1 first. anim: null | {kind:'stack'} | {kind:'fall', keys}.
export function Scene({ character, keys, anim, rubble, onBlock }) {
  const falling = anim?.kind === 'fall';
  const stacking = anim?.kind === 'stack';
  const shown = falling ? anim.keys : keys;
  const n = shown.length;
  const buddy = buddyFor(n);

  // Hand-off: the flying brick starts exactly where the crew holds it at the jump's peak.
  // offset* ignore transforms, so this measures the crew's resting spot even mid-walk.
  const ref = useRef();
  useLayoutEffect(() => {
    const s = ref.current, held = s?.querySelector('.carried'), b = s?.querySelector('.blk.new');
    if (!stacking || !held || !b) return;
    // Center of el in scene coordinates, summing the offsetParent chain (any ancestor can become one).
    const mid = (el) => {
      let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
      for (let e = el; e && e !== s; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
      return [x, y];
    };
    const [hx, hy] = mid(held), [bx, by] = mid(b);
    b.style.setProperty('--fx', `${hx - bx}px`);
    b.style.setProperty('--fy', `${hy - by - 20}px`); // 20px = jump height at the toss
    b.style.setProperty('--fs', (held.offsetWidth / b.offsetWidth).toFixed(3));
  }, [stacking, n]);

  return html`<div ref=${ref} class=${'scene' + (stacking ? ' stacking' : '') + (falling ? ' falling' : '') + (n === TOWER_HEIGHT ? ' topped' : '')}>
    <div class="crew" aria-hidden="true">
      <i class="carried" style=${{ '--c': TIER[Math.floor(Math.max(n - 1, 0) / 10)] }} />
      <span class="mob" title=${buddy.name}><${Monster} id=${buddy.id} px=${3.5} /></span>
      <span class="hero"><${Sprite} id=${character} px=${3.5} /></span>
      <span class="stars">★ ☆ ★</span>
    </div>
    <div class="tower">
      ${n === TOWER_HEIGHT && !falling && html`<div class="flag">🚩${stacking && html`<span class="sparks">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => html`<i key=${k} style=${{ '--a': `${k * 45}deg` }} />`)}</span>`}</div>`}
      ${stacking && html`<span class="plus">+1층</span><span class="dust" />`}
      <div class="stack">${shown.map((key, i) => html`
        <button key=${key} class=${'blk' + (stacking && i === n - 1 ? ' new' : '') + (falling ? ' fall' : '')}
          style=${{ '--c': TIER[Math.floor(i / 10)], '--i': i, ...(falling ? scatter(i, n) : {}) }}
          aria-label=${`${i + 1}층 · ${key} 인증 사진 보기`} onClick=${() => !falling && onBlock(key)} />`)}
      </div>
      ${rubble && !n && html`<div class="rubble">${[0, 1, 2, 3, 4].map((k) => html`<i key=${k} />`)}</div>`}
      <div class="base" />
    </div>
  </div>`;
}

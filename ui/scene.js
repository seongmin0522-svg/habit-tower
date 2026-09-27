import { html, useRef, useLayoutEffect, useEffect } from './h.js';
import { Sprite } from './sprites.js';
import { Monster } from './monsters.js';
import { TOWER_HEIGHT } from '../logic.js';
import { ITEMS } from '../catalog.js';
import { sfx } from '../sound.js';
import { photoUrl } from '../db.js';

export const TIER = ['#a7a7a7', '#c8643c', '#f2c230']; // floors 1-10 stone, 11-20 brick, 21-30 gold
// Floor color (0-based floor i) for a brick skin id, or the default stone/brick/gold.
export const brickColor = (skin, i) => {
  const b = ITEMS.get(skin);
  return b?.rainbow ? `hsl(${(i * 12) % 360} 75% 62%)` : (b?.colors ?? TIER)[Math.min(2, Math.floor(i / 10))];
};

// Fixed pseudo-random scatter per floor so re-renders never jump mid-collapse.
const rnd = (i, s) => Math.sin(i * 12.9898 + s * 78.233) * 43758.5453 % 1;
const scatter = (i, n) => ({
  '--dx': `${Math.round(20 + Math.abs(rnd(i, 1)) * 150)}px`, // away from the crew on the left
  '--rot': `${Math.round(rnd(i, 2) * 260)}deg`,
  '--pile': `${Math.abs(Math.round(rnd(i, 3) * 14))}px`,
  '--delay': `${(n - 1 - i) * 30}ms`, // top floor falls first
});

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Center of el in root coordinates, summing the offsetParent chain (offset* ignore transforms,
// so a mid-walk crew or a mid-flight brick still reports its resting spot).
const mid = (el, root) => {
  let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
  for (let e = el; e && e !== root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return [x, y];
};

const easeOut = (p) => 1 - (1 - p) ** 2; // matches the brick's decelerating climb
const easeInOut = (p) => (p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

// Scroll `el` to `to` over `ms`; returns a cancel function.
function glide(el, to, ms, ease, done) {
  const from = el.scrollTop, t0 = performance.now();
  let id = requestAnimationFrame(function step(now) {
    const p = Math.min(1, (now - t0) / ms), e = ease(p);
    el.scrollTop = from + (to - from) * e;
    if (p < 1) id = requestAnimationFrame(step); else done?.();
  });
  return () => cancelAnimationFrame(id);
}

// Lazy by default; eager for bricks that must show their photo the moment they move on screen.
// A couple brick (partnerAssetId) shows both photos side by side.
const Photo = ({ day, eager }) => {
  if (!day?.assetId) return null;
  const img = (id, cls) => html`<img class=${cls} src=${photoUrl(id, true)} alt="" loading=${eager ? 'eager' : 'lazy'} decoding="async" draggable="false" />`;
  return day.partnerAssetId ? html`${img(day.assetId, 'half')}${img(day.partnerAssetId, 'half')}` : img(day.assetId);
};

// Half brick: the one photo on its side, a dashed "?" where the missing one goes.
const HalfPhoto = ({ half }) => {
  const img = html`<img class="half" src=${photoUrl(half.assetId, true)} alt="" draggable="false" />`, wait = html`<i class="wait">?</i>`;
  return half.side === 'l' ? html`${img}${wait}` : html`${wait}${img}`;
};

// keys: current tower's days, floor 1 first. anim: null | {kind:'stack'} | {kind:'fall', keys}.
// look: { monsters: [{id, shiny}] (one each), hero, partnerHero (character color skins), brick, flag } — catalog ids or null.
// onDone: the stack sequence (incl. the camera trip) finished.
// badge(key): optional {l, r} reaction emoji for the brick's bottom corners.
// tag: the title worn, shown like a name tag under the crew.
// half: null | {side: 'l'|'r', assetId} — today's couple brick while one of us is still missing (not a floor).
export function Scene({ character, partnerCharacter, look, tag, keys, days, anim, rubble, onBlock, onDone, badge, half }) {
  const falling = anim?.kind === 'fall';
  const stacking = anim?.kind === 'stack';
  const shown = falling ? anim.keys : keys;
  const n = shown.length;
  const px = look.monsters.length > 1 ? 2.6 : 3.5; // the couple crew is four wide: keep it on a 360px phone
  const flag = ITEMS.get(look.flag)?.icon ?? '🚩';

  // Hand-off: the flying brick starts exactly where the crew holds it at the jump's peak.
  // offset* ignore transforms, so this measures the crew's resting spot even mid-walk.
  const ref = useRef();
  useLayoutEffect(() => {
    const s = ref.current, held = s?.querySelector('.carried'), b = s?.querySelector('.blk.new');
    if (!stacking || !held || !b) return;
    const [hx, hy] = mid(held, s), [bx, by] = mid(b, s);
    const fy = hy - by - 20; // 20px = jump height at the toss
    b.style.setProperty('--fx', `${hx - bx}px`);
    b.style.setProperty('--fy', `${fy}px`);
    b.style.setProperty('--fs', (held.offsetWidth / b.offsetWidth).toFixed(3));
    s.style.setProperty('--fd', `${Math.min(1.4, Math.max(.6, .45 + Math.abs(fy) / 1500)).toFixed(2)}s`); // higher tower, longer flight
  }, [stacking, n]);

  // Start at the ground; re-anchor there when the tower changes outside an animation.
  useLayoutEffect(() => {
    const stage = ref.current?.closest('.stage');
    if (stage && !stacking) stage.scrollTop = stage.scrollHeight;
  }, [n]);

  // Camera: follow the brick up to the top, hold, glide back to the ground, then finish.
  useEffect(() => {
    if (!stacking) return;
    if (REDUCED) { onDone?.(); return; }
    const s = ref.current, stage = s.closest('.stage'), bottom = () => stage.scrollHeight - stage.clientHeight;
    stage.scrollTop = bottom();
    const fd = parseFloat(getComputedStyle(s).getPropertyValue('--fd')) * 1000 || 600;
    let cancel = () => {};
    const timers = [
      setTimeout(() => {
        const b = s.querySelector('.blk.new');
        if (!b) return;
        const target = Math.max(0, mid(b, stage)[1] - stage.clientHeight * .35);
        if (target < stage.scrollTop) cancel = glide(stage, target, fd, easeOut);
      }, 1400),
      setTimeout(() => { sfx('brick'); if (n === TOWER_HEIGHT && !half) setTimeout(() => sfx('top'), 300); }, 1400 + fd),
      setTimeout(() => { cancel = glide(stage, bottom(), 700, easeInOut, onDone); }, 1400 + fd + 1100),
    ];
    return () => { timers.forEach(clearTimeout); cancel(); };
  }, [stacking]);

  return html`<div ref=${ref} class=${'scene' + (stacking ? ' stacking' : '') + (falling ? ' falling' : '') + (n === TOWER_HEIGHT ? ' topped' : '')}>
    <div class="crew" aria-hidden="true">
      <i class="carried" style=${{ '--c': brickColor(look.brick, half ? n : Math.max(n - 1, 0)) }}>${half
        ? html`<${HalfPhoto} half=${half} />` : html`<${Photo} day=${days[shown.at(-1)]} eager />`}</i>
      ${look.monsters.map((m, i) => html`<span key=${i} class=${'mob' + (m.shiny ? ' sparkle' : '')}><${Monster} id=${m.id} shiny=${m.shiny} px=${px} /></span>`)}
      <span class="hero"><${Sprite} id=${character} skin=${look.hero} px=${px} />${tag && html`<span class="nametag">${tag}</span>`}</span>
      ${partnerCharacter && html`<span class="hero"><${Sprite} id=${partnerCharacter} skin=${look.partnerHero} px=${px} /></span>`}
      <span class="stars">★ ☆ ★</span>
    </div>
    <div class="tower">
      ${n === TOWER_HEIGHT && !falling && html`<div class="flag">${flag}${stacking && html`<span class="sparks">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => html`<i key=${k} style=${{ '--a': `${k * 45}deg` }} />`)}</span>`}</div>`}
      ${stacking && html`<span class="plus">${half ? '½' : '+1층'}</span><span class="dust" />`}
      <div class="stack">${shown.map((key, i) => html`
        <button key=${key} class=${'blk' + (stacking && !half && i === n - 1 ? ' new' : '') + (falling ? ' fall' : '')}
          style=${{ '--c': brickColor(look.brick, i), '--i': i, ...(falling ? scatter(i, n) : {}) }}
          aria-label=${`${i + 1}층 · ${key} 인증 사진 보기`} onClick=${() => !falling && onBlock(key)}><${Photo} day=${days[key]} eager=${falling || i === n - 1} />${
          ['l', 'r'].map((side) => badge?.(key)?.[side] && html`<span key=${side} class=${'badge ' + side}>${badge(key)[side]}</span>`)}</button>`)}
        ${half && !falling && html`<div class=${'blk halfblk' + (stacking ? ' new' : '')} style=${{ '--c': brickColor(look.brick, n) }}
          role="img" aria-label="오늘 반쪽 벽돌 · 상대 인증 기다리는 중"><${HalfPhoto} half=${half} /></div>`}
      </div>
      ${rubble && !n && !half && html`<div class="rubble">${[0, 1, 2, 3, 4].map((k) => html`<i key=${k} />`)}</div>`}
      <div class="base" />
    </div>
  </div>`;
}

# Half Brick, Tap-to-Open Boxes, Partner Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a half brick on the couple tower when only one of us certified today, make boxes take more taps the rarer they are (with glow, effects and vibration), and push my partner when I certify.

**Architecture:** Pure decisions go in `logic.js` with `node --test` cases (`halfBrick`, `glowAt`). UI changes stay in `ui/scene.js` and `ui/bag.js` with CSS in `index.html`. Vibration is a tiny `haptic.js`. The partner push is a Postgres trigger on `days` that calls the existing `remind` Edge Function with a new `partner_of` body.

**Tech Stack:** Preact + htm (no build), IndexedDB, Supabase (Postgres, pg_net, Edge Functions on Deno, `jsr:@negrel/webpush`), Web Push, `navigator.vibrate`.

Spec: `docs/superpowers/specs/2026-09-27-half-brick-reveal-partner-push-design.md`

Local run: `python3 -m http.server 8766 -d ~/habit-tower`, open `http://localhost:8766/?dev` (`&seed=boxes` for unopened boxes). Chrome caches old JS on python http.server: in the console run `await Promise.all(['app.js','logic.js','ui/scene.js','ui/bag.js','ui/sprites.js','haptic.js','sound.js','catalog.js','ui/windows.js','index.html'].map(f => fetch(f, {cache: 'reload'})))` then reload.

---

### Task 1: `halfBrick` logic

**Files:**
- Modify: `logic.js` (after `coupleDays`)
- Test: `logic.test.mjs`

- [ ] **Step 1: Write the failing test**

Add `halfBrick` to the import list at the top of `logic.test.mjs`, then append:

```js
test('halfBrick: only one of us has a photo for today', () => {
  const P = { assetId: 'me1', at: '' }, Q = { assetId: 'u/p1.jpg', at: '' }, S = { shield: true };
  assert.deepEqual(halfBrick(D([[T, P]]), {}, T), { side: 'l', assetId: 'me1' });
  assert.deepEqual(halfBrick({}, D([[T, Q]]), T), { side: 'r', assetId: 'u/p1.jpg' });
  assert.equal(halfBrick(D([[T, P]]), D([[T, Q]]), T), null);            // both: a real floor instead
  assert.equal(halfBrick({}, {}, T), null);
  assert.equal(halfBrick(D([[T, S]]), {}, T), null);                     // a shield is not a photo
  assert.equal(halfBrick(D([['2026-09-24', P]]), {}, T), null);          // yesterday's photo doesn't count
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/habit-tower && npm test 2>&1 | tail -5`
Expected: FAIL, `halfBrick` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `logic.js`, right after `coupleDays`:

```js
// Today's couple brick while only one of us has certified: that photo on its side ('l' mine, 'r' my partner's).
// It is drawn on top of the couple tower but is not a floor.
export function halfBrick(mine, theirs, today) {
  const a = mine[today]?.assetId, b = theirs[today]?.assetId;
  if (!a === !b) return null;
  return a ? { side: 'l', assetId: a } : { side: 'r', assetId: b };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -5`
Expected: all pass (24 tests).

- [ ] **Step 5: Commit**

```bash
git add logic.js logic.test.mjs
git commit -m "feat(logic): halfBrick for a couple day only one of us certified"
```

### Task 2: Draw the half brick, stop the tab jump

**Files:**
- Modify: `ui/scene.js` (Scene props and markup)
- Modify: `app.js` (import, `half`, Scene prop, onPhoto)
- Modify: `index.html` (CSS after the `.blk img.half` rule)

- [ ] **Step 1: Scene draws `half`**

In `ui/scene.js`, extend the doc comment and signature:

```js
// half: null | {side: 'l'|'r', assetId} — today's couple brick while one of us is still missing (not a floor).
export function Scene({ character, partnerCharacter, look, tag, keys, days, anim, rubble, onBlock, onDone, badge, half }) {
```

The stack animation flies the half brick when there is one. Change the carried photo, the `new` class, the `+1층` label, the top sound and the rubble:

```js
      <i class="carried" style=${{ '--c': brickColor(look.brick, half ? n : Math.max(n - 1, 0)) }}>${half
        ? html`<${HalfPhoto} half=${half} />` : html`<${Photo} day=${days[shown.at(-1)]} eager />`}</i>
```

```js
      ${stacking && html`<span class="plus">${half ? '½' : '+1층'}</span><span class="dust" />`}
```

```js
        <button key=${key} class=${'blk' + (stacking && !half && i === n - 1 ? ' new' : '') + (falling ? ' fall' : '')}
```

After the `shown.map(...)` inside `.stack`, add the half brick (column-reverse puts it on top):

```js
        ${half && !falling && html`<div class=${'blk halfblk' + (stacking ? ' new' : '')} style=${{ '--c': brickColor(look.brick, n) }}
          role="img" aria-label="오늘 반쪽 벽돌 · 상대 인증 기다리는 중"><${HalfPhoto} half=${half} /></div>`}
```

```js
      ${rubble && !n && !half && html`<div class="rubble">...unchanged...</div>`}
```

In the camera effect: `setTimeout(() => { sfx('brick'); if (n === TOWER_HEIGHT && !half) setTimeout(() => sfx('top'), 300); }, 1400 + fd),`

Add next to `Photo`:

```js
// Half brick: the one photo on its side, a dashed "?" where the missing one goes.
const HalfPhoto = ({ half }) => {
  const img = html`<img class="half" src=${photoUrl(half.assetId, true)} alt="" draggable="false" />`, wait = html`<i class="wait">?</i>`;
  return half.side === 'l' ? html`${img}${wait}` : html`${wait}${img}`;
};
```

- [ ] **Step 2: CSS**

In `index.html` after `.blk img.half, .carried img.half { float: left; width: 50%; }`:

```css
.blk .wait, .carried .wait { float: left; width: 50%; height: 100%; display: grid; place-items: center; font-style: normal; font-weight: bold;
  color: #fff; background: rgba(0,0,0,.28); outline: 2px dashed rgba(255,255,255,.85); outline-offset: -3px; text-shadow: 0 1px 0 #000; }
.halfblk:not(.new) .wait { animation: breathe 1.6s ease-in-out infinite; }
```

- [ ] **Step 3: app.js wiring**

Import `halfBrick` from `./logic.js`. After `const keys = current?.keys ?? [];` add:

```js
  const half = view === 'couple' ? halfBrick(state.days, pdays, today) : null;
```

Pass `half=${half}` to `<Scene ...>`. In `onPhoto`, delete the two lines

```js
      // If my partner already certified today, the brick goes on the couple tower.
        if (coupled) setTab(pdays[today]?.assetId ? 'couple' : 'me');
```

and put this comment above `setAnim({ kind: 'stack' });`: `// Stay on this tab: the couple tab stacks a full brick, or a half one while my partner hasn't certified.`

- [ ] **Step 4: Test + component check in the browser**

Run: `npm test 2>&1 | tail -3` → all pass.

Couple mode needs the cloud, so render the Scene alone on `?dev`: in the console

```js
const { html, render } = await import('./ui/h.js'); const { Scene } = await import('./ui/scene.js');
const d = document.createElement('div'); d.className = 'stage'; d.style.cssText = 'position:fixed;inset:0;z-index:99;background:#9cd;overflow:auto';
document.body.append(d);
const look = { monsters: [{ id: 'snail-green' }, { id: 'snail-green' }], brick: null, flag: null };
render(html`<${Scene} character="warrior" partnerCharacter="thief" look=${look} keys=${[]} days=${{}} anim=${null} half=${{ side: 'l', assetId: 'x' }} onBlock=${() => {}} />`, d);
```

Expected: an empty couple tower with one brick on the base, left half a photo (broken image is fine), right half dashed "?". Re-render with `side: 'r'` and with `anim=${{ kind: 'stack' }}` (the half brick flies in, label "½"). Screenshot both.

- [ ] **Step 5: Commit**

```bash
git add ui/scene.js app.js index.html
git commit -m "feat: half brick on the couple tower while one of us hasn't certified; no tab jump after certifying"
```

### Task 3: Taps per tier and `glowAt`

**Files:**
- Modify: `catalog.js:10-15`
- Modify: `logic.js` (next to `roll`)
- Test: `logic.test.mjs`

- [ ] **Step 1: Write the failing test**

Add `glowAt` to the logic import and `TIERS` to the catalog import in `logic.test.mjs`, then append:

```js
test('glowAt: the glow is the least the box can be, never more than it is', () => {
  assert.deepEqual(TIERS.map((t) => t.taps), [2, 5, 20, 30]);
  assert.deepEqual([0, 1, 2, 4, 5, 19, 20, 29].map(glowAt), [null, null, 'rare', 'rare', 'epic', 'epic', 'legend', 'legend']);
  const rank = (id) => TIERS.findIndex((t) => t.id === id);
  for (const [i, t] of TIERS.entries()) assert.ok(rank(glowAt(t.taps - 1)) <= i, t.id); // one tap before it opens
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | tail -5`
Expected: FAIL (`glowAt` not exported / taps undefined).

- [ ] **Step 3: Implement**

`catalog.js` TIERS gets `taps` (taps to open a box of that tier):

```js
export const TIERS = [ // taps: how many taps a box of this tier takes to open
  { id: 'common', name: '일반', weight: 70, color: '#a7a7a7', taps: 2 },
  { id: 'rare', name: '레어', weight: 20, color: '#4a9ae8', taps: 5 },
  { id: 'epic', name: '희귀', weight: 8, color: '#b05ae0', taps: 20 },
  { id: 'legend', name: '전설', weight: 2, color: '#f2c230', taps: 30 },
];
```

`logic.js`, after `roll`:

```js
// Box reveal: after `taps` taps a box still shut is at least the tier whose lower neighbor would have opened by now.
export function glowAt(taps) {
  let g = null;
  for (let i = 1; i < TIERS.length; i++) if (taps >= TIERS[i - 1].taps) g = TIERS[i].id;
  return g;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test 2>&1 | tail -3` → all pass (25).

- [ ] **Step 5: Commit**

```bash
git add catalog.js logic.js logic.test.mjs
git commit -m "feat(logic): taps per tier and glowAt for the box reveal"
```

### Task 4: Vibration

**Files:**
- Create: `haptic.js`
- Modify: `sound.js` (DEFAULTS)
- Modify: `ui/windows.js` (SoundBox)
- Modify: `sw.js` (SHELL list gets `haptic.js`, CACHE → `habit-tower-v9`)

- [ ] **Step 1: `haptic.js`**

```js
// Vibration, on unless turned off in settings (the 'vibe' sound pref). Android: navigator.vibrate patterns.
// iPhone Safari has no Vibration API; clicking a hidden <input type=checkbox switch> gives one system
// haptic tick on iOS 18+ (unverified on a real phone), and only inside a tap handler.
import { getPrefs } from './sound.js';

const PATTERNS = {
  tap: 18, glow: [50, 40, 90],
  common: 70, rare: [70, 50, 70], epic: [80, 40, 80, 40, 160], legend: [100, 50, 100, 50, 100, 50, 360],
};

export function buzz(name) {
  if (!getPrefs().vibe) return;
  if (navigator.vibrate) { navigator.vibrate(PATTERNS[name] ?? 20); return; }
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.style.display = 'none';
  label.append(input);
  document.body.append(label);
  label.click();
  label.remove();
}
```

- [ ] **Step 2: pref + toggle**

`sound.js`: `const DEFAULTS = { bgm: true, sfx: true, vibe: true, track: 1 };`

`ui/windows.js` SoundBox: `<span>${sw('bgm', '🎵 배경음악')}${sw('sfx', '🔔 효과음')}${sw('vibe', '📳 진동')}</span>`

`sw.js`: add `'haptic.js'` to the SHELL file list and bump `CACHE` to `'habit-tower-v9'`.

- [ ] **Step 3: Check**

On `?dev` open 설정: three toggles fit on one line at 360px width (resize the window or use device toolbar); toggling 진동 flips 켜짐/꺼짐 and survives reload. Console: `(await import('./haptic.js')).buzz('tap')` throws nothing.

- [ ] **Step 4: Commit**

```bash
git add haptic.js sound.js ui/windows.js sw.js
git commit -m "feat: vibration helper with a settings toggle"
```

### Task 5: Pixel chest and the tap-to-open reveal

**Files:**
- Modify: `ui/sprites.js` (add `Chest`)
- Modify: `ui/bag.js` (`BoxReveal` rewrite, imports)
- Modify: `index.html` (replace the `.giftbox` rules)

- [ ] **Step 1: `Chest` sprite**

Append to `ui/sprites.js`:

```js
// 16x14 treasure chest. Rows 0-5 are the lid (class "lid", it flies off on open); row 6 is the seam,
// lit in the glow color when there is one. cracks: how many crack pixels show on the body, lit the same.
const CHEST_PAL = { K: '#2b1d14', W: '#a0662a', w: '#6b4423', G: '#f2c230', L: '#ffe14d' };
const CHEST = [
  '..KKKKKKKKKKKK..', '.KWWWWWWWWWWWWK.', 'KWWWWWWWWWWWWWWK', 'KGGGGGGGGGGGGGGK', 'KWWWWWWWWWWWWWWK', 'KwwwwwwKKwwwwwwK',
  'KKKKKKKLLKKKKKKK', 'KWWWWWWLLWWWWWWK', 'KWWWWWWKKWWWWWWK', 'KGGGGGGGGGGGGGGK', 'KWWWWWWWWWWWWWWK', 'KWWWWWWWWWWWWWWK',
  'KwwwwwwwwwwwwwwK', '.KKKKKKKKKKKKKK.',
];
const CRACKS = [[3, 8], [12, 8], [5, 10], [10, 11], [2, 11], [13, 10], [6, 12], [9, 10], [4, 7], [11, 7]];
export function Chest({ px = 6, glow, cracks = 0 }) {
  const cell = (x, y, fill) => html`<rect x=${x} y=${y} width="1.02" height="1.02" fill=${fill} />`;
  const rows = (from, to) => CHEST.slice(from, to).flatMap((row, j) => [...row].map((k, x) => {
    const y = from + j, fill = glow && y === 6 && k === 'K' ? glow : CHEST_PAL[k];
    return fill ? cell(x, y, fill) : null;
  }));
  return html`<svg width=${16 * px} height=${14 * px} viewBox="0 0 16 14" shape-rendering="crispEdges" aria-hidden="true">
    <g class="lid">${rows(0, 6)}</g><g>${rows(6, 14)}</g>${CRACKS.slice(0, cracks).map(([x, y]) => cell(x, y, glow ?? CHEST_PAL.K))}</svg>`;
}
```

- [ ] **Step 2: `BoxReveal` rewrite**

In `ui/bag.js` imports: `import { html, useState, useRef, useEffect } from './h.js';`, `import { Sprite, Chest } from './sprites.js';`, `import { glowAt } from '../logic.js';`, `import { buzz } from '../haptic.js';`. Check `ui/h.js` exports `useRef` and `useEffect` (Scene imports both from it).

Replace the comment above `BoxReveal` and the whole function up to (not including) the prize markup with:

```js
// One box, tapped open. The pull is rolled and saved on the first tap; its tier sets the taps it takes
// (TIERS[].taps). A box still shut past a lower tier's count glows the next tier's color (glowAt),
// then bursts. onEquip(pull) wears it; left = boxes still unopened after this one.
const HINT = { rare: '빛이 새어 나와요… 레어 이상!', epic: '보랏빛이…! 희귀 이상!', legend: '금빛이다!! 전설 확정!' };
const BURST_MS = { common: 700, rare: 900, epic: 1200, legend: 1600 };
const BITS = { common: 8, rare: 12, epic: 16, legend: 24 };

export function BoxReveal({ box, left, shards, onOpen, onEquip, onNext, onClose }) {
  const [pull, setPull] = useState(null);
  const [taps, setTaps] = useState(0);
  const [flash, setFlash] = useState(0);            // bumps restart the white flash
  const [stage, setStage] = useState('shut');       // shut | burst | open
  const count = useRef(0), busy = useRef(false);
  const it = pull && ITEMS.get(pull.item), tier = it && tierOf(it.tier);
  const glow = glowAt(taps), glowColor = glow && tierOf(glow).color;

  useEffect(() => {
    if (stage !== 'burst') return;
    const t = setTimeout(() => setStage('open'), BURST_MS[tier.id]);
    return () => clearTimeout(t);
  }, [stage]);

  const tap = async () => {
    if (stage !== 'shut' || busy.current) return;
    let p = pull;
    if (!p) {
      busy.current = true;
      try { p = await onOpen(box); setPull(p); } catch { return; } finally { busy.current = false; }
    }
    const tr = tierOf(ITEMS.get(p.item)?.tier), n = ++count.current;
    setTaps(n);
    if (n >= tr.taps) {
      setStage('burst'); setFlash((f) => f + 1);
      sfx('open'); buzz(tr.id);
      setTimeout(() => sfx(p.shiny ? 'shiny' : tr.id), 250);
    } else if (glowAt(n) !== glowAt(n - 1)) {
      setFlash((f) => f + 1); sfx('open'); buzz('glow');
    } else { sfx('shake'); buzz('tap'); }
  };

  const hint = taps === 0 ? '상자를 두드려 보세요' : HINT[glow] ?? '한 번 더!';
  return html`<${Win} title=${boxName(box)} onClose=${taps > 0 && stage !== 'open' ? null : onClose}
    cls=${'reveal-win' + (stage === 'burst' ? ' quake t-' + tier.id : '')}>
    ${flash > 0 && html`<i key=${flash} class="flash" />`}
    <div class="body pad center">
      ${stage !== 'open' ? html`
        <div class=${'chestwrap' + (glow ? ' glow' : '') + (stage === 'burst' ? ' burst' : '')}
          style=${{ '--gc': stage === 'burst' ? tier.color : glowColor || '#fff' }}>
          <span class="rays" />
          ${stage === 'burst' && html`<span class="bits">${Array.from({ length: BITS[tier.id] }, (_, k) => html`<i key=${k}
            style=${{ '--a': `${(360 / BITS[tier.id]) * k}deg` }} />`)}</span>`}
          <button key=${taps} class=${'chest' + (taps ? ' hit' : '')} onClick=${tap} aria-label="상자 두드리기">
            <${Chest} glow=${glowColor} cracks=${taps} /></button>
        </div>
        <p class="big" aria-live="polite">${stage === 'burst' ? '두근두근…' : hint}</p>
        <p class="muted small">${box.startsWith('d:') || box.startsWith('c:') ? `${box.slice(2)} 인증 보상` : '조각 10개 보상'}</p>`
      : html`
```

Keep the existing prize markup (`<div class=${'prize t-' ...` through the end of the ternary) and the footer unchanged. The footer condition `stage === 'open'` still works.

- [ ] **Step 3: CSS**

In `index.html`, delete the three `.giftbox` lines and the `@keyframes wobble` line, and add:

```css
.chestwrap { position: relative; display: grid; place-items: center; width: 180px; height: 130px; margin: 4px auto; --gc: #fff; }
.chest { position: relative; z-index: 1; background: none; border: 0; padding: 0; cursor: pointer; animation: breathe 1.6s ease-in-out infinite; }
.chest.hit { animation: hit .22s cubic-bezier(.2,1.8,.4,1); }
.chest svg { display: block; filter: drop-shadow(0 3px 0 rgba(0,0,0,.35)); }
.glow .chest svg { filter: drop-shadow(0 0 5px var(--gc)) drop-shadow(0 0 14px var(--gc)); }
.chest .lid { transform-box: fill-box; transform-origin: 0% 100%; }
.burst .chest { animation: none; } .burst .chest .lid { animation: lidoff .45s cubic-bezier(.3,1.4,.5,1) forwards; }
.rays { position: absolute; inset: -20px; border-radius: 50%; opacity: 0; pointer-events: none; transition: opacity .3s;
  background: repeating-conic-gradient(color-mix(in srgb, var(--gc) 75%, transparent) 0 10deg, transparent 10deg 30deg);
  -webkit-mask: radial-gradient(circle, #000 15%, transparent 70%); mask: radial-gradient(circle, #000 15%, transparent 70%); animation: spin 6s linear infinite; }
.glow .rays { opacity: .4; } .burst .rays { opacity: 1; animation-duration: 1.4s; }
.bits { position: absolute; left: 50%; top: 50%; z-index: 2; }
.bits i { position: absolute; width: 6px; height: 6px; background: var(--gc); box-shadow: 0 0 4px #fff; animation: bit .7s ease-out both; }
.bits i:nth-child(3n) { background: #fff; }
.flash { position: fixed; inset: 0; z-index: 5; background: #fff; pointer-events: none; animation: flash .45s ease-out both; }
.reveal-win.quake { animation: quake .4s; } .reveal-win.quake.t-epic { animation: quake .12s 4; } .reveal-win.quake.t-legend { animation: quake .1s 8; }
@keyframes hit { 0% { transform: scale(1.18,.8) translateY(6px); } 60% { transform: scale(.94,1.08) translateY(-6px); } }
@keyframes lidoff { to { transform: translate(-4px,-10px) rotate(-28deg); opacity: 0; } }
@keyframes bit { 0% { opacity: 1; transform: rotate(var(--a)) translateX(0); } 100% { opacity: 0; transform: rotate(var(--a)) translateX(90px) scale(.5); } }
@keyframes flash { from { opacity: .85; } to { opacity: 0; } }
@keyframes quake { 20%, 60% { transform: translate(-6px, 3px); } 40%, 80% { transform: translate(6px, -3px); } }
@media (prefers-reduced-motion: reduce) {
  .reveal-win.quake, .chest, .chest.hit, .rays { animation: none; }
  .flash { animation-duration: .2s; opacity: .3; }
}
```

(`spin` and `breathe` keyframes already exist.)

- [ ] **Step 4: Browser check per tier**

`?dev&seed=boxes`, certify once, or open 가방 → 상자. Force a tier in the console before the first tap by pinning `crypto.getRandomValues` (r1 picks the tier by weight 70/20/8/2):

```js
const pin = (r1) => { crypto.getRandomValues = (a) => { a[0] = Math.floor(r1 * 2 ** 32); a[1] = 0; a[2] = 2 ** 32 - 1; return a; }; };
pin(0.1);   // common  → opens on tap 2, no glow
pin(0.8);   // rare    → blue from tap 2, opens on tap 5
pin(0.95);  // epic    → blue, purple from tap 5, opens on tap 20
pin(0.995); // legend  → blue, purple, gold from tap 20, opens on tap 30
```

For each: the tap count matches, the glow color and hint change at 2 / 5 / 20, the close ✕ is gone while tapping, the burst shows lid off + rays + bits + flash + shake, and the prize card appears. Check the ✕ comes back on the prize card and "다음 상자" still works. Check at 360px width. Screenshot the gold glow and a burst. Console errors: none.

- [ ] **Step 5: Run tests and commit**

Run: `npm test 2>&1 | tail -3` → all pass.

```bash
git add ui/sprites.js ui/bag.js index.html
git commit -m "feat: pixel chest that takes 2/5/20/30 taps by tier, with glow, burst and vibration"
```

### Task 6: Partner push (code only, not deployed)

**Files:**
- Modify: `supabase/functions/remind/index.ts`
- Modify: `supabase/schema.sql` (append)
- Modify: `sw.js` (push handler `tag`)

- [ ] **Step 1: `remind` gets the `partner_of` branch**

Replace the body of `supabase/functions/remind/index.ts` from `const MESSAGE` to the end with:

```ts
const REMIND = { title: '🧱 오늘 벽돌 아직이에요', body: '자정 지나면 탑이 무너져요', tag: 'remind' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

type Sub = { endpoint: string; p256dh: string; auth: string };

// {"partner_of": uid}: uid's photo for today just landed (days insert trigger). Push uid's partner:
// "couple brick done" if the partner already certified today, else a nudge.
async function partnerPush(uid: string): Promise<{ subs: Sub[]; message: object; kind: string }> {
  const none = { subs: [], message: {}, kind: 'none' };
  const { data: me } = await sb.from('profiles').select('name, couple_id').eq('id', uid).maybeSingle();
  if (!me?.couple_id) return none;
  const { data: partner } = await sb.from('profiles').select('id').eq('couple_id', me.couple_id).neq('id', uid).maybeSingle();
  if (!partner) return none;
  const { data: done } = await sb.from('days').select('day').eq('user_id', partner.id).eq('day', today())
    .not('photo_path', 'is', null).maybeSingle();
  const { data: subs } = await sb.from('push_subs').select().eq('user_id', partner.id);
  const name = me.name || '짝꿍';
  return done
    ? { subs: subs ?? [], kind: 'couple', message: { title: '💞 커플 벽돌 완성!', body: `${name}도 인증해서 우리 탑이 한 층 올라갔어요`, tag: 'partner' } }
    : { subs: subs ?? [], kind: 'partner', message: { title: `🧱 ${name} 오늘 인증 완료`, body: '나도 쌓으러 가기 👉', tag: 'partner' } };
}

Deno.serve(async (req) => {
  const { data: cfg, error } = await sb.rpc('remind_config');
  if (error || !cfg?.cron_secret) return new Response('config missing', { status: 500 });
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  let subs: Sub[], message: object = REMIND, kind = 'remind';
  if (body?.partner_of) {
    ({ subs, message, kind } = await partnerPush(body.partner_of));
  } else {
    const { data, error: e2 } = body?.endpoint
      ? await sb.from('push_subs').select().eq('endpoint', body.endpoint)
      : await sb.rpc('remind_targets');
    if (e2) return new Response(e2.message, { status: 500 });
    subs = data;
  }

  const app = await webpush.ApplicationServer.new({
    contactInformation: 'mailto:dokyun0813@gmail.com',
    vapidKeys: await webpush.importVapidKeys(cfg.vapid_keys),
  });
  const text = JSON.stringify(message);
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      // ttl 3h: a phone that is off until morning shouldn't get last night's push.
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(text, { ttl: 10800, urgency: webpush.Urgency.High });
      sent++;
    } catch (e) {
      if (e instanceof webpush.PushMessageError && [404, 410].includes(e.response.status)) {
        await sb.from('push_subs').delete().eq('endpoint', s.endpoint);
        gone++;
      } else {
        failed++;
        console.error(String(e));
      }
    }
  }));
  return Response.json({ kind, sent, gone, failed });
});
```

Also update the header comment: add the line `// Body {"partner_of": "<uid>"} (days insert trigger) pushes that user's partner instead.`

- [ ] **Step 2: Trigger in `schema.sql`**

Append:

```sql
-- Partner push (2026-09-27): my photo for today lands, my partner's phone hears about it.
-- Insert only: a retake is an update, so at most one per person per day. Shield days and late uploads of past days send nothing.
create function public.notify_partner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.photo_path is not null and new.day = (now() at time zone 'Asia/Seoul')::date then
    perform net.http_post(
      url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := jsonb_build_object('partner_of', new.user_id),
      timeout_milliseconds := 10000);
  end if;
  return null;
end $$;
revoke execute on function public.notify_partner() from public, anon, authenticated;
create trigger days_notify_partner after insert on public.days
  for each row execute function public.notify_partner();
```

- [ ] **Step 3: `sw.js` tag**

```js
// Pushes from supabase/functions/remind: the 9pm reminder (tag 'remind') and partner news (tag 'partner'),
// on separate tags so one doesn't replace the other. Tapping brings the app forward (or opens it).
self.addEventListener('push', (e) => {
  const { title = '해빗 타워', body = '', tag = 'remind' } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', tag }));
});
```

(CACHE was bumped to v9 in Task 4; no second bump needed.)

- [ ] **Step 4: Type check the function**

Run: `cd ~/habit-tower && (command -v deno && deno check supabase/functions/remind/index.ts) || echo "no deno: checked at deploy"`
Expected: no type errors, or the fallback line.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/remind/index.ts supabase/schema.sql sw.js
git commit -m "feat(push): tell my partner when my photo for today lands"
```

### Task 7: Deploy and verify (ask DK first)

Server changes go live for both phones immediately. Ask DK once for: migration + function deploy + test push to DK's phone + `git push`.

- [ ] **Step 1: Deploy the function** with Supabase MCP `deploy_edge_function` (name `remind`, `verify_jwt: false`, file `index.ts` from Step 6.1).

- [ ] **Step 2: Apply the trigger** with `apply_migration` (name `partner_push`, the SQL from Task 6 Step 2).

- [ ] **Step 3: Regression check of the 9pm path** — `select net.http_post(... body := jsonb_build_object('endpoint', 'https://example.invalid/x'))` (same headers as the cron job), then `select status_code, content from net._http_response order by id desc limit 1`. Expected: `{"kind":"remind","sent":0,"gone":0,"failed":0}`, because there is no subscription with that endpoint.

- [ ] **Step 4: Trigger path with SQL test users**

```sql
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt-a@test.invalid', '{}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt-b@test.invalid', '{}', '{}', now(), now());
with c as (insert into public.couples (invite_code) values ('PTTEST01') returning id)
insert into public.profiles (id, name, couple_id) select u, n, c.id from c,
  (values ('00000000-0000-4000-8000-0000000000a1'::uuid, '에이'), ('00000000-0000-4000-8000-0000000000b2'::uuid, '비')) v(u, n)
on conflict (id) do update set name = excluded.name, couple_id = excluded.couple_id;
insert into public.push_subs (endpoint, user_id, p256dh, auth)
values ('https://example.invalid/pt-b', '00000000-0000-4000-8000-0000000000b2', 'x', 'x');
insert into public.days (user_id, day, photo_path) values ('00000000-0000-4000-8000-0000000000a1', (now() at time zone 'Asia/Seoul')::date, 'pt/a.jpg');
```

Wait ~3 s, then `select content from net._http_response order by id desc limit 1`. Expected: `{"kind":"partner","sent":0,"gone":0,"failed":1}` (fake endpoint fails). Then insert a today row for `…b2` with `'pt/b.jpg'` and give `…a1` a fake sub `https://example.invalid/pt-a`. Expected: `"kind":"couple"`. Then check that an update (`update public.days set photo_path = 'pt/a2.jpg' where user_id = '…a1'`) adds no new `_http_response` row.

Cleanup: `delete from auth.users where id in ('…a1', '…b2'); delete from public.couples where invite_code = 'PTTEST01';` then confirm `select count(*) from public.profiles` = 2.

- [ ] **Step 5: Delivery to DK's phone (DK approved in the ask above)** — body `{"partner_of": "<Tabi's user id>"}`: DK's phone shows "🧱 타비 오늘 인증 완료" (or the couple text if DK certified today). Only works after DK turned on push (`select count(*) from push_subs where user_id = <DK>` > 0); if 0, say so and skip.

- [ ] **Step 6: `git push`**, then load the Pages site, check that `sw.js` shows `habit-tower-v9` and there are no console errors.

- [ ] **Step 7: Update memory** `project_habit_tower.md`: what shipped, commits, what is unverified (iPhone haptic trick, real partner push on Tabi's phone).

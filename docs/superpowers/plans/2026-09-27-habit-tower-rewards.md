# Habit Tower Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gacha boxes earned by certifying, 100 monsters (+shiny), 40 skins, 10 couple skins, 12 titles, BGM + SFX — per `docs/superpowers/specs/2026-09-27-habit-tower-rewards-design.md`.

**Architecture:** Pure data in `catalog.js`; every decision (roll, unopened boxes, shards, owned, titles, sync diffs) pure in `logic.js` with node tests. Pulls are docs `pulls/<box>` in the same local db as days (so backup/restore carry them); the look is `habit/me.look`. Cloud mirrors pulls (restore) and look (partner sees it). UI: new `ui/bag.js`; scene/sprites/monsters take a look. `sound.js` owns audio.

**Tech Stack:** Preact + htm (no build), IndexedDB, Supabase (supabase-js 2.117.2), `node --test`, ffmpeg for audio conversion, playwright-core (scratchpad) for screenshots.

---

## File map
- Create `catalog.js` — tiers, monsters, skins, couple skins, titles, constants.
- Modify `logic.js` — drop `MONSTERS`/`buddyFor`; add `roll`, `owned`, `boxes`, `shards`, `titles`, `pullsToPush`, `pullsToRestore`; `validBackup` accepts `pulls/…`.
- Modify `logic.test.mjs` — replace buddyFor test; add tests below.
- Modify `db.js` — subscribe `pulls`; actions `openBox`, `equip`; dev seed `boxes`.
- Modify `ui/monsters.js` — art per base (31 maps), catalog palettes, `shiny`.
- Modify `ui/sprites.js` — `skin` palette override.
- Create `ui/bag.js` — Bag window (상자/도감/꾸미기/칭호) + BoxOpen reveal.
- Modify `ui/scene.js` — monsters list, brick colors, flag from look.
- Modify `ui/windows.js` — sound rows in Setup; reuse `Win` (export it).
- Modify `app.js` — look per view, bag modal, box after stack, HUD, sound hooks.
- Create `sound.js` — BGM + SFX, prefs.
- Create `audio/` (4 BGM mp3 + SFX mp3), `CREDITS.md`.
- Modify `cloud.js` — pulls sync, `profiles.look`, couple skin rpc.
- Modify `supabase/schema.sql` + apply migration.
- Modify `index.html` (CSS), `sw.js` (SHELL + `habit-tower-v8`).

## Interfaces (fixed names used across tasks)
```js
// catalog.js
export const REWARDS_FROM = '2026-09-27';
export const SHINY_RATE = 0.03;
export const DUPS_PER_BONUS = 10;
export const STARTER = 'snail-green';
export const TIERS = [ { id: 'common', name: '일반', weight: 70, color }, { id: 'rare', name: '레어', weight: 20, color },
  { id: 'epic', name: '희귀', weight: 8, color }, { id: 'legend', name: '전설', weight: 2, color } ];
export const MONSTERS; // [{ id, base, name, tier, pal }] ×100
export const SKINS;    // [{ id, kind: 'char'|'bg'|'brick'|'flag', name, tier, couple?: true, cls?, pal?, sky?, grass?, colors?, icon? }] ×50
export const TITLES;   // [{ id, name, desc }] ×12
export const ITEMS;    // Map id -> monster|skin
export const POOL, COUPLE_POOL;
// logic.js
roll(pool, [r1, r2, r3]) -> { item, shiny }
owned(pulls) -> Set of 'id' | 'id*'  (shiny)   // always has STARTER
boxes({ days, cdays, pulls, from }) -> ['d:…', 'c:…', 'b:0', …]  (unopened, oldest first)
shards(pulls) -> 0..9
titles({ days, cdays, pulls, today }) -> Set of title ids
pullsToPush(pulls, rows) -> box ids;  pullsToRestore(rows, pulls) -> [{ box, doc }]
// db.js actions
openBox(box, cdays) -> pull doc {item, shiny, dup, at};  equip(patch) -> habit/me.look merged
```

### Task 1: catalog.js
- [ ] Write `catalog.js` with the counts in the spec: monsters common 50 / rare 30 / epic 15 / legend 5; skins 14/12/10/4 by tier (char 16 = 4 classes × 4, bg 8, brick 8, flag 8); couple skins 4/3/2/1.
- [ ] Test (append to `logic.test.mjs`):
```js
test('catalog counts and unique ids', () => {
  const by = (xs, t) => xs.filter((x) => x.tier === t).length;
  assert.deepEqual(['common', 'rare', 'epic', 'legend'].map((t) => by(MONSTERS, t)), [50, 30, 15, 5]);
  const solo = SKINS.filter((s) => !s.couple), duo = SKINS.filter((s) => s.couple);
  assert.deepEqual(['common', 'rare', 'epic', 'legend'].map((t) => by(solo, t)), [14, 12, 10, 4]);
  assert.deepEqual(['common', 'rare', 'epic', 'legend'].map((t) => by(duo, t)), [4, 3, 2, 1]);
  assert.equal(new Set([...MONSTERS, ...SKINS].map((x) => x.id)).size, 150);
  assert.ok(ITEMS.has(STARTER));
  assert.equal(TITLES.length, 12);
});
```
- [ ] `npm test` → pass. Commit `feat: rewards catalog`.

### Task 2: logic — roll, owned, boxes, shards
- [ ] Failing tests:
```js
test('roll picks tier by weight, item by index, shiny for monsters only', () => {
  const pool = POOL;
  assert.equal(roll(pool, [0, 0, 0.5]).item.tier, 'common');
  assert.equal(roll(pool, [0.69, 0, 0.5]).item.tier, 'common');
  assert.equal(roll(pool, [0.70, 0, 0.5]).item.tier, 'rare');
  assert.equal(roll(pool, [0.90, 0, 0.5]).item.tier, 'epic');
  assert.equal(roll(pool, [0.98, 0, 0.5]).item.tier, 'legend');
  assert.equal(roll(pool, [0.999, 0.999, 0.5]).item.tier, 'legend');
  const mon = roll(pool, [0, 0, 0.01]);
  assert.equal(mon.shiny, !!mon.item.base);
  assert.equal(roll(pool, [0, 0, 0.03]).shiny, false);
  assert.equal(roll(COUPLE_POOL, [0.99, 0.5, 0]).shiny, false);
});
test('owned always has the starter; shiny counts apart', () => {
  const o = owned({ 'd:2026-10-01': { item: 'bat-purple', shiny: true } });
  assert.ok(o.has(STARTER) && o.has('bat-purple*') && !o.has('bat-purple'));
});
test('boxes: photo days from the start date, couple days, bonus from dups; minus opened', () => {
  const days = { '2026-09-26': { assetId: 'a' }, '2026-09-27': { assetId: 'b' }, '2026-09-28': { shield: true }, '2026-09-29': { assetId: 'c' } };
  const cdays = { '2026-09-27': { assetId: 'b', partnerAssetId: 'x' }, '2026-09-28': { shield: true } };
  const pulls = { 'd:2026-09-27': { item: 'snail-green', dup: true } };
  assert.deepEqual(boxes({ days, cdays, pulls, from: '2026-09-27' }), ['c:2026-09-27', 'd:2026-09-29']);
  const dups = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`b:x${i}`, { dup: true }]));
  assert.deepEqual(boxes({ days: {}, cdays: {}, pulls: { ...dups, 'b:0': { dup: false } }, from: '' }), ['b:1']);
  assert.equal(shards(dups), 1);
});
```
- [ ] Run `npm test` → fail (not defined). Implement in `logic.js`; delete `MONSTERS`, `buddyFor` and their test. Run → pass. Commit `feat: roll, boxes, shards, owned`.

### Task 3: logic — titles, sync diffs, backup paths
- [ ] Failing tests:
```js
const run = (start, n, extra = {}) => Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(start, i), { assetId: 'p' + i, ...extra }]));
test('titles', () => {
  const t = (o) => [...titles({ days: {}, cdays: {}, pulls: {}, today: '2026-12-31', ...o })].sort();
  assert.deepEqual(t({}), []);
  assert.deepEqual(t({ days: run('2026-10-01', 1) }), ['first']);
  assert.ok(t({ days: run('2026-10-01', 7) }).includes('week'));
  const thirty = run('2026-10-01', 30);
  assert.ok(t({ days: thirty }).includes('tower') && t({ days: thirty }).includes('straight'));
  const withShield = { ...run('2026-10-01', 10), '2026-10-11': { shield: true }, ...run('2026-10-12', 20) };
  assert.ok(t({ days: withShield }).includes('tower') && !t({ days: withShield }).includes('straight'));
  assert.ok(t({ days: { ...run('2026-01-01', 3), ...run('2026-02-01', 7) } }).includes('comeback'));
  assert.ok(t({ pulls: { a: { item: 'bat-purple', shiny: true } } }).includes('shiny'));
  assert.ok(t({ cdays: run('2026-10-01', 30, { partnerAssetId: 'q' }) }).includes('couple'));
});
test('pull sync diffs', () => {
  const pulls = { 'd:2026-10-01': { item: 'bat-purple', shiny: false, dup: false, at: 't' }, 'b:0': { item: 'x', shiny: false, dup: true, at: '' } };
  assert.deepEqual(pullsToPush(pulls, [{ box: 'b:0' }]), ['d:2026-10-01']);
  assert.deepEqual(pullsToRestore([{ box: 'b:0', item: 'x', shiny: false, dup: true, at: null }, { box: 'b:1', item: 'y', shiny: true, dup: false, at: 't' }], pulls),
    [{ box: 'b:1', doc: { item: 'y', shiny: true, dup: false, at: 't' } }]);
});
test('backup accepts pull docs', () => {
  assert.ok(validBackup({ version: 1, docs: [['pulls/d:2026-10-01', { item: 'a' }], ['pulls/b:3', {}]], photos: [] }));
  assert.ok(!validBackup({ version: 1, docs: [['pulls/../x', {}]], photos: [] }));
});
```
Title ids: first, week, tower, towers3, straight, days100, comeback, shiny, legend, dex50, dex100, couple.
- [ ] Implement, run → pass. Commit `feat: titles and pull sync decisions`.

### Task 4: db — pulls in state, openBox, equip, dev seed
- [ ] `subscribe` listens to `pulls` collection too; `loaded` needs all 3.
- [ ] `openBox(box, cdays)`: refuse if already opened or not in `boxes(...)`; pool = `c:` → COUPLE_POOL else POOL; `r = crypto.getRandomValues(new Uint32Array(3))/2**32`; `dup = owned(pulls).has(key)`; write `pulls/<box>` first; return the doc.
- [ ] `equip(patch)`: `habit/me.look = {...look, ...patch}`; only owned ids accepted (else throw '아직 없는 아이템이에요').
- [ ] Seed `boxes`: 6 photo days ending yesterday + today not certified.
- [ ] Browser check: `?dev&seed=boxes`, `window` console `await import('/logic.js')` sanity. Commit.

### Task 5: art — monsters and character skins
- [ ] `ui/monsters.js`: `ART` keyed by base (8 existing + 23 new 16×16 maps), `Monster({ id, px, shiny })` merges `ART[base].pal` with catalog `pal`, shiny adds class `shiny` (CSS `filter: hue-rotate(180deg) saturate(1.3)` + sparkle).
- [ ] `ui/sprites.js`: `Sprite({ id, px, skin })` — `skin` = SKINS id of kind char for this class, merges its `pal`.
- [ ] Screenshot a grid of all 100 (+ shiny row) with playwright at 2x; eyeball each. Commit.

### Task 6: bag window + box reveal + scene look
- [ ] `ui/bag.js`: `Bag({ tab, boxes, shards, pulls, look, coupleSkin, view, titles, onOpen, onEquip, onEquipCouple, onClose })` tabs 상자/도감/꾸미기/칭호; `BoxReveal({ box, onOpen, onEquip, onClose })` two taps (shake → open), tier glow, shiny sparkle.
- [ ] `scene.js`: props `monsters` ([{id, shiny}]), `bricks` (3 colors), `flag` (icon); `charSkins` for hero sprites. `TIER` stays default brick colors.
- [ ] `app.js`: look per view (me: habit.look; partner: partner.look; couple: both monsters + couple skin), stage style `--sky/--grass` from bg skin, HUD 가방 + 🎁N, open reveal after stack ends when a new box exists, remove buddyFor usage.
- [ ] Browser: seed boxes → open all, equip each kind, 360/390/412 screenshots. Commit.

### Task 7: titles UI
- [ ] Bag 칭호 tab lists 12 (locked greyed with desc), equip one → `look.badge`; HUD shows badge chip. Commit.

### Task 8: cloud
- [ ] Migration: `pulls` table + RLS own; `profiles.look jsonb`; `couples.skin jsonb`; `couple_info` returns skin; `set_couple_skin(skin jsonb)` (validate keys bg/brick/flag, text ≤ 40). Append same SQL to `supabase/schema.sql`. Apply via MCP; `get_advisors` security clean.
- [ ] `cloud.js` doSync: restore pulls (`pullsToRestore`) → local docs; push (`pullsToPush`) upsert; profiles upsert includes `look`; select partner `look`; `info.skin` → `coupleSkin`; api `setCoupleSkin`.
- [ ] Couple boxes need synced partner days: `boxes` gets cdays only when `cloud.synced`.
- [ ] Verify with SQL on the real project (no new accounts: signups are off) — RLS: pulls of partner not readable (`set role authenticated` + jwt claim test). Commit.

### Task 9: sound
- [ ] Download packs; ffmpeg to mp3 (BGM 96 kbps stereo, loop-trimmed files; SFX 64 kbps mono); put in `audio/`; `CREDITS.md` with links + CC0.
- [ ] `sound.js`: prefs `{ bgm: true, track: 1|2|3|4|'random', sfx: true }` in localStorage (try/catch); `unlock()` on first pointerdown; `bgm()` fetch→blob→`<audio loop>`; pause on hidden; `sfx(name)` via Web Audio buffers (decode lazily).
- [ ] Hooks: stack → 'brick', 30 → 'top', box shake/open/tier/shiny, buttons 'tap'.
- [ ] Setup rows: BGM on/off + track select, SFX on/off. HUD 🔊 toggles both. Commit.

### Task 10: finish
- [ ] `sw.js` SHELL += catalog.js, sound.js, ui/bag.js; CACHE `habit-tower-v8`.
- [ ] `npm test`; full browser pass at 360/390/412 (me/couple via component render), console errors none.
- [ ] Update spec/memory; ask nothing more — user pre-approved push: `git push`, then check Pages serves new `sw.js`.

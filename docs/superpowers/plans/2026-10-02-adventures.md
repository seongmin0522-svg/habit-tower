# Pet Adventures, Journal, Eggs, Greetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily loop around the pet: check in → adventure ticket → send → 3 h later a story and gifts → journal; eggs that hatch with check-ins; a greeting bubble on the tower screen; the partner's adventure line in the couple tab.

**Architecture:** Pure rules in `adventure.js` (rolls, status, eggs, greeting, sync merge) over local docs `adv/<day>`, stories in `stories.js`, pixel art through a new `ui/pix.js` renderer with art data in `ui/art/adventure.js`, screens in `ui/adventure.js`, wired into `app.js`, `ui/scene.js`, `ui/playroom.js`, `ui/bag.js`. Coins and shards stay derived from records; eggs are derived too and hatch as pulls `e:<key>`.

**Tech Stack:** plain ES modules + Preact/htm, IndexedDB via `localdb.js`, Supabase sync in `cloud.js`, `node --test`.

Spec: `docs/superpowers/specs/2026-10-02-retention-adventures-design.md`.

---

## Ground rules

- Branch `feat/adventures` from `main` (2A's `feat/accounts-legal` waits; don't merge it).
- Tests `npm test` (baseline `# pass 83`). Headless Chrome on :9333 + scratchpad `cdp.mjs` at 360×740; screenshots stay in the scratchpad.
- Local app `python3 -m http.server 8766 -d ~/habit-tower`; `?dev` = in-memory data where adventures return in 10 s; `?dev&seed=adv` (Task 5) gives a ticket, a returned adventure and eggs.
- New user-visible strings go through `tl` with English in `lang/en.js` (the i18n check test gates it). Stories carry their own `ko`/`en`.
- New files go into `sw.js` SHELL.
- Live actions (migration, push) only after 도균님's yes. **Task 7 is a gate: 도균님 approves the art sample before Task 8.**

## File map

| File | Responsibility |
|---|---|
| `adventure.js` (new) | `ADV` numbers; `rollAdventure`, `hasTicket`, `statusOf`, `unclaimed`, `advCoins`, `advShards`; `eggsOf`, `hatchProgress`, `nest`; `greeting`; `mergeAdventures`, `toRow` |
| `adventure.test.mjs` (new) | tests for all of the above |
| `stories.js` (new) | `PLACES` (8, names ko/en), `STORIES` (first-visit + 6+ per place, `text`/`line` ko/en), `fill()` |
| `stories.test.mjs` (new) | content checks |
| `catalog.js` | `EGGS_FROM` |
| `logic.js` | backup doc paths `adv/<day>`, pulls `e:[as]:<day>` |
| `shop.js` | `income()` adds claimed adventure coins |
| `db.js` | `adv` in the subscription; `sendAdventure`, `claimAdventure`; `openBox` hatches eggs; seed `adv` |
| `ui/pix.js` (new) | `pixUrl(art)`, `<Pix>` |
| `ui/art/adventure.js` (new) + `art.test.mjs` | 8 place scenes, egg + cracks + color variants, signpost, book |
| `ui/adventure.js` (new) | `ReturnCard`, `Journal`, `PlaceArt`, `clockText` |
| `ui/bag.js` | nest row; `BoxReveal` shows the egg for `e:` keys |
| `ui/scene.js` | greeting bubble, away signpost, departing pet |
| `ui/playroom.js` | 📖 journal button, away panel |
| `app.js` | wiring: clock, ticket banner, send, return card, journal, admin sandbox, couple line |
| `cloud.js` | adventures sync both ways, partner's recent adventures, reset deletes them |
| `supabase/schema.sql` | `adventures` table + RLS, `pulls_box_check` with `e:` (applied at deploy) |
| `lang/en.js`, `sw.js`, `index.html` | strings, SHELL + `CACHE` v17, CSS |

---

### Task 1: Adventure rolls and status (`adventure.js`)

**Files:** Create `adventure.js`, `adventure.test.mjs`; create a minimal `stories.js` stub so imports resolve (Task 4 fills it).

- [ ] **Step 1: Stub `stories.js`** (replaced in Task 4):

```js
// Adventure places and stories (spec: docs/superpowers/specs/2026-10-02-retention-adventures-design.md). Data only.
export const PLACES = [];
export const STORIES = [];
export const fill = (s, vars) => s.replace(/\{(pet|habit)\}/g, (_, k) => vars[k] ?? '');
```

- [ ] **Step 2: Write the failing tests** `adventure.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADV, rollAdventure, hasTicket, statusOf, unclaimed, advCoins, advShards } from './adventure.js';

const PL = ['forest', 'beach'];
const ST = [
  { id: 'forest-0', place: 'forest', first: true }, { id: 'forest-1', place: 'forest' }, { id: 'forest-2', place: 'forest' },
  { id: 'beach-0', place: 'beach', first: true }, { id: 'beach-1', place: 'beach' }, { id: 'beach-2', place: 'beach' },
];
const roll = (adv, rs) => rollAdventure(adv, rs, ST, PL);

test('rollAdventure: a first visit tells the first-visit story and adds the bonus', () => {
  const r = roll({}, [0, 0.5, 0, 0.99, 0.99, 0.99]);
  assert.equal(r.place, 'forest');
  assert.equal(r.story, 'forest-0');
  assert.equal(r.first, true);
  assert.equal(r.coins, ADV.coins[0] + ADV.firstBonus);
  assert.deepEqual([r.food, r.shard, r.egg], [false, false, false]);
});

test('rollAdventure: new places weigh 3x, told stories wait until all are told', () => {
  const adv = { '2026-10-01': { place: 'forest', story: 'forest-0' } };
  // weights: forest 1, beach 3 → r < 0.25 is forest
  assert.equal(roll(adv, [0.2, 0, 0, 1, 1, 1]).place, 'forest');
  assert.equal(roll(adv, [0.3, 0, 0, 1, 1, 1]).place, 'beach');
  const r = roll({ ...adv, '2026-10-02': { place: 'forest', story: 'forest-1' } }, [0.1, 0.99, 0, 1, 1, 1]);
  assert.equal(r.story, 'forest-2'); // forest-1 told, forest-2 left
  const all = { ...adv, a: { place: 'forest', story: 'forest-1' }, b: { place: 'forest', story: 'forest-2' } };
  assert.ok(['forest-1', 'forest-2'].includes(roll(all, [0.1, 0.4, 0, 1, 1, 1]).story)); // all told: any regular one
});

test('rollAdventure: coins in range, gift rates over many rolls', () => {
  let food = 0, shard = 0, egg = 0;
  const visitedBoth = { a: { place: 'forest', story: 'forest-0' }, b: { place: 'beach', story: 'beach-0' } };
  for (let i = 0; i < 1000; i++) {
    const f = (k) => ((i * 7919 + k * 104729) % 1000) / 1000;
    const r = roll(visitedBoth, [f(1), f(2), f(3), f(4), f(5), f(6)]);
    assert.ok(r.coins >= ADV.coins[0] && r.coins <= ADV.coins[1]);
    food += r.food; shard += r.shard; egg += r.egg;
  }
  assert.ok(Math.abs(food / 1000 - ADV.food) < 0.05 && Math.abs(shard / 1000 - ADV.shard) < 0.03 && Math.abs(egg / 1000 - ADV.egg) < 0.02);
});

test('ticket, status, unclaimed, coins and shards', () => {
  const days = { '2026-10-02': { assetId: 'x' }, '2026-10-01': { shield: true } };
  assert.equal(hasTicket(days, {}, '2026-10-02'), true);
  assert.equal(hasTicket(days, {}, '2026-10-01'), false); // a shield day has no ticket
  const a = { returnAt: 100, claimed: false, coins: 7, shard: true };
  assert.equal(hasTicket(days, { '2026-10-02': a }, '2026-10-02'), false);
  assert.equal(statusOf(undefined, 50), null);
  assert.equal(statusOf(a, 50), 'away');
  assert.equal(statusOf(a, 100), 'back');
  assert.equal(statusOf({ ...a, claimed: true }, 100), 'done');
  const adv = { '2026-10-02': a, '2026-09-30': { ...a, claimed: true, coins: 12, shard: false }, '2026-10-01': { ...a } };
  assert.deepEqual(unclaimed(adv, 200), ['2026-10-01', '2026-10-02']);
  assert.equal(advCoins(adv), 12);
  assert.equal(advShards(adv), 0);
  assert.equal(advShards({ x: { ...a, claimed: true } }), 1);
});
```

- [ ] **Step 3:** `npm test 2>&1 | grep -E "^# (pass|fail)|SyntaxError|Cannot find"` → fails (no `adventure.js`).

- [ ] **Step 4: Implement** `adventure.js`:

```js
// Pet adventures and eggs (spec: docs/superpowers/specs/2026-10-02-retention-adventures-design.md). Pure.
// adv/<day> = {pet, shiny, place, story, first, departAt, returnAt, coins, food, shard, egg, claimed}; times in ms.
import { addDays, runs } from './logic.js';
import { STORIES, PLACES } from './stories.js';

// Every number to tune lives here.
export const ADV = {
  returnMs: 3 * 3600e3, quickMs: 10e3, // quick: ?dev and admin mode
  coins: [5, 15], firstBonus: 10, food: 0.4, shard: 0.1, egg: 0.03,
  newWeight: 3, hatchDays: 3, streakEvery: 7,
};

const pick = (list, weights, r) => {
  let x = r * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x < 0) return list[i]; }
  return list.at(-1);
};
const visited = (adv) => new Set(Object.values(adv).map((a) => a.place));
const told = (adv) => new Set(Object.values(adv).map((a) => a.story));

// rs: six numbers in [0, 1) — place, story, coins, snack, shard, egg.
export function rollAdventure(adv, rs, stories = STORIES, places = PLACES.map((p) => p.id)) {
  const seen = visited(adv), done = told(adv);
  const place = pick(places, places.map((p) => (seen.has(p) ? 1 : ADV.newWeight)), rs[0]);
  const first = !seen.has(place);
  const here = stories.filter((s) => s.place === place && !!s.first === first);
  const fresh = here.filter((s) => !done.has(s.id)), pool = fresh.length ? fresh : here;
  const [lo, hi] = ADV.coins;
  return {
    place, story: pick(pool, pool.map(() => 1), rs[1]).id, first,
    coins: lo + Math.floor(rs[2] * (hi - lo + 1)) + (first ? ADV.firstBonus : 0),
    food: rs[3] < ADV.food, shard: rs[4] < ADV.shard, egg: rs[5] < ADV.egg,
  };
}

// A ticket: today has a photo (not just a shield) and no adventure yet.
export const hasTicket = (days, adv, today) => !!days[today]?.assetId && !adv[today];
// 'away' until returnAt, then 'back' until claimed, then 'done'; null without an adventure.
export const statusOf = (a, now) => (!a ? null : now < a.returnAt ? 'away' : a.claimed ? 'done' : 'back');
// Returned and not claimed yet, oldest first.
export const unclaimed = (adv, now) => Object.keys(adv).sort().filter((d) => statusOf(adv[d], now) === 'back');
const claimed = (adv) => Object.values(adv).filter((a) => a.claimed);
export const advCoins = (adv) => claimed(adv).reduce((n, a) => n + a.coins, 0);
export const advShards = (adv) => claimed(adv).filter((a) => a.shard).length;
```

- [ ] **Step 5:** `npm test` → `# fail 0`.
- [ ] **Step 6: Commit** `feat(adventure): rolls, ticket and status`.

---

### Task 2: Eggs (`eggsOf`, `hatchProgress`, `nest`)

**Files:** Modify `adventure.js`, `adventure.test.mjs`.

- [ ] **Step 1: Tests** (append; import `eggsOf, hatchProgress, nest` and `addDays` from `./logic.js`):

```js
const photos = (start, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(start, i), { assetId: 'p' + i }]));

test('eggsOf: an egg on every 7th photo day in a row, from `from` on, shields bridging', () => {
  const days = { ...photos('2026-10-01', 15) };
  assert.deepEqual(eggsOf({ days, adv: {}, from: '2026-10-01' }).map((e) => e.key), ['s:2026-10-07', 's:2026-10-14']);
  assert.deepEqual(eggsOf({ days, adv: {}, from: '2026-10-03' }).map((e) => e.key), ['s:2026-10-09']); // counts from `from`
  const bridged = { ...photos('2026-10-01', 3), '2026-10-04': { shield: true }, ...photos('2026-10-05', 4) };
  assert.deepEqual(eggsOf({ days: bridged, adv: {}, from: '2026-10-01' }).map((e) => e.key), ['s:2026-10-08']);
  const broken = { ...photos('2026-10-01', 3), ...photos('2026-10-05', 6) };
  assert.deepEqual(eggsOf({ days: broken, adv: {}, from: '2026-10-01' }), []);
});

test('eggsOf: claimed adventure eggs only', () => {
  const adv = { '2026-10-02': { egg: true, claimed: true }, '2026-10-03': { egg: true, claimed: false }, '2026-10-04': { egg: false, claimed: true } };
  assert.deepEqual(eggsOf({ days: {}, adv, from: '2026-10-01' }).map((e) => e.key), ['a:2026-10-02']);
});

test('hatchProgress and nest: ready after 3 later photo days, gone once hatched', () => {
  const egg = { key: 'a:2026-10-02', day: '2026-10-02' };
  const days = { ...photos('2026-10-02', 3) }; // the 2nd (its own day), 3rd, 4th
  assert.equal(hatchProgress(egg, days), 2);
  days['2026-10-06'] = { assetId: 'z' };
  assert.equal(hatchProgress(egg, days), 3);
  const adv = { '2026-10-02': { egg: true, claimed: true } };
  assert.deepEqual(nest({ days, adv, pulls: {}, from: '2026-10-01' }), [{ key: 'a:2026-10-02', day: '2026-10-02', n: 3, ready: true }]);
  assert.deepEqual(nest({ days, adv, pulls: { 'e:a:2026-10-02': { item: 'x' } }, from: '2026-10-01' }), []);
});
```

- [ ] **Step 2:** `npm test` → fails (exports missing).
- [ ] **Step 3: Implement** (append to `adventure.js`):

```js
// Eggs: an adventure gift ('a:<day>') and every 7th photo day in a row from `from` on ('s:<day>'). A hatched egg is the
// pull 'e:<key>'. Derived from the records, never stored.
export function eggsOf({ days, adv, from }) {
  const out = Object.keys(adv).filter((d) => d >= from && adv[d].claimed && adv[d].egg).map((d) => ({ key: 'a:' + d, day: d }));
  for (const r of runs(days)) {
    const keys = r.keys.filter((k) => k >= from);
    for (let i = ADV.streakEvery - 1; i < keys.length; i += ADV.streakEvery) out.push({ key: 's:' + keys[i], day: keys[i] });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.key.localeCompare(b.key));
}
// Photo days after the egg's own day, up to hatchDays.
export const hatchProgress = (egg, days) =>
  Math.min(ADV.hatchDays, Object.keys(days).filter((k) => k > egg.day && days[k]?.assetId).length);
// The nest: eggs not hatched yet, with progress n; a ready one opens as box 'e:<key>'.
export const nest = ({ days, adv, pulls, from }) => eggsOf({ days, adv, from })
  .filter((e) => !pulls['e:' + e.key])
  .map((e) => { const n = hatchProgress(e, days); return { ...e, n, ready: n >= ADV.hatchDays }; });
```

- [ ] **Step 4:** `npm test` → `# fail 0`. **Step 5: Commit** `feat(adventure): eggs from adventures and streaks`.

---

### Task 3: Greeting and sync merge

**Files:** Modify `adventure.js`, `adventure.test.mjs`.

- [ ] **Step 1: Tests** (import `greeting, mergeAdventures, toRow`):

```js
test('greeting: first match wins', () => {
  const T = '2026-10-10', now = 1000;
  const g = (days, adv = {}, hour = 9) => greeting({ days, adv, today: T, now, hour })?.key;
  const today = { [T]: { assetId: 't' } };
  assert.equal(g(today, { '2026-10-09': { returnAt: 0, claimed: false } }), 'back');
  assert.equal(greeting({ days: today, adv: { [T]: { returnAt: 5000 } }, today: T, now, hour: 9 }).left, 4000);
  assert.equal(g(today, { [T]: { returnAt: 5000 } }), 'away');
  assert.equal(g(today), 'ready');
  assert.equal(g({ '2026-10-06': { assetId: 'a' } }), 'miss');       // 4 days ago
  assert.equal(g({ '2026-10-09': { assetId: 'a' } }, {}, 19), 'evening');
  assert.equal(g({ '2026-10-09': { assetId: 'a' } }, {}, 9), 'today');
  assert.equal(g({}), 'today');                                     // a brand-new user
  const streak = { ...photos('2026-10-08', 3) }, done = { [T]: { returnAt: 0, claimed: true } };
  assert.deepEqual(greeting({ days: streak, adv: done, today: T, now, hour: 9 }), { key: 'streak', face: 'excited', n: 3 });
  assert.equal(greeting({ days: { [T]: { assetId: 't' } }, adv: done, today: T, now, hour: 9 }), null);
});

test('mergeAdventures: copies each way; claimed wins', () => {
  const doc = { pet: 'snail-green', shiny: false, place: 'beach', story: 'beach-1', first: false, departAt: 0, returnAt: 10800000,
    coins: 9, food: true, shard: false, egg: false, claimed: false };
  const row = toRow('2026-10-02', doc);
  assert.equal(row.depart_at, '1970-01-01T00:00:00.000Z');
  const m1 = mergeAdventures({ '2026-10-02': doc }, []);
  assert.deepEqual(m1.push, [row]);
  assert.deepEqual(m1.restore, []);
  const m2 = mergeAdventures({}, [row]);
  assert.deepEqual(m2.restore, [['2026-10-02', doc]]);
  const m3 = mergeAdventures({ '2026-10-02': doc }, [{ ...row, claimed: true }]);
  assert.deepEqual(m3.restore, [['2026-10-02', { ...doc, claimed: true }]]);
  assert.deepEqual(m3.push, []);
  const m4 = mergeAdventures({ '2026-10-02': { ...doc, claimed: true } }, [row]);
  assert.deepEqual(m4.push, [{ ...row, claimed: true }]);
});
```

- [ ] **Step 2:** fails. **Step 3: Implement** (append):

```js
const between = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// The buddy pet's bubble on the tower screen (spec "Pet greetings"); first match wins. hour: local hour.
export function greeting({ days, adv, today, now, hour }) {
  if (unclaimed(adv, now).length) return { key: 'back', face: 'excited' };
  if (statusOf(adv[today], now) === 'away') return { key: 'away', face: null, left: adv[today].returnAt - now };
  if (hasTicket(days, adv, today)) return { key: 'ready', face: 'excited' };
  const last = Object.keys(days).filter((k) => days[k]?.assetId).sort().at(-1);
  if (last && between(last, today) >= 3) return { key: 'miss', face: 'sad' };
  if (!days[today]?.assetId) return hour >= 18 ? { key: 'evening', face: 'surprised' } : { key: 'today', face: 'joy' };
  const run = runs(days).at(-1), n = run?.end === today ? run.keys.length : 0;
  return n >= 3 ? { key: 'streak', face: 'excited', n } : null;
}

// Cloud rows <-> local docs. A day on one side only is copied over; on both, claimed wins.
export const toRow = (day, a) => ({
  day, pet: a.pet, shiny: a.shiny, place: a.place, story: a.story, first: a.first,
  depart_at: new Date(a.departAt).toISOString(), return_at: new Date(a.returnAt).toISOString(),
  coins: a.coins, food: a.food, shard: a.shard, egg: a.egg, claimed: a.claimed,
});
const toDoc = (r) => ({
  pet: r.pet, shiny: r.shiny, place: r.place, story: r.story, first: r.first, departAt: Date.parse(r.depart_at),
  returnAt: Date.parse(r.return_at), coins: r.coins, food: r.food, shard: r.shard, egg: r.egg, claimed: r.claimed,
});
export function mergeAdventures(local, rows) {
  const cloud = Object.fromEntries(rows.map((r) => [r.day, r]));
  return {
    restore: rows.filter((r) => !local[r.day] || (r.claimed && !local[r.day].claimed))
      .map((r) => [r.day, local[r.day] ? { ...local[r.day], claimed: true } : toDoc(r)]),
    push: Object.keys(local).filter((d) => !cloud[d] || (local[d].claimed && !cloud[d].claimed)).map((d) => toRow(d, local[d])),
  };
}
```

(`addDays` stays imported for Task 10's partner window; drop the import if unused at the end.)

- [ ] **Step 4:** `npm test` → `# fail 0`. **Step 5: Commit** `feat(adventure): greeting and cloud merge`.

---

### Task 4: Places and stories (`stories.js`)

**Files:** Replace `stories.js`; create `stories.test.mjs`.

- [ ] **Step 1: Test** `stories.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, STORIES, fill } from './stories.js';

const holes = (s) => (s.match(/\{(pet|habit)\}/g) ?? []).sort().join();
test('8 places, each with one first-visit story and 6+ others', () => {
  assert.equal(PLACES.length, 8);
  for (const p of PLACES) {
    assert.ok(p.name.ko && p.name.en, p.id);
    const here = STORIES.filter((s) => s.place === p.id);
    assert.equal(here.filter((s) => s.first).length, 1, p.id);
    assert.ok(here.filter((s) => !s.first).length >= 6, p.id);
  }
});
test('every story: unique id <place>-<n>, both languages, same placeholders', () => {
  assert.equal(new Set(STORIES.map((s) => s.id)).size, STORIES.length);
  for (const s of STORIES) {
    assert.match(s.id, /^[a-z]{1,20}-\d{1,2}$/);
    assert.ok(PLACES.some((p) => p.id === s.place), s.id);
    for (const part of ['text', 'line']) {
      assert.ok(s[part].ko && s[part].en, `${s.id} ${part}`);
      assert.equal(holes(s[part].ko), holes(s[part].en), `${s.id} ${part}`);
    }
  }
});
test('fill', () => assert.equal(fill('{pet}와 {habit}', { pet: '달팽이', habit: '운동' }), '달팽이와 운동'));
```

- [ ] **Step 2: Write the content.** `PLACES` = `[{ id: 'forest', name: { ko: '숲', en: 'Forest' } }, …]` for forest, beach, mountain, cave, flowers (꽃밭/Flower field), snow (설원/Snowfield), desert (사막/Desert), sky (하늘섬/Sky island). `STORIES`: per place `<place>-0` with `first: true` (arriving somewhere new), then `<place>-1` … `<place>-6` at least. Each `text`: 2–3 short sentences, warm and a little funny, the pet as the hero, a concrete find or small mishap; `{pet}` in most, `{habit}` in about a third ("주인님이 {habit} 하는 동안…"). Korean uses the app's `이(가)`/`은(는)` style after `{pet}`. Each `line`: the one-line news for the partner, starting with `{pet}`, ending `…대요` in Korean ("{pet}이(가) 바닷가에서 반짝이는 조개를 주웠대요" / "{pet} found a shiny shell on the beach"). English is natural, not literal.
- [ ] **Step 3:** `npm test` → `# fail 0` (Task 1–3 tests too: they pass their own fixtures).
- [ ] **Step 4:** Read all stories once in each language: no repeats of the same joke, no typos, each place feels different. **Commit** `content(adventure): 8 places and their stories`.

---

### Task 5: Records, coins, actions, seed

**Files:** Modify `catalog.js`, `logic.js:149`, `shop.js:15-22`, `db.js` (imports, `subscribe`, `makeActions`, `openBox`, seeds), `app.js:128,165`.

- [ ] **Step 1: `catalog.js`** after `REWARDS_FROM`: `export const EGGS_FROM = '<the deploy day, YYYY-MM-DD>'; // streak eggs count from the adventures launch`.
- [ ] **Step 2: `logic.js` `DOC_PATH`**: add `|adv\/\d{4}-\d{2}-\d{2}` and, inside the pulls group, `|e:[as]:\d{4}-\d{2}-\d{2}`.
- [ ] **Step 3: `shop.js`**: `import { advCoins } from './adventure.js';`; `income({ days, maze, pets, pulls, adv = {} })` gets `+ advCoins(adv)`. Add to `shop.test.mjs`: `assert.equal(income({ days: {}, maze: {}, pets: {}, pulls: {}, adv: { x: { claimed: true, coins: 9 } } }), 9);` inside a new test.
- [ ] **Step 4: `db.js` `subscribe`**: `st.adv = {}` in the initial state; a `db.collection('adv')` snapshot like `maze`; `st.loaded = seen.size === 9`.
- [ ] **Step 5: `db.js` actions** (imports: `hasTicket, statusOf, rollAdventure, nest, advShards, ADV` from `./adventure.js`; `MONSTERS`, `EGGS_FROM` from `./catalog.js`; `rollFood` from `./pet.js`). Next to `rewardsFrom`: `export const eggsFrom = MODE === 'dev' ? '0000-00-00' : EGGS_FROM;`. Add:

```js
    // Send the equipped pet on today's adventure. Rolled now and saved before anything shows (no rerolls).
    async sendAdventure(pet) {
      const s = ready(), day = localDay();
      if (!hasTicket(s.days, s.adv, day)) throw new Error(tl('오늘은 모험을 보낼 수 없어요'));
      const now = Date.now(), doc = { pet: pet.id, shiny: !!pet.shiny, ...rollAdventure(s.adv, rnd(6)), departAt: now,
        returnAt: now + (MODE === 'dev' ? ADV.quickMs : ADV.returnMs), claimed: false };
      await db.doc(`adv/${day}`).set(doc);
      return doc;
    },
    // Collect a returned adventure: coins and shards count from the claimed doc; a snack goes on today's tray.
    async claimAdventure(day) {
      const s = ready(), a = s.adv[day];
      if (statusOf(a, Date.now()) !== 'back') return;
      if (a.food) await petWrite(async () => { const [ref, play] = await today(); await ref.set({ ...play, food: [...play.food, ...rollFood(rnd(1))] }); });
      await db.doc(`adv/${day}`).set({ ...a, claimed: true });
    },
```

  In `openBox` replace the `boxes(...)` check with:

```js
      const clears = Object.keys(s.maze).length + advShards(s.adv);
      const ok = box.startsWith('e:')
        ? nest({ days: s.days, adv: s.adv, pulls: s.pulls, from: eggsFrom }).some((e) => e.ready && 'e:' + e.key === box)
        : boxes({ days: s.days, cdays, pulls: s.pulls, from: rewardsFrom, pets: s.pets, clears }).includes(box);
      if (!ok) throw new Error(tl('열 수 있는 상자가 아니에요'));
```

  and the roll pool `box.startsWith('e:') ? MONSTERS : box.startsWith('c:') ? COUPLE_POOL : POOL`.
- [ ] **Step 6: Seed `adv`** in `db.js`: `SEEDS.adv = [[-8, 9]]` (9 photo days through today: a ticket today, a streak egg); after the photo loop:

```js
  if (kind === 'adv') {
    const t = Date.now(), base = { pet: 'snail-green', shiny: false, first: false, food: true, shard: true };
    await db.doc(`adv/${addDays(today, -3)}`).set({ ...base, place: 'forest', story: 'forest-1', departAt: t - 4e8, returnAt: t - 4e8, coins: 9, egg: true, claimed: true });
    await db.doc(`adv/${addDays(today, -1)}`).set({ ...base, place: 'beach', story: 'beach-0', first: true, departAt: t - 9e6, returnAt: t - 1e3, coins: 18, egg: true, claimed: false });
  }
```

  (Today's ticket stays free; the −3 egg is ready, the streak egg at −2 is 2/3, yesterday's return card waits.)
- [ ] **Step 7: `app.js`**: `const clears = Object.keys(state.maze).length + advShards(state.adv);` (line 128) and `balance({ …, adv: state.adv }, state.shop)` (line 165); add `adv: {}` to the initial `state`.
- [ ] **Step 8:** `npm test` → `# fail 0`; `?dev&seed=adv` loads with no console errors. **Commit** `feat(adventure): records, coins, send/claim, egg hatching, dev seed`.

---

### Task 6: Pixel renderer (`ui/pix.js`)

**Files:** Create `ui/pix.js`; modify `index.html` (CSS).

- [ ] **Step 1:**

```js
// Pixel art renderer (spec: docs/superpowers/specs/2026-09-29-pixel-art-overhaul-design.md). An art is
// {name, rows: [strings], pal: {char: color}} with '.' clear; each is painted once to a canvas and cached as a PNG data
// URL, then shown as one <img> scaled with crisp pixels (one element per sprite, not one SVG rect per pixel).
import { html } from './h.js';

const cache = new Map();
export function pixUrl(art) {
  let url = cache.get(art.name);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = art.rows[0].length; c.height = art.rows.length;
    const ctx = c.getContext('2d');
    art.rows.forEach((row, y) => [...row].forEach((k, x) => { const f = art.pal[k]; if (f) { ctx.fillStyle = f; ctx.fillRect(x, y, 1, 1); } }));
    cache.set(art.name, (url = c.toDataURL()));
  }
  return url;
}
// A recolored copy with its own cache name.
export const recolor = (art, name, pal) => ({ name, rows: art.rows, pal: { ...art.pal, ...pal } });
// px: screen pixels per art pixel; cls 'fill' stretches to the box width (height follows).
export const Pix = ({ art, px = 4, cls = '', alt = '' }) => html`<img class=${'pix ' + cls} src=${pixUrl(art)} alt=${alt}
  width=${art.rows[0].length * px} height=${art.rows.length * px} draggable="false" />`;
```

- [ ] **Step 2: CSS** in `index.html`: `.pix { image-rendering: pixelated; display: block; } .pix.fill { width: 100%; height: auto; }`.
- [ ] **Step 3: Commit** `feat(art): pix renderer`.

---

### Task 7: Art sample — GATE

**Files:** Create `ui/art/adventure.js`, `art.test.mjs`.

- [ ] **Step 1: Test** `art.test.mjs` (data only, runs in Node):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ART from './ui/art/adventure.js';

const arts = Object.values(ART).flatMap((v) => (v.rows ? [v] : Array.isArray(v) ? v : Object.values(v)));
test('every art: equal rows, every char in its palette or "."', () => {
  for (const a of arts) {
    assert.ok(a.name && a.rows.length, a.name);
    for (const r of a.rows) {
      assert.equal(r.length, a.rows[0].length, a.name);
      for (const ch of r) assert.ok(ch === '.' || ch in a.pal, `${a.name}: ${ch}`);
    }
  }
});
test('sizes', () => {
  for (const p of Object.values(ART.PLACE_ART)) assert.deepEqual([p.rows[0].length, p.rows.length], [64, 32], p.name);
  assert.deepEqual([ART.EGG.rows[0].length, ART.EGG.rows.length], [16, 20]);
  for (const c of ART.EGG_CRACKS) assert.deepEqual([c.rows[0].length, c.rows.length], [16, 20], c.name);
});
```

- [ ] **Step 2: Draw** `PLACE_ART.forest` and `PLACE_ART.beach` (64×32: sky band, far layer, ground, a few distinct objects — trees and mushrooms; sea, sand, shells, a crab), `EGG` (16×20, outlined oval, two-tone with spots, a highlight) and `EGG_CRACKS` (3 overlays of growing cracks), in the monsters' palette mood (dark outline `#2b1d14`, warm highlights). Only these for now.
- [ ] **Step 3:** `npm test` → `# fail 0`. Make a sample page in the scratchpad (served on :8767) that imports `ui/pix.js` and the art from :8766 and shows: both scenes at 5×, the egg at 6× with each crack stage, next to an existing 16×16 monster at 6× for scale. Screenshot at 360 px and at 720 px wide.
- [ ] **Step 4: Show 도균님 the screenshots and wait.** Apply feedback, re-show if asked. Only an OK moves on.
- [ ] **Step 5: Commit** `art(adventure): forest, beach, egg sample`.

---

### Task 8: The rest of the art

- [ ] Draw `PLACE_ART` mountain, cave, flowers, snow, desert, sky in the approved style; `EGG_COLORS` (4 palettes → `recolor(EGG, 'egg-<n>', …)` chosen by a hash of the egg key); `SIGNPOST` and `BOOK` (16×16). `npm test` → `# fail 0`. Screenshot all eight scenes in one sheet; fix anything muddy. **Commit** `art(adventure): all places, egg colors, signpost, book`.

---

### Task 9: Screens (`ui/adventure.js`, bag nest, egg reveal)

**Files:** Create `ui/adventure.js`; modify `ui/bag.js` (`Bag` props `nest`, `onHatch`; `BoxReveal` egg art), `ui/sprites.js` untouched.

- [ ] **Step 1: `ui/adventure.js`**:

```js
// Adventure screens (spec: docs/superpowers/specs/2026-10-02-retention-adventures-design.md): the return card and
// the journal. Rules in adventure.js, stories in stories.js, art in ui/art/adventure.js.
import { html } from './h.js';
import { Win } from './windows.js';
import { Monster } from './monsters.js';
import { Pix } from './pix.js';
import { PLACE_ART } from './art/adventure.js';
import { PLACES, STORIES, fill } from '../stories.js';
import { ITEMS } from '../catalog.js';
import { tl, LANG } from '../i18n.js';

const story = (id) => STORIES.find((s) => s.id === id);
export const placeName = (id) => PLACES.find((p) => p.id === id)?.name[LANG] ?? id;
export const storyText = (a, habit) => fill(story(a.story)?.text[LANG] ?? '', { pet: ITEMS.get(a.pet)?.name ?? '', habit });
export const storyLine = (a, pet) => fill(story(a.story)?.line[LANG] ?? '', { pet });
// h:mm, or m:ss under an hour.
export const clockText = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
const Gifts = ({ a }) => html`<p class="adv-gifts">🪙 +${a.coins}${a.food ? tl(' · 🍎 먹이 +1') : ''}${a.shard ? tl(' · 🧩 조각 +1') : ''}${a.egg ? tl(' · 🥚 알!') : ''}</p>`;

// A returned adventure. onClaim() collects the gifts; onJournal opens the journal.
export function ReturnCard({ day, a, habit, onClaim, onJournal }) {
  return html`<${Win} title=${tl`🗺️ ${ITEMS.get(a.pet)?.name ?? ''} 귀환!`} cls="adv-win">
    <div class="body pad center">
      <div class="adv-scene"><${Pix} art=${PLACE_ART[a.place]} cls="fill" alt=${placeName(a.place)} />
        <span class="adv-pet"><${Monster} id=${a.pet} shiny=${a.shiny} px=${4} face="excited" /></span></div>
      <p class="muted small">${day} · ${placeName(a.place)}${a.first ? tl(' · ✨ 새 장소 발견!') : ''}</p>
      <p class="adv-story">${storyText(a, habit)}</p>
      <${Gifts} a=${a} />
    </div>
    <div class="foot"><button class="btn blue" onClick=${onJournal}>${tl('📖 일지')}</button>
      <button class="btn green" onClick=${onClaim}>${tl('일지에 넣기')}</button></div>
  </${Win}>`;
}

// Every claimed adventure, newest first, under the place collection.
export function Journal({ adv, habit, onClose }) {
  const days = Object.keys(adv).filter((d) => adv[d].claimed).sort().reverse();
  const seen = new Set(days.map((d) => adv[d].place));
  return html`<${Win} title=${tl('📖 모험 일지')} onClose=${onClose} cls="adv-win">
    <div class="body pad">
      <p class="small">${tl`가본 곳 ${seen.size}/${PLACES.length}`}</p>
      <div class="adv-places">${PLACES.map((p) => html`<figure key=${p.id} class=${seen.has(p.id) ? '' : 'unseen'}>
        <${Pix} art=${PLACE_ART[p.id]} cls="fill" alt="" /><figcaption>${seen.has(p.id) ? p.name[LANG] : '?'}</figcaption></figure>`)}</div>
      ${days.length ? days.map((d) => html`<section key=${d} class="adv-entry">
        <${Pix} art=${PLACE_ART[adv[d].place]} px=${1} alt="" />
        <div><b>${d} · ${placeName(adv[d].place)}</b><p>${storyText(adv[d], habit)}</p><${Gifts} a=${adv[d]} /></div></section>`)
        : html`<p class="muted">${tl('아직 다녀온 모험이 없어요')}</p>`}
    </div>
  </${Win}>`;
}
```

- [ ] **Step 2: Egg reveal.** In `ui/bag.js`: import `Pix` and `EGG, EGG_CRACKS, eggArt` (export `eggArt(key)` from `ui/art/adventure.js` returning the color variant). In `BoxReveal`, where the `<${Chest} …/>` renders, render for `box.startsWith('e:')` instead:

```js
html`<span class="egg-stack"><${Pix} art=${eggArt(box)} px=${6} />${EGG_CRACKS.slice(0, Math.min(3, Math.floor(taps / 2))).map((c) =>
  html`<${Pix} key=${c.name} art=${c} px=${6} cls="egg-crack" />`)}</span>`
```

  and `boxName`: `b.startsWith('e:') ? tl('🥚 알') : …`; the subtitle line for eggs: `tl('부화 보상')`.
- [ ] **Step 3: Nest row** in the box tab (`Bag` gets `nest` = `nest()` output and `onHatch(key)`), above the shard bar:

```js
${nest.length > 0 && html`<div class="nest"><b>${tl('🥚 둥지')}</b>${nest.map((e) => html`<span key=${e.key} class="egg">
  <${Pix} art=${eggArt('e:' + e.key)} px=${2} />${e.ready
    ? html`<button class="btn green sm" onClick=${() => onHatch('e:' + e.key)}>${tl('부화!')}</button>`
    : html`<small>${'●'.repeat(e.n)}${'○'.repeat(3 - e.n)}</small>`}</span>`)}</div>`}
```

- [ ] **Step 4: CSS** (`index.html`): `.adv-scene { position: relative; } .adv-pet { position: absolute; left: 50%; bottom: 8%; transform: translateX(-50%); } .adv-story { font-size: 14px; line-height: 1.6; } .adv-places { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .adv-places .unseen img { filter: brightness(.15); } .adv-entry { display: flex; gap: 8px; margin-top: 10px; } .egg-stack { position: relative; display: inline-block; } .egg-crack { position: absolute; left: 0; top: 0; } .nest { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }`.
- [ ] **Step 5:** `npm test` (i18n check lists the new strings → add English, see Task 12 list); **Commit** `feat(adventure): return card, journal, egg reveal, nest`.

---

### Task 10: Tower screen, playroom, app wiring

**Files:** Modify `ui/scene.js`, `ui/playroom.js`, `app.js`, `index.html` (CSS).

- [ ] **Step 1: `Scene`** gets `greet` (`{text, face}` | null) and `away` (time-left text | null). The first mob: when `away`, render `<span class="mob signpost"><${Pix} art=${SIGNPOST} px=${px} /><small>⏳ ${away}</small></span>` instead of the pet; otherwise pass `face=${greet?.face}` to its `Monster` and add `${greet?.text && html`<span class="bubble">${greet.text}</span>`}` inside the pet button. CSS: `.bubble { position: absolute; bottom: 100%; left: 0; white-space: nowrap; background: #fff; color: #2b1d14; border: 2px solid #2b1d14; border-radius: 8px; padding: 2px 6px; font-size: 11px; } .mob.pet { position: relative; } .mob.departing { animation: depart .9s ease-in forwards; } @keyframes depart { to { transform: translateX(160px); opacity: 0; } }`.
- [ ] **Step 2: `Playroom`** gets `away` (time-left text | null) and `onJournal`. Toolbar: add `<button class="btn sm blue" onClick=${onJournal} aria-label=${tl('모험 일지')}>📖</button>`. When `away`: the battle and maze buttons are `disabled`, and the field shows, instead of the pet, `<div class="pr-away"><${Pix} art=${SIGNPOST} px=${5} /><p>${tl`${petName}은(는) 모험 중이에요 · ${away} 남음`}</p><p class="muted small">${tl('다른 펫과 놀려면 가방 → 꾸미기에서 바꿔요')}</p></div>` (keep the room layer and the toolbar).
- [ ] **Step 3: `app.js`**:
  - imports: `hasTicket, statusOf, unclaimed, greeting, nest, advShards` (`./adventure.js`); `ReturnCard, Journal, clockText, storyLine` (`./ui/adventure.js`); `localHour` (`./pet.js`); `eggsFrom` (`./db.js`).
  - clock: `const [clock, setClock] = useState(Date.now());` — the existing tick also calls `setClock(Date.now())`; plus an effect that, while today's adventure is away, sets a timeout to `returnAt - Date.now() + 50` → `setClock(Date.now())`.
  - admin sandbox: `const [sandAdv, setSandAdv] = useState({}); const adv = admin ? { ...state.adv, ...sandAdv } : state.adv;` Send in admin mode builds the doc with `rollAdventure(adv, six Math.random())`, `returnAt: Date.now() + ADV.quickMs`, into `sandAdv`; claim in admin mode sets `claimed: true` in `sandAdv`. Not saved.
  - derived: `const ticket = view === 'me' && hasTicket(state.days, adv, today); const mine = adv[today]; const away = statusOf(mine, clock) === 'away' && mine.pet === myPet.id ? clockText(mine.returnAt - clock) : null; const back = unclaimed(adv, clock); const eggs = nest({ days: state.days, adv, pulls: state.pulls, from: eggsFrom });`
  - greeting (my tab only): `const g = view === 'me' ? greeting({ days: state.days, adv, today, now: clock, hour: localHour() }) : null;` text: `{ back: tl('다녀왔어! 선물 있어!'), ready: tl('모험 갈 준비 됐어!'), miss: tl('보고 싶었어…'), evening: tl('벌써 저녁이야… 인증하자!'), today: tl('오늘도 같이 쌓자!') }[g.key]`, `streak` → `tl`${g.n}일 연속! 최고야``, `away` → no bubble (the signpost shows it). Pass `greet` and `away` to `Scene`.
  - ticket banner above the bottom bar when `ticket && !away`: `🗺️ ${tl('오늘의 모험 준비 완료!')} [${tl('보내기')}]`; the button adds `departing` to the pet for 0.9 s (state), then `actions.sendAdventure(myPet)` (or the admin sandbox) → `sfx('open')`, `buzz('tap')`, toast `tl`${petName} 출발! 3시간 뒤에 돌아와요``.
  - return card: an effect opens `modal = { adv: back[0] }` when `back.length && !modal && !anim && !fall`; `ReturnCard` `onClaim` → `actions.claimAdventure(day)` (or sandbox) → `sfx('rare')`, `buzz('epic')`, `cloudApi?.sync()`, close; `onJournal` → `setModal('journal')` (claim first).
  - journal: `modal === 'journal'` renders `Journal` with `adv`, `habit=${state.habit.title}`; the playroom's `onJournal` opens it.
  - bag: pass `nest=${eggs}` and `onHatch=${(k) => { setRevealBox(k); setModal('reveal'); }}`; `BoxReveal`'s `left` count stays the boxes count.
  - couple line (couple tab): the partner's newest adventure with `return_at <= now` from `cloud.partner.adventures` (Task 11) → `<p class="couple-news">💞 ${storyLine(row, tl`${partnerName}의 ${ITEMS.get(row.pet)?.name ?? ''}`)}</p>` above the bottom bar.
- [ ] **Step 4:** `npm test` → `# fail 0`. Headless `?dev&seed=adv`: the return card opens; claim → journal shows two entries and 2/8; the bag nest shows a ready egg and 2/3; hatch → the egg reveal works; the ticket banner sends; the signpost counts down and the card returns after 10 s. **Commit** `feat(adventure): tower greeting, ticket, return card, journal, playroom away`.

---

### Task 11: Cloud sync and server SQL (file only)

**Files:** Modify `cloud.js`, `supabase/schema.sql`.

- [ ] **Step 1: `cloud.js`** — import `mergeAdventures` (`./adventure.js`) and `addDays, localDay` (`./logic.js`). After the maze clears block:

```js
    // Adventures (journal, gifts), both ways: a new phone gets its journal back.
    const advRows = must(await sb.from('adventures')
      .select('day, pet, shiny, place, story, first, depart_at, return_at, coins, food, shard, egg, claimed').eq('user_id', uid));
    const advs = mergeAdventures(await localDocs('adv'), advRows);
    for (const [day, doc] of advs.restore) await db.doc(`adv/${day}`).set(doc);
    if (advs.push.length) must(await sb.from('adventures').upsert(advs.push.map((r) => ({ user_id: uid, ...r }))));
```

  Partner part: `const partnerAdv = partner ? must(await sb.from('adventures').select('day, pet, place, story, return_at').eq('user_id', partner.id).gte('day', addDays(localDay(), -1))) : [];` and `adventures: partnerAdv` in the saved `partner` object (header comment updated). Reset (`wipe`): `must(await sb.from('adventures').delete().eq('user_id', uid));` next to `maze_clears`.
- [ ] **Step 2: `supabase/schema.sql`** — append (applied in Task 14):

```sql
-- Adventures (2026-10-02): my journal on the server for a new phone, and my partner's news line.
create table public.adventures (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  pet text not null check (pet ~ '^[a-z]+-[a-z]+$'),
  shiny boolean not null default false,
  place text not null check (place ~ '^[a-z]{1,20}$'),
  story text not null check (story ~ '^[a-z]{1,20}-\d{1,2}$'),
  first boolean not null default false,
  depart_at timestamptz not null,
  return_at timestamptz not null,
  coins smallint not null check (coins between 0 and 100),
  food boolean not null default false,
  shard boolean not null default false,
  egg boolean not null default false,
  claimed boolean not null default false,
  primary key (user_id, day)
);
alter table public.adventures enable row level security;
create policy "adventures read own or partner" on public.adventures for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.partner_id()));
create policy "adventures insert own" on public.adventures for insert to authenticated with check (user_id = (select auth.uid()));
create policy "adventures update own" on public.adventures for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "adventures delete own" on public.adventures for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.adventures from anon;

-- Egg hatchings are pulls too: 'e:a:<day>' (adventure egg), 'e:s:<day>' (streak egg).
alter table public.pulls drop constraint pulls_box_check;
alter table public.pulls add constraint pulls_box_check
  check (box ~ '^([dcw]:\d{4}-\d{2}-\d{2}|b:\d{1,5}|p:[a-z]+-[a-z]+:\d{1,2}|e:[as]:\d{4}-\d{2}-\d{2})$');
```

- [ ] **Step 3:** `node --check cloud.js`; `npm test` → `# fail 0`. **Commit** `feat(cloud): adventures sync, partner news; server SQL (not applied)`.

---

### Task 12: Strings, service worker

- [ ] English for every new `tl` key (run `node <scratchpad>/missing.mjs <files>`), in the app's tone: e.g. `'모험 갈 준비 됐어!': 'Ready for an adventure!'`, `'다녀왔어! 선물 있어!': 'I'm back! I brought gifts!'`, `'보고 싶었어…': 'I missed you…'`, `'벌써 저녁이야… 인증하자!': 'It's evening already… let's check in!'`, `'오늘도 같이 쌓자!': 'Let's stack together today!'`, `'{0}일 연속! 최고야': (n) => `${n} days in a row! You're the best``, `'오늘의 모험 준비 완료!': 'Today's adventure is ready!'`, `'보내기': 'Send'`, `'일지에 넣기': 'Add to journal'`, `'📖 모험 일지': '📖 Adventure journal'`, `'가본 곳 {0}/{1}': 'Places {0}/{1}'`, `'🥚 둥지': '🥚 Nest'`, `'부화!': 'Hatch!'`. `npm test` → `# fail 0`.
- [ ] `sw.js`: SHELL + `'adventure.js', 'stories.js', 'ui/pix.js', 'ui/art/adventure.js', 'ui/adventure.js'`; `CACHE` → `'habit-tower-v17'`. **Commit** `feat(adventure): English strings; sw v17`.

---

### Task 13: Full check at phone width

- [ ] Headless, `?dev&seed=adv&lang=ko` and `&lang=en`, 360×740: tower greeting bubble; ticket banner → send → departing pet → signpost countdown → return card after 10 s (story fills `{pet}`/`{habit}`, gifts, new-place badge) → claim → coins up in the shop; journal (8 place tiles, silhouettes, entries); bag nest (ready egg, progress dots) → hatch reveal with egg cracks; playroom away panel with disabled battle/maze and the 📖 button; Korean screens otherwise unchanged; no console errors. Fix what shows up (wording first, CSS second); commit fixes.

---

### Task 14: Deploy

- [ ] Ask 도균님 (server table + push = live). On yes: `apply_migration` `adventures` with the Task 11 SQL; RLS check in a rolled-back block — two test users coupled (`couples` row + `profiles.couple_id`), one stranger: owner insert works, partner select sees the row, the stranger sees nothing, the partner's update is refused:

```sql
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c3'; k uuid := gen_random_uuid(); seen_b int; seen_c int;
begin
  insert into auth.users (id, email) values (a, 'a1@test.invalid'), (b, 'b2@test.invalid'), (c, 'c3@test.invalid');
  insert into public.couples (id) values (k);
  insert into public.profiles (id, couple_id) values (a, k), (b, k), (c, null);
  insert into public.adventures (user_id, day, pet, place, story, depart_at, return_at, coins)
    values (a, '2026-10-02', 'snail-green', 'beach', 'beach-1', now(), now(), 9);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen_b from public.adventures;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into seen_c from public.adventures;
  raise exception 'partner=% stranger=%', seen_b, seen_c;
end $$;
```

  Expected `partner=1 stranger=0` (if `couples` needs more columns, add them from `schema.sql`). Then merge `feat/adventures` into `main` (fast-forward), `npm test`, `git push`, `gh run list --limit 1` → success, `curl` the new files → 200, `sw.js` → v17.

---

### Task 15: Finish

- [ ] Update memory (`project_habit_tower.md`): shipped, the numbers in `ADV`, `EGGS_FROM`, what the phone check should look at (the 3 h return, the couple line once both phones synced), next = part 2 (quests, check-in rewards, gentler failure).

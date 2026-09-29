# Pet battles and fog maze — Implementation Plan

> Executed inline (superpowers:executing-plans), test first per task. Spec:
> `docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md`.

**Goal:** Turn-based pet battles (CPU and partner) with elements and two skills per monster, and a daily fog maze.

**Architecture:** Pure rule modules (`battle.js`, `maze.js`) tested with `node --test`; data in `catalog.js`;
screens in `ui/battle.js` and `ui/maze.js` opened from the playroom; storage through `db.js` actions, cloud in `cloud.js`.

**Tech Stack:** Preact + htm (CDN, no build), IndexedDB `db` API, Supabase (RLS), `node:test`, headless Chrome over CDP.

---

## Task 1 — Battle data and engine

Files: `catalog.js` (ELEMENTS, BEATS, ELEMENT, SPECIES), `battle.js`, `battle.test.mjs`.

Interfaces:
- `ELEMENTS[el] = {icon, name, skill}`; `BEATS[el] = [el, …]`; `ELEMENT[monsterId] = el`;
  `SPECIES[base] = {strong: 'hp'|'atk'|'def'|'spd'|null, sig: {name, power, acc, hits, drain, heal, once, stun, first, self, foe}}`.
- `mult(atkEl, defEl)` → 1.5 | 0.7 | 1 (null attack element → 1).
- `statsOf(id, level)` → `{hp, atk, def, spd}`; `skillsOf(id)` → `[elementSkill, signature]`.
- `fighter(id, level, shiny)` → battle side; `start(me, foe)` → state `{me, foe, over: null}`.
- `turn(state, myPick, foePick, rng)` → `{state, events}`; events: `use, miss, hit {n, crit, mult}, heal {n}, stat {side, stat, by}, stun, stunned, fail`.
- `aiPick(state, rng, side = 'foe')` → 0 | 1.

Tests: every monster has an element and two skills with names; chart both ways and dark⇄light; stats scale with rarity
and level and the strong stat; first-move skill beats speed; speed order otherwise; stun skips the next turn; stages
clamp ±2; phoenix heal works once; drain heals; twice hits twice; AI heals under 40%; a seeded CPU-vs-CPU battle
always ends within 30 turns.

## Task 2 — CPU battle screen

Files: `ui/battle.js`, `ui/playroom.js` (⚔️ button), `index.html` (CSS), `app.js` (modal wiring).

- Picker: CPU Easy / Normal / Hard (level −2 / 0 / +2, clamped), partner row when coupled.
- Screen: two pets, HP bars, name/Lv/element, two skill buttons, one log line; events replayed ~600 ms apart with
  lunge / shake / damage number / element burst; faces from `FACES`; end card.

Check: CDP script plays a CPU battle to the end card.

## Task 3 — ⚔️ wins, 3 a day

Files: `pet.js` (`battleCount(play)` rule), `db.js` (`recordBattle(id, won)`), `ui/playroom.js` + `ui/bag.js` (⚔️ n),
`cloud.js` + server (`pets.wins`, mergePets max).

Tests: 4th battle of a day records nothing; wins merge by max.

## Task 4 — Partner battles

Server: `pets` partner select policy; `battles` table + RLS. `cloud.js`: partner pet level, insert/read battles,
record per couple. UI: partner row in the picker, record on the end card, "도전받음" line with a local bookmark.

Check: SQL (partner reads, stranger doesn't; insert only as challenger vs partner).

## Task 5 — Fog maze

Files: `maze.js`, `maze.test.mjs`, `ui/maze.js`, `logic.js` (shards/boxes count clears, `DOC_PATH` maze/),
`db.js` (`clearMaze(ms)`), `cloud.js` + server (`maze_clears`).

Tests: same day → same maze; perfect maze (all 225 rooms reachable, 224 open passages); walls block; fog radius;
shards include clears; backup accepts `maze/<day>`.

Check: CDP solves the maze with a scripted BFS walk; the shard bar moves once.

## Finish

`sw.js` SHELL + CACHE bump, full `node --test`, cleanup of debug hooks, memory update, ask 도균님 before `git push`.

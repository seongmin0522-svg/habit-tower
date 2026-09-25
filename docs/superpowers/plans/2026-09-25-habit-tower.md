# Habit Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-habit tracker Artifact: daily photo proof stacks one brick (carried in by character + monster buddy) on a 30-floor tower; a missed day plays a collapse animation; all photos kept in an album.

**Architecture:** Same shape as `~/quest-diary`: pure `logic.js` (tested) → `db.js` (all writes, db + assets) → `ui/*.js` Preact+htm → `app.js`; CSS in `index.html`. Copied as-is: `ui/h.js`, `ui/sprites.js`, `ui/monsters.js`, `devdb.js`, `fonts/Galmuri11.woff2`.

**Tech Stack:** Preact+htm from jsDelivr, Artifact `db` + `assets`, CSS keyframes, `node --test`.

Spec: `docs/superpowers/specs/2026-09-25-habit-tower-design.md`

---

### Task 1: logic.js + tests
- [ ] Tests first (`logic.test.mjs`): `runs`, `towers` (none / live through today / live through yesterday / broken → fell / 30 flag / 31 → built+1 / 60+2), `pendingFall` (unseen / seen / current exists / last past is built), `buddyFor` (0,1,4,5,29,30).
- [ ] Implement: `todayKST`, `addDays`, `daysBetween`, `TOWER_HEIGHT`, `MONSTERS`, `runs`, `towers`, `pendingFall`, `buddyFor`.
- [ ] `npm test` green. Commit.

### Task 2: db.js + dev assets
- [ ] `connect`, `connectAssets` (dev: in-memory Map of object URLs), `subscribe`, `shrink(file)` (canvas → JPEG blob), actions `setHabit`, `certify`, `ackFall`. Validate title (trim, ≤40 chars) and character id at the write boundary.
- [ ] `?dev&seed=fall` / `?dev&seed=30` seed fake days for browser checks (dev only).
- [ ] Commit.

### Task 3: UI + CSS
- [ ] `index.html` (tokens from quest-diary, sky/grass, window styles), `app.js`, `ui/setup.js` (habit form), `ui/tower.js` (tower, actors, stack animation phases, collapse sequence), `ui/album.js`, `ui/photo.js` (modal).
- [ ] Animations: `carry` (walk in with brick), `toss` (jump), `fly` (brick arc to top), `land` + dust, `+1층`; collapse `shake` → per-block `fall` with CSS vars (dx, rot, delay) → rubble, `dizzy` stars; fireworks at 30. Reduced-motion rule.
- [ ] Browser `?dev`: setup → certify (local image) → stack animation → retake → album → `seed=fall` collapse → ack → `seed=30` flag. Narrow width (390px). Commit.

### Task 4: Publish
- [ ] Load `artifact-design` skill; publish with `capabilities: { db: {}, assets: {} }`, files list = every JS/font file. One `ArtifactData list` of `days` and `habit` after first publish.

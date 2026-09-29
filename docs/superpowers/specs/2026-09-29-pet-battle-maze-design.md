# Pet battles and the fog maze — design

Date: 2026-09-29. Two minigames on top of the pet playroom
(`docs/superpowers/specs/2026-09-29-pet-playroom-design.md`), chosen by 도균님:

1. Turn-based pet battles against a CPU pet or my partner's pet, with elements and two skills per monster.
2. A daily fog maze, about 3–5 minutes, that pays one box shard.

Both open from the playroom's top bar: **[⚔️ 대결]** and **[🧩 미로]**. The food-kinds change (`d4883fe`) ships
together with these.

---

## Part 1. Battles

### Elements

Seven elements. Attacking an element the attacker beats: ×1.5. Attacking an element that beats the attacker: ×0.7.
Otherwise ×1. Signature skills are neutral (×1 always).

| Element | Beats |
|---|---|
| 🔥 fire | 🌿 grass, ❄️ ice |
| 💧 water | 🔥 fire, 🪨 earth |
| 🌿 grass | 💧 water, 🪨 earth |
| 🪨 earth | 🔥 fire, ❄️ ice |
| ❄️ ice | 🌿 grass, 💧 water |
| 🌙 dark | ✨ light |
| ✨ light | 🌙 dark |

Element per monster, mostly by color (`catalog.js` `ELEMENT`, keyed by monster id):

| Species | Element by variant |
|---|---|
| snail | green 🌿, blue 💧, red 🔥, brown 🪨 |
| mushroom | orange 🔥, green 🌿, blue 💧, pink ✨ |
| slime | green 🌿, blue 💧, pink ✨, purple 🌙 |
| chick | yellow ✨, white ❄️, brown 🪨, mint 🌿 |
| bunny | white ❄️, pink ✨, brown 🪨, gray 🌙 |
| pig | pink ✨, tan 🪨, gray 🪨, lilac 🌙 |
| frog | green 🌿, blue 💧, red 🔥, yellow ✨ |
| stump | oak 🪨, birch ✨, dark 🌙, moss 🌿 |
| bee | yellow ✨, orange 🔥, pink 🌿, blue 💧 |
| cat | orange 🔥, black 🌙, white ❄️, gray 🪨 |
| octopus | red 🔥, pink ✨, purple 🌙, blue 💧 |
| crab | red 🔥, orange 🪨, blue 💧, green 🌿 |
| turtle | green 🌿, sea 💧 |
| bat | purple 🌙, black 🌙, red 🔥, blue 🪨 |
| ghost | white 🌙, blue ❄️, green 🔥, pink ✨ |
| penguin | black 💧, blue ❄️, brown 🪨, pink ✨ |
| fox | orange 🔥, white ❄️, black 🌙, silver ✨ |
| cactus | green 🌿, flower ✨, blue 💧, desert 🪨 |
| pumpkin | orange 🔥, green 🌿, white 🌙, purple 🌙 |
| owl | brown 🪨, snowy ❄️, gray 🌙 |
| snowman | plain ❄️, red 🔥, blue 💧 |
| skeleton | bone 🌙, dark 🌙, gold ✨ |
| golem | stone 🪨, ice ❄️, lava 🔥 |
| bear | brown 🪨, panda 🌿, polar ❄️ |
| wolf | gray 🪨, black 🌙, white ❄️ |
| knight | iron 🪨, bronze 🔥, dark 🌙 |
| dragon | red 🔥 |
| phoenix | fire 🔥 |
| unicorn | white ✨ |
| kingslime | gold ✨ |
| kraken | deep 💧 |

A test checks every monster in `MONSTERS` has an element.

### Stats

Level L = the pet's playroom level (`levelOf(hearts)`, 1–10). Rarity R: common 1.0, rare 1.15, epic 1.3, legend 1.5.
Growth g = 1 + 0.08 × (L − 1). Each species has one strong stat (×1.25), or none (balanced, all ×1.08):

- `def`: snail, stump, crab, turtle, cactus, golem, knight
- `atk`: pig, pumpkin, skeleton, bear, wolf, dragon
- `spd`: chick, bunny, bee, cat, bat, penguin, fox
- `hp`: mushroom, slime, octopus, snowman, kingslime, kraken
- balanced: frog, ghost, owl, phoenix, unicorn

HP = round(60·R·g·k), ATK = round(20·R·g·k), DEF = round(15·R·g·k), SPD = round(15·R·g·k), k = that stat's factor.

### Skills

Every monster has two:

1. **Element skill** (power 50, accuracy 95%) of its element: 🔥 불꽃 발사, 💧 물대포, 🌿 잎날 가르기, 🪨 돌 던지기,
   ❄️ 얼음 화살, 🌙 그림자 할퀴기, ✨ 빛의 화살.
2. **Signature skill** of its species, neutral, with one effect:

| Species | Skill | Power | Acc | Effect |
|---|---|---|---|---|
| snail | 껍질 숨기 | — | — | my DEF +1 stage |
| mushroom | 포자 뿌리기 | — | 90 | enemy ATK −1 stage |
| slime | 말랑 흡수 | 40 | 95 | heal half the damage dealt |
| chick | 삐약 응원 | — | — | my ATK +1 stage |
| bunny | 깡충 발차기 | 40 | 95 | moves first |
| pig | 몸통 박치기 | 70 | 85 | — |
| frog | 혀 채찍 | 45 | 100 | — |
| stump | 뿌리 내리기 | — | — | heal 35% max HP |
| bee | 윙윙 돌진 | 40 | 95 | moves first |
| cat | 냥냥 펀치 | 25×2 | 95 | hits twice |
| octopus | 먹물 뿌리기 | — | 90 | enemy ATK −1 stage |
| crab | 집게 가위 | 30×2 | 90 | hits twice |
| turtle | 등껍질 방패 | — | — | my DEF +1 stage |
| bat | 흡혈 | 45 | 95 | heal half the damage dealt |
| ghost | 깜짝 놀래키기 | 30 | 95 | 30% stun |
| penguin | 배 미끄럼 | 45 | 95 | moves first |
| fox | 여우 홀리기 | 35 | 95 | 25% stun |
| cactus | 가시 갑옷 | — | — | my DEF +1 stage |
| pumpkin | 호박 폭탄 | 70 | 85 | — |
| owl | 날카로운 눈 | — | — | my ATK +1 stage |
| snowman | 눈덩이 굴리기 | 45 | 90 | 20% stun |
| skeleton | 뼈다귀 던지기 | 30×2 | 90 | hits twice |
| golem | 바위 굳히기 | — | — | my DEF +2 stages |
| bear | 곰 펀치 | 75 | 85 | — |
| wolf | 울부짖기 | — | — | my ATK +1 stage |
| knight | 방패 돌진 | 45 | 95 | my DEF +1 stage |
| dragon | 드래곤 브레스 | 90 | 85 | — |
| phoenix | 불사의 날개 | — | — | heal 50% max HP, once per battle |
| unicorn | 무지개 뿔 | 50 | 95 | heal half the damage dealt |
| kingslime | 왕의 명령 | 20 | 100 | 50% stun |
| kraken | 촉수 조이기 | 50 | 90 | 30% stun |

Stages run −2…+2, each stage ×1.25 (up) or ×0.8 (down). Stunned: skips its next turn (💫). A second use of phoenix's
heal fails ("힘이 남지 않았다").

### A turn

- Both sides pick a skill; the one with a "moves first" skill goes first, else the higher SPD (tie: me).
- Hit check by accuracy. Damage = max(1, round(power × ATK′/DEF′ × 0.25 × element × random 0.85–1.0 × crit)),
  crit 1/16 at ×1.5. ATK′/DEF′ include stages.
- The battle ends at 0 HP. A battle takes about 4–6 turns each.
- Opponent AI (CPU and partner's pet alike): uses a heal skill when its HP < 40% (and the heal can still work);
  otherwise the skill with the higher expected damage (power × accuracy × element), buffs count as 30;
  20% of the time a random skill.
- The engine is pure (`battle.js`): `statsOf(monsterId, level)`, `skillsOf(monsterId)`, `turn(state, myPick, enemyPick, rng)`
  → next state + log events, `aiPick(state, rng)`. The screen replays the events.

### Opponents

- **CPU**: Easy / Normal / Hard = my pet's level −2 / same / +2 (clamped 1–10). The monster is random from all
  `MONSTERS`, never the same id as mine.
- **Partner's pet** (coupled and synced only): their equipped monster (`profiles.look.monster`, shiny flag), level from
  their `pets` row (Lv 1 if none). Controlled by the AI on my phone.

### Screen

- My pet bottom-left (back view: the art faces left, so no flip), the opponent top-right. Each has name, Lv,
  element icon, HP bar.
- Two skill buttons: name, element icon or "무", one-line effect. Disabled while a turn plays.
- One log line: "효과가 굉장했다!", "효과가 별로다…", "급소에 맞았다!", "빗나갔다!", "기절했다 💫".
- Animations: attacker lunges; the target shakes and flashes; a damage number pops; element particle emoji burst.
  Hit → buzz('tap'); crit → buzz('rare').
- Faces (ui/monsters.js FACES): hit → sad or angry, crit taken → surprised, stunned → sleepy with 💫,
  win → excited, loss → sad.
- End card: "승리! ⚔️ +1 (오늘 n/3)" or "패배…", [다시] [닫기]. Against the partner the card also shows the record.

### Wins ⚔️ and limits

- Each pet has a ⚔️ win counter, shown next to 💗 in the playroom top bar and on monster cells in the bag.
- Only the first 3 battles of a day count (win or lose); later battles play without counting.
- Local: `pets/<id>.wins` (only grows, merged by max like hearts), `play/<day>.battles`.

### Server

- `pets` gets `wins int not null default 0`; `mergePets` takes the larger.
- `pets` partner read: `select` policy `user_id = partner_id()`.
- New `battles` table: `id bigserial`, `challenger uuid default auth.uid()`, `defender uuid`, `c_monster`, `d_monster`,
  `winner uuid`, `at timestamptz default now()`. RLS: select when I'm challenger or defender; insert only as challenger
  with `defender = partner_id()`. The partner's battle menu shows the record and "도균이 네 펫에게 도전해서 이겼어요!"
  for battles against them since they last looked (a local bookmark). No push notification.

---

## Part 2. Fog maze

- One maze a day, generated from the KST date (seeded PRNG, recursive backtracker), so both of us get the same maze.
- 15 × 15 rooms. Start bottom-left, exit top-right.
- Fog: rooms within 2 steps (Chebyshev distance, walls ignored) are visible; rooms once seen stay drawn faintly.
- The view follows the pet (about 7 × 7 rooms on screen); a minimap of seen rooms in the corner.
- Controls: ↑↓←→ buttons, one room per tap, holding repeats every 150 ms. Walking into a wall: small bump and buzz.
- Timer from the first move. Reaching the exit: excited face, buzz('epic'), time shown.
- Reward: the first clear of a day gives one box shard. Shards count duplicates plus maze clears:
  `shards = (dups + clears) % 10`, bonus boxes `floor((dups + clears) / 10)`.
- Local: `maze/<day>` = `{ ms, at }` (in the backup: `DOC_PATH` allows it). Cloud: `maze_clears (user_id, day, ms, at)`,
  own rows only, synced both ways like pulls.
- Pure module `maze.js`: `mazeOf(day)` → walls, `step(maze, pos, dir)`, `seen(pos)`.

---

## Files

- `battle.js` + `battle.test.mjs`: engine, stats, AI.
- `maze.js` + `maze.test.mjs`: generator, moves, fog.
- `catalog.js`: `ELEMENT`, `SPECIES` (strong stat, signature skill), `ELEMENTS`.
- `logic.js`: `boxes`/`shards` count maze clears; `DOC_PATH` gains `maze/<day>`.
- `db.js`: `recordBattle`, `clearMaze`; `subscribe` loads `maze`.
- `cloud.js`: `pets.wins`, partner pet read, `battles`, `maze_clears`.
- `ui/battle.js`, `ui/maze.js`: the two screens. `ui/playroom.js`: the two buttons and ⚔️ in the top bar.
- `supabase/schema.sql`, `sw.js` (new files, cache bump).

## Build order

1. Battle data + engine + tests.
2. CPU battle screen.
3. ⚔️ wins and the daily 3.
4. Partner battles (server, record).
5. Maze + shard.

Push once at the end, after 도균님 confirms (with the food-kinds commit).

## Testing

- `battle.test.mjs`: every monster has an element and two skills; element chart both ways; stats by rarity and level;
  damage bounds; first-move and speed order; stun skips a turn; stages clamp at ±2; phoenix heal once; AI heals at
  low HP; a seeded battle always ends.
- `maze.test.mjs`: same day → same maze; every room reachable (a perfect maze); walls block steps; fog radius.
- `logic.test.mjs`: shards and bonus boxes include maze clears; backup accepts `maze/<day>`.
- Browser (headless Chrome over CDP): a CPU battle to the end card; wins counted up to 3; the maze solved by a
  scripted walk; the shard bar moves once.
- Server: SQL checks for the partner read (partner yes, stranger no) and the battles insert rules.

## Out of scope

Real-time battles, push for battle results, maze time comparison with the partner, more than two skills, items.

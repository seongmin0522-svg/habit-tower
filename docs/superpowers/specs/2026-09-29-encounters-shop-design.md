# Battle effects, maze roadmap and encounters, coins and the room shop — design

Date: 2026-09-29. Requests from 도균님, built in this order, pushed once at the end after he confirms.

## A. Battle animations (duels and maze encounters)

- Element skills fly a projectile from the attacker to the target and burst there: 🔥 fireball, 💧 water stream,
  🌿 leaves, 🪨 rock, ❄️ ice shards, 🌙 shadow wisp, ✨ light beam. CSS keyframes on absolutely placed spans.
- Entry: both pets slide in from their sides at the start. Faint: the loser tips over and fades.
- Strong hits (damage ≥ 30% of max HP) and crits shake the whole screen. The HP bar drains smoothly with a
  yellow afterimage bar that catches up.
- Signature effects: heal = green sparkle glow, stat change = ⬆/⬇ arrow over the pet, stun = stars circling the
  head, two hits = two impacts, moves first = wind streak, drain = a red orb flying back to the user.

## B. Maze roadmap

- Three checkpoints on the start→exit path at 25%, 50%, 75% of its length (the path is unique: the maze is perfect),
  so they are always passed in order. Drawn as ①②③ once seen.
- A bar under the top bar: ①─②─③─🚩, each lighting up when passed. A small arrow points at the next target
  (straight-line direction).
- Pure: `maze.js` `checkpoints(maze)`.

## C. Maze encounters and capture

- While walking, a wild monster appears every 8–12 s of walking time (timer paused in battles). White flash, then
  the battle screen in wild mode: no picker, a [🏃 도망] button (+5 s to the time).
- Wild monster: rarity by box tier weights (70/20/8/2), 3% shiny, level = my pet's ±1 (clamped 1–10).
- Win: 10% capture, at most one capture a day. A capture is a pull `w:<day>` (duplicate → shard, like boxes).
  Lose: back to the start room; the map stays revealed.
- Maze battles don't count toward ⚔️ wins. Admin mode: nothing saved.
- Server: `pulls_box_check` gains `w:\d{4}-\d{2}-\d{2}`; `DOC_PATH` too.

## D. Coins and the room shop

### Coins 🪙

Derived, never stored as a balance: income from records minus the prices of what I bought.

| Source | Coins |
|---|---|
| Photo day | 10 |
| Maze clear day | 5 |
| Counted battle win (`pets.wins`) | 3 |
| Duplicate pull | 5 |
| Pet level reached (levels 2–10 of each pet) | 20 |

### Shop

- Furniture (10), each with a pet action when the pet walks to it:

| Id | Item | Price | Pet does |
|---|---|---|---|
| cushion | 🛋️ 쿠션 | 30 | naps (sleepy, 💤) |
| bowl | 🥣 밥그릇 | 20 | eats (yum) |
| rug | 🧶 러그 | 25 | rolls (joy) |
| pond | ⛲ 연못 | 60 | splashes (excited) |
| flower | 🌷 화분 | 15 | sniffs (shy) |
| lamp | 🏮 등불 | 25 | stares (surprised) |
| toybox | 🧸 장난감 상자 | 40 | plays (excited) |
| tree | 🌳 나무 | 35 | rests in the shade (sleepy) |
| swing | 🎠 회전목마 | 80 | rides (joy, spin) |
| campfire | 🔥 모닥불 | 50 | warms up (joy) |

- Buildings (5, one at the back of the field): 🏠 펫 집 100, ⛺ 텐트 60, 🌬️ 풍차 150, 🗼 등대 200, 🏰 작은 성 300.
- Themes (4, change ground and decorations): 🌸 봄 80, 🏖️ 여름 80, 🍁 가을 80, ☃️ 겨울 80. Default: plain meadow.
- The sky always follows the real KST hour: morning 6–10, day 10–17, sunset 17–20, night 20–6.
- Art: emoji for furniture and buildings for now (pixel sprites can replace them later).

### Placement

- Fixed slots: 8 furniture slots on the field (world x/z positions), 1 building slot at the back, 1 theme.
- [🏠 꾸미기] mode in the playroom: tap a slot → pick an owned item (or empty).
- Local `room/me` = `{slots: [id|null ×8], building, theme}`; `shop/<itemId>` = `{at}` for purchases.
- The pet sometimes wanders to a placed furniture item and does its action (face + motion + bubble).

### Partner room visit

- 💞 놀러가기 in the playroom: a read-only playroom with the partner's room and their pet wandering.
- Server: `profiles.room jsonb` (column grant like `look`), synced with the profile; purchases in a new
  `purchases (user_id, item, at)` table (own rows), synced both ways.

## Testing

- `battle` effect mapping is UI; checked in headless Chrome screenshots.
- `maze.test.mjs`: checkpoints lie on the solution path in order.
- `pet.test.mjs` / `shop.test.mjs`: coin income from records, balance after purchases, can't buy without coins,
  wild monster roll respects tiers, one capture a day.
- Server: SQL checks for `purchases` RLS and the `w:` pulls, partner reads `profiles.room`.

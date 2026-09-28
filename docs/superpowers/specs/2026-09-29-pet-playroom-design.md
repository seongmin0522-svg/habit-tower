# Pet playroom (throw food and toys) — design

Date: 2026-09-29. Stage ① of three pet stages chosen by 도균님:
① throw food and toys to my pet (this spec), ② care for my partner's pet, ③ both pets meet on the couple tab.
② and ③ get their own specs later and reuse the throw mechanic from this one.

## Goal

Pokémon GO–style play with my equipped monster: flick food or a toy with a finger, the pet catches, eats or
fetches it, shows an emotion, and gains hearts. Hearts raise a per-pet level that pays out rewards.
The pet never dies or leaves. Hearts drop only when I wake a sleeping pet, and never below the current level.

## Entry and screen

- On the tower scene my pet (the monster next to my character) becomes a button, "펫과 놀기". Tapping it opens
  the playroom as a full-screen window. The partner's pet is not tappable (stage ②).
- The playroom closes with ✕ and with Android back, like every other window.
- Layout: sky on top, a grass field below drawn with perspective (far = small, near = big). The pet wanders slowly
  in the far half of the field. The item to throw rests at the bottom center.
- Top bar: pet name, `Lv n`, heart gauge to the next level (star gauge after Lv 10).
- Bottom tray: the day's food (each piece shown) and the four toys. Tapping one puts it in the throw spot.

## Throwing

- Put a finger on the item, drag, release. The release velocity comes from the pointer samples of the last 100 ms:
  horizontal speed → sideways, upward speed → forward and up. A tap without movement does nothing.
- Curve ball: circling the finger (total turned angle ≥ 360°) before the flick adds sideways drift toward the spin.
- Flight: 3D point (x across, y height, z depth) with gravity, drawn with scale `1 / (1 + 3z)`. It lands when y ≤ 0.
- Judgement by the landing distance from the pet: Excellent ≤ 0.06, Great ≤ 0.12, Nice ≤ 0.2 (world units), else miss.
  All thresholds and speeds live in one constants block so they can be tuned after the phone test.
- Pure functions in `pet.js`: `flick(samples)` → velocity, `spinOf(samples)` → spin, `flight(velocity, spin)` → points
  and landing, `judge(landing, petPos)` → `'excellent' | 'great' | 'nice' | 'miss'`.

## Food

- 5 pieces every day, reset at KST midnight, rolled the first time the playroom opens that day. Unused food is lost.
- Kinds: 🍎 apple, 🍖 meat, 🐟 fish (each equally likely), 🍰 cake (10% per piece).
- Tastes: each of the 31 monster bases likes one of apple/meat/fish and hates another, fixed in `catalog.js`
  (for the base at index i in `M`: likes `['apple', 'meat', 'fish'][i % 3]`, hates the next one `[(i + 1) % 3]`).
  Everyone likes cake.
- Hearts per piece:
  - Hit: Nice 2, Great 3, Excellent 5. Curve ball on a hit +1. Combo: from the 3rd hit in a row, +1 per hit.
  - Miss: the pet walks over and eats it from the ground: 1, and the combo resets.
  - Liked food doubles the piece's total. Hated food: the pet spits it out, 0 hearts, combo resets.
- A taste is recorded the first time the pet eats a liked or hated food. The dex card of a monster shows its known
  tastes (unknown ones as ?), shared by all colors of the same base.

## Toys (unlimited, toy hearts capped at 10 per day)

- ⚾ Ball: the pet runs to it and brings it back. Caught in the air (a hit) +1.
- 🥏 Frisbee: long flat flight. The pet jumps for it. A hit +1.
- 🫧 Bubbles: one throw releases 5 floating bubbles. The pet runs around popping them. All 5 within 10 s +2.
- 🎈 Balloon: falls slowly. The pet bounces it with its nose. Every 5 bounces before it touches the ground +1.

## Mood and petting

- Rolled once per day at the first open: hungry 20%, bored 20%, else fine. Between 23:00 and 06:00 KST the pet is always sleepy.
- Hungry: shows 🍖 bubble. The first food eaten that day +2 extra.
- Bored: shows … bubble. The first toy hit that day +2 extra.
- Sleepy: the pet sleeps (💤). The first throw only wakes it, angry: −3 hearts, the item comes back to the tray,
  no food used. It then stays awake until the playroom closes.
- Heart floor: a loss never takes hearts below the start of the current level (770 once the star gauge is full),
  so a level, its box and a shiny unlock are never taken back. The loss is clamped when it is recorded.
- Petting: rubbing the pet (3+ direction changes while the finger is over it) → shy reaction, +1 once per day.
  Petting a sleeping pet makes it smile in its sleep (same +1, same once per day) without waking it.
- Mood bonuses do not count toward the toy cap.

## Emotions (10)

Pixel speech-bubble icon above the head plus a body motion (CSS):
joy 💗 (bounce), excited (jump), yum (chew squish), spit (shake, item flies out), angry 💢 (red face, stomping, on being woken),
sleepy 💤 (slow sway), surprised ❗ (hop back), sad 💧 (droop, on a miss), shy /// (wiggle, on petting),
moved 💞 (spin, on level up). Bubbles are drawn as pixel icons, not emoji, so Galaxy and iPhone look the same.

## Levels and rewards

- Hearts are per monster id (a shiny shares hearts with its normal form). Switching pets keeps each pet's hearts.
- Hearts needed from Lv n to Lv n+1: `10 + 5 × (n − 1)`, Lv 1–10. Lv 10 at 270 hearts total.
- After Lv 10 a star gauge fills: 500 more hearts (770 total) unlocks that monster's shiny form in the bag,
  unless it is already owned.
- Every level reached gives one normal box, id `p:<monsterId>:<level>` (levels 2–10). Rolled from the normal
  `POOL` like photo boxes. No tier guarantee. No titles.
- Accessories 🎀 ribbon, 🎩 hat, 👑 crown unlock the first time any pet reaches Lv 3, 6, 9. Any pet can wear them.
  Worn via `look.acc` (bag → 꾸미기), drawn as a small pixel sprite on the top of the monster, on the tower scene
  and in the playroom, and synced to the partner through the existing `profiles.look`.
- Level, boxes, accessories and shiny unlocks are never stored. They are derived from hearts every time,
  the same way photo boxes are derived from days.
- Balance knob: rewards per level and the thresholds are constants in `catalog.js`.

## Data

- Local docs (IndexedDB, same `db.doc` API):
  - `pets/<monsterId>` = `{ gained, lost, tastes: { <food>: 'like' | 'hate' } }`. Hearts = `gained − lost`.
    Both counters only grow, so every merge can take the larger of each.
  - `play/<day>` = `{ food: [...kinds left], toyHearts, petted, mood, moodUsed }`. Not included in the backup file.
  - `pulls/p:<monsterId>:<level>` for opened level boxes.
- `boxes()` also lists level boxes (takes pets). `owned()` also adds `<id>*` for pets at 770+ hearts (takes pets).
- Hearts per pet in this spec always means `gained − lost`.
- Backup: `DOC_PATH` allows `pets/<id>` and `pulls/p:<id>:<n>`. Export skips `play/` docs, so an import still validates.
- Cloud (Supabase):
  - New table `pets (user_id, monster, gained int, lost int, tastes jsonb, updated_at, primary key (user_id, monster))`,
    RLS own rows only. Partner read comes with stage ②.
  - Sync: per pet, take the larger `gained` and the larger `lost` from phone and cloud, push or restore whichever side
    is behind. Tastes merge as a union.
  - `pulls.box` check constraint gains `p:[a-z]+-[a-z]+:\d{1,2}`.

## Files

- `pet.js` (new): pure rules — throw physics, judgement, hearts, heart floor, level from hearts, day food roll helpers.
- `pet.test.mjs` (new): tests for `pet.js` (picked up by `node --test`).
- `ui/playroom.js` (new): the window, pointer input, animation loop, pet behavior, emotions.
- `catalog.js`: FOODS, TOYS, ACCESSORIES, tastes, level constants.
- `logic.js`: `boxes()` and `owned()` take pets; `DOC_PATH`.
- `db.js`, `cloud.js`: pets and play docs, pets sync.
- `app.js`, `ui/scene.js`: pet button, accessory on the pet, open the playroom.
- `ui/bag.js`: accessory row in 꾸미기, Lv on monster cells, tastes on the dex card.
- `supabase/schema.sql`: pets table, pulls check.
- `sw.js`: new files in SHELL, CACHE version bump.

## Feedback

- Vibration: hit `tap`, Excellent `rare`, level up `epic`, spit `glow`.
- Sounds: existing effect files only.
- `prefers-reduced-motion`: the flight still animates (it is the game). No screen shake.

## Build order

Each step is its own commit. Push only after 도균님 confirms.

1. Playroom window, throw physics, one food kind, judgement, hearts saved. **Phone check of the throw feel here,
   then tune the constants.**
2. Four foods, tastes, daily refill, combo, curve ball.
3. Ten emotions, mood events, petting.
4. Four toys.
5. Levels, level boxes, accessories, shiny unlock, cloud sync.

## Testing

- `pet.test.mjs`: flick velocity from samples, spin detection, landing point, judgement bands, hearts (taste ×2,
  hate 0, combo from the 3rd hit, curve +1, miss 1, toy cap 10, mood bonus outside the cap, wake −3 clamped at the
  level start and at 770, merge takes the larger of each counter), level from hearts
  (0 → 1, 10 → 2, 270 → 10, 769 no shiny, 770 shiny).
- `logic.test.mjs`: `boxes()` lists `p:` boxes up to the level and skips opened ones; `owned()` shiny from pets;
  `validBackup` accepts `pets/` and `p:` pulls.
- Browser: headless Chrome over CDP with a mocked `navigator.vibrate`. Simulate a flick with pointer events,
  check a hit raises hearts and the doc is saved.
- Server: SQL check that another user cannot read or write my `pets` rows, and that a `p:` pull inserts.

## Out of scope

Stage ② and ③, partner's pet, new sound files, titles for pets, tier-guaranteed boxes.

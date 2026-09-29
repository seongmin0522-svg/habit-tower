# Pixel art overhaul: battle layout, free decorating, room-and-corridor dungeon — design

Date: 2026-09-29. Requests from 도균님: the battle foe floats in the sky, decorating is stuck in 8 fixed slots,
the maze feels old, and the emoji everywhere look amateur — draw the game's own art instead.

## Roadmap

Four stages, in this order. Each stage draws the art its own screens use, gets its own implementation plan,
and ends with a phone check before the next one starts.

1. **Battle** — side-by-side layout, platforms, background, effect and element art. Also the shared pixel renderer.
2. **Decorating** — free placement anywhere, multiple copies, sky decorations; furniture/building/theme/sky art.
3. **Maze** — rebuilt as a room-and-corridor dungeon (details in its own design session, see below).
4. **UI** — the remaining emoji: top bar, playroom toolbar, settings, bag, windows.

Art style (도균님's choice): **32×32 pixel art** for items and effects (big furniture and buildings may be larger,
e.g. 48×32). Small icons (element icons, buttons) are 16×16. Monsters stay 16×16 for now; whether to redraw the
31 base monsters at 32×32 is decided after the stage 1 sample (a possible extra stage).

## Shared: pixel renderer (`ui/pix.js`)

- Art is written in code as rows of characters plus a palette, the same way as `ui/sprites.js` (monsters, chest).
- A 32×32 sprite is up to 1024 cells. One SVG `<rect>` per cell (today's way) is fine for a few monsters but not for
  a room of 40 items (~40k elements). So `Pix({ art, px })` paints each art once to a canvas, keeps the PNG data URL
  in a Map cache keyed by art name, and shows an `<img>` with `image-rendering: pixelated` (sharp when scaled).
- Art lives in `ui/art/*.js` files grouped by stage (battle, room, dungeon, ui), so no single file balloons.

## Stage 1: Battle

Rules (`battle.js`) and record saving are untouched. Screen and art only (`ui/battle.js`, battle CSS).

- **Layout:** both pets stand on one ground line (~70% of the field height), mine at 25% facing right, the foe at
  75% facing left, the same size (px 6, 96 px wide). HP cards above each pet. Lunge is horizontal (±24 px). Projectiles
  already aim at pet centers and need no change. Entry slides in from each side as now.
- **Platforms:** a 32×16 dirt-and-grass oval under each pet.
- **Background:** tiled pixel grass instead of the flat color, with one layer of far hills and clouds.
- **Effect art (replaces emoji):** 7 element projectiles (fire, water, grass, earth, ice, dark, light), impact burst,
  heal plus, stat up/down arrows, stun stars, first-strike wind streak, drain orb.
- **Element icons:** `ELEMENTS[].icon` emoji become 16×16 pixel icons, drawn through one component, so the bag and
  dex change with the battle screen.
- **Sample gate:** before everything goes in, a sample screen (two projectiles, a platform, two monsters side by side)
  is shown to 도균님. That picture also decides the monster redraw question.
- Battle-screen buttons with emoji (title, 🏃 flee, 🤖 CPU, 💞 partner) are drawn in this stage too, so the battle
  screen has no emoji left.

## Stage 2: Decorating

- **Room data:** `room/me` and `profiles.room` change from `{slots[8], building, theme}` to
  `{items: [{id, x, z}], sky: [{id, x, y}], theme}`. Ground items use the playroom's world coordinates
  (x −1…1 across, z 0…1.8 depth); sky items use field percentages above the horizon.
- **Old rooms convert on read:** furniture in slot i moves to `SLOTS[i]`'s coordinates, the building to the old
  building spot. Nothing already placed is lost.
- **Multiple copies:** buying the same thing again stores `shop/<id>`, `shop/<id>.2`, `shop/<id>.3`… Each copy costs
  its price. Sync stays the same (union of rows). Themes are bought once (only one is used at a time); furniture,
  buildings and sky items can be bought many times.
- **Server:** `purchases.item` check becomes `^[a-z]{1,20}(\.\d{1,3})?$`; `profiles.room` size limit rises from
  1000 to 8000 bytes (40 items would not fit in 1 KB).
- **Editing:** drag an item anywhere on the ground (it scales with depth as it moves); tap an item for [치우기];
  a bottom drawer lists owned-but-unplaced items with counts, tap one to drop it in the middle. Sky items drag
  only within the sky. Buildings are ordinary ground items (any number, anywhere).
- **Limit:** 40 items per room (ground + sky).
- **Sky decorations (new, shop tab):** cloud, rainbow, kite, balloon, star, moon.
- **Pets and visits:** the pet's walk-to-furniture picks from `items`; the partner's room visit reads the new format.
- **Art:** 10 furniture, 5 buildings, 4 theme grounds and their small scattered bits, 6 sky items — all pixel art.

## Stage 3: Maze → room-and-corridor dungeon

도균님 chose a room-and-corridor dungeon (Zelda-like: small rooms joined by corridors, one event per room) that
mixes all three idea sets:

- dungeon: treasure chests, keys and locked doors, traps, a boss room at the end, a new map each day;
- puzzles: ice floors that slide, switch doors, portals, a torch that shrinks the view;
- partner ghost race: my partner's route today replays as a translucent ghost running with me.

Room count, controls (swipe vs pad), rewards and whether the ghost needs a new cloud column are settled in the
stage 3 design session, after stages 1–2 ship. The ghost race is built last within stage 3.

## Stage 4: UI

The remaining emoji in the top bar, playroom toolbar, settings, bag and windows become 16×16 pixel icons through
the same `Pix` component.

## Testing

- Pure parts get `node --test` checks like the rest of the repo: old-room conversion, copy ids and prices in the
  balance, the 40-item limit, placement bounds.
- Screens are checked in the browser (`?dev`) at phone width before each push, then on 도균님's phone.

# One island: play, decorate and games in the 3D world — design

Date: 2026-10-03. 도균님: tapping the pet shouldn't open a separate playroom; play with the pet and decorate right in
the Habit Tower 3D screen, and make play and the games 3D too. "끝까지" — all parts, in order, each pushed when it
passes its checks.

## Decisions

- Three tabs under the 3D island: **탑** (today's screen), **놀기** (play with the pet), **꾸미기** (decorate). Same
  world, no screen change; only the camera and the bottom tools change.
- The pet roams the whole island; in 놀기 the camera stands behind "my hand" and follows the play.
- 대결 · 미로 · 상점 · 일지 sit in a toolbar of the 놀기 tab. Battle and maze open full screen, in 3D.
- Without 3D (no WebGL or the light-screen setting) everything stays as it is today (2D, the playroom window).

## Parts (in this order)

1. **Island play + tabs.** The playroom's rules (throw physics, judging, eating, fetching, petting, sleeping, moods,
   level-ups) stay in `ui/playroom.js`; in 3D it runs as an overlay over the island and drives the world through a
   bridge instead of placing DOM sprites: the pet mesh walks the island, a thrown snack or ball flies as a 3D sprite
   with a shadow, the mood icons and pop-ups float over the projected pet. Playroom coordinates map onto the island
   in front of the tower (x −0.9…0.9 → 90 units across, z 0…1.4 → from the near edge back toward the tower).
   Furniture placed today shows as standing sprites at its slot. The pet tap on the tower tab switches to 놀기.
2. **Island decorating.** Drag furniture anywhere on the island, several of the same, sky decorations (the stage 2
   decorating plan of the pixel-art spec, now in 3D): room data `{items: [{id, x, z}], sky: [{id, x, y}], theme}`,
   copies `shop/<id>.N`, old slot rooms converted, a 40-item limit. Furniture is voxelized from its icon for now.
   Split by what the server allows today (`purchases.item ~ '^[a-z]{1,20}$'`, `pg_column_size(profiles.room) < 1000`):
   **2a (no server change):** every owned furniture piece and building placed anywhere on the island, dragged in
   3D (the 꾸미기 tab: an overview camera, drag on the ground, tap to pick, a drawer of what isn't placed yet) and in
   the 2D playroom; the theme colours the island's grass. Room data `{items: [[id, x, z]], theme}` (arrays, coordinates
   rounded to 0.01, so 15 pieces stay well under 1000 bytes); old `{slots, building}` rooms read as items at their old
   spots. Furniture shows as standing icon sprites. **2b (needs a migration, asked first):** copies and sky items.
3. **3D battle.** Two voxel pets on a small arena island, the same rules (`battle.js`) and turns; projectiles, hits,
   faint as 3D effects; the HP cards and skill buttons stay as UI.
4. **3D maze → dungeon.** The room-and-corridor dungeon (puzzle tiles, keys, partner ghost later) built in 3D from the
   start, voxel walls and floors, the pet walking it with swipes.
5. **Adventure screens.** The adventure rules already on `feat/adventures`: return card, journal, nest, egg reveal,
   mood icons, with places as small voxel dioramas.

Each part gets its build steps and checks in `docs/superpowers/plans/`, and is pushed when tests and the headless
checks pass.

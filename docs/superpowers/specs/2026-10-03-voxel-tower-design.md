# Voxel 3D tower screen — design

Date: 2026-10-03. 도균님 chose voxel 3D graphics (2026-10-02) and approved the pilot
(https://claude.ai/artifact/7jAwLKbSHiwMoLfcPqCCUY, version 3). This spec brings the tower screen of the app to 3D.
The playroom, battle, maze and adventure art follow in their own specs, reusing the pieces made here.

## Decisions (도균님)

- **Voxel, rounded:** every pixel of the existing art becomes cubes; the middle of a figure is thicker than its rim
  (up to 7 layers). No redrawing: all 100 monsters and the characters convert automatically.
- **Pets don't talk:** moods are a face and a small pixel icon over the head (adventure spec, "Pet moods").
- **Camera:** opens on the crew up close with the tower behind; dragging up climbs and blends back until the whole
  tower fits; sideways drags circle 360° with a little momentum. Stacking shows the new floor, then returns to the
  crew after 1.2 s.
- **No WebGL, or a slow phone:** the current 2D scene, automatically, plus a settings switch.

## Shape of the code

- `voxel.js` (new, pure, tested in Node): `voxelize(grid, round)` → `[x, y, z, color]` cubes. Rim cells are one cube
  deep; deeper cells get `2·min(d, 4) − 1` layers (d = distance to the edge). Behind the middle layer, ink and white
  cells (face details) take the most common body colour within 3 cells, so eyes don't show through the back.
- Art in: `ui/monsters.js` `paint(id, shiny, face)` cells (already exported); `ui/sprites.js` gets
  `spriteCells(id, skin)` returning the same `[x, y, color]` cells the 2D sprite draws.
- `ui/scene3d.js` (new): `Scene3D`, a drop-in for `Scene` with the same props (`character`, `partnerCharacter`,
  `look`, `tag`, `keys`, `days`, `anim`, `rubble`, `onBlock`, `onDone`, `badge`, `half`, `onPet`, and later the
  adventure `greet`/`away`).
- three.js 0.170.0 from jsdelivr (`build/three.module.min.js`), imported on first use. Until it is ready the 2D
  `Scene` shows, so the first frame is never empty. The service worker's cache-first CDN rule keeps it offline.
- `app.js` picks `Scene3D` when WebGL works and the `gfx` pref isn't `'2d'`; settings → 소리 box gets a
  "가벼운 화면 (2D)" switch. A failed WebGL context or a lost context falls back to `Scene` for the session.

## The scene

- **Ground:** a square island of grass blocks with a little height and colour noise and a few voxel flowers, a dirt
  skirt, a wooden plank under the tower. A background skin (`look.bg`) sets the sky gradient (CSS behind a transparent
  canvas) and the grass colours.
- **Bricks:** 28×13×14 boxes. Front and back faces carry the day's photo (the 360 px thumbnail `photoUrl(id, true)`,
  drawn into a canvas with a frame in the floor colour); sides use `brickColor(look.brick, i)` (rainbow skins
  included). A couple brick puts both photos side by side; the half brick shows one photo and a "?" half. Reaction
  badges are drawn into the photo's bottom corners. Textures are loaded lazily and disposed when a brick leaves.
- **Top:** at 30 floors a voxel pole with the flag skin on a small cloth plane, and a burst of confetti cubes when it
  is reached.
- **Crew:** my hero and pet (couple tab: both heroes and both pets, the 2D order kept), standing left of the tower;
  shiny pets get a slow sparkle of tiny cubes; worn accessories are voxelized with the pet. The title name tag and
  the mood icon are DOM elements placed over the projected 3D point, hidden when off screen or behind the tower.
- **Light:** sky/ground hemisphere light plus a sun with soft shadows (2048 map; 1024 when `devicePixelRatio` < 2).

## Motion

- **Stack** (`anim.kind === 'stack'`): the hero tosses the new brick in an arc onto the top (0.85 s), it lands with a
  squash and a ring of dust, the camera follows up, then glides home and `onDone()` fires — the same moment the 2D
  scene's sequence ends, so the reveal-box flow after it stays as it is. The half brick lands the same way.
- **Fall** (`anim.kind === 'fall'`): each brick gets a push and a spin; gravity and a bouncy floor settle them into
  a pile in about 2.5 s; the crew looks sad. With `rubble` and no floors, a small pile of grey cubes stays.
- **Idle:** the pet bobs, the hero breathes. `prefers-reduced-motion`: no idle motion, instant flights, no particles.
- The render loop pauses while the page is hidden.

## Touch

- A drag (more than 6 px) orbits/climbs as in the pilot; a tap raycasts: a brick → `onBlock(key)`, my pet →
  `onPet()`. Keyboard/screen readers: the 2D scene's buttons stay available as a hidden list of brick buttons with the
  same labels, so the tower is still navigable without the canvas.

## Testing

- `voxel.test.mjs`: rim depth 1, depth grows inward and caps at 7, the back hides ink/white details, cube counts for
  a known 4×4 shape, `spriteCells` matches what `Sprite` paints for one character.
- Headless (360×740): home view, a stack sequence (onDone fires once), a fall, the couple tab with four figures, a
  30-floor top, a tap on a brick opening its photo, the 2D fallback when WebGL is forced off.
- On 도균님's phone: smoothness while rotating and stacking with 30 floors of real photos (the main risk); if it
  stutters, lower the shadow map and pixel ratio before anything else.

## Out of scope here

3D playroom, battle and maze; voxel adventure places and eggs; new monster designs (stage "new monster world").

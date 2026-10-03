# Island Decorating (part 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the 꾸미기 tab: drag owned furniture and buildings anywhere on the 3D island (and on the 2D playroom field).
Spec: `docs/superpowers/specs/2026-10-03-island-design.md` part 2a.

- [x] **1. Room rules (`shop.js`, tests in `shop.test.mjs`):** `ISLAND` bounds `{x: [-1.9, 1.9], z: [0, 3.2]}`,
  `BUILDING_AT`; `roomItems(room)` → `[{id, x, z}]` (new `items`, or old `slots`/`building` at `SLOTS[i]`/`BUILDING_AT`);
  `arrange(room, id, at | null)` → `{items, theme}` (one per id, clamped, rounded to 0.01, null removes);
  `arrangeOk(bought, id, at)` (owned furniture or building, finite numbers); `withTheme(room, id)`; `themeOk(bought, id)`.
  `placeIn`/`placeOk` go.
- [x] **2. Actions (`db.js`):** `arrange(id, at)` and `setTheme(id)` replace `place(where, i, id)`.
- [x] **3. World (`ui/scene3d.js`):** mode `'decor'`: overview camera (the whole placeable ground across the screen);
  furniture sprites carry their id (buildings bigger); pointer on a sprite drags it over the ground plane, release →
  `cb.onArrange(id, {x, z})`, a tap → `cb.onItem(id)`; `setSelected(id)` enlarges the picked one. The theme's grass
  colours the island. Scene3D props `selected`, `onArrange`, `onItem`; furniture from `roomItems`.
- [x] **4. `DecorBar` (`ui/room.js`):** hint, the picked piece with [치우기], a drawer of owned pieces not placed
  (tap → placed near the middle), [🌸 테마] (PlaceSheet for themes), [🏪 상점]. `RoomLayer` draws `roomItems`, and while
  editing drags pieces over the 2D field (the playroom's projection inverted).
- [x] **5. Playroom:** furniture visits from `roomItems` (in 3D only pieces in view); 2D decorate mode shows
  `DecorBar` instead of the tray; PlaceSheet only for the theme.
- [x] **6. App:** third tab 🏠 꾸미기 (3D), `DecorBar` over the island, admin rooms through `arrange`/`withTheme`.
- [x] **7. Checks** (headless): buy in the shop, drop from the drawer, drag to a new spot (saved coordinates move),
  remove, theme recolours, the pet visits furniture in 놀기, the 2D field drag. `npm test`.
- [ ] **8. Push**, memory.

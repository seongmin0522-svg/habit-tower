# Island Play (part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 놀기 tab: the playroom's rules running over the 3D island, the pet roaming it. Spec: `docs/superpowers/specs/2026-10-03-island-design.md` part 1.

**Architecture:** `Scene3D` gets `mode` ('tower' | 'play') and `onBridge(api)`; the api lets the playroom move the pet, show the flying item and project world points to screen. `Playroom` gets `bridge` (overlay mode): same rules, no own field drawing; its DOM pet becomes an invisible hit box (petting) that carries the mood icon, placed at the projected pet.

- [ ] **1. Mapping** (in `ui/scene3d.js`): playroom point `{x, y, z}` → island `(PX + x·45, y·45, PZ − z·45)` with `PX = −10, PZ = 46`; screen projection of an island point.
- [ ] **2. Play mode in the world:** camera fixed behind the hand (`(PX, 40, PZ + 85)` looking at `(PX, 4, PZ − 30)`), no orbit; the mine pet mesh is driven by `api.setPet({x, z, dir, face, motion})` (dir ±1 turns it, face rebuilds the model only on change, motion `jump/bounce/hop/spin/droop/sway/chew/shake/stomp/wiggle` as small 3D moves); `api.setItem({kind, pos, mode} | null)` shows a sprite (emoji texture) and a ground shadow disc; `api.project({x, y, z})` → `{left, top, s}` in the overlay's pixels. Furniture in `room.slots` shows as standing emoji sprites at `SLOTS[i]` mapped.
- [ ] **3. Playroom overlay:** prop `bridge`. `draw()` uses `bridge.project` for the pet hit box and bubble, `bridge.setPet/setItem` for the visuals; the DOM item shows only while ready/dragging (the throw starts on screen); `.playroom.overlay` is a transparent layer (no field background, no RoomLayer, no close button, no decorate button), keeping the top gauge, the tools (대결 미로 상점), the hint, the pop-ups and the tray.
- [ ] **4. App:** `tab` state `'tower' | 'play'` (decorate arrives in part 2) and a tab row above the bottom bar, shown in 3D mode on my tab; 놀기 renders the overlay Playroom with the bridge; the pet tap switches to 놀기 (2D keeps the playroom window); battle/maze close back to 놀기.
- [ ] **5. Checks** (headless, `?dev&seed=30`): tab switch, a flick throw lands near the pet and hearts pop, the pet walks, petting by rubbing the pet's spot, tray counts, battle opens and returns; 2D path unchanged. `npm test`.
- [ ] **6. Push** (도균님 said 끝까지), Pages build, memory.

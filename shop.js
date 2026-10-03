// Coins and the room shop (spec: docs/superpowers/specs/2026-09-29-encounters-shop-design.md). Pure.
// Coins are never stored: income from my records minus the prices of what I bought (shop/<id> docs).
import { SHOP } from './catalog.js';
import { heartsOf, levelOf, localHour } from './pet.js';

export const COIN = { photo: 10, maze: 5, win: 3, dup: 5, level: 20 };

// Furniture slots on the playroom field (world x across, z depth; see ui/playroom.js), back row to front.
export const SLOTS = [
  { x: -0.7, z: 1.0 }, { x: -0.25, z: 1.05 }, { x: 0.25, z: 1.05 }, { x: 0.7, z: 1.0 },
  { x: -0.8, z: 0.55 }, { x: 0.8, z: 0.55 }, { x: -0.55, z: 0.3 }, { x: 0.55, z: 0.3 },
];

// rec: {days, maze, pets, pulls} as in the app state.
export function income({ days, maze, pets, pulls }) {
  const pv = Object.values(pets);
  return COIN.photo * Object.values(days).filter((d) => d?.assetId).length
    + COIN.maze * Object.keys(maze).length
    + COIN.win * pv.reduce((a, p) => a + (p.wins ?? 0), 0)
    + COIN.dup * Object.values(pulls).filter((p) => p?.dup).length
    + COIN.level * pv.reduce((a, p) => a + levelOf(heartsOf(p)) - 1, 0);
}
export const balance = (rec, bought) => income(rec) - Object.keys(bought).reduce((a, id) => a + (SHOP.get(id)?.price ?? 0), 0);
export const canBuy = (rec, bought, id) => !!SHOP.get(id) && !bought[id] && balance(rec, bought) >= SHOP.get(id).price;

// Rooms (spec: docs/superpowers/specs/2026-10-03-island-design.md part 2a): {items: [[id, x, z]], theme}, one of each
// furniture piece or building, anywhere on the island (playroom units; arrays and 0.01 steps keep the cloud copy small).
// Old rooms {slots, building} read as items at their old spots.
export const BUILDING_AT = { x: 0, z: 1.6 };
export const ISLAND = { x: [-1.9, 1.9], z: [0, 3.2] };
const PLACED = new Set(['furniture', 'building']);
const clampTo = (v, [a, b]) => Math.round(Math.min(b, Math.max(a, v)) * 100) / 100;

export function roomItems(room) {
  if (Array.isArray(room?.items)) return room.items.map(([id, x, z]) => ({ id, x, z }));
  return [...(room?.slots ?? []).map((id, i) => id && { id, ...SLOTS[i] }), room?.building && { id: room.building, ...BUILDING_AT }].filter(Boolean);
}
export const arrangeOk = (bought, id, at) => !!bought[id] && PLACED.has(SHOP.get(id)?.kind)
  && (at == null || (Number.isFinite(at.x) && Number.isFinite(at.z)));
export const themeOk = (bought, id) => id == null || (!!bought[id] && SHOP.get(id)?.kind === 'theme');
// The room with id moved to at, or taken away (at null).
export function arrange(room, id, at) {
  const items = roomItems(room).filter((i) => i.id !== id).map((i) => [i.id, i.x, i.z]);
  if (at) items.push([id, clampTo(at.x, ISLAND.x), clampTo(at.z, ISLAND.z)]);
  return { items, theme: room?.theme ?? null };
}
export const withTheme = (room, id) => ({ ...arrange(room, null, null), theme: id });

// The playroom sky follows the phone's local hour.
export function skyAt(now = new Date(), tz = undefined) {
  const h = localHour(now, tz);
  return h >= 6 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'sunset' : 'night';
}

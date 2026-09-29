// Coins and the room shop (spec: docs/superpowers/specs/2026-09-29-encounters-shop-design.md). Pure.
// Coins are never stored: income from my records minus the prices of what I bought (shop/<id> docs).
import { SHOP } from './catalog.js';
import { heartsOf, levelOf, hourKST } from './pet.js';

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

// where: 'slot' (i = 0–7, furniture), 'building' or 'theme'. id null empties it.
export function placeOk(bought, where, i, id) {
  if (where === 'slot' && !(i >= 0 && i < SLOTS.length)) return false;
  if (id == null) return true;
  const kind = { slot: 'furniture', building: 'building', theme: 'theme' }[where];
  return !!bought[id] && SHOP.get(id)?.kind === kind;
}

// The room after putting id (or null) there. A piece of furniture sits in one slot at a time: placing it moves it.
export function placeIn(room, where, i, id) {
  const r = { slots: Array(SLOTS.length).fill(null), building: null, theme: null, ...room };
  if (where !== 'slot') return { ...r, [where]: id };
  return { ...r, slots: r.slots.map((x, j) => (j === i ? id : id && x === id ? null : x)) };
}

// The playroom sky follows the real KST hour.
export function skyAt(now = new Date()) {
  const h = hourKST(now);
  return h >= 6 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'sunset' : 'night';
}

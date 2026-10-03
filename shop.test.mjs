import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN, income, balance, canBuy, skyAt, SLOTS, BUILDING_AT, ISLAND, roomItems, arrange, arrangeOk, withTheme, themeOk } from './shop.js';

const rec = {
  days: { '2026-09-27': { assetId: 'a' }, '2026-09-28': { shield: true }, '2026-09-29': { assetId: 'b' } },
  maze: { '2026-09-29': { ms: 1000 } },
  pets: { 'slime-green': { gained: 30, lost: 0, wins: 2 }, 'bat-purple': { gained: 5, lost: 0 } }, // Lv 3, Lv 1
  pulls: { 'd:2026-09-27': { item: 'x', dup: true }, 'd:2026-09-29': { item: 'y', dup: false } },
};

test('income: photos 10, maze clears 5, wins 3, duplicates 5, levels 20', () => {
  assert.deepEqual(COIN, { photo: 10, maze: 5, win: 3, dup: 5, level: 20 });
  assert.equal(income(rec), 2 * 10 + 1 * 5 + 2 * 3 + 1 * 5 + 2 * 20); // 76
  assert.equal(income({ days: {}, maze: {}, pets: {}, pulls: {} }), 0);
});

test('balance subtracts what I bought', () => {
  assert.equal(balance(rec, {}), 76);
  assert.equal(balance(rec, { cushion: {}, bowl: {} }), 76 - 30 - 20);
});

test('canBuy: a shop item I do not own yet and can afford', () => {
  assert.equal(canBuy(rec, {}, 'toybox'), true);   // 40 ≤ 76
  assert.equal(canBuy(rec, {}, 'swing'), false);   // 80 > 76
  assert.equal(canBuy(rec, { toybox: {} }, 'toybox'), false);
  assert.equal(canBuy(rec, {}, 'nope'), false);
});

test('arrangeOk: furniture or a building I own, at a real spot; themeOk: a theme I own', () => {
  const bought = { cushion: {}, tent: {}, winter: {} };
  assert.equal(arrangeOk(bought, 'cushion', { x: 0.3, z: 1 }), true);
  assert.equal(arrangeOk(bought, 'tent', { x: -1, z: 2 }), true);
  assert.equal(arrangeOk(bought, 'cushion', null), true);        // taking it away
  assert.equal(arrangeOk(bought, 'bowl', { x: 0, z: 1 }), false); // not bought
  assert.equal(arrangeOk(bought, 'winter', { x: 0, z: 1 }), false); // a theme isn't placed
  assert.equal(arrangeOk(bought, 'cushion', { x: NaN, z: 1 }), false);
  assert.equal(themeOk(bought, 'winter'), true);
  assert.equal(themeOk(bought, null), true);
  assert.equal(themeOk(bought, 'cushion'), false);
});

test('skyAt: local morning 6–10, day 10–17, sunset 17–20, night otherwise', () => {
  const at = (h) => skyAt(new Date(Date.UTC(2026, 8, 29, (h - 9 + 24) % 24)), 'Asia/Seoul');
  assert.equal(at(7), 'morning');
  assert.equal(at(12), 'day');
  assert.equal(at(18), 'sunset');
  assert.equal(at(22), 'night');
  assert.equal(at(3), 'night');
});

test('roomItems reads the new items and old slot rooms at their old spots', () => {
  assert.deepEqual(roomItems(null), []);
  assert.deepEqual(roomItems({ items: [['rug', 0.5, 2]] }), [{ id: 'rug', x: 0.5, z: 2 }]);
  const old = { slots: [null, null, 'cushion', null, null, null, null, null], building: 'tent', theme: 'winter' };
  assert.deepEqual(roomItems(old), [{ id: 'cushion', ...SLOTS[2] }, { id: 'tent', ...BUILDING_AT }]);
});

test('arrange: one of each piece, moved or taken away, clamped to the island and rounded', () => {
  const old = { slots: ['bowl', null, null, null, null, null, null, null], building: null, theme: 'winter' };
  let room = arrange(old, 'cushion', { x: 0.123456, z: 1.5 });
  assert.deepEqual(room, { items: [['bowl', SLOTS[0].x, SLOTS[0].z], ['cushion', 0.12, 1.5]], theme: 'winter' });
  room = arrange(room, 'cushion', { x: 9, z: -3 }); // moves it, kept on the island
  assert.deepEqual(room.items[1], ['cushion', ISLAND.x[1], ISLAND.z[0]]);
  assert.equal(room.items.length, 2);
  assert.deepEqual(arrange(room, 'bowl', null).items, [['cushion', ISLAND.x[1], ISLAND.z[0]]]);
  assert.deepEqual(withTheme(room, 'spring'), { ...room, theme: 'spring' });
  // every piece in the shop fits the profile row's 1000-byte limit with room to spare
  const all = ['cushion', 'bowl', 'rug', 'pond', 'flower', 'lamp', 'toybox', 'tree', 'swing', 'campfire', 'house', 'tent', 'windmill', 'lighthouse', 'castle']
    .reduce((r, id, i) => arrange(r, id, { x: -1.87 + i * 0.25, z: 3.13 - i * 0.2 }), { theme: 'autumn' });
  assert.ok(JSON.stringify(all).length < 600, JSON.stringify(all).length);
});

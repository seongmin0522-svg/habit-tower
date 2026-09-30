import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN, income, balance, canBuy, skyAt, placeOk, placeIn, SLOTS } from './shop.js';

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

test('placeOk: furniture I own in a real slot, a building in the building spot, a theme as the theme', () => {
  const bought = { cushion: {}, tent: {}, winter: {} };
  assert.equal(SLOTS.length, 8);
  assert.equal(placeOk(bought, 'slot', 3, 'cushion'), true);
  assert.equal(placeOk(bought, 'slot', 3, null), true);
  assert.equal(placeOk(bought, 'slot', 8, 'cushion'), false);
  assert.equal(placeOk(bought, 'slot', 0, 'bowl'), false);   // not bought
  assert.equal(placeOk(bought, 'slot', 0, 'tent'), false);   // a building isn't furniture
  assert.equal(placeOk(bought, 'building', 0, 'tent'), true);
  assert.equal(placeOk(bought, 'theme', 0, 'winter'), true);
  assert.equal(placeOk(bought, 'theme', 0, 'cushion'), false);
});

test('skyAt: local morning 6–10, day 10–17, sunset 17–20, night otherwise', () => {
  const at = (h) => skyAt(new Date(Date.UTC(2026, 8, 29, (h - 9 + 24) % 24)), 'Asia/Seoul');
  assert.equal(at(7), 'morning');
  assert.equal(at(12), 'day');
  assert.equal(at(18), 'sunset');
  assert.equal(at(22), 'night');
  assert.equal(at(3), 'night');
});

test('placeIn: one of each furniture, building and theme set by name', () => {
  let room = placeIn(null, 'slot', 2, 'cushion');
  assert.deepEqual(room.slots, [null, null, 'cushion', null, null, null, null, null]);
  room = placeIn(room, 'slot', 5, 'cushion'); // moves it
  assert.deepEqual(room.slots, [null, null, null, null, null, 'cushion', null, null]);
  room = placeIn(room, 'building', 0, 'tent');
  assert.equal(room.building, 'tent');
  assert.equal(placeIn(room, 'slot', 5, null).slots[5], null);
});

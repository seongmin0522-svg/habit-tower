import test from 'node:test';
import assert from 'node:assert/strict';
import { todayKST, addDays, runs, towers, pendingFall, buddyFor, TOWER_HEIGHT, MONSTERS } from './logic.js';

// n consecutive certified days starting at `start`
const run = (start, n) => Array.from({ length: n }, (_, i) => [addDays(start, i), { assetId: 'a' + i, at: '' }]);
const D = (...pairs) => Object.fromEntries(pairs.flat());
const T = '2026-09-25';

test('todayKST uses Asia/Seoul', () => {
  assert.equal(todayKST(new Date('2026-09-23T14:59:00Z')), '2026-09-23');
  assert.equal(todayKST(new Date('2026-09-23T15:00:00Z')), '2026-09-24');
});

test('runs splits consecutive days and ignores docs without a photo', () => {
  const days = D(run('2026-09-01', 2), run('2026-09-05', 1), [['2026-09-06', {}]]);
  assert.deepEqual(runs(days).map((r) => r.keys), [['2026-09-01', '2026-09-02'], ['2026-09-05']]);
});

test('towers: live run ends today or yesterday, 30 per tower', () => {
  const len = (t) => t.current?.keys.length ?? 0;
  const kinds = (t) => t.past.map((p) => `${p.kind}${p.keys.length}`);
  assert.equal(TOWER_HEIGHT, 30);
  assert.deepEqual(towers({}, T), { current: null, past: [] });
  assert.equal(len(towers(D(run('2026-09-23', 3)), T)), 3);           // through today
  assert.equal(len(towers(D(run('2026-09-22', 3)), T)), 3);           // today not yet
  const broken = towers(D(run('2026-09-21', 3)), T);                  // missed yesterday
  assert.equal(broken.current, null);
  assert.deepEqual(kinds(broken), ['fell3']);
  assert.equal(len(towers(D(run('2026-08-27', 30)), T)), 30);         // flag day
  const t31 = towers(D(run('2026-08-26', 31)), T);
  assert.equal(len(t31), 1);
  assert.deepEqual(kinds(t31), ['built30']);
  const mixed = towers(D(run('2026-06-01', 65), run('2026-09-24', 2)), T);
  assert.equal(len(mixed), 2);
  assert.deepEqual(kinds(mixed), ['fell5', 'built30', 'built30']);    // newest first
});

test('pendingFall: newest broken tower until seen', () => {
  const fell = D(run('2026-09-10', 12));
  assert.equal(pendingFall(fell, T, null).keys.length, 12);
  assert.equal(pendingFall(fell, T, '2026-09-21'), null);             // seen (last day of that tower)
  assert.equal(pendingFall(D(run('2026-09-10', 12), run('2026-09-25', 1)), T, null), null); // new tower started
  assert.equal(pendingFall(D(run('2026-08-01', 30)), T, null), null); // ended exactly complete
});

test('buddyFor evolves every 4 floors', () => {
  assert.equal(MONSTERS.length, 8);
  const id = (n) => buddyFor(n).id;
  assert.deepEqual([0, 1, 4, 5, 28, 29, 30].map(id), ['snail', 'snail', 'snail', 'mushroom', 'golem', 'dragon', 'dragon']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, mazeOf, step, inSight, mergeClears } from './maze.js';

test('the same day always gives the same maze, another day a different one', () => {
  assert.deepEqual(mazeOf('2026-09-29'), mazeOf('2026-09-29'));
  assert.notDeepEqual(mazeOf('2026-09-29').open, mazeOf('2026-09-30').open);
});

test('a perfect maze: every room reachable, exactly rooms − 1 passages, walls match on both sides', () => {
  const m = mazeOf('2026-09-29');
  const seen = new Set(['0,' + (SIZE - 1)]), todo = [m.start];
  while (todo.length) {
    const p = todo.pop();
    for (const d of ['up', 'down', 'left', 'right']) {
      const q = step(m, p, d);
      if (q && !seen.has(q.join())) { seen.add(q.join()); todo.push(q); }
    }
  }
  assert.equal(seen.size, SIZE * SIZE);
  let passages = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (step(m, [x, y], 'right')) { passages++; assert.ok(step(m, [x + 1, y], 'left')); }
    if (step(m, [x, y], 'down')) { passages++; assert.ok(step(m, [x, y + 1], 'up')); }
  }
  assert.equal(passages, SIZE * SIZE - 1);
  assert.deepEqual(m.start, [0, SIZE - 1]);
  assert.deepEqual(m.exit, [SIZE - 1, 0]);
});

test('walls and the edge block a step', () => {
  const m = mazeOf('2026-09-29');
  assert.equal(step(m, [0, SIZE - 1], 'left'), null);
  assert.equal(step(m, [0, SIZE - 1], 'down'), null);
});

test('fog: rooms within 2 steps either way are in sight', () => {
  assert.equal(inSight([5, 5], [7, 3]), true);
  assert.equal(inSight([5, 5], [8, 5]), false);
});

test('mergeClears: the faster time wins, both ways', () => {
  const r = mergeClears({ '2026-09-28': { ms: 90000, at: 'a' }, '2026-09-29': { ms: 200000, at: 'b' } },
    [{ day: '2026-09-29', ms: 150000, at: 'c' }, { day: '2026-09-27', ms: 60000, at: 'd' }]);
  assert.deepEqual(r.restore, [['2026-09-29', { ms: 150000, at: 'c' }], ['2026-09-27', { ms: 60000, at: 'd' }]]);
  assert.deepEqual(r.push, [{ day: '2026-09-28', ms: 90000, at: 'a' }]);
});

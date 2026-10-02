import test from 'node:test';
import assert from 'node:assert/strict';
import { voxelize, grassOf } from './voxel.js';

const square = (n, color = '#00ff00') => Array.from({ length: n * n }, (_, i) => [i % n, Math.floor(i / n), color]);
// Cubes are centred on x and stand on y = 0: a cell (x, y) of an n-wide, n-tall grid lands at (x - n/2 + .5, n - 1 - y + .5).
const column = (cubes, n, x, y) => cubes.filter((c) => c[0] === x - n / 2 + 0.5 && c[1] === n - 1 - y + 0.5);

test('rim is one cube deep, depth grows inward, caps at 7', () => {
  const g = voxelize(square(12), true), at = (x, y) => column(g, 12, x, y).length;
  assert.equal(at(0, 0), 1);
  assert.equal(at(1, 1), 3);
  assert.equal(at(2, 2), 5);
  assert.equal(at(3, 3), 7);
  assert.equal(at(5, 5), 7);
});

test('flat: three layers everywhere', () => {
  assert.equal(voxelize(square(4), false).length, 16 * 3);
});

test('the back half hides ink and white details under the body colour', () => {
  const cells = square(7, '#7ac35a');
  cells[3 * 7 + 3] = [3, 3, '#2b1d14']; // an eye in the middle
  const eye = column(voxelize(cells, true), 7, 3, 3);
  assert.ok(eye.length > 1);
  assert.ok(eye.filter((c) => c[2] >= 0).every((c) => c[3] === '#2b1d14'));
  assert.ok(eye.filter((c) => c[2] < 0).every((c) => c[3] === '#7ac35a'));
});

test('cells may sit outside 0..15 (an accessory above the head)', () => {
  const g = voxelize([[0, -2, '#ff0000'], [0, -1, '#ff0000'], [0, 0, '#ff0000']], true);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((c) => c[1]).sort(), [0.5, 1.5, 2.5]);
});

test('grassOf reads the two colours of a skin gradient', () => {
  assert.deepEqual(grassOf('linear-gradient(#9bcf7a,#6fae4f)'), ['#9bcf7a', '#6fae4f']);
  assert.equal(grassOf(undefined), null);
});

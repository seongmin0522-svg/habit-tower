import test from 'node:test';
import assert from 'node:assert/strict';
import { THROW, FOOD_HEARTS, flick, spinOf, at, landing, judge, levelOf, levelStart, wakeLoss, isNight, useFood, grant } from './pet.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('flick: upward speed in screen widths per second becomes forward and up', () => {
  const v = flick([{ x: 200, y: 800, t: 0 }, { x: 200, y: 640, t: 100 }], 400); // 4 widths/s up
  near(v.x, 0);
  near(v.y, 4 * THROW.ky);
  near(v.z, 4 * THROW.kz);
});

test('flick: only the last sampleMs of the drag count', () => {
  const v = flick([{ x: 0, y: 1000, t: 0 }, { x: 200, y: 800, t: 500 }, { x: 200, y: 640, t: 600 }], 400);
  near(v.z, 4 * THROW.kz);
  near(v.x, 0);
});

test('flick: sideways speed becomes x', () => {
  const v = flick([{ x: 200, y: 800, t: 0 }, { x: 240, y: 640, t: 100 }], 400); // 1 width/s right
  near(v.x, 1 * THROW.kx);
});

test('flick: taps, slow pushes and downward swipes are not throws', () => {
  assert.equal(flick([], 400), null);
  assert.equal(flick([{ x: 0, y: 0, t: 0 }], 400), null);
  assert.equal(flick([{ x: 200, y: 800, t: 0 }, { x: 200, y: 790, t: 100 }], 400), null);
  assert.equal(flick([{ x: 200, y: 600, t: 0 }, { x: 200, y: 800, t: 100 }], 400), null);
});

// n points around a circle of radius 50; dir 1 = clockwise on screen (y grows downward)
const circle = (dir, n = 20) => Array.from({ length: n + 1 }, (_, i) => {
  const a = dir * i * 2 * Math.PI / 16;
  return { x: 200 + 50 * Math.cos(a), y: 700 + 50 * Math.sin(a), t: i * 16 };
});

test('spinOf: a full circle before the flick is a curve ball, its sign is the direction', () => {
  const up = (pts) => [...pts, { x: pts.at(-1).x, y: pts.at(-1).y - 150, t: pts.at(-1).t + 80 }];
  assert.equal(spinOf(up(circle(1))), 1);
  assert.equal(spinOf(up(circle(-1))), -1);
  assert.equal(spinOf([{ x: 200, y: 800, t: 0 }, { x: 200, y: 700, t: 50 }, { x: 205, y: 600, t: 100 }]), 0);
  assert.equal(spinOf(up(circle(1, 8))), 0); // half a turn is not enough
});

test('landing: the item touches the ground where at() reaches y = 0', () => {
  const v = { x: 0, y: 1.1, z: 0.8 };
  const land = landing(v, 0);
  assert.equal(land.y, 0);
  near(at(v, 0, land.t).y, 0);
  near(land.z, 0.8 * land.t);
  near(land.x, 0);
  assert.equal(at(v, 0, 0).y, THROW.y0);
});

test('landing: spin pulls the item sideways', () => {
  const v = { x: 0, y: 1.1, z: 0.8 };
  const t = landing(v, 0).t;
  near(landing(v, 1).x, 0.5 * THROW.spinAcc * t * t);
  near(landing(v, -1).x, -0.5 * THROW.spinAcc * t * t);
});

test('judge: bands by ground distance from the pet', () => {
  const pet = { x: 0.1, z: 0.6 };
  assert.equal(judge({ x: 0.1, z: 0.65 }, pet), 'excellent');
  assert.equal(judge({ x: 0.2, z: 0.6 }, pet), 'great');
  assert.equal(judge({ x: 0.1, z: 0.45 }, pet), 'nice');
  assert.equal(judge({ x: 0.5, z: 0.6 }, pet), 'miss');
  assert.deepEqual(FOOD_HEARTS, { excellent: 5, great: 3, nice: 2, miss: 1 });
});

test('levels: 10 + 5(n − 1) hearts per level, Lv 10 at 270', () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(9), 1);
  assert.equal(levelOf(10), 2);
  assert.equal(levelOf(25), 3);
  assert.equal(levelOf(269), 9);
  assert.equal(levelOf(270), 10);
  assert.equal(levelOf(5000), 10);
  assert.equal(levelStart(3), 25);
  assert.equal(levelStart(10), 270);
});

test('wakeLoss: 3 hearts, never below the level start, never below 770 once reached', () => {
  assert.equal(wakeLoss(40), 3);   // Lv 3 starts at 25
  assert.equal(wakeLoss(26), 1);
  assert.equal(wakeLoss(25), 0);
  assert.equal(wakeLoss(0), 0);
  assert.equal(wakeLoss(771), 1);
  assert.equal(wakeLoss(800), 3);
});

test('isNight: 23:00–05:59 KST', () => {
  assert.equal(isNight(new Date('2026-09-29T14:00:00Z')), true);  // 23:00 KST
  assert.equal(isNight(new Date('2026-09-29T20:59:00Z')), true);  // 05:59 KST
  assert.equal(isNight(new Date('2026-09-29T21:00:00Z')), false); // 06:00 KST
  assert.equal(isNight(new Date('2026-09-29T13:59:00Z')), false); // 22:59 KST
});

test('useFood: 5 pieces a day', () => {
  let play = {};
  for (let i = 0; i < 5; i++) { play = useFood(play); assert.ok(play); }
  assert.equal(play.fed, 5);
  assert.equal(useFood(play), null);
});

test('grant: food as is, toy hearts capped at 10 a day, petting once', () => {
  assert.deepEqual(grant({}, 'food', 5), { n: 5, play: {} });
  let r = grant({ toyHearts: 9 }, 'toy', 1);
  assert.deepEqual(r, { n: 1, play: { toyHearts: 10 } });
  assert.equal(grant(r.play, 'toy', 1).n, 0);
  assert.deepEqual(grant({ toyHearts: 8 }, 'toy', 5), { n: 2, play: { toyHearts: 10 } });
  r = grant({}, 'pet', 1);
  assert.deepEqual(r, { n: 1, play: { petted: true } });
  assert.equal(grant(r.play, 'pet', 1).n, 0);
});

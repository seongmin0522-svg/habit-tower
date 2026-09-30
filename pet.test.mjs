import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS } from './catalog.js';
import { THROW, FOOD_HEARTS, flick, spinOf, at, landing, judge, levelOf, levelStart, wakeLoss, isNight, localHour, useFood, grant, heartsOf, accsUnlocked, mergePets, rollFood, dayFood, tasteOf, foodHearts, countBattle } from './pet.js';

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

test('isNight: 23:00–05:59 local time', () => {
  assert.equal(isNight(new Date('2026-09-29T14:00:00Z'), 'Asia/Seoul'), true);  // 23:00
  assert.equal(isNight(new Date('2026-09-29T20:59:00Z'), 'Asia/Seoul'), true);  // 05:59
  assert.equal(isNight(new Date('2026-09-29T21:00:00Z'), 'Asia/Seoul'), false); // 06:00
  assert.equal(isNight(new Date('2026-09-29T13:59:00Z'), 'Asia/Seoul'), false); // 22:59
});

test('localHour: the given zone, else the phone', () => {
  assert.equal(localHour(new Date('2026-09-29T14:00:00Z'), 'Asia/Seoul'), 23);
  assert.equal(localHour(new Date('2026-09-29T15:30:00Z'), 'Asia/Seoul'), 0);
  assert.equal(localHour(new Date('2026-09-29T14:00:00Z'), 'America/Los_Angeles'), 7);
  assert.equal(localHour(new Date(2026, 8, 29, 5, 10)), 5);
});

test('rollFood: apple/meat/fish evenly, cake under 0.1', () => {
  assert.deepEqual(rollFood([0.05, 0.1, 0.4, 0.7, 0.99]), ['cake', 'apple', 'meat', 'fish', 'fish']);
});

test('dayFood: rolls today once; a day started before kinds keeps its count', () => {
  assert.equal(dayFood({}, [0.5, 0.5, 0.5, 0.5, 0.5]).food.length, 5);
  assert.deepEqual(dayFood({ fed: 3 }, [0.2, 0.5, 0.9, 0.9, 0.9]).food, ['apple', 'meat']);
  const had = { food: ['cake'] };
  assert.equal(dayFood(had, [0.5]), had);
});

test('useFood: takes one piece of that kind, null when there is none', () => {
  const play = { food: ['apple', 'meat', 'apple'] };
  assert.deepEqual(useFood(play, 'apple'), { food: ['meat', 'apple'], fed: 1 });
  assert.equal(useFood(play, 'fish'), null);
  assert.equal(useFood({}, 'apple'), null);
});

test('tasteOf: every base likes one and hates another of apple/meat/fish; cake is loved', () => {
  const bases = [...new Set(MONSTERS.map((m) => m.base))];
  for (const b of bases) {
    const id = MONSTERS.find((m) => m.base === b).id;
    const t = ['apple', 'meat', 'fish'].map((f) => tasteOf(id, f));
    assert.equal(t.filter((x) => x === 'like').length, 1, b);
    assert.equal(t.filter((x) => x === 'hate').length, 1, b);
    assert.equal(tasteOf(id, 'cake'), 'like');
  }
  const likes = bases.map((b) => ['apple', 'meat', 'fish'].find((f) => tasteOf(MONSTERS.find((m) => m.base === b).id, f) === 'like'));
  for (const f of ['apple', 'meat', 'fish']) assert.ok(likes.filter((x) => x === f).length >= 10, f);
});

test('foodHearts: liked doubles, hated gives nothing', () => {
  assert.equal(foodHearts('excellent', 'like'), 10);
  assert.equal(foodHearts('great', null), 3);
  assert.equal(foodHearts('miss', 'like'), 2);
  assert.equal(foodHearts('excellent', 'hate'), 0);
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

test('heartsOf, accsUnlocked: accessories open at Lv 3 / 6 / 9 of any pet', () => {
  assert.equal(heartsOf({ gained: 30, lost: 4 }), 26);
  assert.equal(heartsOf(undefined), 0);
  assert.deepEqual([...accsUnlocked({})], []);
  assert.deepEqual([...accsUnlocked({ 'slime-green': { gained: 25, lost: 0 } })], ['ribbon']);
  assert.deepEqual([...accsUnlocked({ 'slime-green': { gained: 24 }, 'bat-purple': { gained: 180 } })], ['ribbon', 'hat']);
  assert.deepEqual([...accsUnlocked({ 'slime-green': { gained: 220 } })], ['ribbon', 'hat', 'crown']);
});

test('mergePets: the larger of each counter wins, both ways', () => {
  const r = mergePets(
    { 'slime-green': { gained: 10, lost: 2 }, 'bat-purple': { gained: 5, lost: 0 } },
    [{ monster: 'slime-green', gained: 12, lost: 1 }, { monster: 'pig-pink', gained: 7, lost: 0 }],
  );
  assert.deepEqual(r.push.sort((a, b) => a.monster.localeCompare(b.monster)), [
    { monster: 'bat-purple', gained: 5, lost: 0 },
    { monster: 'slime-green', gained: 12, lost: 2 },
  ]);
  assert.deepEqual(r.restore.sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'pig-pink', doc: { gained: 7, lost: 0 } },
    { id: 'slime-green', doc: { gained: 12, lost: 2 } },
  ]);
  assert.deepEqual(mergePets({ 'a-b': { gained: 3, lost: 0 } }, [{ monster: 'a-b', gained: 3, lost: 0 }]), { push: [], restore: [] });
});

test('mergePets: tastes merge as a union', () => {
  const r = mergePets({ 'a-b': { gained: 3, lost: 0, tastes: { meat: 'like' } } }, [{ monster: 'a-b', gained: 3, lost: 0, tastes: { fish: 'hate' } }]);
  assert.deepEqual(r.restore, [{ id: 'a-b', doc: { gained: 3, lost: 0, tastes: { fish: 'hate', meat: 'like' } } }]);
  assert.deepEqual(r.push, [{ monster: 'a-b', gained: 3, lost: 0, tastes: { fish: 'hate', meat: 'like' } }]);
});

test('countBattle: the first 3 battles of a day count', () => {
  let play = {};
  for (let i = 0; i < 3; i++) { const r = countBattle(play); assert.equal(r.counted, true); play = r.play; }
  assert.equal(play.battles, 3);
  assert.deepEqual(countBattle(play), { counted: false, play });
});

test('mergePets: wins merge by max', () => {
  const r = mergePets({ 'a-b': { gained: 3, lost: 0, wins: 2 } }, [{ monster: 'a-b', gained: 3, lost: 0, wins: 5 }]);
  assert.deepEqual(r.restore, [{ id: 'a-b', doc: { gained: 3, lost: 0, wins: 5 } }]);
  assert.deepEqual(r.push, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, ELEMENT, ELEMENTS, SPECIES, ITEMS } from './catalog.js';
import { mult, statsOf, skillsOf, fighter, start, turn, aiPick, battleRecord, wildRoll } from './battle.js';

// Deterministic randomness: cycles through the given values.
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const side = (id, level, over = {}) => ({ ...fighter(id, level), ...over });

test('every monster has an element and two named skills', () => {
  for (const m of MONSTERS) {
    assert.ok(ELEMENTS[ELEMENT[m.id]], m.id);
    assert.ok(SPECIES[m.base], m.base);
    const s = skillsOf(m.id);
    assert.equal(s.length, 2);
    assert.ok(s.every((k) => k.name), m.id);
    assert.equal(s[0].element, ELEMENT[m.id]);
    assert.equal(s[1].element, null);
  }
});

test('element chart: ×1.5 when I beat it, ×0.7 when it beats me', () => {
  assert.equal(mult('fire', 'grass'), 1.5);
  assert.equal(mult('grass', 'fire'), 0.7);
  assert.equal(mult('water', 'fire'), 1.5);
  assert.equal(mult('dark', 'light'), 1.5);
  assert.equal(mult('light', 'dark'), 1.5);
  assert.equal(mult('fire', 'dark'), 1);
  assert.equal(mult(null, 'fire'), 1);
});

test('stats grow with rarity and level; the strong stat is ×1.25', () => {
  const snail1 = statsOf('snail-green', 1), snail10 = statsOf('snail-green', 10);
  assert.deepEqual(snail1, { hp: 60, atk: 20, def: 19, spd: 15 }); // snail: def
  assert.ok(snail10.hp > snail1.hp * 1.7);
  const dragon = statsOf('dragon-red', 1);
  assert.equal(dragon.atk, Math.round(20 * 1.5 * 1.25));
  const frog = statsOf('frog-green', 1); // balanced: all ×1.08
  assert.deepEqual(frog, { hp: 65, atk: 22, def: 16, spd: 16 });
});

test('a "moves first" skill goes before a faster foe; else speed decides', () => {
  const bunny = side('bunny-white', 1, { spd: 1 }), bear = side('bear-brown', 1, { spd: 99 });
  const r = turn(start(bunny, bear), 1, 0, seq(0.5));
  assert.equal(r.events.find((e) => e.type === 'use').who, 'me');
  const r2 = turn(start(bunny, bear), 0, 0, seq(0.5));
  assert.equal(r2.events.find((e) => e.type === 'use').who, 'foe');
});

test('stun skips the next turn', () => {
  const king = side('kingslime-gold', 5, { spd: 99 }), pig = side('pig-pink', 5);
  const r = turn(start(king, pig), 1, 0, seq(0.1)); // 0.1 < 50% stun, hits, no crit
  assert.ok(r.events.some((e) => e.type === 'stun' && e.who === 'me'));
  assert.ok(r.events.some((e) => e.type === 'stunned' && e.who === 'foe'));
  assert.ok(!r.events.some((e) => e.type === 'use' && e.who === 'foe'));
  assert.equal(r.state.foe.stun, false);
});

test('stat stages clamp at +2', () => {
  let st = start(side('golem-stone', 5, { spd: 99 }), side('snail-green', 1));
  st = turn(st, 1, 1, seq(0.5)).state;
  assert.equal(st.me.defSt, 2);
  const r = turn(st, 1, 1, seq(0.5));
  assert.equal(r.state.me.defSt, 2);
  assert.ok(r.events.some((e) => e.type === 'stat' && e.who === 'me' && e.by === 0));
});

test('phoenix heals once per battle; drain heals half the damage', () => {
  let st = start(side('phoenix-fire', 5, { hp: 10, spd: 99 }), side('snail-green', 1));
  let r = turn(st, 1, 1, seq(0.5));
  assert.ok(r.state.me.hp > 10);
  r = turn(r.state, 1, 1, seq(0.5));
  assert.ok(r.events.some((e) => e.type === 'fail' && e.who === 'me'));
  const bat = side('bat-purple', 5, { hp: 20, spd: 99 });
  r = turn(start(bat, side('pig-pink', 5)), 1, 1, seq(0.5));
  const dealt = r.events.find((e) => e.type === 'hit' && e.who === 'me').n;
  assert.equal(r.events.find((e) => e.type === 'heal' && e.who === 'me').n, Math.round(dealt / 2));
});

test('a two-hit skill hits twice', () => {
  const r = turn(start(side('cat-orange', 5, { spd: 99 }), side('golem-stone', 10)), 1, 1, seq(0.5));
  assert.equal(r.events.filter((e) => e.type === 'hit' && e.who === 'me').length, 2);
});

test('AI heals under 40% HP, else takes the stronger move', () => {
  const low = start(side('snail-green', 1), side('stump-oak', 5, { hp: 10 }));
  assert.equal(aiPick(low, seq(0.9)), 1);
  const pig = start(side('snail-green', 1), side('pig-pink', 5));
  assert.equal(aiPick(pig, seq(0.9)), 1); // 몸통 박치기 70×0.85 > 50×0.95
  const fire = start(side('slime-green', 1), side('frog-red', 5));
  assert.equal(aiPick(fire, seq(0.9)), 0); // fire on grass ×1.5 beats 혀 채찍 45
});

test('seeded battles always end', () => {
  let x = 7;
  const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (const [a, b] of [['snail-green', 'dragon-red'], ['golem-stone', 'turtle-sea'], ['phoenix-fire', 'stump-moss']]) {
    let st = start(fighter(a, 5), fighter(b, 5)), n = 0;
    while (!st.over && n < 30) { st = turn(st, aiPick(st, rng, 'me'), aiPick(st, rng), rng).state; n++; }
    assert.ok(st.over, `${a} vs ${b}`);
  }
});

test('battleRecord: my wins and losses against my partner, and their challenges to me since a time', () => {
  const rows = [
    { challenger: 'me', defender: 'you', winner: 'me', at: '2026-09-29T01:00:00Z' },
    { challenger: 'you', defender: 'me', winner: 'you', at: '2026-09-29T02:00:00Z' },
    { challenger: 'you', defender: 'me', winner: 'me', at: '2026-09-29T03:00:00Z' },
  ];
  const r = battleRecord(rows, 'me', 'you', '2026-09-29T01:30:00Z');
  assert.deepEqual({ win: r.win, lose: r.lose }, { win: 2, lose: 1 });
  assert.deepEqual(r.fresh, [{ at: '2026-09-29T03:00:00Z', won: true }, { at: '2026-09-29T02:00:00Z', won: false }]);
  assert.equal(battleRecord(rows, 'me', 'you', '2026-09-29T03:00:00Z').fresh.length, 0);
});

test('wildRoll: a monster by box tier odds, level ±1 of mine, clamped', () => {
  const low = wildRoll([0, 0, 0.5, 0], 1), high = wildRoll([0.999, 0.999, 0.01, 0.99], 10);
  assert.equal(ITEMS.get(low.id).tier, 'common');
  assert.equal(low.level, 1); // 1 − 1 clamps to 1
  assert.equal(ITEMS.get(high.id).tier, 'legend');
  assert.equal(high.shiny, true);
  assert.equal(high.level, 10); // 10 + 1 clamps to 10
  assert.equal(wildRoll([0, 0, 0.5, 0.5], 5).level, 5);
});

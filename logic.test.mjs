import test from 'node:test';
import assert from 'node:assert/strict';
import { todayKST, addDays, runs, towers, pendingFall, validBackup, coupleDays, photoPath, toUpload, shieldDay, shieldsLeft, toRestore, shieldsToPush, notesToPush, splitReactions,
  monthGrid, addMonths, TOWER_HEIGHT, roll, owned, boxes, shards, titles, pullsToPush, pullsToRestore, halfBrick } from './logic.js';
import { MONSTERS, SKINS, TITLES, ITEMS, STARTER, POOL, COUPLE_POOL } from './catalog.js';

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


test('validBackup accepts only known paths and image data URLs', () => {
  const ok = { version: 1, docs: [['habit/me', { title: 'x' }], ['days/2026-09-25', { assetId: 'p1', at: '' }]], photos: [['p1', 'data:image/jpeg;base64,AAAA']] };
  assert.equal(validBackup(ok), true);
  assert.equal(validBackup({ ...ok, version: 2 }), false);
  assert.equal(validBackup({ ...ok, docs: [['secrets/x', {}]] }), false);
  assert.equal(validBackup({ ...ok, docs: [['days/2026-9-25', {}]] }), false);
  assert.equal(validBackup({ ...ok, docs: [['habit/me', 'str']] }), false);
  assert.equal(validBackup({ ...ok, photos: [['p1', 'javascript:alert(1)']] }), false);
  assert.equal(validBackup(null), false);
});

test('coupleDays keeps only days both certified; the couple tower falls when either stops', () => {
  const mine = D(run('2026-09-20', 3));
  const theirs = { '2026-09-21': { assetId: 'u/x.jpg' }, '2026-09-22': {}, '2026-09-25': { assetId: 'u/y.jpg' } };
  assert.deepEqual(coupleDays(mine, theirs), { '2026-09-21': { assetId: 'a1', partnerAssetId: 'u/x.jpg' } });
  const c = coupleDays(D(run('2026-09-10', 16)), D(run('2026-09-10', 12))); // partner stopped after 12 days
  assert.equal(towers(c, T).current, null);
  assert.equal(pendingFall(c, T, null).keys.length, 12);
});

test('toUpload: my days the cloud lacks or has an older photo for', () => {
  assert.equal(photoPath('u1', 'a0'), 'u1/a0.jpg');
  const days = D(run('2026-09-23', 3), [['2026-09-26', {}]]);
  const mine = { '2026-09-23': 'u1/a0.jpg', '2026-09-24': 'u1/old.jpg' };
  assert.deepEqual(toUpload(days, mine, 'u1'), ['2026-09-24', '2026-09-25']);
  assert.deepEqual(toUpload(days, {}, 'u1'), ['2026-09-23', '2026-09-24', '2026-09-25']);
});

test('towers: a cut (start over) ends the run there as a reset tower, never a fall', () => {
  const kinds = (t) => t.past.map((p) => `${p.kind}${p.keys.length}`);
  const six = D(run('2026-09-20', 6));                                 // through today
  const t = towers(six, T, '2026-09-25');                              // restarted today, after today's photo
  assert.equal(t.current, null);
  assert.deepEqual(kinds(t), ['reset6']);
  assert.equal(pendingFall(six, T, null, '2026-09-25'), null);
  assert.equal(towers(D(run('2026-09-20', 7)), '2026-09-26', '2026-09-25').current.keys.length, 1); // next day: floor 1
  const t2 = towers(six, T, '2026-09-24');                             // restarted yesterday, then certified today
  assert.equal(t2.current.keys.length, 1);
  assert.deepEqual(kinds(t2), ['reset5']);
  const later = towers(D(run('2026-09-10', 6), run('2026-09-17', 3)), T, '2026-09-15'); // a fall after a restart still falls
  assert.deepEqual(kinds(later), ['fell3', 'reset6']);
  assert.equal(pendingFall(D(run('2026-09-10', 6), run('2026-09-17', 3)), T, null, '2026-09-15').keys.length, 3);
});

test('shield: bridges one missed day without adding a floor', () => {
  const S = { shield: true, at: '' };
  const bridged = D(run('2026-09-21', 3), [['2026-09-24', S]]);          // photos 21-23, shield 24, today not yet
  assert.equal(towers(bridged, T).current.keys.length, 3);
  assert.deepEqual(towers(D(run('2026-09-21', 3), [['2026-09-24', S]], [['2026-09-25', { assetId: 'x' }]]), T).current.keys,
    ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-25']);            // today's photo continues the tower
  assert.equal(pendingFall(bridged, T, null), null);
  assert.deepEqual(runs(D([['2026-09-20', S]], run('2026-09-21', 1))).map((r) => r.keys), [['2026-09-21']]); // a lone shield starts nothing
});

test('shieldDay: only yesterday can be filled, and only once a month', () => {
  const fell = towers(D(run('2026-09-20', 4)), T).past[0];              // ends 23: missed 24 (yesterday)
  assert.equal(shieldDay(fell, T), '2026-09-24');
  assert.equal(shieldDay(towers(D(run('2026-09-19', 4)), T).past[0], T), null); // missed 23 and 24
  const days = D([['2026-09-03', { shield: true }]]);
  assert.equal(shieldsLeft(days, '2026-09-24'), 0);
  assert.equal(shieldsLeft(days, '2026-10-01'), 1);
  assert.equal(shieldsLeft({}, '2026-09-24'), 1);
});

test('coupleDays: a shield on either side bridges the couple tower too', () => {
  const S = { shield: true };
  const mine = D(run('2026-09-21', 5));                                   // 21-25
  const theirs = D(run('2026-09-21', 3), [['2026-09-24', S]], [['2026-09-25', { assetId: 'y' }]]);
  const c = coupleDays(mine, theirs);
  assert.deepEqual(c['2026-09-24'], { shield: true });
  assert.equal(towers(c, T).current.keys.length, 4);                      // 21, 22, 23, 25
  assert.deepEqual(coupleDays(D([['2026-09-24', S]]), D([['2026-09-24', S]])), { '2026-09-24': { shield: true } });
  assert.deepEqual(coupleDays({}, D([['2026-09-24', S]])), {});           // I missed it: nothing bridges
});

test('sync: what a phone pulls back from its own cloud rows', () => {
  const rows = [
    { day: '2026-09-20', photo_path: 'u1/a.jpg', at: 't', note: '5km' },
    { day: '2026-09-21', photo_path: null, at: null, shield: true },
    { day: '2026-09-22', photo_path: 'u1/b.jpg', at: null, note: '' },
  ];
  assert.deepEqual(toRestore(rows, { '2026-09-22': { assetId: 'b' } }), [
    { day: '2026-09-20', path: 'u1/a.jpg', doc: { assetId: 'a', at: 't', note: '5km' } },
    { day: '2026-09-21', path: null, doc: { shield: true, at: '' } },
  ]);
  assert.deepEqual(toRestore(rows, { '2026-09-20': {}, '2026-09-21': {}, '2026-09-22': {} }), []);
});

test('sync: shields and notes the cloud does not have yet', () => {
  const days = { '2026-09-20': { assetId: 'a', note: 'new' }, '2026-09-21': { shield: true }, '2026-09-22': { assetId: 'b' },
    '2026-09-23': { shield: true }, '2026-09-24': { assetId: 'c', note: 'x' } };
  assert.deepEqual(shieldsToPush(days, [{ day: '2026-09-23' }]), ['2026-09-21']);
  const mine = { '2026-09-20': 'u1/a.jpg', '2026-09-22': 'u1/b.jpg', '2026-09-24': 'u1/old.jpg' };
  // 20: note changed · 22: same (none) · 24: photo not uploaded yet, its upload carries the note
  assert.deepEqual(notesToPush(days, mine, { '2026-09-20': 'old', '2026-09-22': '' }, 'u1'), ['2026-09-20']);
});

test('sync: reactions split into got (on my photos) and gave (on theirs)', () => {
  const rows = [{ owner: 'me', day: 'd1', emoji: '❤️' }, { owner: 'you', day: 'd1', emoji: '🔥' }, { owner: 'you', day: 'd2', emoji: '👏' }];
  assert.deepEqual(splitReactions(rows, 'me'), { got: { d1: '❤️' }, gave: { d1: '🔥', d2: '👏' } });
});

test('monthGrid: Sunday-first weeks with blanks around the month', () => {
  const sep = monthGrid('2026-09');                       // starts on a Tuesday, 30 days
  assert.equal(sep.length, 5);
  assert.deepEqual(sep[0], [null, null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  assert.deepEqual(sep[4], ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', null, null, null]);
  const feb = monthGrid('2026-02');                       // starts on a Sunday, 28 days: exactly 4 rows
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0], '2026-02-01');
  assert.equal(feb[3][6], '2026-02-28');
  assert.equal(monthGrid('2028-02').flat().filter(Boolean).length, 29); // leap year
});

test('addMonths crosses years', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-09', 0), '2026-09');
});

test('catalog counts and unique ids', () => {
  const by = (xs, t) => xs.filter((x) => x.tier === t).length;
  const tiers = ['common', 'rare', 'epic', 'legend'];
  assert.deepEqual(tiers.map((t) => by(MONSTERS, t)), [50, 30, 15, 5]);
  const solo = SKINS.filter((s) => !s.couple), duo = SKINS.filter((s) => s.couple);
  assert.deepEqual(tiers.map((t) => by(solo, t)), [14, 12, 10, 4]);
  assert.deepEqual(tiers.map((t) => by(duo, t)), [4, 3, 2, 1]);
  assert.equal(new Set([...MONSTERS, ...SKINS].map((x) => x.id)).size, 150);
  assert.ok(ITEMS.has(STARTER));
  assert.equal(TITLES.length, 12);
});

test('roll picks tier by weight, item by index, shiny for monsters only', () => {
  assert.equal(roll(POOL, [0, 0, 0.5]).item.tier, 'common');
  assert.equal(roll(POOL, [0.69, 0, 0.5]).item.tier, 'common');
  assert.equal(roll(POOL, [0.70, 0, 0.5]).item.tier, 'rare');
  assert.equal(roll(POOL, [0.90, 0, 0.5]).item.tier, 'epic');
  assert.equal(roll(POOL, [0.98, 0, 0.5]).item.tier, 'legend');
  assert.equal(roll(POOL, [0.999, 0.999, 0.5]).item.tier, 'legend');
  const mon = roll(POOL, [0, 0, 0.01]);
  assert.equal(mon.shiny, !!mon.item.base);
  assert.equal(roll(POOL, [0, 0, 0.03]).shiny, false);
  assert.equal(roll(COUPLE_POOL, [0.99, 0.5, 0]).shiny, false);
  assert.ok(roll(COUPLE_POOL, [0.99, 0.5, 0]).item.couple);
});

test('owned always has the starter; shiny counts apart', () => {
  const o = owned({ 'd:2026-10-01': { item: 'bat-purple', shiny: true } });
  assert.ok(o.has(STARTER) && o.has('bat-purple*') && !o.has('bat-purple'));
});

test('boxes: photo days from the start date, couple days, bonus from dups; minus opened', () => {
  const days = { '2026-09-26': { assetId: 'a' }, '2026-09-27': { assetId: 'b' }, '2026-09-28': { shield: true }, '2026-09-29': { assetId: 'c' } };
  const cdays = { '2026-09-27': { assetId: 'b', partnerAssetId: 'x' }, '2026-09-28': { shield: true } };
  const pulls = { 'd:2026-09-27': { item: 'snail-green', dup: true } };
  assert.deepEqual(boxes({ days, cdays, pulls, from: '2026-09-27' }), ['c:2026-09-27', 'd:2026-09-29']);
  const dups = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`d:x${i}`, { dup: true }]));
  assert.deepEqual(boxes({ days: {}, cdays: {}, pulls: { ...dups, 'b:0': { dup: false } }, from: '' }), ['b:1']);
  assert.equal(shards(dups), 1);
});

const streak = (start, n, extra = {}) => Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(start, i), { assetId: 'p' + i, ...extra }]));
test('titles', () => {
  const t = (o) => [...titles({ days: {}, cdays: {}, pulls: {}, today: '2026-12-31', ...o })].sort();
  assert.deepEqual(t({}), []);
  assert.deepEqual(t({ days: streak('2026-10-01', 1) }), ['first']);
  assert.ok(t({ days: streak('2026-10-01', 7) }).includes('week'));
  const thirty = streak('2026-10-01', 30);
  assert.ok(t({ days: thirty }).includes('tower') && t({ days: thirty }).includes('straight'));
  const withShield = { ...streak('2026-10-01', 10), '2026-10-11': { shield: true }, ...streak('2026-10-12', 20) };
  assert.ok(t({ days: withShield }).includes('tower') && !t({ days: withShield }).includes('straight'));
  assert.ok(t({ days: { ...streak('2026-01-01', 3), ...streak('2026-02-01', 7) } }).includes('comeback'));
  assert.ok(!t({ days: streak('2026-02-01', 7) }).includes('comeback'));
  assert.ok(t({ pulls: { a: { item: 'bat-purple', shiny: true } } }).includes('shiny'));
  assert.ok(t({ pulls: { a: { item: 'dragon-red', shiny: false } } }).includes('legend'));
  assert.ok(t({ cdays: streak('2026-10-01', 30, { partnerAssetId: 'q' }) }).includes('couple'));
  const fifty = Object.fromEntries(MONSTERS.slice(0, 50).map((m, i) => [`d:${i}`, { item: m.id }]));
  assert.ok(t({ pulls: fifty }).includes('dex50') && !t({ pulls: fifty }).includes('dex100'));
});

test('pull sync diffs', () => {
  const pulls = { 'd:2026-10-01': { item: 'bat-purple', shiny: false, dup: false, at: 't' }, 'b:0': { item: 'x', shiny: false, dup: true, at: '' } };
  assert.deepEqual(pullsToPush(pulls, [{ box: 'b:0' }]), ['d:2026-10-01']);
  assert.deepEqual(pullsToRestore([{ box: 'b:0', item: 'x', shiny: false, dup: true, at: null },
    { box: 'b:1', item: 'y', shiny: true, dup: false, at: 't' }], pulls),
  [{ box: 'b:1', doc: { item: 'y', shiny: true, dup: false, at: 't' } }]);
});

test('backup accepts pull docs', () => {
  assert.ok(validBackup({ version: 1, docs: [['pulls/d:2026-10-01', { item: 'a' }], ['pulls/c:2026-10-01', {}], ['pulls/b:3', {}]], photos: [] }));
  assert.ok(!validBackup({ version: 1, docs: [['pulls/../x', {}]], photos: [] }));
});

test('halfBrick: only one of us has a photo for today', () => {
  const P = { assetId: 'me1', at: '' }, Q = { assetId: 'u/p1.jpg', at: '' }, S = { shield: true };
  assert.deepEqual(halfBrick(D([[T, P]]), {}, T), { side: 'l', assetId: 'me1' });
  assert.deepEqual(halfBrick({}, D([[T, Q]]), T), { side: 'r', assetId: 'u/p1.jpg' });
  assert.equal(halfBrick(D([[T, P]]), D([[T, Q]]), T), null);            // both: a real floor instead
  assert.equal(halfBrick({}, {}, T), null);
  assert.equal(halfBrick(D([[T, S]]), {}, T), null);                     // a shield is not a photo
  assert.equal(halfBrick(D([['2026-09-24', P]]), {}, T), null);          // yesterday's photo doesn't count
});

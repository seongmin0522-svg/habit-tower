import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { translate, monthTitle, weekdays, LANG } from './i18n.js';
import { EN } from './lang/en.js';

test('translate: Korean key, English lookup, values in order, function values, fallback', () => {
  const dict = { '{0}의 {1}!': '{1} of {0}!', '{0}층': (n) => (n === 1 ? '1 floor' : `${n} floors`), '사과': 'Apple' };
  const tag = (s, ...v) => translate(dict, s, v);
  assert.equal(tag`${'나'}의 ${'공격'}!`, '공격 of 나!');
  assert.equal(tag`${1}층`, '1 floor');
  assert.equal(tag`${3}층`, '3 floors');
  assert.equal(translate(dict, '사과', []), 'Apple');
  assert.equal(translate(dict, '없는 말', []), '없는 말');
  assert.equal(translate(null, ['', '층'], [5]), '5층'); // Korean: the template as written
});

test('LANG is Korean under Node, so pure-module tests keep seeing Korean', () => assert.equal(LANG, 'ko'));

test('calendar labels', () => {
  assert.equal(monthTitle('2026-09', 'ko'), '2026년 9월');
  assert.equal(monthTitle('2026-09', 'en'), 'September 2026');
  assert.deepEqual(weekdays('ko'), ['일', '월', '화', '수', '목', '금', '토']);
  assert.deepEqual(weekdays('en'), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
});

// Every tl key in the code, built like the runtime does: each ${…} becomes {0}, {1}… in order.
function codeKeys() {
  const files = [...readdirSync('.').filter((f) => f.endsWith('.js') && f !== 'i18n.js'),
    ...readdirSync('ui').filter((f) => f.endsWith('.js')).map((f) => `ui/${f}`)];
  const keys = new Map(); // key -> the first file using it
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const [, body] of src.matchAll(/\btl`([^`]*)`/g)) {
      let i = 0;
      const k = body.replace(/\$\{[^}]*\}/g, () => `{${i++}}`);
      if (!keys.has(k)) keys.set(k, f);
    }
    for (const [, s] of src.matchAll(/\btl\('([^'\\]*)'\)/g)) if (!keys.has(s)) keys.set(s, f);
  }
  return keys;
}
const holes = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();

test('every tl key has English, every English entry is used, placeholders match', () => {
  const keys = codeKeys();
  assert.deepEqual([...keys].filter(([k]) => !(k in EN)).map(([k, f]) => `${f}: ${k}`), [], 'missing English');
  assert.deepEqual(Object.keys(EN).filter((k) => !keys.has(k)), [], 'unused English');
  assert.deepEqual(Object.entries(EN).filter(([k, v]) => typeof v === 'string' && holes(k) !== holes(v)).map(([k]) => k), [],
    'placeholders differ');
});

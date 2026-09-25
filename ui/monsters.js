import { html } from './h.js';
import { MONSTERS } from '../logic.js';

// Original 16x16 pixel monsters, facing left toward the character. '.' = transparent.
const ART = {
  snail: { pal: { S: '#e0a050', s: '#a8622a', B: '#8ec8f0' }, map: [
    '................','................','................','................',
    '......KKKKK.....','.....KSSSSSK....','....KSsssssSK...','....KSsKKKKsSK..',
    '.E.EKSsKSSKsSK..','.K.KKSsKKsKsSK..','KBBBKKSsssKsSK..','KBBBBKSKKKKSSK..',
    'KBBBBBKSSSSSKBK.','KBBBBBKKKKKKBBBK','KBBBBBBBBBBBBBBK','.KKKKKKKKKKKKKK.']},
  mushroom: { pal: { O: '#f28a2e', S: '#ffe6c2' }, map: [
    '................','................','.....KKKKKK.....','...KKOOOOOOKK...',
    '..KOOWWOOOOOOK..','.KOOWWWOOOWWOOK.','.KOOOWOOOOWWOOK.','KOOOOOOOOOOOOOOK',
    'KOOOOOOWWOOOOOOK','.KKKKKKKKKKKKKK.','...KSSSSSSSSK...','...KSEWSSEWSK...',
    '...KSEESSEESK...','...KSSSSSSSSK...','...KSSSSSSSSK...','....KKKKKKKK....']},
  slime: { pal: { G: '#5fd35f', g: '#3a9a3a' }, map: [
    '................','................','................','................',
    '.......KK.......','......KGGK......','.....KGGGGK.....','....KGWGGGGK....',
    '...KGWGGGGGGK...','..KGGGGGGGGGGK..','..KGEWGGGGEWGK..','.KGGEEGGGGEEGGK.',
    '.KGGGGGGGGGGGGK.','.KGggggggggggGK.','KggggggggggggggK','.KKKKKKKKKKKKKK.']},
  bat: { pal: { V: '#7a4ab8', v: '#4e2c7e' }, map: [
    '................','................','................','................',
    '.K....K..K....K.','KVK...KKKK...KVK','KVVK.KVVVVK.KVVK','KVVVKVVVVVVKVVVK',
    'KVVVVVEWVEWVVVVK','KVvVVVEEVEEVVvVK','KvKvVVVVVVVVvKvK','K.KvKVWVVWVKvK.K',
    '...K.KVVVVK.K...','......KKKK......','................','................']},
  pig: { pal: { P: '#f5a6b8', N: '#d97890' }, map: [
    '................','................','..KK........KK..','..KPK......KPK..',
    '..KPPKKKKKKPPK..','.KPPPPPPPPPPPPK.','.KPPEWPPPPEWPPK.','.KPPEEPPPPEEPPK.',
    'KPPPPKNNNNKPPPPK','KPPPPNKNNKNPPPPK','KPPPPKNNNNKPPPPK','KPPPPPPPPPPPPPPK',
    '.KPPPPPPPPPPPPK.','..KPPKKKKKKPPK..','..KKKK....KKKK..','................']},
  skeleton: { pal: { R: '#ff4040' }, map: [
    '................','....KKKKKKKK....','...KWWWWWWWWK...','..KWWWWWWWWWWK..',
    '..KWKKKWWKKKWK..','..KWKRKWWKRKWK..','..KWWWWKKWWWWK..','...KWKWKWKWKK...',
    '...KKKKKKKKKK...','.....KWWWWK.....','...KKWKWWKWKK...','..KW.KWWWWK.WK..',
    '.....KWKKWK.....','.....KWWWWK.....','.....KW..WK.....','.....KK..KK.....']},
  golem: { pal: { R: '#9a8f80', r: '#6e655a', Y: '#ffd83a' }, map: [
    '................','....KKKKKKKK....','....KRRRRRRK....','....KRYRRYRK....',
    '....KRRRRRRK....','.KKKKKKKKKKKKKK.','KRRRKRRRRRRKRRRK','KRRRKRrRRrRKRRRK',
    'KRRRKRRRRRRKRRRK','KrrrKRRRRRRKrrrK','KKKKKRRRRRRKKKKK','.KRRKKKKKKKKRRK.',
    '.KKKKRRRKRRRKKK.','....KRRRKRRRK...','...KKRRRKRRRKK..','...KKKKKKKKKKK..']},
  dragon: { pal: { D: '#c8322b', w: '#f08a3a', Y: '#f2c230' }, map: [
    '................','...K........K...','...KK.KKKK.KK...','....KKDDDDKK....',
    '...KDDDDDDDDK...','KK.KDEWDDEWDK.KK','KwKKDEEDDEEDKKwK','KwwKDDDDDDDDKwwK',
    'KwwwKDKDDKDKwwwK','.KwwKDDDDDDKwwK.','..KKKDYYYYDKKK..','....KDYYYYDK....',
    '....KDYYYYDKK...','....KDDKKDDKDK..','....KKK..KKK.K..','................']},
};
const BASE = { K: '#2b1d14', W: '#ffffff', E: '#2b1d14' };

export function Monster({ id, px = 2 }) {
  const m = MONSTERS.find((x) => x.id === id) ?? MONSTERS[0];
  const { pal, map } = ART[m.id];
  const rects = [];
  map.forEach((row, y) => [...row].forEach((k, x) => {
    const fill = pal[k] || BASE[k];
    if (fill) rects.push(html`<rect x=${x} y=${y} width="1.02" height="1.02" fill=${fill} />`);
  }));
  return html`<svg class="monster" width=${16 * px} height=${16 * px} viewBox="0 0 16 16"
    shape-rendering="crispEdges" role="img" aria-label=${m.name}>${rects}</svg>`;
}

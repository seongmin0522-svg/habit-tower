import { html } from './h.js';

// Original 16x18 pixel characters. '.' = transparent; shared keys in BASE.
export const CHARACTERS = [
  {id:'warrior', name:'전사', pal:{H:'#8b4a1e',R:'#d8322b',A:'#b9c3cf',a:'#7d8a99',G:'#f2c230',L:'#5a3a22',P:'#e6eef5'}, map:[
    '....KKKKKKK.....','...KHHHHHHHK....','..KHHHHHHHHHK...','..KRRRRRRRRRK...',
    '.KHSSSSSSSSSHK..','.KSSSSSSSSSSSK..','.KSSEWSSSEWSSK..','.KSSEESSSEESSKP.',
    '.KSBSSSSSSSBSKP.','..KSSSSKSSSSK.P.','...KKSSSSSKK..P.','..KAAAGGGAAAK.P.',
    '.KAAAAAGAAAAAKP.','.KSaAAAGAAAaSKP.','..KaAAAGAAAaKGGG','...KaaaaaaaK..K.',
    '...KLLK.KLLK....','...KKKK.KKKK....']},
  {id:'thief', name:'도적', pal:{H:'#2d2d3a',M:'#4b2d6b',D:'#3a3550',d:'#26223a',G:'#f2c230',P:'#e6eef5'}, map:[
    '....KKKKKKK.....','...KHHHHHHHK....','..KHHHHHHHHHK...','..KHHHHHHHHHHK..',
    '.KHHSSSSSSSHHK..','.KHSSSSSSSSSHK..','.KSSEWSSSEWSSK..','.KSSEESSSEESSK..',
    '.KMMMMMMMMMMMK..','..KMMMMMMMMMK...','...KKMMMMMKK..P.','..KDDDDMDDDDK.P.',
    '.KDDDDDMDDDDDKP.','.KSdDDDGDDDdSKP.','..KdDDDDDDDdKGGG','...KdddddddK..K.',
    '...KDDK.KDDK....','...KKKK.KKKK....']},
  {id:'magician', name:'마법사', pal:{T:'#3b5bd9',t:'#2a3f9c',G:'#f2c230',H:'#a0662a',V:'#7a4ab8',v:'#56308a',O:'#7fe3ff',X:'#8b5a2b'}, map:[
    '......KK........','.....KTTK.......','....KTTTTK......','...KTTGTTTK.....',
    '.KKTTTTTTTTKK...','KttttttttttttK..','.KHSSSSSSSSHK.O.','.KSSEWSSSEWSKOOO',
    '.KSSEESSSEESK.O.','.KSBSSSKSSBSK.X.','..KKSSSSSSKK..X.','..KVVVVGVVVVK.X.',
    '.KVVVVVGVVVVVKX.','.KSvVVVGVVVvSKX.','.KvVVVVVVVVVvKX.','.KvvvvvvvvvvvKX.',
    '..KKKKKKKKKKK.X.','................']},
  {id:'bowman', name:'궁수', pal:{N:'#3f9a3a',n:'#2c6e29',F:'#e2463b',H:'#c9782e',J:'#5cb85c',j:'#3f8a3f',L:'#6b4423',B:'#a0662a',X:'#dddddd'}, map:[
    '.........F......','....KKKKKFF.....','...KNNNNNNFK....','..KNNNNNNNNNK...',
    '.KNNNNNNNNNNNK..','.KnHHHHHHHHHnK..','.KSSEWSSSEWSSK.B','.KSSEESSSEESSKBX',
    '.KSBSSSSSSSBSKBX','..KSSSSKSSSSK.BX','...KKSSSSSKK..BX','..KJJJJLJJJJK.BX',
    '.KJJJJJLJJJJJKBX','.KSjJJJLJJJjSKBX','..KjJJJJJJJjK.BX','...KjjjjjjjK...B',
    '...KLLK.KLLK....','...KKKK.KKKK....']},
];
const BASE = { K: '#2b1d14', S: '#ffdcb8', W: '#ffffff', E: '#2b1d14', B: '#ff9e9e' };

export function Sprite({ id, px = 3 }) {
  const c = CHARACTERS.find((x) => x.id === id) ?? CHARACTERS[0];
  const rects = [];
  c.map.forEach((row, y) => [...row].forEach((k, x) => {
    const fill = c.pal[k] || BASE[k];
    if (fill) rects.push(html`<rect x=${x} y=${y} width="1.02" height="1.02" fill=${fill} />`);
  }));
  return html`<svg class="sprite" width=${16 * px} height=${18 * px} viewBox="0 0 16 18"
    shape-rendering="crispEdges" role="img" aria-label=${c.name}>${rects}</svg>`;
}

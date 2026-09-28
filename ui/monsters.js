import { html } from './h.js';
import { MONSTERS } from '../catalog.js';

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
  skeleton: { pal: { W: '#f4f4ee', R: '#ff4040' }, map: [
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
  chick: { pal: { Y: '#ffe14d', y: '#d8b020', O: '#f08a3a' }, map: [
    '................','................','................','.......KK.......',
    '......KYYK......','.....KYYYYKK....','....KYYYYYYYK...','...KYEWYYYYYK...',
    '..KOKEEYYYYYYK..','..KOOKYYYYyYYK..','...KKYYYYyyYYK..','....KYYYYYYYYK..',
    '....KyYYYYYYyK..','.....KyyyyyyK...','......KOK.KOK...','......KK...KK...']},
  bunny: { pal: { R: '#f8f8f8', r: '#c8c8d0', P: '#ffb0c0' }, map: [
    '...KK...KK......','..KRPK.KRPK.....','..KRPK.KRPK.....','..KRPK.KRPK.....',
    '...KRKKKRK......','..KRRRRRRRK.....','.KRRRRRRRRRK....','.KREWRRREWRK....',
    '.KREERRREERK....','.KRBRRPRRBRK....','..KRRKRKRRK.....','..KRRRRRRRRK....',
    '.KRRRRRRRRRRK...','.KrRRRRRRRRrK...','..KrrKKKKrrK....','...KK....KK.....']},
  frog: { pal: { F: '#6ac04a', f: '#3f8a2a', M: '#c8463a' }, map: [
    '................','................','................','..KKK.....KKK...',
    '.KWWWK...KWWWK..','.KWEEK...KWEEK..','.KFWWKKKKKWWFK..','KFFFFFFFFFFFFFK.',
    'KFFFFFFFFFFFFFK.','KFFMMMMMMMMFFFK.','.KFFFFFFFFFFFK..','.KfFFFFFFFFFfK..',
    'KFfKfffffffKfFK.','KFFK.KKKKK.KFFK.','.KK..........KK.','................']},
  stump: { pal: { T: '#a8743a', t: '#6e4a22', Y: '#e8c890', y: '#c8a060', L: '#5fbf4a' }, map: [
    '................','.....K..K.......','....KLK.KLK.....','....KLLKLLK.....',
    '..KKKKKKKKKKKK..','.KYYYYYYYYYYYYK.','.KYyYYYYYYYyYYK.','.KTYYYYYYYYYYTK.',
    '.KTTTTTTTTTTTTK.','.KTEWTTTTEWTTTK.','.KTEETTTTEETTTK.','.KTTTTTtTTTTTTK.',
    '.KTTTTKKTTTTTTK.','KtTTTTTTTTTTTTtK','KtKtttKttKtttKtK','.K.KKK.KK.KKK.K.']},
  bee: { pal: { Y: '#f2c230', w: '#e8f4ff' }, map: [
    '................','................','................','.....KK.KK......',
    '....KwwKwwK.....','....KwwKwwK.....','.....KKKKK......','....KYYYYYKK....',
    '...KYEWYYKYYK...','...KYEEYYKYYKK..','...KYYYYYKYYKYK.','...KYYYYYKYYKYYK',
    '....KYYYYKYYKKK.','.....KKKKKKKK...','................','................']},
  cat: { pal: { C: '#f0a040', c: '#c07020', P: '#ffb0c0' }, map: [
    '................','................','..KK......KK....','..KCK....KCK....',
    '..KCCKKKKCCK....','..KCCCCCCCCK....','.KCCEWCCEWCCK...','.KCCEECCEECCK...',
    '.KCBCCPCCCBCK...','..KCCKCKCCCK....','...KCCCCCCK.....','..KCCCCCCCCK.KK.',
    '..KCcCCCCcCK.KCK','..KCcCCCCcCKKCK.','..KcKccccKcKK...','...KK....KK.....']},
  octopus: { pal: { O: '#e0503a', o: '#a0301e' }, map: [
    '................','.....KKKKKK.....','....KOOOOOOK....','...KOOWOOOOOK...',
    '...KOWWOOOOOK...','...KOOOOOOOOK...','...KOEWOOEWOK...','...KOEEOOEEOK...',
    '...KOOOOOOOOK...','....KOOKKOOK....','..KKOOOOOOOOKK..','.KOoOKOoOKOoOK..',
    '.KOoKKOoOKKoOK..','KOoK.KOoK.KoOK..','KoK..KoK...KoK..','.K....K.....K...']},
  crab: { pal: { C: '#e0503a', c: '#a0301e' }, map: [
    '................','................','.KK..........KK.','KCCK........KCCK',
    'KCKCK......KCKCK','.KCK.KK..KK.KCK.','..KK.KEK.KEK.KK.','...KKKKCCKKKK...',
    '...KCCCCCCCCK...','..KCCCCCCCCCCK..','..KCcCCCCCCcCK..','..KCCCKKKKCCCK..',
    '...KccccccccK...','..KcK.K..K.KcK..','..K..K....K..K..','................']},
  turtle: { pal: { T: '#6aa84a', t: '#3f7a2a', B: '#c8e890' }, map: [
    '................','................','................','................',
    '................','.....KKKKKK.....','....KTtTTtTK....','...KTTtTTtTTK...',
    '.KKKtttttttttK..','KBBKTTtTTtTTTK..','KEWBKTTtTTtTTK..','KBBBKKKKKKKKKKK.',
    '.KKBBK.KBBK.KBK.','...KK...KK...K..','................','................']},
  ghost: { pal: { G: '#f4f4fa', g: '#c0c0d0' }, map: [
    '................','.....KKKKK......','....KGGGGGK.....','...KGGGGGGGK....',
    '..KGGGGGGGGGK...','..KGEEGGEEGGK...','..KGEWGGEWGGK...','..KGGGGGGGGGK...',
    '..KGGGKKGGGGK...','.KGGGGKKGGGGGK..','.KGGGGGGGGGGGK..','KGGGGGGGGGGGGGK.',
    'KgGGGGGGGGGGGgK.','KggGgggGgggGggK.','.KKgKKKgKKKgKK..','...K...K...K....']},
  penguin: { pal: { P: '#33334a', p: '#1e1e2e', O: '#f2a030' }, map: [
    '................','.....KKKKK......','....KPPPPPK.....','...KPPPPPPPK....',
    '...KPWEPWEPK....','...KPWWPWWPK....','..KOOKWWWWPPK...','...KKWWWWWPPK...',
    '..KPKWWWWWWPPK..','..KPKWWWWWWPpK..','..KPKWWWWWWPpK..','...KKWWWWWWPpK..',
    '....KWWWWWWPK...','....KKKKKKKK....','....KOOK.KOOK...','....KKK..KKK....']},
  fox: { pal: { F: '#f08a3a', f: '#b0561a' }, map: [
    '................','................','..KK.....KK.....','..KFK...KFK.....',
    '..KFFKKKFFK.....','.KFFFFFFFFFK....','.KFFEWFFEWFK....','KWWFEEFFEEFK....',
    'KEWWWWWFFFFK....','.KKWWWWFFFK.KK..','...KKKKFFFFKFFK.','....KFFFFFFFFFK.',
    '....KFfFFFFfFWK.','....KFfFFFFfKWK.','....KfKffffKfKK.','.....KK....KK...']},
  cactus: { pal: { C: '#5aa84a', c: '#3a7a2a', R: '#ff6a8a', P: '#c8643c', p: '#8a4020' }, map: [
    '.......KK.......','......KRRK......','.....KKRRKK.....','....KCCKKCCK....',
    '....KCCCCCCK....','.KK.KCEWCEWK....','KCCKKCEECEEK.KK.','KCcCKCCCCCCKKCCK',
    '.KCcKCCKKCCKCcK.','..KKKCCCCCCKCK..','....KCcCCcCKK...','....KCcCCcCK....',
    '...KKKKKKKKKK...','...KPPPPPPPPK...','....KPppppPK....','....KKKKKKKK....']},
  pumpkin: { pal: { O: '#f08a2e', o: '#b85a14', L: '#3a8a2a', Y: '#ffe14d' }, map: [
    '................','................','.......KK.......','.......KLK......',
    '....KKKKLKKK....','...KOoOOKOOoOK..','..KOoOOOOOOOoOK.','.KOoOKYKOKYKOoOK',
    '.KOoOOKOOOKOOoOK','.KOoOOOOOOOOOoOK','.KOoKYYYYYYYKoOK','.KOoOKYKYKYKOoOK',
    '..KoOOKKKKKOOoK.','...KooOOOOOooK..','....KKKKKKKKK...','................']},
  owl: { pal: { O: '#9a6a3a', o: '#6a4422', F: '#f0e0c0', Y: '#f2c230', A: '#e8a030' }, map: [
    '................','...K.......K....','...KK.....KK....','...KOKKKKKOK....',
    '...KOOOOOOOK....','..KFFFFOFFFFK...','..KFYYFOFYYFK...','..KYEWYKYEWYK...',
    '..KFYYFAFYYFK...','..KOFFKAKFFOK...','.KOoOOOKOOOoOK..','.KOoOoOOOoOoOK..',
    '.KOoOOoOoOOoOK..','..KoOOOOOOOoK...','...KKAKKKAKK....','...KAAK.KAAK....']},
  snowman: { pal: { S: '#f4f8fc', s: '#c8d4e0', R: '#3aa04a', r: '#26703a', A: '#f08a3a', H: '#2b2b33' }, map: [
    '.....KKKKKK.....','.....KHHHHK.....','....KKKKKKKK....','....KSSSSSSK....',
    '....KSESSESK....','..KAAASSSSSK....','....KSSKKSSK....','...KRRRRRRRRK...',
    '...KrRRRRRRrK...','..KSSKrRKSSSSK..','.KSSSKrRKSESSSK.','.KSSSSKKSSSSSSK.',
    '.KSSSSSSSSESSSK.','.KsSSSSSSSSSSsK.','..KssssssssssK..','...KKKKKKKKKK...']},
  bear: { pal: { B: '#8a5a30', b: '#5a3a1e', M: '#e0c090' }, map: [
    '................','..KK......KK....','.KBbK....KbBK...','.KBBKKKKKKBBK...',
    '..KBBBBBBBBK....','.KBBEWBBBEWBK...','.KBBEEBBBEEBK...','.KBBBMMMMBBBK...',
    '.KBBMMKKMMBBK...','..KBBMMMMBBK....','..KKBBBBBBKK....','.KBBKBBBBBBKBBK.',
    '.KBBKBBMMBBKBBK.','..KKKBBMMBBKKK..','...KbbKKKKbbK...','...KKKK..KKKK...']},
  wolf: { pal: { F: '#8a8a98', f: '#5a5a68' }, map: [
    '................','...K....K.......','..KFK..KFK......','..KFFKKKFFK.....',
    '.KFFFFFFFFFK....','.KFEWFFFEWFK....','KFFEEFFFEEFK....','KEFFFFFFFFFK....',
    '.KWWKFFFFFK.....','..KKWWFFFFFK..K.','...KWWFFFFFFKFK.','...KWFFFFFFFFK..',
    '...KFfFFFFFfFK..','...KFfKFFFKfFK..','...KfK.KfK.KfK..','...KK..KK..KK...']},
  knight: { pal: { A: '#b9c3cf', a: '#7d8a99', R: '#2b1d14', P: '#d8322b' }, map: [
    '......KKK.......','.....KPPPK......','.....KPPK.......','....KKKKKKK.....',
    '...KAAAAAAAK....','...KAAAAAAAK....','...KRRRRRRAK....','...KAaAaAaAK....',
    '...KAAAAAAAK....','..KKKKKKKKKKK...','.KAAKAAAAAKAAK..','.KAAKAaaaAKAAK..',
    '.KKKKAAAAAKKKK..','....KAAKAAK.....','....KaaKaaK.....','....KKKKKKK.....']},
  phoenix: { pal: { F: '#e8402a', f: '#f89a3a', Y: '#ffe14d' }, map: [
    '....K.K.........','...KYKYK........','...KFYFK........','..KFFFFFK.......',
    '.KYFEWFFK...KK..','KYYKEEFFFK.KFfK.','.KK.KFFFFFKFfYK.','...KFFFFFFFfYYK.',
    '..KfFFFFFFfYYK..','..KffFFFFffYK...','...KffffffYK....','....KKYYKKK.....',
    '...KYfK.KfYK....','..KYfK...KfYK...','..KYK.....KYK...','...K.......K....']},
  unicorn: { pal: { U: '#f8f8ff', u: '#c8c8e0', M: '#ff8ab0', N: '#8ad0ff', Y: '#f2c230' }, map: [
    '.KK.............','.KYK............','..KYK...........','...KYKKK........',
    '...KUUUMK.......','..KUEWUMNK......','.KUUEEUUMNK.....','KUUUUUUUUMNK....',
    'KBUUKUUUUUMNK...','.KKK.KUUUUUUMKK.','.....KUUUUUUUUMK','.....KUUUUUUUUNK',
    '.....KUuUUUUuUK.','.....KUKUK.KUKUK','.....KuKuK.KuKuK','.....KKKKK.KKKKK']},
  kingslime: { pal: { G: '#f2c230', g: '#b8860b', C: '#ffe14d', R: '#d8322b' }, map: [
    '....K..KK..K....','....KCKCCKCK....','....KCCRCCCK....','....KKKKKKKK....',
    '...KGGGGGGGGK...','..KGWGGGGGGGGK..','.KGWWGGGGGGGGGK.','.KGGGGGGGGGGGGK.',
    'KGGEWGGGGGGEWGGK','KGGEEGGGGGGEEGGK','KGGGGGGKKGGGGGGK','KGGGGGGGGGGGGGGK',
    'KgGGGGGGGGGGGGgK','KggGGGGGGGGGGggK','KggggggggggggggK','.KKKKKKKKKKKKKK.']},
  kraken: { pal: { O: '#5a3a9a', o: '#3a2470', S: '#f0b0d0', Y: '#ffe14d' }, map: [
    '.....KKKKKK.....','....KOOOOOOK....','...KOOSOOOOOK...','..KOOOOOOOSOOK..',
    '..KOOOOOOOOOOK..','..KOYEOOOOYEOK..','..KOYYOOOOYYOK..','..KOOOOKKOOOOK..',
    '.KOKOOOOOOOOKOK.','KOSKOOoOOoOOKSOK','KOoKOoKOOKoOKoOK','KoSOKoKOOKoKOSoK',
    '.KoOKKOoOoKKOoK.','..KoSOKOoKOSoK..','...KKoK.KoKK....','.....KK..KK.....']},
};
const BASE = { K: '#2b1d14', W: '#ffffff', E: '#2b1d14', B: '#ff9e9e' };

// Shiny recolor: colors turn to the far side of the hue wheel; whites and greys (which a hue turn can't
// change) go gold. Outline, eyes and highlights (BASE) stay.
function shinyColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = sat < .2 ? 45 : (h * 60 + 180) % 360;
  sat = Math.max(sat, .65);
  return `hsl(${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(Math.min(l, .8) * 100)}%)`;
}

// The art and final colors for a catalog monster ('snail-green'): its variant palette goes over the base art's.
// Expressions redraw the art's own eyes, so every monster gets every face. Eye cells: 'E' plus a 'W' highlight
// touching it, or the letter and rows here for monsters drawn without 'E' eyes.
// rows: where the eyes are, when the same letter is also a nose or buttons.
const EYE_SPEC = {
  skeleton: { k: 'R', rows: [5] }, golem: { k: 'Y', rows: [3] }, pumpkin: { k: 'Y', rows: [7] }, knight: { k: 'R', rows: [6] },
  fox: { k: 'E', rows: [6, 7] }, wolf: { k: 'E', rows: [5, 6] }, snowman: { k: 'E', rows: [4] },
};
export const FACES = ['blink', 'joy', 'excited', 'yum', 'sad', 'surprised', 'sleepy', 'angry', 'shy', 'spit', 'moved'];
const TEAR = '#6ec6ff', BLUSH = '#ff8ab0', RED = '#ff5a4a';
const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Each eye: its cells and bounding box, from connected eye cells.
const eyeCache = new Map();
function eyesOf(base) {
  if (eyeCache.has(base)) return eyeCache.get(base);
  const map = ART[base].map, spec = EYE_SPEC[base] ?? { k: 'E' };
  const isEye = (x, y) => map[y]?.[x] === spec.k && (!spec.rows || spec.rows.includes(y));
  const mark = new Set();
  map.forEach((row, y) => [...row].forEach((c, x) => {
    const inRows = !spec.rows || spec.rows.includes(y);
    if (isEye(x, y) || (inRows && spec.k === 'E' && c === 'W' && NEAR.some(([dx, dy]) => isEye(x + dx, y + dy)))) mark.add(`${x},${y}`);
  }));
  const eyes = [], seen = new Set();
  for (const start of mark) {
    if (seen.has(start)) continue;
    const cells = [], todo = [start];
    seen.add(start);
    while (todo.length) {
      const [x, y] = todo.pop().split(',').map(Number);
      cells.push([x, y]);
      for (const [dx, dy] of NEAR) {
        const n = `${x + dx},${y + dy}`;
        if (mark.has(n) && !seen.has(n)) { seen.add(n); todo.push(n); }
      }
    }
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    eyes.push({ cells, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  }
  eyeCache.set(base, eyes);
  return eyes;
}

// The art's letter grid with a face drawn in, plus literal colors (tears, blush) that ignore the palette.
function faced(base, face) {
  const map = ART[base].map, grid = map.map((r) => [...r]), lit = new Map(), eyes = eyesOf(base);
  if (!face || !eyes.length) return { grid, lit };
  const eyeAt = new Set(eyes.flatMap((e) => e.cells.map(([x, y]) => `${x},${y}`)));
  const skin = (x, y) => map[y]?.[x] && !'.K'.includes(map[y][x]) && !eyeAt.has(`${x},${y}`);
  const counts = {};
  for (const r of map) for (const c of r) if (!'.K'.includes(c)) counts[c] = (counts[c] ?? 0) + 1;
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const mid = eyes.reduce((a, e) => a + e.x0 + e.x1, 0) / (2 * eyes.length);
  const free = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 16 && (map[y][x] === '.' || skin(x, y)); // marks may hang off the art
  const ink = (x, y) => { if (free(x, y)) grid[y][x] = 'K'; };
  const drop = (x, y, color) => { const ty = [y, y + 1].find((ty) => free(x, ty)); if (ty != null) lit.set(`${x},${ty}`, color); };
  const flush = (x, y, color) => { if (skin(x, y)) lit.set(`${x},${y}`, color); }; // blush stays on the face
  for (const e of eyes) {
    const around = [...Array(e.x1 - e.x0 + 1)].flatMap((_, i) => [[e.x0 + i, e.y0 - 1], [e.x0 + i, e.y1 + 1]])
      .concat([[e.x0 - 1, e.y0], [e.x1 + 1, e.y0]]);
    const [bx, by] = around.find(([x, y]) => skin(x, y)) ?? [];
    // An eye on a stalk tip has nothing around it; one in a dark socket closes with the monster's main color.
    const body = bx != null ? map[by][bx] : around.some(([x, y]) => map[y]?.[x] === '.') ? '.' : common;
    const left = (e.x0 + e.x1) / 2 < mid, inner = left ? e.x1 : e.x0, outer = left ? e.x0 : e.x1;
    const tall = e.y1 > e.y0, y = e.y0;
    const blank = () => e.cells.forEach(([x, cy]) => { grid[cy][x] = body; });
    const line = (ly) => { for (let x = e.x0; x <= e.x1; x++) grid[ly][x] = 'K'; };
    const closed = () => {                                                                                              // —
      if (tall) { blank(); line(e.y1); return; }
      if (free(e.x0 - 1, y) || free(e.x1 + 1, y)) { ink(e.x0 - 1, y); ink(e.x1 + 1, y); } else blank(); // socket: lid
    };
    const happy = () => {
      if (tall) { blank(); line(e.y0); return; }
      blank(); ink(e.x0 - 1, y); ink(e.x1 + 1, y); for (let x = e.x0; x <= e.x1; x++) ink(x, y - 1);                // ^
    };
    const cheeks = (color) => [e.x0, e.x1].forEach((x) => flush(x, e.y1 + 1, color));
    if (face === 'blink' || face === 'sleepy' || face === 'yum') closed();
    else if (face === 'shy') { closed(); cheeks(BLUSH); }
    else if (face === 'joy') { happy(); cheeks(BLUSH); }
    else if (face === 'excited') happy();
    else if (face === 'moved') { happy(); drop(outer, e.y1 + 1, TEAR); }
    else if (face === 'sad') {
      if (tall) e.cells.forEach(([x, cy]) => { if (cy === e.y0) grid[cy][x] = body; });
      drop(outer, e.y1 + 1, TEAR);
    } else if (face === 'surprised') { // taller eyes, or when there's no room, a smaller or white pupil
      let grew = 0;
      for (let x = e.x0; x <= e.x1; x++) if (free(x, e.y0 - 1)) { grid[e.y0 - 1][x] = map[e.y0][x] === 'W' ? 'W' : map[e.y1][x]; grew++; }
      const pupil = e.cells.filter(([x, cy]) => map[cy][x] !== 'W');
      if (!grew) (pupil.length > 1 ? pupil.slice(1) : pupil).forEach(([x, cy]) => { grid[cy][x] = 'W'; });
    } else if (face === 'angry') {
      ink(inner, e.y0 - 1); ink(inner + (left ? 1 : -1), e.y0 - 2);
      cheeks(RED);
    } else if (face === 'spit') {
      blank();
      if (tall) {
        grid[e.y0][left ? e.x0 : e.x1] = 'K'; grid[e.y1][left ? e.x1 : e.x0] = 'K';                                    // \ /
        grid[e.y1][left ? e.x0 : e.x1] = 'K';
      } else for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ink(e.x0 + dx, y + dy);                        // ×
    }
  }
  return { grid, lit };
}

// face: one of FACES, or null for the normal art.
export function paint(id, shiny, face = null) {
  const m = MONSTERS.find((x) => x.id === id) ?? MONSTERS[0];
  const art = ART[m.base], pal = { ...art.pal, ...m.pal };
  if (shiny) for (const k in pal) pal[k] = shinyColor(pal[k]);
  const { grid, lit } = faced(m.base, face), cells = [];
  grid.forEach((row, y) => row.forEach((k, x) => {
    const fill = lit.get(`${x},${y}`) ?? (pal[k] || BASE[k]);
    if (fill) cells.push([x, y, fill]);
  }));
  return { m, cells };
}

// shiny: the rare recolor; the sparkle around it is CSS (.sparkle in index.html).
export function Monster({ id, px = 2, shiny = false, face = null }) {
  const { m, cells } = paint(id, shiny, face);
  return html`<svg class="monster" width=${16 * px} height=${16 * px} viewBox="0 0 16 16"
    shape-rendering="crispEdges" role="img" aria-label=${(shiny ? '이로치 ' : '') + m.name}>${
    cells.map(([x, y, fill]) => html`<rect x=${x} y=${y} width="1.02" height="1.02" fill=${fill} />`)}</svg>`;
}

// The same picture as an image URL, for grids (the bag shows up to 200): one <img> instead of ~150 <rect>s each.
const urls = new Map();
export function monsterUrl(id, shiny = false) {
  const key = id + (shiny ? '*' : '');
  if (!urls.has(key)) {
    const rects = paint(id, shiny).cells.map(([x, y, f]) => `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${f}"/>`).join('');
    urls.set(key, 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`));
  }
  return urls.get(key);
}

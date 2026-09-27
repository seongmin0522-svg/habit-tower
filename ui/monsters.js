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

// id: a catalog monster ('snail-green'); its variant palette goes over the base art's.
// shiny: the rare recolor (CSS hue turn + sparkle, see index.html .shiny).
export function Monster({ id, px = 2, shiny = false }) {
  const m = MONSTERS.find((x) => x.id === id) ?? MONSTERS[0];
  const art = ART[m.base], pal = { ...art.pal, ...m.pal };
  if (shiny) for (const k in pal) pal[k] = shinyColor(pal[k]);
  const rects = [];
  art.map.forEach((row, y) => [...row].forEach((k, x) => {
    const fill = pal[k] || BASE[k];
    if (fill) rects.push(html`<rect x=${x} y=${y} width="1.02" height="1.02" fill=${fill} />`);
  }));
  return html`<svg class=${'monster' + (shiny ? ' shiny' : '')} width=${16 * px} height=${16 * px} viewBox="0 0 16 16"
    shape-rendering="crispEdges" role="img" aria-label=${(shiny ? '이로치 ' : '') + m.name}>${rects}</svg>`;
}

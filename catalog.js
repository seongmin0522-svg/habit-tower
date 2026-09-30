// Everything a gacha box can hold, plus the titles. Pure data; logic.js decides, ui/ draws.
// Monster art lives in ui/monsters.js per base shape; a variant here only recolors it (pal overrides).
// Original designs and names — a classic side-scroller mood, never a copy of a real game's monsters.
import { tl } from './i18n.js';

export const REWARDS_FROM = '2026-09-27'; // boxes only for days certified from launch on
export const SHINY_RATE = 0.03;
export const DUPS_PER_BONUS = 10;
export const STARTER = 'snail-green';

export const TIERS = [ // taps: how many taps a box of this tier takes to open
  { id: 'common', name: tl('일반'), weight: 70, color: '#a7a7a7', taps: 2 },
  { id: 'rare', name: tl('레어'), weight: 20, color: '#4a9ae8', taps: 5 },
  { id: 'epic', name: tl('희귀'), weight: 8, color: '#b05ae0', taps: 20 },
  { id: 'legend', name: tl('전설'), weight: 2, color: '#f2c230', taps: 30 },
];

// [base, tier, [[variant, name, pal], ...]]
const M = [
  ['snail', 'common', [
    ['green', '초록 달팽이', { S: '#7ac35a', s: '#4a8a2a', B: '#f0dca8' }],
    ['blue', '파랑 달팽이', { S: '#5aa0e0', s: '#2e6aa8', B: '#f0dca8' }],
    ['red', '빨강 달팽이', { S: '#e05a4a', s: '#a02e22', B: '#f0dca8' }],
    ['brown', '갈색 달팽이', {}]]],
  ['mushroom', 'common', [
    ['orange', '귤버섯', {}],
    ['green', '풀버섯', { O: '#5fbf4a' }],
    ['blue', '물방울버섯', { O: '#4a8ae0' }],
    ['pink', '딸기버섯', { O: '#f06a9a' }]]],
  ['slime', 'common', [
    ['green', '풀 슬라임', {}],
    ['blue', '물 슬라임', { G: '#5ab0f0', g: '#2e78c0' }],
    ['pink', '젤리 슬라임', { G: '#f59ac0', g: '#c8628a' }],
    ['purple', '포도 슬라임', { G: '#a07ae0', g: '#6a48a8' }]]],
  ['chick', 'common', [
    ['yellow', '노랑 병아리', {}],
    ['white', '솜털 병아리', { Y: '#f4f1e6', y: '#c8c0a4' }],
    ['brown', '밤톨 병아리', { Y: '#c8864a', y: '#8a5a2a' }],
    ['mint', '민트 병아리', { Y: '#9fe8c8', y: '#5ab890' }]]],
  ['bunny', 'common', [
    ['white', '흰 토끼', {}],
    ['pink', '분홍 토끼', { R: '#ffd0dc', r: '#e8a0b4' }],
    ['brown', '갈색 토끼', { R: '#c8a07a', r: '#8a6a4a' }],
    ['gray', '회색 토끼', { R: '#b8b8c0', r: '#80808a' }]]],
  ['pig', 'common', [
    ['pink', '분홍 돼지', {}],
    ['tan', '누렁 돼지', { P: '#e0b888', N: '#b8885a' }],
    ['gray', '회색 돼지', { P: '#a8a8b0', N: '#78787f' }],
    ['lilac', '라일락 돼지', { P: '#c8b0e8', N: '#9a80c0' }]]],
  ['frog', 'common', [
    ['green', '청개구리', {}],
    ['blue', '물개구리', { F: '#4aa0e0', f: '#2a6aa8' }],
    ['red', '고추개구리', { F: '#e0503a', f: '#a02a1e' }],
    ['yellow', '레몬개구리', { F: '#f2d23a', f: '#b89a1e' }]]],
  ['stump', 'common', [
    ['oak', '참나무 그루터기', {}],
    ['birch', '자작 그루터기', { T: '#e8e0d0', t: '#a8a090' }],
    ['dark', '흑목 그루터기', { T: '#5a3a2a', t: '#3a2418' }],
    ['moss', '이끼 그루터기', { T: '#8a6a3a', t: '#5a4424', L: '#3aa03a' }]]],
  ['bee', 'common', [
    ['yellow', '꿀벌', {}],
    ['orange', '귤벌', { Y: '#f89a3a' }],
    ['pink', '꽃벌', { Y: '#f59ac0' }],
    ['blue', '하늘벌', { Y: '#7cc0f5' }]]],
  ['cat', 'common', [
    ['orange', '치즈 고양이', {}],
    ['black', '까만 고양이', { C: '#3a3a44', c: '#22222a' }],
    ['white', '하얀 고양이', { C: '#f4f1e6', c: '#c8c0a4' }],
    ['gray', '회색 고양이', { C: '#9a9aa8', c: '#6a6a78' }]]],
  ['octopus', 'common', [
    ['red', '빨강 문어', {}],
    ['pink', '분홍 문어', { O: '#f59ac0', o: '#c8628a' }],
    ['purple', '보라 문어', { O: '#a07ae0', o: '#6a48a8' }],
    ['blue', '파랑 문어', { O: '#5ab0f0', o: '#2e78c0' }]]],
  ['crab', 'common', [
    ['red', '빨강 게', {}],
    ['orange', '주홍 게', { C: '#f08a3a', c: '#b0561a' }],
    ['blue', '파랑 게', { C: '#4a8ae0', c: '#2a5aa8' }],
    ['green', '초록 게', { C: '#5fbf4a', c: '#3a8a2a' }]]],
  ['turtle', 'common', [
    ['green', '숲 거북', {}],
    ['sea', '바다 거북', { T: '#3aa0b0', t: '#1e6a78', B: '#b8e8d0' }]]],

  ['bat', 'rare', [
    ['purple', '보라 박쥐', {}],
    ['black', '밤 박쥐', { V: '#44444f', v: '#26262e' }],
    ['red', '핏빛 박쥐', { V: '#b8322b', v: '#7a1e1a' }],
    ['blue', '동굴 박쥐', { V: '#3a6ad9', v: '#24449c' }]]],
  ['ghost', 'rare', [
    ['white', '꼬마 유령', {}],
    ['blue', '푸른 유령', { G: '#bfe0ff', g: '#8fb0d8' }],
    ['green', '도깨비불 유령', { G: '#c8f5c0', g: '#8ad080' }],
    ['pink', '수줍은 유령', { G: '#ffd0e0', g: '#e0a0b8' }]]],
  ['penguin', 'rare', [
    ['black', '펭귄', {}],
    ['blue', '얼음 펭귄', { P: '#3a6ad9', p: '#24449c' }],
    ['brown', '아기 펭귄', { P: '#8a7060', p: '#5a4a3e' }],
    ['pink', '분홍 펭귄', { P: '#e87aa0', p: '#b04a70' }]]],
  ['fox', 'rare', [
    ['orange', '여우', {}],
    ['white', '북극 여우', { F: '#f4f1e6', f: '#c8c0a4' }],
    ['black', '검은 여우', { F: '#3a3a44', f: '#22222a' }],
    ['silver', '은여우', { F: '#b8c0cc', f: '#808a98' }]]],
  ['cactus', 'rare', [
    ['green', '선인장', {}],
    ['flower', '꽃선인장', { R: '#ff6ab0' }],
    ['blue', '푸른 선인장', { C: '#4ab0a0', c: '#2a7a70' }],
    ['desert', '사막 선인장', { C: '#a8b04a', c: '#7a802a', R: '#f2c230' }]]],
  ['pumpkin', 'rare', [
    ['orange', '호박등', {}],
    ['green', '애호박', { O: '#6ab04a', o: '#3f7a2a' }],
    ['white', '유령 호박', { O: '#f0ece0', o: '#b8b0a0' }],
    ['purple', '마녀 호박', { O: '#8a5ac8', o: '#5a3a8a' }]]],
  ['owl', 'rare', [
    ['brown', '부엉이', {}],
    ['snowy', '흰 올빼미', { O: '#f4f1e6', o: '#c8c0a4' }],
    ['gray', '잿빛 올빼미', { O: '#9a9aa8', o: '#6a6a78' }]]],
  ['snowman', 'rare', [
    ['plain', '눈사람', {}],
    ['red', '빨간 목도리 눈사람', { R: '#d8322b', r: '#9a1e1e' }],
    ['blue', '파란 목도리 눈사람', { R: '#3a6ad9', r: '#24449c' }]]],

  ['skeleton', 'epic', [
    ['bone', '해골 병사', {}],
    ['dark', '검은 해골', { W: '#6a6a78', R: '#a0f0ff' }],
    ['gold', '황금 해골', { W: '#f2c230', R: '#ff4040' }]]],
  ['golem', 'epic', [
    ['stone', '돌 골렘', {}],
    ['ice', '얼음 골렘', { R: '#bfe6ff', r: '#7ab0d8', Y: '#3a8ad9' }],
    ['lava', '용암 골렘', { R: '#5a3a3a', r: '#3a2424', Y: '#ff6a2a' }]]],
  ['bear', 'epic', [
    ['brown', '불곰', {}],
    ['panda', '판다곰', { B: '#f4f1e6', b: '#2b1d14' }],
    ['polar', '북극곰', { B: '#f4f8fc', b: '#c8d4e0' }]]],
  ['wolf', 'epic', [
    ['gray', '회색 늑대', {}],
    ['black', '검은 늑대', { F: '#3a3a44', f: '#22222a' }],
    ['white', '설원 늑대', { F: '#eef2f6', f: '#b8c4d0' }]]],
  ['knight', 'epic', [
    ['iron', '녹슨 갑옷', {}],
    ['bronze', '청동 갑옷', { A: '#c8864a', a: '#8a5a2a' }],
    ['dark', '흑기사 갑옷', { A: '#44444f', a: '#26262e', R: '#ff4040' }]]],

  ['dragon', 'legend', [['red', '불꽃 드래곤', {}]]],
  ['phoenix', 'legend', [['fire', '불사조', {}]]],
  ['unicorn', 'legend', [['white', '유니콘', {}]]],
  ['kingslime', 'legend', [['gold', '왕관 슬라임', {}]]],
  ['kraken', 'legend', [['deep', '심해 크라켄', {}]]],
];
export const MONSTERS = M.flatMap(([base, tier, vs]) =>
  vs.map(([v, name, pal]) => ({ id: `${base}-${v}`, base, name, tier, pal })));

// Character colors: [class, [[variant, name, tier, pal], ...]] — pal overrides the class palette in ui/sprites.js.
const C = [
  ['warrior', [
    ['dark', '흑철 전사', 'common', { A: '#5a5f6a', a: '#3a3e47', R: '#8a1e1e' }],
    ['forest', '숲의 전사', 'common', { A: '#7fb069', a: '#4f7a3f', R: '#e0a030' }],
    ['sky', '하늘 기사', 'rare', { A: '#8fd0ff', a: '#4a90d0', R: '#ffffff', H: '#f2d06a' }],
    ['gold', '황금 전사', 'epic', { A: '#f2c230', a: '#b8860b', R: '#ffffff', H: '#ffe08a' }]]],
  ['thief', [
    ['red', '붉은 도적', 'common', { M: '#b8322b', D: '#5a2a2a', d: '#3a1a1a' }],
    ['teal', '청록 도적', 'common', { M: '#2b8a8a', D: '#2a4a50', d: '#1a3036' }],
    ['white', '백야 도적', 'rare', { M: '#e6eef5', D: '#a0a8b8', d: '#707888', H: '#d8d8e8' }],
    ['shadow', '그림자 도적', 'epic', { M: '#1a1a1a', D: '#101018', d: '#000000', H: '#6a2a9a', P: '#ff4a4a' }]]],
  ['magician', [
    ['red', '불꽃 마법사', 'common', { T: '#d8322b', t: '#9a1e1e', V: '#f08a3a', v: '#b8581e' }],
    ['green', '숲 마법사', 'common', { T: '#3f9a3a', t: '#2c6e29', V: '#8fd35a', v: '#5a9a2a' }],
    ['night', '밤하늘 마법사', 'rare', { T: '#1d2b45', t: '#101828', V: '#3a4a7a', v: '#26305a', O: '#ffe14d' }],
    ['pink', '벚꽃 마법사', 'epic', { T: '#f5a6b8', t: '#d97890', V: '#ffd0dc', v: '#e8a0b4', O: '#ff6ab0' }]]],
  ['bowman', [
    ['blue', '파랑 궁수', 'common', { N: '#3a6ad9', n: '#2a4a9c', J: '#5c9ae8', j: '#3f6ab8' }],
    ['brown', '사냥꾼 궁수', 'common', { N: '#8b5a2b', n: '#5a3a1e', J: '#b8864a', j: '#8a6030' }],
    ['snow', '설원 궁수', 'rare', { N: '#e6eef5', n: '#a0b0c0', J: '#cfe8f7', j: '#8fb0d0', F: '#3a8ad9' }],
    ['elf', '요정 궁수', 'epic', { N: '#7fe3a0', n: '#3fb070', J: '#b0f0c0', j: '#6fd090', H: '#f2e06a', F: '#ff6ab0' }]]],
];

const stars = (c = '#fff') => [[12, 18], [28, 8], [46, 22], [63, 12], [80, 26], [90, 6], [37, 36], [72, 44], [18, 52]]
  .map(([x, y]) => `radial-gradient(1.5px 1.5px at ${x}% ${y}%, ${c}, transparent)`).join(',');
const grass = (a, b) => `linear-gradient(${a},${b})`;

// Background, brick and flag skins. couple: only from couple boxes, shown on the couple tower.
const S = [
  ['bg', 'sunset', tl('노을'), 'common', { sky: 'linear-gradient(#f7a26b,#fbd3a0)', grass: grass('#9bcf7a', '#6fae4f') }],
  ['bg', 'cloudy', tl('흐린 날'), 'common', { sky: 'linear-gradient(#a8b4c0,#dde3e8)', grass: grass('#8ab87a', '#5f9050') }],
  ['bg', 'night', tl('밤하늘'), 'rare', { sky: `${stars()},linear-gradient(#0d1530,#2a3a6a)`, grass: grass('#2f4a2a', '#223820') }],
  ['bg', 'blossom', tl('벚꽃'), 'rare', { sky: `${stars('#ffb0c8')},linear-gradient(#ffd6e4,#fff0f5)`, grass: grass('#b8e0a0', '#88c070') }],
  ['bg', 'autumn', tl('가을'), 'rare', { sky: 'linear-gradient(#f0c080,#fbe6c0)', grass: grass('#d09040', '#a06a28') }],
  ['bg', 'snow', tl('설원'), 'epic', { sky: `${stars('#ffffff')},linear-gradient(#b8cfe6,#eef4fa)`, grass: grass('#ffffff', '#dfe8f0') }],
  ['bg', 'aurora', tl('오로라'), 'epic', { sky: 'linear-gradient(#0a1a2a,#1a6a5a 60%,#3ab08a)', grass: grass('#e8f0f8', '#b8c8d8') }],
  ['bg', 'space', tl('우주'), 'legend', { sky: `${stars()},radial-gradient(circle at 80% 15%,#ffe8a0 0 18px,transparent 19px),linear-gradient(#050510,#1a0a3a)`, grass: grass('#8a8a9a', '#5a5a6a') }],
  ['brick', 'wood', tl('나무 벽돌'), 'common', { colors: ['#b07a4a', '#8a5a30', '#d0a060'] }],
  ['brick', 'moss', tl('이끼 벽돌'), 'common', { colors: ['#7a9a6a', '#5a8a4a', '#a8c870'] }],
  ['brick', 'ice', tl('얼음 벽돌'), 'rare', { colors: ['#bfe6ff', '#8fd0ff', '#e8f8ff'] }],
  ['brick', 'candy', tl('사탕 벽돌'), 'rare', { colors: ['#ff9ec0', '#9ee0ff', '#fff09e'] }],
  ['brick', 'crystal', tl('수정 벽돌'), 'epic', { colors: ['#b88aff', '#8a5ad9', '#e0c8ff'] }],
  ['brick', 'lava', tl('용암 벽돌'), 'epic', { colors: ['#ff6a2a', '#c83a1a', '#ffc04a'] }],
  ['brick', 'rainbow', tl('무지개 벽돌'), 'legend', { colors: ['#ff5a5a', '#5ad06a', '#5a9aff'], rainbow: true }],
  ['brick', 'diamond', tl('다이아 벽돌'), 'legend', { colors: ['#e8f8ff', '#bfefff', '#ffffff'] }],
  ['flag', 'white', tl('흰 깃발'), 'common', { icon: '🏳️' }],
  ['flag', 'carp', tl('잉어 깃발'), 'common', { icon: '🎏' }],
  ['flag', 'star', tl('별'), 'rare', { icon: '⭐' }],
  ['flag', 'pirate', tl('해적 깃발'), 'rare', { icon: '🏴‍☠️' }],
  ['flag', 'balloon', tl('풍선'), 'rare', { icon: '🎈' }],
  ['flag', 'trophy', tl('트로피'), 'epic', { icon: '🏆' }],
  ['flag', 'fire', tl('불꽃'), 'epic', { icon: '🔥' }],
  ['flag', 'crown', tl('왕관'), 'legend', { icon: '👑' }],
];
const CS = [
  ['brick', 'pink', tl('핑크 벽돌'), 'common', { colors: ['#ffb0c8', '#ff8ab0', '#ffd0e0'] }],
  ['flag', 'heart', tl('하트 깃발'), 'common', { icon: '❤️' }],
  ['bg', 'heart', tl('하트 하늘'), 'common', { sky: `${stars('#ff8ab0')},linear-gradient(#ffc8dc,#e8d8ff)`, grass: grass('#b8e0a0', '#88c070') }],
  ['flag', 'bouquet', tl('꽃다발'), 'common', { icon: '💐' }],
  ['brick', 'ribbon', tl('리본 벽돌'), 'rare', { colors: ['#ff6a8a', '#ffffff', '#ff6a8a'] }],
  ['bg', 'fireworks', tl('불꽃놀이'), 'rare', { sky: `${stars('#ff6ab0')},${stars('#ffe14d')},linear-gradient(#120a2a,#3a1a5a)`, grass: grass('#2f4a2a', '#223820') }],
  ['flag', 'letter', tl('러브레터'), 'rare', { icon: '💌' }],
  ['brick', 'gold', tl('커플 금벽돌'), 'epic', { colors: ['#f2c230', '#ffd86a', '#fff0a0'] }],
  ['bg', 'meteor', tl('별똥별'), 'epic', { sky: `${stars()},linear-gradient(160deg,transparent 30%,#fff8 31%,transparent 33%),linear-gradient(#0a1030,#2a2060)`, grass: grass('#2f4a2a', '#223820') }],
  ['flag', 'ring', tl('반지'), 'legend', { icon: '💍' }],
];
export const SKINS = [
  ...C.flatMap(([cls, vs]) => vs.map(([v, name, tier, pal]) => ({ id: `char-${cls}-${v}`, kind: 'char', cls, name, tier, pal }))),
  ...S.map(([kind, v, name, tier, x]) => ({ id: `${kind}-${v}`, kind, name, tier, ...x })),
  ...CS.map(([kind, v, name, tier, x]) => ({ id: `couple-${kind}-${v}`, kind, name, tier, couple: true, ...x })),
];

export const ITEMS = new Map([...MONSTERS, ...SKINS].map((x) => [x.id, x]));
// Brick colors never drop from boxes (도균님, 2026-09-28); ones already pulled stay wearable.
export const POOL = [...MONSTERS, ...SKINS.filter((s) => !s.couple && s.kind !== 'brick')];
export const COUPLE_POOL = SKINS.filter((s) => s.couple && s.kind !== 'brick');
export const KIND_NAME = { char: tl('캐릭터 색'), bg: tl('배경'), brick: tl('벽돌'), flag: tl('깃발') };

// Pet food. Each monster base likes one of apple/meat/fish and hates the next one, rotating by the base's order in M,
// so tastes spread evenly. Everyone likes cake (pet.js tasteOf).
export const FOODS = [
  { id: 'apple', icon: '🍎', name: tl('사과') },
  { id: 'meat', icon: '🍖', name: tl('고기') },
  { id: 'fish', icon: '🐟', name: tl('물고기') },
  { id: 'cake', icon: '🍰', name: tl('케이크') },
];
const PLAIN = ['apple', 'meat', 'fish'];
export const TASTES = Object.fromEntries(M.map(([base], i) => [base, { like: PLAIN[i % 3], hate: PLAIN[(i + 1) % 3] }]));

// Battles (spec: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md). Element skills are power 50.
export const ELEMENTS = {
  fire: { icon: '🔥', name: tl('불'), skill: tl('불꽃 발사') }, water: { icon: '💧', name: tl('물'), skill: tl('물대포') },
  grass: { icon: '🌿', name: tl('풀'), skill: tl('잎날 가르기') }, earth: { icon: '🪨', name: tl('땅'), skill: tl('돌 던지기') },
  ice: { icon: '❄️', name: tl('얼음'), skill: tl('얼음 화살') }, dark: { icon: '🌙', name: tl('어둠'), skill: tl('그림자 할퀴기') },
  light: { icon: '✨', name: tl('빛'), skill: tl('빛의 화살') },
};
export const BEATS = {
  fire: ['grass', 'ice'], water: ['fire', 'earth'], grass: ['water', 'earth'], earth: ['fire', 'ice'],
  ice: ['grass', 'water'], dark: ['light'], light: ['dark'],
};
// Element per monster, in each species' variant order in M (mostly by color).
const EL = {
  snail: 'grass water fire earth', mushroom: 'fire grass water light', slime: 'grass water light dark',
  chick: 'light ice earth grass', bunny: 'ice light earth dark', pig: 'light earth earth dark',
  frog: 'grass water fire light', stump: 'earth light dark grass', bee: 'light fire grass water',
  cat: 'fire dark ice earth', octopus: 'fire light dark water', crab: 'fire earth water grass', turtle: 'grass water',
  bat: 'dark dark fire earth', ghost: 'dark ice fire light', penguin: 'water ice earth light', fox: 'fire ice dark light',
  cactus: 'grass light water earth', pumpkin: 'fire grass dark dark', owl: 'earth ice dark', snowman: 'ice fire water',
  skeleton: 'dark dark light', golem: 'earth ice fire', bear: 'earth grass ice', wolf: 'earth dark ice',
  knight: 'earth fire dark', dragon: 'fire', phoenix: 'fire', unicorn: 'light', kingslime: 'light', kraken: 'water',
};
export const ELEMENT = Object.fromEntries(M.flatMap(([base, , vs]) => vs.map(([v], i) => [`${base}-${v}`, EL[base].split(' ')[i]])));
// strong: the stat ×1.25 (null = balanced, all ×1.08). sig: the signature skill, neutral element.
// Skill fields: power, acc (%), hits, drain (heal half the damage), heal (share of max HP), once, stun (chance),
// first (moves first), self / foe: stat stage changes {atk | def: n}.
const sig = (name, power, acc, x = {}) => ({ name, power, acc, ...x });
export const SPECIES = {
  snail: { strong: 'def', sig: sig(tl('껍질 숨기'), 0, 100, { self: { def: 1 } }) },
  mushroom: { strong: 'hp', sig: sig(tl('포자 뿌리기'), 0, 90, { foe: { atk: -1 } }) },
  slime: { strong: 'hp', sig: sig(tl('말랑 흡수'), 40, 95, { drain: true }) },
  chick: { strong: 'spd', sig: sig(tl('삐약 응원'), 0, 100, { self: { atk: 1 } }) },
  bunny: { strong: 'spd', sig: sig(tl('깡충 발차기'), 40, 95, { first: true }) },
  pig: { strong: 'atk', sig: sig(tl('몸통 박치기'), 70, 85) },
  frog: { strong: null, sig: sig(tl('혀 채찍'), 45, 100) },
  stump: { strong: 'def', sig: sig(tl('뿌리 내리기'), 0, 100, { heal: 0.35 }) },
  bee: { strong: 'spd', sig: sig(tl('윙윙 돌진'), 40, 95, { first: true }) },
  cat: { strong: 'spd', sig: sig(tl('냥냥 펀치'), 25, 95, { hits: 2 }) },
  octopus: { strong: 'hp', sig: sig(tl('먹물 뿌리기'), 0, 90, { foe: { atk: -1 } }) },
  crab: { strong: 'def', sig: sig(tl('집게 가위'), 30, 90, { hits: 2 }) },
  turtle: { strong: 'def', sig: sig(tl('등껍질 방패'), 0, 100, { self: { def: 1 } }) },
  bat: { strong: 'spd', sig: sig(tl('흡혈'), 45, 95, { drain: true }) },
  ghost: { strong: null, sig: sig(tl('깜짝 놀래키기'), 30, 95, { stun: 0.3 }) },
  penguin: { strong: 'spd', sig: sig(tl('배 미끄럼'), 45, 95, { first: true }) },
  fox: { strong: 'spd', sig: sig(tl('여우 홀리기'), 35, 95, { stun: 0.25 }) },
  cactus: { strong: 'def', sig: sig(tl('가시 갑옷'), 0, 100, { self: { def: 1 } }) },
  pumpkin: { strong: 'atk', sig: sig(tl('호박 폭탄'), 70, 85) },
  owl: { strong: null, sig: sig(tl('날카로운 눈'), 0, 100, { self: { atk: 1 } }) },
  snowman: { strong: 'hp', sig: sig(tl('눈덩이 굴리기'), 45, 90, { stun: 0.2 }) },
  skeleton: { strong: 'atk', sig: sig(tl('뼈다귀 던지기'), 30, 90, { hits: 2 }) },
  golem: { strong: 'def', sig: sig(tl('바위 굳히기'), 0, 100, { self: { def: 2 } }) },
  bear: { strong: 'atk', sig: sig(tl('곰 펀치'), 75, 85) },
  wolf: { strong: 'atk', sig: sig(tl('울부짖기'), 0, 100, { self: { atk: 1 } }) },
  knight: { strong: 'def', sig: sig(tl('방패 돌진'), 45, 95, { self: { def: 1 } }) },
  dragon: { strong: 'atk', sig: sig(tl('드래곤 브레스'), 90, 85) },
  phoenix: { strong: null, sig: sig(tl('불사의 날개'), 0, 100, { heal: 0.5, once: true }) },
  unicorn: { strong: null, sig: sig(tl('무지개 뿔'), 50, 95, { drain: true }) },
  kingslime: { strong: 'hp', sig: sig(tl('왕의 명령'), 20, 100, { stun: 0.5 }) },
  kraken: { strong: 'hp', sig: sig(tl('촉수 조이기'), 50, 90, { stun: 0.3 }) },
};

// Room shop (spec: docs/superpowers/specs/2026-09-29-encounters-shop-design.md). Coins are derived (shop.js).
// Furniture sits in the playroom's fixed slots; act = what the pet does there: [face, motion, bubble, word].
export const FURNITURE = [
  { id: 'cushion', icon: '🛋️', name: tl('쿠션'), price: 30, act: ['sleepy', 'sway', 'zzz', tl('쿨쿨')] },
  { id: 'bowl', icon: '🥣', name: tl('밥그릇'), price: 20, act: ['yum', 'chew', null, tl('냠냠')] },
  { id: 'rug', icon: '🧶', name: tl('러그'), price: 25, act: ['joy', 'wiggle', 'heart', tl('뒹굴뒹굴')] },
  { id: 'pond', icon: '⛲', name: tl('연못'), price: 60, act: ['excited', 'jump', null, tl('첨벙!')] },
  { id: 'flower', icon: '🌷', name: tl('화분'), price: 15, act: ['shy', 'wiggle', 'heart', tl('킁킁')] },
  { id: 'lamp', icon: '🏮', name: tl('등불'), price: 25, act: ['surprised', 'hop', 'bang', tl('반짝!')] },
  { id: 'toybox', icon: '🧸', name: tl('장난감 상자'), price: 40, act: ['excited', 'bounce', 'heart', tl('신난다')] },
  { id: 'tree', icon: '🌳', name: tl('나무'), price: 35, act: ['sleepy', 'sway', 'zzz', tl('그늘 좋아')] },
  { id: 'swing', icon: '🎠', name: tl('회전목마'), price: 80, act: ['joy', 'spin', 'heart', tl('빙글빙글')] },
  { id: 'campfire', icon: '🔥', name: tl('모닥불'), price: 50, act: ['joy', 'sway', null, tl('따뜻해')] },
];
export const BUILDINGS = [
  { id: 'house', icon: '🏠', name: tl('펫 집'), price: 100 },
  { id: 'tent', icon: '⛺', name: tl('텐트'), price: 60 },
  { id: 'windmill', icon: '🌬️', name: tl('풍차'), price: 150 },
  { id: 'lighthouse', icon: '🗼', name: tl('등대'), price: 200 },
  { id: 'castle', icon: '🏰', name: tl('작은 성'), price: 300 },
];
// ground: the field's grass; deco: small things scattered on it.
export const THEMES = [
  { id: 'spring', icon: '🌸', name: tl('봄'), price: 80, ground: 'linear-gradient(#b8e0a0,#88c070)', deco: '🌸' },
  { id: 'summer', icon: '🏖️', name: tl('여름'), price: 80, ground: 'linear-gradient(#f2dca0,#e0c078)', deco: '🐚' },
  { id: 'autumn', icon: '🍁', name: tl('가을'), price: 80, ground: 'linear-gradient(#d09040,#a06a28)', deco: '🍁' },
  { id: 'winter', icon: '☃️', name: tl('겨울'), price: 80, ground: 'linear-gradient(#f4f8fc,#d8e4f0)', deco: '❄️' },
];
export const SHOP = new Map([...FURNITURE.map((x) => [x.id, { ...x, kind: 'furniture' }]),
  ...BUILDINGS.map((x) => [x.id, { ...x, kind: 'building' }]), ...THEMES.map((x) => [x.id, { ...x, kind: 'theme' }])]);

// Pet accessories: open the first time any pet reaches the level (pet.js accsUnlocked). Art in ui/monsters.js.
export const ACCESSORIES = [
  { id: 'ribbon', name: tl('리본'), level: 3 },
  { id: 'hat', name: tl('모자'), level: 6 },
  { id: 'crown', name: tl('왕관'), level: 9 },
];

export const TITLES = [
  { id: 'first', name: tl('첫 벽돌'), desc: tl('첫 인증') },
  { id: 'week', name: tl('일주일 개근'), desc: tl('7일 연속 인증') },
  { id: 'tower', name: tl('건축가'), desc: tl('탑 1개 완성') },
  { id: 'towers3', name: tl('마천루 장인'), desc: tl('탑 3개 완성') },
  { id: 'straight', name: tl('정면돌파'), desc: tl('방어권 없이 30층') },
  { id: 'days100', name: tl('백일의 기적'), desc: tl('누적 인증 100일') },
  { id: 'comeback', name: tl('오뚝이'), desc: tl('무너진 뒤 다시 7층') },
  { id: 'shiny', name: tl('반짝이 사냥꾼'), desc: tl('이로치 몬스터 획득') },
  { id: 'legend', name: tl('전설의 시작'), desc: tl('전설 등급 획득') },
  { id: 'dex50', name: tl('수집가'), desc: tl('몬스터 50종 모으기') },
  { id: 'dex100', name: tl('몬스터 박사'), desc: tl('몬스터 100종 모으기') },
  { id: 'couple', name: tl('환상의 짝꿍'), desc: tl('커플 탑 완성') },
];

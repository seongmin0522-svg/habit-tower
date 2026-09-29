// Pet battles: stats, skills, one turn, the opponent's choice. Pure: randomness comes in as rng() -> [0, 1).
// Spec: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md
import { ITEMS, ELEMENT, ELEMENTS, BEATS, SPECIES, MONSTERS } from './catalog.js';
import { roll } from './logic.js';

const RARITY = { common: 1, rare: 1.15, epic: 1.3, legend: 1.5 };
const BASE = { hp: 60, atk: 20, def: 15, spd: 15 };
export const ELEMENT_POWER = 50, ELEMENT_ACC = 95;
const STAGE_MAX = 2, CRIT = 1 / 16;

// Damage multiplier of an attack element on a defender element.
export const mult = (atk, def) => (!atk ? 1 : BEATS[atk].includes(def) ? 1.5 : BEATS[def]?.includes(atk) ? 0.7 : 1);

export function statsOf(id, level) {
  const m = ITEMS.get(id), strong = SPECIES[m.base].strong, g = 1 + 0.08 * (level - 1);
  const k = (s) => (strong === s ? 1.25 : strong ? 1 : 1.08);
  return Object.fromEntries(Object.entries(BASE).map(([s, b]) => [s, Math.round(b * RARITY[m.tier] * g * k(s))]));
}

// [element skill, signature]. Every skill: {name, element, power, acc, ...effects} (catalog.js SPECIES).
export function skillsOf(id) {
  const el = ELEMENT[id];
  return [
    { name: ELEMENTS[el].skill, element: el, power: ELEMENT_POWER, acc: ELEMENT_ACC },
    { ...SPECIES[ITEMS.get(id).base].sig, element: null },
  ];
}

// One side of a battle.
export function fighter(id, level, shiny = false) {
  const s = statsOf(id, level);
  return { id, level, shiny, el: ELEMENT[id], ...s, max: s.hp, atkSt: 0, defSt: 0, stun: false, healed: false, skills: skillsOf(id) };
}
export const start = (me, foe) => ({ me, foe, over: null });

const stage = (n) => (n >= 0 ? 1.25 ** n : 0.8 ** -n);
const clampSt = (n) => Math.max(-STAGE_MAX, Math.min(STAGE_MAX, n));

// Stage changes {atk | def: n} on side `s`; events record how far each actually moved.
function shift(who, s, changes, ev) {
  for (const [stat, n] of Object.entries(changes)) {
    const key = stat + 'St', next = clampSt(s[key] + n);
    ev.push({ who, type: 'stat', side: s.side, stat, by: next - s[key] });
    s[key] = next;
  }
}

function act(who, a, d, k, rng, ev) {
  ev.push({ who, type: 'use', skill: k.name, element: k.element });
  if (k.heal) {
    if (k.once && a.healed) { ev.push({ who, type: 'fail' }); return; }
    a.healed = true;
    const n = Math.min(a.max - a.hp, Math.round(a.max * k.heal));
    a.hp += n;
    ev.push({ who, type: 'heal', n });
    return;
  }
  if (rng() * 100 >= k.acc) { ev.push({ who, type: 'miss' }); return; }
  let dealt = 0;
  if (k.power) {
    const m = mult(k.element, d.el);
    for (let i = 0; i < (k.hits ?? 1) && d.hp > 0; i++) {
      const crit = rng() < CRIT;
      const n = Math.max(1, Math.round(k.power * ((a.atk * stage(a.atkSt)) / (d.def * stage(d.defSt))) * 0.25 * m
        * (0.85 + 0.15 * rng()) * (crit ? 1.5 : 1)));
      d.hp = Math.max(0, d.hp - n);
      dealt += n;
      ev.push({ who, type: 'hit', n, crit, mult: m });
    }
  }
  if (k.drain && dealt) {
    const n = Math.min(a.max - a.hp, Math.round(dealt / 2));
    a.hp += n;
    ev.push({ who, type: 'heal', n });
  }
  if (k.self) shift(who, a, k.self, ev);
  if (k.foe && d.hp > 0) shift(who, d, k.foe, ev);
  if (k.stun && d.hp > 0 && rng() < k.stun) { d.stun = true; ev.push({ who, type: 'stun' }); }
}

// Both sides act once: a "first" skill goes first, else the faster side (a tie goes to me).
// Returns the next state and the events to replay: use, miss, hit {n, crit, mult}, heal {n}, stat {stat, by},
// stun (who stunned the other), stunned (who lost the turn), fail.
export function turn(state, myPick, foePick, rng) {
  const me = { ...state.me, side: 'me' }, foe = { ...state.foe, side: 'foe' }, ev = [];
  const mk = me.skills[myPick], fk = foe.skills[foePick];
  const meFirst = mk.first !== fk.first ? !!mk.first : me.spd >= foe.spd;
  const order = meFirst ? [['me', me, foe, mk], ['foe', foe, me, fk]] : [['foe', foe, me, fk], ['me', me, foe, mk]];
  for (const [who, a, d, k] of order) {
    if (a.hp <= 0 || d.hp <= 0) break;
    if (a.stun) { a.stun = false; ev.push({ who, type: 'stunned' }); continue; }
    act(who, a, d, k, rng, ev);
  }
  delete me.side; delete foe.side;
  return { state: { me, foe, over: me.hp <= 0 ? 'lose' : foe.hp <= 0 ? 'win' : null }, events: ev };
}

// The AI's skill for `side`: heal when under 40% HP (if it still can), else the stronger expected hit
// (buffs count as 30); a random pick 20% of the time.
export function aiPick(state, rng, side = 'foe') {
  const a = state[side], d = state[side === 'foe' ? 'me' : 'foe'];
  if (rng() < 0.2) return rng() < 0.5 ? 0 : 1;
  const worth = (k) => (k.heal ? (a.hp < 0.4 * a.max && !(k.once && a.healed) ? 999 : 0)
    : k.power ? k.power * (k.hits ?? 1) * (k.acc / 100) * mult(k.element, d.el) : 30);
  return worth(a.skills[0]) >= worth(a.skills[1]) ? 0 : 1;
}

// rows: battles between me and my partner {challenger, defender, winner, at}. seen: when I last looked (ISO or '').
// fresh: my partner's challenges to me since then, newest first, with whether I won.
export function battleRecord(rows, me, partner, seen = '') {
  const ours = rows.filter((r) => [r.challenger, r.defender].includes(partner));
  return {
    win: ours.filter((r) => r.winner === me).length,
    lose: ours.filter((r) => r.winner === partner).length,
    fresh: ours.filter((r) => r.defender === me && r.at > seen).sort((a, b) => b.at.localeCompare(a.at))
      .map((r) => ({ at: r.at, won: r.winner === me })),
  };
}

// A wild maze monster: tier by the box odds, shiny like boxes, level within 1 of mine. r: four numbers in [0, 1).
export function wildRoll([r1, r2, r3, r4], myLevel) {
  const { item, shiny } = roll(MONSTERS, [r1, r2, r3]);
  return { id: item.id, shiny, level: Math.max(1, Math.min(10, myLevel + Math.floor(r4 * 3) - 1)) };
}

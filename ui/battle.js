// Pet battle screen: pick an opponent, then take turns (spec: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md).
// The rules are battle.js; this replays each turn's events one by one with a little animation.
import { html, useState, useRef, useEffect } from './h.js';
import { Monster } from './monsters.js';
import { ITEMS, MONSTERS, ELEMENTS } from '../catalog.js';
import { fighter, start, turn, aiPick } from '../battle.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';

const STEP_MS = 650;
const LEVELS = [['쉬움', -2], ['보통', 0], ['어려움', 2]];
const STAT = { atk: '공격', def: '방어' };
const clampLv = (n) => Math.max(1, Math.min(10, n));
const nameOf = (id) => ITEMS.get(id)?.name ?? '펫';
// A skill's one-line effect for its button.
function effectText(k) {
  const parts = [];
  if (k.power) parts.push(`위력 ${k.power}${k.hits ? `×${k.hits}` : ''}`);
  if (k.first) parts.push('선공');
  if (k.drain) parts.push('흡수');
  if (k.heal) parts.push(`회복 ${k.heal * 100}%${k.once ? ' 1회' : ''}`);
  if (k.stun) parts.push(`기절 ${k.stun * 100}%`);
  for (const [s, n] of Object.entries(k.self ?? {})) parts.push(`내 ${STAT[s]}↑${n > 1 ? n : ''}`);
  for (const [s] of Object.entries(k.foe ?? {})) parts.push(`상대 ${STAT[s]}↓`);
  return parts.join(' · ');
}

// me: {id, shiny, acc, level}. partner: null | {name, pet: {id, shiny, acc, level}, record: {win, lose}}.
// onRecord(won, vs): saves the result; resolves to {counted, left}.
export function Battle({ me, partner, onRecord, onClose }) {
  const [phase, setPhase] = useState('pick'); // pick | fight | end
  const [st, setSt] = useState(null);         // battle.js state after the last full turn
  const [shown, setShown] = useState(null);   // {me: hp, foe: hp} while events replay
  const [line, setLine] = useState('');
  const [fx, setFx] = useState(null);         // {who, kind: 'lunge'|'hurt', n, crit, icon, key}
  const [faces, setFaces] = useState({ me: null, foe: null });
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState(null);       // {won, text}
  const foeInfo = useRef(null);               // {id, shiny, acc, label, vs}
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const begin = (foe) => {
    foeInfo.current = foe;
    const s = start(fighter(me.id, me.level, me.shiny), fighter(foe.id, foe.level, foe.shiny));
    setSt(s); setShown({ me: s.me.hp, foe: s.foe.hp });
    setFaces({ me: null, foe: null }); setEnd(null); setFx(null);
    setLine(`${foe.label}의 ${nameOf(foe.id)} Lv ${foe.level}이(가) 나타났다!`);
    setPhase('fight');
    sfx('tap');
  };
  const cpu = (dLv) => {
    const pool = MONSTERS.filter((m) => m.id !== me.id);
    const m = pool[Math.floor(Math.random() * pool.length)];
    begin({ id: m.id, shiny: Math.random() < 0.03, acc: null, level: clampLv(me.level + dLv), label: 'CPU', vs: 'cpu' });
  };

  const face = (who, f) => setFaces((x) => ({ ...x, [who]: f }));
  const other = (who) => (who === 'me' ? 'foe' : 'me');
  const nm = (who) => (who === 'me' ? nameOf(me.id) : nameOf(foeInfo.current.id));

  // Replay a turn's events, then settle on the new state.
  const play = (r) => {
    let hp = { me: st.me.hp, foe: st.foe.hp }, t = 0, el = null; // el: the element of the skill being used
    const at = (f) => { timers.current.push(setTimeout(f, t)); t += STEP_MS; };
    for (const e of r.events) {
      at(() => {
        const tgt = other(e.who);
        if (e.type === 'use') {
          el = e.element;
          setLine(`${nm(e.who)}의 ${e.skill}!`);
          setFx({ who: e.who, kind: 'lunge', key: Math.random() });
          sfx('shake');
        } else if (e.type === 'hit') {
          hp = { ...hp, [tgt]: Math.max(0, hp[tgt] - e.n) };
          setShown({ ...hp });
          setFx({ who: tgt, kind: 'hurt', n: e.n, crit: e.crit, icon: el && ELEMENTS[el].icon, key: Math.random() });
          setLine(e.crit ? '급소에 맞았다!' : e.mult > 1 ? '효과가 굉장했다!' : e.mult < 1 ? '효과가 별로다…' : `${e.n} 피해!`);
          face(tgt, e.crit ? 'surprised' : Math.random() < 0.5 ? 'sad' : 'angry');
          buzz(e.crit ? 'rare' : 'tap');
        } else if (e.type === 'heal') {
          hp = { ...hp, [e.who]: hp[e.who] + e.n };
          setShown({ ...hp });
          setLine(`${nm(e.who)}의 체력이 ${e.n} 회복됐다!`);
          face(e.who, 'joy');
        } else if (e.type === 'stat') {
          const whose = e.side === e.who ? e.who : tgt;
          setLine(e.by ? `${nm(whose)}의 ${STAT[e.stat]}이(가) ${e.by > 0 ? '올라갔다' : '떨어졌다'}!` : `${nm(whose)}의 ${STAT[e.stat]}은(는) 더 변하지 않는다`);
          if (e.by > 0) face(whose, 'excited');
        } else if (e.type === 'miss') setLine('빗나갔다!');
        else if (e.type === 'stun') { setLine(`${nm(tgt)}이(가) 기절했다 💫`); face(tgt, 'sleepy'); }
        else if (e.type === 'stunned') setLine(`${nm(e.who)}은(는) 기절해서 움직일 수 없다! 💫`);
        else if (e.type === 'fail') setLine('힘이 남지 않았다…');
      });
    }
    at(() => {
      setSt(r.state);
      setShown({ me: r.state.me.hp, foe: r.state.foe.hp });
      setFx(null);
      setFaces({ me: r.state.me.stun ? 'sleepy' : null, foe: r.state.foe.stun ? 'sleepy' : null });
      if (!r.state.over) { setBusy(false); return; }
      const won = r.state.over === 'win';
      setFaces(won ? { me: 'excited', foe: 'sad' } : { me: 'sad', foe: 'excited' });
      sfx(won ? 'legend' : 'common'); buzz(won ? 'epic' : 'glow');
      setEnd({ won, text: won ? '승리!' : '패배…' });
      setPhase('end');
      setBusy(false);
      onRecord(won, foeInfo.current.vs).then(
        ({ counted, left }) => setEnd({ won, text: won ? '승리!' : '패배…', note: counted ? `${won ? '⚔️ +1 · ' : ''}오늘 남은 기록 ${left}판` : '오늘 기록은 끝났어요 (연습 경기)' }),
        () => {},
      );
    });
  };

  const pick = (i) => {
    if (busy || !st || st.over) return;
    setBusy(true);
    play(turn(st, i, aiPick(st, Math.random), Math.random));
  };

  const pet = (who, info, lv) => {
    const s = st?.[who], hp = shown?.[who] ?? 0, el = ELEMENTS[s?.el];
    const f = fx?.who === who ? fx : null;
    return html`<div class=${'bt-side bt-' + who}>
      <div class="bt-card"><b>${who === 'foe' ? `${info.label} ` : ''}${nameOf(info.id)}</b> <span>Lv ${lv} ${el?.icon ?? ''}</span>
        <i class="bt-hp"><i style=${{ width: `${(hp / (s?.max || 1)) * 100}%` }} class=${hp / (s?.max || 1) < 0.3 ? 'low' : ''} /></i>
        <small>${hp}/${s?.max}</small></div>
      <span class=${'bt-pet' + (f ? ' ' + f.kind : '') + (info.shiny ? ' sparkle' : '')} key=${f?.key ?? who}>
        <${Monster} id=${info.id} shiny=${info.shiny} px=${who === 'me' ? 7 : 5} face=${faces[who]} acc=${info.acc} /></span>
      ${f?.kind === 'hurt' && html`<span class=${'bt-dmg' + (f.crit ? ' crit' : '')} key=${'d' + f.key}>-${f.n}${f.icon ? ' ' + f.icon : ''}</span>`}
    </div>`;
  };

  const foe = foeInfo.current;
  return html`<div class="battle" role="dialog" aria-label="펫 대결">
    <div class="pr-top"><b>⚔️ 대결</b><button class="x" onClick=${onClose} aria-label="닫기">✕</button></div>
    ${phase === 'pick' ? html`<div class="bt-pick">
      <p>${nameOf(me.id)} Lv ${me.level}로 누구와 싸울까요?</p>
      <div class="bt-row">${LEVELS.map(([label, d]) => html`<button key=${label} class="btn blue" onClick=${() => cpu(d)}>🤖 ${label}<br /><small>Lv ${clampLv(me.level + d)}</small></button>`)}</div>
      ${partner && html`<button class="btn green bt-partner" onClick=${() => begin({ ...partner.pet, label: partner.name, vs: 'partner' })}>
        💞 ${partner.name}의 ${nameOf(partner.pet.id)} Lv ${partner.pet.level}<br /><small>전적 ${partner.record.win}승 ${partner.record.lose}패</small></button>`}
    </div>` : html`<div class="bt-field">
      ${pet('foe', foe, foe.level)}
      ${pet('me', me, me.level)}
    </div>
    <p class="bt-line" aria-live="polite">${line}</p>
    ${phase === 'fight' ? html`<div class="bt-skills">${st.me.skills.map((k, i) => html`<button key=${i} class="btn blue" disabled=${busy} onClick=${() => pick(i)}>
      <b>${k.element ? ELEMENTS[k.element].icon : '무'} ${k.name}</b><small>${effectText(k)}</small></button>`)}</div>`
    : html`<div class="bt-end"><b class=${end?.won ? 'win' : 'lose'}>${end?.text}</b>${end?.note && html`<small>${end.note}</small>`}
      <div class="bt-row"><button class="btn green" onClick=${() => (foe.vs === 'cpu' ? setPhase('pick') : begin(foe))}>다시</button>
        <button class="btn blue" onClick=${onClose}>닫기</button></div></div>`}`}
  </div>`;
}

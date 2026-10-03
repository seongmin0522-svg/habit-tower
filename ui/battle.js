// Pet battle screen: pick an opponent, then take turns (spec: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md,
// effects: docs/superpowers/specs/2026-09-29-encounters-shop-design.md). The rules are battle.js; this replays each
// turn's events one by one with effects: projectiles per element, impacts, screen shake, HP afterimage, stat arrows,
// heal sparkles, stun stars, entry and faint.
import { html, useState, useRef, useEffect } from './h.js';
import { Monster } from './monsters.js';
import { Arena3D } from './arena3d.js';
import { ITEMS, MONSTERS, ELEMENTS } from '../catalog.js';
import { fighter, start, turn, aiPick } from '../battle.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';
import { tl } from '../i18n.js';

const STEP_MS = 700;
const LEVELS = [[tl('쉬움'), -2], [tl('보통'), 0], [tl('어려움'), 2]];
const STAT = { atk: tl('공격'), def: tl('방어') };
const SHOT = { fire: '🔥', water: '💧', grass: '🍃', earth: '🪨', ice: '❄️', dark: '🌑', light: '✨' }; // element projectiles
const clampLv = (n) => Math.max(1, Math.min(10, n));
const nameOf = (id) => ITEMS.get(id)?.name ?? tl('펫');
// A skill's one-line effect for its button.
function effectText(k) {
  const parts = [];
  const hits = k.hits ? `×${k.hits}` : '';
  if (k.power) parts.push(tl`위력 ${k.power}${hits}`);
  if (k.first) parts.push(tl('선공'));
  if (k.drain) parts.push(tl('흡수'));
  if (k.heal) parts.push(k.once ? tl`회복 ${k.heal * 100}% 1회` : tl`회복 ${k.heal * 100}%`);
  if (k.stun) parts.push(tl`기절 ${k.stun * 100}%`);
  for (const [s, n] of Object.entries(k.self ?? {})) parts.push(tl`내 ${STAT[s]}↑${n > 1 ? n : ''}`);
  for (const [s] of Object.entries(k.foe ?? {})) parts.push(tl`상대 ${STAT[s]}↓`);
  return parts.join(' · ');
}

// me: {id, shiny, acc, level}. partner: null | {name, pet: {id, shiny, acc, level}, record: {win, lose, fresh}},
// fresh = their challenges to me since I last looked. onSeen(at): I've seen up to `at`.
// wild: null | {id, shiny, level} — a maze encounter: no picker, a run-away button, onFlee().
// onRecord(won, vs): saves the result; resolves to {counted, left, admin, note}.
// solid: the field in 3D (ui/arena3d.js); the 2D pets stay as invisible boxes the 3D ones stand in.
export function Battle({ me, partner, wild, onRecord, onSeen, onFlee, onClose, solid }) {
  const [phase, setPhase] = useState('pick'); // pick | fight | end
  const [st, setSt] = useState(null);         // battle.js state after the last full turn
  const [shown, setShown] = useState(null);   // {me: hp, foe: hp} while events replay
  const [line, setLine] = useState('');
  const [fxs, setFxs] = useState([]);         // passing effects: {id, kind, who?, icon, cls, x0, y0, x1, y1, n, crit}
  const [faces, setFaces] = useState({ me: null, foe: null });
  const [stars, setStars] = useState({ me: false, foe: false });
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState(null);       // {won, text, note}
  const [round, setRound] = useState(0);      // bumps per battle: replays the entry animation
  const foeInfo = useRef(null);               // {id, shiny, acc, level, label, vs}
  const timers = useRef([]), field = useRef(), pets = { me: useRef(), foe: useRef() };
  const arena = useRef(null), [shown3d, setShown3d] = useState(false), [flat, setFlat] = useState(!solid);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const fresh = useRef(partner?.record.fresh ?? []); // kept for this visit after it's marked seen
  useEffect(() => {
    if (fresh.current.length) onSeen(fresh.current[0].at);
    if (wild) begin({ ...wild, acc: null, label: tl('야생'), vs: 'wild' });
  }, []);
  const later = (f, ms) => timers.current.push(setTimeout(f, ms));

  const begin = (foe) => {
    foeInfo.current = foe;
    const s = start(fighter(me.id, me.level, me.shiny), fighter(foe.id, foe.level, foe.shiny));
    setSt(s); setShown({ me: s.me.hp, foe: s.foe.hp });
    setFaces({ me: null, foe: null }); setStars({ me: false, foe: false }); setEnd(null); setFxs([]);
    setRound((r) => r + 1);
    setLine(foe.vs === 'wild' ? tl`앗! 야생 ${nameOf(foe.id)} Lv ${foe.level}이(가) 튀어나왔다!` : tl`${foe.label}의 ${nameOf(foe.id)} Lv ${foe.level}이(가) 나타났다!`);
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
  const addFx = (f, ms = 900) => {
    const id = Math.random();
    setFxs((x) => [...x, { ...f, id }]);
    later(() => setFxs((x) => x.filter((y) => y.id !== id)), ms);
  };
  // Center of a pet in field pixels.
  const center = (who) => {
    const f = field.current?.getBoundingClientRect(), p = pets[who].current?.getBoundingClientRect();
    return f && p ? [p.left - f.left + p.width / 2, p.top - f.top + p.height / 2] : [0, 0];
  };
  const shot = (from, to, icon, cls) => {
    if (arena.current) return arena.current.shot(from, to, icon);
    const [x0, y0] = center(from), [x1, y1] = center(to);
    addFx({ kind: 'shot', icon, cls, x0, y0, x1, y1 }, 700);
  };

  // Replay a turn's events, then settle on the new state.
  const play = (r) => {
    let hp = { me: st.me.hp, foe: st.foe.hp }, t = 0, el = null, last = null; // el: the element of the skill in use
    const at = (f) => { later(f, t); t += STEP_MS; };
    for (const e of r.events) {
      at(() => {
        const tgt = other(e.who), max = st[tgt].max;
        if (e.type === 'use') {
          el = e.element;
          setLine(tl`${nm(e.who)}의 ${e.skill}!`);
          addFx({ kind: 'lunge', who: e.who }, 400);
          const k = st[e.who].skills.find((s) => s.name === e.skill);
          if (k?.first) addFx({ kind: 'mark', who: e.who, icon: '💨', cls: 'wind' }, 700);
          if (el) later(() => shot(e.who, tgt, SHOT[el], 'el-' + el), 150);
          sfx('shake');
        } else if (e.type === 'hit') {
          hp = { ...hp, [tgt]: Math.max(0, hp[tgt] - e.n) };
          setShown({ ...hp });
          addFx({ kind: 'hurt', who: tgt, n: e.n, crit: e.crit, icon: el ? SHOT[el] : '💥' }, 900);
          if (e.crit || e.n >= max * 0.3) field.current?.animate([{ transform: 'none' }, { transform: 'translate(-8px, 4px)' },
            { transform: 'translate(7px, -5px)' }, { transform: 'translate(-4px, 2px)' }, { transform: 'none' }], { duration: 350 });
          setLine(e.crit ? tl('급소에 맞았다!') : e.mult > 1 ? tl('효과가 굉장했다!') : e.mult < 1 ? tl('효과가 별로다…') : tl`${e.n} 피해!`);
          face(tgt, e.crit ? 'surprised' : Math.random() < 0.5 ? 'sad' : 'angry');
          buzz(e.crit ? 'rare' : 'tap');
        } else if (e.type === 'heal') {
          if (last?.type === 'hit' && last.who === e.who) shot(tgt, e.who, '🔴', 'orb'); // drain: life flows back
          hp = { ...hp, [e.who]: hp[e.who] + e.n };
          setShown({ ...hp });
          addFx({ kind: 'mark', who: e.who, icon: '✚', cls: 'heal' }, 900);
          setLine(tl`${nm(e.who)}의 체력이 ${e.n} 회복됐다!`);
          face(e.who, 'joy');
        } else if (e.type === 'stat') {
          const whose = e.side === e.who ? e.who : tgt;
          addFx({ kind: 'mark', who: whose, icon: e.by > 0 ? '⬆' : e.by < 0 ? '⬇' : '➖', cls: e.by > 0 ? 'up' : 'down' }, 900);
          setLine(e.by > 0 ? tl`${nm(whose)}의 ${STAT[e.stat]}이(가) 올라갔다!` : e.by < 0 ? tl`${nm(whose)}의 ${STAT[e.stat]}이(가) 떨어졌다!`
            : tl`${nm(whose)}의 ${STAT[e.stat]}은(는) 더 변하지 않는다`);
          if (e.by > 0) face(whose, 'excited');
        } else if (e.type === 'miss') {
          setLine(tl('빗나갔다!'));
          addFx({ kind: 'mark', who: tgt, icon: 'MISS', cls: 'miss' }, 700);
        } else if (e.type === 'stun') {
          setLine(tl`${nm(tgt)}이(가) 기절했다 💫`); face(tgt, 'sleepy');
          setStars((s) => ({ ...s, [tgt]: true }));
        } else if (e.type === 'stunned') {
          setLine(tl`${nm(e.who)}은(는) 기절해서 움직일 수 없다! 💫`);
          setStars((s) => ({ ...s, [e.who]: false }));
        } else if (e.type === 'fail') setLine(tl('힘이 남지 않았다…'));
        last = e;
      });
    }
    at(() => {
      setSt(r.state);
      setShown({ me: r.state.me.hp, foe: r.state.foe.hp });
      setFaces({ me: r.state.me.stun ? 'sleepy' : null, foe: r.state.foe.stun ? 'sleepy' : null });
      setStars({ me: r.state.me.stun, foe: r.state.foe.stun });
      if (!r.state.over) { setBusy(false); return; }
      const won = r.state.over === 'win', text = won ? tl('승리!') : tl('패배…');
      setFaces(won ? { me: 'excited', foe: 'sad' } : { me: 'sad', foe: 'excited' });
      addFx({ kind: 'faint', who: won ? 'foe' : 'me' }, 60000);
      sfx(won ? 'legend' : 'common'); buzz(won ? 'epic' : 'glow');
      setEnd({ won, text });
      setPhase('end');
      setBusy(false);
      onRecord(won, foeInfo.current.vs).then(
        ({ counted, left, admin, note }) => setEnd({ won, text,
          note: note ?? (admin ? tl('🛠 관리자 모드 · 기록 안 함') : counted ? tl`${won ? '⚔️ +1 · ' : ''}오늘 남은 기록 ${left}판` : tl('오늘 기록은 끝났어요 (연습 경기)')) }),
        () => {},
      );
    });
  };

  const pick = (i) => {
    if (busy || !st || st.over) return;
    setBusy(true);
    play(turn(st, i, aiPick(st, Math.random), Math.random));
  };

  const has = (kind, who) => fxs.filter((f) => f.kind === kind && f.who === who);
  const pet = (who, info, lv) => {
    const s = st?.[who], hp = shown?.[who] ?? 0, el = ELEMENTS[s?.el], share = hp / (s?.max || 1);
    const hurt = has('hurt', who).at(-1), lunge = has('lunge', who).at(-1), faint = has('faint', who).length;
    return html`<div class=${'bt-side bt-' + who} key=${who + round}>
      <div class="bt-card"><b>${who === 'foe' ? `${info.label} ` : ''}${nameOf(info.id)}</b> <span>Lv ${lv} ${el?.icon ?? ''}</span>
        <i class="bt-hp"><i class="lag" style=${{ width: `${share * 100}%` }} /><i style=${{ width: `${share * 100}%` }} class=${share < 0.3 ? 'low' : ''} /></i>
        <small>${hp}/${s?.max}</small></div>
      <span ref=${pets[who]} class=${'bt-pet' + (faint ? ' faint' : hurt ? ' hurt' : lunge ? ' lunge' : '') + (info.shiny ? ' sparkle' : '')}
        key=${(hurt ?? lunge)?.id ?? 'p'}>
        <${Monster} id=${info.id} shiny=${info.shiny} px=${who === 'me' ? 7 : 5} face=${faces[who]} acc=${info.acc} />
        ${stars[who] && html`<i class="bt-stars">💫</i>`}
        ${has('mark', who).map((f) => html`<i key=${f.id} class=${'bt-mark ' + f.cls}>${f.icon}</i>`)}
      </span>
      ${hurt && html`<span class=${'bt-dmg' + (hurt.crit ? ' crit' : '')} key=${'d' + hurt.id}>-${hurt.n}</span>`}
      ${hurt && html`<span class="bt-burst" key=${'b' + hurt.id}>${hurt.icon}</span>`}
    </div>`;
  };

  const foe = foeInfo.current;
  const title = wild ? tl('🌿 야생 몬스터') : tl('⚔️ 대결');
  return html`<div class="battle" role="dialog" aria-label=${title}>
    <div class="pr-top"><b>${title}</b>${!wild && html`<button class="x" onClick=${onClose} aria-label=${tl('닫기')}>✕</button>`}</div>
    ${phase === 'pick' ? !wild && html`<div class="bt-pick">
      <p>${tl`${nameOf(me.id)} Lv ${me.level}로 누구와 싸울까요?`}</p>
      <div class="bt-row">${LEVELS.map(([label, d]) => html`<button key=${label} class="btn blue" onClick=${() => cpu(d)}>🤖 ${label}<br /><small>Lv ${clampLv(me.level + d)}</small></button>`)}</div>
      ${fresh.current.slice(0, 3).map((f) => html`<p key=${f.at} class="bt-news">💞 ${tl`${partner.name}이(가) 도전해 왔어요`} — ${f.won ? tl('내 펫이 이겼어요! 🎉') : tl('내 펫이 졌어요… 복수하러 가요!')}</p>`)}
      ${partner && html`<button class="btn green bt-partner" onClick=${() => begin({ ...partner.pet, label: partner.name, vs: 'partner' })}>
        💞 ${tl`${partner.name}의 ${nameOf(partner.pet.id)} Lv ${partner.pet.level}`}<br /><small>${tl`전적 ${partner.record.win}승 ${partner.record.lose}패`}</small></button>`}
    </div>` : html`<div class=${'bt-field' + (shown3d ? ' solid' : '')} ref=${field}>
      ${!flat && html`<${Arena3D} key=${round} boxes=${pets} api=${arena} onReady=${() => setShown3d(true)} onFail=${() => { setFlat(true); setShown3d(false); }}
        sides=${{ me: { id: me.id, shiny: me.shiny, acc: me.acc, face: faces.me }, foe: foe && { id: foe.id, shiny: foe.shiny, acc: foe.acc, face: faces.foe } }} />`}
      <div class="bt-stage">
      ${pet('foe', foe, foe.level)}
      ${pet('me', me, me.level)}
      ${fxs.filter((f) => f.kind === 'shot').map((f) => html`<i key=${f.id} class=${'bt-shot ' + f.cls}
        style=${{ '--x0': `${f.x0}px`, '--y0': `${f.y0}px`, '--x1': `${f.x1}px`, '--y1': `${f.y1}px` }}>${f.icon}</i>`)}
    </div></div>
    <p class="bt-line" aria-live="polite">${line}</p>
    ${phase === 'fight' ? html`<div class="bt-skills">${st.me.skills.map((k, i) => html`<button key=${i} class="btn blue" disabled=${busy} onClick=${() => pick(i)}>
      <b>${k.element ? ELEMENTS[k.element].icon : tl('무')} ${k.name}</b><small>${effectText(k)}</small></button>`)}
      ${wild && html`<button class="btn orange bt-flee" disabled=${busy} onClick=${onFlee}>${tl('🏃 도망 (+5초)')}</button>`}</div>`
    : html`<div class="bt-end"><b class=${end?.won ? 'win' : 'lose'}>${end?.text}</b>${end?.note && html`<small>${end.note}</small>`}
      <div class="bt-row">${wild ? html`<button class="btn green" onClick=${onClose}>${tl('계속')}</button>`
        : html`<button class="btn green" onClick=${() => (foe.vs === 'cpu' ? setPhase('pick') : begin(foe))}>${tl('다시')}</button>
        <button class="btn blue" onClick=${onClose}>${tl('닫기')}</button>`}</div></div>`}`}
  </div>`;
}

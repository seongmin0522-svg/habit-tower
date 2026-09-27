// The bag: unopened boxes, the collection book, what to wear, titles. And the box reveal.
import { html, useState, useRef, useEffect } from './h.js';
import { Win } from './windows.js';
import { Sprite, Chest } from './sprites.js';
import { monsterUrl } from './monsters.js';
import { TIER as DEFAULT_BRICK } from './scene.js';
import { MONSTERS, SKINS, TIERS, TITLES, ITEMS, KIND_NAME, DUPS_PER_BONUS, SHINY_RATE, STARTER } from '../catalog.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';
import { glowAt } from '../logic.js';

const tierOf = (id) => TIERS.find((t) => t.id === id) ?? TIERS[0];

// A small picture of any catalog item (null id = the default look of that kind).
export function ItemIcon({ id, kind, shiny, character }) {
  const it = ITEMS.get(id);
  const k = it?.base ? 'monster' : it?.kind ?? kind;
  if (k === 'monster') return html`<img class="pix" src=${monsterUrl(id, shiny)} alt="" />`;
  if (k === 'char') return html`<${Sprite} id=${it?.cls ?? character} skin=${id} px=${2.4} />`;
  if (k === 'bg') return html`<i class="swatch" style=${{ background: it ? it.sky : 'var(--sky)' }}><i style=${{ background: it ? it.grass : 'var(--grass)' }} /></i>`;
  if (k === 'brick') return html`<i class="bricks">${[2, 1, 0].map((t) => html`<i key=${t}
    style=${{ background: it?.rainbow ? `hsl(${t * 120} 75% 62%)` : (it?.colors ?? DEFAULT_BRICK)[t] }} />`)}</i>`;
  return html`<i class="flagicon">${it?.icon ?? '🚩'}</i>`;
}

const boxName = (b) => (b.startsWith('c:') ? '💞 커플 상자' : b.startsWith('b:') ? '🎁 보너스 상자' : '🎁 인증 상자');

// One box, tapped open. The pull is rolled and saved on the first tap; its tier sets the taps it takes
// (TIERS[].taps). A box still shut past a lower tier's count glows the next tier's color (glowAt),
// then bursts. onEquip(pull) wears it; left = boxes still unopened after this one.
const HINT = { rare: '빛이 새어 나와요… 레어 이상!', epic: '보랏빛이…! 희귀 이상!', legend: '금빛이다!! 전설 확정!' };
const BURST_MS = { common: 700, rare: 900, epic: 1200, legend: 1600 };
const BITS = { common: 8, rare: 12, epic: 16, legend: 24 };

export function BoxReveal({ box, left, shards, onOpen, onEquip, onNext, onClose }) {
  const [pull, setPull] = useState(null);
  const [taps, setTaps] = useState(0);
  const [flash, setFlash] = useState(0);            // bumps restart the white flash
  const [stage, setStage] = useState('shut');       // shut | burst | open
  const count = useRef(0), busy = useRef(false);
  const it = pull && ITEMS.get(pull.item), tier = it && tierOf(it.tier);
  const glow = glowAt(taps), glowColor = glow && tierOf(glow).color;

  useEffect(() => {
    if (stage !== 'burst') return;
    const t = setTimeout(() => setStage('open'), BURST_MS[tier.id]);
    return () => clearTimeout(t);
  }, [stage]);

  const tap = async () => {
    if (stage !== 'shut' || busy.current) return;
    if (!pull) {
      // Every tier takes 2+ taps, so the first one is always a plain hit: its feedback doesn't wait for the
      // roll, which keeps it inside the tap (iPhone's haptic only fires there).
      sfx('shake'); buzz('tap');
      busy.current = true;
      try { setPull(await onOpen(box)); count.current = 1; setTaps(1); } catch { /* not openable: stays shut */ } finally { busy.current = false; }
      return;
    }
    const p = pull, tr = tierOf(ITEMS.get(p.item)?.tier), n = ++count.current;
    setTaps(n);
    if (n >= tr.taps) {
      setStage('burst'); setFlash((f) => f + 1);
      sfx('open'); buzz(tr.id);
      setTimeout(() => sfx(p.shiny ? 'shiny' : tr.id), 250);
    } else if (glowAt(n) !== glowAt(n - 1)) {
      setFlash((f) => f + 1); sfx('open'); buzz('glow');
    } else { sfx('shake'); buzz('tap'); }
  };

  const hint = taps === 0 ? '상자를 두드려 보세요' : HINT[glow] ?? '한 번 더!';
  // The flash sits outside the window: the shaking window would trap a fixed child inside its own box.
  return html`${flash > 0 && html`<i key=${flash} class="flash" />`}<${Win} title=${boxName(box)} onClose=${taps > 0 && stage !== 'open' ? null : onClose}
    cls=${'reveal-win' + (stage === 'burst' ? ' quake t-' + tier.id : '')}>
    <div class="body pad center">
      ${stage !== 'open' ? html`
        <div class=${'chestwrap' + (glow ? ' glow' : '') + (stage === 'burst' ? ' burst' : '')}
          style=${{ '--gc': stage === 'burst' ? tier.color : glowColor || '#fff' }}>
          <span class="rays" />
          ${stage === 'burst' && html`<span class="bits">${Array.from({ length: BITS[tier.id] }, (_, k) => html`<i key=${k}
            style=${{ '--a': `${(360 / BITS[tier.id]) * k}deg` }} />`)}</span>`}
          <button key=${taps} class=${'chest' + (taps ? ' hit' : '')} onClick=${tap} aria-label="상자 두드리기">
            <${Chest} glow=${glowColor} cracks=${taps} /></button>
        </div>
        <p class="big" aria-live="polite">${stage === 'burst' ? '두근두근…' : hint}</p>
        <p class="muted small">${box.startsWith('d:') || box.startsWith('c:') ? `${box.slice(2)} 인증 보상` : '조각 10개 보상'}</p>`
      : html`
        <div class=${'prize t-' + it.tier + (pull.shiny ? ' sparkle' : '')} style=${{ '--tc': tier.color }}>
          <${ItemIcon} id=${pull.item} shiny=${pull.shiny} />
        </div>
        <p><span class="tier" style=${{ background: tier.color }}>${tier.name}</span>${pull.shiny && html` <span class="tier shiny-chip">✨ 이로치</span>`}</p>
        <p class="big">${it.name}</p>
        <p class="muted small">${it.base ? '몬스터' : (it.couple ? '💞 커플 ' : '') + KIND_NAME[it.kind]}${
          pull.dup ? ` · 이미 있어요 → 조각 +1 (${shards}/${DUPS_PER_BONUS})` : ' · NEW!'}</p>`}
    </div>
    ${stage === 'open' && html`<div class="foot">
      <button class="btn blue" onClick=${() => onEquip(pull)}>바로 장착</button>
      ${left > 0 ? html`<button class="btn green" onClick=${onNext}>다음 상자 (${left})</button>`
        : html`<button class="btn orange" onClick=${onClose}>확인</button>`}
    </div>`}
  </${Win}>`;
}

const TABS = [['box', '상자'], ['dex', '도감'], ['wear', '꾸미기'], ['title', '칭호']];

// have: owned() set. look: my habit/me.look. coupleSkin: {bg, brick, flag} or null when not coupled.
// earned: titles() set.
export function Bag({ unopened, shards, have, look, character, coupleSkin, earned, onReveal, onEquip, onEquipCouple, onClose }) {
  const [tab, setTab] = useState(unopened.length ? 'box' : 'dex');
  const [picked, setPicked] = useState(null);
  const pick = (id, shiny) => { setPicked({ id, shiny }); sfx('tap'); };
  const monsters = MONSTERS.filter((m) => have.has(m.id)).length;
  const shinies = MONSTERS.filter((m) => have.has(m.id + '*')).length;
  const skins = SKINS.filter((s) => !s.couple && have.has(s.id)).length;
  const duo = SKINS.filter((s) => s.couple && have.has(s.id)).length;

  const cell = (id, shiny, on, onClick) => html`<button key=${id + (shiny ? '*' : '')} class=${'cell' + (on ? ' sel' : '')}
    style=${{ '--tc': tierOf(ITEMS.get(id).tier).color }} onClick=${onClick} aria-label=${ITEMS.get(id).name}>
    <${ItemIcon} id=${id} shiny=${shiny} />${shiny && html`<i class="star">✨</i>`}</button>`;
  const unknown = (id) => html`<span key=${id} class="cell unknown" style=${{ '--tc': tierOf(ITEMS.get(id).tier).color }}>
    ${ITEMS.get(id).base ? html`<img class="pix" src=${monsterUrl(id)} alt="" />` : html`<i class="q">?</i>`}</span>`;

  const boxTab = html`<div class="pad center">
    <div class="chest bagchest" aria-hidden="true"><${Chest} px=${5} /></div>
    <p class="big">${unopened.length ? `안 연 상자 ${unopened.length}개` : '안 연 상자가 없어요'}</p>
    ${unopened.length > 0 && html`<button class="btn green big" onClick=${onReveal}>열기</button>`}
    <p class="muted small">사진 인증 1번 = 상자 1개 · 둘 다 인증한 날은 커플 상자도 1개</p>
    <div class="shardbar" aria-label=${`조각 ${shards}/${DUPS_PER_BONUS}`}><i style=${{ width: `${(shards / DUPS_PER_BONUS) * 100}%` }} /></div>
    <p class="small">조각 ${shards}/${DUPS_PER_BONUS} — 이미 있는 게 나오면 조각 1개, ${DUPS_PER_BONUS}개면 보너스 상자</p>
    <p class="muted small">${TIERS.map((t) => `${t.name} ${t.weight}%`).join(' · ')} · 이로치 ${SHINY_RATE * 100}%</p>
  </div>`;

  const dexTab = html`<div class="pad">
    <p class="dexsum">몬스터 ${monsters}/${MONSTERS.length} · ✨ ${shinies}/${MONSTERS.length} · 스킨 ${skins}/40${coupleSkin && ` · 💞 ${duo}/10`}</p>
    ${picked && html`<p class="picked">${picked.shiny ? '✨ 이로치 ' : ''}${ITEMS.get(picked.id).name} <span class="tier" style=${{ background: tierOf(ITEMS.get(picked.id).tier).color }}>${tierOf(ITEMS.get(picked.id).tier).name}</span></p>`}
    ${TIERS.map((t) => html`<section key=${t.id}><h3 style=${{ color: t.color }}>${t.name}</h3><div class="grid">${
      MONSTERS.filter((m) => m.tier === t.id).map((m) => (have.has(m.id) ? cell(m.id, false, false, () => pick(m.id)) : unknown(m.id)))}</div></section>`)}
    <section><h3>✨ 이로치</h3>${shinies ? html`<div class="grid">${MONSTERS.filter((m) => have.has(m.id + '*')).map((m) => cell(m.id, true, false, () => pick(m.id, true)))}</div>`
      : html`<p class="muted small">아직 없어요 · 몬스터가 나올 때 ${SHINY_RATE * 100}% 확률</p>`}</section>
    <section><h3>스킨</h3><div class="grid">${SKINS.filter((s) => !s.couple || coupleSkin).map((s) => (have.has(s.id) ? cell(s.id, false, false, () => pick(s.id)) : unknown(s.id)))}</div></section>
  </div>`;

  // Wear: default first, then what I own of that kind.
  const row = (label, kind, cur, list, onSet) => html`<section key=${label}><h3>${label}</h3><div class="grid">
    <button class=${'cell' + (!cur ? ' sel' : '')} onClick=${() => onSet(null)} aria-label="기본"><${ItemIcon} kind=${kind} character=${character} /><i class="lbl">기본</i></button>
    ${list.map((s) => cell(s.id, false, cur === s.id, () => onSet(s.id)))}</div></section>`;
  const mine = (kind, couple = false) => SKINS.filter((s) => s.kind === kind && !!s.couple === couple && have.has(s.id)
    && (kind !== 'char' || s.cls === character));
  const wearTab = html`<div class="pad">
    <section><h3>몬스터 친구</h3><div class="grid">${MONSTERS.flatMap((m) => [
      have.has(m.id) && cell(m.id, false, look.monster === m.id && !look.shiny || (!look.monster && m.id === STARTER), () => onEquip({ monster: m.id, shiny: false })),
      have.has(m.id + '*') && cell(m.id, true, look.monster === m.id && !!look.shiny, () => onEquip({ monster: m.id, shiny: true })),
    ]).filter(Boolean)}</div></section>
    ${row('캐릭터 색', 'char', look.char, mine('char'), (v) => onEquip({ char: v }))}
    ${['bg', 'brick', 'flag'].map((k) => row(KIND_NAME[k], k, look[k], mine(k), (v) => onEquip({ [k]: v })))}
    ${coupleSkin && html`<h3 class="duo-h">💞 우리 탑 꾸미기 <small class="muted">(둘 중 마지막에 바꾼 사람 것)</small></h3>
      ${['bg', 'brick', 'flag'].map((k) => row('우리 탑 ' + KIND_NAME[k], k, coupleSkin[k], mine(k, true), (v) => onEquipCouple({ [k]: v })))}`}
  </div>`;

  const titleTab = html`<div class="pad titles">
    <button class=${'trow' + (!look.badge ? ' sel' : '')} onClick=${() => onEquip({ badge: null })}><b>칭호 안 달기</b></button>
    ${TITLES.map((t) => html`<button key=${t.id} class=${'trow' + (look.badge === t.id ? ' sel' : '')} disabled=${!earned.has(t.id)}
      onClick=${() => onEquip({ badge: t.id })}><b>${earned.has(t.id) ? '🏅' : '🔒'} ${t.name}</b><small class="muted">${t.desc}</small></button>`)}
  </div>`;

  return html`<${Win} title="🎒 가방" onClose=${onClose} cls="bag-win">
    <nav class="tabs" role="tablist">${TABS.map(([id, label]) => html`<button key=${id} role="tab" aria-selected=${tab === id}
      onClick=${() => { setTab(id); sfx('tap'); }}>${label}${id === 'box' && unopened.length ? ` ${unopened.length}` : ''}</button>`)}</nav>
    <div class="body bag">${{ box: boxTab, dex: dexTab, wear: wearTab, title: titleTab }[tab]}</div>
  </${Win}>`;
}

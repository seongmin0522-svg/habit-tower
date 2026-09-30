// The playroom's room: theme ground and bits, a building at the back, furniture in fixed slots; plus the shop and
// the placement sheet (spec: docs/superpowers/specs/2026-09-29-encounters-shop-design.md). Positions use the playroom's
// perspective (ui/playroom.js project) as percentages, so nothing here needs the field's pixel size.
import { html, useState } from './h.js';
import { FURNITURE, BUILDINGS, THEMES, SHOP } from '../catalog.js';
import { SLOTS, COIN } from '../shop.js';
import { Win } from './windows.js';
import { tl } from '../i18n.js';

export const HORIZON = 0.38, HAND = 0.86; // field heights: where far ground meets the sky, where z = 0 is
export const scaleAt = (z) => 1 / (1 + 3 * z);
// A ground point as CSS: left/top in % of the field, the perspective scale, and the stacking order the pet uses.
export const spot = ({ x, z }) => {
  const s = scaleAt(z);
  return { left: `${50 + x * 50 * s}%`, top: `${(HORIZON + (HAND - HORIZON) * s) * 100}%`, s, zIndex: Math.round(1000 - z * 500) };
};
const BUILDING_AT = { x: 0, z: 1.6 };
const BITS = [[-0.9, 0.2], [0.9, 0.25], [-0.35, 0.7], [0.4, 0.8], [-0.95, 1.3], [0.95, 1.2], [0.1, 1.5], [-0.6, 1.8]]; // theme bits

const Placed = ({ at, icon, size, cls = '', onClick, label }) => {
  const p = spot(at);
  return html`<span class=${'rm-item ' + cls} role=${onClick ? 'button' : undefined} aria-label=${label} onClick=${onClick}
    style=${{ left: p.left, top: p.top, zIndex: p.zIndex, fontSize: cls.includes('rm-empty') ? undefined : `${size * p.s}px` }}>${icon}</span>`;
};

// room: {slots, building, theme} or null. editing: show the slots to tap (onSlot(i), onBuilding(), onTheme()).
export function RoomLayer({ room, editing, onSlot, onBuilding }) {
  const theme = SHOP.get(room?.theme), building = SHOP.get(room?.building);
  return html`${theme && html`<i class="rm-ground" style=${{ background: theme.ground }} />`}
    ${theme && BITS.map(([x, z], i) => html`<${Placed} key=${'t' + i} at=${{ x, z }} icon=${theme.deco} size=${60} cls="rm-bit" />`)}
    ${(building || editing) && html`<${Placed} at=${BUILDING_AT} icon=${building?.icon ?? '＋'} size=${520} cls=${building ? 'rm-building' : 'rm-empty'}
      onClick=${editing ? onBuilding : undefined} label=${editing ? tl('건물 자리') : building?.name} />`}
    ${SLOTS.map((at, i) => {
      const f = SHOP.get(room?.slots?.[i]);
      return (f || editing) && html`<${Placed} key=${'s' + i} at=${at} icon=${f?.icon ?? i + 1} size=${190}
        cls=${f ? 'rm-furniture' + (editing ? ' editing' : '') : 'rm-empty'} onClick=${editing ? () => onSlot(i) : undefined}
        label=${editing ? tl`${i + 1}번 자리` + (f ? ` · ${f.name}` : '') : f?.name} />`;
    })}`;
}

const TABS = [['furniture', tl('🛋️ 가구'), FURNITURE], ['building', tl('🏠 건물'), BUILDINGS], ['theme', tl('🌸 테마'), THEMES]];

// coins: my balance (or null in admin mode: everything's free and owned). bought: {<id>: …}.
export function Shop({ coins, bought, onBuy, onClose }) {
  const [tab, setTab] = useState('furniture');
  const [busy, setBusy] = useState(null);
  const list = TABS.find((t) => t[0] === tab)[2];
  const buy = (id) => { setBusy(id); onBuy(id).catch(() => {}).finally(() => setBusy(null)); }; // the app already toasted a failure
  return html`<${Win} title=${tl('🏪 상점')} onClose=${onClose} cls="shop-win">
    <div class="pad">
      <p class="shop-coins">🪙 ${coins ?? '∞'}<small class="muted">${tl` · 인증 ${COIN.photo} · 미로 ${COIN.maze} · 대결 승리 ${COIN.win} · 중복 ${COIN.dup} · 펫 레벨업 ${COIN.level}`}</small></p>
      <div class="tabs" role="tablist">${TABS.map(([id, label]) => html`<button key=${id} role="tab" aria-selected=${tab === id} onClick=${() => setTab(id)}>${label}</button>`)}</div>
      <div class="shop-grid">${list.map((x) => html`<div key=${x.id} class="shop-card">
        <span class="shop-icon">${x.icon}</span><b>${x.name}</b>
        ${bought[x.id] ? html`<small class="muted">${tl('보유')}</small>`
          : html`<button class="btn sm green" disabled=${busy || coins < x.price} onClick=${() => buy(x.id)}>🪙 ${x.price}</button>`}
      </div>`)}</div>
      <p class="muted small">${tl('산 건 🏠 꾸미기에서 놓을 수 있어요. 가구 근처에 가면 펫이 쉬거나 놀아요.')}</p>
    </div>
  </${Win}>`;
}

// Pick what goes in one place. where: 'slot' | 'building' | 'theme'; current: what's there now.
export function PlaceSheet({ where, index, current, bought, onPick, onClose }) {
  const kind = { slot: 'furniture', building: 'building', theme: 'theme' }[where];
  const mine = [...SHOP.values()].filter((x) => x.kind === kind && bought[x.id]);
  const title = where === 'slot' ? tl`${index + 1}번 자리` : where === 'building' ? tl('건물 자리') : tl('테마');
  return html`<${Win} title=${title} onClose=${onClose}>
    <div class="pad"><div class="shop-grid">
      <button class=${'shop-card' + (!current ? ' sel' : '')} onClick=${() => onPick(null)}><span class="shop-icon">∅</span><b>${tl('비우기')}</b></button>
      ${mine.map((x) => html`<button key=${x.id} class=${'shop-card' + (current === x.id ? ' sel' : '')} onClick=${() => onPick(x.id)}>
        <span class="shop-icon">${x.icon}</span><b>${x.name}</b></button>`)}
    </div>${!mine.length && html`<p class="muted small">${tl('아직 산 게 없어요. 🏪 상점에서 사 오세요.')}</p>`}</div>
  </${Win}>`;
}

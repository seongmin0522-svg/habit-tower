// The playroom's room: theme ground and bits, furniture and buildings anywhere; plus the shop, the theme sheet and the
// decorating bar (specs: docs/superpowers/specs/2026-09-29-encounters-shop-design.md, 2026-10-03-island-design.md).
// Positions use the playroom's perspective (ui/playroom.js project) as percentages, so drawing needs no pixel size.
import { html, useState } from './h.js';
import { FURNITURE, BUILDINGS, THEMES, SHOP } from '../catalog.js';
import { COIN, ISLAND, roomItems } from '../shop.js';
import { Win } from './windows.js';
import { tl } from '../i18n.js';

export const HORIZON = 0.38, HAND = 0.86; // field heights: where far ground meets the sky, where z = 0 is
export const scaleAt = (z) => 1 / (1 + 3 * z);
// A ground point as CSS: left/top in % of the field, the perspective scale, and the stacking order the pet uses.
export const spot = ({ x, z }) => {
  const s = scaleAt(z);
  return { left: `${50 + x * 50 * s}%`, top: `${(HORIZON + (HAND - HORIZON) * s) * 100}%`, s, zIndex: Math.round(1000 - z * 500) };
};
const BITS = [[-0.9, 0.2], [0.9, 0.25], [-0.35, 0.7], [0.4, 0.8], [-0.95, 1.3], [0.95, 1.2], [0.1, 1.5], [-0.6, 1.8]]; // theme bits

const Placed = ({ at, icon, size, cls = '', label, ...on }) => {
  const p = spot(at);
  return html`<span class=${'rm-item ' + cls} role=${on.onPointerDown ? 'button' : undefined} aria-label=${label} ...${on}
    style=${{ left: p.left, top: p.top, zIndex: p.zIndex, fontSize: `${size * p.s}px` }}>${icon}</span>`;
};
// A field pixel (left, top) back to the ground point under it: spot() inverted, kept on the island.
function groundAt(left, top, w, h) {
  const s = Math.min(1, Math.max(scaleAt(ISLAND.z[1]), (top / h - HORIZON) / (HAND - HORIZON)));
  const x = (left - w / 2) / ((w / 2) * s);
  return { x: Math.min(ISLAND.x[1], Math.max(ISLAND.x[0], x)), z: (1 / s - 1) / 3 };
}

// room: {items, theme} (or an old slot room) or null. editing: pieces drag over the field; a release after a drag calls
// onArrange(id, {x, z}), a tap onItem(id). selected: the picked piece.
export function RoomLayer({ room, editing, selected, onArrange, onItem }) {
  const theme = SHOP.get(room?.theme);
  const [drag, setDrag] = useState(null); // {id, x0, y0, at, moved}
  const down = (id) => (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDrag({ id, x0: e.clientX, y0: e.clientY, moved: false }); };
  const move = (e) => {
    if (!drag || (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6)) return;
    const r = e.currentTarget.parentElement.getBoundingClientRect();
    setDrag({ ...drag, moved: true, at: groundAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height) });
  };
  const up = () => { if (!drag) return; setDrag(null); if (drag.moved) onArrange(drag.id, drag.at); else onItem(drag.id); };
  return html`${theme && html`<i class="rm-ground" style=${{ background: theme.ground }} />`}
    ${theme && BITS.map(([x, z], i) => html`<${Placed} key=${'t' + i} at=${{ x, z }} icon=${theme.deco} size=${60} cls="rm-bit" />`)}
    ${roomItems(room).map((it) => {
      const f = SHOP.get(it.id);
      if (!f) return null;
      const at = drag?.id === it.id && drag.at ? drag.at : it;
      return html`<${Placed} key=${it.id} at=${at} icon=${f.icon} size=${(f.kind === 'building' ? 520 : 190) * (selected === it.id ? 1.2 : 1)} label=${f.name}
        cls=${(f.kind === 'building' ? 'rm-building' : 'rm-furniture') + (editing ? ' editing' : '')}
        ...${editing ? { onPointerDown: down(it.id), onPointerMove: move, onPointerUp: up, onPointerCancel: () => setDrag(null) } : {}} />`;
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

// Pick the room's theme (or none).
export function ThemeSheet({ current, bought, onPick, onClose }) {
  const mine = THEMES.filter((x) => bought[x.id]);
  return html`<${Win} title=${tl('테마')} onClose=${onClose}>
    <div class="pad"><div class="shop-grid">
      <button class=${'shop-card' + (!current ? ' sel' : '')} onClick=${() => onPick(null)}><span class="shop-icon">∅</span><b>${tl('비우기')}</b></button>
      ${mine.map((x) => html`<button key=${x.id} class=${'shop-card' + (current === x.id ? ' sel' : '')} onClick=${() => onPick(x.id)}>
        <span class="shop-icon">${x.icon}</span><b>${x.name}</b></button>`)}
    </div>${!mine.length && html`<p class="muted small">${tl('아직 산 게 없어요. 🏪 상점에서 사 오세요.')}</p>`}</div>
  </${Win}>`;
}

// Decorating controls (the 3D 꾸미기 tab and the 2D playroom): the picked piece with [치우기], a drawer of owned pieces
// not placed yet (a tap puts one near the middle), the theme and the shop. onArrange(id, at | null) and onTheme(id)
// resolve when saved; selected / onSelect(id | null): the picked piece.
export function DecorBar({ room, bought, coins, selected, onSelect, onArrange, onTheme, onBuy }) {
  const [panel, setPanel] = useState(null); // null | 'shop' | 'theme'
  const placed = roomItems(room), have = new Set(placed.map((i) => i.id));
  const spare = [...SHOP.values()].filter((x) => x.kind !== 'theme' && bought[x.id] && !have.has(x.id));
  const picked = have.has(selected) && SHOP.get(selected);
  const drop = (id) => {
    const n = placed.length;
    onArrange(id, { x: ((n % 5) - 2) * 0.3, z: 0.4 + Math.floor(n / 5) * 0.25 }).then(() => onSelect(id), () => {});
  };
  return html`<div class="decor">
    <p class="decor-hint">${picked ? tl`${picked.icon} ${picked.name} · 끌어서 옮겨요` : tl('가구를 끌어서 옮기고, 눌러서 골라요')}
      ${picked && html`<button class="btn sm danger" onClick=${() => onArrange(selected, null).then(() => onSelect(null), () => {})}>${tl('치우기')}</button>`}</p>
    <div class="decor-tray">
      ${spare.map((x) => html`<button key=${x.id} class="btn sm blue" onClick=${() => drop(x.id)} aria-label=${tl`${x.name} 놓기`}>${x.icon}</button>`)}
      ${!spare.length && html`<span class="muted small">${placed.length ? tl('다 놓았어요') : tl('아직 산 게 없어요. 🏪 상점에서 사 오세요.')}</span>`}
    </div>
    <div class="decor-tools">
      <button class="btn sm blue" onClick=${() => setPanel('theme')}>${tl('🌸 테마 바꾸기')}</button>
      <button class="btn sm blue" onClick=${() => setPanel('shop')}>${tl('🏪 상점')}</button>
      <span class="pr-coins">🪙 ${coins ?? '∞'}</span>
    </div>
    ${panel === 'shop' && html`<${Shop} coins=${coins} bought=${bought} onBuy=${onBuy} onClose=${() => setPanel(null)} />`}
    ${panel === 'theme' && html`<${ThemeSheet} current=${room?.theme} bought=${bought}
      onPick=${(id) => onTheme(id).then(() => setPanel(null), () => {})} onClose=${() => setPanel(null)} />`}
  </div>`;
}

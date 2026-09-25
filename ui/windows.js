import { html, useState } from './h.js';
import { Sprite, CHARACTERS } from './sprites.js';
import { TOWER_HEIGHT } from '../logic.js';
import { photoUrl } from '../db.js';

function Win({ title, onClose, children, cls = '' }) {
  return html`<div class="overlay" onClick=${onClose}>
    <div class=${'win ' + cls} role="dialog" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
      <div class="ttl">${title}${onClose && html`<button class="x" onClick=${onClose} aria-label="닫기">✕</button>`}</div>
      ${children}
    </div>
  </div>`;
}

export function Setup({ habit, onSave, onClose }) {
  const [title, setTitle] = useState(habit?.title ?? '');
  const [character, setCharacter] = useState(habit?.character ?? CHARACTERS[0].id);
  const [saving, setSaving] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    onSave({ title, character }).finally(() => setSaving(false));
  };
  return html`<${Win} title=${habit ? '습관 설정' : '해빗 타워 시작'} onClose=${habit && onClose} cls="setup-win">
    <form class="body pad" onSubmit=${submit}>
      <label>어떤 습관을 쌓을까요?
        <input value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="40" placeholder="예: 운동 30분" required autofocus /></label>
      <div class="lbl">함께 쌓을 캐릭터</div>
      <div class="chars">${CHARACTERS.map((c) => html`
        <button type="button" class=${'char' + (c.id === character ? ' sel' : '')} onClick=${() => setCharacter(c.id)} aria-pressed=${c.id === character}>
          <${Sprite} id=${c.id} px=${3} /><b>${c.name}</b>
        </button>`)}</div>
      <p class="muted small">매일 인증 사진을 찍으면 벽돌이 한 층 올라가요. ${TOWER_HEIGHT}층이면 탑 완성, 하루 빼먹으면 쌓던 탑이 무너져요.</p>
      <div class="foot"><span /><button class="btn green" disabled=${saving || !title.trim()}>${habit ? '저장' : '시작하기'}</button></div>
    </form>
  </${Win}>`;
}

export function Photo({ day, n, onClose }) {
  return html`<${Win} title=${`${n}층 · ${day.key}`} onClose=${onClose} cls="photo-win">
    <div class="body"><img src=${photoUrl(day.assetId)} alt=${`${day.key} 인증 사진`} /></div>
  </${Win}>`;
}

// current + past towers, newest first; each shows its photos in date order.
export function Album({ current, past, days, onPick, onClose }) {
  const list = [...(current ? [{ ...current, kind: 'live' }] : []), ...past];
  const head = (t) => ({
    live: `🏗 쌓는 중 · ${t.keys.length}층`,
    built: `🏰 완성 · ${TOWER_HEIGHT}층`,
    fell: `💥 ${t.keys.length}층에서 붕괴`,
  })[t.kind];
  return html`<${Win} title="앨범" onClose=${onClose} cls="album-win">
    <div class="body album">${list.length === 0 ? html`<p class="empty">아직 인증 사진이 없어요</p>` : list.map((t) => html`
      <section key=${t.keys[0]}>
        <h3>${head(t)} <small class="muted">${t.keys[0]} ~ ${t.keys.at(-1)}</small></h3>
        <div class="thumbs">${t.keys.map((k, i) => html`
          <button key=${k} onClick=${() => onPick(k, i + 1)} aria-label=${`${k} 사진`}>
            <img src=${photoUrl(days[k].assetId)} alt="" loading="lazy" /><span>${i + 1}</span>
          </button>`)}</div>
      </section>`)}
    </div>
  </${Win}>`;
}

export function FallNotice({ floors, onOk }) {
  return html`<${Win} title="탑이 무너졌어요" cls="fall-win">
    <div class="body pad center">
      <p class="big">💥 ${floors}층에서 무너졌어요</p>
      <p class="muted">사진은 앨범에 남아 있어요. 오늘부터 다시 쌓아요!</p>
    </div>
    <div class="foot"><span /><button class="btn orange" onClick=${onOk}>다시 쌓기</button></div>
  </${Win}>`;
}

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

export function Setup({ habit, onSave, onClose, backup, onExport, onSaveFile, onImport, onReset, cloud, cloudApi }) {
  const [title, setTitle] = useState(habit?.title ?? '');
  const [character, setCharacter] = useState(habit?.character ?? CHARACTERS[0].id);
  const [saving, setSaving] = useState(false);
  const [wipe, setWipe] = useState(false); // reset asks once more before deleting
  const [out, setOut] = useState(null);    // export: null | 'busy' | the prepared File
  const prepare = () => { setOut('busy'); onExport().then(setOut, () => setOut(null)); };
  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    onSave({ title, character }).finally(() => setSaving(false));
  };
  // Title autofocus only on first run: on a phone it would pop the keyboard every time settings open.
  return html`<${Win} title=${habit ? '습관 설정' : '해빗 타워 시작'} onClose=${habit && onClose} cls="setup-win">
    <form class="body pad" onSubmit=${submit}>
      <label>어떤 습관을 쌓을까요?
        <input value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="40" placeholder="예: 운동 30분" required autofocus=${!habit} /></label>
      <div class="lbl">함께 쌓을 캐릭터</div>
      <div class="chars">${CHARACTERS.map((c) => html`
        <button type="button" class=${'char' + (c.id === character ? ' sel' : '')} onClick=${() => setCharacter(c.id)} aria-pressed=${c.id === character}>
          <${Sprite} id=${c.id} px=${3} /><b>${c.name}</b>
        </button>`)}</div>
      <p class="muted small">매일 인증 사진을 찍으면 벽돌이 한 층 올라가요. ${TOWER_HEIGHT}층이면 탑 완성, 하루 빼먹으면 쌓던 탑이 무너져요.</p>
      <div class="foot"><span /><button class="btn green" disabled=${saving || !title.trim()}>${habit ? '저장' : '시작하기'}</button></div>
      ${backup && html`<div class="backup">
        <div class="lbl">백업 <span class="muted small">— 기록과 사진은 이 폰에만 있어요. 가끔 내보내 두세요.</span></div>
        <span>
          ${out instanceof File
            ? html`<button type="button" class="btn green sm" onClick=${() => onSaveFile(out)}>📤 저장하기 (${Math.max(1, Math.round(out.size / 1024))}KB)</button>`
            : html`<button type="button" class="btn blue sm" disabled=${!habit || out === 'busy'} onClick=${prepare}>${out === 'busy' ? '준비 중…' : '내보내기'}</button>`}
          <label class="btn blue sm">${habit ? '가져오기' : '백업에서 복원'}<input type="file" accept="application/json,.json" hidden
            onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} /></label>
          ${habit && !wipe && html`<button type="button" class="btn danger sm" onClick=${() => setWipe(true)}>초기화</button>`}
        </span>
        ${wipe && html`<div class="wipe" role="alert">
          <p><b>모든 기록과 사진을 이 폰에서 지울까요?</b><br /><span class="muted small">${cloud?.userId
            ? '클라우드 기록·사진도 지우고 커플 연결도 끊겨요. 되돌릴 수 없어요.'
            : '되돌릴 수 없어요. 필요하면 먼저 내보내기 하세요.'}</span></p>
          <span><button type="button" class="btn danger sm" onClick=${onReset}>전부 지우기</button>
            <button type="button" class="btn blue sm" onClick=${() => setWipe(false)}>취소</button></span>
        </div>`}
      </div>`}
      ${cloudApi && cloud && html`<${CoupleBox} cloud=${cloud} api=${cloudApi} />`}
    </form>
  </${Win}>`;
}

// Settings "커플" section: email code sign-in, name, invite code, leave, sign out.
function CoupleBox({ cloud, api }) {
  const [email, setEmail] = useState(cloud.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState(cloud.name ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const act = (f, after) => {
    setBusy(true);
    setMsg('');
    f().then(after, (e) => setMsg(e.message)).finally(() => setBusy(false));
  };
  const val = (set) => (e) => set(e.target.value);
  // Enter here must not submit the habit form around it.
  return html`<div class="backup couple" onKeyDown=${(e) => e.key === 'Enter' && e.preventDefault()}>
    <div class="lbl">커플 <span class="muted small">— 로그인하면 기록이 클라우드에도 올라가요</span></div>
    ${!cloud.userId && !sent && html`<span>
      <input type="email" autocomplete="email" placeholder="이메일" value=${email} onInput=${val(setEmail)} />
      <button type="button" class="btn blue sm" disabled=${busy || !email.includes('@')}
        onClick=${() => act(() => api.sendCode(email.trim()), () => setSent(true))}>코드 받기</button></span>`}
    ${!cloud.userId && sent && html`<span>
      <input inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="메일로 온 숫자" value=${code} onInput=${val(setCode)} />
      <button type="button" class="btn green sm" disabled=${busy || code.trim().length < 6}
        onClick=${() => act(() => api.verify(email.trim(), code.trim()), () => setCode(''))}>로그인</button>
      <button type="button" class="btn blue sm" onClick=${() => setSent(false)}>다시</button></span>`}
    ${cloud.userId && html`
      <label>내 이름 <input maxlength="20" value=${name} onInput=${val(setName)}
        onBlur=${() => name.trim() !== (cloud.name ?? '') && act(() => api.setName(name))} /></label>
      ${!cloud.coupleId && html`<span>
        <button type="button" class="btn green sm" disabled=${busy} onClick=${() => act(api.createCouple)}>커플 만들기</button>
        <input class="code" maxlength="6" placeholder="초대코드" value=${code} onInput=${val(setCode)} />
        <button type="button" class="btn blue sm" disabled=${busy || code.trim().length !== 6}
          onClick=${() => act(() => api.joinCouple(code), () => setCode(''))}>연결</button></span>`}
      ${cloud.coupleId && !cloud.partner && (cloud.code
        ? html`<p>초대코드 <b class="invite">${cloud.code}</b>
            <button type="button" class="btn blue sm" onClick=${() => navigator.clipboard?.writeText(cloud.code).then(() => setMsg('복사했어요'))}>복사</button>
            <br /><span class="muted small">상대가 설정 → 커플에서 이 코드를 넣으면 연결돼요</span></p>`
        : html`<p class="muted small">상대와 연결이 끊겼어요. 연결 끊기 후 새로 만들어요.</p>`)}
      ${cloud.partner && html`<p>❤ <b>${cloud.partner.name || '상대'}</b>와 연결됨</p>`}
      <span>
        ${cloud.coupleId && (leaving
          ? html`<button type="button" class="btn danger sm" disabled=${busy} onClick=${() => act(api.leave, () => setLeaving(false))}>정말 끊기</button>`
          : html`<button type="button" class="btn blue sm" onClick=${() => setLeaving(true)}>연결 끊기</button>`)}
        <button type="button" class="btn blue sm" disabled=${busy} onClick=${() => act(api.signOut)}>로그아웃</button>
        <span class="muted small">${cloud.email}</span>
      </span>`}
    ${msg && html`<p class="small" role="status">${msg}</p>`}
  </div>`;
}

export function Photo({ day, n, names, onClose }) {
  return html`<${Win} title=${`${n}층 · ${day.key}`} onClose=${onClose} cls="photo-win">
    <div class="body">${day.partnerAssetId
      ? html`<div class="duo">${[[day.assetId, names[0]], [day.partnerAssetId, names[1]]].map(([id, who]) => html`
          <figure key=${id}><img src=${photoUrl(id)} alt=${`${who} 인증 사진`} /><figcaption>${who}</figcaption></figure>`)}</div>`
      : html`<img src=${photoUrl(day.assetId)} alt=${`${day.key} 인증 사진`} />`}</div>
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

export function FallNotice({ floors, onOk, title = '탑이 무너졌어요' }) {
  return html`<${Win} title=${title} cls="fall-win">
    <div class="body pad center">
      <p class="big">💥 ${floors}층에서 무너졌어요</p>
      <p class="muted">사진은 앨범에 남아 있어요. 오늘부터 다시 쌓아요!</p>
    </div>
    <div class="foot"><span /><button class="btn orange" onClick=${onOk}>다시 쌓기</button></div>
  </${Win}>`;
}

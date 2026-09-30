import { html, useState, useEffect } from './h.js';
import { Sprite, CHARACTERS } from './sprites.js';
import { TIER } from './scene.js';
import { TOWER_HEIGHT, monthGrid, addMonths } from '../logic.js';
import { photoUrl } from '../db.js';
import { TRACKS, getPrefs, setPrefs, onPrefs } from '../sound.js';
import { buzz, testBuzz } from '../haptic.js';
import { tl, langPref, setLang, monthTitle, weekdays } from '../i18n.js';

export function Win({ title, onClose, children, cls = '' }) {
  return html`<div class="overlay" onClick=${onClose}>
    <div class=${'win ' + cls} role="dialog" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
      <div class="ttl">${title}${onClose && html`<button class="x" onClick=${onClose} aria-label=${tl('닫기')}>✕</button>`}</div>
      ${children}
    </div>
  </div>`;
}

// restart: null, or { label, floors, onRestart } for the tower on the tab being viewed.
// admin: null, or {on, level, set(patch)} for accounts in ADMIN_IDS (admin.js test mode).
export function Setup({ habit, onSave, onClose, backup, onExport, onSaveFile, onImport, onReset, cloud, cloudApi, restart, admin }) {
  const [title, setTitle] = useState(habit?.title ?? '');
  const [character, setCharacter] = useState(habit?.character ?? CHARACTERS[0].id);
  const [saving, setSaving] = useState(false);
  const [wipe, setWipe] = useState(false); // reset asks once more before deleting
  const [again, setAgain] = useState(false); // start over asks once more too
  const [out, setOut] = useState(null);    // export: null | 'busy' | the prepared File
  const prepare = () => { setOut('busy'); onExport().then(setOut, () => setOut(null)); };
  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    onSave({ title, character }).finally(() => setSaving(false));
  };
  // Title autofocus only on first run: on a phone it would pop the keyboard every time settings open.
  return html`<${Win} title=${habit ? tl('습관 설정') : tl('해빗 타워 시작')} onClose=${habit && onClose} cls="setup-win">
    <form class="body pad" onSubmit=${submit}>
      <label>${tl('어떤 습관을 쌓을까요?')}
        <input value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="40" placeholder=${tl('예: 운동 30분')} required autofocus=${!habit} /></label>
      <div class="lbl">${tl('함께 쌓을 캐릭터')}</div>
      <div class="chars">${CHARACTERS.map((c) => html`
        <button type="button" class=${'char' + (c.id === character ? ' sel' : '')} onClick=${() => setCharacter(c.id)} aria-pressed=${c.id === character}>
          <${Sprite} id=${c.id} px=${3} /><b>${c.name}</b>
        </button>`)}</div>
      <p class="muted small">${tl`매일 인증 사진을 찍으면 벽돌이 한 층 올라가요. ${TOWER_HEIGHT}층이면 탑 완성, 하루 빼먹으면 쌓던 탑이 무너져요.`}</p>
      <div class="foot"><span /><button class="btn green" disabled=${saving || !title.trim()}>${habit ? tl('저장') : tl('시작하기')}</button></div>
      <${SoundBox} />
      <${LangBox} />
      ${admin && html`<${AdminBox} admin=${admin} />`}
      ${backup && html`<div class="backup">
        <div class="lbl">${tl('백업')} <span class="muted small">${tl('— 기록과 사진은 이 폰에만 있어요. 가끔 내보내 두세요.')}</span></div>
        <span>
          ${out instanceof File
            ? html`<button type="button" class="btn green sm" onClick=${() => onSaveFile(out)}>${tl`📤 저장하기 (${Math.max(1, Math.round(out.size / 1024))}KB)`}</button>`
            : html`<button type="button" class="btn blue sm" disabled=${!habit || out === 'busy'} onClick=${prepare}>${out === 'busy' ? tl('준비 중…') : tl('내보내기')}</button>`}
          <label class="btn blue sm">${habit ? tl('가져오기') : tl('백업에서 복원')}<input type="file" accept="application/json,.json" hidden
            onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} /></label>
          ${restart && !again && html`<button type="button" class="btn orange sm" onClick=${() => setAgain(true)}>${restart.label}</button>`}
          ${habit && !wipe && html`<button type="button" class="btn danger sm" onClick=${() => setWipe(true)}>${tl('초기화')}</button>`}
        </span>
        ${restart && again && html`<div class="wipe" role="alert">
          <p><b>${tl`${restart.label} 할까요?`}</b><br /><span class="muted small">${
            tl`지금 ${restart.floors}층은 앨범에 남고, 다음 인증부터 1층이에요. 오늘 이미 인증했으면 내일부터예요. 기록과 사진은 지워지지 않아요.`}</span></p>
          <span><button type="button" class="btn orange sm" onClick=${restart.onRestart}>${tl('새로 쌓기')}</button>
            <button type="button" class="btn blue sm" onClick=${() => setAgain(false)}>${tl('취소')}</button></span>
        </div>`}
        ${wipe && html`<div class="wipe" role="alert">
          <p><b>${tl('모든 기록과 사진을 이 폰에서 지울까요?')}</b><br /><span class="muted small">${cloud?.userId
            ? tl('클라우드 기록·사진도 지우고 커플 연결도 끊겨요. 되돌릴 수 없어요.')
            : tl('되돌릴 수 없어요. 필요하면 먼저 내보내기 하세요.')}</span></p>
          <span><button type="button" class="btn danger sm" onClick=${onReset}>${tl('전부 지우기')}</button>
            <button type="button" class="btn blue sm" onClick=${() => setWipe(false)}>${tl('취소')}</button></span>
        </div>`}
      </div>`}
      ${cloudApi && cloud && html`<${CoupleBox} cloud=${cloud} api=${cloudApi} />`}
    </form>
  </${Win}>`;
}

// Admin test mode switch (only shown to ADMIN_IDS).
function AdminBox({ admin }) {
  return html`<div class="backup">
    <div class="lbl">${tl('🛠 관리자 (도균님 계정에만 보여요)')}</div>
    <span><button type="button" class=${'btn sm ' + (admin.on ? 'green' : 'blue')} aria-pressed=${admin.on}
      onClick=${() => admin.set({ on: !admin.on })}>${tl('관리자 모드')} ${admin.on ? tl('켜짐') : tl('꺼짐')}</button>
    <select class="track" aria-label=${tl('대결 펫 레벨')} value=${String(admin.level ?? '')} disabled=${!admin.on}
      onChange=${(e) => admin.set({ level: e.target.value ? Number(e.target.value) : null })}>
      <option value="">${tl('대결 레벨: 실제')}</option>
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<option key=${n} value=${String(n)}>${tl`대결 레벨: Lv ${n}`}</option>`)}
    </select></span>
    <p class="muted small">${tl('켜면 몬스터·이로치·스킨·칭호·악세서리 전부 해금, 먹이·대결·미로 매일 제한 없음. 놀이방·대결·미로 결과는 저장하지 않아요.')}</p>
  </div>`;
}

// Music and effects, per phone.
function SoundBox() {
  const [p, setP] = useState(getPrefs());
  const [vibeTest, setVibeTest] = useState(null);
  useEffect(() => onPrefs(setP), []);
  const sw = (key, label) => html`<button type="button" class=${'btn sm ' + (p[key] ? 'green' : 'blue')} aria-pressed=${p[key]}
    onClick=${() => setPrefs({ [key]: !p[key] })}>${label} ${p[key] ? tl('켜짐') : tl('꺼짐')}</button>`;
  return html`<div class="backup">
    <div class="lbl">${tl('소리')}</div>
    <span>${sw('bgm', tl('🎵 배경음악'))}${sw('sfx', tl('🔔 효과음'))}${sw('vibe', tl('📳 진동'))}
      <button type="button" class="btn sm blue" onClick=${() => setVibeTest(testBuzz())}>${tl('📳 진동 테스트')}</button></span>
    ${vibeTest && html`<p class="muted small">${{
      ok: tl('폰이 진동 요청을 받았어요. 안 떨렸다면 폰 설정 → 소리 및 진동 → 진동 세기에서 터치·시스템 진동을 켜 주세요.'),
      blocked: tl('브라우저가 진동을 막았어요. 이 문구를 캡처해서 알려 주세요.'),
      ios: tl('아이폰은 웹에서 짧은 톡 한 번만 가능해요. 톡도 안 느껴지면 설정 → 사운드 및 햅틱 → 시스템 햅틱을 켜 주세요.'),
    }[vibeTest]}</p>`}
    <select class="track" value=${String(p.track)} aria-label=${tl('배경음악 곡')} disabled=${!p.bgm}
      onChange=${(e) => setPrefs({ track: e.target.value === 'random' ? 'random' : Number(e.target.value) })}>
      ${TRACKS.map((t) => html`<option key=${t.id} value=${String(t.id)}>${t.id}. ${t.name}</option>`)}<option value="random">${tl('🔀 랜덤')}</option>
    </select>
  </div>`;
}

// Language, per phone. Changing it reloads the app (i18n.js). Language names stay in their own language.
function LangBox() {
  return html`<div class="backup">
    <div class="lbl">${tl('언어')}</div>
    <select class="track" value=${langPref()} aria-label=${tl('언어')} onChange=${(e) => setLang(e.target.value)}>
      <option value="auto">${tl('폰 설정 따라가기')}</option><option value="ko">한국어</option><option value="en">English</option>
    </select>
  </div>`;
}

// Phones often reload the page while the user reads the mail, so the sign-in fields never hide
// behind a "code sent" step and the address is remembered on this phone.
const EMAIL_KEY = 'habit-tower-email';
const lastEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; } };

// Settings "알림": the 9pm reminder and partner pushes on this phone. The state comes from the phone (permission, subscription).
function PushRow({ api }) {
  const [st, setSt] = useState(null); // null while checking
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.pushState().then(setSt, () => setSt('unsupported')); }, []);
  const flip = (f) => {
    setBusy(true);
    setMsg('');
    f().catch((e) => setMsg(e.message)).then(api.pushState).then(setSt).finally(() => setBusy(false));
  };
  return html`<p>${tl('알림')} <span class="muted small">${tl('— 밤 9시(오늘 벽돌 아직이면) · 상대가 인증하면')}</span>
    ${st === 'off' && html` <button type="button" class="btn green sm" disabled=${busy} onClick=${() => flip(api.pushOn)}>${tl('켜기')}</button>`}
    ${st === 'on' && html` <button type="button" class="btn blue sm" disabled=${busy} onClick=${() => flip(api.pushOff)}>${tl('끄기')}</button>`}
    ${st === 'unsupported' && html`<br /><span class="muted small">${tl('홈 화면에 추가한 앱에서만 알림이 돼요')}</span>`}
    ${st === 'denied' && html`<br /><span class="muted small">${tl('폰 설정에서 이 앱 알림을 허용해 주세요')}</span>`}
    ${msg && html`<br /><span class="small" role="status">${msg}</span>`}</p>`;
}

// Settings "커플" section: email code sign-in, name, invite code, leave, sign out.
function CoupleBox({ cloud, api }) {
  const [email, setEmail] = useState(cloud.email ?? lastEmail());
  const [code, setCode] = useState('');
  const [name, setName] = useState(cloud.name ?? '');
  const [title, setTitle] = useState(cloud.coupleTitle ?? '');
  const [reward, setReward] = useState(cloud.coupleReward ?? '');
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
    <div class="lbl">${tl('커플')} <span class="muted small">${tl('— 로그인하면 기록이 클라우드에도 올라가요')}</span></div>
    ${!cloud.userId && html`<span>
      <input type="email" autocomplete="email" placeholder=${tl('이메일')} value=${email} onInput=${val(setEmail)} />
      <button type="button" class="btn blue sm" disabled=${busy || !email.includes('@')}
        onClick=${() => act(() => api.sendCode(email.trim()), () => {
          try { localStorage.setItem(EMAIL_KEY, email.trim()); } catch {}
          setMsg(tl('메일로 온 숫자를 아래 칸에 넣어주세요'));
        })}>${tl('코드 받기')}</button></span>
      <span>
      <input inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder=${tl('메일로 온 숫자')} value=${code} onInput=${val(setCode)} />
      <button type="button" class="btn green sm" disabled=${busy || !email.includes('@') || code.trim().length < 6}
        onClick=${() => act(() => api.verify(email.trim(), code.trim()), () => setCode(''))}>${tl('로그인')}</button></span>`}
    ${cloud.userId && html`
      <label>${tl('내 이름')} <input maxlength="20" value=${name} onInput=${val(setName)}
        onBlur=${() => name.trim() !== (cloud.name ?? '') && act(() => api.setName(name))} /></label>
      ${!cloud.coupleId && html`<span>
        <button type="button" class="btn green sm" disabled=${busy} onClick=${() => act(api.createCouple)}>${tl('커플 만들기')}</button>
        <input class="code" maxlength="6" placeholder=${tl('초대코드')} value=${code} onInput=${val(setCode)} />
        <button type="button" class="btn blue sm" disabled=${busy || code.trim().length !== 6}
          onClick=${() => act(() => api.joinCouple(code), () => setCode(''))}>${tl('연결')}</button></span>`}
      ${cloud.coupleId && !cloud.partner && (cloud.code
        ? html`<p>${tl('초대코드')} <b class="invite">${cloud.code}</b>
            <button type="button" class="btn blue sm" onClick=${() => navigator.clipboard?.writeText(cloud.code).then(() => setMsg(tl('복사했어요')))}>${tl('복사')}</button>
            <br /><span class="muted small">${tl('상대가 설정 → 커플에서 이 코드를 넣으면 연결돼요')}</span></p>`
        : html`<p class="muted small">${tl('상대와 연결이 끊겼어요. 연결 끊기 후 새로 만들어요.')}</p>`)}
      ${cloud.partner && html`<p>❤ ${tl`${cloud.partner.name || tl('상대')}와 연결됨`}</p>
        <label>${tl('우리 탑 이름')} <span class="muted small">${tl('— 둘 다 같이 보여요')}</span>
          <input maxlength="40" placeholder=${tl('예: 같이 운동')} value=${title} onInput=${val(setTitle)}
            onBlur=${() => title.trim() !== (cloud.coupleTitle ?? '') && act(() => api.setCoupleInfo({ title }))} /></label>
        <label>${tl`${TOWER_HEIGHT}층 보상`} <span class="muted small">${tl('— 커플 탑이 완성되면 해줄 것')}</span>
          <input maxlength="40" placeholder=${tl('예: 삼겹살 🍖')} value=${reward} onInput=${val(setReward)}
            onBlur=${() => reward.trim() !== (cloud.coupleReward ?? '') && act(() => api.setCoupleInfo({ reward }))} /></label>`}
      <${PushRow} api=${api} />
      <span>
        ${cloud.coupleId && (leaving
          ? html`<button type="button" class="btn danger sm" disabled=${busy} onClick=${() => act(api.leave, () => setLeaving(false))}>${tl('정말 끊기')}</button>`
          : html`<button type="button" class="btn blue sm" onClick=${() => setLeaving(true)}>${tl('연결 끊기')}</button>`)}
        <button type="button" class="btn blue sm" disabled=${busy} onClick=${() => act(api.signOut)}>${tl('로그아웃')}</button>
        <span class="muted small">${cloud.email}</span>
      </span>`}
    ${msg && html`<p class="small" role="status">${msg}</p>`}
  </div>`;
}

function NoteBox({ note, onSave }) {
  const [t, setT] = useState(note);
  const [busy, setBusy] = useState(false);
  return html`<input class="note" maxlength="40" placeholder=${tl('한 줄 남기기')} value=${t} disabled=${busy}
    onInput=${(e) => setT(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()}
    onBlur=${() => { if (t.trim() !== note) { setBusy(true); onSave(t).finally(() => setBusy(false)); } }} />`;
}

const EMOJI = ['❤️', '🔥', '👏'];

// One photo with its caption. mine: {note, got, onSave} on my photo; theirs: {note, gave, onReact} on my partner's.
function Side({ id, who, mine, theirs }) {
  return html`<figure>
    <img src=${photoUrl(id)} alt=${tl`${who} 인증 사진`} />
    <figcaption>
      <b>${who}${mine?.got && html` <span title=${tl('받은 반응')}>${mine.got}</span>`}</b>
      ${mine && html`<${NoteBox} note=${mine.note} onSave=${mine.onSave} />`}
      ${theirs?.note && html`<span class="said">“${theirs.note}”</span>`}
      ${theirs && html`<span class="reacts">${EMOJI.map((e) => html`<button key=${e} type="button" class=${theirs.gave === e ? 'on' : ''}
        aria-pressed=${theirs.gave === e} onClick=${() => { buzz('tap'); theirs.onReact(theirs.gave === e ? null : e); }}>${e}</button>`)}</span>`}
    </figcaption>
  </figure>`;
}

// A couple day (partnerAssetId) shows both photos: mine left, theirs right.
export function Photo({ day, n, names, mine, theirs, onClose }) {
  const sides = day.partnerAssetId
    ? [[day.assetId, names[0], mine, null], [day.partnerAssetId, names[1], null, theirs]]
    : [[day.assetId, mine ? names[0] : names[1], mine, mine ? null : theirs]];
  return html`<${Win} title=${n ? tl`${n}층 · ${day.key}` : day.key} onClose=${onClose} cls="photo-win">
    <div class="body"><div class="duo">${sides.map(([id, who, m, t]) => html`<${Side} key=${id} id=${id} who=${who} mine=${m} theirs=${t} />`)}</div></div>
  </${Win}>`;
}

const WEEK = weekdays();

// Month calendar for the tab being viewed: a photo day shows its photo, a shield day 🛡.
// Couple tab: both of us → split photo, just one of us → a dot (left me, right my partner).
// mine/theirs: day docs; couple: coupleDays(); onPick(key) opens a day this tab has a photo for.
export function Calendar({ view, mine, theirs, couple, today, names, onPick, onClose }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const own = view === 'partner' ? theirs : mine;
  const count = (d, both) => Object.keys(d).filter((k) => k.startsWith(ym) && d[k]?.assetId && (!both || d[k].partnerAssetId)).length;
  const summary = view === 'couple'
    ? tl`둘 다 ${count(couple, true)}일 · ${names[0]} ${count(mine)}일 · ${names[1]} ${count(theirs)}일`
    : view === 'partner' ? tl`${names[1]} ${count(own)}일 인증` : tl`${count(own)}일 인증`;
  const cell = (k, i) => {
    if (!k) return html`<span key=${'e' + i} class="cal-day empty" />`;
    const d = view === 'couple' ? couple[k] : own[k];
    const cls = 'cal-day' + (k === today ? ' today' : '') + (k > today ? ' future' : '');
    const body = html`${d?.assetId && html`<img src=${photoUrl(d.assetId, true)} alt="" loading="lazy" class=${d.partnerAssetId ? 'half' : ''} />`}${
      d?.partnerAssetId && html`<img src=${photoUrl(d.partnerAssetId, true)} alt="" loading="lazy" class="half r" />`}${
      !d?.assetId && d?.shield && html`<i class="shield">🛡</i>`}${
      view === 'couple' && !d && html`${mine[k]?.assetId && html`<i class="dot l" />`}${theirs[k]?.assetId && html`<i class="dot r" />`}`}<b>${Number(k.slice(8))}</b>`;
    return d?.assetId
      ? html`<button key=${k} class=${cls} onClick=${() => onPick(k)} aria-label=${tl`${k} 사진`}>${body}</button>`
      : html`<span key=${k} class=${cls}>${body}</span>`;
  };
  return html`<${Win} title=${tl('📅 달력')} onClose=${onClose} cls="cal-win">
    <div class="body pad">
      <div class="cal-head">
        <button type="button" class="btn blue sm" onClick=${() => setYm(addMonths(ym, -1))} aria-label=${tl('지난달')}>◀</button>
        <b>${monthTitle(ym)}</b>
        <button type="button" class="btn blue sm" disabled=${ym >= today.slice(0, 7)} onClick=${() => setYm(addMonths(ym, 1))} aria-label=${tl('다음 달')}>▶</button>
      </div>
      <p class="cal-sum">${summary}</p>
      ${view === 'couple' && html`<p class="cal-key muted small"><i class="dot l" /> ${tl`${names[0]}만`} · <i class="dot r" /> ${tl`${names[1]}만`} · 🛡 ${tl('방어권')}</p>`}
      <div class="cal-grid">${WEEK.map((w) => html`<span key=${w} class="cal-w">${w}</span>`)}${monthGrid(ym).flat().map(cell)}</div>
    </div>
  </${Win}>`;
}

// One tower's photos in floor order; tapping one opens it.
function Thumbs({ keys, days, onPick }) {
  return html`<div class="thumbs">${keys.map((k, i) => html`
    <button key=${k} onClick=${() => onPick(k, i + 1)} aria-label=${tl`${k} 사진`}>
      <img src=${photoUrl(days[k].assetId, true)} alt="" loading="lazy" /><span>${i + 1}</span>
    </button>`)}</div>`;
}

// Hall of fame: every finished tower as a card (mini tower + top-floor photo); tap to see its floors.
// built: finished towers, newest first. onCollage(t) resolves to a JPEG File. Saving is its own tap,
// like the backup export: the share sheet only opens right after a tap, and building the image takes a moment.
export function Shelf({ built, days, onPick, onCollage, onSaveFile, onClose }) {
  const [open, setOpen] = useState(null);
  const [out, setOut] = useState(null); // {key, file: File | 'busy'} for the tower being made
  const make = (key, t) => { setOut({ key, file: 'busy' }); onCollage(t).then((file) => setOut({ key, file }), () => setOut(null)); };
  return html`<${Win} title=${tl('🏰 명예의 전당')} onClose=${onClose} cls="album-win">
    <div class="body album shelf">${built.map((t, i) => html`
      <section key=${t.keys[0]}>
        <button class="trophy" aria-expanded=${open === t.keys[0]} onClick=${() => setOpen(open === t.keys[0] ? null : t.keys[0])}>
          <span class="mini" aria-hidden="true">${t.keys.map((k, f) => html`<i key=${k} style=${{ background: TIER[Math.floor(f / 10)] }} />`)}🚩</span>
          <img src=${photoUrl(days[t.keys.at(-1)].assetId, true)} alt="" loading="lazy" />
          <span class="info"><b>🏰 ${tl`${built.length - i}번째 탑`}</b><small class="muted">${t.keys[0]} ~ ${t.keys.at(-1)}</small>
            <small class="muted">${open === t.keys[0] ? tl('▲ 접기') : tl`▼ ${TOWER_HEIGHT}층 사진 보기`}</small></span>
        </button>
        ${open === t.keys[0] && html`<p class="collage">${out?.key === t.keys[0] && out.file instanceof File
          ? html`<button type="button" class="btn green sm" onClick=${() => onSaveFile(out.file)}>${tl('📤 콜라주 저장하기')}</button>`
          : html`<button type="button" class="btn blue sm" disabled=${out?.file === 'busy'} onClick=${() => make(t.keys[0], t)}>${
            out?.key === t.keys[0] && out.file === 'busy' ? tl('만드는 중…') : tl('🖼 콜라주 만들기')}</button>`}</p>
          <${Thumbs} keys=${t.keys} days=${days} onPick=${onPick} />`}
      </section>`)}
    </div>
  </${Win}>`;
}

// current + past towers, newest first; each shows its photos in date order.
export function Album({ current, past, days, onPick, onClose }) {
  const list = [...(current ? [{ ...current, kind: 'live' }] : []), ...past];
  const head = (t) => ({
    live: tl`🏗 쌓는 중 · ${t.keys.length}층`,
    built: tl`🏰 완성 · ${TOWER_HEIGHT}층`,
    fell: tl`💥 ${t.keys.length}층에서 붕괴`,
    reset: tl`🔁 ${t.keys.length}층에서 새로 시작`,
  })[t.kind];
  return html`<${Win} title=${tl('앨범')} onClose=${onClose} cls="album-win">
    <div class="body album">${list.length === 0 ? html`<p class="empty">${tl('아직 인증 사진이 없어요')}</p>` : list.map((t) => html`
      <section key=${t.keys[0]}>
        <h3>${head(t)} <small class="muted">${t.keys[0]} ~ ${t.keys.at(-1)}</small></h3>
        <${Thumbs} keys=${t.keys} days=${days} onPick=${onPick} />
      </section>`)}
    </div>
  </${Win}>`;
}

// shield: null (can't help), {left, onUse} (fill yesterday with mine), {none} (used this month),
// or {waiting: name} (the couple tower needs my partner's shield).
export function FallNotice({ floors, onOk, title = tl('탑이 무너졌어요'), shield }) {
  const [busy, setBusy] = useState(false);
  const use = () => { setBusy(true); shield.onUse().finally(() => setBusy(false)); };
  return html`<${Win} title=${title} cls="fall-win">
    <div class="body pad center">
      <p class="big">${tl`💥 ${floors}층에서 무너졌어요`}</p>
      ${shield?.onUse && html`<p>${tl('🛡 방어권으로 어제를 메우면 탑이 다시 서요')}<br /><span class="muted small">${tl`이번 달 ${shield.left}개 남음 · 층은 안 올라가요`}</span></p>`}
      ${shield?.none && html`<p class="muted small">${tl('이번 달 방어권은 이미 썼어요')}</p>`}
      ${shield?.waiting && html`<p class="muted small">${tl`${shield.waiting}님이 어제 방어권을 쓰면 우리 탑이 다시 서요`}</p>`}
      <p class="muted">${tl('사진은 앨범에 남아 있어요. 오늘부터 다시 쌓아요!')}</p>
    </div>
    <div class="foot"><span>${shield?.onUse && html`<button class="btn green" disabled=${busy} onClick=${use}>${tl('🛡 방어권 쓰기')}</button>`}</span>
      <button class="btn orange" disabled=${busy} onClick=${onOk}>${tl('다시 쌓기')}</button></div>
  </${Win}>`;
}

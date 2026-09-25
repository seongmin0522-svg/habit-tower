import { html, render, useState, useEffect, useMemo, useRef } from './ui/h.js';
import { todayKST, towers, pendingFall, TOWER_HEIGHT } from './logic.js';
import { connect, connectAssets, subscribe, makeActions } from './db.js';
import { Scene } from './ui/scene.js';
import { Setup, Photo, Album, FallNotice } from './ui/windows.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STACK_MS = REDUCED ? 0 : 2800; // matches the CSS stack sequence
const FALL_MS = REDUCED ? 0 : 2600;  // matches the CSS collapse sequence

function App() {
  const [db, setDb] = useState(undefined); // undefined = connecting, null = unavailable
  const [assets, setAssets] = useState(null);
  const [state, setState] = useState({ habit: null, days: {}, loaded: false });
  const [today, setToday] = useState(todayKST());
  const [toast, setToast] = useState('');
  const [anim, setAnim] = useState(null);   // null | {kind:'stack'} | {kind:'fall', keys}
  const [fall, setFall] = useState(null);   // the fallen tower whose notice is up
  const [modal, setModal] = useState(null); // null | 'setup' | 'album' | {key, n}
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    connect().then(setDb, () => setDb(null));
    connectAssets().then(setAssets, () => setAssets(null));
  }, []);
  useEffect(() => db ? subscribe(db, setState, (e) => setToast('동기화 오류: ' + e.code)) : undefined, [db]);
  useEffect(() => { const t = setInterval(() => setToday(todayKST()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);
  const actions = useMemo(() => db && makeActions(db, assets, () => stateRef.current), [db, assets]);

  const { current, past } = useMemo(() => towers(state.days, today), [state.days, today]);
  const keys = current?.keys ?? [];
  const built = past.filter((t) => t.kind === 'built').length;
  const doneToday = !!state.days[today]?.assetId;
  const ready = !!actions && state.loaded;
  const fail = (e) => setToast('실패: ' + (e?.message ?? e?.code ?? e));

  // A collapse plays once, the first time the page sees it — also when midnight passes with the page open.
  const fallChecked = useRef('');
  useEffect(() => {
    if (!state.loaded || !state.habit || fallChecked.current === today) return;
    fallChecked.current = today;
    const pf = pendingFall(state.days, today, state.habit.seenFall);
    if (!pf) return;
    setAnim({ kind: 'fall', keys: pf.keys });
    setTimeout(() => setFall(pf), FALL_MS);
  }, [state.loaded, state.habit, today]);

  const ackFall = () => actions.ackFall(fall.keys.at(-1)).then(() => { setFall(null); setAnim(null); }, fail);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    let t;
    try {
      // Start the walk-in before the block appears, so it never flashes on top first.
      const r = await actions.certify(file, ({ retake }) => {
        if (!retake) { setAnim({ kind: 'stack' }); t = setTimeout(() => setAnim(null), STACK_MS); }
      });
      if (r.retake) setToast('오늘 사진을 바꿨어요');
    } catch (err) { clearTimeout(t); setAnim(null); fail(err); } finally { setBusy(false); }
  };

  const camera = (label, cls) => html`<label class=${'btn ' + cls + (busy || !assets || anim || fall ? ' off' : '')}>
    <input type="file" accept="image/*" capture="environment" hidden disabled=${busy || !assets || !ready || !!anim || !!fall} onChange=${onPhoto} />
    ${busy ? '올리는 중…' : label}</label>`;

  const needSetup = state.loaded && !state.habit;
  return html`
    ${db === null && html`<div class="banner">저장 안 됨 — claude.ai에서 열어주세요</div>`}
    <header class="hud">
      <div class="ttlbox">
        <b>${state.habit?.title ?? '해빗 타워'}</b>
        <span class="gold">${keys.length}/${TOWER_HEIGHT}층</span>
        ${built > 0 && html`<span title="완성한 탑">🏰×${built}</span>`}
      </div>
      <span>
        <button class="btn blue sm" disabled=${!state.loaded} onClick=${() => setModal('album')}>앨범</button>
        <button class="btn blue sm" disabled=${!ready || !state.habit} onClick=${() => setModal('setup')}>설정</button>
      </span>
    </header>
    <main class="stage">
      ${state.habit && html`<${Scene} character=${state.habit.character} keys=${keys} anim=${anim}
        rubble=${past[0]?.kind === 'fell'} onBlock=${(k) => setModal({ key: k, n: keys.indexOf(k) + 1 })} />`}
    </main>
    <footer class="bar">
      ${!state.habit ? null
        : doneToday
          ? html`<span class="done">오늘 완료 ✓</span>${camera('다시 찍기', 'blue sm')}`
          : camera('📷 인증하고 쌓기', 'green big')}
      ${state.habit && !assets && db !== undefined && html`<span class="muted small">사진 저장을 쓸 수 없어요</span>`}
    </footer>
    ${(needSetup || modal === 'setup') && html`<${Setup} habit=${state.habit} onClose=${() => setModal(null)}
      onSave=${(f) => actions.setHabit(f).then(() => setModal(null), fail)} />`}
    ${modal === 'album' && html`<${Album} current=${current} past=${past} days=${state.days}
      onPick=${(k, n) => setModal({ key: k, n })} onClose=${() => setModal(null)} />`}
    ${modal?.key && html`<${Photo} day=${{ key: modal.key, ...state.days[modal.key] }} n=${modal.n} onClose=${() => setModal(null)} />`}
    ${fall && html`<${FallNotice} floors=${fall.keys.length} onOk=${ackFall} />`}
    ${toast && html`<div class="toast" role="alert">${toast}</div>`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));

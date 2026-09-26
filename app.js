import { html, render, useState, useEffect, useMemo, useRef } from './ui/h.js';
import { todayKST, towers, pendingFall, TOWER_HEIGHT } from './logic.js';
import { connect, connectAssets, subscribe, makeActions, localBackup, MODE } from './db.js';
import { Scene } from './ui/scene.js';
import { Setup, Photo, Album, FallNotice } from './ui/windows.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STACK_MS = REDUCED ? 0 : 9000; // safety net; Scene's onDone normally ends the sequence first
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

  const [backup, setBackup] = useState(null);
  useEffect(() => {
    connect().then(setDb, () => setDb(null));
    connectAssets().then(setAssets, () => setAssets(null));
    localBackup().then(setBackup, () => {});
  }, []);
  useEffect(() => db ? subscribe(db, setState, (e) => setToast('동기화 오류: ' + e.code)) : undefined, [db]);
  useEffect(() => {
    // Timers sleep while the phone app is in the background: re-check the date on return too.
    const tick = () => setToday(todayKST());
    const t = setInterval(tick, 60000);
    const onShow = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, []);
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

  // Export is two taps: building the file can take seconds with many photos, and the share sheet
  // only opens right after a tap (Safari is strict), so "저장하기" gets its own fresh tap.
  const onExport = () => backup.save()
    .then((blob) => new File([blob], `habit-tower-backup-${today}.json`, { type: 'application/json' }))
    .catch((e) => { fail(e); throw e; });
  // Share sheet where it can take files ("파일에 저장" on iPhone, Drive on Android), else a plain download.
  const onSaveFile = (file) => {
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: file.name }).catch((e) => e.name !== 'AbortError' && fail(e));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  const onReset = () => backup.reset().then(() => location.reload(), fail);
  const onImport = (file) => backup.restore(file).then((r) => {
    setModal(null);
    setToast(`복원 완료: 기록 ${r.days}일 · 사진 ${r.photos}장`);
  }, fail);

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

  // Android back button closes the open window instead of leaving the app.
  useEffect(() => {
    if (!modal) return;
    history.pushState({ win: 1 }, '');
    const onPop = () => setModal(null);
    addEventListener('popstate', onPop);
    return () => {
      removeEventListener('popstate', onPop);
      if (history.state?.win) history.back(); // closed by ✕: drop the entry we pushed
    };
  }, [!!modal]);
  return html`
    ${db === null && html`<div class="banner">저장소를 쓸 수 없어요 — 크롬에서 열어주세요</div>`}
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
      <div class="world">
        ${state.habit && html`<${Scene} character=${state.habit.character} keys=${keys} days=${state.days} anim=${anim}
          rubble=${past[0]?.kind === 'fell'} onBlock=${(k) => setModal({ key: k, n: keys.indexOf(k) + 1 })}
          onDone=${() => setAnim((a) => (a?.kind === 'stack' ? null : a))} />`}
        <div class="ground" />
      </div>
    </main>
    <footer class="bar">
      ${!state.habit ? null
        : doneToday
          ? html`<span class="done">오늘 완료 ✓</span>${camera('다시 찍기', 'blue sm')}`
          : camera('📷 인증하고 쌓기', 'green big')}
      ${state.habit && !assets && db !== undefined && html`<span class="muted small">사진 저장을 쓸 수 없어요</span>`}
    </footer>
    ${(needSetup || modal === 'setup') && html`<${Setup} habit=${state.habit} onClose=${() => setModal(null)}
      backup=${backup} onExport=${onExport} onSaveFile=${onSaveFile} onImport=${onImport} onReset=${onReset}
      onSave=${(f) => actions.setHabit(f).then(() => setModal(null), fail)} />`}
    ${modal === 'album' && html`<${Album} current=${current} past=${past} days=${state.days}
      onPick=${(k, n) => setModal({ key: k, n })} onClose=${() => setModal(null)} />`}
    ${modal?.key && html`<${Photo} day=${{ key: modal.key, ...state.days[modal.key] }} n=${modal.n} onClose=${() => setModal(null)} />`}
    ${fall && html`<${FallNotice} floors=${fall.keys.length} onOk=${ackFall} />`}
    ${toast && html`<div class="toast" role="alert">${toast}</div>`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));

// Installed-app shell: offline start and "앱 설치" in Chrome. Not in claude.ai, ?dev or on localhost,
// where a cache-first worker would serve yesterday's code during development.
if (MODE === 'local' && location.hostname !== 'localhost' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

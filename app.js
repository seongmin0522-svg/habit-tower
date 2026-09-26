import { html, render, useState, useEffect, useMemo, useRef } from './ui/h.js';
import { todayKST, towers, pendingFall, coupleDays, toUpload, shieldDay, shieldsLeft, TOWER_HEIGHT } from './logic.js';
import { connect, connectAssets, subscribe, makeActions, localBackup, localStore, MODE } from './db.js';
import { Scene } from './ui/scene.js';
import { Setup, Photo, Album, FallNotice } from './ui/windows.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STACK_MS = REDUCED ? 0 : 9000; // safety net; Scene's onDone normally ends the sequence first
const FALL_MS = REDUCED ? 0 : 2600;  // matches the CSS collapse sequence
const EMPTY = {};

function App() {
  const [db, setDb] = useState(undefined); // undefined = connecting, null = unavailable
  const [assets, setAssets] = useState(null);
  const [state, setState] = useState({ habit: null, days: {}, loaded: false });
  const [today, setToday] = useState(todayKST());
  const [toast, setToast] = useState('');
  const [anim, setAnim] = useState(null);   // null | {kind:'stack'} | {kind:'fall', keys}
  const [fall, setFall] = useState(null);   // the fallen tower whose notice is up, with scope 'me' | 'couple'
  const [modal, setModal] = useState(null); // null | 'setup' | 'album' | {key, n}
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState(null);       // couple-mode state from cloud.js; null = off
  const [cloudApi, setCloudApi] = useState(null);
  const [tab, setTab] = useState('couple');       // 'me' | 'couple' | 'partner', only while coupled
  const stateRef = useRef(state);
  stateRef.current = state;

  const [backup, setBackup] = useState(null);
  useEffect(() => {
    connect().then(setDb, () => setDb(null));
    connectAssets().then(setAssets, () => setAssets(null));
    localBackup().then(setBackup, () => {});
    localStore().then((l) => l && import('./cloud.js').then((m) => m.openCloud(l, setCloud))).then(setCloudApi, () => {});
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
  // Couple mode syncs on launch and whenever the app comes back to the front.
  useEffect(() => {
    if (!cloudApi) return;
    cloudApi.sync();
    const onShow = () => document.visibilityState === 'visible' && cloudApi.sync();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [cloudApi]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);
  const actions = useMemo(() => db && makeActions(db, assets, () => stateRef.current), [db, assets]);

  const partner = cloud?.partner;
  const coupled = !!partner;
  const pdays = cloud?.partnerDays ?? EMPTY;
  const cdays = useMemo(() => coupleDays(state.days, pdays), [state.days, pdays]);
  // Start-over bookmarks: mine only on my phone; the couple one is shared, and the later of the two wins.
  const cutMe = state.habit?.cutMe ?? null;
  const cutCouple = [state.habit?.cutCouple, partner?.coupleCut].filter(Boolean).sort().at(-1) ?? null;
  const views = useMemo(() => ({
    me: towers(state.days, today, cutMe), couple: towers(cdays, today, cutCouple), partner: towers(pdays, today),
  }), [state.days, cdays, pdays, today, cutMe, cutCouple]);
  const view = coupled ? tab : 'me';
  const { current, past } = views[view];
  const days = { me: state.days, couple: cdays, partner: pdays }[view];
  const partnerName = partner?.name || '상대';
  const got = cloud?.got ?? EMPTY, gave = cloud?.gave ?? EMPTY;
  const badge = (k) => ({ me: { r: got[k] }, couple: { l: got[k], r: gave[k] }, partner: { r: gave[k] } })[view];
  const pending = cloud?.userId ? toUpload(state.days, cloud.mine ?? EMPTY, cloud.userId).length : 0;
  const keys = current?.keys ?? [];
  const built = past.filter((t) => t.kind === 'built').length;
  const title = { me: state.habit?.title, couple: `❤ ${cloud?.coupleTitle || '우리 탑'}`, partner: `${partnerName} · ${partner?.habit ?? ''}` }[view] ?? '해빗 타워';
  const doneToday = !!state.days[today]?.assetId;
  const ready = !!actions && state.loaded;
  const fail = (e) => setToast('실패: ' + (e?.message ?? e?.code ?? e));

  // A collapse plays once, the first time the page sees it — also when midnight passes with the page open.
  // My tower first, then the couple tower; the couple one only after this launch has synced,
  // so a stale partner cache never fakes a collapse.
  const fallChecked = useRef({});
  useEffect(() => {
    if (!state.loaded || !state.habit || anim || fall) return;
    const check = (scope, d, seen, cut) => {
      if (fallChecked.current[scope] === today) return null;
      fallChecked.current[scope] = today;
      const pf = pendingFall(d, today, seen, cut);
      return pf && { ...pf, scope };
    };
    const pf = check('me', state.days, state.habit.seenFall, cutMe)
      ?? (coupled && cloud.synced ? check('couple', cdays, state.habit.seenCoupleFall, cutCouple) : null);
    if (!pf) return;
    if (coupled) setTab(pf.scope);
    setAnim({ kind: 'fall', keys: pf.keys });
    setTimeout(() => setFall(pf), FALL_MS);
  }, [state.loaded, state.habit, today, anim, fall, coupled, cloud?.synced, cdays, cutCouple]);

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
  // Signed in: the cloud copy goes first, so a failed wipe (offline) leaves everything as it was.
  const onReset = () => (cloud?.userId ? cloudApi.wipe() : Promise.resolve())
    .then(() => backup.reset()).then(() => location.reload(), fail);
  const onImport = (file) => backup.restore(file).then((r) => {
    setModal(null);
    setToast(`복원 완료: 기록 ${r.days}일 · 사진 ${r.photos}장`);
    cloudApi?.sync();
  }, fail);

  // Shield offer on the collapse notice. The couple tower can only be saved with my shield when I'm the one who missed.
  const shield = (() => {
    const gap = fall && shieldDay(fall, today);
    if (!gap) return null;
    const missed = !state.days[gap]?.assetId && !state.days[gap]?.shield;
    if (fall.scope === 'couple' && !missed) return { waiting: partnerName };
    const left = shieldsLeft(state.days, gap);
    return left ? {
      left,
      onUse: () => actions.useShield(gap).then(() => {
        setFall(null);
        setAnim(null);
        setToast('🛡 방어권으로 탑을 지켰어요');
        cloudApi?.sync();
      }, fail),
    } : { none: true };
  })();

  const ackFall = () => actions.mark(fall.scope === 'couple' ? 'seenCoupleFall' : 'seenFall', fall.keys.at(-1))
    .then(() => { setFall(null); setAnim(null); }, fail);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    let t;
    try {
      // Start the walk-in before the block appears, so it never flashes on top first.
      // If my partner already certified today, the brick goes on the couple tower.
      const r = await actions.certify(file, ({ retake }) => {
        if (retake) return;
        if (coupled) setTab(pdays[today]?.assetId ? 'couple' : 'me');
        setAnim({ kind: 'stack' });
        t = setTimeout(() => setAnim(null), STACK_MS);
      });
      if (r.retake) setToast('오늘 사진을 바꿨어요');
      cloudApi?.sync();
    } catch (err) { clearTimeout(t); setAnim(null); fail(err); } finally { setBusy(false); }
  };

  const camera = (label, cls) => html`<label class=${'btn ' + cls + (busy || !assets || anim || fall ? ' off' : '')}>
    <input type="file" accept="image/*" capture="environment" hidden disabled=${busy || !assets || !ready || !!anim || !!fall} onChange=${onPhoto} />
    ${busy ? '올리는 중…' : label}</label>`;

  const needSetup = state.loaded && !state.habit;

  // "새로 쌓기": end the tower on this tab at its last floor. The couple bookmark also goes to the cloud
  // so my partner's couple tower restarts too.
  const restart = keys.length && view !== 'partner' ? {
    label: view === 'couple' ? '커플 탑 새로 쌓기' : '내 탑 새로 쌓기',
    floors: keys.length,
    onRestart: () => actions.mark(view === 'couple' ? 'cutCouple' : 'cutMe', keys.at(-1))
      .then(() => { setModal(null); cloudApi?.sync(); }, fail),
  } : null;

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
  const partnerDone = !!pdays[today]?.assetId;
  // Nudge through the phone's share sheet (KakaoTalk etc.); no push server needed. Else copy the text.
  const poke = () => {
    const text = `${partnerName}! 오늘 ${partner.habit || '인증'} 아직이야 👉 우리 탑 무너진다 😱\n${location.origin}${location.pathname}`;
    if (navigator.share) navigator.share({ text }).catch((e) => e.name !== 'AbortError' && fail(e));
    else navigator.clipboard?.writeText(text).then(() => setToast('문구를 복사했어요 — 카톡에 붙여넣어 주세요'), fail);
  };
  const pokeBtn = coupled && !partnerDone && html`<button class="btn orange sm" onClick=${poke}>👉 콕 찌르기</button>`;
  return html`
    ${db === null && html`<div class="banner">저장소를 쓸 수 없어요 — 크롬에서 열어주세요</div>`}
    <header class="hud">
      <div class="ttlbox">
        <b>${title}</b>
        <span class="gold">${keys.length}/${TOWER_HEIGHT}층</span>
        ${built > 0 && html`<span title="완성한 탑">🏰×${built}</span>`}
      </div>
      <span>
        <button class="btn blue sm" disabled=${!state.loaded} onClick=${() => setModal('album')}>앨범</button>
        <button class="btn blue sm" disabled=${!ready || !state.habit} onClick=${() => setModal('setup')}>설정</button>
      </span>
    </header>
    ${coupled && html`<nav class="tabs" role="tablist">${[['me', '나'], ['couple', '❤ 커플'], ['partner', partnerName]].map(([id, label]) => html`
      <button key=${id} role="tab" aria-selected=${view === id} disabled=${!!anim || !!fall}
        onClick=${() => { setTab(id); cloudApi?.sync(); }}>${label}</button>`)}</nav>`}
    ${view === 'couple' && cloud?.coupleReward && html`<div class="reward">${keys.length === TOWER_HEIGHT
      ? `🎉 보상 받을 시간! ${cloud.coupleReward}`
      : `🎁 ${TOWER_HEIGHT}층 → ${cloud.coupleReward} · ${TOWER_HEIGHT - keys.length}층 남음`}</div>`}
    <main class="stage">
      <div class="world">
        ${state.habit && html`<${Scene} key=${view}
          character=${view === 'partner' ? partner.character : state.habit.character}
          partnerCharacter=${view === 'couple' ? partner.character : null}
          keys=${keys} days=${days} anim=${anim} rubble=${past[0]?.kind === 'fell'} badge=${badge}
          onBlock=${(k) => setModal({ key: k, n: keys.indexOf(k) + 1 })}
          onDone=${() => setAnim((a) => (a?.kind === 'stack' ? null : a))} />`}
        <div class="ground" />
      </div>
    </main>
    <footer class="bar">
      ${!state.habit ? null
        : view === 'partner'
          ? html`<span class=${partnerDone ? 'done' : 'muted'}>${partnerName} ${partnerDone ? '오늘 완료 ✓' : '오늘 아직'}</span>${pokeBtn}`
          : doneToday
            ? html`<span class="done">오늘 완료 ✓</span>${camera('다시 찍기', 'blue sm')}${view === 'couple' && pokeBtn}`
            : html`${camera('📷 인증하고 쌓기', 'green big')}${view === 'couple' && pokeBtn}`}
      ${pending > 0 && html`<span class="muted small">☁ 올릴 기록 ${pending}개</span>`}
      ${state.habit && !assets && db !== undefined && html`<span class="muted small">사진 저장을 쓸 수 없어요</span>`}
    </footer>
    ${(needSetup || modal === 'setup') && html`<${Setup} habit=${state.habit} onClose=${() => setModal(null)}
      backup=${backup} onExport=${onExport} onSaveFile=${onSaveFile} onImport=${onImport} onReset=${onReset}
      cloud=${cloud} cloudApi=${cloudApi} restart=${restart}
      onSave=${(f) => actions.setHabit(f).then(() => { setModal(null); cloudApi?.sync(); }, fail)} />`}
    ${modal === 'album' && html`<${Album} current=${current} past=${past} days=${days}
      onPick=${(k, n) => setModal({ key: k, n })} onClose=${() => setModal(null)} />`}
    ${modal?.key && html`<${Photo} day=${{ key: modal.key, ...days[modal.key] }} n=${modal.n}
      names=${[cloud?.name || '나', partnerName]} onClose=${() => setModal(null)}
      mine=${view !== 'partner' && {
        note: state.days[modal.key]?.note ?? '', got: got[modal.key],
        onSave: (t) => actions.setNote(modal.key, t).then(() => cloudApi?.sync(), fail),
      }}
      theirs=${view !== 'me' && coupled && {
        note: pdays[modal.key]?.note ?? '', gave: gave[modal.key],
        onReact: (e) => cloudApi.react(modal.key, e).catch(fail),
      }} />`}
    ${fall && html`<${FallNotice} floors=${fall.keys.length} onOk=${ackFall}
      title=${fall.scope === 'couple' ? '우리 탑이 무너졌어요' : undefined} shield=${shield} />`}
    ${toast && html`<div class="toast" role="alert">${toast}</div>`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));

// Installed-app shell: offline start and "앱 설치" in Chrome. Not in claude.ai, ?dev or on localhost/127.0.0.1,
// where a cache-first worker would serve yesterday's code during development.
if (MODE === 'local' && !['localhost', '127.0.0.1'].includes(location.hostname) && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

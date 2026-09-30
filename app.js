import { html, render, useState, useEffect, useMemo, useRef } from './ui/h.js';
import { localDay, coupleToday, towers, pendingFall, coupleDays, halfBrick, toUpload, shieldDay, shieldsLeft, TOWER_HEIGHT, boxes, shards, owned, titles, allOwned } from './logic.js';
import { connect, connectAssets, subscribe, makeActions, localBackup, localStore, MODE, rewardsFrom } from './db.js';
import { ITEMS, STARTER, TITLES, ACCESSORIES, FOODS, SHOP } from './catalog.js';
import { balance, placeIn } from './shop.js';
import { initSound, sfx, getPrefs, setPrefs, onPrefs } from './sound.js';
import { buzz } from './haptic.js';
import { Scene } from './ui/scene.js';
import { Setup, Photo, Album, Shelf, Calendar, FallNotice } from './ui/windows.js';
import { Bag, BoxReveal } from './ui/bag.js';
import { Playroom } from './ui/playroom.js';
import { Battle } from './ui/battle.js';
import { Maze } from './ui/maze.js';
import { battleRecord } from './battle.js';
import { heartsOf, levelOf, accsUnlocked } from './pet.js';
import { getAdmin, setAdmin, onAdmin } from './admin.js';
import { ADMIN_IDS } from './config.js';
import { LANG } from './i18n.js';

document.documentElement.lang = LANG; // screen readers and fonts pick the language

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STACK_MS = REDUCED ? 0 : 9000; // safety net; Scene's onDone normally ends the sequence first
const FALL_MS = REDUCED ? 0 : 2600;  // matches the CSS collapse sequence
const EMPTY = {};
const ADMIN_FOOD = FOODS.flatMap((f) => Array(5).fill(f.id)); // admin test mode: a full tray that never empties
const sandbox = (v) => Promise.resolve(v); // admin test mode: play results aren't saved
const ALL_SHOP = Object.fromEntries([...SHOP.keys()].map((id) => [id, {}])); // admin test mode: every shop item
// Monster buddy from a look: a catalog monster or the starter snail.
const buddy = (l) => ({ id: ITEMS.get(l.monster)?.base ? l.monster : STARTER, shiny: !!(l.monster && l.shiny),
  acc: ACCESSORIES.some((a) => a.id === l.acc) ? l.acc : null });
initSound();

function App() {
  const [db, setDb] = useState(undefined); // undefined = connecting, null = unavailable
  const [assets, setAssets] = useState(null);
  const [state, setState] = useState({ habit: null, days: {}, pulls: {}, pets: {}, play: {}, maze: {}, shop: {}, room: null, loaded: false });
  const [today, setToday] = useState(localDay());
  const [partnerToday, setPartnerToday] = useState(null); // my partner's local day (their time zone), null when single
  const [toast, setToast] = useState('');
  const [anim, setAnim] = useState(null);   // null | {kind:'stack'} | {kind:'fall', keys}
  const [fall, setFall] = useState(null);   // the fallen tower whose notice is up, with scope 'me' | 'couple'
  const [modal, setModal] = useState(null); // null | 'setup' | 'album' | 'shelf' | 'calendar' | 'bag' | 'reveal' | 'play' | 'battle' | 'maze' | 'visit' | {key, n (0 = not a floor)}
  const [revealNext, setRevealNext] = useState(false); // a new box waits for the stacking to finish
  const [revealBox, setRevealBox] = useState(null);    // the box on the reveal window (it stays after it's opened)
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState(null);       // couple-mode state from cloud.js; null = off
  const [cloudApi, setCloudApi] = useState(null);
  const [tab, setTab] = useState('couple');       // 'me' | 'couple' | 'partner', only while coupled
  const stateRef = useRef(state);
  stateRef.current = state;

  const [sound, setSound] = useState(getPrefs());
  useEffect(() => onPrefs(setSound), []);
  const muted = !sound.bgm && !sound.sfx;
  const [backup, setBackup] = useState(null);
  useEffect(() => {
    connect().then(setDb, () => setDb(null));
    connectAssets().then(setAssets, () => setAssets(null));
    localBackup().then(setBackup, () => {});
    localStore().then((l) => l && import('./cloud.js').then((m) => m.openCloud(l, setCloud))).then(setCloudApi, () => {});
  }, []);
  useEffect(() => db ? subscribe(db, setState, (e) => setToast('동기화 오류: ' + e.code)) : undefined, [db]);
  // Timers sleep while the phone app is in the background: re-check the date on return too.
  // My partner's date follows their own time zone (couples can live apart).
  const partnerTz = cloud?.partner?.tz ?? null;
  useEffect(() => {
    const tick = () => { setToday(localDay()); setPartnerToday(partnerTz && localDay(new Date(), partnerTz)); };
    tick();
    const t = setInterval(tick, 60000);
    const onShow = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [partnerTz]);
  // Couple mode syncs on launch and whenever the app comes back to the front.
  useEffect(() => {
    if (!cloudApi) return;
    cloudApi.sync();
    const onShow = () => document.visibilityState === 'visible' && cloudApi.sync({ lazy: true });
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [cloudApi]);
  // Partner push tapped with the app open (sw.js): show the couple tab with fresh partner data.
  useEffect(() => {
    const onMsg = (e) => { if (e.data?.tab !== 'couple') return; setTab('couple'); cloudApi?.sync(); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [cloudApi]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);
  // Admin test mode (admin.js): only for ADMIN_IDS while signed in.
  const [adminPrefs, setAdminPrefs] = useState(getAdmin());
  useEffect(() => onAdmin(setAdminPrefs), []);
  // ?dev (in-memory, nothing real at stake) shows the switch too, so it can be tested locally.
  const isAdminUser = ADMIN_IDS.includes(cloud?.userId) || MODE === 'dev', admin = isAdminUser && adminPrefs.on;
  const actions = useMemo(() => db && makeActions(db, assets, () => stateRef.current), [db, assets]);

  const partner = cloud?.partner;
  const coupled = !!partner;
  const pdays = cloud?.partnerDays ?? EMPTY;
  const cdays = useMemo(() => coupleDays(state.days, pdays), [state.days, pdays]);
  // The couple's day is the earlier of our two local days; my partner's own tower runs on their day.
  const ctoday = coupleToday(today, partnerToday);
  const ptoday = partnerToday ?? today;
  // Start-over bookmarks: mine only on my phone; the couple one is shared, and the later of the two wins.
  const cutMe = state.habit?.cutMe ?? null;
  const cutCouple = [state.habit?.cutCouple, partner?.coupleCut].filter(Boolean).sort().at(-1) ?? null;
  const views = useMemo(() => ({
    me: towers(state.days, today, cutMe), couple: towers(cdays, ctoday, cutCouple), partner: towers(pdays, ptoday),
  }), [state.days, cdays, pdays, today, ctoday, ptoday, cutMe, cutCouple]);
  const view = coupled ? tab : 'me';
  const { current, past } = views[view];
  const days = { me: state.days, couple: cdays, partner: pdays }[view];
  const partnerName = partner?.name || '상대';
  const got = cloud?.got ?? EMPTY, gave = cloud?.gave ?? EMPTY;
  const badge = (k) => ({ me: { r: got[k] }, couple: { l: got[k], r: gave[k] }, partner: { r: gave[k] } })[view];
  const pending = cloud?.userId ? toUpload(state.days, cloud.mine ?? EMPTY, cloud.userId).length : 0;
  const keys = current?.keys ?? [];
  const half = view === 'couple' ? halfBrick(state.days, pdays, ctoday) : null;
  // Finished towers, newest first; a tower topped today counts already.
  const builtTowers = [...(keys.length === TOWER_HEIGHT ? [current] : []), ...past.filter((t) => t.kind === 'built')];
  const built = builtTowers.length;
  const title = { me: state.habit?.title, couple: `❤ ${cloud?.coupleTitle || '우리 탑'}`, partner: `${partnerName} · ${partner?.habit ?? ''}` }[view] ?? '해빗 타워';
  const doneToday = !!state.days[today]?.assetId;
  const ready = !!actions && state.loaded;

  // Rewards. Couple boxes only once this launch has synced my partner's days.
  const boxCdays = coupled && cloud?.synced ? cdays : EMPTY;
  const clears = Object.keys(state.maze).length; // maze clear days: one box shard each
  const unopened = useMemo(() => boxes({ days: state.days, cdays: boxCdays, pulls: state.pulls, from: rewardsFrom, pets: state.pets, clears }),
    [state.days, boxCdays, state.pulls, state.pets, clears]);
  const have = useMemo(() => (admin ? allOwned() : owned(state.pulls, state.pets)), [admin, state.pulls, state.pets]);
  const earned = useMemo(() => (admin ? new Set(TITLES.map((t) => t.id))
    : titles({ days: state.days, cdays: coupled ? cdays : EMPTY, pulls: state.pulls, today })), [admin, state.days, cdays, coupled, state.pulls, today]);
  // Admin test mode wears and decorates from its own memo (admin.js), never my real records.
  const myLook = admin ? { ...state.habit?.look, ...adminPrefs.look } : state.habit?.look ?? EMPTY;
  const pLook = partner?.look ?? EMPTY, cSkin = admin ? { ...cloud?.coupleSkin, ...adminPrefs.coupleSkin } : cloud?.coupleSkin ?? EMPTY;
  const myRoom = admin ? adminPrefs.room ?? state.room : state.room;
  const look = {
    me: { monsters: [buddy(myLook)], hero: myLook.char, bg: myLook.bg, brick: myLook.brick, flag: myLook.flag, badge: myLook.badge },
    partner: { monsters: [buddy(pLook)], hero: pLook.char, bg: pLook.bg, brick: pLook.brick, flag: pLook.flag, badge: pLook.badge },
    couple: { monsters: [buddy(myLook), buddy(pLook)], hero: myLook.char, partnerHero: pLook.char,
      bg: cSkin.bg, brick: cSkin.brick, flag: cSkin.flag, badge: myLook.badge },
  }[view];
  const badgeName = TITLES.find((t) => t.id === look.badge)?.name;
  const myPet = buddy(myLook);
  const petHearts = heartsOf(state.pets[myPet.id]);
  const accs = useMemo(() => (admin ? new Set(ACCESSORIES.map((a) => a.id)) : accsUnlocked(state.pets)), [admin, state.pets]);
  // Tastes shown so far, per monster kind (every color of a kind shares them).
  const tastes = useMemo(() => {
    const out = {};
    for (const [id, p] of Object.entries(state.pets)) { const b = ITEMS.get(id)?.base; if (b && p.tastes) out[b] = { ...out[b], ...p.tastes }; }
    return out;
  }, [state.pets]);
  const petLv = useMemo(() => Object.fromEntries(Object.entries(state.pets)
    .filter(([, p]) => heartsOf(p) > 0 || p.wins).map(([id, p]) => [id, `${levelOf(heartsOf(p))}${p.wins ? ` ⚔${p.wins}` : ''}`])), [state.pets]);
  // My partner's pet as a battle opponent (their equipped monster at its playroom level), with our record.
  const rival = useMemo(() => {
    if (!coupled || !cloud?.synced || !partner) return null;
    const pet = buddy(pLook);
    return { name: partnerName, pet: { ...pet, level: levelOf(heartsOf(partner.pets?.[pet.id])) },
      record: battleRecord(cloud.battles ?? [], cloud.userId, partner.id, state.habit?.seenBattle ?? '') };
  }, [coupled, cloud, partner, partnerName, state.habit?.seenBattle]);
  // Room shop: coins are derived from records (shop.js), admin mode owns everything for free.
  const bought = admin ? ALL_SHOP : state.shop;
  const coins = admin ? null : balance({ days: state.days, maze: state.maze, pets: state.pets, pulls: state.pulls }, state.shop);
  const onPet = ready && state.habit && view !== 'partner' && !anim && !fall ? () => { sfx('tap'); setModal('play'); } : null;
  // The sky and grass follow the tab's background skin.
  useEffect(() => {
    const bg = ITEMS.get(look.bg), st = document.documentElement.style;
    if (bg) { st.setProperty('--sky', bg.sky); st.setProperty('--grass', bg.grass); }
    else { st.removeProperty('--sky'); st.removeProperty('--grass'); }
  }, [look.bg]);
  // After a new photo: the box shows up once the brick has landed and nothing else is on screen.
  useEffect(() => {
    if (!revealNext || anim || fall || modal) return;
    setRevealNext(false); // one chance per photo: a box that turns up later waits in the bag
    if (unopened.length) openReveal();
  }, [revealNext, anim, fall, modal, unopened.length]);
  const openReveal = () => { setRevealBox(unopened[0]); setModal('reveal'); };
  const onEquip = (patch) => (admin ? sandbox(setAdmin({ look: { ...adminPrefs.look, ...patch } })).then(() => setToast('🛠 장착 (저장 안 함)'))
    : actions.equip(patch).then(() => { setToast('장착했어요'); cloudApi?.sync(); }, fail));
  const onEquipCouple = (patch) => (admin ? sandbox(setAdmin({ coupleSkin: { ...adminPrefs.coupleSkin, ...patch } })).then(() => setToast('🛠 적용 (저장 안 함)'))
    : cloudApi.setCoupleSkin(patch).then(() => setToast('우리 탑에 적용했어요'), fail));
  // A couple skin from the reveal goes on the couple tower; anything else on me.
  const wear = (p) => {
    const it = ITEMS.get(p.item);
    if (it.couple) return coupled ? onEquipCouple({ [it.kind]: it.id }) : setToast('커플 연결 후 우리 탑에 쓸 수 있어요');
    return onEquip(it.base ? { monster: it.id, shiny: p.shiny } : { [it.kind]: it.id });
  };
  const fail = (e) => setToast('실패: ' + (e?.message ?? e?.code ?? e));

  // A collapse plays once, the first time the page sees it — also when midnight passes with the page open.
  // My tower first, then the couple tower; the couple one only after this launch has synced,
  // so a stale partner cache never fakes a collapse.
  const fallChecked = useRef({});
  useEffect(() => {
    if (!state.loaded || !state.habit || anim || fall) return;
    const check = (scope, d, seen, cut, day) => {
      if (fallChecked.current[scope] === day) return null;
      fallChecked.current[scope] = day;
      const pf = pendingFall(d, day, seen, cut);
      return pf && { ...pf, scope };
    };
    const pf = check('me', state.days, state.habit.seenFall, cutMe, today)
      ?? (coupled && cloud.synced ? check('couple', cdays, state.habit.seenCoupleFall, cutCouple, ctoday) : null);
    if (!pf) return;
    if (coupled) setTab(pf.scope);
    setAnim({ kind: 'fall', keys: pf.keys });
    buzz('fall');
    setTimeout(() => setFall(pf), FALL_MS);
  }, [state.loaded, state.habit, today, ctoday, anim, fall, coupled, cloud?.synced, cdays, cutCouple]);

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
    const gap = fall && shieldDay(fall, fall.scope === 'couple' ? ctoday : today);
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
      const r = await actions.certify(file, ({ retake }) => {
        if (retake) return;
        // Stay on this tab: the couple tab stacks a full brick, or a half one while my partner hasn't certified.
        setAnim({ kind: 'stack' });
        t = setTimeout(() => setAnim(null), STACK_MS);
      });
      if (r.retake) setToast('오늘 사진을 바꿨어요');
      else setRevealNext(true);
      cloudApi?.sync();
    } catch (err) { clearTimeout(t); setAnim(null); fail(err); } finally { setBusy(false); }
  };

  // capture forces the camera; without it the phone opens the gallery picker. The attribute must be absent,
  // not null: phones expose `capture` as a property and Preact would set it to "", which still means camera.
  // The key keeps Preact from turning one button's input into the other's when the bar re-renders.
  const camera = (label, cls, capture = 'environment') => html`<label key=${capture ? 'camera' : 'gallery'} class=${'btn ' + cls + (busy || !assets || anim || fall ? ' off' : '')}>
    <input type="file" accept="image/*" ...${capture ? { capture } : {}} hidden disabled=${busy || !assets || !ready || !!anim || !!fall} onClick=${() => buzz('tap')} onChange=${onPhoto} />
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
  const partnerDone = !!pdays[ptoday]?.assetId;
  // Nudge through the phone's share sheet (KakaoTalk etc.); no push server needed. Else copy the text.
  const poke = () => {
    buzz('tap');
    const text = `${partnerName}! 오늘 ${partner.habit || '인증'} 아직이야 👉 우리 탑 무너진다 😱\n${location.origin}${location.pathname}`;
    if (navigator.share) navigator.share({ text }).catch((e) => e.name !== 'AbortError' && fail(e));
    else navigator.clipboard?.writeText(text).then(() => setToast('문구를 복사했어요 — 카톡에 붙여넣어 주세요'), fail);
  };
  const pokeBtn = coupled && !partnerDone && html`<button class="btn orange sm" onClick=${poke}>👉 콕 찌르기</button>`;
  return html`
    ${db === null && html`<div class="banner">저장소를 쓸 수 없어요 — 크롬에서 열어주세요</div>`}
    <header class="hud">
      <div class="ttlbox">
        <b>${admin ? '🛠 ' : ''}${title}</b>
        <span class="gold">${keys.length}/${TOWER_HEIGHT}층</span>
        ${built > 0 && html`<button class="trophies" onClick=${() => setModal('shelf')} aria-label=${`완성한 탑 ${built}개 보기`}>🏰×${built}</button>`}
      </div>
      <span>
        <button class="btn blue sm" disabled=${!ready || !state.habit} onClick=${() => { sfx('tap'); setModal('bag'); }}
          aria-label=${unopened.length ? `가방 · 안 연 상자 ${unopened.length}개` : '가방'}>${unopened.length ? `🎁${unopened.length}` : '가방'}</button>
        <button class="btn blue sm" disabled=${!state.loaded} onClick=${() => setModal('calendar')}>달력</button>
        <button class="btn blue sm" disabled=${!state.loaded} onClick=${() => setModal('album')}>앨범</button>
        <button class="btn blue sm" disabled=${!ready || !state.habit} onClick=${() => setModal('setup')}>설정</button>
        <button class="btn blue sm mute" aria-pressed=${!muted} aria-label=${muted ? '소리 켜기' : '소리 끄기'}
          onClick=${() => setPrefs({ bgm: muted, sfx: muted })}>${muted ? '🔇' : '🔊'}</button>
      </span>
    </header>
    ${coupled && html`<nav class="tabs" role="tablist">${[['me', '나'], ['couple', '❤ 커플'], ['partner', partnerName]].map(([id, label]) => html`
      <button key=${id} role="tab" aria-selected=${view === id} disabled=${!!anim || !!fall}
        onClick=${() => { setTab(id); cloudApi?.sync({ lazy: true }); }}>${label}</button>`)}</nav>`}
    ${view === 'couple' && cloud?.coupleReward && html`<div class="reward">${keys.length === TOWER_HEIGHT
      ? `🎉 보상 받을 시간! ${cloud.coupleReward}`
      : `🎁 ${TOWER_HEIGHT}층 → ${cloud.coupleReward} · ${TOWER_HEIGHT - keys.length}층 남음`}</div>`}
    <main class="stage">
      <div class="world">
        ${state.habit && html`<${Scene} key=${view}
          character=${view === 'partner' ? partner.character : state.habit.character}
          partnerCharacter=${view === 'couple' ? partner.character : null} look=${look} tag=${badgeName}
          keys=${keys} days=${days} half=${half} anim=${anim} rubble=${past[0]?.kind === 'fell'} badge=${badge}
          onBlock=${(k) => setModal({ key: k, n: keys.indexOf(k) + 1 })}
          onDone=${() => setAnim((a) => (a?.kind === 'stack' ? null : a))} onPet=${onPet} />`}
        <div class="ground" />
      </div>
    </main>
    <footer class="bar">
      ${!state.habit ? null
        : view === 'partner'
          ? html`<span class=${partnerDone ? 'done' : 'muted'}>${partnerName} ${partnerDone ? '오늘 완료 ✓' : '오늘 아직'}</span>${pokeBtn}`
          : doneToday
            ? html`<span class="done">오늘 완료 ✓</span>${camera('다시 찍기', 'blue sm')}${!busy && camera('🖼️ 갤러리', 'blue sm', null)}${view === 'couple' && pokeBtn}`
            : html`${camera('📷 인증하고 쌓기', 'green big')}${!busy && camera('🖼️ 갤러리', 'blue sm', null)}${view === 'couple' && pokeBtn}`}
      ${cloud?.userId && cloud.syncFailed
        ? html`<button class="btn danger sm" onClick=${() => cloudApi.sync()}>⚠ 동기화 안 됨 · 다시</button>`
        : pending > 0 && html`<span class="muted small">☁ 올릴 기록 ${pending}개</span>`}
      ${state.habit && !assets && db !== undefined && html`<span class="muted small">사진 저장을 쓸 수 없어요</span>`}
    </footer>
    ${(needSetup || modal === 'setup') && html`<${Setup} habit=${state.habit} onClose=${() => setModal(null)} admin=${isAdminUser ? { ...adminPrefs, set: setAdmin } : null}
      backup=${backup} onExport=${onExport} onSaveFile=${onSaveFile} onImport=${onImport} onReset=${onReset}
      cloud=${cloud} cloudApi=${cloudApi} restart=${restart}
      onSave=${(f) => actions.setHabit(f).then(() => { setModal(null); cloudApi?.sync(); }, fail)} />`}
    ${modal === 'visit' && rival && html`<${Playroom} pet=${rival.pet} hearts=${0} wins=${0} accs=${accs} room=${partner.room} visit=${{ name: partnerName }}
      bought=${EMPTY} coins=${0} onOpenPlay=${() => {}} onThrowFood=${() => sandbox()} onFeed=${() => sandbox(0)} onWake=${() => sandbox(0)}
      onBuy=${() => sandbox()} onPlace=${() => sandbox()} onClose=${() => setModal('play')} />`}
    ${modal === 'battle' && html`<${Battle} me=${{ ...myPet, level: (admin && adminPrefs.level) || levelOf(petHearts) }} partner=${rival}
      onSeen=${(at) => actions.mark('seenBattle', at).catch(fail)}
      onRecord=${(won, vs) => (admin ? sandbox({ admin: true }) : actions.recordBattle(myPet.id, won).then((r) => {
        // Only the day's counted battles go on our shared record, so rematches can't flood it.
        if (vs === 'partner' && r.counted) cloudApi.recordBattle({ mine: myPet.id, theirs: rival.pet.id, won }).catch(fail); else cloudApi?.sync();
        return r;
      }, (e) => { fail(e); throw e; }))}
      onClose=${() => setModal('play')} />`}
    ${modal === 'maze' && html`<${Maze} pet=${myPet} level=${(admin && adminPrefs.level) || levelOf(petHearts)} day=${today} best=${state.maze[today]?.ms ?? null}
      capturedToday=${!admin && !!state.pulls['w:' + today]}
      onCapture=${(id, shiny) => (admin ? sandbox({ caught: true, admin: true }) : actions.capture(id, shiny).then((r) => { cloudApi?.sync(); return r; }, (e) => { fail(e); throw e; }))}
      onClear=${(ms) => (admin ? sandbox({ admin: true, best: ms }) : actions.clearMaze(ms).then((r) => { cloudApi?.sync(); return r; }, (e) => { fail(e); throw e; }))}
      onClose=${() => setModal('play')} />`}
    ${modal === 'bag' && html`<${Bag} unopened=${unopened} shards=${shards(state.pulls, clears)} have=${have} look=${myLook} accs=${accs} petLv=${petLv} tastes=${tastes}
      character=${state.habit?.character} coupleSkin=${coupled ? cSkin : null} earned=${earned}
      onReveal=${openReveal} onEquip=${onEquip} onEquipCouple=${onEquipCouple} onClose=${() => setModal(null)} />`}
    ${modal === 'play' && html`<${Playroom} pet=${myPet} hearts=${petHearts} wins=${state.pets[myPet.id]?.wins ?? 0} accs=${accs} onBattle=${() => setModal('battle')} onMaze=${() => setModal('maze')}
      room=${myRoom} bought=${bought} coins=${coins}
      onBuy=${(id) => actions.buy(id).then(() => cloudApi?.sync(), (e) => { fail(e); throw e; })}
      onPlace=${(where, i, id) => (admin ? sandbox(setAdmin({ room: placeIn(myRoom, where, i, id) }))
        : actions.place(where, i, id).then(() => cloudApi?.sync(), (e) => { fail(e); throw e; }))}
      onVisit=${rival ? () => setModal('visit') : null} food=${admin ? ADMIN_FOOD : state.play[today]?.food}
      tastes=${tastes[ITEMS.get(myPet.id)?.base]} onOpenPlay=${() => admin || actions.openPlay().catch(fail)}
      onThrowFood=${(k) => (admin ? sandbox() : actions.throwFood(k).catch((e) => { fail(e); throw e; }))}
      onFeed=${(n, kind, food) => (admin ? sandbox(n) : actions.feedPet(myPet.id, n, kind, food).catch((e) => { fail(e); throw e; }))}
      onWake=${() => (admin ? sandbox(3) : actions.wakePet(myPet.id).catch((e) => { fail(e); throw e; }))} onClose=${() => setModal(null)} />`}
    ${modal === 'reveal' && revealBox && html`<${BoxReveal} key=${revealBox} box=${revealBox} left=${unopened.filter((b) => b !== revealBox).length}
      shards=${shards(state.pulls, clears)} onOpen=${(b) => actions.openBox(b, boxCdays).then((p) => { cloudApi?.sync(); return p; })}
      onEquip=${wear} onNext=${() => setRevealBox(unopened.find((b) => b !== revealBox))} onClose=${() => setModal(null)} />`}
    ${modal === 'album' && html`<${Album} current=${current} past=${past} days=${days}
      onPick=${(k, n) => setModal({ key: k, n })} onClose=${() => setModal(null)} />`}
    ${modal === 'calendar' && html`<${Calendar} view=${view} mine=${state.days} theirs=${pdays} couple=${cdays} today=${{ me: today, couple: ctoday, partner: ptoday }[view]}
      names=${[cloud?.name || '나', partnerName]} onPick=${(k) => setModal({ key: k, n: 0 })} onClose=${() => setModal(null)} />`}
    ${modal === 'shelf' && html`<${Shelf} built=${builtTowers} days=${days} onSaveFile=${onSaveFile}
      onCollage=${(t) => import('./collage.js')
        .then((m) => m.makeCollage({ keys: t.keys, days, title: view === 'couple' ? title : `🏰 ${title}`, brick: look.brick,
          sub: `${view === 'couple' ? `${cloud?.name || '나'} ❤ ${partnerName} · ` : ''}${t.keys[0]} ~ ${t.keys.at(-1)}` }))
        .then((blob) => new File([blob], `habit-tower-${t.keys[0]}.jpg`, { type: 'image/jpeg' }))
        .catch((e) => { fail(e); throw e; })}
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

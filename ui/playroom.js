// Pet playroom: flick food or a ball at my pet (spec: docs/superpowers/specs/2026-09-29-pet-playroom-design.md).
// One animation loop moves the pet and the thrown item by writing styles directly. Preact only renders the frame,
// the counts, the pet's face and the judgement pop-up.
import { html, useState, useEffect, useRef } from './h.js';
import { Monster } from './monsters.js';
import { ITEMS, ACCESSORIES, FOODS } from '../catalog.js';
import { flick, spinOf, at, landing, judge, foodHearts, tasteOf, isNight, levelOf, levelStart, MAX_LEVEL, STAR_FULL } from '../pet.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';

import { RoomLayer, Shop, PlaceSheet, HORIZON, HAND } from './room.js';
import { SLOTS, skyAt } from '../shop.js';
import { FURNITURE } from '../catalog.js';
const PET_PX = 9;                  // monster pixel size at z = 0
const WANDER = { x: 0.6, z: [0.45, 0.85], walk: 0.15, run: 0.6 }; // where the pet strolls, speeds in units/s
const GROUND = { x: [-0.9, 0.9], z: [0.15, 1.4] };                 // a missed item rolls back inside this
const HOME = { x: 0, z: 0.15 };                                    // where the pet drops the ball it fetched
const EAT_MS = 700, NEAR_MISS = 0.35;
const SAY = { excellent: 'Excellent!', great: 'Great!', nice: 'Nice!', miss: '냠' };
const ICON = { ...Object.fromEntries(FOODS.map((f) => [f.id, f.icon])), ball: '⚾' };
// The first food kind still on the tray, else the ball.
const firstFood = (food) => FOODS.find((f) => food?.includes(f.id))?.id ?? 'ball';

// Emotion -> face (ui/monsters.js FACES), bubble icon, body motion (CSS .m-*).
const EMO = {
  excited: ['excited', 'heart', 'jump'], joy: ['joy', 'heart', 'bounce'], yum: ['yum', null, 'chew'],
  sad: ['sad', 'drop', 'droop'], surprised: ['surprised', 'bang', 'hop'], sleepy: ['sleepy', 'zzz', 'sway'],
  angry: ['angry', 'anger', 'stomp'], shy: ['shy', 'heart', 'wiggle'], spit: ['spit', null, 'shake'], moved: ['moved', 'heart', 'spin'],
};
// 7x6 bubble icons. K ink, R red, B blue, W white.
const ICONS = {
  heart: ['.KK.KK.', 'KRRKRRK', 'KRRRRRK', '.KRRRK.', '..KRK..', '...K...'],
  drop: ['...K...', '..KBK..', '.KBBBK.', '.KBWBK.', '.KBBBK.', '..KKK..'],
  zzz: ['KKKK...', '..K....', '.K..KKK', 'KKKK.K.', '....K..', '....KKK'],
  bang: ['..KKK..', '..KRK..', '..KRK..', '..KKK..', '..KRK..', '..KKK..'],
  anger: ['.R...R.', '..R.R..', 'RR...RR', '..R.R..', '.R...R.', '.......'],
};
const INK = { K: '#2b1d14', R: '#ff4a5a', B: '#6ec6ff', W: '#ffffff' };
const Icon = ({ name }) => html`<svg width="63" height="54" viewBox="0 0 7 6" shape-rendering="crispEdges">${
  ICONS[name].flatMap((row, y) => [...row].map((c, x) => INK[c] && html`<rect key=${x + ',' + y} x=${x} y=${y} width="1.02" height="1.02" fill=${INK[c]} />`))}</svg>`;

const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const rand = ([a, b]) => a + Math.random() * (b - a);

// World point -> field px and scale. 1 world unit = half the field width at z = 0.
function project(p, w, h) {
  const s = 1 / (1 + 3 * p.z), ground = h * HORIZON + (h * HAND - h * HORIZON) * s;
  return { left: w / 2 + p.x * (w / 2) * s, top: ground - (p.y ?? 0) * (w / 2) * s, s };
}
// Bottom-center anchored: the element's bottom middle sits on (left, top).
const place = (el, left, top, sx, sy = Math.abs(sx)) => {
  el.style.transform = `translate(${left}px, ${top}px) scale(${sx}, ${sy}) translate(-50%, -100%)`;
};

// pet: {id, shiny, acc}. hearts: its hearts. accs: unlocked accessory ids (any pet).
// food: today's food kinds left (undefined until onOpenPlay rolls them). tastes: {<food>: 'like'|'hate'} this kind of
// monster has shown. onThrowFood(kind): one piece leaves the tray. onFeed(n, kind, food): resolves to the hearts given
// after today's limits, and records a taste. wins: the pet's ⚔️ wins. onBattle(): open the battle screen.
// onWake(): woken at night, resolves to the hearts lost.
// Room: room ({slots, building, theme}), bought, coins (null = admin: free), onBuy(id), onPlace(where, i, id).
// visit: null, or {name} when this is my partner's playroom, looked at read-only (onVisit opens theirs).
export function Playroom({ pet, hearts, wins, accs, food, tastes, onOpenPlay, onThrowFood, onFeed, onWake, onBattle, onMaze,
  room, bought, coins, onBuy, onPlace, visit, onVisit, onClose }) {
  const [panel, setPanel] = useState(null); // null | 'shop' | 'decor' | {where, i}
  const roomRef = useRef(room);
  roomRef.current = room;
  const field = useRef(), petEl = useRef(), bubbleEl = useRef(), itemEl = useRef(), shadowEl = useRef();
  const cb = useRef();
  cb.current = { onThrowFood, onFeed, onWake, food };
  const [kind, setKind] = useState(() => firstFood(food));
  const [pop, setPop] = useState(null);   // {text, key}
  const [emo, setEmo] = useState(null);   // key of EMO while an emotion shows
  const [blink, setBlink] = useState(false);
  const st = useRef(null);
  st.current ??= {
    pet: { x: 0, z: 0.6, tx: 0, tz: 0.6, speed: WANDER.walk, face: 1, waitUntil: 0, asleep: isNight() },
    item: { mode: 'ready' }, // ready | drag | fly | ground | held | gone
    samples: [], rub: null, emoTimer: 0,
  };
  const s = st.current;
  s.kind = kind;

  const rest = () => (s.pet.asleep ? 'sleepy' : null);
  // name: an EMO key, or {face, icon, motion} for a furniture act.
  const emote = (name, ms) => {
    setEmo(name);
    clearTimeout(s.emoTimer);
    if (ms) s.emoTimer = setTimeout(() => setEmo(rest()), ms);
  };
  const say = (text) => setPop({ text, key: performance.now() });
  const gave = (n, text) => n > 0 && say(`${text} +${n}💗`);

  useEffect(() => { onOpenPlay(); }, []);
  // Today's food arrives (or a kind runs out) while nothing is in hand: hold the first food on the tray.
  useEffect(() => {
    if (s.item.mode !== 'ready' || s.chose) return;
    if (kind === 'ball' ? food?.length : !food?.includes(kind)) setKind(firstFood(food));
  }, [food]);

  // Blink every few seconds while nothing else shows.
  useEffect(() => {
    if (s.pet.asleep) setEmo('sleepy');
    let t;
    const next = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); next(); }, rand([2500, 5000])); };
    next();
    return () => { clearTimeout(t); clearTimeout(s.emoTimer); };
  }, []);

  // Level up: moved face, a box, maybe an accessory; the star gauge ending unlocks the shiny.
  const seen = useRef({ lv: levelOf(hearts), star: hearts >= STAR_FULL, accs });
  useEffect(() => {
    const was = seen.current, lv = levelOf(hearts), star = hearts >= STAR_FULL;
    const fresh = ACCESSORIES.filter((a) => accs.has(a.id) && !was.accs.has(a.id));
    seen.current = { lv, star, accs };
    if (lv <= was.lv && (star === was.star || !star)) return;
    const t = setTimeout(() => {
      emote('moved', 1800); sfx('rare'); buzz('epic');
      say(star && !was.star ? '✨ 이로치 변신 해금!'
        : `Lv ${lv}! 🎁 상자 +${lv - was.lv}${fresh.length ? ` · ${fresh.map((a) => a.name).join('·')} 열림` : ''}`);
    }, 900); // after the heart pop-up
    return () => clearTimeout(t);
  }, [hearts]);

  const walkTo = (x, z, speed) => { s.pet.tx = x; s.pet.tz = z; s.pet.speed = speed; };
  // Next item on the throw spot; out of food switches to the ball.
  const ready = (delay = 0) => setTimeout(() => {
    if (s.item.mode !== 'gone') return;
    s.item = { mode: 'ready' };
    if (s.kind !== 'ball' && !cb.current.food?.includes(s.kind)) setKind(firstFood(cb.current.food));
  }, delay);

  // paid: the throw's onThrowFood promise; no hearts for food that never left the tray.
  // Liked food doubles the hearts; hated food is spat out for none (its taste is still learned).
  const eat = (now, j, paid, food) => {
    const p = s.pet, taste = tasteOf(pet.id, food);
    s.item = { mode: 'gone' };
    p.waitUntil = now + EAT_MS; walkTo(p.x, p.z, WANDER.walk);
    if (taste === 'hate') {
      emote('spit', 1100); sfx('shake'); buzz('glow');
      say('퉤! 싫어해요');
    } else {
      emote('yum', EAT_MS);
      sfx(j === 'excellent' || taste === 'like' ? 'rare' : 'common');
      buzz(j === 'excellent' ? 'rare' : 'tap');
    }
    paid.then(() => cb.current.onFeed(foodHearts(j, taste), 'food', food))
      .then((n) => gave(n, taste === 'like' ? `${SAY[j]} 좋아해요!` : SAY[j]), () => {});
    ready(taste === 'hate' ? 1100 : EAT_MS);
  };

  const pickUp = (now) => {
    s.item.mode = 'held';
    s.pet.waitUntil = now + 250;
    walkTo(HOME.x, HOME.z, WANDER.run * 0.7);
  };

  // The item touched the ground.
  const settle = (now) => {
    const p = s.pet, it = s.item;
    if (p.asleep) { // the first throw at a sleeping pet only wakes it, angry
      p.asleep = false;
      s.item = { mode: 'gone' };
      emote('angry', 1400);
      sfx('shake'); buzz('glow');
      cb.current.onWake().then((n) => n > 0 && say(`깼어요! -${n}💗`), () => {});
      p.waitUntil = now + 1400;
      ready(900);
      return;
    }
    const j = judge(it.land, p);
    if (it.kind === 'ball') {
      if (j !== 'miss') {
        emote('joy', 800); sfx('common'); buzz('tap');
        cb.current.onFeed(1, 'toy').then((n) => (n > 0 ? gave(n, '잡았다!') : say('잡았다!')), () => {});
        it.pos = { x: p.x, y: 0, z: p.z };
        return pickUp(now);
      }
    } else if (j !== 'miss') { // caught: a moment of joy, then it eats
      s.item = { mode: 'gone' };
      emote(j === 'excellent' ? 'excited' : 'joy', 500);
      p.waitUntil = now + 500;
      return setTimeout(() => eat(performance.now(), j, it.paid, it.kind), 500);
    }
    it.mode = 'ground';
    it.pos = { x: clamp(it.land.x, GROUND.x), y: 0, z: clamp(it.land.z, GROUND.z) };
    const close = Math.hypot(it.land.x - p.x, it.land.z - p.z) <= NEAR_MISS;
    emote(close ? 'surprised' : 'sad', 700);
    p.waitUntil = now + 700;
    walkTo(it.pos.x, it.pos.z, WANDER.run);
  };

  const step = (now, dt) => {
    const p = s.pet, it = s.item;
    if (it.mode === 'fly') {
      const t = (now - it.t0) / 1000;
      if (t >= it.land.t) settle(now);
      else { const q = at(it.v, it.spin, t); it.pos = { ...q, x: q.x + it.x0 }; }
    }
    if (p.asleep || now < p.waitUntil) return;
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.01) {
      if (s.item.mode === 'ground') return s.item.kind === 'ball' ? pickUp(now) : eat(now, 'miss', s.item.paid, s.item.kind);
      if (s.item.mode === 'held') { s.item = { mode: 'gone' }; ready(); } // ball dropped at my feet
      if (p.visit != null) { // arrived at a piece of furniture: its act for a while
        const [face, motion, bubble, word] = FURNITURE.find((f) => f.id === p.visit)?.act ?? [];
        p.visit = null;
        if (face) { emote({ face, motion, icon: bubble }, 2600); say(word); p.waitUntil = now + 2600; return; }
      }
      // Now and then the pet heads for a piece of furniture instead of a random spot.
      const placed = (roomRef.current?.slots ?? []).map((id, i) => id && { id, ...SLOTS[i] }).filter(Boolean);
      if (placed.length && Math.random() < 0.35) {
        const f = placed[Math.floor(Math.random() * placed.length)];
        p.visit = f.id;
        walkTo(f.x + (f.x > 0 ? -0.08 : 0.08), f.z - 0.04, WANDER.walk * 1.6);
        return;
      }
      walkTo(rand([-WANDER.x, WANDER.x]), rand(WANDER.z), WANDER.walk);
      return;
    }
    const m = Math.min(d, p.speed * dt);
    p.x += (dx / d) * m; p.z += (dz / d) * m;
    if (Math.abs(dx) > 0.001) p.face = Math.sign(dx);
    if (s.item.mode === 'held') s.item.pos = { x: p.x + 0.07 * p.face, y: 0.01, z: p.z - 0.01 }; // in front, at the mouth
  };

  const draw = () => {
    const f = field.current;
    if (!f) return;
    const w = f.clientWidth, h = f.clientHeight, p = s.pet, it = s.item;
    const pp = project(p, w, h);
    place(petEl.current, pp.left, pp.top, -p.face * pp.s, pp.s); // the art faces left
    petEl.current.style.zIndex = String(Math.round(1000 - p.z * 500));
    if (bubbleEl.current) bubbleEl.current.style.transform = `translateX(-50%) scaleX(${-p.face})`; // icons stay unmirrored
    const ie = itemEl.current, se = shadowEl.current;
    ie.style.visibility = it.mode === 'gone' ? 'hidden' : 'visible';
    se.style.visibility = it.mode === 'fly' ? 'visible' : 'hidden';
    if (it.mode === 'ready') place(ie, w / 2, h - 8, 1);
    else if (it.mode === 'drag') place(ie, it.fx, it.fy + 30, 1);
    else if (it.pos) {
      const q = project(it.pos, w, h), g = project({ ...it.pos, y: 0 }, w, h);
      place(ie, q.left, q.top, q.s * (it.mode === 'held' ? 0.8 : 1.6)); // a carried ball stays small, off the face
      ie.style.zIndex = String(Math.round(1000 - it.pos.z * 500) + (it.mode === 'held' ? 1 : 0));
      place(se, g.left, g.top + 4, g.s * 1.6);
      se.style.zIndex = '1';
    }
  };

  useEffect(() => {
    let raf, prev = performance.now();
    const frame = (now) => {
      step(now, Math.min(0.05, (now - prev) / 1000));
      prev = now;
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const local = (e) => { const r = field.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => {
    if (s.item.mode !== 'ready' || (s.kind !== 'ball' && !cb.current.food?.includes(s.kind))) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [fx, fy] = local(e);
    s.item = { mode: 'drag', kind: s.kind, fx, fy };
    s.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    sfx('tap');
  };
  const move = (e) => {
    const it = s.item;
    if (it.mode !== 'drag') return;
    [it.fx, it.fy] = local(e);
    s.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  };
  const up = (e) => {
    const it = s.item;
    if (it.mode !== 'drag') return;
    move(e);
    const w = field.current.clientWidth, v = flick(s.samples, w);
    if (!v) { s.item = { mode: 'ready' }; return; }
    // A sleeping pet's throw costs no food (it only wakes the pet).
    const paid = it.kind !== 'ball' && !s.pet.asleep ? cb.current.onThrowFood(it.kind) : null;
    paid?.catch(() => {});
    const spin = spinOf(s.samples), x0 = (it.fx - w / 2) / (w / 2), land = landing(v, spin);
    s.item = { mode: 'fly', kind: it.kind, paid, v, spin, x0, t0: performance.now(), land: { ...land, x: land.x + x0 }, pos: { x: x0, y: 0.15, z: 0 } };
  };
  const cancel = () => { if (s.item.mode === 'drag') s.item = { mode: 'ready' }; };

  // Petting: rub back and forth over the pet (3 turns). Once per visit; the day's limit is in onFeed.
  const petDown = (e) => { if (!s.rubbed) s.rub = { x: e.clientX, dir: 0, turns: 0 }; };
  const petMove = (e) => {
    const r = s.rub;
    if (!r) return;
    const dx = e.clientX - r.x;
    if (Math.abs(dx) < 4) return;
    const dir = Math.sign(dx);
    if (r.dir && dir !== r.dir) r.turns++;
    r.dir = dir; r.x = e.clientX;
    if (r.turns < 3) return;
    s.rub = null; s.rubbed = true;
    emote('shy', 1500); sfx('tap'); buzz('tap');
    cb.current.onFeed(1, 'pet').then((n) => gave(n, s.pet.asleep ? '쿨쿨…' : '헤헤'), () => {});
  };
  const petUp = () => { s.rub = null; };

  const pick = (k) => { if (s.item.mode === 'ready' && (k === 'ball' || food?.includes(k))) { s.chose = true; setKind(k); sfx('tap'); } };
  const [face, icon, motion] = (emo && typeof emo === 'object' ? [emo.face, emo.icon, emo.motion] : EMO[emo]) ?? [blink ? 'blink' : null, null, null];
  const lv = levelOf(hearts), max = lv === MAX_LEVEL;
  const [from, to] = max ? [levelStart(MAX_LEVEL), STAR_FULL] : [levelStart(lv), levelStart(lv + 1)];
  const gauge = html`<span class="pr-lv">${max ? '⭐' : `Lv ${lv}`}
    <i class="pr-gauge" aria-label=${`${Math.min(hearts, to) - from}/${to - from}`}><i style=${{ width: `${Math.min(1, (hearts - from) / (to - from)) * 100}%` }} /></i>
    <small>💗 ${hearts}${wins ? ` ⚔️ ${wins}` : ''}</small></span>`;
  const hint = s.pet.asleep ? '쿨쿨 자는 중… 던지면 깨요 (쓰다듬기는 괜찮아요)'
    : kind !== 'ball' ? '먹이를 잡고 위로 튕겨 던져 보세요' : '공을 던지면 물어와요';

  const editing = panel === 'decor' || typeof panel === 'object' && panel;
  return html`<div class=${'playroom sky-' + skyAt()} role="dialog" aria-label=${visit ? `${visit.name}의 놀이방` : '펫과 놀기'}>
    <div class="pr-top"><b>${visit ? `💞 ${visit.name}의 ` : ''}${ITEMS.get(pet.id)?.name ?? '펫'}</b>${!visit && gauge}
      ${!visit && html`<span class="pr-coins">🪙 ${coins ?? '∞'}</span>`}
      <button class="x" onClick=${onClose} aria-label="닫기">✕</button></div>
    ${!visit && html`<div class="pr-tools">
      <button class="btn sm orange" onClick=${onBattle} aria-label="대결">⚔️ 대결</button>
      <button class="btn sm orange" onClick=${onMaze} aria-label="미로">🧩 미로</button>
      <button class="btn sm blue" onClick=${() => setPanel('shop')}>🏪 상점</button>
      <button class=${'btn sm ' + (editing ? 'green' : 'blue')} onClick=${() => setPanel(editing ? null : 'decor')}>🏠 ${editing ? '완료' : '꾸미기'}</button>
      ${onVisit && html`<button class="btn sm blue" onClick=${onVisit}>💞 놀러가기</button>`}
    </div>`}
    <div class="pr-field" ref=${field}>
      <${RoomLayer} room=${room} editing=${!!editing} onSlot=${(i) => setPanel({ where: 'slot', i })}
        onBuilding=${() => setPanel({ where: 'building', i: 0 })} />
      ${editing && html`<button class="btn sm blue pr-theme" onClick=${() => setPanel({ where: 'theme', i: 0 })}>🌸 테마 바꾸기</button>`}
      <span class="pr-shadow" ref=${shadowEl} />
      <span class=${'pr-pet' + (pet.shiny ? ' sparkle' : '')} ref=${petEl} role="img" aria-label="펫 쓰다듬기"
        onPointerDown=${petDown} onPointerMove=${petMove} onPointerUp=${petUp} onPointerCancel=${petUp}>
        ${icon && html`<span class="pr-bubble" ref=${bubbleEl}><${Icon} name=${icon} /></span>`}
        <span class=${'pr-body' + (motion ? ' m-' + motion : '')} key=${emo ?? ''}><${Monster} id=${pet.id} shiny=${pet.shiny} px=${PET_PX} face=${face} acc=${pet.acc} /></span>
      </span>
      <span class="pr-item" hidden=${!!visit} ref=${itemEl} role="button" aria-label=${kind !== 'ball' ? '먹이 던지기' : '공 던지기'}
        onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel}>${ICON[s.item.kind ?? kind]}</span>
      ${pop && html`<p key=${pop.key} class="pr-pop">${pop.text}</p>`}
      <p class="pr-hint">${visit ? `${visit.name}의 펫이 놀고 있어요 (구경만 할 수 있어요)` : editing ? '번호 칸을 눌러 가구를 놓아요' : hint}</p>
    </div>
    ${!visit && html`<div class="pr-tray">
      ${FOODS.map((f) => {
        const n = food?.filter((k) => k === f.id).length ?? 0, t = tastes?.[f.id];
        return html`<button key=${f.id} class=${'btn sm ' + (kind === f.id ? 'green' : 'blue')} disabled=${!n} onClick=${() => pick(f.id)}
          aria-label=${`${f.name} ${n}개${t === 'like' ? ' · 좋아함' : t === 'hate' ? ' · 싫어함' : ''}`}>${f.icon}${n}${t === 'like' ? '💗' : t === 'hate' ? '✖' : ''}</button>`;
      })}
      <button class=${'btn sm ' + (kind === 'ball' ? 'green' : 'blue')} onClick=${() => pick('ball')}>⚾ 공</button>
    </div>`}
    ${panel === 'shop' && html`<${Shop} coins=${coins} bought=${bought} onBuy=${onBuy} onClose=${() => setPanel(null)} />`}
    ${panel?.where && html`<${PlaceSheet} where=${panel.where} index=${panel.i} bought=${bought}
      current=${panel.where === 'slot' ? room?.slots?.[panel.i] : room?.[panel.where]}
      onPick=${(id) => onPlace(panel.where, panel.i, id).then(() => setPanel('decor'), () => {})} onClose=${() => setPanel('decor')} />`}
  </div>`;
}

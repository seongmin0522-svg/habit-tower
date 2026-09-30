// Daily fog maze screen (specs: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md,
// docs/superpowers/specs/2026-09-29-encounters-shop-design.md). Rules in maze.js.
// The field is one SVG in room units; the view is centered on the pet, so the pet itself stays in the middle.
// A roadmap bar (①─②─③─🚩) tracks checkpoints on the way; wild monsters jump out every 8–12 s of walking.
// Losing to one sends the pet back to the last checkpoint passed (or the start).
import { html, useState, useEffect, useRef, useMemo } from './h.js';
import { Monster } from './monsters.js';
import { Battle } from './battle.js';
import { ITEMS } from '../catalog.js';
import { SIZE, mazeOf, step, isOpen, inSight, checkpoints } from '../maze.js';
import { wildRoll } from '../battle.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';

const VIEW = 7;               // rooms across the screen
const REPEAT_MS = 150;        // holding a button keeps walking
const ENCOUNTER = [8000, 12000], FLEE_MS = 5000;
// Capture chance after a win; ?dev&catch=1 makes it certain for local testing.
const CAPTURE = /[?&]dev\b/.test(location.search) && /[?&]catch=1\b/.test(location.search) ? 1 : 0.1;
const PADS = [['up', '▲'], ['left', '◀'], ['down', '▼'], ['right', '▶']];
const MARKS = ['①', '②', '③'];
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const key = ([x, y]) => y * SIZE + x;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const gap = () => ENCOUNTER[0] + Math.random() * (ENCOUNTER[1] - ENCOUNTER[0]);

// pet: {id, shiny, acc}; level: its battle level. day: today (local). best: today's best ms or null.
// capturedToday: a monster was already caught today. onCapture(id, shiny): resolves to {caught, dup, admin}.
// onClear(ms): resolves to {first, best, admin}.
export function Maze({ pet, level, day, best, capturedToday, onCapture, onClear, onClose }) {
  const maze = useMemo(() => mazeOf(day), [day]);
  const cps = useMemo(() => checkpoints(maze), [maze]);
  const [pos, setPos] = useState(maze.start);
  const [seen, setSeen] = useState(() => new Set(around(maze.start)));
  const [reached, setReached] = useState(0); // checkpoints passed
  const reachedRef = useRef(0);
  reachedRef.current = reached;
  const [t0, setT0] = useState(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState(null);    // {ms, note}
  const [bump, setBump] = useState(0);
  const [toast, setToast] = useState(null);
  const [flash, setFlash] = useState(false);
  const [wild, setWild] = useState(null);    // the monster being fought
  // Refs, not state, for what the held-button interval reads: its closure is from the render that started it.
  const p = useRef(maze.start), hold = useRef(null), began = useRef(null), over = useRef(false), fighting = useRef(false);
  const paused = useRef(0), pauseAt = useRef(0), nextFoe = useRef(gap()), caught = useRef(capturedToday), lost = useRef(false);
  useEffect(() => () => clearInterval(hold.current), []);
  useEffect(() => {
    if (!t0 || done) return;
    const i = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(i);
  }, [t0, done]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1500); return () => clearTimeout(t); }, [toast]);

  function around([px, py]) {
    const out = [];
    for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) out.push(key([x, y]));
    return out;
  }
  // Maze time: since the first step, minus battles, plus run-away penalties.
  const mazeMs = () => (began.current ? performance.now() - began.current - paused.current : 0);

  const encounter = () => {
    clearInterval(hold.current);
    fighting.current = true;
    pauseAt.current = performance.now();
    const foe = wildRoll([Math.random(), Math.random(), Math.random(), Math.random()], level);
    setFlash(true); buzz('glow'); sfx('shake');
    setTimeout(() => { setFlash(false); setWild(foe); }, 450);
  };
  // penalty: ms added to the maze time (running away).
  const endFight = (penalty = 0) => {
    paused.current += performance.now() - pauseAt.current - penalty;
    nextFoe.current = mazeMs() + gap();
    fighting.current = false;
    setWild(null);
    if (lost.current) { // lost: back to the last checkpoint passed, the map stays
      lost.current = false;
      const back = reachedRef.current ? cps[reachedRef.current - 1] : maze.start;
      p.current = back;
      setPos(back);
      setToast(reachedRef.current ? `${MARKS[reachedRef.current - 1]}로 돌아왔어요` : '출발점으로 돌아왔어요');
    }
  };
  // A wild battle ended: a win may catch it (once a day), a loss sends me back to the start.
  const onWild = (won) => {
    if (!won) { lost.current = true; return Promise.resolve({ note: reachedRef.current ? `졌어요… ${MARKS[reachedRef.current - 1]}로 돌아가요` : '졌어요… 출발점으로 돌아가요' }); }
    if (caught.current || Math.random() >= CAPTURE) return Promise.resolve({ note: caught.current ? '이겼다! (오늘은 이미 한 마리 잡았어요)' : '이겼다! 도망가 버렸어요' });
    return onCapture(wild.id, wild.shiny).then((r) => {
      caught.current = true;
      const name = ITEMS.get(wild.id).name;
      return { note: r.admin ? `🎉 ${name}을(를) 잡았다! (🛠 저장 안 함)` : r.caught ? `🎉 ${name}을(를) 잡았다!${r.dup ? ' (이미 있어서 조각 +1)' : ' 도감에 등록!'}` : '이겼다!' };
    });
  };

  const walk = (dir) => {
    if (over.current || fighting.current) return;
    const q = step(maze, p.current, dir);
    if (!q) { setBump((b) => b + 1); buzz('tap'); return; }
    if (!began.current) { began.current = performance.now(); setT0(began.current); }
    p.current = q;
    setPos(q);
    setSeen((s) => { const n = new Set(s); for (const k of around(q)) n.add(k); return n; });
    const i = cps.findIndex((c) => same(c, q));
    if (i >= 0) setReached((r) => { if (i + 1 > r) { setToast(`${MARKS[i]} 통과!`); sfx('open'); buzz('tap'); } return Math.max(r, i + 1); });
    if (same(q, maze.exit)) {
      clearInterval(hold.current);
      over.current = true;
      const ms = mazeMs();
      setDone({ ms });
      sfx('legend'); buzz('epic');
      onClear(ms).then(({ first, best: b, admin }) => setDone({ ms,
        note: admin ? '🛠 관리자 모드 · 기록 안 함' : first ? '🧩 상자 조각 +1' : `오늘 조각은 이미 받았어요 · 최고 ${clock(b)}` }), () => {});
      return;
    }
    if (mazeMs() >= nextFoe.current) encounter();
  };
  const press = (dir) => { walk(dir); clearInterval(hold.current); hold.current = setInterval(() => walk(dir), REPEAT_MS); };
  const release = () => clearInterval(hold.current);
  const restart = () => {
    p.current = maze.start; began.current = null; over.current = false; paused.current = 0; nextFoe.current = gap();
    setPos(maze.start); setSeen(new Set(around(maze.start))); setReached(0); setT0(null); setDone(null);
  };

  // Rooms seen so far, with their walls; the ones in sight bright, the rest dim.
  const rooms = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!seen.has(key([x, y]))) continue;
    const lit = inSight(pos, [x, y]), cp = cps.findIndex((c) => same(c, [x, y]));
    rooms.push(html`<g key=${x + ',' + y} opacity=${lit ? 1 : 0.45}>
      <rect x=${x} y=${y} width="1.01" height="1.01" class=${'mz-floor' + (cp >= 0 ? (cp < reached ? ' cp done' : ' cp') : '')} />
      ${!isOpen(maze, [x, y], 'up') && html`<line x1=${x} y1=${y} x2=${x + 1} y2=${y} />`}
      ${!isOpen(maze, [x, y], 'left') && html`<line x1=${x} y1=${y} x2=${x} y2=${y + 1} />`}
      ${!isOpen(maze, [x, y], 'down') && html`<line x1=${x} y1=${y + 1} x2=${x + 1} y2=${y + 1} />`}
      ${!isOpen(maze, [x, y], 'right') && html`<line x1=${x + 1} y1=${y} x2=${x + 1} y2=${y + 1} />`}
      ${cp >= 0 && html`<text x=${x + 0.5} y=${y + 0.72} font-size="0.55" text-anchor="middle" class="mz-cp">${MARKS[cp]}</text>`}
      ${same([x, y], maze.exit) && html`<text x=${x + 0.5} y=${y + 0.75} font-size="0.7" text-anchor="middle">🚩</text>`}
    </g>`);
  }
  const shift = `translate(${VIEW / 2 - pos[0] - 0.5}px, ${VIEW / 2 - pos[1] - 0.5}px)`;
  // During a wild battle the clock stands still at the moment it began.
  const elapsed = done ? done.ms : t0 ? Math.max(0, (wild || flash ? pauseAt.current : now) - t0 - paused.current) : 0;
  const target = cps[reached] ?? maze.exit;
  const angle = (Math.atan2(target[1] - pos[1], target[0] - pos[0]) * 180) / Math.PI;

  return html`<div class="maze" role="dialog" aria-label="안개 미로">
    <div class="pr-top"><b>🧩 오늘의 미로</b><span>⏱ ${clock(elapsed)}${best ? ` · 최고 ${clock(best)}` : ''}</span>
      <button class="x" onClick=${onClose} aria-label="닫기">✕</button></div>
    <div class="mz-road" aria-label=${`체크포인트 ${reached}/3`}>
      ${MARKS.map((m, i) => html`<b key=${m} class=${i < reached ? 'on' : i === reached ? 'next' : ''}>${m}</b><i key=${'l' + m} class=${i < reached ? 'on' : ''} />`)}
      <b class=${done ? 'on' : reached === 3 ? 'next' : ''}>🚩</b>
      ${!done && html`<span class="mz-arrow" title="다음 목표 방향" style=${{ transform: `rotate(${angle}deg)` }}>➤</span>`}
    </div>
    <div class="mz-field">
      <svg class="mz-map" viewBox=${`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" aria-label="미로">
        <g class="mz-rooms" style=${{ transform: shift }}>${rooms}</g>
      </svg>
      <span class=${'mz-pet' + (done ? ' win' : '')} key=${'b' + bump}><${Monster} id=${pet.id} shiny=${pet.shiny} acc=${pet.acc} px=${3} face=${done ? 'excited' : null} /></span>
      <svg class="mz-mini" viewBox=${`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        ${[...seen].map((k) => html`<rect key=${k} x=${k % SIZE} y=${Math.floor(k / SIZE)} width="1" height="1" />`)}
        ${cps.map((c, i) => seen.has(key(c)) && html`<rect key=${'c' + i} x=${c[0]} y=${c[1]} width="1" height="1" class=${i < reached ? 'cpdone' : 'cp'} />`)}
        <rect x=${maze.exit[0]} y=${maze.exit[1]} width="1" height="1" class=${seen.has(key(maze.exit)) ? 'exit' : 'hide'} />
        <rect x=${pos[0]} y=${pos[1]} width="1" height="1" class="me" />
      </svg>
      ${toast && html`<p class="pr-pop" key=${toast}>${toast}</p>`}
      ${done ? html`<div class="mz-done"><b>탈출! ${clock(done.ms)}</b>${done.note && html`<small>${done.note}</small>`}
        <div class="bt-row"><button class="btn green" onClick=${restart}>다시</button><button class="btn blue" onClick=${onClose}>닫기</button></div></div>`
        : html`<p class="mz-hint">①→②→③→🚩 순서로! 화살표가 다음 목표 방향 · 풀숲에서 야생 몬스터가 튀어나와요</p>`}
    </div>
    <div class="mz-pad">${PADS.map(([dir, label]) => html`<button key=${dir} class=${'btn blue mz-' + dir} aria-label=${dir}
      onPointerDown=${(e) => { e.preventDefault(); press(dir); }} onPointerUp=${release} onPointerLeave=${release} onPointerCancel=${release}
      onContextMenu=${(e) => e.preventDefault()}>${label}</button>`)}</div>
    ${flash && html`<i class="mz-flash" />`}
    ${wild && html`<${Battle} me=${{ ...pet, level }} wild=${wild} onRecord=${(won) => onWild(won)}
      onFlee=${() => { setToast('도망쳤다! +5초'); endFight(FLEE_MS); }} onClose=${() => endFight()} />`}
  </div>`;
}

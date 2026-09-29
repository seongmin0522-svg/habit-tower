// Daily fog maze screen (spec: docs/superpowers/specs/2026-09-29-pet-battle-maze-design.md). Rules in maze.js.
// The field is one SVG in room units; the view is centered on the pet, so the pet itself stays in the middle.
import { html, useState, useEffect, useRef, useMemo } from './h.js';
import { Monster } from './monsters.js';
import { SIZE, mazeOf, step, isOpen, inSight } from '../maze.js';
import { sfx } from '../sound.js';
import { buzz } from '../haptic.js';

const VIEW = 7;            // rooms across the screen
const REPEAT_MS = 150;     // holding a button keeps walking
const PADS = [['up', '▲'], ['left', '◀'], ['down', '▼'], ['right', '▶']];
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const key = ([x, y]) => y * SIZE + x;

// pet: {id, shiny, acc}. day: today (KST). best: today's best ms or null. onClear(ms): resolves to {first, best}.
export function Maze({ pet, day, best, onClear, onClose }) {
  const maze = useMemo(() => mazeOf(day), [day]);
  const [pos, setPos] = useState(maze.start);
  const [seen, setSeen] = useState(() => new Set(around(maze.start)));
  const [t0, setT0] = useState(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState(null); // {ms, note}
  const [bump, setBump] = useState(0);
  // Refs, not state, for what the held-button interval reads: its closure is from the render that started it.
  const p = useRef(maze.start), hold = useRef(null), began = useRef(null), over = useRef(false);
  useEffect(() => () => clearInterval(hold.current), []);
  useEffect(() => {
    if (!t0 || done) return;
    const i = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(i);
  }, [t0, done]);

  function around([px, py]) {
    const out = [];
    for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) out.push(key([x, y]));
    return out;
  }

  const walk = (dir) => {
    if (over.current) return;
    const q = step(maze, p.current, dir);
    if (!q) { setBump((b) => b + 1); buzz('tap'); return; }
    if (!began.current) { began.current = performance.now(); setT0(began.current); }
    p.current = q;
    setPos(q);
    setSeen((s) => { const n = new Set(s); for (const k of around(q)) n.add(k); return n; });
    if (q[0] === maze.exit[0] && q[1] === maze.exit[1]) {
      clearInterval(hold.current);
      over.current = true;
      const ms = performance.now() - began.current;
      setDone({ ms });
      sfx('legend'); buzz('epic');
      onClear(ms).then(({ first, best: b }) => setDone({ ms, note: first ? '🧩 상자 조각 +1' : `오늘 조각은 이미 받았어요 · 최고 ${clock(b)}` }), () => {});
    }
  };
  const press = (dir) => { walk(dir); clearInterval(hold.current); hold.current = setInterval(() => walk(dir), REPEAT_MS); };
  const release = () => clearInterval(hold.current);
  const restart = () => {
    p.current = maze.start; began.current = null; over.current = false;
    setPos(maze.start); setSeen(new Set(around(maze.start))); setT0(null); setDone(null);
  };

  // Rooms seen so far, with their walls; the ones in sight bright, the rest dim.
  const rooms = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!seen.has(key([x, y]))) continue;
    const lit = inSight(pos, [x, y]);
    rooms.push(html`<g key=${x + ',' + y} opacity=${lit ? 1 : 0.45}>
      <rect x=${x} y=${y} width="1.01" height="1.01" class="mz-floor" />
      ${!isOpen(maze, [x, y], 'up') && html`<line x1=${x} y1=${y} x2=${x + 1} y2=${y} />`}
      ${!isOpen(maze, [x, y], 'left') && html`<line x1=${x} y1=${y} x2=${x} y2=${y + 1} />`}
      ${!isOpen(maze, [x, y], 'down') && html`<line x1=${x} y1=${y + 1} x2=${x + 1} y2=${y + 1} />`}
      ${!isOpen(maze, [x, y], 'right') && html`<line x1=${x + 1} y1=${y} x2=${x + 1} y2=${y + 1} />`}
      ${x === maze.exit[0] && y === maze.exit[1] && html`<text x=${x + 0.5} y=${y + 0.75} font-size="0.7" text-anchor="middle">🚩</text>`}
    </g>`);
  }
  const shift = `translate(${VIEW / 2 - pos[0] - 0.5}px, ${VIEW / 2 - pos[1] - 0.5}px)`;
  const elapsed = done ? done.ms : t0 ? now - t0 : 0;

  return html`<div class="maze" role="dialog" aria-label="안개 미로">
    <div class="pr-top"><b>🧩 오늘의 미로</b><span>⏱ ${clock(Math.max(0, elapsed))}${best ? ` · 최고 ${clock(best)}` : ''}</span>
      <button class="x" onClick=${onClose} aria-label="닫기">✕</button></div>
    <div class="mz-field">
      <svg class="mz-map" viewBox=${`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" aria-label="미로">
        <g class="mz-rooms" style=${{ transform: shift }}>${rooms}</g>
      </svg>
      <span class=${'mz-pet' + (done ? ' win' : '')} key=${'b' + bump}><${Monster} id=${pet.id} shiny=${pet.shiny} acc=${pet.acc} px=${3} face=${done ? 'excited' : null} /></span>
      <svg class="mz-mini" viewBox=${`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        ${[...seen].map((k) => html`<rect key=${k} x=${k % SIZE} y=${Math.floor(k / SIZE)} width="1" height="1" />`)}
        <rect x=${maze.exit[0]} y=${maze.exit[1]} width="1" height="1" class=${seen.has(key(maze.exit)) ? 'exit' : 'hide'} />
        <rect x=${pos[0]} y=${pos[1]} width="1" height="1" class="me" />
      </svg>
      ${done ? html`<div class="mz-done"><b>탈출! ${clock(done.ms)}</b>${done.note && html`<small>${done.note}</small>`}
        <div class="bt-row"><button class="btn green" onClick=${restart}>다시</button><button class="btn blue" onClick=${onClose}>닫기</button></div></div>`
        : html`<p class="mz-hint">🚩 오른쪽 위 어딘가의 출구를 찾아요 · 버튼을 꾹 누르면 계속 가요</p>`}
    </div>
    <div class="mz-pad">${PADS.map(([dir, label]) => html`<button key=${dir} class=${'btn blue mz-' + dir} aria-label=${dir}
      onPointerDown=${(e) => { e.preventDefault(); press(dir); }} onPointerUp=${release} onPointerLeave=${release} onPointerCancel=${release}
      onContextMenu=${(e) => e.preventDefault()}>${label}</button>`)}</div>
  </div>`;
}

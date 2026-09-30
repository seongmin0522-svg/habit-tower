// BGM and sound effects. Phones allow sound only after a tap, so nothing plays before the first one.
// Files load as blobs through fetch: the service worker caches a plain 200 response (an <audio> range
// request it can't), so the second launch plays offline. Settings are per phone (localStorage).
import { tl } from './i18n.js';

const KEY = 'habit-tower-sound';
export const TRACKS = [
  { id: 1, name: tl('마을'), file: 'audio/bgm-town.mp3' },
  { id: 2, name: tl('요정의 샘'), file: 'audio/bgm-fairy.mp3' },
  { id: 3, name: tl('조용한 마을'), file: 'audio/bgm-hamlet.mp3' },
  { id: 4, name: tl('별빛 도시'), file: 'audio/bgm-starlight.mp3' },
];
const SFX = ['tap', 'shake', 'open', 'common', 'rare', 'epic', 'legend', 'shiny', 'brick', 'top'];
const DEFAULTS = { bgm: true, sfx: true, vibe: true, track: 1 }; // track: 1-4 or 'random' (picked once per launch)

let prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; } })();
const listeners = new Set();
const randomTrack = 1 + Math.floor(Math.random() * TRACKS.length);

export const getPrefs = () => prefs;
export const onPrefs = (f) => { listeners.add(f); return () => listeners.delete(f); };
export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode: this launch only */ }
  listeners.forEach((f) => f(prefs));
  applyBgm();
}

let ctx = null;          // Web Audio, created on the first tap
let audio = null, playing = null; // the BGM element and the track it holds
const buffers = new Map(); // sfx name -> Promise<AudioBuffer>

async function applyBgm() {
  if (!ctx) return;
  if (document.visibilityState === 'visible') ctx.resume?.(); // a phone suspends it in the background; effects need it too
  const want = prefs.bgm && document.visibilityState === 'visible';
  if (!want) { audio?.pause(); return; }
  const id = prefs.track === 'random' ? randomTrack : prefs.track;
  if (playing !== id) {
    playing = id;
    audio?.pause();
    const t = TRACKS.find((x) => x.id === id) ?? TRACKS[0];
    try {
      const url = URL.createObjectURL(await (await fetch(t.file)).blob());
      if (playing !== id) return URL.revokeObjectURL(url); // changed again while loading
      if (audio) URL.revokeObjectURL(audio.src);
      audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.35;
    } catch { playing = null; return; } // offline and never cached: try again next time
  }
  if (prefs.bgm && document.visibilityState === 'visible') audio.play().catch(() => {});
}

const load = (name) => {
  if (!buffers.has(name)) {
    buffers.set(name, fetch(`audio/sfx-${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
      .catch((e) => { buffers.delete(name); throw e; }));
  }
  return buffers.get(name);
};

export function sfx(name) {
  if (!ctx || !prefs.sfx) return;
  load(name).then((buf) => {
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }, () => {});
}

// Call once. The first tap anywhere unlocks audio (and warms up the effects).
export function initSound() {
  const unlock = () => {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    ctx.resume?.();
    SFX.forEach((n) => load(n).catch(() => {}));
    applyBgm();
  };
  addEventListener('pointerdown', unlock, { once: true, capture: true });
  addEventListener('keydown', unlock, { once: true, capture: true });
  document.addEventListener('visibilitychange', applyBgm);
}

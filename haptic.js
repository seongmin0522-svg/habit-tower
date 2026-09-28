// Vibration, on unless turned off in settings (the 'vibe' sound pref). Android: navigator.vibrate patterns.
// iPhone Safari has no Vibration API; clicking a hidden <input type=checkbox switch> gives one system
// haptic tick on iOS 18+ (unverified on a real phone), and only inside a tap handler.
import { getPrefs } from './sound.js';

// Under ~30ms some phone motors never spin up, so the shortest buzz is 40ms.
const PATTERNS = {
  tap: 40, glow: [50, 40, 90], stack: 80, top: [100, 60, 100, 60, 300], fall: [150, 80, 150, 80, 300],
  common: 70, rare: [70, 50, 70], epic: [80, 40, 80, 40, 160], legend: [100, 50, 100, 50, 100, 50, 360],
};

// Android ignores vibrate() until the page has been tapped once, so a buzz at launch (a fall) may not fire.
export function buzz(name) {
  if (!getPrefs().vibe) return;
  if (navigator.vibrate) { navigator.vibrate(PATTERNS[name] ?? 40); return; }
  iosTick();
}

// Settings' test button: 'ok' (the browser took it; no buzz then means the phone's own vibration
// settings mute it), 'blocked' (the browser refused), or 'ios' (one tick, the most iPhone allows).
export function testBuzz() {
  if (navigator.vibrate) return navigator.vibrate(300) ? 'ok' : 'blocked';
  iosTick();
  return 'ios';
}

function iosTick() {
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.style.display = 'none';
  label.append(input);
  document.body.append(label);
  label.click();
  label.remove();
}

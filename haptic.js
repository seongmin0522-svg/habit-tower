// Vibration, on unless turned off in settings (the 'vibe' sound pref). Android: navigator.vibrate patterns.
// iPhone Safari has no Vibration API; clicking a hidden <input type=checkbox switch> gives one system
// haptic tick on iOS 18+ (unverified on a real phone), and only inside a tap handler.
import { getPrefs } from './sound.js';

const PATTERNS = {
  tap: 18, glow: [50, 40, 90],
  common: 70, rare: [70, 50, 70], epic: [80, 40, 80, 40, 160], legend: [100, 50, 100, 50, 100, 50, 360],
};

export function buzz(name) {
  if (!getPrefs().vibe) return;
  if (navigator.vibrate) { navigator.vibrate(PATTERNS[name] ?? 20); return; }
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.style.display = 'none';
  label.append(input);
  document.body.append(label);
  label.click();
  label.remove();
}

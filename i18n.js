// Translation (spec: docs/superpowers/specs/2026-09-30-global-groundwork-design.md). The Korean text in the code is
// the key and lang/en.js maps it to English: tl`…${x}…` looks up '…{0}…' and fills the values in order, tl('…')
// looks up a plain string, and with no entry the Korean shows. For the check in i18n.test.mjs: inside tl`…` use only
// simple ${expressions} (no braces, no backticks), and tl('…') takes one single-quoted literal.
import { EN } from './lang/en.js';

const KEY = 'habit-tower-lang';
const PREFS = ['auto', 'ko', 'en'];

// 'auto' | 'ko' | 'en', as saved in settings.
export function langPref() {
  try { const p = localStorage.getItem(KEY); return PREFS.includes(p) ? p : 'auto'; } catch { return 'auto'; }
}
// This launch's language: ?lang= (testing), else the saved pref, else the phone's language. Node (tests): Korean.
export const LANG = (() => {
  if (typeof location === 'undefined') return 'ko';
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ko' || q === 'en') return q;
  const p = langPref();
  if (p !== 'auto') return p;
  return /^ko\b/i.test(navigator.language ?? '') ? 'ko' : 'en';
})();
// Settings: save, then reload so strings built at startup switch too.
export function setLang(pref) {
  try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  location.reload();
}

// strings: a template's string parts, or one plain string. A function entry gets the values (English plurals).
export function translate(dict, strings, vals) {
  const key = typeof strings === 'string' ? strings : strings.reduce((a, s, i) => `${a}{${i - 1}}${s}`);
  const v = dict?.[key];
  if (typeof v === 'function') return v(...vals);
  return (v ?? key).replace(/\{(\d+)\}/g, (m, i) => (i < vals.length ? String(vals[i]) : m));
}
export const tl = (strings, ...vals) => translate(LANG === 'en' ? EN : null, strings, vals);

// Calendar labels. ym: 'YYYY-MM'. Weekdays start on Sunday (2023-01-01 was one).
export const monthTitle = (ym, lang = LANG) =>
  new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
export const weekdays = (lang = LANG) => Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + i))));

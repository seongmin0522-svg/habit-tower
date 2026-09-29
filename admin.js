// Admin test mode, per phone (localStorage): on = everything unlocked, no daily limits, playroom/battle/maze results
// not saved; level = the pet level battles use (null = the real one). Only ADMIN_IDS see the switch (config.js).
const KEY = 'habit-admin';
let st = (() => { try { return { on: false, level: null, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { on: false, level: null }; } })();
const subs = new Set();
export const getAdmin = () => st;
export const onAdmin = (f) => { subs.add(f); return () => subs.delete(f); };
export function setAdmin(patch) {
  st = { ...st, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode: this launch only */ }
  subs.forEach((f) => f(st));
}

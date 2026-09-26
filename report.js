// Phone-only problems: uncaught errors (text only — no photos, no records) go to the Supabase table
// client_errors. Loaded as its own script and sent with plain fetch, so it still works when app.js fails
// to load, the phone storage never opens, or the Supabase SDK is missing.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const seen = new Set();
const ON = !!SUPABASE_URL && !new URLSearchParams(location.search).has('dev');

// Signed in: send as that user (supabase-js keeps the session in localStorage); else as anon.
const token = () => {
  try { return JSON.parse(localStorage.getItem(`sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`))?.access_token; }
  catch { return null; }
};

export async function report(message, stack = '') {
  message = String(message ?? '').slice(0, 500);
  if (!ON || seen.has(message) || seen.size >= 10) return; // once each, 10 per launch at most
  seen.add(message);
  const body = JSON.stringify({ message, stack: String(stack ?? '').slice(0, 2000),
    ua: navigator.userAgent.slice(0, 300), url: (location.pathname + location.search).slice(0, 200) });
  const send = (auth) => fetch(`${SUPABASE_URL}/rest/v1/client_errors`, { method: 'POST', body, headers: {
    apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal',
    ...(auth && { Authorization: `Bearer ${auth}` }) } });
  try { if ((await send(token())).status === 401) await send(null); } catch {} // expired session: retry as anon
}

addEventListener('error', (e) => report(e.message, e.error?.stack));
addEventListener('unhandledrejection', (e) => report(e.reason?.message ?? e.reason, e.reason?.stack));

// The "camera button is gone" symptom: 15s after launch the bottom bar is still empty and no window is open.
setTimeout(() => {
  if (document.querySelector('.bar')?.childElementCount || document.querySelector('.win')) return;
  report('stuck: empty bottom bar after 15s', document.body.innerText.slice(0, 200));
}, 15000);

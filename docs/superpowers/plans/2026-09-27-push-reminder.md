# Push Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At 21:00 KST, send a Web Push reminder to every signed-in user whose `days` has no row for today.

**Architecture:** The phone subscribes with a VAPID public key and stores its subscription in `push_subs`. `pg_cron` calls the Edge Function `remind` through `pg_net` at 12:00 UTC. The function reads its secrets from Vault through `remind_config()` and its targets from `remind_targets()`, sends the pushes with `@negrel/webpush`, and deletes subscriptions that answer 404 or 410. `sw.js` shows the notification.

**Tech Stack:** Supabase (Postgres, Vault, pg_cron, pg_net, Edge Functions/Deno), `jsr:@negrel/webpush@0.5.0` (WebCrypto only), Preact+htm, service worker.

Spec: `docs/superpowers/specs/2026-09-27-push-reminder-design.md`. Project ref: `bmghacmswvmrhfiwddie`.
Every Supabase write (migration, Vault, deploy, cron) and `git push` goes live. Ask 도균님 before each one.

---

### Task 1: Database — `push_subs`, target and config functions

**Files:**
- Modify: `supabase/schema.sql` (append at the end)

- [ ] **Step 1: Append to `supabase/schema.sql`**

```sql
-- Push reminders (9pm KST if today has no brick). One row per phone subscription.
-- The endpoint must be https: the remind function POSTs to it.
create table public.push_subs (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
create policy "push_subs own" on public.push_subs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- For the remind Edge Function only (service_role). Secrets live in Vault: cron_secret, vapid_keys.
create function public.remind_config() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
    'vapid_keys', (select decrypted_secret::json from vault.decrypted_secrets where name = 'vapid_keys'))
$$;

-- Subscriptions of people with no row in days for today (KST).
create function public.remind_targets() returns setof public.push_subs
language sql stable security definer set search_path = '' as $$
  select s.* from public.push_subs s
  where not exists (select 1 from public.days d
                    where d.user_id = s.user_id and d.day = (now() at time zone 'Asia/Seoul')::date)
$$;

revoke execute on function public.remind_config(), public.remind_targets() from public, anon, authenticated;
grant execute on function public.remind_config(), public.remind_targets() to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;
```

- [ ] **Step 2: Ask 도균님, then apply the block from Step 1**

`mcp__supabase__apply_migration` with name `push_reminders` and the block from Step 1 as the query.

- [ ] **Step 3: Verify permissions**

`mcp__supabase__execute_sql`:
```sql
select has_function_privilege('anon', 'public.remind_config()', 'execute') as anon_cfg,
       has_function_privilege('authenticated', 'public.remind_config()', 'execute') as auth_cfg,
       has_function_privilege('authenticated', 'public.remind_targets()', 'execute') as auth_tgt,
       has_function_privilege('service_role', 'public.remind_config()', 'execute') as svc_cfg;
```
Expected: `false, false, false, true`. Then run `mcp__supabase__get_advisors` (security). Expected: no new warning about `push_subs`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): push_subs and remind functions for the 9pm reminder"
```

### Task 2: Secrets — cron secret, VAPID keys, public key in `config.js`

**Files:**
- Modify: `config.js`

- [ ] **Step 1: Ask 도균님, then create the cron secret inside the DB (the value never leaves Postgres)**

```sql
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'cron_secret');
```

- [ ] **Step 2: Generate the VAPID key pair locally**

```bash
node -e "(async () => {
  const c = crypto.subtle;
  const k = await c.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = { publicKey: await c.exportKey('jwk', k.publicKey), privateKey: await c.exportKey('jwk', k.privateKey) };
  require('fs').writeFileSync(process.argv[1], JSON.stringify(jwk));
  console.log(Buffer.from(await c.exportKey('raw', k.publicKey)).toString('base64url'));
})()" "$SCRATCH/vapid.json"
```
`$SCRATCH` is the session scratchpad. It prints the public key: 87 base64url characters that decode to 65 bytes starting with `0x04`.

- [ ] **Step 3: Store the key pair in Vault**

```sql
select vault.create_secret('<contents of vapid.json>', 'vapid_keys');
```
Then delete `$SCRATCH/vapid.json` with `trash`.

- [ ] **Step 4: Verify both secrets through the function**

```sql
select length(c->>'cron_secret') as secret_len, c->'vapid_keys'->'privateKey'->>'crv' as crv
from (select public.remind_config() as c) x;
```
Expected: `48, P-256`.

- [ ] **Step 5: Add the public key to `config.js`**

```js
// Web Push (9pm reminder): public half of the VAPID pair. The private half is in Supabase Vault (vapid_keys).
export const VAPID_PUBLIC = '<printed key>';
```

- [ ] **Step 6: Commit**

```bash
git add config.js
git commit -m "feat: VAPID public key for push reminders"
```

### Task 3: Edge Function `remind`

**Files:**
- Create: `supabase/functions/remind/index.ts`

- [ ] **Step 1: Write the function**

```ts
// 9pm KST reminder, called by pg_cron (see supabase/schema.sql) with the x-cron-secret header.
// Pushes to every subscription whose owner has no brick today; drops subscriptions the push service says are gone.
// Body {"endpoint": "..."} sends to that one subscription only, brick or not (manual test).
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MESSAGE = JSON.stringify({ title: '🧱 오늘 벽돌 아직이에요', body: '자정 지나면 탑이 무너져요' });

Deno.serve(async (req) => {
  const { data: cfg, error } = await sb.rpc('remind_config');
  if (error || !cfg?.cron_secret) return new Response('config missing', { status: 500 });
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('unauthorized', { status: 401 });

  const only = (await req.json().catch(() => ({})))?.endpoint;
  const { data: subs, error: e2 } = only
    ? await sb.from('push_subs').select().eq('endpoint', only)
    : await sb.rpc('remind_targets');
  if (e2) return new Response(e2.message, { status: 500 });

  const app = await webpush.ApplicationServer.new({
    contactInformation: 'mailto:dokyun0813@gmail.com',
    vapidKeys: await webpush.importVapidKeys(cfg.vapid_keys),
  });
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      // ttl 3h: a phone that is off until morning shouldn't get last night's reminder.
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(MESSAGE, { ttl: 10800, urgency: webpush.Urgency.High });
      sent++;
    } catch (e) {
      if (e instanceof webpush.PushMessageError && [404, 410].includes(e.response.status)) {
        await sb.from('push_subs').delete().eq('endpoint', s.endpoint);
        gone++;
      } else {
        failed++;
        console.error(String(e));
      }
    }
  }));
  return Response.json({ sent, gone, failed });
});
```

- [ ] **Step 2: Ask 도균님, then deploy**

`mcp__supabase__deploy_edge_function` with name `remind`, `verify_jwt: false` (cron sends no JWT; the secret header guards it), and the one file `index.ts`.

- [ ] **Step 3: Verify the guard and an empty run**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind
```
Expected: `401`.

Read the secret with `select decrypted_secret from vault.decrypted_secrets where name='cron_secret'` and put it in `$S` (do not echo it). Then:
```bash
curl -s -X POST -H "x-cron-secret: $S" https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind
```
Expected: `{"sent":0,"gone":0,"failed":0}` (no subscriptions yet). A `500 config missing` means `SUPABASE_SERVICE_ROLE_KEY` did not work. Check `mcp__supabase__get_logs` (edge-function).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/remind/index.ts
git commit -m "feat: remind edge function sends the 9pm push and drops dead subscriptions"
```

### Task 4: Schedule

**Files:**
- Modify: `supabase/schema.sql` (append)

- [ ] **Step 1: Append**

```sql
-- 21:00 KST = 12:00 UTC.
select cron.schedule('habit-remind', '0 12 * * *', $$
  select net.http_post(
    url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$$);
```

- [ ] **Step 2: Ask 도균님, then run it** (`execute_sql`). Verify:

```sql
select jobname, schedule, active from cron.job;
```
Expected: `habit-remind | 0 12 * * * | true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): schedule the reminder at 21:00 KST"
```

### Task 5: Service worker shows the notification

**Files:**
- Modify: `sw.js` (cache name, and new listeners at the end)

- [ ] **Step 1: Bump the cache and add the listeners**

`const CACHE = 'habit-tower-v6';` → `const CACHE = 'habit-tower-v7';`. Append:

```js
// 9pm reminder from supabase/functions/remind. Tapping it brings the app forward (or opens it).
self.addEventListener('push', (e) => {
  const { title = '해빗 타워', body = '' } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'remind' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((ws) => (ws[0] ? ws[0].focus() : self.clients.openWindow('./'))));
});
```

- [ ] **Step 2: Syntax check.** Run `node --check sw.js`. Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "feat(sw): show the reminder push and open the app on tap"
```

### Task 6: `cloud.js` — subscribe, unsubscribe, re-save on sync, drop on sign-out

**Files:**
- Modify: `cloud.js` (import line 8, a helper block before `openCloud`, `doSync` after `const uid = s.user.id;`, the `api` object)

- [ ] **Step 1: Import the key.** Change line 8:

```js
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC } from './config.js';
```

- [ ] **Step 2: Add helpers above `export async function openCloud`**

```js
// Push reminder: this phone's subscription is in push_subs while it's on. Needs a registered service worker
// (none on localhost, and an iPhone only allows push in the home-screen app).
const pushReg = async () => ('PushManager' in window && (await navigator.serviceWorker?.getRegistration())) || null;
const saveSub = async (sb, sub) => {
  const { endpoint, keys } = sub.toJSON();
  must(await sb.from('push_subs').upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }));
};
// Unsubscribing kills the endpoint anyway (the server drops a gone one), so it runs even if the delete fails.
const dropSub = async (sb) => {
  const sub = await (await pushReg())?.pushManager.getSubscription();
  if (!sub) return;
  try { must(await sb.from('push_subs').delete().eq('endpoint', sub.endpoint)); } finally { await sub.unsubscribe(); }
};
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
```

- [ ] **Step 3: Re-save the subscription on every sync** (the browser can rotate it quietly). Insert after `const uid = s.user.id;` in `doSync`:

```js
    if (globalThis.Notification?.permission === 'granted') {
      const sub = await (await pushReg())?.pushManager.getSubscription();
      if (sub) await saveSub(sb, sub).catch((e) => report('push resave: ' + e.message)); // never blocks the sync
    }
```

- [ ] **Step 4: Add to `api`, and drop the subscription in `signOut` and `wipe`**

Add after `sync,`:

```js
    // 'on' | 'off' | 'denied' | 'unsupported'
    pushState: async () => {
      const reg = await pushReg();
      if (!reg) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
    },
    // Permission first: iPhone only asks while the tap is still "fresh".
    pushOn: call(async () => {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('알림이 허용되지 않았어요');
      const reg = await pushReg();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(VAPID_PUBLIC) });
      await saveSub(await client(), sub);
    }),
    pushOff: call(async () => dropSub(await client())),
```

Replace `signOut`:

```js
    signOut: call(async () => {
      const sb = await client();
      await dropSub(sb).catch(() => {}); // offline: the unsubscribe still happened, the server drops the row later
      await sb.auth.signOut({ scope: 'local' });
      await forget();
    }),
```

In `wipe`, before `must(await sb.rpc('leave_couple'));` insert:

```js
      await dropSub(sb);
```

- [ ] **Step 5: Syntax check and tests.** Run `node --check cloud.js && npm test`. Expected: all 17 tests pass.

- [ ] **Step 6: Commit**

```bash
git add cloud.js
git commit -m "feat: subscribe to the 9pm push from settings, re-save on sync, drop on sign-out"
```

### Task 7: Settings row

**Files:**
- Modify: `ui/windows.js` (import line 1; new `PushRow` before `function CoupleBox`; one line in `CoupleBox` before the leave/sign-out `<span>`)

- [ ] **Step 1: Import `useEffect`.** Change line 1 to `import { html, useState, useEffect } from './h.js';`

- [ ] **Step 2: Add the component above `// Settings "커플" section`**

```js
// Settings "알림": the 9pm reminder on this phone. The state comes from the phone (permission, subscription).
function PushRow({ api }) {
  const [st, setSt] = useState(null); // null while checking
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.pushState().then(setSt, () => setSt('unsupported')); }, []);
  const flip = (f) => {
    setBusy(true);
    setMsg('');
    f().catch((e) => setMsg(e.message)).then(api.pushState).then(setSt).finally(() => setBusy(false));
  };
  return html`<p>알림 <span class="muted small">— 밤 9시, 오늘 벽돌 아직이면</span>
    ${st === 'off' && html` <button type="button" class="btn green sm" disabled=${busy} onClick=${() => flip(api.pushOn)}>켜기</button>`}
    ${st === 'on' && html` <button type="button" class="btn blue sm" disabled=${busy} onClick=${() => flip(api.pushOff)}>끄기</button>`}
    ${st === 'unsupported' && html`<br /><span class="muted small">홈 화면에 추가한 앱에서만 알림이 돼요</span>`}
    ${st === 'denied' && html`<br /><span class="muted small">폰 설정에서 이 앱 알림을 허용해 주세요</span>`}
    ${msg && html`<br /><span class="small" role="status">${msg}</span>`}</p>`;
}
```

- [ ] **Step 3: Render it for signed-in users.** In `CoupleBox`, inside `${cloud.userId && html\`...`, directly before the `<span>` that holds `연결 끊기` and `로그아웃`:

```js
      <${PushRow} api=${api} />
```

- [ ] **Step 4: Render check.** Serve locally with `python3 -m http.server 8766 -d ~/habit-tower`. Open `http://localhost:8766/` in Chrome, signed in as 도균님 (email code through the Gmail MCP). Open settings. Expected: `알림 — 밤 9시…` with `홈 화면에 추가한 앱에서만 알림이 돼요`, because localhost has no service worker. No console errors.

- [ ] **Step 5: Commit**

```bash
git add ui/windows.js
git commit -m "feat(ui): reminder on/off row in settings"
```

### Task 8: End-to-end on desktop Chrome, then ship

- [ ] **Step 1: Turn it on locally.** On the same localhost tab, run in the console: `await navigator.serviceWorker.register('sw.js')`. Reload, open settings, and tap `켜기`. Allow the permission prompt; the user taps it in the Chrome window. Expected: the button turns into `끄기`. Check with `select user_id, left(endpoint, 40) from push_subs;`. Expected: one row with 도균님's id.

- [ ] **Step 2: Send one push.** Run `curl -X POST -H "x-cron-secret: $S" -H 'content-type: application/json' -d '{"endpoint":"<that endpoint>"}' …/functions/v1/remind`. Expected: `{"sent":1,…}`, and a desktop notification with `🧱 오늘 벽돌 아직이에요`. Clicking it focuses the tab.

- [ ] **Step 3: Check targeting.** Run `select count(*) from public.remind_targets();`. Expected: 1 if 도균님 has no row today, 0 if he has. Cross-check with `select day from days where user_id = '<id>' order by day desc limit 1;`.

- [ ] **Step 4: Gone cleanup.** In the console, run `(await (await navigator.serviceWorker.ready).pushManager.getSubscription()).unsubscribe()`. The row stays. Send to that endpoint again. Expected: `{"sent":0,"gone":1,"failed":0}` and `push_subs` empty.

- [ ] **Step 5: Off and sign-out paths.** Turn it on, then tap `끄기`. Expected: row gone. Turn it on again, then `로그아웃`. Expected: row gone. Unregister the localhost service worker afterwards with `(await navigator.serviceWorker.getRegistration()).unregister()`.

- [ ] **Step 6: Ask 도균님, then `git push`.** Pages redeploys in about 1 minute. Tell 도균님: on the Flip, open the app, then 설정 → 알림 켜기. 타비 needs iOS 16.4+ and the app opened from the home screen, then taps 설정 → 알림 켜기 herself. Nobody can do that step for another person: the permission prompt only appears after the owner's own tap.

- [ ] **Step 7: Update memory** `project_habit_tower.md`: push reminder shipped, Vault secrets, test body `{"endpoint"}`, cron `habit-remind`.

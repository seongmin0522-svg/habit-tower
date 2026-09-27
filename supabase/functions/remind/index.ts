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

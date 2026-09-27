// 9pm KST reminder, called by pg_cron (see supabase/schema.sql) with the x-cron-secret header.
// Pushes to every subscription whose owner has no brick today; drops subscriptions the push service says are gone.
// Body {"endpoint": "..."} sends to that one subscription only, brick or not (manual test).
// Body {"partner_of": "<uid>"} (days insert trigger) pushes that user's partner instead.
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const REMIND = { title: '🧱 오늘 벽돌 아직이에요', body: '자정 지나면 탑이 무너져요', tag: 'remind' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

type Sub = { endpoint: string; p256dh: string; auth: string };

// {"partner_of": uid}: uid's photo for today just landed (days insert trigger). Push uid's partner:
// "couple brick done" if the partner already certified today, else a nudge.
async function partnerPush(uid: string): Promise<{ subs: Sub[]; message: object; kind: string }> {
  const none = { subs: [], message: {}, kind: 'none' };
  const { data: me } = await sb.from('profiles').select('name, couple_id').eq('id', uid).maybeSingle();
  if (!me?.couple_id) return none;
  const { data: partner } = await sb.from('profiles').select('id').eq('couple_id', me.couple_id).neq('id', uid).maybeSingle();
  if (!partner) return none;
  const { data: done } = await sb.from('days').select('day').eq('user_id', partner.id).eq('day', today())
    .not('photo_path', 'is', null).maybeSingle();
  const { data: subs } = await sb.from('push_subs').select().eq('user_id', partner.id);
  const name = me.name || '짝꿍';
  return done
    ? { subs: subs ?? [], kind: 'couple', message: { title: '💞 커플 벽돌 완성!', body: `${name}도 인증해서 우리 탑이 한 층 올라갔어요`, tag: 'partner' } }
    : { subs: subs ?? [], kind: 'partner', message: { title: `🧱 ${name} 오늘 인증 완료`, body: '나도 쌓으러 가기 👉', tag: 'partner' } };
}

Deno.serve(async (req) => {
  const { data: cfg, error } = await sb.rpc('remind_config');
  if (error || !cfg?.cron_secret) return new Response('config missing', { status: 500 });
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  let subs: Sub[], message: object = REMIND, kind = 'remind';
  if (body?.partner_of) {
    ({ subs, message, kind } = await partnerPush(body.partner_of));
  } else {
    const { data, error: e2 } = body?.endpoint
      ? await sb.from('push_subs').select().eq('endpoint', body.endpoint)
      : await sb.rpc('remind_targets');
    if (e2) return new Response(e2.message, { status: 500 });
    subs = data;
  }

  const app = await webpush.ApplicationServer.new({
    contactInformation: 'mailto:dokyun0813@gmail.com',
    vapidKeys: await webpush.importVapidKeys(cfg.vapid_keys),
  });
  const text = JSON.stringify(message);
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      // ttl 3h: a phone that is off until morning shouldn't get last night's push.
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(text, { ttl: 10800, urgency: webpush.Urgency.High });
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
  return Response.json({ kind, sent, gone, failed });
});

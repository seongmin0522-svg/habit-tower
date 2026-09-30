// 9pm reminder in each person's own time zone, called every hour by pg_cron (see supabase/schema.sql) with the
// x-cron-secret header. Pushes to every subscription whose owner is at 21:xx local time with no brick today, in
// their language (profiles.lang); drops subscriptions the push service says are gone.
// Body {"endpoint": "..."} sends to that one subscription only, brick or not (manual test, Korean).
// Body {"partner_of": "<uid>", "day": "YYYY-MM-DD"} (days insert trigger) pushes that user's partner instead.
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MESSAGES = {
  ko: {
    remind: { title: '🧱 오늘 벽돌 아직이에요', body: '자정 지나면 탑이 무너져요', tag: 'remind' },
    couple: (name: string) => ({ title: '💞 커플 벽돌 완성!', body: `${name}도 인증해서 우리 탑이 한 층 올라갔어요`, tag: 'partner' }),
    partner: (name: string) => ({ title: `🧱 ${name} 오늘 인증 완료`, body: '나도 쌓으러 가기 👉', tag: 'partner' }),
    someone: '짝꿍',
  },
  en: {
    remind: { title: '🧱 No brick yet today', body: 'Your tower falls at midnight', tag: 'remind' },
    couple: (name: string) => ({ title: '💞 Couple brick done!', body: `${name} checked in too. Our tower grew a floor!`, tag: 'partner' }),
    partner: (name: string) => ({ title: `🧱 ${name} checked in today`, body: 'Your turn to stack 👉', tag: 'partner' }),
    someone: 'Your partner',
  },
};
const msgs = (lang?: string) => MESSAGES[lang === 'en' ? 'en' : 'ko'];

type Sub = { endpoint: string; p256dh: string; auth: string; message: object };

// uid's photo for their local `day` just landed. Push uid's partner: "couple brick done" if the partner has that day
// too, else a nudge.
async function partnerPush(uid: string, day: string): Promise<{ subs: Sub[]; kind: string }> {
  const none = { subs: [], kind: 'none' };
  if (!day) return none;
  const { data: me } = await sb.from('profiles').select('name, couple_id').eq('id', uid).maybeSingle();
  if (!me?.couple_id) return none;
  const { data: partner } = await sb.from('profiles').select('id, lang').eq('couple_id', me.couple_id).neq('id', uid).maybeSingle();
  if (!partner) return none;
  const { data: done } = await sb.from('days').select('day').eq('user_id', partner.id).eq('day', day)
    .not('photo_path', 'is', null).maybeSingle();
  const { data: subs } = await sb.from('push_subs').select('endpoint, p256dh, auth').eq('user_id', partner.id);
  const m = msgs(partner.lang), name = me.name || m.someone, message = done ? m.couple(name) : m.partner(name);
  return { subs: (subs ?? []).map((s) => ({ ...s, message })), kind: done ? 'couple' : 'partner' };
}

Deno.serve(async (req) => {
  const { data: cfg, error } = await sb.rpc('remind_config');
  if (error || !cfg?.cron_secret) return new Response('config missing', { status: 500 });
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  let subs: Sub[], kind = 'remind';
  if (body?.partner_of) {
    ({ subs, kind } = await partnerPush(body.partner_of, body.day));
  } else if (body?.endpoint) {
    const { data, error: e2 } = await sb.from('push_subs').select('endpoint, p256dh, auth').eq('endpoint', body.endpoint);
    if (e2) return new Response(e2.message, { status: 500 });
    subs = (data ?? []).map((s) => ({ ...s, message: MESSAGES.ko.remind }));
  } else {
    const { data, error: e2 } = await sb.rpc('remind_targets');
    if (e2) return new Response(e2.message, { status: 500 });
    subs = (data ?? []).map((s: Omit<Sub, 'message'> & { lang: string }) =>
      ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, message: msgs(s.lang).remind }));
  }

  const app = await webpush.ApplicationServer.new({
    contactInformation: 'mailto:dokyun0813@gmail.com',
    vapidKeys: await webpush.importVapidKeys(cfg.vapid_keys),
  });
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      // ttl 3h: a phone that is off until morning shouldn't get last night's push.
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(s.message), { ttl: 10800, urgency: webpush.Urgency.High });
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

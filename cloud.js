// Couple mode: Supabase sign-in, invite codes and a local-first sync.
// My records live on the phone (localdb.js); the cloud copy lets my partner see them and lets a new phone
// pull them back. Partner data is cached on the phone so their tower shows offline too.
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC } from './config.js';
import { report } from './report.js';
import { photoPath, toUpload, toRestore, shieldsToPush, notesToPush, splitReactions, pullsToPush, pullsToRestore } from './logic.js';
import { mergePets } from './pet.js';
import { mergeClears } from './maze.js';
import { LANG, tl } from './i18n.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const BUCKET = 'photos';

const MSG = [
  ['invite code not found', tl('초대코드를 찾을 수 없어요')],
  ['couple is full', tl('이미 두 명이 연결된 코드예요')],
  ['already in a couple', tl('이미 커플로 연결돼 있어요')],
  ['expired or is invalid', tl('코드가 틀렸거나 만료됐어요')],
  ['rate limit', tl('잠시 후 다시 시도해주세요')],
  ['Failed to fetch', tl('인터넷 연결을 확인해주세요')],
];
const friendly = (e) => new Error(MSG.find(([k]) => e?.message?.includes(k))?.[1] ?? e?.message ?? String(e));
const must = ({ data, error }) => { if (error) throw error; return data; };

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

// local: what openLocal() returns. onChange(state) on every change, where state =
// { email, userId, coupleId, code, name, mine, coupleTitle, coupleReward, coupleSkin, got, gave,
//   battles: [{challenger, defender, winner, at}],
//   partner: {id, name, character, habit, coupleCut, look, tz, pets: {<monsterId>: {gained, lost, wins}}} | null, partnerDays, synced, syncFailed }.
export async function openCloud(local, onChange) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const { db, assets, cloud: kv } = local;
  const st = {
    me: (await kv.get('me')) ?? {},
    partner: (await kv.get('partner')) ?? null,
    partnerDays: (await kv.get('partnerDays')) ?? {},
    synced: false,     // a sync succeeded during this launch
    syncFailed: false, // the last sync attempt failed (offline, server error): shown so a stale partner tower isn't a mystery
  };
  const emit = () => onChange({ ...st.me, partner: st.partner, partnerDays: st.partnerDays, synced: st.synced, syncFailed: st.syncFailed });
  const save = async (patch) => {
    Object.assign(st, patch);
    for (const k of ['me', 'partner', 'partnerDays']) if (k in patch) await kv.put(k, st[k]);
    emit();
  };
  const dropPartnerPhotos = async (keep = new Set()) => {
    for (const k of await kv.keys()) if (k.startsWith('ph:') && !keep.has(k.slice(3))) await kv.dropPhoto(k.slice(3));
  };
  const forget = async () => { unwatch(); await dropPartnerPhotos(); await save({ me: {}, partner: null, partnerDays: {}, synced: false }); };

  // Live updates: a partner row changing on the server (a photo, a note, a reaction) starts a sync, the one
  // code path that reads them. RLS decides which rows reach this phone; my own changes are skipped. Not profiles:
  // every sync rewrites mine, so watching them would bounce syncs between the two phones forever.
  // ponytail: each event re-reads everything; fine for two people, patch state from the payload if it ever isn't.
  let live = null, liveT;
  const watch = (sb, uid) => {
    if (live) return;
    const kick = (p) => {
      if (p.errors) return; // e.g. 401 while the token is being refreshed: nothing to act on
      const row = p.eventType === 'DELETE' ? p.old : p.new;
      if (row?.user_id === uid || row?.sender === uid) return;
      clearTimeout(liveT);
      liveT = setTimeout(() => sync(), 1500); // a photo upload lands as several writes
    };
    live = sb.channel('partner');
    for (const table of ['days', 'reactions']) live.on('postgres_changes', { event: '*', schema: 'public', table }, kick);
    live.subscribe();
  };
  const unwatch = () => { clearTimeout(liveT); const ch = live; live = null; if (ch) sbP?.then((sb) => sb.removeChannel(ch)); };

  // Loaded on first use; offline it fails and the next call tries again. Local records never wait on it.
  let sbP;
  const client = () => (sbP ??= import(SDK).then((m) => {
    const sb = m.createClient(SUPABASE_URL, SUPABASE_KEY);
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') forget(); }); // e.g. refresh token revoked
    return sb;
  }, (e) => { sbP = null; throw e; }));
  const session = async () => (await (await client()).auth.getSession()).data.session;
  const localDocs = async (c) => Object.fromEntries((await db.collection(c).get()).docs.map((d) => [d.id, d.data()]));
  const localDays = () => localDocs('days');

  async function doSync() {
    const sb = await client();
    const s = await session();
    if (!s) { if (st.me.userId) await forget(); return; }
    const uid = s.user.id;
    if (globalThis.Notification?.permission === 'granted') { // the browser can rotate the subscription quietly
      const sub = await (await pushReg())?.pushManager.getSubscription();
      if (sub) await saveSub(sb, sub).catch((e) => report('push resave: ' + e.message)); // never blocks the sync
    }
    const profs = must(await sb.from('profiles').select('id, name, character, habit, couple_id, couple_cut, look, room, tz'));
    const meRow = profs.find((p) => p.id === uid);
    const partner = profs.find((p) => p.id !== uid) ?? null;

    // New phone: pull back my records the phone doesn't have yet.
    const rows = must(await sb.from('days').select('day, photo_path, at, note, shield').eq('user_id', uid));
    const mine = Object.fromEntries(rows.map((r) => [r.day, r.photo_path]));
    const notes = Object.fromEntries(rows.map((r) => [r.day, r.note]));
    for (const { day, path, doc } of toRestore(rows, await localDays())) {
      if (path) await assets.put(doc.assetId, must(await sb.storage.from(BUCKET).download(path)));
      await db.doc(`days/${day}`).set(doc);
    }
    // Box results too: a new phone gets its collection back, and its opened boxes stay opened.
    const pullRows = must(await sb.from('pulls').select('box, item, shiny, dup, at').eq('user_id', uid));
    for (const { box, doc } of pullsToRestore(pullRows, await localDocs('pulls'))) await db.doc(`pulls/${box}`).set(doc);
    // Shop purchases (union both ways) and my room layout (a new phone takes the cloud's).
    const buyRows = must(await sb.from('purchases').select('item, at').eq('user_id', uid));
    const bought = await localDocs('shop');
    for (const r of buyRows) if (!bought[r.item]) await db.doc(`shop/${r.item}`).set({ at: r.at ?? '' });
    const newBuys = Object.keys(bought).filter((id) => !buyRows.some((r) => r.item === id));
    if (newBuys.length) must(await sb.from('purchases').upsert(newBuys.map((item) => ({ user_id: uid, item, at: bought[item].at || null }))));
    let room = (await db.doc('room/me').get()).data();
    if (!room && Object.keys(meRow?.room ?? {}).length) { room = meRow.room; await db.doc('room/me').set(room); }
    let habit = (await db.doc('habit/me').get()).data();
    if (!habit && meRow?.habit) {
      habit = { title: meRow.habit, character: meRow.character, seenFall: null, cutCouple: meRow.couple_cut ?? null, look: meRow.look ?? {} };
      await db.doc('habit/me').set(habit);
    }

    // Push what the cloud lacks: photo first, then the row, then drop the photo it replaced.
    const days = await localDays();
    for (const day of toUpload(days, mine, uid)) {
      const path = photoPath(uid, days[day].assetId);
      const blob = await assets.get(days[day].assetId);
      if (!blob) continue;
      must(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true }));
      const note = days[day].note ?? '';
      must(await sb.from('days').upsert({ user_id: uid, day, photo_path: path, at: days[day].at || null, note }));
      notes[day] = note;
      // ponytail: a failed delete leaves one orphan photo in storage; harmless.
      if (mine[day]) await sb.storage.from(BUCKET).remove([mine[day]]);
      mine[day] = path;
      await save({ me: { ...st.me, mine } }); // progress survives a dropped connection
    }

    for (const day of shieldsToPush(days, rows)) {
      must(await sb.from('days').upsert({ user_id: uid, day, photo_path: null, shield: true, at: days[day].at || null }));
    }
    for (const day of notesToPush(days, mine, notes, uid)) {
      must(await sb.from('days').update({ note: days[day].note ?? '' }).eq('user_id', uid).eq('day', day));
    }

    const pulls = await localDocs('pulls');
    const newPulls = pullsToPush(pulls, pullRows).map((box) => ({
      user_id: uid, box, item: pulls[box].item, shiny: !!pulls[box].shiny, dup: !!pulls[box].dup, at: pulls[box].at || null }));
    if (newPulls.length) must(await sb.from('pulls').upsert(newPulls));

    // Pet hearts, both ways: per pet the larger of each counter wins (pet.js mergePets).
    // ponytail: a feed landing between the read and a restore write is lost; restores only happen on a phone behind the cloud.
    const petRows = must(await sb.from('pets').select('monster, gained, lost, tastes, wins').eq('user_id', uid));
    const pets = mergePets(await localDocs('pets'), petRows);
    for (const { id, doc } of pets.restore) await db.doc(`pets/${id}`).set(doc);
    // Every row carries every column: a bulk upsert fills a key missing from one row with NULL, which NOT NULL rejects.
    if (pets.push.length) must(await sb.from('pets').upsert(pets.push.map((r) => ({ user_id: uid, monster: r.monster, gained: r.gained, lost: r.lost,
      tastes: r.tastes ?? {}, wins: r.wins ?? 0, updated_at: new Date().toISOString() }))));

    // Maze clears (shards), both ways: per day the faster time wins (maze.js mergeClears).
    const clearRows = must(await sb.from('maze_clears').select('day, ms, at').eq('user_id', uid));
    const clears = mergeClears(await localDocs('maze'), clearRows);
    for (const [day, doc] of clears.restore) await db.doc(`maze/${day}`).set(doc);
    if (clears.push.length) must(await sb.from('maze_clears').upsert(clears.push.map((r) => ({ user_id: uid, ...r, at: r.at || null }))));

    const name = st.me.name || meRow?.name || '';
    if (habit) {
      must(await sb.from('profiles').upsert({
        id: uid, name, character: habit.character, habit: habit.title, couple_cut: habit.cutCouple ?? null, look: habit.look ?? {}, room: room ?? {},
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: LANG,
        updated_at: new Date().toISOString(),
      }));
    }

    // Partner: rows + photos into the phone cache. A photo that fails to download is retried next sync.
    const partnerDays = {};
    const keep = new Set();
    if (partner) {
      const cached = new Set((await kv.keys()).filter((k) => k.startsWith('ph:')).map((k) => k.slice(3)));
      for (const r of must(await sb.from('days').select('day, photo_path, at, note, shield').eq('user_id', partner.id))) {
        if (!r.photo_path) { partnerDays[r.day] = { shield: true, at: r.at ?? '' }; continue; }
        if (!cached.has(r.photo_path)) {
          try { await kv.putPhoto(r.photo_path, must(await sb.storage.from(BUCKET).download(r.photo_path))); } catch { continue; }
        }
        keep.add(r.photo_path);
        partnerDays[r.day] = { assetId: r.photo_path, at: r.at ?? '', note: r.note };
      }
    }
    await dropPartnerPhotos(keep); // replaced photos, or a previous partner's
    // Battles: my partner's pet levels for their side, and our record (RLS: only the two of us).
    const partnerPets = partner ? Object.fromEntries(must(await sb.from('pets').select('monster, gained, lost, wins').eq('user_id', partner.id))
      .map((r) => [r.monster, r])) : {};
    const battles = must(await sb.from('battles').select('challenger, defender, winner, at').order('at', { ascending: false }).limit(2000)); // at most 3 counted a day each
    const info = (meRow?.couple_id && must(await sb.rpc('couple_info'))) || {};
    // Reactions: got = on my photos (from my partner), gave = mine on theirs. day -> emoji.
    const { got, gave } = splitReactions(must(await sb.from('reactions').select('owner, day, emoji')), uid);
    await save({
      me: { email: s.user.email, userId: uid, coupleId: meRow?.couple_id ?? null, code: meRow?.couple_id && !partner ? st.me.code ?? null : null, name, mine,
        coupleTitle: info.title ?? '', coupleReward: info.reward ?? '', coupleSkin: info.skin ?? {}, got, gave, battles },
      partner: partner && { id: partner.id, name: partner.name, character: partner.character, habit: partner.habit, coupleCut: partner.couple_cut,
        look: partner.look ?? {}, room: partner.room ?? {}, tz: partner.tz ?? null, pets: partnerPets },
      partnerDays,
      synced: true,
      syncFailed: false,
    });
    lastOk = Date.now();
    if (partner) watch(sb, uid); else unwatch();
  }

  // One sync at a time; a call during a run schedules one more pass right after it.
  // lazy (tab switch, back to the app): skip if the last good sync is under 30 seconds old.
  let running = null, again = false, lastOk = 0;
  const sync = ({ lazy = false } = {}) => {
    if (lazy && Date.now() - lastOk < 30000) return Promise.resolve();
    if (running) { again = true; return running; }
    running = doSync().catch((e) => {
      console.warn('sync failed', e);
      report(`sync: ${e?.message ?? e}`, e?.stack);
      st.syncFailed = true;
      emit();
    }).finally(() => {
      running = null;
      if (again) { again = false; sync(); }
    });
    return running;
  };

  const call = (f) => async (...a) => { try { return await f(...a); } catch (e) { throw friendly(e); } };
  const api = {
    sync,
    // 'on' | 'off' | 'denied' | 'unsupported'
    pushState: async () => {
      const reg = await pushReg();
      if (!reg) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
    },
    // Permission first: an iPhone only asks while the tap is still "fresh".
    pushOn: call(async () => {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error(tl('알림이 허용되지 않았어요'));
      const reg = await pushReg();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(VAPID_PUBLIC) });
      await saveSub(await client(), sub);
    }),
    pushOff: call(async () => dropSub(await client())),
    sendCode: call(async (email) => { must(await (await client()).auth.signInWithOtp({ email })); }),
    verify: call(async (email, token) => {
      must(await (await client()).auth.verifyOtp({ email, token, type: 'email' }));
      await save({ me: { ...st.me, email } });
      await sync();
    }),
    createCouple: call(async () => {
      const code = must(await (await client()).rpc('create_couple'));
      await save({ me: { ...st.me, code } });
      await sync();
    }),
    joinCouple: call(async (code) => { must(await (await client()).rpc('join_couple', { code })); await sync(); }),
    leave: call(async () => {
      must(await (await client()).rpc('leave_couple'));
      // The couple tower bookmark belongs to this couple only (the server drops its copy too).
      const habit = (await db.doc('habit/me').get()).data();
      if (habit?.cutCouple) await db.doc('habit/me').set({ ...habit, cutCouple: null });
      await save({ me: { ...st.me, coupleId: null, code: null } });
      await sync();
    }),
    // Shared couple texts; pass only the ones to change.
    setCoupleInfo: call(async ({ title, reward }) => {
      must(await (await client()).rpc('set_couple_info', { new_title: title ?? null, new_reward: reward ?? null }));
      const trim = (v, old) => (v == null ? old : v.trim().slice(0, 40));
      await save({ me: { ...st.me, coupleTitle: trim(title, st.me.coupleTitle), coupleReward: trim(reward, st.me.coupleReward) } });
      await sync();
    }),
    // Couple tower skin {bg, brick, flag}: pass only the ones to change, null back to the default.
    setCoupleSkin: call(async (patch) => {
      must(await (await client()).rpc('set_couple_skin', { patch }));
      const skin = { ...st.me.coupleSkin, ...patch };
      for (const k in skin) if (skin[k] == null) delete skin[k];
      await save({ me: { ...st.me, coupleSkin: skin } });
      await sync();
    }),
    setName: call(async (name) => { await save({ me: { ...st.me, name: name.trim().slice(0, 20) } }); await sync(); }),
    // A battle against my partner's pet ended. Needs a connection (no offline queue).
    recordBattle: call(async ({ mine, theirs, won }) => {
      const sb = await client(), defender = st.partner?.id, me = st.me.userId;
      if (!defender) return;
      must(await sb.from('battles').insert({ defender, c_monster: mine, d_monster: theirs, winner: won ? me : defender }));
      await sync();
    }),
    // One reaction per photo; null takes it back. Needs a connection (no offline queue).
    react: call(async (day, emoji) => {
      const sb = await client(), owner = st.partner?.id;
      if (!owner) return;
      if (emoji) must(await sb.from('reactions').upsert({ owner, day, sender: st.me.userId, emoji }));
      else must(await sb.from('reactions').delete().eq('owner', owner).eq('day', day).eq('sender', st.me.userId));
      const gave = { ...st.me.gave };
      if (emoji) gave[day] = emoji; else delete gave[day];
      await save({ me: { ...st.me, gave } });
    }),
    signOut: call(async () => {
      const sb = await client();
      await dropSub(sb).catch(() => {}); // offline: the unsubscribe still happened, the server drops the row later
      await sb.auth.signOut({ scope: 'local' });
      await forget();
    }),
    // Reset: delete my cloud records and photos and leave the couple. Throws (and the caller stops) if offline.
    wipe: call(async () => {
      const sb = await client(), s = await session();
      if (!s) return;
      const uid = s.user.id, bucket = sb.storage.from(BUCKET);
      for (;;) {
        const files = must(await bucket.list(uid, { limit: 1000 }));
        if (!files.length) break;
        const gone = must(await bucket.remove(files.map((f) => `${uid}/${f.name}`)));
        if (!gone.length) throw new Error(tl('클라우드 사진을 지우지 못했어요')); // a silent refusal would loop forever
      }
      must(await sb.from('days').delete().eq('user_id', uid));
      must(await sb.from('pulls').delete().eq('user_id', uid));
      must(await sb.from('pets').delete().eq('user_id', uid));
      must(await sb.from('battles').delete().eq('challenger', uid));
      must(await sb.from('maze_clears').delete().eq('user_id', uid));
      must(await sb.from('purchases').delete().eq('user_id', uid));
      await dropSub(sb);
      must(await sb.rpc('leave_couple'));
      await sb.auth.signOut({ scope: 'local' });
      await forget();
    }),
  };
  emit();
  return api;
}

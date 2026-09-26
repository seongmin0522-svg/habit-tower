// Couple mode: Supabase sign-in, invite codes and a local-first sync.
// My records live on the phone (localdb.js); the cloud copy lets my partner see them and lets a new phone
// pull them back. Partner data is cached on the phone so their tower shows offline too.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { photoPath, toUpload } from './logic.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const BUCKET = 'photos';

const MSG = [
  ['invite code not found', '초대코드를 찾을 수 없어요'],
  ['couple is full', '이미 두 명이 연결된 코드예요'],
  ['already in a couple', '이미 커플로 연결돼 있어요'],
  ['expired or is invalid', '코드가 틀렸거나 만료됐어요'],
  ['rate limit', '잠시 후 다시 시도해주세요'],
  ['Failed to fetch', '인터넷 연결을 확인해주세요'],
];
const friendly = (e) => new Error(MSG.find(([k]) => e?.message?.includes(k))?.[1] ?? e?.message ?? String(e));
const must = ({ data, error }) => { if (error) throw error; return data; };

// local: what openLocal() returns. onChange(state) on every change, where state =
// { email, userId, coupleId, code, name, mine, partner: {name, character, habit, coupleCut} | null, partnerDays, synced }.
export async function openCloud(local, onChange) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const { db, assets, cloud: kv } = local;
  const st = {
    me: (await kv.get('me')) ?? {},
    partner: (await kv.get('partner')) ?? null,
    partnerDays: (await kv.get('partnerDays')) ?? {},
    synced: false, // a sync succeeded during this launch
  };
  const emit = () => onChange({ ...st.me, partner: st.partner, partnerDays: st.partnerDays, synced: st.synced });
  const save = async (patch) => {
    Object.assign(st, patch);
    for (const k of ['me', 'partner', 'partnerDays']) if (k in patch) await kv.put(k, st[k]);
    emit();
  };
  const dropPartnerPhotos = async (keep = new Set()) => {
    for (const k of await kv.keys()) if (k.startsWith('ph:') && !keep.has(k.slice(3))) await kv.dropPhoto(k.slice(3));
  };
  const forget = async () => { await dropPartnerPhotos(); await save({ me: {}, partner: null, partnerDays: {}, synced: false }); };

  // Loaded on first use; offline it fails and the next call tries again. Local records never wait on it.
  let sbP;
  const client = () => (sbP ??= import(SDK).then((m) => {
    const sb = m.createClient(SUPABASE_URL, SUPABASE_KEY);
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') forget(); }); // e.g. refresh token revoked
    return sb;
  }, (e) => { sbP = null; throw e; }));
  const session = async () => (await (await client()).auth.getSession()).data.session;
  const localDays = async () => Object.fromEntries((await db.collection('days').get()).docs.map((d) => [d.id, d.data()]));

  async function doSync() {
    const sb = await client();
    const s = await session();
    if (!s) { if (st.me.userId) await forget(); return; }
    const uid = s.user.id;
    const profs = must(await sb.from('profiles').select('id, name, character, habit, couple_id, couple_cut'));
    const meRow = profs.find((p) => p.id === uid);
    const partner = profs.find((p) => p.id !== uid) ?? null;

    // New phone: pull back my records the phone doesn't have yet.
    const rows = must(await sb.from('days').select('day, photo_path, at').eq('user_id', uid));
    const mine = Object.fromEntries(rows.map((r) => [r.day, r.photo_path]));
    const have = await localDays();
    for (const r of rows) {
      if (have[r.day]) continue;
      const id = r.photo_path.split('/')[1].replace(/\.jpg$/, '');
      await assets.put(id, must(await sb.storage.from(BUCKET).download(r.photo_path)));
      await db.doc(`days/${r.day}`).set({ assetId: id, at: r.at ?? '' });
    }
    let habit = (await db.doc('habit/me').get()).data();
    if (!habit && meRow?.habit) {
      habit = { title: meRow.habit, character: meRow.character, seenFall: null, cutCouple: meRow.couple_cut ?? null };
      await db.doc('habit/me').set(habit);
    }

    // Push what the cloud lacks: photo first, then the row, then drop the photo it replaced.
    const days = await localDays();
    for (const day of toUpload(days, mine, uid)) {
      const path = photoPath(uid, days[day].assetId);
      const blob = await assets.get(days[day].assetId);
      if (!blob) continue;
      must(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true }));
      must(await sb.from('days').upsert({ user_id: uid, day, photo_path: path, at: days[day].at || null }));
      // ponytail: a failed delete leaves one orphan photo in storage; harmless.
      if (mine[day]) await sb.storage.from(BUCKET).remove([mine[day]]);
      mine[day] = path;
      await save({ me: { ...st.me, mine } }); // progress survives a dropped connection
    }

    const name = st.me.name || meRow?.name || '';
    if (habit) {
      must(await sb.from('profiles').upsert({
        id: uid, name, character: habit.character, habit: habit.title, couple_cut: habit.cutCouple ?? null,
        updated_at: new Date().toISOString(),
      }));
    }

    // Partner: rows + photos into the phone cache. A photo that fails to download is retried next sync.
    const partnerDays = {};
    const keep = new Set();
    if (partner) {
      const cached = new Set((await kv.keys()).filter((k) => k.startsWith('ph:')).map((k) => k.slice(3)));
      for (const r of must(await sb.from('days').select('day, photo_path, at').eq('user_id', partner.id))) {
        if (!cached.has(r.photo_path)) {
          try { await kv.putPhoto(r.photo_path, must(await sb.storage.from(BUCKET).download(r.photo_path))); } catch { continue; }
        }
        keep.add(r.photo_path);
        partnerDays[r.day] = { assetId: r.photo_path, at: r.at ?? '' };
      }
    }
    await dropPartnerPhotos(keep); // replaced photos, or a previous partner's
    await save({
      me: { email: s.user.email, userId: uid, coupleId: meRow?.couple_id ?? null, code: meRow?.couple_id && !partner ? st.me.code ?? null : null, name, mine },
      partner: partner && { name: partner.name, character: partner.character, habit: partner.habit, coupleCut: partner.couple_cut },
      partnerDays,
      synced: true,
    });
  }

  // One sync at a time; a call during a run schedules one more pass right after it.
  let running = null, again = false;
  const sync = () => {
    if (running) { again = true; return running; }
    running = doSync().catch((e) => console.warn('sync failed', e)).finally(() => {
      running = null;
      if (again) { again = false; sync(); }
    });
    return running;
  };

  const call = (f) => async (...a) => { try { return await f(...a); } catch (e) { throw friendly(e); } };
  const api = {
    sync,
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
    setName: call(async (name) => { await save({ me: { ...st.me, name: name.trim().slice(0, 20) } }); await sync(); }),
    signOut: call(async () => { await (await client()).auth.signOut({ scope: 'local' }); await forget(); }),
    // Reset: delete my cloud records and photos and leave the couple. Throws (and the caller stops) if offline.
    wipe: call(async () => {
      const sb = await client(), s = await session();
      if (!s) return;
      const uid = s.user.id, bucket = sb.storage.from(BUCKET);
      for (;;) {
        const files = must(await bucket.list(uid, { limit: 1000 }));
        if (!files.length) break;
        const gone = must(await bucket.remove(files.map((f) => `${uid}/${f.name}`)));
        if (!gone.length) throw new Error('클라우드 사진을 지우지 못했어요'); // a silent refusal would loop forever
      }
      must(await sb.from('days').delete().eq('user_id', uid));
      must(await sb.rpc('leave_couple'));
      await sb.auth.signOut({ scope: 'local' });
      await forget();
    }),
  };
  emit();
  return api;
}

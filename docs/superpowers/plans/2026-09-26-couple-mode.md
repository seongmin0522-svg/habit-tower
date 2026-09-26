# Couple Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도균님·여자친구가 각자 탑을 쌓고, 서로의 탑을 구경하고, 둘 다 인증한 날만 쌓이는 커플 탑을 함께 본다.

**Architecture:** Local-first. 내 기록 원본은 지금처럼 폰 IndexedDB. `cloud.js`가 Supabase에 내 기록을 올리고 상대 기록을 받아 폰(`cloud` 스토어)에 캐시한다. 올릴 목록은 outbox 대신 **매 sync마다 "폰 기록 vs 클라우드 기록" 비교**로 계산(`toUpload`) — 빠진 게 있으면 다음 sync가 알아서 채움. 커플 탑은 `coupleDays()`로 교집합을 만든 뒤 기존 `towers()`·`pendingFall()`·`Scene`을 그대로 재사용.

**Tech Stack:** Supabase (Postgres + RLS, Auth email OTP, Storage), `@supabase/supabase-js@2.117.2` (jsDelivr `+esm`, 동적 import), Preact+htm, `node --test`.

Spec: `docs/superpowers/specs/2026-09-26-couple-mode-design.md`

**스펙에서 바뀐 점 (계획 단계 결정):**
- outbox 스토어 없음 → 비교 방식(`toUpload`). 마이그레이션·유실 걱정 없음. "올릴 기록 N개"는 마지막으로 본 클라우드 목록(`me.mine`) 기준.
- 새 스토어 이름 `partner` → `cloud` (내 클라우드 상태 `me` + 상대 캐시 + 상대 사진 `ph:<path>` 모두 여기).
- 로그인 메일: Supabase 기본 메일은 **팀원 주소로만** 발송(공식 문서). 여자친구 주소로 보내려면 Gmail SMTP 연결 필요 → 도균님 작업에 추가.
- 커플 붕괴 판정은 **이번 실행에서 sync 성공 후에만** (옛 캐시로 가짜 붕괴 연출 방지).

**Files:**
- Create: `supabase/schema.sql`, `config.js`, `cloud.js`
- Modify: `logic.js`, `logic.test.mjs`, `localdb.js`, `db.js`, `ui/scene.js`, `ui/windows.js`, `app.js`, `index.html` (CSS만), `sw.js`

---

### Task 0: Supabase 프로젝트 + 스키마 (Claude가 MCP로)

**Files:** Create `supabase/schema.sql`, `config.js`

- [ ] **Step 1: 프로젝트 생성** — `list_organizations` → `create_project(name: 'habit-tower', region: 'ap-northeast-2', organization_id)` → `get_project`로 `ACTIVE_HEALTHY`까지 대기.

- [ ] **Step 2: `supabase/schema.sql` 작성**

```sql
-- Habit Tower couple mode. Applied once as a migration (or pasted into the SQL editor).

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_at timestamptz not null default now()
);
alter table public.couples enable row level security; -- no policies: reached only through the functions below

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (char_length(name) <= 20),
  character text not null default 'warrior' check (char_length(character) <= 20),
  habit text not null default '' check (char_length(habit) <= 40),
  couple_id uuid references public.couples on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  photo_path text not null check (char_length(photo_path) < 200),
  at timestamptz,
  primary key (user_id, day)
);
alter table public.days enable row level security;

-- The other member of the caller's couple, or null.
create function public.partner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  join public.profiles me on me.id = (select auth.uid())
  where p.couple_id = me.couple_id and p.id <> me.id
$$;

create function public.create_couple() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  code text;
  cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  if (select couple_id from public.profiles where id = me) is not null then raise exception 'already in a couple'; end if;
  loop -- 6 chars without look-alikes (0/O, 1/I)
    code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    begin
      insert into public.couples (invite_code) values (code) returning id into cid;
      exit;
    exception when unique_violation then -- taken: draw again
    end;
  end loop;
  update public.profiles set couple_id = cid where id = me;
  return code;
end $$;

create function public.join_couple(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into cid from public.couples where invite_code = upper(trim(code)) for update; -- one joiner at a time
  if cid is null then raise exception 'invite code not found'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  if (select couple_id from public.profiles where id = me) is not null then raise exception 'already in a couple'; end if;
  if (select count(*) from public.profiles where couple_id = cid) >= 2 then raise exception 'couple is full'; end if;
  update public.profiles set couple_id = cid where id = me;
end $$;

create function public.leave_couple() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set couple_id = null where id = (select auth.uid());
$$;

revoke execute on function public.partner_id(), public.create_couple(), public.join_couple(text), public.leave_couple() from public, anon;
grant execute on function public.partner_id(), public.create_couple(), public.join_couple(text), public.leave_couple() to authenticated;

-- profiles: read self + partner; write only your own row, never couple_id (functions only).
create policy "profiles read own or partner" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id = (select public.partner_id()));
create policy "profiles insert own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, name, character, habit, updated_at), update (id, name, character, habit, updated_at)
  on public.profiles to authenticated; -- upsert rewrites id too; the policy pins it to auth.uid()

-- days: read self + partner; write only your own rows, pointing at a photo in your own folder.
create policy "days read own or partner" on public.days for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.partner_id()));
create policy "days insert own" on public.days for insert to authenticated
  with check (user_id = (select auth.uid()) and split_part(photo_path, '/', 1) = (select auth.uid())::text);
create policy "days update own" on public.days for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and split_part(photo_path, '/', 1) = (select auth.uid())::text);
create policy "days delete own" on public.days for delete to authenticated
  using (user_id = (select auth.uid()));

-- Photos: private bucket, path '<user id>/<asset id>.jpg'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg']);
create policy "photos read own or partner" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.partner_id())::text));
create policy "photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos update own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

- [ ] **Step 3: 적용** — `apply_migration(name: 'couple_mode', query: <schema.sql 전체>)`. 이후 `get_advisors(type: 'security')` → 경고 0개(또는 이유 있는 것만) 확인.

- [ ] **Step 4: RLS 검사** — `execute_sql`로 아래 실행. 끝에서 일부러 예외를 던져 테스트 데이터 전부 롤백. **기대 결과: 오류 메시지 `RLS OK (rolled back)`**. `FAIL:`로 시작하면 정책 수정.

```sql
do $$
declare
  a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  c uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  code text;
  n int;
begin
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'a@test.invalid'),
    (b, 'authenticated', 'authenticated', 'b@test.invalid'),
    (c, 'authenticated', 'authenticated', 'c@test.invalid');

  -- a: makes a couple, records a day, can't write for others or touch couple_id
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  code := public.create_couple();
  insert into public.days (day, photo_path) values ('2026-09-01', a || '/p.jpg');
  begin
    insert into public.days (user_id, day, photo_path) values (b, '2026-09-01', b || '/p.jpg');
    raise exception 'FAIL: wrote a day for someone else';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set couple_id = null where id = a;
    raise exception 'FAIL: changed couple_id directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.days (day, photo_path) values ('2026-09-02', b || '/p.jpg');
    raise exception 'FAIL: pointed a day at another user''s photo';
  exception when insufficient_privilege then null; end;

  -- b: joins with a lower-case code, sees both couples' days
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.join_couple(lower(code));
  insert into public.days (day, photo_path) values ('2026-09-01', b || '/p.jpg');
  select count(*) into n from public.days;
  if n <> 2 then raise exception 'FAIL: b sees % days, expected 2', n; end if;
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'FAIL: b sees % profiles, expected 2', n; end if;

  -- c: can't join a full couple, sees only itself
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.join_couple(code);
    raise exception 'FAIL: third member joined';
  exception when others then if sqlerrm not like '%couple is full%' then raise; end if; end;
  insert into public.days (day, photo_path) values ('2026-09-01', c || '/p.jpg');
  select count(*) into n from public.days;
  if n <> 1 then raise exception 'FAIL: c sees % days, expected 1', n; end if;
  if exists (select 1 from public.profiles where id <> c) then raise exception 'FAIL: c sees other profiles'; end if;

  reset role;
  raise exception 'RLS OK (rolled back)';
end $$;
```

- [ ] **Step 5: `config.js`** — `get_project_url` + `get_publishable_keys`(disabled 아닌 `sb_publishable_...` 우선, 없으면 legacy anon).

```js
// Supabase project for couple mode. The publishable key is public by design: row-level security guards the data.
// Leave both empty to turn couple mode off.
export const SUPABASE_URL = 'https://<ref>.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_<...>';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql config.js
git commit -m "feat: Supabase schema for couple mode (profiles, days, couples, photos bucket, RLS)"
```

- [ ] **Step 7: 도균님 대시보드 작업 요청** (E2E 전까지만 끝나면 됨)
  1. Gmail 앱 비밀번호 발급 (Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호).
  2. Supabase → Authentication → Emails → SMTP Settings: Enable custom SMTP, host `smtp.gmail.com`, port `465`, username = Gmail 주소, password = 앱 비밀번호, sender email = Gmail 주소, sender name `해빗 타워`.
  3. Authentication → Emails → Templates: **Magic Link**와 **Confirm signup** 본문을 `<h2>해빗 타워 로그인 코드</h2><p style="font-size:24px"><b>{{ .Token }}</b></p>`로 교체.

---

### Task 1: logic.js — `coupleDays`, `photoPath`, `toUpload`

**Files:** Modify `logic.js` (after `pendingFall`, line 63), `logic.test.mjs`

- [ ] **Step 1: 실패하는 테스트** — `logic.test.mjs` import 줄에 `coupleDays, photoPath, toUpload` 추가, 끝에:

```js
test('coupleDays keeps only days both certified; the couple tower falls when either stops', () => {
  const mine = D(run('2026-09-20', 3));
  const theirs = { '2026-09-21': { assetId: 'u/x.jpg' }, '2026-09-22': {}, '2026-09-25': { assetId: 'u/y.jpg' } };
  assert.deepEqual(coupleDays(mine, theirs), { '2026-09-21': { assetId: 'a1', partnerAssetId: 'u/x.jpg' } });
  const c = coupleDays(D(run('2026-09-10', 16)), D(run('2026-09-10', 12))); // partner stopped after 12 days
  assert.equal(towers(c, T).current, null);
  assert.equal(pendingFall(c, T, null).keys.length, 12);
});

test('toUpload: my days the cloud lacks or has an older photo for', () => {
  assert.equal(photoPath('u1', 'a0'), 'u1/a0.jpg');
  const days = D(run('2026-09-23', 3), [['2026-09-26', {}]]);
  const mine = { '2026-09-23': 'u1/a0.jpg', '2026-09-24': 'u1/old.jpg' };
  assert.deepEqual(toUpload(days, mine, 'u1'), ['2026-09-24', '2026-09-25']);
  assert.deepEqual(toUpload(days, {}, 'u1'), ['2026-09-23', '2026-09-24', '2026-09-25']);
});
```

- [ ] **Step 2:** `npm test` → FAIL (`coupleDays` is not exported).

- [ ] **Step 3: 구현** — `logic.js`, `pendingFall` 아래:

```js
// Couple tower: days we both certified. The brick shows my photo left, my partner's right.
export function coupleDays(mine, theirs) {
  const out = {};
  for (const [k, d] of Object.entries(mine)) {
    if (d?.assetId && theirs[k]?.assetId) out[k] = { assetId: d.assetId, partnerAssetId: theirs[k].assetId };
  }
  return out;
}

// Cloud copy of my photo: '<user id>/<asset id>.jpg'. mine: day -> cloud path, as last seen.
export const photoPath = (uid, assetId) => `${uid}/${assetId}.jpg`;
export const toUpload = (days, mine, uid) =>
  Object.keys(days).filter((k) => days[k]?.assetId && mine[k] !== photoPath(uid, days[k].assetId)).sort();
```

- [ ] **Step 4:** `npm test` → 8 tests PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: couple tower days and upload diff"`

---

### Task 2: localdb.js v2 + db.js hooks

**Files:** Modify `localdb.js:6-11` (open), `:48-61` (assets), `:84-86` (reset), return; `db.js:18` (export), `:119-122` (ackFall)

- [ ] **Step 1: DB 버전 2** — `localdb.js` `open` 교체:

```js
const open = () => new Promise((ok, no) => {
  const r = indexedDB.open('habit-tower', 2);
  r.onupgradeneeded = (e) => {
    if (e.oldVersion < 1) { r.result.createObjectStore('docs'); r.result.createObjectStore('photos'); }
    if (e.oldVersion < 2) r.result.createObjectStore('cloud'); // couple mode: 'me', 'partner', 'partnerDays', 'ph:<path>' photos
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
```

- [ ] **Step 2: assets `get`/`put`, cloud 키-값** — `openLocal` 안, 사진 URL 로드 줄(39) 아래에 추가하고 `assets` 교체:

```js
  for (const [k, blob] of await entries(idb, 'cloud')) if (k.startsWith('ph:')) urls.set(k.slice(3), URL.createObjectURL(blob));
```

```js
  const assets = {
    get: (id) => run(idb, 'photos', 'readonly', (s) => s.get(id)),
    async put(id, blob) {
      await run(idb, 'photos', 'readwrite', (s) => s.put(blob, id));
      urls.set(id, URL.createObjectURL(blob));
    },
    async upload(blob) {
      const id = crypto.randomUUID();
      await assets.put(id, blob);
      return { id, url: urls.get(id), sizeBytes: blob.size, contentType: blob.type };
    },
    async delete(id) {
      await run(idb, 'photos', 'readwrite', (s) => s.delete(id));
      URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
      return { deleted: true };
    },
  };

  // Couple-mode cache. Partner photos live under 'ph:<cloud path>' and show through photoUrl(path).
  const cloud = {
    get: (k) => run(idb, 'cloud', 'readonly', (s) => s.get(k)),
    put: (k, v) => run(idb, 'cloud', 'readwrite', (s) => s.put(v, k)),
    keys: () => run(idb, 'cloud', 'readonly', (s) => s.getAllKeys()),
    async putPhoto(path, blob) { await cloud.put('ph:' + path, blob); urls.set(path, URL.createObjectURL(blob)); },
    async dropPhoto(path) {
      await run(idb, 'cloud', 'readwrite', (s) => s.delete('ph:' + path));
      URL.revokeObjectURL(urls.get(path));
      urls.delete(path);
    },
  };
```

`reset`의 스토어 목록 → `['docs', 'photos', 'cloud']`. 마지막 줄 → `return { db, assets, cloud, backup };`

- [ ] **Step 3: db.js** — `localBackup` 아래:

```js
export const localStore = () => (MODE === 'local' ? openLocalOnce() : Promise.resolve(null));
```

`ackFall` 교체 (커플 붕괴는 `seenCoupleFall`에 기록):

```js
    async ackFall(endKey, field = 'seenFall') {
      const s = ready();
      await db.doc('habit/me').set({ ...s.habit, [field]: endKey });
    },
```

- [ ] **Step 4: 확인** — `npm test` PASS. `python3 -m http.server 8766 -d ~/habit-tower` → 브라우저 `http://localhost:8766/`에서 기존 v1 DB를 가진 상태로 열어 기록이 그대로 보이는지, DevTools Application → IndexedDB `habit-tower` 버전 2 + `cloud` 스토어 확인.
- [ ] **Step 5: Commit** `git commit -am "feat: IndexedDB v2 with a cloud cache store"`

---

### Task 3: cloud.js — 로그인·커플·sync

**Files:** Create `cloud.js`

- [ ] **Step 1: 작성**

```js
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
// { email, userId, coupleId, code, name, mine, partner: {name, character, habit} | null, partnerDays, synced }.
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
    const profs = must(await sb.from('profiles').select('id, name, character, habit, couple_id'));
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
      habit = { title: meRow.habit, character: meRow.character, seenFall: null };
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
        id: uid, name, character: habit.character, habit: habit.title, updated_at: new Date().toISOString(),
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
      me: { email: s.user.email, userId: uid, coupleId: meRow?.couple_id ?? null, code: partner ? null : st.me.code ?? null, name, mine },
      partner: partner && { name: partner.name, character: partner.character, habit: partner.habit },
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
```

- [ ] **Step 2: 콘솔 검증** (UI 전) — `http://localhost:8766/`에서 DevTools 콘솔:

```js
const l = await (await import('./db.js')).localStore();
const api = await (await import('./cloud.js')).openCloud(l, (s) => console.log('cloud', s));
await api.sendCode('seongmin0522@gmail.com');   // Gmail MCP로 코드 확인
await api.verify('seongmin0522@gmail.com', '<code>');
```

기대: `cloud {... userId: '<uuid>', synced: true, mine: {<모든 기록 날짜>: '<uid>/<id>.jpg'}}`. Supabase `execute_sql`: `select count(*) from days` = 폰 기록 수, `select count(*) from storage.objects where bucket_id='photos'` 동일.
- [ ] **Step 3: Commit** `git add cloud.js && git commit -m "feat: cloud sync — email code sign-in, invite codes, local-first upload and partner cache"`

---

### Task 4: 화면 — 탭, 커플 탑, 상대 탑, 설정 창 커플 칸

**Files:** Modify `ui/scene.js:43-44, 48, 99`, `ui/windows.js`, `app.js`, `index.html` (CSS 끝)

- [ ] **Step 1: scene.js** — 반반 사진 벽돌 + 두 번째 캐릭터:

```js
// Lazy by default; eager for bricks that must show their photo the moment they move on screen.
// A couple brick (partnerAssetId) shows both photos side by side.
const Photo = ({ day, eager }) => {
  if (!day?.assetId) return null;
  const img = (id, cls) => html`<img class=${cls} src=${photoUrl(id)} alt="" loading=${eager ? 'eager' : 'lazy'} decoding="async" draggable="false" />`;
  return day.partnerAssetId ? html`${img(day.assetId, 'half')}${img(day.partnerAssetId, 'half')}` : img(day.assetId);
};
```

`export function Scene({ character, partnerCharacter, keys, days, anim, rubble, onBlock, onDone })`, 그리고 hero 줄 아래:

```js
      ${partnerCharacter && html`<span class="hero"><${Sprite} id=${partnerCharacter} px=${3.5} /></span>`}
```

- [ ] **Step 2: windows.js** — `Photo`에 두 장 보기, `FallNotice`에 제목, `CoupleBox` 추가, `Setup`에 연결:

```js
export function Photo({ day, n, names, onClose }) {
  return html`<${Win} title=${`${n}층 · ${day.key}`} onClose=${onClose} cls="photo-win">
    <div class="body">${day.partnerAssetId
      ? html`<div class="duo">${[[day.assetId, names[0]], [day.partnerAssetId, names[1]]].map(([id, who]) => html`
          <figure key=${id}><img src=${photoUrl(id)} alt=${`${who} 인증 사진`} /><figcaption>${who}</figcaption></figure>`)}</div>`
      : html`<img src=${photoUrl(day.assetId)} alt=${`${day.key} 인증 사진`} />`}</div>
  </${Win}>`;
}
```

```js
export function FallNotice({ floors, onOk, title = '탑이 무너졌어요' }) {
  return html`<${Win} title=${title} cls="fall-win">
```

(나머지 FallNotice 본문 그대로.)

```js
// Settings "커플" section: email code sign-in, name, invite code, leave, sign out.
function CoupleBox({ cloud, api }) {
  const [email, setEmail] = useState(cloud.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState(cloud.name ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const act = (f, after) => {
    setBusy(true);
    setMsg('');
    f().then(after, (e) => setMsg(e.message)).finally(() => setBusy(false));
  };
  const val = (set) => (e) => set(e.target.value);
  // Enter here must not submit the habit form around it.
  return html`<div class="backup couple" onKeyDown=${(e) => e.key === 'Enter' && e.preventDefault()}>
    <div class="lbl">커플 <span class="muted small">— 로그인하면 기록이 클라우드에도 올라가요</span></div>
    ${!cloud.userId && !sent && html`<span>
      <input type="email" autocomplete="email" placeholder="이메일" value=${email} onInput=${val(setEmail)} />
      <button type="button" class="btn blue sm" disabled=${busy || !email.includes('@')}
        onClick=${() => act(() => api.sendCode(email.trim()), () => setSent(true))}>코드 받기</button></span>`}
    ${!cloud.userId && sent && html`<span>
      <input inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="메일로 온 숫자" value=${code} onInput=${val(setCode)} />
      <button type="button" class="btn green sm" disabled=${busy || code.trim().length < 6}
        onClick=${() => act(() => api.verify(email.trim(), code.trim()), () => setCode(''))}>로그인</button>
      <button type="button" class="btn blue sm" onClick=${() => setSent(false)}>다시</button></span>`}
    ${cloud.userId && html`
      <label>내 이름 <input maxlength="20" value=${name} onInput=${val(setName)}
        onBlur=${() => name.trim() !== (cloud.name ?? '') && act(() => api.setName(name))} /></label>
      ${!cloud.coupleId && html`<span>
        <button type="button" class="btn green sm" disabled=${busy} onClick=${() => act(api.createCouple)}>커플 만들기</button>
        <input class="code" maxlength="6" placeholder="초대코드" value=${code} onInput=${val(setCode)} />
        <button type="button" class="btn blue sm" disabled=${busy || code.trim().length !== 6}
          onClick=${() => act(() => api.joinCouple(code), () => setCode(''))}>연결</button></span>`}
      ${cloud.coupleId && !cloud.partner && (cloud.code
        ? html`<p>초대코드 <b class="invite">${cloud.code}</b>
            <button type="button" class="btn blue sm" onClick=${() => navigator.clipboard?.writeText(cloud.code).then(() => setMsg('복사했어요'))}>복사</button>
            <br /><span class="muted small">상대가 설정 → 커플에서 이 코드를 넣으면 연결돼요</span></p>`
        : html`<p class="muted small">상대와 연결이 끊겼어요. 연결 끊기 후 새로 만들어요.</p>`)}
      ${cloud.partner && html`<p>❤ <b>${cloud.partner.name || '상대'}</b>와 연결됨</p>`}
      <span>
        ${cloud.coupleId && (leaving
          ? html`<button type="button" class="btn danger sm" disabled=${busy} onClick=${() => act(api.leave, () => setLeaving(false))}>정말 끊기</button>`
          : html`<button type="button" class="btn blue sm" onClick=${() => setLeaving(true)}>연결 끊기</button>`)}
        <button type="button" class="btn blue sm" disabled=${busy} onClick=${() => act(api.signOut)}>로그아웃</button>
        <span class="muted small">${cloud.email}</span>
      </span>`}
    ${msg && html`<p class="small" role="status">${msg}</p>`}
  </div>`;
}
```

`Setup` 시그니처에 `cloud, cloudApi` 추가. 초기화 확인 문구(50줄) 교체:

```js
          <p><b>모든 기록과 사진을 이 폰에서 지울까요?</b><br /><span class="muted small">${cloud?.userId
            ? '클라우드 기록·사진도 지우고 커플 연결도 끊겨요. 되돌릴 수 없어요.'
            : '되돌릴 수 없어요. 필요하면 먼저 내보내기 하세요.'}</span></p>
```

`</form>` 바로 앞(백업 칸 아래):

```js
      ${cloudApi && cloud && html`<${CoupleBox} cloud=${cloud} api=${cloudApi} />`}
```

- [ ] **Step 3: app.js** — 변경점:

import:
```js
import { todayKST, towers, pendingFall, coupleDays, TOWER_HEIGHT } from './logic.js';
import { connect, connectAssets, subscribe, makeActions, localBackup, localStore, MODE } from './db.js';
```
모듈 상단 `const EMPTY = {};`

상태 + 연결 (기존 `useEffect(() => { connect()...` 안에 한 줄 추가):
```js
  const [cloud, setCloud] = useState(null);       // couple-mode state from cloud.js; null = off
  const [cloudApi, setCloudApi] = useState(null);
  const [tab, setTab] = useState('couple');       // 'me' | 'couple' | 'partner', only while coupled
```
```js
    localStore().then((l) => l && import('./cloud.js').then((m) => m.openCloud(l, setCloud))).then(setCloudApi, () => {});
```
sync 시점 (시작 + 앱 복귀):
```js
  useEffect(() => {
    if (!cloudApi) return;
    cloudApi.sync();
    const onShow = () => document.visibilityState === 'visible' && cloudApi.sync();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [cloudApi]);
```
탑 계산 (기존 `const { current, past } = useMemo(...)` 교체):
```js
  const partner = cloud?.partner;
  const coupled = !!partner;
  const pdays = cloud?.partnerDays ?? EMPTY;
  const cdays = useMemo(() => coupleDays(state.days, pdays), [state.days, pdays]);
  const views = useMemo(() => ({
    me: towers(state.days, today), couple: towers(cdays, today), partner: towers(pdays, today),
  }), [state.days, cdays, pdays, today]);
  const view = coupled ? tab : 'me';
  const { current, past } = views[view];
  const days = { me: state.days, couple: cdays, partner: pdays }[view];
  const partnerName = partner?.name || '상대';
  const pending = cloud?.userId ? toUpload(state.days, cloud.mine ?? EMPTY, cloud.userId).length : 0;
```
(import에 `toUpload` 추가.)

붕괴 (기존 fallChecked effect 교체) — 내 탑 먼저, 그다음 커플 탑. 커플 탑은 이번 실행에서 sync 성공 후에만:
```js
  const fallChecked = useRef({});
  useEffect(() => {
    if (!state.loaded || !state.habit || anim || fall) return;
    const check = (scope, d, seen) => {
      if (fallChecked.current[scope] === today) return null;
      fallChecked.current[scope] = today;
      const pf = pendingFall(d, today, seen);
      return pf && { ...pf, scope };
    };
    const pf = check('me', state.days, state.habit.seenFall)
      ?? (coupled && cloud.synced ? check('couple', cdays, state.habit.seenCoupleFall) : null);
    if (!pf) return;
    if (coupled) setTab(pf.scope);
    setAnim({ kind: 'fall', keys: pf.keys });
    setTimeout(() => setFall(pf), FALL_MS);
  }, [state.loaded, state.habit, today, anim, fall, coupled, cloud?.synced, cdays]);
```
```js
  const ackFall = () => actions.ackFall(fall.keys.at(-1), fall.scope === 'couple' ? 'seenCoupleFall' : 'seenFall')
    .then(() => { setFall(null); setAnim(null); }, fail);
```
인증 — 상대가 오늘 인증했으면 커플 탭에서, 아니면 내 탭에서 쌓기. 끝나면 sync:
```js
      const r = await actions.certify(file, ({ retake }) => {
        if (retake) return;
        if (coupled) setTab(pdays[today]?.assetId ? 'couple' : 'me');
        setAnim({ kind: 'stack' });
        t = setTimeout(() => setAnim(null), STACK_MS);
      });
      if (r.retake) setToast('오늘 사진을 바꿨어요');
      cloudApi?.sync();
```
초기화 — 로그인 상태면 클라우드 먼저:
```js
  const onReset = () => (cloud?.userId ? cloudApi.wipe() : Promise.resolve())
    .then(() => backup.reset()).then(() => location.reload(), fail);
```
렌더 — HUD 제목/층수는 `view` 기준, HUD 아래 탭 바, Scene/Album/Photo/footer는 `view`의 데이터:
```js
  const title = { me: state.habit?.title, couple: '❤ 우리 탑', partner: `${partnerName} · ${partner?.habit ?? ''}` }[view] ?? '해빗 타워';
  const built = past.filter((t) => t.kind === 'built').length;
```
```js
    ${coupled && html`<nav class="tabs" role="tablist">${[['me', '나'], ['couple', '❤ 커플'], ['partner', partnerName]].map(([id, label]) => html`
      <button key=${id} role="tab" aria-selected=${view === id} disabled=${!!anim || !!fall}
        onClick=${() => { setTab(id); cloudApi?.sync(); }}>${label}</button>`)}</nav>`}
```
```js
        ${state.habit && html`<${Scene} key=${view}
          character=${view === 'partner' ? partner.character : state.habit.character}
          partnerCharacter=${view === 'couple' ? partner.character : null}
          keys=${keys} days=${days} anim=${anim} rubble=${past[0]?.kind === 'fell'}
          onBlock=${(k) => setModal({ key: k, n: keys.indexOf(k) + 1 })}
          onDone=${() => setAnim((a) => (a?.kind === 'stack' ? null : a))} />`}
```
footer — 상대 탭은 읽기 전용, 올릴 기록 표시:
```js
    <footer class="bar">
      ${!state.habit ? null
        : view === 'partner'
          ? html`<span class=${pdays[today]?.assetId ? 'done' : 'muted'}>${partnerName} ${pdays[today]?.assetId ? '오늘 완료 ✓' : '오늘 아직'}</span>`
          : doneToday
            ? html`<span class="done">오늘 완료 ✓</span>${camera('다시 찍기', 'blue sm')}`
            : camera('📷 인증하고 쌓기', 'green big')}
      ${pending > 0 && html`<span class="muted small">☁ 올릴 기록 ${pending}개</span>`}
      ${state.habit && !assets && db !== undefined && html`<span class="muted small">사진 저장을 쓸 수 없어요</span>`}
    </footer>
```
Setup/Album/Photo/FallNotice:
```js
    ${(needSetup || modal === 'setup') && html`<${Setup} habit=${state.habit} onClose=${() => setModal(null)}
      backup=${backup} onExport=${onExport} onSaveFile=${onSaveFile} onImport=${onImport} onReset=${onReset}
      cloud=${cloud} cloudApi=${cloudApi}
      onSave=${(f) => actions.setHabit(f).then(() => { setModal(null); cloudApi?.sync(); }, fail)} />`}
    ${modal === 'album' && html`<${Album} current=${current} past=${past} days=${days}
      onPick=${(k, n) => setModal({ key: k, n })} onClose=${() => setModal(null)} />`}
    ${modal?.key && html`<${Photo} day=${{ key: modal.key, ...days[modal.key] }} n=${modal.n}
      names=${[cloud?.name || '나', partnerName]} onClose=${() => setModal(null)} />`}
    ${fall && html`<${FallNotice} floors=${fall.keys.length} onOk=${ackFall}
      title=${fall.scope === 'couple' ? '우리 탑이 무너졌어요' : undefined} />`}
```
(HUD `<b>` → `${title}`. 기존 `built` 정의 줄은 위 것으로 대체, `keys`·`doneToday`는 그대로.)

- [ ] **Step 4: CSS** — `index.html` `</style>` 앞:

```css
/* Couple mode */
.tabs { display: flex; background: #2a2a2a; border-bottom: 2px solid #777; }
.tabs button { flex: 1; min-width: 0; background: none; border: 0; color: #bbb; padding: 6px 4px; font-weight: bold;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabs button[aria-selected="true"] { color: var(--gold); box-shadow: inset 0 -3px var(--gold); }
.blk img.half, .carried img.half { float: left; width: 50%; }
.duo { display: flex; } .duo figure { margin: 0; flex: 1; min-width: 0; } .duo figcaption { text-align: center; padding: 2px; }
.couple > span { align-items: center; margin-bottom: 6px; } .couple input { width: auto; flex: 1; min-width: 0; margin: 0; }
.couple input.code { text-transform: uppercase; max-width: 90px; }
.invite { font-size: 18px; letter-spacing: 3px; color: #b36200; }
```

- [ ] **Step 5: 확인 (로그인 없이)** — `http://localhost:8766/?dev&seed=fall` 붕괴 → 확인, `?dev&seed=30` 쌓기 — 기존과 동일해야 함(커플 기능 숨김). `npm test` PASS.
- [ ] **Step 6: Commit** `git commit -am "feat: couple mode screens — tabs, couple tower with split bricks, partner tower, settings sign-in"`

---

### Task 5: sw.js

**Files:** Modify `sw.js:5, 8-13, 19, 23`

- [ ] **Step 1:**
  - `const CACHE = 'habit-tower-v5';`
  - SHELL에 `'config.js', 'cloud.js',` 추가.
  - `fetch` 첫 줄 아래: 
    ```js
      const url = e.request.url;
      if (!url.startsWith(self.location.origin) && !url.startsWith(CDN)) return; // Supabase API and storage: straight to the network
    ```
  - CDN 줄: `if (url.startsWith(CDN)) return (await cached()) ?? net(); // pinned versions: keep what we fetch (supabase-js pulls in its own modules)`
  - 파일 상단 주석에 "Supabase requests bypass the worker" 한 줄.
- [ ] **Step 2: Commit** `git commit -am "fix: service worker leaves Supabase requests alone and caches pinned CDN modules"`

---

### Task 6: E2E + 배포

전제: Task 0 Step 7 (Gmail SMTP + 템플릿) 완료.

- [ ] **Step 1: 두 계정 두 창** — 출처가 달라야 IndexedDB·세션이 분리됨: 창 A `http://localhost:8766/`, 창 B `http://127.0.0.1:8766/`. A = `seongmin0522@gmail.com`, B = `seongmin0522+b@gmail.com`. 로그인 코드는 Gmail MCP `search_threads`로 읽음.
- [ ] **Step 2: 시나리오**
  1. A: 습관 설정 → 인증 1장 → 로그인 → `☁ 올릴 기록` 사라짐. `execute_sql`: A의 days 1행 + storage 1개.
  2. A: 커플 만들기 → 코드 표시. B: 습관 설정 → 로그인 → 코드 입력(소문자로) → 연결.
  3. B 인증 → 커플 탭에서 반반 벽돌 쌓기 연출. A 창 복귀(탭 전환) → 상대 탭에 B 사진, 커플 탭 1층.
  4. A 오프라인(DevTools Network Offline) 다시 찍기 → `☁ 올릴 기록 1개` → 온라인 복귀 + 탭 전환 → 0개, storage 옛 사진 삭제 확인.
  5. 세 번째 창(`http://$(ipconfig getifaddr en0):8766/`, 계정 `seongmin0522+c@gmail.com`) 같은 코드 입력 → "이미 두 명이 연결된 코드예요".
  6. A 초기화 → `execute_sql`: A의 days 0행, storage A 폴더 비어 있음, B 쪽 상대 탭 사라짐(sync 후).
  7. 새 폰 복원: A 초기화 전 단계에서 창 C(`[::1]`)로 A 계정 로그인 → A 기록·사진·습관 복원.
  8. 390px 폭에서 탭 바·설정 창 레이아웃.
- [ ] **Step 3: 커플 붕괴** — `execute_sql`로 B의 어제 행 삭제(테스트 계정만) → A 새로고침 → 커플 탭 붕괴 연출 1회 → 다시 새로고침 시 안 나옴.
- [ ] **Step 4: 정리** — 테스트 계정 삭제: `delete from auth.users where email like 'seongmin0522+%'` (storage 테스트 사진은 대시보드 또는 `storage.from('photos').remove` — 도균님 확인 후).
- [ ] **Step 5: 배포** — `superpowers:verification-before-completion` 기준 확인 → 도균님 승인 → `git push`. 폰 두 대에서 실제 확인(카메라, 로그인 메일, 커플 연결).
- [ ] **Step 6:** 메모리 `project_habit_tower.md` 갱신 (Supabase project ref, SMTP, 구조).

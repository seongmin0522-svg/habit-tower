-- Habit Tower couple mode. Applied once as a migration (or pasted into the SQL editor).

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  title text not null default '' check (char_length(title) <= 40), -- couple tower name, shared
  reward text not null default '' check (char_length(reward) <= 40), -- 30-floor reward, shared
  created_at timestamptz not null default now()
);
alter table public.couples enable row level security; -- no policies: reached only through the functions below

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (char_length(name) <= 20),
  character text not null default 'warrior' check (char_length(character) <= 20),
  habit text not null default '' check (char_length(habit) <= 40),
  couple_id uuid references public.couples on delete set null,
  couple_cut date, -- couple tower "start over" bookmark; both members use the later one
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  photo_path text check (char_length(photo_path) < 200), -- null on a shield day
  at timestamptz,
  note text not null default '' check (char_length(note) <= 40), -- one line on the photo
  shield boolean not null default false, -- no photo; keeps the tower from falling
  primary key (user_id, day),
  constraint days_photo_or_shield check (photo_path is not null or shield)
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

-- Shared couple texts (tower name, 30-floor reward): read and written only through these
-- (couples stays closed to clients). In set_couple_info, null leaves a field as it is.
create function public.couple_info() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('title', c.title, 'reward', c.reward)
  from public.couples c join public.profiles p on p.couple_id = c.id where p.id = (select auth.uid())
$$;

create function public.set_couple_info(new_title text default null, new_reward text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.couples
  set title = coalesce(left(trim(new_title), 40), title), reward = coalesce(left(trim(new_reward), 40), reward)
  where id = (select couple_id from public.profiles where id = auth.uid());
  if not found then raise exception 'not in a couple'; end if;
end $$;

create function public.leave_couple() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set couple_id = null, couple_cut = null where id = (select auth.uid()); -- drop the bookmark too
$$;

revoke execute on function public.partner_id(), public.create_couple(), public.join_couple(text), public.leave_couple(),
  public.couple_info(), public.set_couple_info(text, text) from public, anon;
grant execute on function public.partner_id(), public.create_couple(), public.join_couple(text), public.leave_couple(),
  public.couple_info(), public.set_couple_info(text, text) to authenticated;

-- profiles: read self + partner; write only your own row, never couple_id (functions only).
create policy "profiles read own or partner" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id = (select public.partner_id()));
create policy "profiles insert own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, name, character, habit, couple_cut, updated_at), update (id, name, character, habit, couple_cut, updated_at)
  on public.profiles to authenticated; -- upsert rewrites id too; the policy pins it to auth.uid()

-- days: read self + partner; write only your own rows, pointing at a photo in your own folder (if any).
create policy "days read own or partner" on public.days for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.partner_id()));
create policy "days insert own" on public.days for insert to authenticated
  with check (user_id = (select auth.uid()) and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text));
create policy "days update own" on public.days for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text));
create policy "days delete own" on public.days for delete to authenticated
  using (user_id = (select auth.uid()));

-- Reactions on the partner's photos: one per sender per day; sending another replaces it.
create table public.reactions (
  owner uuid not null references auth.users on delete cascade,   -- whose photo
  day date not null,
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  emoji text not null check (emoji in ('❤️', '🔥', '👏')),
  at timestamptz not null default now(),
  primary key (owner, day, sender)
);
alter table public.reactions enable row level security;
create policy "reactions read mine" on public.reactions for select to authenticated
  using (owner = (select auth.uid()) or sender = (select auth.uid()));
create policy "reactions send to partner" on public.reactions for insert to authenticated
  with check (sender = (select auth.uid()) and owner = (select public.partner_id()));
create policy "reactions change own" on public.reactions for update to authenticated
  using (sender = (select auth.uid()))
  with check (sender = (select auth.uid()) and owner = (select public.partner_id()));
create policy "reactions take back own" on public.reactions for delete to authenticated
  using (sender = (select auth.uid()));

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

-- Phone-only problems: the app writes uncaught errors here (text only). Write-only for clients; read in the dashboard.
create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  message text not null check (char_length(message) <= 500),
  stack text not null default '' check (char_length(stack) <= 2000),
  ua text not null default '' check (char_length(ua) <= 300),
  url text not null default '' check (char_length(url) <= 200)
);
alter table public.client_errors enable row level security;
create policy "report errors" on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

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

create extension if not exists pg_net with schema extensions; -- not public (advisor); its functions live in schema net
create extension if not exists pg_cron;

-- 21:00 KST = 12:00 UTC (cron.timezone is GMT).
select cron.schedule('habit-remind', '0 12 * * *', $$
  select net.http_post(
    url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$$);

-- Rewards (2026-09-27): gacha box results, what each of us wears, the couple tower skin.
-- pulls: one row per opened box, so a new phone gets its collection back. Only the owner reads them.
create table public.pulls (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  box text not null check (box ~ '^([dc]:\d{4}-\d{2}-\d{2}|b:\d{1,5})$'),
  item text not null check (char_length(item) <= 40),
  shiny boolean not null default false,
  dup boolean not null default false,
  at timestamptz,
  primary key (user_id, box)
);
alter table public.pulls enable row level security;
create policy "pulls own" on public.pulls for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- look: {monster, shiny, char, bg, brick, flag, badge} — my partner sees it.
alter table public.profiles add column look jsonb not null default '{}'::jsonb check (pg_column_size(look) < 2000);
grant insert (look), update (look) on public.profiles to authenticated; -- profiles writes are column-granted (see above)
-- skin: {bg, brick, flag} for the couple tower; whoever changed it last wins.
alter table public.couples add column skin jsonb not null default '{}'::jsonb check (pg_column_size(skin) < 1000);

create or replace function public.couple_info() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('title', c.title, 'reward', c.reward, 'skin', c.skin)
  from public.couples c join public.profiles p on p.couple_id = c.id where p.id = (select auth.uid())
$$;

-- patch: only bg/brick/flag keys, each a short id or null (null = back to the default).
create function public.set_couple_skin(patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(patch) <> 'object' or exists (select 1 from jsonb_each(patch) e
    where e.key not in ('bg', 'brick', 'flag') or jsonb_typeof(e.value) not in ('string', 'null') or char_length(e.value #>> '{}') > 40)
  then raise exception 'bad skin'; end if;
  update public.couples set skin = jsonb_strip_nulls(skin || patch)
  where id = (select couple_id from public.profiles where id = auth.uid());
  if not found then raise exception 'not in a couple'; end if;
end $$;
revoke execute on function public.set_couple_skin(jsonb) from public, anon;
grant execute on function public.set_couple_skin(jsonb) to authenticated;

-- Partner push (2026-09-27): my photo for today lands, my partner's phone hears about it.
-- Insert only: a retake is an update, so at most one per person per day. Shield days and late uploads of past days send nothing.
create function public.notify_partner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.photo_path is not null and new.day = (now() at time zone 'Asia/Seoul')::date then
    perform net.http_post(
      url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := jsonb_build_object('partner_of', new.user_id),
      timeout_milliseconds := 10000);
  end if;
  return null;
end $$;
revoke execute on function public.notify_partner() from public, anon, authenticated;
create trigger days_notify_partner after insert on public.days
  for each row execute function public.notify_partner();

-- Live updates (2026-09-27): partner photos and reactions reach an open app without a refresh (cloud.js watch).
-- RLS still decides who receives which row. Not profiles: every sync rewrites them.
alter publication supabase_realtime add table public.days, public.reactions;
-- Signed-out clients never touch these; Realtime sends DELETE events without RLS, so anon gets no access at all.
revoke all on public.days, public.reactions from anon;

-- Pets (2026-09-29): hearts per pet, so a new phone keeps its pet levels. Both counters only grow;
-- hearts = gained - lost, and a sync takes the larger of each. Level boxes are pulls 'p:<monsterId>:<level>'.
alter table public.pulls drop constraint pulls_box_check;
alter table public.pulls add constraint pulls_box_check
  check (box ~ '^([dc]:\d{4}-\d{2}-\d{2}|b:\d{1,5}|p:[a-z]+-[a-z]+:\d{1,2})$');
create table public.pets (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  monster text not null check (monster ~ '^[a-z]+-[a-z]+$'),
  gained integer not null default 0 check (gained >= 0),
  lost integer not null default 0 check (lost >= 0 and lost <= gained),
  updated_at timestamptz not null default now(),
  primary key (user_id, monster)
);
alter table public.pets enable row level security;
create policy "pets own" on public.pets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.pets from anon;
-- Tastes a pet showed (2026-09-29): {<food>: 'like' | 'hate'}, merged as a union.
alter table public.pets add column tastes jsonb not null default '{}'::jsonb check (pg_column_size(tastes) < 500);
-- Battle wins per pet (2026-09-29): only grows, merged by max.
alter table public.pets add column wins integer not null default 0 check (wins >= 0);

-- Battles against my partner's pet (2026-09-29): their pet levels are readable by me, results are shared by the two of us.
create policy "pets partner read" on public.pets for select to authenticated
  using (user_id = (select public.partner_id()));
create table public.battles (
  id bigint generated always as identity primary key,
  challenger uuid not null default auth.uid() references auth.users on delete cascade,
  defender uuid not null references auth.users on delete cascade,
  c_monster text not null check (c_monster ~ '^[a-z]+-[a-z]+$'),
  d_monster text not null check (d_monster ~ '^[a-z]+-[a-z]+$'),
  winner uuid not null,
  at timestamptz not null default now(),
  check (winner = challenger or winner = defender)
);
alter table public.battles enable row level security;
create policy "battles read" on public.battles for select to authenticated
  using ((select auth.uid()) = challenger or (select auth.uid()) = defender);
create policy "battles insert" on public.battles for insert to authenticated
  with check (challenger = (select auth.uid()) and defender = (select public.partner_id()));
create policy "battles delete own" on public.battles for delete to authenticated
  using (challenger = (select auth.uid()));
revoke all on public.battles from anon;

-- Maze clears (2026-09-29): one row per day escaped, the best time; each day is one box shard.
create table public.maze_clears (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  ms integer not null check (ms > 0),
  at timestamptz,
  primary key (user_id, day)
);
alter table public.maze_clears enable row level security;
create policy "maze own" on public.maze_clears for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.maze_clears from anon;
-- Maze captures (2026-09-29): pulls 'w:<day>', at most one a day.
alter table public.pulls drop constraint pulls_box_check;
alter table public.pulls add constraint pulls_box_check
  check (box ~ '^([dcw]:\d{4}-\d{2}-\d{2}|b:\d{1,5}|p:[a-z]+-[a-z]+:\d{1,2})$');

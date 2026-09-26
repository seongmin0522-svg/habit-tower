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

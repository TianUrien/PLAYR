create type public.friendship_status as enum (
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'blocked'

as $$
create table public.profile_friendships (
  actor_id uuid := auth.uid();
  actor_role text := auth.role();
begin
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles (id) on delete cascade,
  user_two uuid not null references public.profiles (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  if tg_op = 'UPDATE' then
    if actor_role <> 'service_role' then
      if actor_id is null or (actor_id <> old.user_one and actor_id <> old.user_two) then
        raise exception 'Only friendship participants can update the relationship';
      end if;

      if new.user_one <> old.user_one or new.user_two <> old.user_two or new.requester_id <> old.requester_id then
        raise exception 'Friendship participants are immutable';
      end if;

      if new.status = 'accepted' then
        if old.status <> 'pending' then
          raise exception 'Only pending friendships can be accepted';
        end if;
        if actor_id = old.requester_id then
          raise exception 'Requester cannot accept their own friendship request';
        end if;
      end if;

      if new.status in ('cancelled', 'rejected') and actor_id <> old.requester_id then
        raise exception 'Only the requester can cancel or reject a friendship';
      end if;

      if new.status = 'pending' and old.status <> 'pending' then
        raise exception 'Friendships cannot revert to pending';
      end if;
    end if;
  end if;
  accepted_at timestamptz,
  pair_key_lower uuid generated always as (least(user_one, user_two)) stored,
  pair_key_upper uuid generated always as (greatest(user_one, user_two)) stored,
  constraint profile_friendships_participants_different check (user_one <> user_two),
  constraint profile_friendships_requester_in_pair check (requester_id = user_one or requester_id = user_two)
);

create unique index if not exists profile_friendships_pair_key_idx
  on public.profile_friendships (pair_key_lower, pair_key_upper);

create index if not exists profile_friendships_status_idx on public.profile_friendships (status);
create index if not exists profile_friendships_requester_idx on public.profile_friendships (requester_id);

create or replace function public.handle_friendship_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_one = new.user_two then
    raise exception 'Cannot create friendship with yourself';
  end if;

  if new.requester_id is null or (new.requester_id <> new.user_one and new.requester_id <> new.user_two) then
    raise exception 'Requester must be part of the friendship';
  end if;

  if new.status = 'accepted' then
    if new.accepted_at is null then
      new.accepted_at := timezone('utc', now());
    end if;
  else
    new.accepted_at := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

create trigger profile_friendships_handle_state
before insert or update on public.profile_friendships
for each row execute function public.handle_friendship_state();

create trigger profile_friendships_set_updated_at
before update on public.profile_friendships
for each row execute function public.handle_updated_at();

create or replace view public.profile_friend_edges as
select
  pf.id,
  pf.user_one,
  pf.user_two,
  pf.requester_id,
  pf.status,
  pf.created_at,
  pf.updated_at,
  pf.accepted_at,
  pf.pair_key_lower,
  pf.pair_key_upper,
  pf.user_one as profile_id,
  pf.user_two as friend_id
from public.profile_friendships pf
union all
select
  pf.id,
  pf.user_one,
  pf.user_two,
  pf.requester_id,
  pf.status,
  pf.created_at,
  pf.updated_at,
  pf.accepted_at,
  pf.pair_key_lower,
  pf.pair_key_upper,
  pf.user_two as profile_id,
  pf.user_one as friend_id
from public.profile_friendships pf;

alter table public.profile_friendships enable row level security;

create policy "friendships readable"
  on public.profile_friendships
  for select
  using (
    status = 'accepted'
    or auth.uid() = user_one
    or auth.uid() = user_two
    or auth.role() = 'service_role'
  );

create policy "friendships insert"
  on public.profile_friendships
  for insert
  with check (
    auth.role() = 'service_role'
    or (
      auth.uid() = requester_id
      and (auth.uid() = user_one or auth.uid() = user_two)
      and status = 'pending'
    )
  );

drop policy if exists "friendships update" on public.profile_friendships;

create policy "friendships requester update"
  on public.profile_friendships
  for update
  using (
    auth.role() = 'service_role'
    or auth.uid() = requester_id
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.uid() = requester_id
      and status in ('pending', 'cancelled', 'rejected', 'blocked')
    )
  );

create policy "friendships recipient update"
  on public.profile_friendships
  for update
  using (
    auth.role() = 'service_role'
    or (
      auth.uid() <> requester_id
      and (auth.uid() = user_one or auth.uid() = user_two)
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.uid() <> requester_id
      and (auth.uid() = user_one or auth.uid() = user_two)
      and status in ('accepted', 'blocked')
    )
  );

create policy "friendships delete"
  on public.profile_friendships
  for delete
  using (
    auth.role() = 'service_role'
    or auth.uid() = user_one
    or auth.uid() = user_two
  );

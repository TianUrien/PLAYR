set check_function_bodies = off;
set search_path = public;

begin;

-- =========================================================================
-- Track unread state per (recipient, sender)
-- =========================================================================
create table if not exists public.user_unread_senders (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  unread_message_count bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_unread_senders_pk primary key (user_id, sender_id)
);

comment on table public.user_unread_senders is 'Per-sender unread message counters for each user.';
comment on column public.user_unread_senders.unread_message_count is 'Number of unread messages currently outstanding from this sender to the user.';

create index if not exists idx_user_unread_senders_user on public.user_unread_senders (user_id);
create index if not exists idx_user_unread_senders_sender on public.user_unread_senders (sender_id);

-- =========================================================================
-- Keep high-level counters in sync with sender rows
-- =========================================================================
create or replace function public.sync_unread_counter_from_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := timezone('utc', now());
begin
  if tg_op = 'INSERT' then
    insert into public.user_unread_counters as counters (user_id, unread_count, updated_at)
    values (new.user_id, 1, now_ts)
    on conflict (user_id) do update
      set unread_count = greatest(0, counters.unread_count + 1),
          updated_at = now_ts;
    return new;
  elsif tg_op = 'DELETE' then
    update public.user_unread_counters
       set unread_count = greatest(0, unread_count - 1),
           updated_at = now_ts
     where user_id = old.user_id;

    delete from public.user_unread_counters
     where user_id = old.user_id
       and unread_count = 0;

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists user_unread_senders_after_insert on public.user_unread_senders;
drop trigger if exists user_unread_senders_after_delete on public.user_unread_senders;

create trigger user_unread_senders_after_insert
  after insert on public.user_unread_senders
  for each row execute function public.sync_unread_counter_from_sender();

create trigger user_unread_senders_after_delete
  after delete on public.user_unread_senders
  for each row execute function public.sync_unread_counter_from_sender();

comment on column public.user_unread_counters.unread_count is 'Number of distinct senders who currently have unread messages for the user.';

-- =========================================================================
-- Helpers to mutate sender rows from message triggers
-- =========================================================================
create or replace function public.increment_unread_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  now_ts timestamptz := timezone('utc', now());
begin
  if new.read_at is not null then
    return new;
  end if;

  recipient_id := public.get_message_recipient(new.conversation_id, new.sender_id);

  if recipient_id is null or recipient_id = new.sender_id then
    return new;
  end if;

  update public.user_unread_senders
     set unread_message_count = unread_message_count + 1,
         updated_at = now_ts
   where user_id = recipient_id
     and sender_id = new.sender_id;

  if not found then
    insert into public.user_unread_senders (user_id, sender_id, unread_message_count, updated_at)
    values (recipient_id, new.sender_id, 1, now_ts);
  end if;

  return new;
end;
$$;

create or replace function public.decrement_unread_counter_on_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  remaining bigint;
  now_ts timestamptz := timezone('utc', now());
begin
  if not (old.read_at is null and new.read_at is not null) then
    return new;
  end if;

  recipient_id := public.get_message_recipient(new.conversation_id, new.sender_id);

  if recipient_id is null or recipient_id = new.sender_id then
    return new;
  end if;

  update public.user_unread_senders
     set unread_message_count = greatest(0, unread_message_count - 1),
         updated_at = now_ts
   where user_id = recipient_id
     and sender_id = new.sender_id
   returning unread_message_count into remaining;

  if not found then
    return new;
  end if;

  if remaining <= 0 then
    delete from public.user_unread_senders
     where user_id = recipient_id
       and sender_id = new.sender_id;
  end if;

  return new;
end;
$$;

create or replace function public.decrement_unread_counter_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  remaining bigint;
  now_ts timestamptz := timezone('utc', now());
begin
  if old.read_at is not null then
    return old;
  end if;

  recipient_id := public.get_message_recipient(old.conversation_id, old.sender_id);

  if recipient_id is null or recipient_id = old.sender_id then
    return old;
  end if;

  update public.user_unread_senders
     set unread_message_count = greatest(0, unread_message_count - 1),
         updated_at = now_ts
   where user_id = recipient_id
     and sender_id = old.sender_id
   returning unread_message_count into remaining;

  if not found then
    return old;
  end if;

  if remaining <= 0 then
    delete from public.user_unread_senders
     where user_id = recipient_id
       and sender_id = old.sender_id;
  end if;

  return old;
end;
$$;

-- =========================================================================
-- Backfill sender rows + counters from existing unread messages
-- =========================================================================
with unread_pairs as (
  select
    case
      when c.participant_one_id = m.sender_id then c.participant_two_id
      else c.participant_one_id
    end as user_id,
    m.sender_id,
    count(*)::bigint as unread_count
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.read_at is null
  group by 1, 2
)
insert into public.user_unread_senders (user_id, sender_id, unread_message_count, updated_at)
select user_id, sender_id, unread_count, timezone('utc', now())
from unread_pairs
where user_id is not null and user_id <> sender_id
on conflict (user_id, sender_id) do update
  set unread_message_count = excluded.unread_message_count,
      updated_at = excluded.updated_at;

with aggregated as (
  select user_id, count(*)::bigint as sender_count
  from public.user_unread_senders
  group by user_id
)
insert into public.user_unread_counters (user_id, unread_count, updated_at)
select user_id, sender_count, timezone('utc', now())
from aggregated
on conflict (user_id) do update
  set unread_count = excluded.unread_count,
      updated_at = excluded.updated_at;

delete from public.user_unread_counters cuc
where not exists (
  select 1 from public.user_unread_senders sus
  where sus.user_id = cuc.user_id
);

commit;

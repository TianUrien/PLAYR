set check_function_bodies = off;

-- ============================================================================
-- Notification enums and table
-- ============================================================================
set search_path = public;

do $$ begin
  create type public.profile_notification_kind as enum ('friend_request', 'profile_comment');
exception when duplicate_object then null;
end $$;

create table if not exists public.profile_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  kind public.profile_notification_kind not null,
  source_entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.profile_notifications is 'Inbox-style notification feed for comments and friendships.';
comment on column public.profile_notifications.recipient_profile_id is 'Profile receiving the notification.';
comment on column public.profile_notifications.actor_profile_id is 'Profile that triggered the notification.';
comment on column public.profile_notifications.source_entity_id is 'Stable identifier for the originating record (friendship/comment/etc).';

create index if not exists profile_notifications_recipient_idx
  on public.profile_notifications (recipient_profile_id, created_at desc);

create index if not exists profile_notifications_kind_idx
  on public.profile_notifications (kind) where cleared_at is null;

create unique index if not exists profile_notifications_source_unique
  on public.profile_notifications (kind, source_entity_id)
  where source_entity_id is not null;

create trigger profile_notifications_set_updated_at
  before update on public.profile_notifications
  for each row execute function public.handle_updated_at();

alter table public.profile_notifications enable row level security;

drop policy if exists "Recipients can read notifications" on public.profile_notifications;
create policy "Recipients can read notifications"
  on public.profile_notifications
  for select
  using (recipient_profile_id = auth.uid());

drop policy if exists "Recipients can update notifications" on public.profile_notifications;
create policy "Recipients can update notifications"
  on public.profile_notifications
  for update
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

drop policy if exists "Recipients can delete notifications" on public.profile_notifications;
create policy "Recipients can delete notifications"
  on public.profile_notifications
  for delete
  using (recipient_profile_id = auth.uid());

-- ============================================================================
-- Notification helper functions (fetch/read/clear)
-- ============================================================================
create or replace function public.fetch_profile_notifications(
  p_limit integer default 40,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind public.profile_notification_kind,
  source_entity_id uuid,
  payload jsonb,
  created_at timestamptz,
  read_at timestamptz,
  cleared_at timestamptz,
  actor jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clamped_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
  clamped_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if current_user_id is null then
    return;
  end if;

  return query
    select
      pn.id,
      pn.kind,
      pn.source_entity_id,
      pn.payload,
      pn.created_at,
      pn.read_at,
      pn.cleared_at,
      jsonb_build_object(
        'id', actor.id,
        'full_name', actor.full_name,
        'role', actor.role,
        'username', actor.username,
        'avatar_url', actor.avatar_url,
        'base_location', actor.base_location
      ) as actor
    from public.profile_notifications pn
    left join public.profiles actor on actor.id = pn.actor_profile_id
    where pn.recipient_profile_id = current_user_id
      and pn.cleared_at is null
    order by pn.created_at desc
    limit clamped_limit offset clamped_offset;
end;
$$;

grant execute on function public.fetch_profile_notifications(integer, integer) to authenticated;

create or replace function public.mark_profile_notifications_read(
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  updated_rows integer := 0;
begin
  if current_user_id is null then
    return 0;
  end if;

  update public.profile_notifications
     set read_at = timezone('utc', now())
   where recipient_profile_id = current_user_id
     and cleared_at is null
     and read_at is null
     and (p_notification_ids is null or id = any(p_notification_ids));

  get diagnostics updated_rows = row_count;
  return updated_rows;
end;
$$;

grant execute on function public.mark_profile_notifications_read(uuid[]) to authenticated;

create or replace function public.clear_profile_notifications(
  p_notification_ids uuid[] default null,
  p_kind public.profile_notification_kind default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  cleared_rows integer := 0;
begin
  if current_user_id is null then
    return 0;
  end if;

  update public.profile_notifications
     set cleared_at = timezone('utc', now())
   where recipient_profile_id = current_user_id
     and cleared_at is null
     and (p_kind is null or kind = p_kind)
     and (p_notification_ids is null or id = any(p_notification_ids));

  get diagnostics cleared_rows = row_count;
  return cleared_rows;
end;
$$;

grant execute on function public.clear_profile_notifications(uuid[], public.profile_notification_kind) to authenticated;

-- ============================================================================
-- Friend request notification lifecycle
-- ============================================================================
create or replace function public.handle_friend_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  payload jsonb;
  now_ts timestamptz := timezone('utc', now());
begin
  recipient := case
    when new.requester_id = new.user_one then new.user_two
    else new.user_one
  end;

  if recipient is null or recipient = new.requester_id then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' then
    payload := jsonb_build_object(
      'friendship_id', new.id,
      'requester_id', new.requester_id,
      'status', new.status
    );

    insert into public.profile_notifications (
      recipient_profile_id,
      actor_profile_id,
      kind,
      source_entity_id,
      payload,
      created_at,
      updated_at,
      read_at,
      cleared_at
    ) values (
      recipient,
      new.requester_id,
      'friend_request',
      new.id,
      payload,
      now_ts,
      now_ts,
      null,
      null
    )
    on conflict (kind, source_entity_id) where source_entity_id is not null do update
      set recipient_profile_id = excluded.recipient_profile_id,
          actor_profile_id = excluded.actor_profile_id,
          payload = excluded.payload,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          read_at = null,
          cleared_at = null;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'pending' and new.status = 'pending' then
      payload := jsonb_build_object(
        'friendship_id', new.id,
        'requester_id', new.requester_id,
        'status', new.status
      );

      insert into public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at,
        read_at,
        cleared_at
      ) values (
        recipient,
        new.requester_id,
        'friend_request',
        new.id,
        payload,
        now_ts,
        now_ts,
        null,
        null
      )
      on conflict (kind, source_entity_id) where source_entity_id is not null do update
        set recipient_profile_id = excluded.recipient_profile_id,
            actor_profile_id = excluded.actor_profile_id,
            payload = excluded.payload,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            read_at = null,
            cleared_at = null;
    elsif old.status = 'pending' and new.status <> 'pending' then
      update public.profile_notifications
         set cleared_at = now_ts
       where kind = 'friend_request'
         and source_entity_id = new.id;
    end if;
  end if;

  return new;
end;
$$;

create trigger profile_friendships_notify
  after insert or update on public.profile_friendships
  for each row execute function public.handle_friend_request_notification();

-- ============================================================================
-- Profile comment notification lifecycle
-- ============================================================================
create or replace function public.handle_profile_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snippet text := left(new.content, 160);
  now_ts timestamptz := timezone('utc', now());
  payload jsonb;
begin
  if new.profile_id = new.author_profile_id then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'visible' then
    payload := jsonb_build_object(
      'comment_id', new.id,
      'profile_id', new.profile_id,
      'snippet', snippet
    );

    insert into public.profile_notifications (
      recipient_profile_id,
      actor_profile_id,
      kind,
      source_entity_id,
      payload,
      created_at,
      updated_at,
      read_at,
      cleared_at
    ) values (
      new.profile_id,
      new.author_profile_id,
      'profile_comment',
      new.id,
      payload,
      now_ts,
      now_ts,
      null,
      null
    )
    on conflict (kind, source_entity_id) where source_entity_id is not null do update
      set actor_profile_id = excluded.actor_profile_id,
          payload = excluded.payload,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          read_at = null,
          cleared_at = null;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'visible' and new.status = 'visible' then
      payload := jsonb_build_object(
        'comment_id', new.id,
        'profile_id', new.profile_id,
        'snippet', snippet
      );

      insert into public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at,
        read_at,
        cleared_at
      ) values (
        new.profile_id,
        new.author_profile_id,
        'profile_comment',
        new.id,
        payload,
        now_ts,
        now_ts,
        null,
        null
      )
      on conflict (kind, source_entity_id) where source_entity_id is not null do update
        set actor_profile_id = excluded.actor_profile_id,
            payload = excluded.payload,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            read_at = null,
            cleared_at = null;
    elsif old.status = 'visible' and new.status <> 'visible' then
      update public.profile_notifications
         set cleared_at = now_ts
       where kind = 'profile_comment'
         and source_entity_id = new.id;
    elsif new.status = 'visible' and old.content is distinct from new.content then
      update public.profile_notifications
         set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{snippet}', to_jsonb(snippet)),
             updated_at = now_ts
       where kind = 'profile_comment'
         and source_entity_id = new.id;
    end if;
  end if;

  return new;
end;
$$;

create trigger profile_comments_notify
  after insert or update on public.profile_comments
  for each row execute function public.handle_profile_comment_notification();

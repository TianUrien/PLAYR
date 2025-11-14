set check_function_bodies = off;

-- ============================================================================
-- Opportunity notification state per user
-- ============================================================================
create table if not exists public.opportunity_inbox_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default '1970-01-01 00:00:00+00'::timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.opportunity_inbox_state enable row level security;

create policy "Users can read their opportunity inbox state"
  on public.opportunity_inbox_state
  for select
  using (user_id = auth.uid());

create policy "Users can insert their opportunity inbox state"
  on public.opportunity_inbox_state
  for insert
  with check (user_id = auth.uid());

create policy "Users can update their opportunity inbox state"
  on public.opportunity_inbox_state
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger opportunity_inbox_state_set_updated_at
  before update on public.opportunity_inbox_state
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- Opportunity notification helper functions
-- ============================================================================
create or replace function public.get_opportunity_alerts()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  baseline timestamptz := '1970-01-01 00:00:00+00'::timestamptz;
  last_seen timestamptz := baseline;
begin
  if current_user_id is null then
    return 0;
  end if;

  select coalesce(last_seen_at, baseline)
    into last_seen
    from public.opportunity_inbox_state
   where user_id = current_user_id;

  return (
    select count(*)
      from public.vacancies v
     where v.status = 'open'
       and coalesce(v.published_at, v.created_at) > last_seen
  );
end;
$$;

grant execute on function public.get_opportunity_alerts() to authenticated;

create or replace function public.mark_opportunities_seen(p_seen_at timestamptz default timezone('utc', now()))
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  target_seen_at timestamptz := coalesce(p_seen_at, timezone('utc', now()));
begin
  if current_user_id is null then
    return;
  end if;

  insert into public.opportunity_inbox_state (user_id, last_seen_at, updated_at)
  values (current_user_id, target_seen_at, timezone('utc', now()))
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.mark_opportunities_seen(timestamptz) to authenticated;

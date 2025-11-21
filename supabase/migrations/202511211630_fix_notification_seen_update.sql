set check_function_bodies = off;
set search_path = public;

-- Clarify column references inside get_notifications CTEs
CREATE OR REPLACE FUNCTION public.get_notifications(
  p_filter text DEFAULT 'all',
  p_kind public.profile_notification_kind DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  kind public.profile_notification_kind,
  source_entity_id uuid,
  metadata jsonb,
  target_url text,
  created_at timestamptz,
  read_at timestamptz,
  seen_at timestamptz,
  cleared_at timestamptz,
  actor jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  clamped_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
  clamped_offset integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  IF lower(coalesce(p_filter, 'all')) NOT IN ('all', 'unread', 'by_type') THEN
    RAISE EXCEPTION 'Invalid notification filter: %', p_filter USING ERRCODE = '22023';
  END IF;

  IF lower(coalesce(p_filter, 'all')) = 'by_type' AND p_kind IS NULL THEN
    RAISE EXCEPTION 'Filter "by_type" requires p_kind to be supplied' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      pn.id,
      pn.kind,
      pn.source_entity_id,
      pn.metadata,
      pn.target_url,
      pn.created_at,
      pn.read_at,
      pn.seen_at,
      pn.cleared_at,
      pn.actor_profile_id,
      jsonb_build_object(
        'id', actor.id,
        'full_name', actor.full_name,
        'role', actor.role,
        'username', actor.username,
        'avatar_url', actor.avatar_url,
        'base_location', actor.base_location
      ) AS actor
    FROM public.profile_notifications pn
    LEFT JOIN public.profiles actor ON actor.id = pn.actor_profile_id
    WHERE pn.recipient_profile_id = current_user_id
      AND pn.cleared_at IS NULL
      AND (p_kind IS NULL OR pn.kind = p_kind)
      AND (
        lower(coalesce(p_filter, 'all')) <> 'unread'
        OR pn.read_at IS NULL
      )
  ), ordered AS (
    SELECT b.*
    FROM base AS b
    ORDER BY (b.read_at IS NULL) DESC, b.created_at DESC
    LIMIT clamped_limit OFFSET clamped_offset
  ), marked AS (
    UPDATE public.profile_notifications AS u
       SET seen_at = timezone('utc', now())
     WHERE u.id IN (SELECT ordered.id FROM ordered)
       AND u.seen_at IS NULL
     RETURNING u.id
  )
  SELECT
    ordered.id,
    ordered.kind,
    ordered.source_entity_id,
    ordered.metadata,
    ordered.target_url,
    ordered.created_at,
    ordered.read_at,
    ordered.seen_at,
    ordered.cleared_at,
    ordered.actor
  FROM ordered;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notifications(text, public.profile_notification_kind, integer, integer) TO authenticated;

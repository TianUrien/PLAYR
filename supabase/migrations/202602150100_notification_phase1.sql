-- Phase 1: Notification System Expansion
--
-- A. Fix unique index to support multi-recipient fan-out notifications
-- B. Update enqueue_notification() conflict clause
-- C. Add 'opportunity_published' notification kind
-- D. Add notify_friends, notify_references preference columns
-- E. Create vacancy fan-out trigger for in-app notifications

SET search_path = public;

-- ============================================================================
-- A. Fix unique index for fan-out notifications
-- ============================================================================
-- Current: UNIQUE(kind, source_entity_id) — blocks multi-recipient notifications
-- New: UNIQUE(recipient_profile_id, kind, source_entity_id) — allows one per recipient
-- This is LESS restrictive, so existing data is safe.

DROP INDEX IF EXISTS profile_notifications_source_unique;

CREATE UNIQUE INDEX profile_notifications_source_unique
  ON public.profile_notifications (recipient_profile_id, kind, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

-- ============================================================================
-- B. Update enqueue_notification() to use new conflict target
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_profile_id uuid,
  p_actor_profile_id uuid,
  p_kind public.profile_notification_kind,
  p_source_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_target_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
  now_ts timestamptz := timezone('utc', now());
BEGIN
  IF p_recipient_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.profile_notifications (
    recipient_profile_id,
    actor_profile_id,
    kind,
    source_entity_id,
    metadata,
    target_url,
    created_at,
    updated_at,
    read_at,
    seen_at,
    cleared_at
  ) VALUES (
    p_recipient_profile_id,
    p_actor_profile_id,
    p_kind,
    p_source_entity_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_target_url,
    now_ts,
    now_ts,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (recipient_profile_id, kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
    SET actor_profile_id = excluded.actor_profile_id,
        metadata = excluded.metadata,
        target_url = excluded.target_url,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        read_at = NULL,
        seen_at = NULL,
        cleared_at = NULL
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, uuid, public.profile_notification_kind, uuid, jsonb, text) TO authenticated;

-- ============================================================================
-- C. Add 'opportunity_published' notification kind
-- ============================================================================

ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS 'opportunity_published';

-- ============================================================================
-- D. Add notification preference columns
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_friends BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_friends
  IS 'Whether the user wants to receive email notifications for friend requests. Applies to all roles.';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_references BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_references
  IS 'Whether the user wants to receive email notifications for reference requests. Applies to all roles.';

-- ============================================================================
-- E. Vacancy fan-out trigger for in-app notifications
-- ============================================================================
-- When an opportunity is published (status → 'open'), create an in-app
-- notification for every eligible player/coach globally.
-- Uses bulk INSERT...SELECT for performance (single round trip).
-- ON CONFLICT DO NOTHING prevents duplicates on re-publish.

CREATE OR REPLACE FUNCTION public.handle_opportunity_published_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := timezone('utc', now());
  v_club_name text;
BEGIN
  -- Only fire when status transitions to 'open'
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'open' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status != 'open' OR OLD.status IS NOT DISTINCT FROM 'open' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Get the publishing club's name for notification metadata
  SELECT full_name INTO v_club_name
  FROM public.profiles
  WHERE id = NEW.club_id;

  -- Bulk insert: one notification per eligible player/coach
  INSERT INTO public.profile_notifications (
    recipient_profile_id,
    actor_profile_id,
    kind,
    source_entity_id,
    metadata,
    target_url,
    created_at,
    updated_at
  )
  SELECT
    p.id,
    NEW.club_id,
    'opportunity_published'::public.profile_notification_kind,
    NEW.id,
    jsonb_build_object(
      'opportunity_id', NEW.id,
      'opportunity_title', NEW.title,
      'club_id', NEW.club_id,
      'club_name', coalesce(v_club_name, 'A club'),
      'opportunity_type', NEW.opportunity_type::text,
      'position', NEW.position::text,
      'location_city', NEW.location_city,
      'location_country', NEW.location_country
    ),
    '/opportunities/' || NEW.id::text,
    now_ts,
    now_ts
  FROM public.profiles p
  WHERE p.role = NEW.opportunity_type::text
    AND p.onboarding_completed = true
    AND p.is_test_account = false
    AND p.id != NEW.club_id
  ON CONFLICT (recipient_profile_id, kind, source_entity_id)
    WHERE source_entity_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_published_notify ON public.opportunities;
CREATE TRIGGER opportunity_published_notify
  AFTER INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.handle_opportunity_published_notification();

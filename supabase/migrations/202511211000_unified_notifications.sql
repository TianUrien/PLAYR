set check_function_bodies = off;
set search_path = public;

-- ============================================================================
-- Enum refresh for unified notification kinds
-- ============================================================================
DO $$ BEGIN
  ALTER TYPE public.profile_notification_kind RENAME VALUE 'friend_request' TO 'friend_request_received';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.profile_notification_kind RENAME VALUE 'profile_comment' TO 'profile_comment_created';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.profile_notification_kind RENAME VALUE 'reference_request' TO 'reference_request_received';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.profile_notification_kind RENAME VALUE 'reference_accepted' TO 'reference_request_accepted';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ DECLARE
  new_values TEXT[] := ARRAY[
    'friend_request_accepted',
    'reference_updated',
    'profile_comment_reply',
    'profile_comment_like',
    'message_received',
    'conversation_started',
    'vacancy_application_received',
    'vacancy_application_status',
    'profile_completed',
    'account_verified',
    'system_announcement'
  ];
  value_ TEXT;
BEGIN
  FOREACH value_ IN ARRAY new_values LOOP
    BEGIN
      EXECUTE format('ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS %L', value_);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- Table structure updates
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE public.profile_notifications RENAME COLUMN payload TO metadata;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE public.profile_notifications
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL;

ALTER TABLE public.profile_notifications
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_url text;

COMMENT ON COLUMN public.profile_notifications.metadata IS 'Structured JSON metadata (ids, slugs, titles) for client rendering and routing.';
COMMENT ON COLUMN public.profile_notifications.seen_at IS 'Timestamp when the notification feed displayed this item to the recipient.';
COMMENT ON COLUMN public.profile_notifications.target_url IS 'Optional explicit route override when metadata-based routing is insufficient.';

CREATE INDEX IF NOT EXISTS idx_profile_notifications_recipient_unread
  ON public.profile_notifications (recipient_profile_id, read_at, created_at DESC)
  WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_notifications_recipient_kind_state
  ON public.profile_notifications (recipient_profile_id, kind, read_at, created_at DESC)
  WHERE cleared_at IS NULL;

-- ============================================================================
-- Helper to fan-out notifications consistently
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
  ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
    SET recipient_profile_id = excluded.recipient_profile_id,
        actor_profile_id = excluded.actor_profile_id,
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
-- Notification queries & RPCs
-- ============================================================================
DROP FUNCTION IF EXISTS public.fetch_profile_notifications(integer, integer);
DROP FUNCTION IF EXISTS public.mark_profile_notifications_read(uuid[]);

CREATE OR REPLACE FUNCTION public.get_notification_counts()
RETURNS TABLE (
  unread_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE pn.read_at IS NULL AND pn.cleared_at IS NULL) AS unread_count,
    COUNT(*) FILTER (WHERE pn.cleared_at IS NULL) AS total_count
  FROM public.profile_notifications pn
  WHERE pn.recipient_profile_id = current_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notification_counts() TO authenticated;

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
    SELECT *
    FROM base
    ORDER BY (read_at IS NULL) DESC, created_at DESC
    LIMIT clamped_limit OFFSET clamped_offset
  ), marked AS (
    UPDATE public.profile_notifications AS u
       SET seen_at = timezone('utc', now())
     WHERE u.id IN (SELECT id FROM ordered)
       AND u.seen_at IS NULL
     RETURNING u.id
  )
  SELECT * FROM ordered;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notifications(text, public.profile_notification_kind, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  updated_rows integer := 0;
BEGIN
  IF current_user_id IS NULL OR p_notification_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profile_notifications
     SET read_at = timezone('utc', now()),
         seen_at = coalesce(seen_at, timezone('utc', now()))
   WHERE id = p_notification_id
     AND recipient_profile_id = current_user_id
     AND cleared_at IS NULL;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_kind public.profile_notification_kind DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  updated_rows integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.profile_notifications
     SET read_at = timezone('utc', now()),
         seen_at = coalesce(seen_at, timezone('utc', now()))
   WHERE recipient_profile_id = current_user_id
     AND cleared_at IS NULL
     AND read_at IS NULL
     AND (p_kind IS NULL OR kind = p_kind);

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(public.profile_notification_kind) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_profile_notifications(
  p_notification_ids uuid[] DEFAULT NULL,
  p_kind public.profile_notification_kind DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  cleared_rows integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.profile_notifications
     SET cleared_at = timezone('utc', now())
   WHERE recipient_profile_id = current_user_id
     AND cleared_at IS NULL
     AND (p_kind IS NULL OR kind = p_kind)
     AND (p_notification_ids IS NULL OR id = ANY(p_notification_ids));

  GET DIAGNOSTICS cleared_rows = ROW_COUNT;
  RETURN cleared_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_profile_notifications(uuid[], public.profile_notification_kind) TO authenticated;

-- ============================================================================
-- Friendships → notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_friend_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  now_ts timestamptz := timezone('utc', now());
BEGIN
  recipient := CASE
    WHEN NEW.requester_id = NEW.user_one THEN NEW.user_two
    ELSE NEW.user_one
  END;

  IF recipient IS NULL OR recipient = NEW.requester_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      PERFORM public.enqueue_notification(
        recipient,
        NEW.requester_id,
        'friend_request_received',
        NEW.id,
        jsonb_build_object(
          'friendship_id', NEW.id,
          'requester_id', NEW.requester_id,
          'status', NEW.status
        ),
      NULL
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' AND NEW.status = 'pending' THEN
      PERFORM public.enqueue_notification(
        recipient,
        NEW.requester_id,
        'friend_request_received',
        NEW.id,
        jsonb_build_object(
          'friendship_id', NEW.id,
          'requester_id', NEW.requester_id,
          'status', NEW.status
        ),
        NULL
      );
    ELSIF OLD.status = 'pending' AND NEW.status <> 'pending' THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'friend_request_received'
         AND source_entity_id = NEW.id;

      IF NEW.status = 'accepted' THEN
        PERFORM public.enqueue_notification(
          NEW.requester_id,
          recipient,
          'friend_request_accepted',
          NEW.id,
          jsonb_build_object(
            'friendship_id', NEW.id,
            'accepted_by', recipient,
            'status', NEW.status
          ),
          NULL
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Profile comments → notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_profile_comment_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snippet text := left(NEW.content, 160);
  now_ts timestamptz := timezone('utc', now());
BEGIN
  IF NEW.profile_id = NEW.author_profile_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'visible' THEN
    PERFORM public.enqueue_notification(
      NEW.profile_id,
      NEW.author_profile_id,
      'profile_comment_created',
      NEW.id,
      jsonb_build_object(
        'comment_id', NEW.id,
        'profile_id', NEW.profile_id,
        'snippet', snippet
      ),
      NULL
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'visible' AND NEW.status = 'visible' THEN
      PERFORM public.enqueue_notification(
        NEW.profile_id,
        NEW.author_profile_id,
        'profile_comment_created',
        NEW.id,
        jsonb_build_object(
          'comment_id', NEW.id,
          'profile_id', NEW.profile_id,
          'snippet', snippet
        ),
        NULL
      );
    ELSIF OLD.status = 'visible' AND NEW.status <> 'visible' THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'profile_comment_created'
         AND source_entity_id = NEW.id;
    ELSIF NEW.status = 'visible' AND OLD.content IS DISTINCT FROM NEW.content THEN
      UPDATE public.profile_notifications
         SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{snippet}', to_jsonb(snippet)),
             updated_at = now_ts,
             read_at = NULL,
             seen_at = NULL
       WHERE kind = 'profile_comment_created'
         AND source_entity_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- References → notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_profile_reference_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := timezone('utc', now());
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM public.enqueue_notification(
        NEW.reference_id,
        NEW.requester_id,
        'reference_request_received',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'requester_id', NEW.requester_id,
          'relationship_type', NEW.relationship_type,
          'request_note', NEW.request_note
        ),
        NULL
      );
    ELSIF NEW.status = 'accepted' THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_request_accepted',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'endorsement_text', NEW.endorsement_text
        ),
        NULL
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'revoked') THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'reference_request_received'
         AND source_entity_id = NEW.id;
    END IF;

    IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_request_accepted',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'endorsement_text', NEW.endorsement_text
        ),
        NULL
      );
    ELSIF NEW.status = 'accepted' AND OLD.endorsement_text IS DISTINCT FROM NEW.endorsement_text THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_updated',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'endorsement_text', NEW.endorsement_text
        ),
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Messaging → notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_message_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  other_exists boolean;
BEGIN
  SELECT CASE WHEN c.participant_one_id = NEW.sender_id THEN c.participant_two_id ELSE c.participant_one_id END
    INTO recipient
    FROM public.conversations c
   WHERE c.id = NEW.conversation_id;

  IF recipient IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_notification(
    recipient,
    NEW.sender_id,
    'message_received',
    NEW.id,
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id
    ),
    NULL
  );

  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id AND m.id <> NEW.id
  ) INTO other_exists;

  IF NOT other_exists THEN
    PERFORM public.enqueue_notification(
      recipient,
      NEW.sender_id,
      'conversation_started',
      NEW.conversation_id,
      jsonb_build_object(
        'conversation_id', NEW.conversation_id
      ),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify ON public.messages;
CREATE TRIGGER messages_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_notifications();

-- ============================================================================
-- Vacancy applications → notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_vacancy_application_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vacancy_record RECORD;
BEGIN
  SELECT id, club_id, title INTO vacancy_record
  FROM public.vacancies
  WHERE id = NEW.vacancy_id;

  IF vacancy_record.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_notification(
      vacancy_record.club_id,
      NEW.player_id,
      'vacancy_application_received',
      NEW.id,
      jsonb_build_object(
        'application_id', NEW.id,
        'vacancy_id', NEW.vacancy_id,
        'vacancy_title', vacancy_record.title,
        'applicant_id', NEW.player_id,
        'application_status', NEW.status
      ),
      NULL
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.profile_notifications
       SET cleared_at = timezone('utc', now())
     WHERE kind = 'vacancy_application_received'
       AND source_entity_id = NEW.id;

    PERFORM public.enqueue_notification(
      NEW.player_id,
      vacancy_record.club_id,
      'vacancy_application_status',
      NEW.id,
      jsonb_build_object(
        'application_id', NEW.id,
        'vacancy_id', NEW.vacancy_id,
        'vacancy_title', vacancy_record.title,
        'club_id', vacancy_record.club_id,
        'application_status', NEW.status
      ),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vacancy_applications_notify ON public.vacancy_applications;
CREATE TRIGGER vacancy_applications_notify
  AFTER INSERT OR UPDATE ON public.vacancy_applications
  FOR EACH ROW EXECUTE FUNCTION public.handle_vacancy_application_notifications();

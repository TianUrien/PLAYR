SET search_path = public;

DO $$ BEGIN
  CREATE TYPE public.profile_notification_kind AS ENUM (
    'friend_request_received',
    'friend_request_accepted',
    'reference_request_received',
    'reference_request_accepted',
    'reference_updated',
    'profile_comment_created',
    'profile_comment_reply',
    'profile_comment_like',
    'message_received',
    'conversation_started',
    'vacancy_application_received',
    'vacancy_application_status',
    'profile_completed',
    'account_verified',
    'system_announcement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profile_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind public.profile_notification_kind NOT NULL,
  source_entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_url TEXT,
  read_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.profile_notifications IS 'Inbox-style notification feed for comments and friendships.';
COMMENT ON COLUMN public.profile_notifications.recipient_profile_id IS 'Profile receiving the notification.';
COMMENT ON COLUMN public.profile_notifications.actor_profile_id IS 'Profile that triggered the notification.';
COMMENT ON COLUMN public.profile_notifications.source_entity_id IS 'Stable identifier for the originating record (friendship/comment/etc).';
COMMENT ON COLUMN public.profile_notifications.metadata IS 'Structured JSON metadata for rendering and routing notifications.';
COMMENT ON COLUMN public.profile_notifications.target_url IS 'Optional explicit route override when metadata-based routing is insufficient.';
COMMENT ON COLUMN public.profile_notifications.seen_at IS 'Timestamp when the notification was displayed in the feed.';

CREATE INDEX IF NOT EXISTS profile_notifications_recipient_idx
  ON public.profile_notifications (recipient_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_notifications_kind_idx
  ON public.profile_notifications (kind) WHERE cleared_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profile_notifications_source_unique
  ON public.profile_notifications (kind, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profile_notifications_recipient_unread
  ON public.profile_notifications (recipient_profile_id, read_at, created_at DESC)
  WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_notifications_recipient_kind_state
  ON public.profile_notifications (recipient_profile_id, kind, read_at, created_at DESC)
  WHERE cleared_at IS NULL;

CREATE TRIGGER profile_notifications_set_updated_at
  BEFORE UPDATE ON public.profile_notifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_profile_id UUID,
  p_actor_profile_id UUID DEFAULT NULL,
  p_kind public.profile_notification_kind,
  p_source_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_target_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id UUID;
  now_ts TIMESTAMPTZ := timezone('utc', now());
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

GRANT EXECUTE ON FUNCTION public.enqueue_notification(UUID, UUID, public.profile_notification_kind, UUID, JSONB, TEXT) TO authenticated;

ALTER TABLE public.profile_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients can read notifications" ON public.profile_notifications;
CREATE POLICY "Recipients can read notifications"
  ON public.profile_notifications
  FOR SELECT
  USING (recipient_profile_id = auth.uid());

DROP POLICY IF EXISTS "Recipients can update notifications" ON public.profile_notifications;
CREATE POLICY "Recipients can update notifications"
  ON public.profile_notifications
  FOR UPDATE
  USING (recipient_profile_id = auth.uid())
  WITH CHECK (recipient_profile_id = auth.uid());

DROP POLICY IF EXISTS "Recipients can delete notifications" ON public.profile_notifications;
CREATE POLICY "Recipients can delete notifications"
  ON public.profile_notifications
  FOR DELETE
  USING (recipient_profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_profile_reference_notifications()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    now_ts TIMESTAMPTZ := timezone('utc', now());
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
  
  CREATE TRIGGER profile_references_notify
    AFTER INSERT OR UPDATE ON public.profile_references
    FOR EACH ROW EXECUTE FUNCTION public.handle_profile_reference_notifications();
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  updated_rows INTEGER := 0;
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

GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_kind public.profile_notification_kind DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  updated_rows INTEGER := 0;
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
  p_notification_ids UUID[] DEFAULT NULL,
  p_kind public.profile_notification_kind DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  cleared_rows INTEGER := 0;
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

GRANT EXECUTE ON FUNCTION public.clear_profile_notifications(UUID[], public.profile_notification_kind) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_friend_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient UUID;
  now_ts TIMESTAMPTZ := timezone('utc', now());
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

CREATE TRIGGER profile_friendships_notify
  AFTER INSERT OR UPDATE ON public.profile_friendships
  FOR EACH ROW EXECUTE FUNCTION public.handle_friend_request_notification();

CREATE OR REPLACE FUNCTION public.handle_profile_comment_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snippet TEXT := left(NEW.content, 160);
  now_ts TIMESTAMPTZ := timezone('utc', now());
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

CREATE TRIGGER profile_comments_notify
  AFTER INSERT OR UPDATE ON public.profile_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_comment_notification();

CREATE OR REPLACE FUNCTION public.handle_message_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient UUID;
  other_exists BOOLEAN;
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
    SELECT 1
      FROM public.messages m
     WHERE m.conversation_id = NEW.conversation_id
       AND m.id <> NEW.id
  ) INTO other_exists;

  IF NOT other_exists THEN
    PERFORM public.enqueue_notification(
      recipient,
      NEW.sender_id,
      'conversation_started',
      NEW.conversation_id,
      jsonb_build_object('conversation_id', NEW.conversation_id),
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

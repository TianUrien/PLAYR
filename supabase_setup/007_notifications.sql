SET search_path = public;

DO $$ BEGIN
  CREATE TYPE public.profile_notification_kind AS ENUM ('friend_request', 'profile_comment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profile_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind public.profile_notification_kind NOT NULL,
  source_entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.profile_notifications IS 'Inbox-style notification feed for comments and friendships.';
COMMENT ON COLUMN public.profile_notifications.recipient_profile_id IS 'Profile receiving the notification.';
COMMENT ON COLUMN public.profile_notifications.actor_profile_id IS 'Profile that triggered the notification.';
COMMENT ON COLUMN public.profile_notifications.source_entity_id IS 'Stable identifier for the originating record (friendship/comment/etc).';

CREATE INDEX IF NOT EXISTS profile_notifications_recipient_idx
  ON public.profile_notifications (recipient_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_notifications_kind_idx
  ON public.profile_notifications (kind) WHERE cleared_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profile_notifications_source_unique
  ON public.profile_notifications (kind, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE TRIGGER profile_notifications_set_updated_at
  BEFORE UPDATE ON public.profile_notifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

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

CREATE OR REPLACE FUNCTION public.fetch_profile_notifications(
  p_limit INTEGER DEFAULT 40,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  kind public.profile_notification_kind,
  source_entity_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  actor JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  clamped_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 200);
  clamped_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
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
      ) AS actor
    FROM public.profile_notifications pn
    LEFT JOIN public.profiles actor ON actor.id = pn.actor_profile_id
    WHERE pn.recipient_profile_id = current_user_id
      AND pn.cleared_at IS NULL
    ORDER BY pn.created_at DESC
    LIMIT clamped_limit OFFSET clamped_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_profile_notifications(INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_profile_notifications_read(
  p_notification_ids UUID[] DEFAULT NULL
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
     SET read_at = timezone('utc', now())
   WHERE recipient_profile_id = current_user_id
     AND cleared_at IS NULL
     AND read_at IS NULL
     AND (p_notification_ids IS NULL OR id = ANY(p_notification_ids));

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_profile_notifications_read(UUID[]) TO authenticated;

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
  payload JSONB;
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
    payload := jsonb_build_object(
      'friendship_id', NEW.id,
      'requester_id', NEW.requester_id,
      'status', NEW.status
    );

    INSERT INTO public.profile_notifications (
      recipient_profile_id,
      actor_profile_id,
      kind,
      source_entity_id,
      payload,
      created_at,
      updated_at,
      read_at,
      cleared_at
    ) VALUES (
      recipient,
      NEW.requester_id,
      'friend_request',
      NEW.id,
      payload,
      now_ts,
      now_ts,
      NULL,
      NULL
    )
    ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
      SET recipient_profile_id = EXCLUDED.recipient_profile_id,
          actor_profile_id = EXCLUDED.actor_profile_id,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          read_at = NULL,
          cleared_at = NULL;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' AND NEW.status = 'pending' THEN
      payload := jsonb_build_object(
        'friendship_id', NEW.id,
        'requester_id', NEW.requester_id,
        'status', NEW.status
      );

      INSERT INTO public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at,
        read_at,
        cleared_at
      ) VALUES (
        recipient,
        NEW.requester_id,
        'friend_request',
        NEW.id,
        payload,
        now_ts,
        now_ts,
        NULL,
        NULL
      )
      ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
        SET recipient_profile_id = EXCLUDED.recipient_profile_id,
            actor_profile_id = EXCLUDED.actor_profile_id,
            payload = EXCLUDED.payload,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            read_at = NULL,
            cleared_at = NULL;
    ELSIF OLD.status = 'pending' AND NEW.status <> 'pending' THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'friend_request'
         AND source_entity_id = NEW.id;
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
  snippet TEXT := LEFT(NEW.content, 160);
  now_ts TIMESTAMPTZ := timezone('utc', now());
  payload JSONB;
BEGIN
  IF NEW.profile_id = NEW.author_profile_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'visible' THEN
    payload := jsonb_build_object(
      'comment_id', NEW.id,
      'profile_id', NEW.profile_id,
      'snippet', snippet
    );

    INSERT INTO public.profile_notifications (
      recipient_profile_id,
      actor_profile_id,
      kind,
      source_entity_id,
      payload,
      created_at,
      updated_at,
      read_at,
      cleared_at
    ) VALUES (
      NEW.profile_id,
      NEW.author_profile_id,
      'profile_comment',
      NEW.id,
      payload,
      now_ts,
      now_ts,
      NULL,
      NULL
    )
    ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
      SET actor_profile_id = EXCLUDED.actor_profile_id,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          read_at = NULL,
          cleared_at = NULL;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'visible' AND NEW.status = 'visible' THEN
      payload := jsonb_build_object(
        'comment_id', NEW.id,
        'profile_id', NEW.profile_id,
        'snippet', snippet
      );

      INSERT INTO public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at,
        read_at,
        cleared_at
      ) VALUES (
        NEW.profile_id,
        NEW.author_profile_id,
        'profile_comment',
        NEW.id,
        payload,
        now_ts,
        now_ts,
        NULL,
        NULL
      )
      ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
        SET actor_profile_id = EXCLUDED.actor_profile_id,
            payload = EXCLUDED.payload,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            read_at = NULL,
            cleared_at = NULL;
    ELSIF OLD.status = 'visible' AND NEW.status <> 'visible' THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'profile_comment'
         AND source_entity_id = NEW.id;
    ELSIF NEW.status = 'visible' AND OLD.content IS DISTINCT FROM NEW.content THEN
      UPDATE public.profile_notifications
         SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{snippet}', to_jsonb(snippet)),
             updated_at = now_ts
       WHERE kind = 'profile_comment'
         AND source_entity_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_comments_notify
  AFTER INSERT OR UPDATE ON public.profile_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_comment_notification();

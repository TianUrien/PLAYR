SET search_path = public;

DO $$
BEGIN
  CREATE TYPE public.profile_reference_status AS ENUM ('pending', 'accepted', 'declined', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS 'reference_request';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS 'reference_accepted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profile_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reference_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.profile_reference_status NOT NULL DEFAULT 'pending',
  relationship_type TEXT NOT NULL,
  request_note TEXT,
  endorsement_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  responded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT profile_references_self_check CHECK (requester_id <> reference_id),
  CONSTRAINT profile_references_relationship_length CHECK (char_length(btrim(relationship_type)) BETWEEN 2 AND 120),
  CONSTRAINT profile_references_request_note_length CHECK (request_note IS NULL OR char_length(request_note) <= 1200),
  CONSTRAINT profile_references_endorsement_length CHECK (endorsement_text IS NULL OR char_length(endorsement_text) <= 1200)
);

CREATE INDEX IF NOT EXISTS profile_references_requester_idx
  ON public.profile_references (requester_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_references_reference_idx
  ON public.profile_references (reference_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_references_status_idx
  ON public.profile_references (status);

CREATE UNIQUE INDEX IF NOT EXISTS profile_references_active_pair_idx
  ON public.profile_references (requester_id, reference_id)
  WHERE status IN ('pending', 'accepted');

CREATE OR REPLACE FUNCTION public.handle_profile_reference_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepted_count INTEGER;
  max_references CONSTANT INTEGER := 5;
BEGIN
  IF NEW.requester_id = NEW.reference_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a reference.';
  END IF;

  NEW.relationship_type := LEFT(btrim(COALESCE(NEW.relationship_type, '')), 120);
  IF NEW.relationship_type = '' THEN
    RAISE EXCEPTION 'Relationship type is required.';
  END IF;

  IF NEW.request_note IS NOT NULL THEN
    NEW.request_note := NULLIF(LEFT(btrim(NEW.request_note), 1200), '');
  END IF;

  IF NEW.endorsement_text IS NOT NULL THEN
    NEW.endorsement_text := NULLIF(LEFT(btrim(NEW.endorsement_text), 1200), '');
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := COALESCE(NEW.status, 'pending');
    NEW.created_at := COALESCE(NEW.created_at, timezone('utc', now()));
    RETURN NEW;
  END IF;

  IF NEW.requester_id <> OLD.requester_id OR NEW.reference_id <> OLD.reference_id THEN
    RAISE EXCEPTION 'Reference participants cannot change.';
  END IF;

  IF NEW.status = 'pending' AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'References cannot revert to pending after a decision.';
  END IF;

  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    SELECT COUNT(*)
      INTO accepted_count
      FROM public.profile_references
     WHERE requester_id = NEW.requester_id
       AND status = 'accepted'
       AND id <> NEW.id;

    IF accepted_count >= max_references THEN
      RAISE EXCEPTION 'You already have % trusted references.', max_references;
    END IF;

    NEW.accepted_at := timezone('utc', now());
    NEW.responded_at := NEW.accepted_at;
  ELSIF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    NEW.accepted_at := NULL;
  END IF;

  IF NEW.status = 'declined' AND OLD.status <> 'declined' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending requests can be declined.';
    END IF;
    NEW.responded_at := timezone('utc', now());
  END IF;

  IF NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN
    NEW.revoked_at := timezone('utc', now());
    NEW.revoked_by := auth.uid();
  ELSIF NEW.status <> 'revoked' THEN
    NEW.revoked_at := NULL;
    NEW.revoked_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_profile_reference_friendship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
    FROM public.profile_friendships pf
   WHERE pf.status = 'accepted'
     AND ((pf.user_one = NEW.requester_id AND pf.user_two = NEW.reference_id)
       OR (pf.user_two = NEW.requester_id AND pf.user_one = NEW.reference_id))
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trusted references require an accepted friendship.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_references_handle_state
BEFORE INSERT OR UPDATE ON public.profile_references
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_reference_state();

CREATE TRIGGER profile_references_friendship_guard
BEFORE INSERT ON public.profile_references
FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_reference_friendship();

CREATE TRIGGER profile_references_set_updated_at
BEFORE UPDATE ON public.profile_references
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.profile_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_references_read"
  ON public.profile_references
  FOR SELECT
  USING (
    status = 'accepted'
    OR auth.role() = 'service_role'
    OR auth.uid() = requester_id
    OR auth.uid() = reference_id
  );

CREATE POLICY "profile_references_insert"
  ON public.profile_references
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.uid() = requester_id AND status = 'pending')
  );

CREATE POLICY "profile_references_requester_update"
  ON public.profile_references
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = requester_id
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.uid() = requester_id AND status IN ('pending', 'revoked'))
  );

CREATE POLICY "profile_references_reference_update"
  ON public.profile_references
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = reference_id
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.uid() = reference_id AND status IN ('pending', 'accepted', 'declined', 'revoked'))
  );

CREATE OR REPLACE FUNCTION public.handle_profile_reference_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts TIMESTAMPTZ := timezone('utc', now());
  payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      payload := jsonb_build_object(
        'reference_id', NEW.id,
        'requester_id', NEW.requester_id,
        'relationship_type', NEW.relationship_type,
        'request_note', NEW.request_note
      );

      INSERT INTO public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at
      ) VALUES (
        NEW.reference_id,
        NEW.requester_id,
        'reference_request',
        NEW.id,
        payload,
        now_ts,
        now_ts
      )
      ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
        SET payload = EXCLUDED.payload,
            actor_profile_id = EXCLUDED.actor_profile_id,
            recipient_profile_id = EXCLUDED.recipient_profile_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            read_at = NULL,
            cleared_at = NULL;
    ELSIF NEW.status = 'accepted' THEN
      payload := jsonb_build_object(
        'reference_id', NEW.id,
        'reference_profile_id', NEW.reference_id,
        'relationship_type', NEW.relationship_type,
        'endorsement_text', NEW.endorsement_text
      );

      INSERT INTO public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at
      ) VALUES (
        NEW.requester_id,
        NEW.reference_id,
        'reference_accepted',
        NEW.id,
        payload,
        now_ts,
        now_ts
      )
      ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
        SET payload = EXCLUDED.payload,
            actor_profile_id = EXCLUDED.actor_profile_id,
            recipient_profile_id = EXCLUDED.recipient_profile_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            read_at = NULL,
            cleared_at = NULL;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'revoked') THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'reference_request'
         AND source_entity_id = NEW.id;
    END IF;

    IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
      payload := jsonb_build_object(
        'reference_id', NEW.id,
        'reference_profile_id', NEW.reference_id,
        'relationship_type', NEW.relationship_type,
        'endorsement_text', NEW.endorsement_text
      );

      INSERT INTO public.profile_notifications (
        recipient_profile_id,
        actor_profile_id,
        kind,
        source_entity_id,
        payload,
        created_at,
        updated_at
      ) VALUES (
        NEW.requester_id,
        NEW.reference_id,
        'reference_accepted',
        NEW.id,
        payload,
        now_ts,
        now_ts
      )
      ON CONFLICT (kind, source_entity_id) WHERE source_entity_id IS NOT NULL DO UPDATE
        SET payload = EXCLUDED.payload,
            actor_profile_id = EXCLUDED.actor_profile_id,
            recipient_profile_id = EXCLUDED.recipient_profile_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            read_at = NULL,
            cleared_at = NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_references_notify
AFTER INSERT OR UPDATE ON public.profile_references
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_reference_notifications();

CREATE OR REPLACE FUNCTION public.get_my_references()
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  status public.profile_reference_status,
  relationship_type TEXT,
  request_note TEXT,
  endorsement_text TEXT,
  created_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  reference_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
BEGIN
  IF current_profile IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.status,
    pr.relationship_type,
    pr.request_note,
    pr.endorsement_text,
    pr.created_at,
    pr.responded_at,
    pr.accepted_at,
    jsonb_build_object(
      'id', ref.id,
      'full_name', ref.full_name,
      'role', ref.role,
      'username', ref.username,
      'avatar_url', ref.avatar_url,
      'base_location', ref.base_location,
      'position', ref.position,
      'current_club', ref.current_club
    ) AS reference_profile
  FROM public.profile_references pr
  JOIN public.profiles ref ON ref.id = pr.reference_id
  WHERE pr.requester_id = current_profile
    AND pr.status IN ('pending', 'accepted')
  ORDER BY
    CASE pr.status WHEN 'accepted' THEN 0 ELSE 1 END,
    pr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_references() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_reference_requests()
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  status public.profile_reference_status,
  relationship_type TEXT,
  request_note TEXT,
  created_at TIMESTAMPTZ,
  requester_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
BEGIN
  IF current_profile IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.status,
    pr.relationship_type,
    pr.request_note,
    pr.created_at,
    jsonb_build_object(
      'id', req.id,
      'full_name', req.full_name,
      'role', req.role,
      'username', req.username,
      'avatar_url', req.avatar_url,
      'base_location', req.base_location,
      'position', req.position,
      'current_club', req.current_club
    ) AS requester_profile
  FROM public.profile_references pr
  JOIN public.profiles req ON req.id = pr.requester_id
  WHERE pr.reference_id = current_profile
    AND pr.status = 'pending'
  ORDER BY pr.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_reference_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_references_i_gave()
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  status public.profile_reference_status,
  relationship_type TEXT,
  endorsement_text TEXT,
  accepted_at TIMESTAMPTZ,
  requester_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
BEGIN
  IF current_profile IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.status,
    pr.relationship_type,
    pr.endorsement_text,
    pr.accepted_at,
    jsonb_build_object(
      'id', req.id,
      'full_name', req.full_name,
      'role', req.role,
      'username', req.username,
      'avatar_url', req.avatar_url,
      'base_location', req.base_location,
      'position', req.position,
      'current_club', req.current_club
    ) AS requester_profile
  FROM public.profile_references pr
  JOIN public.profiles req ON req.id = pr.requester_id
  WHERE pr.reference_id = current_profile
    AND pr.status = 'accepted'
  ORDER BY pr.accepted_at DESC NULLS LAST, pr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_references_i_gave() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_references(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  relationship_type TEXT,
  endorsement_text TEXT,
  accepted_at TIMESTAMPTZ,
  reference_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.relationship_type,
    pr.endorsement_text,
    pr.accepted_at,
    jsonb_build_object(
      'id', ref.id,
      'full_name', ref.full_name,
      'role', ref.role,
      'username', ref.username,
      'avatar_url', ref.avatar_url,
      'base_location', ref.base_location,
      'position', ref.position,
      'current_club', ref.current_club
    ) AS reference_profile
  FROM public.profile_references pr
  JOIN public.profiles ref ON ref.id = pr.reference_id
  WHERE pr.requester_id = p_profile_id
    AND pr.status = 'accepted'
  ORDER BY pr.accepted_at DESC NULLS LAST, pr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_references(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_references(UUID) TO anon;

CREATE OR REPLACE FUNCTION public.request_reference(
  p_reference_id UUID,
  p_relationship_type TEXT,
  p_request_note TEXT DEFAULT NULL
)
RETURNS public.profile_references
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
  requester_role TEXT;
  accepted_count INTEGER;
  inserted_row public.profile_references;
BEGIN
  IF current_profile IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to request a reference.';
  END IF;

  IF current_profile = p_reference_id THEN
    RAISE EXCEPTION 'You cannot ask yourself to be a reference.';
  END IF;

  SELECT role INTO requester_role FROM public.profiles WHERE id = current_profile;
  IF requester_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  IF requester_role NOT IN ('player', 'coach') THEN
    RAISE EXCEPTION 'Only players and coaches can collect trusted references.';
  END IF;

  SELECT COUNT(*)
    INTO accepted_count
    FROM public.profile_references
   WHERE requester_id = current_profile
     AND status = 'accepted';

  IF accepted_count >= 5 THEN
    RAISE EXCEPTION 'You already have 5 accepted references.';
  END IF;

  PERFORM 1
    FROM public.profile_friendships pf
   WHERE pf.status = 'accepted'
     AND ((pf.user_one = current_profile AND pf.user_two = p_reference_id)
       OR (pf.user_two = current_profile AND pf.user_one = p_reference_id))
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only request references from accepted friends.';
  END IF;

  PERFORM 1
    FROM public.profile_references pr
   WHERE pr.requester_id = current_profile
     AND pr.reference_id = p_reference_id
     AND pr.status IN ('pending', 'accepted');

  IF FOUND THEN
    RAISE EXCEPTION 'You already have an active reference with this connection.';
  END IF;

  INSERT INTO public.profile_references (requester_id, reference_id, relationship_type, request_note)
  VALUES (current_profile, p_reference_id, p_relationship_type, NULLIF(btrim(p_request_note), ''))
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_reference(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_reference(
  p_reference_id UUID,
  p_accept BOOLEAN,
  p_endorsement TEXT DEFAULT NULL
)
RETURNS public.profile_references
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
  updated_row public.profile_references;
BEGIN
  IF current_profile IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to respond to a reference request.';
  END IF;

  UPDATE public.profile_references
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         endorsement_text = CASE WHEN p_accept THEN NULLIF(LEFT(btrim(COALESCE(p_endorsement, '')), 1200), '') ELSE endorsement_text END,
         responded_at = timezone('utc', now())
   WHERE id = p_reference_id
     AND reference_id = current_profile
     AND status = 'pending'
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reference request not found or already handled.';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_reference(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_reference(p_reference_id UUID)
RETURNS public.profile_references
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
  updated_row public.profile_references;
BEGIN
  IF current_profile IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to manage references.';
  END IF;

  UPDATE public.profile_references
     SET status = 'revoked',
         revoked_at = timezone('utc', now()),
         revoked_by = current_profile
   WHERE id = p_reference_id
     AND requester_id = current_profile
     AND status IN ('pending', 'accepted')
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reference not found.';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_reference(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_reference(p_reference_id UUID)
RETURNS public.profile_references
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
  updated_row public.profile_references;
BEGIN
  IF current_profile IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to withdraw a reference.';
  END IF;

  UPDATE public.profile_references
     SET status = 'revoked',
         revoked_at = timezone('utc', now()),
         revoked_by = current_profile
   WHERE id = p_reference_id
     AND reference_id = current_profile
     AND status = 'accepted'
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reference not found or not accepted yet.';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_reference(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.hard_delete_profile_relations(
  p_user_id UUID,
  p_batch INTEGER DEFAULT 2000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  batch_size INTEGER := GREATEST(COALESCE(p_batch, 2000), 100);
  deleted_profile INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id_required';
  END IF;

  result := jsonb_set(result, '{applications}', to_jsonb(public.delete_rows_where_clause('public.vacancy_applications'::regclass, 'player_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{vacancies}', to_jsonb(public.delete_rows_where_clause('public.vacancies'::regclass, 'club_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{playingHistory}', to_jsonb(public.delete_rows_where_clause('public.playing_history'::regclass, 'user_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{galleryPhotos}', to_jsonb(public.delete_rows_where_clause('public.gallery_photos'::regclass, 'user_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{clubMedia}', to_jsonb(public.delete_rows_where_clause('public.club_media'::regclass, 'club_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{profileComments}', to_jsonb(public.delete_rows_where_clause('public.profile_comments'::regclass, 'profile_id = $1 OR author_profile_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{profileNotifications}', to_jsonb(public.delete_rows_where_clause('public.profile_notifications'::regclass, 'recipient_profile_id = $1 OR actor_profile_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{friendships}', to_jsonb(public.delete_rows_where_clause('public.profile_friendships'::regclass, 'user_one = $1 OR user_two = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{profileReferences}', to_jsonb(public.delete_rows_where_clause('public.profile_references'::regclass, 'requester_id = $1 OR reference_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{opportunityInboxState}', to_jsonb(public.delete_rows_where_clause('public.opportunity_inbox_state'::regclass, 'user_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{archivedMessages}', to_jsonb(public.delete_rows_where_clause('public.archived_messages'::regclass, 'sender_id = $1 OR conversation_id IN (SELECT id FROM public.conversations WHERE participant_one_id = $1 OR participant_two_id = $1)', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{messages}', to_jsonb(public.delete_rows_where_clause('public.messages'::regclass, 'conversation_id IN (SELECT id FROM public.conversations WHERE participant_one_id = $1 OR participant_two_id = $1)', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{conversations}', to_jsonb(public.delete_rows_where_clause('public.conversations'::regclass, 'participant_one_id = $1 OR participant_two_id = $1', p_user_id, batch_size)), true);
  result := jsonb_set(result, '{unreadCounters}', to_jsonb(public.delete_rows_where_clause('public.user_unread_counters'::regclass, 'user_id = $1', p_user_id, batch_size)), true);

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS deleted_profile = ROW_COUNT;
  result := jsonb_set(result, '{profiles}', to_jsonb(deleted_profile), true);

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hard_delete_profile_relations(UUID, INTEGER) TO service_role;

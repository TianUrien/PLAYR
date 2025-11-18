SET search_path = public;

BEGIN;

-- ---------------------------------------------------------------------------
-- Enforce stricter RLS guarantees on hot-path tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_unread_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_friendships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_inbox_state FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Align gallery / media / history policies with JWT role expectations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their gallery photos" ON public.gallery_photos;
CREATE POLICY "Users can manage their gallery photos"
  ON public.gallery_photos
  FOR ALL
  USING (
    auth.uid() = user_id
    AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('player', 'coach')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('player', 'coach')
  );

DROP POLICY IF EXISTS "Users can manage their playing history" ON public.playing_history;
CREATE POLICY "Users can manage their playing history"
  ON public.playing_history
  FOR ALL
  USING (
    auth.uid() = user_id
    AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('player', 'coach')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('player', 'coach')
  );

DROP POLICY IF EXISTS "Clubs can manage their media" ON public.club_media;
CREATE POLICY "Clubs can manage their media"
  ON public.club_media
  FOR ALL
  USING (
    auth.uid() = club_id
    AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'club'
  )
  WITH CHECK (
    auth.uid() = club_id
    AND coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'club'
  );

-- ---------------------------------------------------------------------------
-- Hot-path index additions to keep core queries sub-ms under higher load
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profile_notifications_recipient_state
  ON public.profile_notifications (recipient_profile_id, read_at, created_at DESC)
  WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_friendships_pair_status
  ON public.profile_friendships (pair_key_lower, pair_key_upper, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_inbox_state_user_updated
  ON public.opportunity_inbox_state (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender_unread
  ON public.messages (conversation_id, sender_id, sent_at DESC)
  WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- Keep unread counter timestamps fresh without application involvement
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS user_unread_counters_set_updated_at ON public.user_unread_counters;
CREATE TRIGGER user_unread_counters_set_updated_at
  BEFORE UPDATE ON public.user_unread_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Deterministic bulk read helper for messaging surfaces
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(
  p_conversation_id UUID,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user UUID := auth.uid();
  cutoff TIMESTAMPTZ := COALESCE(p_before, timezone('utc', now()));
  updated_rows INTEGER := 0;
BEGIN
  IF current_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.participant_one_id = current_user OR c.participant_two_id = current_user)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.messages
     SET read_at = timezone('utc', now())
   WHERE conversation_id = p_conversation_id
     AND sender_id <> current_user
     AND read_at IS NULL
     AND (p_before IS NULL OR sent_at <= cutoff);

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  RETURN updated_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(UUID, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend relational cleanup coverage for delete-account flows
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Storage cleanup fallback helper so edge workers can queue missed deletions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_storage_objects_for_prefix(
  p_bucket TEXT,
  p_prefix TEXT,
  p_reason TEXT DEFAULT 'user_delete_fallback'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  normalized_prefix TEXT := NULLIF(regexp_replace(COALESCE(p_prefix, ''), '^/+|/+$', ''), '');
  inserted_count INTEGER := 0;
BEGIN
  IF p_bucket IS NULL OR normalized_prefix IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
  SELECT o.bucket_id, o.name, COALESCE(p_reason, 'user_delete_fallback')
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND o.name LIKE normalized_prefix || '%'
  ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL DO UPDATE
    SET reason = EXCLUDED.reason,
        queued_at = timezone('utc', now()),
        updated_at = timezone('utc', now());

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_storage_objects_for_prefix(TEXT, TEXT, TEXT) TO service_role;

COMMIT;

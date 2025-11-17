SET search_path = public;

BEGIN;

-- Generic helper that iteratively deletes rows in manageable batches
CREATE OR REPLACE FUNCTION public.delete_rows_where_clause(
  p_table regclass,
  p_where_sql TEXT,
  p_user_id UUID,
  p_batch INTEGER DEFAULT 1000
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_total BIGINT := 0;
  deleted_chunk BIGINT := 0;
  effective_batch INTEGER := GREATEST(COALESCE(p_batch, 1000), 1);
BEGIN
  IF p_table IS NULL OR p_where_sql IS NULL OR p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  LOOP
    EXECUTE format(
      'WITH chunk AS (
         SELECT ctid FROM %s WHERE %s LIMIT $2
       ),
       deleted AS (
         DELETE FROM %s WHERE ctid IN (SELECT ctid FROM chunk)
         RETURNING 1
       )
       SELECT COUNT(*) FROM deleted',
       p_table, p_where_sql, p_table
    )
    INTO deleted_chunk
    USING p_user_id, effective_batch;

    IF COALESCE(deleted_chunk, 0) = 0 THEN
      EXIT;
    END IF;

    deleted_total := deleted_total + deleted_chunk;
  END LOOP;

  RETURN deleted_total;
END;
$$;

COMMENT ON FUNCTION public.delete_rows_where_clause(regclass, TEXT, UUID, INTEGER)
IS 'Generic helper that deletes rows from the provided table in batches constrained by the given WHERE clause (parametrized on $1).';

-- Batches all relational cleanup for a profile and returns per-table counts
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

COMMENT ON FUNCTION public.hard_delete_profile_relations(UUID, INTEGER)
IS 'Removes all relational data tied to a profile in server-side batches and returns per-table deletion counts.';

GRANT EXECUTE ON FUNCTION public.hard_delete_profile_relations(UUID, INTEGER) TO service_role;

COMMIT;

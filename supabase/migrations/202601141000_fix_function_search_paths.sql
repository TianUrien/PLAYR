-- 202601141000_fix_function_search_paths.sql
-- Security: Fix "Function Search Path Mutable" warnings from Supabase Security Advisor
--
-- This migration adds explicit `SET search_path = public` to all functions that
-- were missing this security setting. This prevents potential search_path hijacking
-- attacks where a malicious schema could inject objects that shadow the intended ones.
--
-- Even for SECURITY INVOKER functions (which run with caller privileges), setting
-- an explicit search_path is a defense-in-depth measure that ensures predictable
-- object resolution regardless of the caller's session settings.

SET search_path = public;

-- ============================================================================
-- 1. TRIGGER FUNCTIONS (SECURITY INVOKER - default)
-- These run as triggers and should resolve objects predictably
-- ============================================================================

-- 1.1 set_question_test_content_flag
CREATE OR REPLACE FUNCTION public.set_question_test_content_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Inherit is_test_account from author's profile
  SELECT COALESCE(is_test_account, false)
  INTO NEW.is_test_content
  FROM public.profiles
  WHERE id = NEW.author_id;
  
  RETURN NEW;
END;
$$;

-- 1.2 set_answer_test_content_flag
CREATE OR REPLACE FUNCTION public.set_answer_test_content_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Inherit is_test_account from author's profile
  SELECT COALESCE(is_test_account, false)
  INTO NEW.is_test_content
  FROM public.profiles
  WHERE id = NEW.author_id;
  
  RETURN NEW;
END;
$$;

-- 1.3 update_onboarding_timestamps
CREATE OR REPLACE FUNCTION public.update_onboarding_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Set completed_at when onboarding transitions to true
  IF OLD.onboarding_completed = false AND NEW.onboarding_completed = true THEN
    NEW.onboarding_completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- 1.4 enforce_profile_comment_rate_limit
CREATE OR REPLACE FUNCTION public.enforce_profile_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 5;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  IF NEW.author_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Use advisory lock to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext('comment_rate:' || NEW.author_profile_id::TEXT));

  SELECT COUNT(*)
  INTO recent_total
  FROM public.profile_comments
  WHERE author_profile_id = NEW.author_profile_id
    AND created_at >= window_start
    AND status <> 'deleted';

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'comment_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s comments per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_profile_comment_rate_limit IS 
  'Prevents users from posting more than 5 comments in a rolling 24h period. Uses advisory lock to prevent race conditions.';

-- 1.5 enforce_availability_consistency
CREATE OR REPLACE FUNCTION public.enforce_availability_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- For players: ensure open_to_coach is always false
  IF NEW.role = 'player' THEN
    NEW.open_to_coach := false;
  END IF;
  
  -- For coaches: ensure open_to_play is always false
  IF NEW.role = 'coach' THEN
    NEW.open_to_play := false;
  END IF;
  
  -- For clubs: ensure both are always false
  IF NEW.role = 'club' THEN
    NEW.open_to_play := false;
    NEW.open_to_coach := false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 1.6 enforce_question_rate_limit
CREATE OR REPLACE FUNCTION public.enforce_question_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 3;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO recent_total
  FROM public.community_questions
  WHERE author_id = NEW.author_id
    AND created_at >= window_start;

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'question_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s questions per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_question_rate_limit IS 'Prevents users from posting more than 3 questions in a rolling 24h period.';

-- 1.7 enforce_answer_rate_limit
CREATE OR REPLACE FUNCTION public.enforce_answer_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 10;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO recent_total
  FROM public.community_answers
  WHERE author_id = NEW.author_id
    AND created_at >= window_start;

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'answer_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s answers per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_answer_rate_limit IS 'Prevents users from posting more than 10 answers in a rolling 24h period.';

-- 1.8 increment_version (optimistic locking trigger)
CREATE OR REPLACE FUNCTION public.increment_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

-- 1.9 normalize_conversation_participants
CREATE OR REPLACE FUNCTION public.normalize_conversation_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tmp UUID;
BEGIN
  IF NEW.participant_one_id > NEW.participant_two_id THEN
    tmp := NEW.participant_one_id;
    NEW.participant_one_id := NEW.participant_two_id;
    NEW.participant_two_id := tmp;
  END IF;
  RETURN NEW;
END;
$$;

-- 1.10 check_concurrent_profile_update
CREATE OR REPLACE FUNCTION public.check_concurrent_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    PERFORM pg_sleep(0.05); -- discourage rapid conflicting uploads
  END IF;
  RETURN NEW;
END;
$$;

-- 1.11 update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- 1.12 handle_updated_at (variant used in some places)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1.13 set_vacancy_published_at / set_vacancy_status_timestamps
CREATE OR REPLACE FUNCTION public.set_vacancy_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open' AND OLD.status != 'open' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  
  IF NEW.status = 'closed' AND OLD.status != 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vacancy_status_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open' AND (OLD.status IS DISTINCT FROM 'open') AND NEW.published_at IS NULL THEN
    NEW.published_at = timezone('utc', now());
  END IF;

  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') AND NEW.closed_at IS NULL THEN
    NEW.closed_at = timezone('utc', now());
  END IF;

  RETURN NEW;
END;
$$;

-- 1.14 update_conversation_timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.sent_at,
    updated_at = timezone('utc', now())
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- 1.15 update_vacancies_updated_at
CREATE OR REPLACE FUNCTION public.update_vacancies_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. HELPER/UTILITY FUNCTIONS (non-trigger)
-- ============================================================================

-- 2.1 try_parse_years_component
CREATE OR REPLACE FUNCTION public.try_parse_years_component(years TEXT, component TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned TEXT;
  result DATE;
BEGIN
  IF years IS NULL OR trim(years) = '' THEN
    RETURN NULL;
  END IF;

  IF component = 'start' THEN
    cleaned := split_part(years, '-', 1);
  ELSE
    cleaned := split_part(years, '-', 2);
  END IF;

  cleaned := NULLIF(trim(cleaned), '');
  IF cleaned IS NULL OR lower(cleaned) = 'present' THEN
    RETURN NULL;
  END IF;

  BEGIN
    result := to_date(cleaned, 'Mon YYYY');
    RETURN result;
  EXCEPTION WHEN others THEN
    BEGIN
      result := to_date(cleaned, 'YYYY');
      RETURN result;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END;
END;
$$;

-- 2.2 extract_storage_path
CREATE OR REPLACE FUNCTION public.extract_storage_path(p_url TEXT, p_bucket TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  marker TEXT;
  idx INTEGER;
BEGIN
  IF p_url IS NULL OR p_bucket IS NULL OR length(trim(p_url)) = 0 THEN
    RETURN NULL;
  END IF;

  normalized := regexp_replace(p_url, '^https?://[^/]+', '');
  normalized := regexp_replace(normalized, '\?.*$', '');

  marker := '/storage/v1/object/public/' || p_bucket || '/';
  idx := POSITION(marker IN normalized);
  IF idx > 0 THEN
    RETURN SUBSTRING(normalized FROM idx + CHAR_LENGTH(marker));
  END IF;

  marker := p_bucket || '/';
  IF left(normalized, CHAR_LENGTH(marker)) = marker THEN
    RETURN SUBSTRING(normalized FROM CHAR_LENGTH(marker) + 1);
  END IF;

  idx := POSITION(marker IN normalized);
  IF idx > 0 THEN
    RETURN SUBSTRING(normalized FROM idx + CHAR_LENGTH(marker));
  END IF;

  RETURN NULL;
END;
$$;

-- 2.3 validate_social_links
CREATE OR REPLACE FUNCTION public.validate_social_links(links JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'];
  link_key TEXT;
  link_value TEXT;
BEGIN
  -- Allow null or empty object
  IF links IS NULL OR links = '{}'::jsonb THEN
    RETURN TRUE;
  END IF;
  
  -- Must be an object, not an array
  IF jsonb_typeof(links) != 'object' THEN
    RETURN FALSE;
  END IF;
  
  -- Check each key-value pair
  FOR link_key, link_value IN SELECT * FROM jsonb_each_text(links) LOOP
    -- Key must be in allowed list
    IF NOT (link_key = ANY(allowed_keys)) THEN
      RETURN FALSE;
    END IF;
    
    -- Value must be a string (URL) and not empty when present
    IF link_value IS NOT NULL AND length(trim(link_value)) > 0 THEN
      -- Basic URL validation - must start with http:// or https://
      IF NOT (link_value ~* '^https?://') THEN
        RETURN FALSE;
      END IF;
      
      -- URL length limit
      IF length(link_value) > 500 THEN
        RETURN FALSE;
      END IF;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$;

-- 2.4 match_text_to_country
CREATE OR REPLACE FUNCTION public.match_text_to_country(input_text TEXT)
RETURNS TABLE (country_id INTEGER, confidence TEXT, match_type TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  found_country_id INTEGER;
  found_confidence TEXT;
BEGIN
  IF input_text IS NULL OR TRIM(input_text) = '' THEN
    RETURN;
  END IF;
  
  normalized := LOWER(TRIM(input_text));
  
  -- 1. Exact match on pre-mapped aliases
  SELECT a.country_id, a.confidence INTO found_country_id, found_confidence
  FROM public.country_text_aliases a
  WHERE a.alias_text = normalized
  LIMIT 1;
  
  IF found_country_id IS NOT NULL THEN
    country_id := found_country_id;
    confidence := found_confidence;
    match_type := 'alias';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- 2. Exact match on country name, common_name, or nationality_name
  SELECT c.id INTO found_country_id
  FROM public.countries c
  WHERE LOWER(c.name) = normalized 
     OR LOWER(c.common_name) = normalized
     OR LOWER(c.nationality_name) = normalized
     OR LOWER(c.code) = normalized
     OR LOWER(c.code_alpha3) = normalized
  LIMIT 1;
  
  IF found_country_id IS NOT NULL THEN
    country_id := found_country_id;
    confidence := 'high';
    match_type := 'exact';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- 3. Fuzzy match using trigram similarity
  SELECT c.id, 
         CASE 
           WHEN GREATEST(
             similarity(LOWER(c.name), normalized),
             similarity(LOWER(c.nationality_name), normalized)
           ) > 0.6 THEN 'medium'
           ELSE 'low'
         END INTO found_country_id, found_confidence
  FROM public.countries c
  WHERE similarity(LOWER(c.name), normalized) > 0.3
     OR similarity(LOWER(c.nationality_name), normalized) > 0.3
  ORDER BY GREATEST(
    similarity(LOWER(c.name), normalized),
    similarity(LOWER(c.nationality_name), normalized)
  ) DESC
  LIMIT 1;
  
  IF found_country_id IS NOT NULL THEN
    country_id := found_country_id;
    confidence := found_confidence;
    match_type := 'fuzzy';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- 4. No match found
  country_id := NULL;
  confidence := 'unmatched';
  match_type := 'none';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.match_text_to_country IS 'Matches free-text country/nationality input to a country_id with confidence level';

-- 2.5 get_message_recipient
CREATE OR REPLACE FUNCTION public.get_message_recipient(p_conversation_id UUID, p_sender_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN c.participant_one_id = p_sender_id THEN c.participant_two_id
           ELSE c.participant_one_id
         END AS recipient_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  LIMIT 1;
$$;

-- 2.6 process_storage_cleanup_queue
CREATE OR REPLACE FUNCTION public.process_storage_cleanup_queue(
  p_batch INTEGER DEFAULT 200,
  p_grace_period INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, storage
AS $$
DECLARE
  processed INTEGER := 0;
  job RECORD;
BEGIN
  -- Only process items that have been queued for at least p_grace_period (default 7 days)
  -- This gives time to catch and fix bugs before files are permanently deleted
  FOR job IN
    SELECT id, bucket_id, object_path
    FROM public.storage_cleanup_queue
    WHERE processed_at IS NULL
      AND queued_at < timezone('utc', now()) - p_grace_period
    ORDER BY queued_at
    LIMIT p_batch
  LOOP
    BEGIN
      DELETE FROM storage.objects
      WHERE bucket_id = job.bucket_id
        AND name = job.object_path;

      UPDATE public.storage_cleanup_queue
      SET processed_at = timezone('utc', now()),
          updated_at = timezone('utc', now()),
          last_error = NULL
      WHERE id = job.id;

      processed := processed + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.storage_cleanup_queue
      SET attempts = attempts + 1,
          last_error = SQLERRM,
          updated_at = timezone('utc', now())
      WHERE id = job.id;
    END;
  END LOOP;

  RETURN processed;
END;
$$;

-- 2.7 cleanup_stale_locks
CREATE OR REPLACE FUNCTION public.cleanup_stale_locks()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Advisory locks are automatically cleaned up by PostgreSQL
  -- This function is a placeholder for future custom lock management
  RAISE NOTICE 'Advisory locks are automatically cleaned up by PostgreSQL on session end';
END;
$$;

-- 2.8 acquire_profile_lock
CREATE OR REPLACE FUNCTION public.acquire_profile_lock(profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_lock(hashtext(profile_id::TEXT));
END;
$$;

-- 2.9 release_profile_lock
CREATE OR REPLACE FUNCTION public.release_profile_lock(profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN pg_advisory_unlock(hashtext(profile_id::TEXT));
END;
$$;

-- 2.10 engagement_heartbeat_interval_seconds
CREATE OR REPLACE FUNCTION public.engagement_heartbeat_interval_seconds()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 30;
$$;

COMMENT ON FUNCTION public.engagement_heartbeat_interval_seconds IS 
  'Returns the heartbeat interval in seconds. Must match client-side HEARTBEAT_INTERVAL_MS / 1000.';

-- ============================================================================
-- 3. ADDITIONAL FUNCTIONS THAT MAY HAVE BEEN MISSED
-- ============================================================================

-- 3.1 is_platform_admin (already has proper settings but adding search_path for consistency)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::BOOLEAN,
    FALSE
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin IS 'Evaluates current JWT claims to determine admin/moderator privileges.';

-- ============================================================================
-- DONE: All functions now have explicit search_path settings
-- ============================================================================

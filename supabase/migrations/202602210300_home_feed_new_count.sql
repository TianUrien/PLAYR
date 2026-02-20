-- ============================================================================
-- Migration: Home Feed New Count RPC
-- Date: 2026-02-21
-- Description: Lightweight RPC to count new feed items since a given timestamp.
--   Used by the client re-engagement hook to show a "New posts" banner when
--   the user returns to the app after being away.
--   Mirrors get_home_feed's UNION of home_feed_items + user_posts and its
--   test-account visibility logic.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_home_feed_new_count(
  p_since TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_test BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  SELECT (
    (SELECT COUNT(*)::INT
     FROM home_feed_items
     WHERE deleted_at IS NULL
       AND created_at > p_since
       AND (v_is_test OR is_test_account = false))
    +
    (SELECT COUNT(*)::INT
     FROM user_posts up
     JOIN profiles p ON p.id = up.author_id
     WHERE up.deleted_at IS NULL
       AND up.created_at > p_since
       AND up.author_id != v_user_id
       AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false))
  ) INTO v_count;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_new_count(TIMESTAMPTZ) TO authenticated;
COMMENT ON FUNCTION public.get_home_feed_new_count IS
  'Returns count of new feed items since a given timestamp. Used by the client re-engagement hook to show a New posts banner. Excludes the callers own user_posts (already prepended via PostComposer). Respects test account visibility.';

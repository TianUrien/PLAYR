-- ============================================================================
-- Migration: get_profile_posts RPC
-- Date: 2026-02-17
-- Description: New RPC to fetch paginated posts for a specific user's profile.
--   Returns the same JSONB shape as get_home_feed user_post items so the
--   frontend can reuse UserPostCard / TransferAnnouncementCard unchanged.
-- ============================================================================

SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_profile_posts(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
  v_total BIGINT;
  v_user_id UUID := auth.uid();
BEGIN
  -- Count total non-deleted posts by this author
  SELECT COUNT(*) INTO v_total
  FROM user_posts
  WHERE author_id = p_profile_id
    AND deleted_at IS NULL;

  -- Fetch paginated posts with author info + viewer like status
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'feed_item_id', up.id,
      'item_type', 'user_post',
      'created_at', up.created_at,
      'post_id', up.id,
      'author_id', up.author_id,
      'author_name', COALESCE(b.name, p.full_name),
      'author_avatar', COALESCE(b.logo_url, p.avatar_url),
      'author_role', p.role,
      'content', up.content,
      'images', up.images,
      'like_count', up.like_count,
      'comment_count', up.comment_count,
      'has_liked', EXISTS (
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = up.id AND pl.user_id = v_user_id
      ),
      'post_type', COALESCE(up.post_type, 'text'),
      'metadata', up.metadata
    )
    ORDER BY up.created_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT up2.id, up2.author_id, up2.content, up2.images,
           up2.like_count, up2.comment_count, up2.created_at,
           up2.post_type, up2.metadata
    FROM user_posts up2
    WHERE up2.author_id = p_profile_id
      AND up2.deleted_at IS NULL
    ORDER BY up2.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) up
  JOIN profiles p ON p.id = up.author_id
  LEFT JOIN brands b ON b.profile_id = p.id;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_posts(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_posts(UUID, INTEGER, INTEGER) TO anon;

COMMENT ON FUNCTION public.get_profile_posts IS
  'Fetches paginated user_posts for a specific profile. Returns same JSONB shape as get_home_feed user_post items. Public visibility — any viewer can call.';

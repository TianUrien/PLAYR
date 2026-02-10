-- ============================================================================
-- USER POSTS RPCs
-- ============================================================================
-- CRUD operations for user posts, like toggle, comments, and updated
-- home feed RPC that UNIONs system posts + user posts.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. CREATE USER POST
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_user_post(
  p_content TEXT,
  p_images JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_post_id UUID;
  v_trimmed TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_trimmed := trim(p_content);

  -- Validate content
  IF v_trimmed = '' OR char_length(v_trimmed) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content is required');
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content exceeds 2000 character limit');
  END IF;

  -- Validate images (max 4)
  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 4 images allowed');
  END IF;

  INSERT INTO user_posts (author_id, content, images)
  VALUES (v_user_id, v_trimmed, p_images)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_post(TEXT, JSONB) TO authenticated;

-- ============================================================================
-- 2. UPDATE USER POST
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_user_post(
  p_post_id UUID,
  p_content TEXT,
  p_images JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_trimmed TEXT;
  v_owner_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check ownership
  SELECT author_id INTO v_owner_id
  FROM user_posts
  WHERE id = p_post_id AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found');
  END IF;

  IF v_owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_trimmed := trim(p_content);

  IF v_trimmed = '' OR char_length(v_trimmed) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content is required');
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content exceeds 2000 character limit');
  END IF;

  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 4 images allowed');
  END IF;

  UPDATE user_posts
  SET content = v_trimmed,
      images = p_images,
      updated_at = timezone('utc', now())
  WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_post(UUID, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- 3. DELETE USER POST (soft delete)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owner_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT author_id INTO v_owner_id
  FROM user_posts
  WHERE id = p_post_id AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found');
  END IF;

  IF v_owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE user_posts
  SET deleted_at = timezone('utc', now())
  WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_post(UUID) TO authenticated;

-- ============================================================================
-- 4. TOGGLE POST LIKE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_id UUID;
  v_liked BOOLEAN;
  v_like_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if post exists
  IF NOT EXISTS (SELECT 1 FROM user_posts WHERE id = p_post_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found');
  END IF;

  -- Check if already liked
  SELECT id INTO v_existing_id
  FROM post_likes
  WHERE post_id = p_post_id AND user_id = v_user_id;

  IF v_existing_id IS NOT NULL THEN
    -- Unlike
    DELETE FROM post_likes WHERE id = v_existing_id;
    v_liked := false;
  ELSE
    -- Like
    INSERT INTO post_likes (post_id, user_id)
    VALUES (p_post_id, v_user_id);
    v_liked := true;
  END IF;

  -- Get updated count (trigger already updates, but read after)
  SELECT like_count INTO v_like_count
  FROM user_posts
  WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true, 'liked', v_liked, 'like_count', v_like_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_post_like(UUID) TO authenticated;

-- ============================================================================
-- 5. GET POST COMMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_post_comments(
  p_post_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comments JSONB;
  v_total BIGINT;
BEGIN
  -- Count total non-deleted comments
  SELECT COUNT(*) INTO v_total
  FROM post_comments
  WHERE post_id = p_post_id AND deleted_at IS NULL;

  -- Fetch comments with author info
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pc.id,
      'post_id', pc.post_id,
      'author_id', pc.author_id,
      'author_name', p.full_name,
      'author_avatar', p.avatar_url,
      'author_role', p.role,
      'content', pc.content,
      'created_at', pc.created_at
    )
    ORDER BY pc.created_at ASC
  ), '[]'::jsonb)
  INTO v_comments
  FROM (
    SELECT id, post_id, author_id, content, created_at
    FROM post_comments
    WHERE post_id = p_post_id AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT p_limit
    OFFSET p_offset
  ) pc
  JOIN profiles p ON p.id = pc.author_id;

  RETURN jsonb_build_object('comments', v_comments, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_post_comments(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- 6. CREATE POST COMMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_post_comment(
  p_post_id UUID,
  p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_trimmed TEXT;
  v_comment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if post exists
  IF NOT EXISTS (SELECT 1 FROM user_posts WHERE id = p_post_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found');
  END IF;

  v_trimmed := trim(p_content);

  IF v_trimmed = '' OR char_length(v_trimmed) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comment content is required');
  END IF;

  IF char_length(v_trimmed) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comment exceeds 500 character limit');
  END IF;

  -- Rate limit is enforced by trigger
  INSERT INTO post_comments (post_id, author_id, content)
  VALUES (p_post_id, v_user_id, v_trimmed)
  RETURNING id INTO v_comment_id;

  RETURN jsonb_build_object('success', true, 'comment_id', v_comment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_post_comment(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 7. DELETE POST COMMENT (soft delete)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_post_comment(p_comment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owner_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT author_id INTO v_owner_id
  FROM post_comments
  WHERE id = p_comment_id AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comment not found');
  END IF;

  IF v_owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE post_comments
  SET deleted_at = timezone('utc', now())
  WHERE id = p_comment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_post_comment(UUID) TO authenticated;

-- ============================================================================
-- 8. UPDATED HOME FEED RPC (UNION of system + user posts)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_home_feed(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_item_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
  v_total BIGINT;
  v_user_id UUID := auth.uid();
BEGIN
  -- If filtering by a specific system type, use original logic
  IF p_item_type IS NOT NULL AND p_item_type != 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items
    WHERE deleted_at IS NULL AND item_type = p_item_type;

    SELECT COALESCE(jsonb_agg(
      hfi.metadata || jsonb_build_object(
        'feed_item_id', hfi.id,
        'item_type', hfi.item_type,
        'created_at', hfi.created_at
      )
      ORDER BY hfi.created_at DESC
    ), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT id, item_type, metadata, created_at
      FROM home_feed_items
      WHERE deleted_at IS NULL AND item_type = p_item_type
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) hfi;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- If filtering by user_post only
  IF p_item_type = 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM user_posts
    WHERE deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'feed_item_id', up.id,
        'item_type', 'user_post',
        'created_at', up.created_at,
        'post_id', up.id,
        'author_id', up.author_id,
        'author_name', p.full_name,
        'author_avatar', p.avatar_url,
        'author_role', p.role,
        'content', up.content,
        'images', up.images,
        'like_count', up.like_count,
        'comment_count', up.comment_count,
        'has_liked', EXISTS (
          SELECT 1 FROM post_likes pl
          WHERE pl.post_id = up.id AND pl.user_id = v_user_id
        )
      )
      ORDER BY up.created_at DESC
    ), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT id, author_id, content, images, like_count, comment_count, created_at
      FROM user_posts
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) up
    JOIN profiles p ON p.id = up.author_id;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- Default: UNION of system posts + user posts (unified feed)
  WITH combined AS (
    -- System posts
    SELECT
      hfi.id AS feed_id,
      hfi.item_type,
      hfi.created_at,
      hfi.metadata || jsonb_build_object(
        'feed_item_id', hfi.id,
        'item_type', hfi.item_type,
        'created_at', hfi.created_at
      ) AS item_data
    FROM home_feed_items hfi
    WHERE hfi.deleted_at IS NULL

    UNION ALL

    -- User posts
    SELECT
      up.id AS feed_id,
      'user_post'::TEXT AS item_type,
      up.created_at,
      jsonb_build_object(
        'feed_item_id', up.id,
        'item_type', 'user_post',
        'created_at', up.created_at,
        'post_id', up.id,
        'author_id', up.author_id,
        'author_name', p.full_name,
        'author_avatar', p.avatar_url,
        'author_role', p.role,
        'content', up.content,
        'images', up.images,
        'like_count', up.like_count,
        'comment_count', up.comment_count,
        'has_liked', EXISTS (
          SELECT 1 FROM post_likes pl
          WHERE pl.post_id = up.id AND pl.user_id = v_user_id
        )
      ) AS item_data
    FROM user_posts up
    JOIN profiles p ON p.id = up.author_id
    WHERE up.deleted_at IS NULL
  )
  SELECT COUNT(*) INTO v_total FROM combined;

  SELECT COALESCE(jsonb_agg(
    c.item_data ORDER BY c.created_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT item_data, created_at
    FROM combined
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) c;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.get_home_feed IS 'Fetches paginated home feed with system posts + user posts unified';

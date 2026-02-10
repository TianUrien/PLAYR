-- Fix get_home_feed: CTE "combined" cannot span multiple PL/pgSQL statements
-- The WITH combined AS (...) was used in two separate SELECT INTO statements,
-- but CTEs in PL/pgSQL are scoped to a single SQL statement.
-- Fix: inline the UNION subquery into each statement separately.

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

  -- Count total from both sources
  SELECT (
    (SELECT COUNT(*) FROM home_feed_items WHERE deleted_at IS NULL) +
    (SELECT COUNT(*) FROM user_posts WHERE deleted_at IS NULL)
  ) INTO v_total;

  -- Fetch paginated items from unified feed
  SELECT COALESCE(jsonb_agg(
    c.item_data ORDER BY c.created_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT item_data, created_at
    FROM (
      -- System posts
      SELECT
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
    ) unified
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) c;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

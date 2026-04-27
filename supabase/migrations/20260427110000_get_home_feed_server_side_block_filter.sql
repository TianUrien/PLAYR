-- ============================================================================
-- Apple Guideline 1.2 — server-side block filter on Home feed
-- ============================================================================
-- The client-side block filter in useHomeFeed only catches author_id /
-- profile_id / club_id / referee_id from each item type's payload. Brand
-- items expose only `brand_id` (the brand UUID, not the owning user's
-- profile id), so brand content from a blocked owner could leak into a
-- blocker's feed if they refreshed before client-side filtering kicked
-- in — and remained visible if the brand_id field never matched the
-- blocked-user list.
--
-- Now that home_feed_items.author_profile_id is denormalized
-- (20260425010000) we can do this correctly server-side. The RPC pulls
-- the caller's blocked-ids set once into a local array variable, then
-- adds a NOT-IN-blocked-set guard to every WHERE clause:
--   - system events branch  → hfi.author_profile_id NOT IN blocked
--   - user_posts branch     → up.author_id NOT IN blocked
--
-- Orphaned system events (author_profile_id IS NULL because the source
-- profile was hard-deleted before the FK existed) bypass the filter —
-- there's no live user to block. Same approach as the trigger-side
-- backfill in 20260425010000.
--
-- Client-side filter in useHomeFeed.ts stays as-is for now: it provides
-- instant feedback when the user blocks someone (no need to wait for
-- the server refetch to reconcile). Server is the source of truth on
-- the next refetch.

CREATE OR REPLACE FUNCTION public.get_home_feed(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_item_type TEXT DEFAULT NULL,
  p_country_ids INTEGER[] DEFAULT NULL,
  p_roles TEXT[] DEFAULT NULL
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
  v_is_test BOOLEAN;
  v_blocked_ids UUID[];
BEGIN
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  -- Precompute the caller's blocked-ids set. COALESCE to empty array so
  -- `= ANY(v_blocked_ids)` returns false instead of NULL when the user
  -- has no blocks.
  SELECT COALESCE(array_agg(blocked_id), ARRAY[]::UUID[])
    INTO v_blocked_ids
    FROM user_blocks
   WHERE blocker_id = v_user_id;

  IF p_item_type IS NULL OR p_item_type = '' THEN

    SELECT (
      (SELECT COUNT(*)
       FROM home_feed_items hfi
       WHERE hfi.deleted_at IS NULL
         AND hfi.item_type != 'member_joined'
         AND (v_is_test OR hfi.is_test_account = false)
         AND (hfi.author_profile_id IS NULL OR NOT (hfi.author_profile_id = ANY(v_blocked_ids)))
         AND (
           p_roles IS NULL
           OR hfi.author_role = ANY(p_roles)
         )
         AND (
           p_country_ids IS NULL
           OR hfi.item_type IN ('brand_post', 'brand_product')
           OR hfi.author_role = 'brand'
           OR hfi.author_country_id = ANY(p_country_ids)
         )
      )
      +
      (SELECT COUNT(*)
       FROM user_posts up
       JOIN profiles p ON p.id = up.author_id
       WHERE up.deleted_at IS NULL
         AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
         AND NOT (up.author_id = ANY(v_blocked_ids))
         AND (
           p_roles IS NULL
           OR p.role = ANY(p_roles)
         )
         AND (
           p_country_ids IS NULL
           OR p.role = 'brand'
           OR p.nationality_country_id = ANY(p_country_ids)
         )
      )
    ) INTO v_total;

    SELECT COALESCE(jsonb_agg(c.item_data ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT item_data, created_at FROM (
        SELECT
          hfi.created_at,
          hfi.metadata || jsonb_build_object(
            'feed_item_id', hfi.id,
            'item_type', hfi.item_type,
            'created_at', hfi.created_at
          ) AS item_data
        FROM home_feed_items hfi
        WHERE hfi.deleted_at IS NULL
          AND hfi.item_type != 'member_joined'
          AND (v_is_test OR hfi.is_test_account = false)
          AND (hfi.author_profile_id IS NULL OR NOT (hfi.author_profile_id = ANY(v_blocked_ids)))
          AND (
            p_roles IS NULL
            OR hfi.author_role = ANY(p_roles)
          )
          AND (
            p_country_ids IS NULL
            OR hfi.item_type IN ('brand_post', 'brand_product')
            OR hfi.author_role = 'brand'
            OR hfi.author_country_id = ANY(p_country_ids)
          )

        UNION ALL

        SELECT
          up.created_at,
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
            )
          ) AS item_data
        FROM user_posts up
        JOIN profiles p ON p.id = up.author_id
        LEFT JOIN brands b ON b.profile_id = p.id
        WHERE up.deleted_at IS NULL
          AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
          AND NOT (up.author_id = ANY(v_blocked_ids))
          AND (
            p_roles IS NULL
            OR p.role = ANY(p_roles)
          )
          AND (
            p_country_ids IS NULL
            OR p.role = 'brand'
            OR p.nationality_country_id = ANY(p_country_ids)
          )
      ) unified
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) c;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  IF p_item_type != 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items hfi
    WHERE hfi.deleted_at IS NULL
      AND hfi.item_type = p_item_type
      AND hfi.item_type != 'member_joined'
      AND (v_is_test OR hfi.is_test_account = false)
      AND (hfi.author_profile_id IS NULL OR NOT (hfi.author_profile_id = ANY(v_blocked_ids)))
      AND (p_roles IS NULL OR hfi.author_role = ANY(p_roles))
      AND (
        p_country_ids IS NULL
        OR hfi.item_type IN ('brand_post', 'brand_product')
        OR hfi.author_role = 'brand'
        OR hfi.author_country_id = ANY(p_country_ids)
      );

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
      FROM home_feed_items hfi2
      WHERE hfi2.deleted_at IS NULL
        AND hfi2.item_type = p_item_type
        AND hfi2.item_type != 'member_joined'
        AND (v_is_test OR hfi2.is_test_account = false)
        AND (hfi2.author_profile_id IS NULL OR NOT (hfi2.author_profile_id = ANY(v_blocked_ids)))
        AND (p_roles IS NULL OR hfi2.author_role = ANY(p_roles))
        AND (
          p_country_ids IS NULL
          OR hfi2.item_type IN ('brand_post', 'brand_product')
          OR hfi2.author_role = 'brand'
          OR hfi2.author_country_id = ANY(p_country_ids)
        )
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) hfi;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- p_item_type = 'user_post'
  SELECT COUNT(*) INTO v_total
  FROM user_posts up
  JOIN profiles p ON p.id = up.author_id
  WHERE up.deleted_at IS NULL
    AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
    AND NOT (up.author_id = ANY(v_blocked_ids))
    AND (p_roles IS NULL OR p.role = ANY(p_roles))
    AND (
      p_country_ids IS NULL
      OR p.role = 'brand'
      OR p.nationality_country_id = ANY(p_country_ids)
    );

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
      )
    )
    ORDER BY up.created_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT up2.id, up2.author_id, up2.content, up2.images,
           up2.like_count, up2.comment_count, up2.created_at
    FROM user_posts up2
    JOIN profiles p2 ON p2.id = up2.author_id
    WHERE up2.deleted_at IS NULL
      AND (v_is_test OR p2.is_test_account IS NULL OR p2.is_test_account = false)
      AND NOT (up2.author_id = ANY(v_blocked_ids))
      AND (p_roles IS NULL OR p2.role = ANY(p_roles))
      AND (
        p_country_ids IS NULL
        OR p2.role = 'brand'
        OR p2.nationality_country_id = ANY(p_country_ids)
      )
    ORDER BY up2.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) up
  JOIN profiles p ON p.id = up.author_id
  LEFT JOIN brands b ON b.profile_id = p.id;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.get_home_feed(INTEGER, INTEGER, TEXT, INTEGER[], TEXT[]) IS
  'Paginated home feed with optional country / role filters AND server-side block enforcement (Apple Guideline 1.2). Country filter passes through brand-authored items (brands are universal). Excludes member_joined cards. Respects test-account visibility.';

NOTIFY pgrst, 'reload schema';

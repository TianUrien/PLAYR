-- ============================================================================
-- BRAND TEST ACCOUNT FILTERING
-- ============================================================================
-- Updates get_brands and get_brand_feed RPCs to exclude brands owned by
-- test accounts (profiles.is_test_account = true).
--
-- Test account users can still see ALL brands (including other test brands),
-- matching the behavior of PeopleListView and other community queries.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. UPDATE get_brands — exclude test brands for real users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_brands(
  p_category TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_brands JSON;
  v_is_test BOOLEAN;
BEGIN
  -- Check if the current user is a test account (they see everything)
  v_is_test := COALESCE(
    (SELECT is_test_account FROM profiles WHERE id = auth.uid()),
    false
  );

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.brands br
  WHERE br.deleted_at IS NULL
    AND (p_category IS NULL OR br.category = p_category)
    AND (p_search IS NULL OR br.name ILIKE '%' || p_search || '%')
    AND (v_is_test OR NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = br.profile_id AND p.is_test_account = true
    ));

  -- Get brands with last activity date
  SELECT COALESCE(json_agg(row_to_json(b) ORDER BY b.created_at DESC), '[]'::json)
  INTO v_brands
  FROM (
    SELECT
      br.id,
      br.slug,
      br.name,
      br.logo_url,
      br.cover_url,
      br.bio,
      br.category,
      br.website_url,
      br.instagram_url,
      br.is_verified,
      br.created_at,
      COALESCE(
        GREATEST(
          (SELECT MAX(created_at) FROM brand_products WHERE brand_id = br.id AND deleted_at IS NULL),
          (SELECT MAX(created_at) FROM brand_posts WHERE brand_id = br.id AND deleted_at IS NULL)
        ),
        br.created_at
      ) AS last_activity_at
    FROM public.brands br
    WHERE br.deleted_at IS NULL
      AND (p_category IS NULL OR br.category = p_category)
      AND (p_search IS NULL OR br.name ILIKE '%' || p_search || '%')
      AND (v_is_test OR NOT EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = br.profile_id AND p.is_test_account = true
      ))
    ORDER BY br.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) b;

  RETURN json_build_object(
    'brands', v_brands,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- ============================================================================
-- 2. UPDATE get_brand_feed — exclude test brand content for real users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_brand_feed(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
  v_total BIGINT;
  v_is_test BOOLEAN;
BEGIN
  -- Check if the current user is a test account (they see everything)
  v_is_test := COALESCE(
    (SELECT is_test_account FROM profiles WHERE id = auth.uid()),
    false
  );

  -- Count total feed items (excluding test brands for real users)
  SELECT
    (SELECT count(*)
     FROM brand_products bp
     JOIN brands b ON b.id = bp.brand_id
     WHERE bp.deleted_at IS NULL AND b.deleted_at IS NULL
       AND (v_is_test OR NOT EXISTS (
         SELECT 1 FROM profiles p WHERE p.id = b.profile_id AND p.is_test_account = true
       ))
    )
    +
    (SELECT count(*)
     FROM brand_posts bpo
     JOIN brands b ON b.id = bpo.brand_id
     WHERE bpo.deleted_at IS NULL AND b.deleted_at IS NULL
       AND (v_is_test OR NOT EXISTS (
         SELECT 1 FROM profiles p WHERE p.id = b.profile_id AND p.is_test_account = true
       ))
    )
  INTO v_total;

  -- Fetch unified feed
  SELECT COALESCE(jsonb_agg(sub.item), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT item
    FROM (
      -- Products
      SELECT
        jsonb_build_object(
          'type', 'product',
          'id', bp.id,
          'brand_id', bp.brand_id,
          'brand_name', b.name,
          'brand_slug', b.slug,
          'brand_logo_url', b.logo_url,
          'brand_category', b.category,
          'brand_is_verified', b.is_verified,
          'created_at', bp.created_at,
          'product_name', bp.name,
          'product_description', bp.description,
          'product_images', bp.images,
          'product_external_url', bp.external_url
        ) AS item,
        bp.created_at AS item_date
      FROM brand_products bp
      JOIN brands b ON b.id = bp.brand_id
      WHERE bp.deleted_at IS NULL AND b.deleted_at IS NULL
        AND (v_is_test OR NOT EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = b.profile_id AND p.is_test_account = true
        ))

      UNION ALL

      -- Posts
      SELECT
        jsonb_build_object(
          'type', 'post',
          'id', bpo.id,
          'brand_id', bpo.brand_id,
          'brand_name', b.name,
          'brand_slug', b.slug,
          'brand_logo_url', b.logo_url,
          'brand_category', b.category,
          'brand_is_verified', b.is_verified,
          'created_at', bpo.created_at,
          'post_content', bpo.content,
          'post_image_url', bpo.image_url
        ) AS item,
        bpo.created_at AS item_date
      FROM brand_posts bpo
      JOIN brands b ON b.id = bpo.brand_id
      WHERE bpo.deleted_at IS NULL AND b.deleted_at IS NULL
        AND (v_is_test OR NOT EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = b.profile_id AND p.is_test_account = true
        ))
    ) feed
    ORDER BY item_date DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- Re-grant permissions (signatures unchanged, but CREATE OR REPLACE resets)
GRANT EXECUTE ON FUNCTION public.get_brands(TEXT, TEXT, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_feed(INTEGER, INTEGER) TO anon, authenticated;

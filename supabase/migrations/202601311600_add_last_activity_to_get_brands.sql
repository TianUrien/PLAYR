-- ============================================================================
-- Add last_activity_at to get_brands RPC
--
-- Computes the most recent product or post date for each brand so the
-- directory can show when a brand was last active.
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
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.brands
  WHERE deleted_at IS NULL
    AND (p_category IS NULL OR category = p_category)
    AND (p_search IS NULL OR name ILIKE '%' || p_search || '%');

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

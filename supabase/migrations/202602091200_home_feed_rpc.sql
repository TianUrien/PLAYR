-- ============================================================================
-- HOME FEED RPC
-- ============================================================================
-- Creates the main RPC function for fetching the Home feed:
--   get_home_feed(p_limit, p_offset, p_item_type?) → JSONB
-- ============================================================================

SET search_path = public;

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
BEGIN
  -- Count total items (with optional type filter)
  IF p_item_type IS NULL THEN
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items
    WHERE deleted_at IS NULL;
  ELSE
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items
    WHERE deleted_at IS NULL
      AND item_type = p_item_type;
  END IF;

  -- Fetch paginated feed items
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
    WHERE deleted_at IS NULL
      AND (p_item_type IS NULL OR item_type = p_item_type)
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) hfi;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total
  );
END;
$$;

COMMENT ON FUNCTION public.get_home_feed IS 'Fetches paginated home feed items with optional type filtering';

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION public.get_home_feed(INTEGER, INTEGER, TEXT) TO authenticated;

-- ============================================================================
-- Migration: Brand Ambassadors
-- Date: 2026-03-02
-- Description: Allows brands to designate players as ambassadors.
--   1. brand_ambassadors table with unique constraint
--   2. ambassador_count column on brands (denormalized)
--   3. add_brand_ambassador / remove_brand_ambassador RPCs
--   4. get_brand_ambassadors RPC (dashboard, paginated)
--   5. get_brand_ambassadors_public RPC (public profile, capped)
--   6. RLS policies
--   7. Update get_my_brand_analytics to include ambassador_count
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.brand_ambassadors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_ambassadors_brand ON public.brand_ambassadors(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_ambassadors_player ON public.brand_ambassadors(player_id);

-- ============================================================================
-- 2. Denormalized count
-- ============================================================================

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS ambassador_count INT NOT NULL DEFAULT 0;

-- ============================================================================
-- 3. RLS
-- ============================================================================

ALTER TABLE public.brand_ambassadors ENABLE ROW LEVEL SECURITY;

-- Anyone can read ambassadors (public display on brand profiles)
CREATE POLICY brand_ambassadors_select ON public.brand_ambassadors
  FOR SELECT USING (true);

-- No INSERT/DELETE policies — managed exclusively via SECURITY DEFINER RPCs

-- ============================================================================
-- 4. RPC: add_brand_ambassador
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_brand_ambassador(
  p_brand_id UUID,
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_brand_profile_id UUID;
  v_player_role TEXT;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify caller owns this brand
  SELECT profile_id INTO v_brand_profile_id
  FROM brands WHERE id = p_brand_id AND deleted_at IS NULL;

  IF v_brand_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  IF v_brand_profile_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Verify target is a player with completed onboarding
  SELECT role INTO v_player_role
  FROM profiles WHERE id = p_player_id AND onboarding_completed = true;

  IF v_player_role IS NULL OR v_player_role != 'player' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only players can be ambassadors');
  END IF;

  -- Insert ambassador (idempotent via ON CONFLICT)
  INSERT INTO brand_ambassadors (brand_id, player_id)
  VALUES (p_brand_id, p_player_id)
  ON CONFLICT (brand_id, player_id) DO NOTHING;

  -- Recount (safe, avoids drift)
  SELECT COUNT(*) INTO v_new_count
  FROM brand_ambassadors WHERE brand_id = p_brand_id;

  UPDATE brands SET ambassador_count = v_new_count WHERE id = p_brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'ambassador_count', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_brand_ambassador(UUID, UUID) TO authenticated;

-- ============================================================================
-- 5. RPC: remove_brand_ambassador
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_brand_ambassador(
  p_brand_id UUID,
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_brand_profile_id UUID;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify caller owns this brand
  SELECT profile_id INTO v_brand_profile_id
  FROM brands WHERE id = p_brand_id AND deleted_at IS NULL;

  IF v_brand_profile_id IS NULL OR v_brand_profile_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  DELETE FROM brand_ambassadors
  WHERE brand_id = p_brand_id AND player_id = p_player_id;

  -- Recount
  SELECT COUNT(*) INTO v_new_count
  FROM brand_ambassadors WHERE brand_id = p_brand_id;

  UPDATE brands SET ambassador_count = v_new_count WHERE id = p_brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'ambassador_count', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_brand_ambassador(UUID, UUID) TO authenticated;

-- ============================================================================
-- 6. RPC: get_brand_ambassadors (dashboard, paginated)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_brand_ambassadors(
  p_brand_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_ambassadors JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM brand_ambassadors WHERE brand_id = p_brand_id;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY added_at DESC), '[]'::jsonb)
  INTO v_ambassadors
  FROM (
    SELECT
      jsonb_build_object(
        'player_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'role', p.role,
        'position', p.position,
        'base_location', p.base_location,
        'current_club', p.current_club,
        'added_at', ba.created_at
      ) AS row_data,
      ba.created_at AS added_at
    FROM brand_ambassadors ba
    JOIN profiles p ON p.id = ba.player_id
    WHERE ba.brand_id = p_brand_id
    ORDER BY ba.created_at DESC
    LIMIT LEAST(p_limit, 50)
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'ambassadors', v_ambassadors,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_ambassadors(UUID, INT, INT) TO authenticated;

-- ============================================================================
-- 7. RPC: get_brand_ambassadors_public (public profile, capped at 12)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_brand_ambassadors_public(
  p_brand_id UUID,
  p_limit INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_ambassadors JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM brand_ambassadors WHERE brand_id = p_brand_id;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY added_at DESC), '[]'::jsonb)
  INTO v_ambassadors
  FROM (
    SELECT
      jsonb_build_object(
        'player_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'position', p.position,
        'current_club', p.current_club
      ) AS row_data,
      ba.created_at AS added_at
    FROM brand_ambassadors ba
    JOIN profiles p ON p.id = ba.player_id
    WHERE ba.brand_id = p_brand_id
    ORDER BY ba.created_at DESC
    LIMIT LEAST(p_limit, 12)
  ) sub;

  RETURN jsonb_build_object(
    'ambassadors', v_ambassadors,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_ambassadors_public(UUID, INT) TO anon, authenticated;

-- ============================================================================
-- 8. Update get_my_brand_analytics to include ambassador_count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_brand_analytics(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_role TEXT;
  v_brand_id UUID;
  v_profile_id UUID;
  v_profile_views BIGINT := 0;
  v_profile_views_previous BIGINT := 0;
  v_follower_count INT := 0;
  v_product_count BIGINT := 0;
  v_post_count BIGINT := 0;
  v_ambassador_count BIGINT := 0;
  v_period_start TIMESTAMPTZ;
  v_previous_start TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify caller is a brand
  SELECT role INTO v_user_role FROM profiles WHERE id = v_user_id;
  IF v_user_role != 'brand' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only brand users can view brand analytics');
  END IF;

  -- Get brand
  SELECT id, profile_id INTO v_brand_id, v_profile_id
  FROM brands WHERE profile_id = v_user_id AND deleted_at IS NULL;

  IF v_brand_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  v_period_start := now() - (p_days || ' days')::interval;
  v_previous_start := v_period_start - (p_days || ' days')::interval;

  -- Profile views (current period)
  SELECT COUNT(*) INTO v_profile_views
  FROM events
  WHERE event_name = 'profile_view'
    AND entity_type = 'profile'
    AND entity_id = v_profile_id::text
    AND created_at >= v_period_start;

  -- Profile views (previous period for trend)
  SELECT COUNT(*) INTO v_profile_views_previous
  FROM events
  WHERE event_name = 'profile_view'
    AND entity_type = 'profile'
    AND entity_id = v_profile_id::text
    AND created_at >= v_previous_start
    AND created_at < v_period_start;

  -- Follower count
  SELECT COALESCE(b.follower_count, 0) INTO v_follower_count
  FROM brands b WHERE b.id = v_brand_id;

  -- Product count
  SELECT COUNT(*) INTO v_product_count
  FROM brand_products WHERE brand_id = v_brand_id AND deleted_at IS NULL;

  -- Post count
  SELECT COUNT(*) INTO v_post_count
  FROM brand_posts WHERE brand_id = v_brand_id AND deleted_at IS NULL;

  -- Ambassador count
  SELECT COUNT(*) INTO v_ambassador_count
  FROM brand_ambassadors WHERE brand_id = v_brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_views', v_profile_views,
    'profile_views_previous', v_profile_views_previous,
    'follower_count', v_follower_count,
    'product_count', v_product_count,
    'post_count', v_post_count,
    'ambassador_count', v_ambassador_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_brand_analytics(INT) TO authenticated;
COMMENT ON FUNCTION public.get_my_brand_analytics IS 'Returns analytics data for the authenticated brand owner: profile views, followers, products, posts, ambassadors.';

NOTIFY pgrst, 'reload schema';

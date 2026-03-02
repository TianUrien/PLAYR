-- ============================================================================
-- Migration: Brand Followers System
-- Date: 2026-03-02
-- Description: Adds follower system for brands.
--   1. brand_followers table with unique constraint
--   2. follower_count column on brands (denormalized)
--   3. follow_brand / unfollow_brand RPCs
--   4. get_brand_followers RPC (for dashboard)
--   5. check_brand_follow_status RPC (for profile page button)
--   6. RLS policies
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. Create brand_followers table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.brand_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, follower_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_followers_brand ON public.brand_followers(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_followers_follower ON public.brand_followers(follower_id);

-- ============================================================================
-- 2. Add follower_count to brands (denormalized for fast reads)
-- ============================================================================

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS follower_count INT NOT NULL DEFAULT 0;

-- ============================================================================
-- 3. RLS policies
-- ============================================================================

ALTER TABLE public.brand_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_followers_select ON public.brand_followers
  FOR SELECT USING (true);

CREATE POLICY brand_followers_insert ON public.brand_followers
  FOR INSERT WITH CHECK (follower_id = auth.uid());

CREATE POLICY brand_followers_delete ON public.brand_followers
  FOR DELETE USING (follower_id = auth.uid());

-- ============================================================================
-- 4. RPC: follow_brand
-- ============================================================================

CREATE OR REPLACE FUNCTION public.follow_brand(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_role TEXT;
  v_brand_profile_id UUID;
  v_inserted BOOLEAN;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Brands cannot follow other brands
  SELECT role INTO v_user_role FROM profiles WHERE id = v_user_id;
  IF v_user_role = 'brand' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brands cannot follow other brands');
  END IF;

  -- Check brand exists
  SELECT profile_id INTO v_brand_profile_id
  FROM brands WHERE id = p_brand_id AND deleted_at IS NULL;

  IF v_brand_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  -- Prevent self-follow (brand owner)
  IF v_brand_profile_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot follow your own brand');
  END IF;

  -- Insert follow (idempotent)
  INSERT INTO brand_followers (brand_id, follower_id)
  VALUES (p_brand_id, v_user_id)
  ON CONFLICT (brand_id, follower_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT > 0;

  -- Only increment if actually inserted a new row
  IF FOUND AND (SELECT COUNT(*) FROM brand_followers WHERE brand_id = p_brand_id AND follower_id = v_user_id) = 1 THEN
    UPDATE brands SET follower_count = follower_count + 1 WHERE id = p_brand_id;
  END IF;

  SELECT follower_count INTO v_new_count FROM brands WHERE id = p_brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'followed', true,
    'follower_count', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.follow_brand(UUID) TO authenticated;

-- ============================================================================
-- 5. RPC: unfollow_brand
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unfollow_brand(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted_count INT;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  DELETE FROM brand_followers
  WHERE brand_id = p_brand_id AND follower_id = v_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Only decrement if actually deleted a row
  IF v_deleted_count > 0 THEN
    UPDATE brands SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = p_brand_id;
  END IF;

  SELECT follower_count INTO v_new_count FROM brands WHERE id = p_brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'followed', false,
    'follower_count', COALESCE(v_new_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unfollow_brand(UUID) TO authenticated;

-- ============================================================================
-- 6. RPC: get_brand_followers (for dashboard)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_brand_followers(
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
  v_followers JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM brand_followers WHERE brand_id = p_brand_id;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY followed_at DESC), '[]'::jsonb)
  INTO v_followers
  FROM (
    SELECT
      jsonb_build_object(
        'profile_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'role', p.role,
        'followed_at', bf.created_at
      ) AS row_data,
      bf.created_at AS followed_at
    FROM brand_followers bf
    JOIN profiles p ON p.id = bf.follower_id
    WHERE bf.brand_id = p_brand_id
    ORDER BY bf.created_at DESC
    LIMIT LEAST(p_limit, 50)
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'followers', v_followers,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_followers(UUID, INT, INT) TO authenticated;

-- ============================================================================
-- 7. RPC: check_brand_follow_status (for profile page button)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_brand_follow_status(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_following BOOLEAN;
  v_follower_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_following', false, 'follower_count', 0);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM brand_followers WHERE brand_id = p_brand_id AND follower_id = v_user_id
  ) INTO v_is_following;

  SELECT COALESCE(follower_count, 0) INTO v_follower_count
  FROM brands WHERE id = p_brand_id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'is_following', COALESCE(v_is_following, false),
    'follower_count', COALESCE(v_follower_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_brand_follow_status(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

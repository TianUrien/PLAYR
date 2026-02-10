-- ============================================================================
-- Migration: Rate Limit User Post Creation
-- Date: 2026-02-10
-- Description: Adds rate limiting to create_user_post() RPC using the existing
--   database-backed check_rate_limit() infrastructure (202601273000).
--   Limit: 10 posts per hour per user.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. CONVENIENCE WRAPPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_user_post_rate_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.check_rate_limit(p_user_id::TEXT, 'create_post', 10, 3600);
$$;

GRANT EXECUTE ON FUNCTION public.check_user_post_rate_limit TO authenticated;

COMMENT ON FUNCTION public.check_user_post_rate_limit IS 'Rate limit: 10 user posts per hour per user';

-- ============================================================================
-- 2. UPDATE create_user_post() TO ENFORCE RATE LIMIT
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
  v_rate_check JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Rate limit: 10 posts per hour
  v_rate_check := public.check_rate_limit(v_user_id::TEXT, 'create_post', 10, 3600);
  IF NOT (v_rate_check ->> 'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rate limit exceeded: maximum 10 posts per hour',
      'remaining', (v_rate_check ->> 'remaining')::INT,
      'reset_at', v_rate_check ->> 'reset_at'
    );
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

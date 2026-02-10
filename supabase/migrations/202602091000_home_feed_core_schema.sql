-- ============================================================================
-- HOME FEED CORE SCHEMA
-- ============================================================================
-- Creates the foundation for the Home feed feature:
--   1. home_feed_items table (persisted feed items with denormalized metadata)
--   2. profile_milestones table (tracks achieved milestones for idempotency)
--   3. Indexes for performance
--   4. RLS policies
--   5. Helper function for milestone tracking
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. CREATE home_feed_items TABLE
-- ============================================================================

CREATE TABLE public.home_feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type and source tracking
  item_type TEXT NOT NULL CHECK (item_type IN (
    'member_joined',
    'opportunity_posted',
    'milestone_achieved',
    'reference_received',
    'brand_post',
    'brand_product'
  )),

  -- Polymorphic source reference
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'profile',
    'vacancy',
    'profile_reference',
    'brand_post',
    'brand_product',
    'milestone'
  )),

  -- Denormalized data for performance (avoids joins on every feed query)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Soft delete for moderation
  deleted_at TIMESTAMPTZ,

  -- Unique constraint prevents duplicate feed items
  CONSTRAINT home_feed_items_source_unique UNIQUE (item_type, source_id)
);

COMMENT ON TABLE public.home_feed_items IS 'Persisted feed items for the Home feed, auto-generated from user/brand activity';
COMMENT ON COLUMN public.home_feed_items.metadata IS 'Denormalized JSON containing all data needed to render the feed card without additional queries';

-- ============================================================================
-- 2. CREATE profile_milestones TABLE
-- ============================================================================

CREATE TABLE public.profile_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN (
    'first_video',
    'first_gallery_image',
    'profile_100_percent',
    'first_reference_received'
  )),
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Unique constraint ensures one-time firing per milestone
  CONSTRAINT profile_milestones_unique UNIQUE (profile_id, milestone_type)
);

COMMENT ON TABLE public.profile_milestones IS 'Tracks achieved milestones to prevent duplicate feed items';

-- ============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary index for chronological feed queries (most common)
CREATE INDEX idx_home_feed_items_created_at
  ON public.home_feed_items (created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for filtered queries by item type
CREATE INDEX idx_home_feed_items_item_type
  ON public.home_feed_items (item_type, created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for source lookups (e.g., finding feed items for a specific profile/vacancy)
CREATE INDEX idx_home_feed_items_source
  ON public.home_feed_items (source_type, source_id);

-- Index for milestone lookups
CREATE INDEX idx_profile_milestones_profile_id
  ON public.profile_milestones (profile_id);

-- ============================================================================
-- 4. ENABLE RLS AND CREATE POLICIES
-- ============================================================================

-- Enable RLS on home_feed_items
ALTER TABLE public.home_feed_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read non-deleted feed items
CREATE POLICY "home_feed_items_select_authenticated"
  ON public.home_feed_items FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Only system/triggers can insert (users cannot manually create feed items)
CREATE POLICY "home_feed_items_insert_system"
  ON public.home_feed_items FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Only admins can soft-delete (for moderation)
CREATE POLICY "home_feed_items_update_admin"
  ON public.home_feed_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'is_admin' = 'true'
    )
  );

-- Enable RLS on profile_milestones
ALTER TABLE public.profile_milestones ENABLE ROW LEVEL SECURITY;

-- Users can view their own milestones
CREATE POLICY "profile_milestones_select_own"
  ON public.profile_milestones FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Only system/triggers can insert milestones
CREATE POLICY "profile_milestones_insert_system"
  ON public.profile_milestones FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Grant permissions
GRANT SELECT ON public.home_feed_items TO authenticated;
GRANT SELECT ON public.profile_milestones TO authenticated;

-- ============================================================================
-- 5. HELPER FUNCTION FOR MILESTONE TRACKING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_milestone(
  p_profile_id UUID,
  p_milestone_type TEXT,
  p_metadata JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_exists BOOLEAN;
BEGIN
  -- Check if milestone already recorded
  SELECT EXISTS(
    SELECT 1 FROM profile_milestones
    WHERE profile_id = p_profile_id
      AND milestone_type = p_milestone_type
  ) INTO v_already_exists;

  IF v_already_exists THEN
    RETURN FALSE;
  END IF;

  -- Record milestone
  INSERT INTO profile_milestones (profile_id, milestone_type)
  VALUES (p_profile_id, p_milestone_type);

  -- Create feed item
  INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
  VALUES (
    'milestone_achieved',
    gen_random_uuid(), -- Generate unique ID for milestone since it's not a real entity
    'milestone',
    p_metadata || jsonb_build_object('milestone_type', p_milestone_type)
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.record_milestone IS 'Records a profile milestone and creates a feed item if not already achieved';

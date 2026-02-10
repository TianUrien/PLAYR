-- ============================================================================
-- HOME FEED TRIGGERS
-- ============================================================================
-- Creates 8 trigger functions that auto-generate home_feed_items:
--   1. Member joined (profiles UPDATE: onboarding_completed → true)
--   2. Opportunity posted (opportunities UPDATE: status → 'open')
--   3. Reference received (profile_references UPDATE: status → 'accepted')
--   4. First video milestone (profiles UPDATE: highlight_video_url NULL → value)
--   5. First gallery image milestone (gallery_photos INSERT: COUNT = 1)
--   6. Profile completion milestone (profiles UPDATE: all key fields filled)
--   7. Brand post published (brand_posts INSERT)
--   8. Brand product published (brand_products INSERT)
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. MEMBER JOINED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_member_joined_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when onboarding_completed transitions from false to true
  IF NEW.onboarding_completed = true
     AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = false)
     AND (NEW.is_test_account IS NULL OR NEW.is_test_account = false)
     AND NEW.role IN ('player', 'coach', 'club') THEN

    INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
    VALUES (
      'member_joined',
      NEW.id,
      'profile',
      jsonb_build_object(
        'profile_id', NEW.id,
        'full_name', NEW.full_name,
        'role', NEW.role,
        'avatar_url', NEW.avatar_url,
        'nationality_country_id', NEW.nationality_country_id,
        'base_location', NEW.base_location,
        'position', NEW.position,
        'current_club', NEW.current_club
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_member_joined_feed ON public.profiles;
CREATE TRIGGER trigger_member_joined_feed
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_member_joined_feed_item();

-- ============================================================================
-- 2. OPPORTUNITY POSTED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_opportunity_posted_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_profile RECORD;
BEGIN
  -- Only fire when status transitions to 'open'
  IF NEW.status = 'open'
     AND (OLD.status IS NULL OR OLD.status::text != 'open') THEN

    -- Fetch club profile data
    SELECT
      p.id,
      p.full_name,
      p.avatar_url,
      p.is_test_account
    INTO v_club_profile
    FROM profiles p
    WHERE p.id = NEW.club_id;

    -- Skip if club is a test account
    IF v_club_profile.is_test_account = true THEN
      RETURN NEW;
    END IF;

    INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
    VALUES (
      'opportunity_posted',
      NEW.id,
      'vacancy',
      jsonb_build_object(
        'vacancy_id', NEW.id,
        'title', NEW.title,
        'opportunity_type', NEW.opportunity_type,
        'position', NEW.position,
        'gender', NEW.gender,
        'location_city', NEW.location_city,
        'location_country', NEW.location_country,
        'club_id', NEW.club_id,
        'club_name', v_club_profile.full_name,
        'club_logo', v_club_profile.avatar_url,
        'priority', NEW.priority,
        'start_date', NEW.start_date
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_opportunity_posted_feed ON public.opportunities;
CREATE TRIGGER trigger_opportunity_posted_feed
  AFTER UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_opportunity_posted_feed_item();

-- ============================================================================
-- 3. REFERENCE RECEIVED (accepted)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_reference_received_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_profile RECORD;
  v_referee_profile RECORD;
BEGIN
  -- Only fire when status transitions to 'accepted'
  IF NEW.status = 'accepted'
     AND (OLD.status IS NULL OR OLD.status::text != 'accepted') THEN

    -- Fetch requester profile (person who asked for the reference)
    SELECT id, full_name, avatar_url, role, is_test_account
    INTO v_requester_profile
    FROM profiles
    WHERE id = NEW.requester_id;

    -- Skip if requester is a test account
    IF v_requester_profile.is_test_account = true THEN
      RETURN NEW;
    END IF;

    -- Fetch referee profile (person giving the reference)
    SELECT id, full_name, avatar_url, role
    INTO v_referee_profile
    FROM profiles
    WHERE id = NEW.reference_id;

    INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
    VALUES (
      'reference_received',
      NEW.id,
      'profile_reference',
      jsonb_build_object(
        'reference_record_id', NEW.id,
        'profile_id', NEW.requester_id,
        'full_name', v_requester_profile.full_name,
        'avatar_url', v_requester_profile.avatar_url,
        'role', v_requester_profile.role,
        'referee_id', NEW.reference_id,
        'referee_name', v_referee_profile.full_name,
        'referee_avatar', v_referee_profile.avatar_url,
        'referee_role', v_referee_profile.role,
        'relationship_type', NEW.relationship_type,
        'endorsement_text', NEW.endorsement_text
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reference_received_feed ON public.profile_references;
CREATE TRIGGER trigger_reference_received_feed
  AFTER UPDATE ON public.profile_references
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_reference_received_feed_item();

-- ============================================================================
-- 4. FIRST VIDEO MILESTONE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_first_video_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire when highlight_video_url changes from NULL/empty to a value
  IF NEW.highlight_video_url IS NOT NULL
     AND NEW.highlight_video_url != ''
     AND (OLD.highlight_video_url IS NULL OR OLD.highlight_video_url = '')
     AND (NEW.is_test_account IS NULL OR NEW.is_test_account = false) THEN

    PERFORM record_milestone(
      NEW.id,
      'first_video',
      jsonb_build_object(
        'profile_id', NEW.id,
        'full_name', NEW.full_name,
        'avatar_url', NEW.avatar_url,
        'role', NEW.role,
        'video_url', NEW.highlight_video_url
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_first_video_milestone ON public.profiles;
CREATE TRIGGER trigger_first_video_milestone
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_first_video_milestone();

-- ============================================================================
-- 5. FIRST GALLERY IMAGE MILESTONE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_first_gallery_image_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_count INTEGER;
  v_profile RECORD;
BEGIN
  -- Count gallery images for this user
  SELECT COUNT(*) INTO v_image_count
  FROM gallery_photos
  WHERE user_id = NEW.user_id;

  -- Only fire on first image
  IF v_image_count = 1 THEN
    SELECT id, full_name, avatar_url, role, is_test_account
    INTO v_profile
    FROM profiles
    WHERE id = NEW.user_id;

    -- Skip test accounts
    IF v_profile.is_test_account = true THEN
      RETURN NEW;
    END IF;

    PERFORM record_milestone(
      NEW.user_id,
      'first_gallery_image',
      jsonb_build_object(
        'profile_id', v_profile.id,
        'full_name', v_profile.full_name,
        'avatar_url', v_profile.avatar_url,
        'role', v_profile.role,
        'image_url', NEW.photo_url
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_first_gallery_image_milestone ON public.gallery_photos;
CREATE TRIGGER trigger_first_gallery_image_milestone
  AFTER INSERT ON public.gallery_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.check_first_gallery_image_milestone();

-- ============================================================================
-- 6. PROFILE 100% COMPLETION MILESTONE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_profile_completion_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_complete BOOLEAN := false;
BEGIN
  -- Skip test accounts
  IF NEW.is_test_account = true THEN
    RETURN NEW;
  END IF;

  -- Only check when onboarding is completed
  IF NEW.onboarding_completed = true THEN
    -- Check if all key fields are filled based on role
    IF NEW.role IN ('player', 'coach') THEN
      v_is_complete := (
        NEW.full_name IS NOT NULL AND NEW.full_name != '' AND
        NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' AND
        NEW.bio IS NOT NULL AND NEW.bio != '' AND
        NEW.nationality_country_id IS NOT NULL AND
        NEW.highlight_video_url IS NOT NULL AND NEW.highlight_video_url != ''
      );
    ELSIF NEW.role = 'club' THEN
      v_is_complete := (
        NEW.full_name IS NOT NULL AND NEW.full_name != '' AND
        NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' AND
        NEW.club_bio IS NOT NULL AND NEW.club_bio != '' AND
        NEW.base_location IS NOT NULL AND NEW.base_location != ''
      );
    END IF;

    IF v_is_complete THEN
      PERFORM record_milestone(
        NEW.id,
        'profile_100_percent',
        jsonb_build_object(
          'profile_id', NEW.id,
          'full_name', NEW.full_name,
          'avatar_url', NEW.avatar_url,
          'role', NEW.role
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_profile_completion_milestone ON public.profiles;
CREATE TRIGGER trigger_profile_completion_milestone
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_completion_milestone();

-- ============================================================================
-- 7. BRAND POST PUBLISHED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_brand_post_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  -- Fetch brand data with owner test account status
  SELECT
    b.id,
    b.name,
    b.slug,
    b.logo_url,
    b.category,
    b.is_verified,
    b.deleted_at,
    p.is_test_account
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  -- Skip if brand is deleted or owner is test account
  IF v_brand.deleted_at IS NOT NULL OR v_brand.is_test_account = true THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
  VALUES (
    'brand_post',
    NEW.id,
    'brand_post',
    jsonb_build_object(
      'brand_id', v_brand.id,
      'brand_name', v_brand.name,
      'brand_slug', v_brand.slug,
      'brand_logo_url', v_brand.logo_url,
      'brand_category', v_brand.category,
      'brand_is_verified', v_brand.is_verified,
      'post_id', NEW.id,
      'post_content', NEW.content,
      'post_image_url', NEW.image_url
    )
  )
  ON CONFLICT (item_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_brand_post_feed ON public.brand_posts;
CREATE TRIGGER trigger_brand_post_feed
  AFTER INSERT ON public.brand_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_brand_post_feed_item();

-- ============================================================================
-- 8. BRAND PRODUCT PUBLISHED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_brand_product_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  -- Fetch brand data with owner test account status
  SELECT
    b.id,
    b.name,
    b.slug,
    b.logo_url,
    b.category,
    b.is_verified,
    b.deleted_at,
    p.is_test_account
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  -- Skip if brand is deleted or owner is test account
  IF v_brand.deleted_at IS NOT NULL OR v_brand.is_test_account = true THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
  VALUES (
    'brand_product',
    NEW.id,
    'brand_product',
    jsonb_build_object(
      'brand_id', v_brand.id,
      'brand_name', v_brand.name,
      'brand_slug', v_brand.slug,
      'brand_logo_url', v_brand.logo_url,
      'brand_category', v_brand.category,
      'brand_is_verified', v_brand.is_verified,
      'product_id', NEW.id,
      'product_name', NEW.name,
      'product_description', NEW.description,
      'product_images', NEW.images,
      'product_external_url', NEW.external_url
    )
  )
  ON CONFLICT (item_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_brand_product_feed ON public.brand_products;
CREATE TRIGGER trigger_brand_product_feed
  AFTER INSERT ON public.brand_products
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_brand_product_feed_item();

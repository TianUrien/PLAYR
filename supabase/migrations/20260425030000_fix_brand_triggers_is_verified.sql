-- ============================================================================
-- Hotfix: brand triggers reference dropped column brands.is_verified
-- ============================================================================
-- 20260425010000_home_feed_author_filters introduced new versions of
-- generate_brand_post_feed_item and generate_brand_product_feed_item that
-- SELECT b.is_verified from the brands table. But brands.is_verified was
-- dropped on 20260420235035_unify_brand_verified_to_profile (verification
-- was unified onto profiles.is_verified).
--
-- plpgsql doesn't validate column references at function-creation time, so
-- the migration applied without error. The runtime failure happens on the
-- next brand_post or brand_product INSERT when the trigger fires:
--
--   ERROR: column b.is_verified does not exist
--
-- Re-create both functions reading is_verified from the joined profile
-- (matching the pattern established by 20260420235035 for the rest of the
-- brand RPCs). The original migration source was also patched in-place so
-- fresh deploys get the corrected version directly.

CREATE OR REPLACE FUNCTION public.generate_brand_post_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  SELECT
    b.id, b.name, b.slug, b.logo_url, b.category, b.deleted_at,
    p.id AS profile_id, p.role, p.nationality_country_id, p.is_test_account,
    COALESCE(p.is_verified, false) AS is_verified
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  IF v_brand.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (
    item_type, source_id, source_type, is_test_account,
    author_profile_id, author_role, author_country_id,
    metadata
  )
  VALUES (
    'brand_post',
    NEW.id,
    'brand_post',
    COALESCE(v_brand.is_test_account, false),
    v_brand.profile_id,
    v_brand.role,
    v_brand.nationality_country_id,
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

CREATE OR REPLACE FUNCTION public.generate_brand_product_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  SELECT
    b.id, b.name, b.slug, b.logo_url, b.category, b.deleted_at,
    p.id AS profile_id, p.role, p.nationality_country_id, p.is_test_account,
    COALESCE(p.is_verified, false) AS is_verified
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  IF v_brand.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (
    item_type, source_id, source_type, is_test_account,
    author_profile_id, author_role, author_country_id,
    metadata
  )
  VALUES (
    'brand_product',
    NEW.id,
    'brand_product',
    COALESCE(v_brand.is_test_account, false),
    v_brand.profile_id,
    v_brand.role,
    v_brand.nationality_country_id,
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

-- Belt-and-suspenders: explicit GRANT on the new 5-arg get_home_feed signature.
-- CREATE OR REPLACE in 20260425010000 created a NEW signature (5-arg vs the
-- old 3-arg), and CREATE OR REPLACE only inherits grants when the signature
-- matches. Postgres' default PUBLIC EXECUTE keeps it working today, but a
-- future explicit REVOKE EXECUTE ... FROM PUBLIC would silently break the feed.
GRANT EXECUTE ON FUNCTION public.get_home_feed(INTEGER, INTEGER, TEXT, INTEGER[], TEXT[]) TO authenticated;

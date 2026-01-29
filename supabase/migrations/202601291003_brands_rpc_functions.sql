-- ============================================================================
-- Migration: RPC functions for brands
-- ============================================================================

SET search_path = public;

BEGIN;

-- ============================================================================
-- get_brands: List brands with optional filters
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

  -- Get brands
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
      br.created_at
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

COMMENT ON FUNCTION public.get_brands IS 'List brands with optional category and search filters';
GRANT EXECUTE ON FUNCTION public.get_brands TO anon, authenticated;

-- ============================================================================
-- get_brand_by_slug: Get a single brand by slug
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_brand_by_slug(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT row_to_json(b)
    FROM (
      SELECT
        br.id,
        br.profile_id,
        br.slug,
        br.name,
        br.logo_url,
        br.cover_url,
        br.bio,
        br.website_url,
        br.instagram_url,
        br.category,
        br.is_verified,
        br.created_at,
        br.updated_at
      FROM public.brands br
      WHERE br.slug = p_slug
        AND br.deleted_at IS NULL
    ) b
  );
END;
$$;

COMMENT ON FUNCTION public.get_brand_by_slug IS 'Get a single brand by its URL slug';
GRANT EXECUTE ON FUNCTION public.get_brand_by_slug TO anon, authenticated;

-- ============================================================================
-- get_my_brand: Get the current user's brand
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_brand()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT row_to_json(b)
    FROM (
      SELECT
        br.id,
        br.profile_id,
        br.slug,
        br.name,
        br.logo_url,
        br.cover_url,
        br.bio,
        br.website_url,
        br.instagram_url,
        br.category,
        br.is_verified,
        br.created_at,
        br.updated_at
      FROM public.brands br
      WHERE br.profile_id = auth.uid()
        AND br.deleted_at IS NULL
    ) b
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_brand IS 'Get the current authenticated user brand profile';
GRANT EXECUTE ON FUNCTION public.get_my_brand TO authenticated;

-- ============================================================================
-- create_brand: Create a new brand profile
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_brand(
  p_name TEXT,
  p_slug TEXT,
  p_category TEXT,
  p_bio TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_instagram_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_profile_role TEXT;
  v_brand_id UUID;
  v_clean_slug TEXT;
BEGIN
  -- Get caller's profile
  SELECT id, role INTO v_profile_id, v_profile_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Verify role is brand
  IF v_profile_role != 'brand' THEN
    RAISE EXCEPTION 'Only brand accounts can create a brand profile';
  END IF;

  -- Check if brand already exists for this profile
  IF EXISTS (SELECT 1 FROM public.brands WHERE profile_id = v_profile_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Brand already exists for this account';
  END IF;

  -- Clean and validate slug
  v_clean_slug := lower(trim(p_slug));

  IF v_clean_slug IS NULL OR v_clean_slug = '' THEN
    RAISE EXCEPTION 'Slug is required';
  END IF;

  IF NOT (v_clean_slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR v_clean_slug ~ '^[a-z0-9]$') THEN
    RAISE EXCEPTION 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.';
  END IF;

  -- Check slug uniqueness
  IF EXISTS (SELECT 1 FROM public.brands WHERE slug = v_clean_slug) THEN
    RAISE EXCEPTION 'Brand slug already taken';
  END IF;

  -- Validate category
  IF p_category NOT IN ('equipment', 'apparel', 'accessories', 'nutrition', 'services', 'technology', 'other') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Create brand
  INSERT INTO public.brands (
    profile_id,
    name,
    slug,
    category,
    bio,
    logo_url,
    website_url,
    instagram_url
  )
  VALUES (
    v_profile_id,
    trim(p_name),
    v_clean_slug,
    p_category,
    nullif(trim(p_bio), ''),
    nullif(trim(p_logo_url), ''),
    nullif(trim(p_website_url), ''),
    nullif(trim(p_instagram_url), '')
  )
  RETURNING id INTO v_brand_id;

  RETURN json_build_object(
    'success', true,
    'brand_id', v_brand_id,
    'slug', v_clean_slug
  );
END;
$$;

COMMENT ON FUNCTION public.create_brand IS 'Create a new brand profile for the authenticated user';
GRANT EXECUTE ON FUNCTION public.create_brand TO authenticated;

-- ============================================================================
-- update_brand: Update the current user's brand
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_brand(
  p_name TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_instagram_url TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
BEGIN
  -- Get caller's brand
  SELECT id INTO v_brand_id
  FROM public.brands
  WHERE profile_id = auth.uid()
    AND deleted_at IS NULL;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;

  -- Validate category if provided
  IF p_category IS NOT NULL AND p_category NOT IN ('equipment', 'apparel', 'accessories', 'nutrition', 'services', 'technology', 'other') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Update only provided fields
  UPDATE public.brands
  SET
    name = COALESCE(nullif(trim(p_name), ''), name),
    bio = CASE WHEN p_bio IS NOT NULL THEN nullif(trim(p_bio), '') ELSE bio END,
    logo_url = CASE WHEN p_logo_url IS NOT NULL THEN nullif(trim(p_logo_url), '') ELSE logo_url END,
    cover_url = CASE WHEN p_cover_url IS NOT NULL THEN nullif(trim(p_cover_url), '') ELSE cover_url END,
    website_url = CASE WHEN p_website_url IS NOT NULL THEN nullif(trim(p_website_url), '') ELSE website_url END,
    instagram_url = CASE WHEN p_instagram_url IS NOT NULL THEN nullif(trim(p_instagram_url), '') ELSE instagram_url END,
    category = COALESCE(p_category, category)
  WHERE id = v_brand_id;

  RETURN json_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.update_brand IS 'Update the authenticated user brand profile';
GRANT EXECUTE ON FUNCTION public.update_brand TO authenticated;

-- ============================================================================
-- Helper: Generate slug from name
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_brand_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_slug TEXT;
  v_slug TEXT;
  v_counter INT := 0;
BEGIN
  -- Convert to lowercase and replace spaces/special chars with hyphens
  v_base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));

  -- Remove leading/trailing hyphens
  v_base_slug := trim(both '-' from v_base_slug);

  -- Ensure not empty
  IF v_base_slug = '' THEN
    v_base_slug := 'brand';
  END IF;

  v_slug := v_base_slug;

  -- Check for uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM public.brands WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  RETURN v_slug;
END;
$$;

COMMENT ON FUNCTION public.generate_brand_slug IS 'Generate a unique URL slug from a brand name';
GRANT EXECUTE ON FUNCTION public.generate_brand_slug TO authenticated;

COMMIT;

-- ============================================================================
-- Brand Posts & Global Brand Feed
--
-- Adds:
--   1. brand_posts table (announcements / content from brands)
--   2. RLS policies for brand_posts
--   3. CRUD RPCs for brand_posts
--   4. get_brand_feed RPC (unified feed: products + posts, ordered by date)
--   5. Storage bucket for brand-post images
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. brand_posts table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  image_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT brand_posts_content_not_empty CHECK (char_length(trim(content)) > 0),
  CONSTRAINT brand_posts_content_max       CHECK (char_length(content) <= 1000)
);

COMMENT ON TABLE public.brand_posts IS 'Announcements and content posts published by brands.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brand_posts_brand_id   ON public.brand_posts (brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_posts_created_at ON public.brand_posts (created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_brand_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_brand_posts_updated_at ON public.brand_posts;
CREATE TRIGGER set_brand_posts_updated_at
  BEFORE UPDATE ON public.brand_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_brand_posts_updated_at();

-- --------------------------------------------------------------------------
-- 2. RLS for brand_posts
-- --------------------------------------------------------------------------
ALTER TABLE public.brand_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-deleted posts
CREATE POLICY "brand_posts_select_all"
  ON public.brand_posts FOR SELECT
  USING (deleted_at IS NULL);

-- Brand owner can insert
CREATE POLICY "brand_posts_insert_owner"
  ON public.brand_posts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = brand_id
        AND brands.profile_id = auth.uid()
        AND brands.deleted_at IS NULL
    )
  );

-- Brand owner can update (soft delete)
CREATE POLICY "brand_posts_update_owner"
  ON public.brand_posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = brand_posts.brand_id
        AND brands.profile_id = auth.uid()
        AND brands.deleted_at IS NULL
    )
  );

-- No hard deletes
CREATE POLICY "brand_posts_no_delete"
  ON public.brand_posts FOR DELETE
  USING (false);

GRANT SELECT ON public.brand_posts TO anon, authenticated;
GRANT INSERT, UPDATE ON public.brand_posts TO authenticated;

-- --------------------------------------------------------------------------
-- 3. CRUD RPCs for brand_posts
-- --------------------------------------------------------------------------

-- 3a. Get posts for a specific brand
CREATE OR REPLACE FUNCTION public.get_brand_posts(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      bp.id,
      bp.brand_id,
      bp.content,
      bp.image_url,
      bp.created_at,
      bp.updated_at
    FROM brand_posts bp
    WHERE bp.brand_id = p_brand_id
      AND bp.deleted_at IS NULL
    ORDER BY bp.created_at DESC
  ) p;

  RETURN v_result;
END;
$$;

-- 3b. Create a brand post
CREATE OR REPLACE FUNCTION public.create_brand_post(
  p_brand_id   UUID,
  p_content    TEXT,
  p_image_url  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
  v_post_id UUID;
BEGIN
  -- Verify ownership
  SELECT id INTO v_brand
  FROM brands
  WHERE id = p_brand_id
    AND profile_id = auth.uid()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found or not owned by current user');
  END IF;

  -- Validate content
  IF trim(p_content) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Content cannot be empty');
  END IF;

  IF char_length(p_content) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Content exceeds 1000 character limit');
  END IF;

  -- Insert
  INSERT INTO brand_posts (brand_id, content, image_url)
  VALUES (p_brand_id, trim(p_content), p_image_url)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

-- 3c. Update a brand post
CREATE OR REPLACE FUNCTION public.update_brand_post(
  p_post_id    UUID,
  p_content    TEXT DEFAULT NULL,
  p_image_url  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post RECORD;
BEGIN
  -- Verify ownership via brand
  SELECT bp.id, bp.brand_id INTO v_post
  FROM brand_posts bp
  JOIN brands b ON b.id = bp.brand_id
  WHERE bp.id = p_post_id
    AND b.profile_id = auth.uid()
    AND bp.deleted_at IS NULL
    AND b.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found or not owned by current user');
  END IF;

  UPDATE brand_posts
  SET
    content   = COALESCE(NULLIF(trim(p_content), ''), content),
    image_url = CASE WHEN p_image_url IS NOT NULL THEN p_image_url ELSE image_url END
  WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3d. Soft-delete a brand post
CREATE OR REPLACE FUNCTION public.delete_brand_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post RECORD;
BEGIN
  SELECT bp.id INTO v_post
  FROM brand_posts bp
  JOIN brands b ON b.id = bp.brand_id
  WHERE bp.id = p_post_id
    AND b.profile_id = auth.uid()
    AND bp.deleted_at IS NULL
    AND b.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found or not owned by current user');
  END IF;

  UPDATE brand_posts SET deleted_at = now() WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- --------------------------------------------------------------------------
-- 4. Unified Brand Feed RPC (products + posts)
-- --------------------------------------------------------------------------
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
BEGIN
  -- Count total feed items
  SELECT
    (SELECT count(*) FROM brand_products bp JOIN brands b ON b.id = bp.brand_id WHERE bp.deleted_at IS NULL AND b.deleted_at IS NULL)
    +
    (SELECT count(*) FROM brand_posts bpo JOIN brands b ON b.id = bpo.brand_id WHERE bpo.deleted_at IS NULL AND b.deleted_at IS NULL)
  INTO v_total;

  -- Fetch unified feed
  SELECT COALESCE(jsonb_agg(item ORDER BY item_date DESC), '[]'::jsonb)
  INTO v_items
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
  ) feed
  ORDER BY item_date DESC
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

-- --------------------------------------------------------------------------
-- 5. Storage bucket for brand-post images
-- --------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-posts', 'brand-posts', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "brand_posts_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-posts');

-- Authenticated users can upload to their own folder
CREATE POLICY "brand_posts_images_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-posts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own files
CREATE POLICY "brand_posts_images_auth_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'brand-posts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own files
CREATE POLICY "brand_posts_images_auth_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-posts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

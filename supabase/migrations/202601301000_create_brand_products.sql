-- Brand Products: table, indexes, trigger, RLS, RPCs, storage bucket
-- Allows brands to showcase products/services as visual cards

SET search_path = public;
BEGIN;

-- ============================================================
-- TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brand_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  external_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT brand_products_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT brand_products_description_max CHECK (description IS NULL OR char_length(description) <= 300),
  CONSTRAINT brand_products_images_is_array CHECK (jsonb_typeof(images) = 'array')
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_brand_products_brand_id
  ON public.brand_products(brand_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_brand_products_sort_order
  ON public.brand_products(brand_id, sort_order)
  WHERE deleted_at IS NULL;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_brand_products_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_brand_products_updated_at ON public.brand_products;
CREATE TRIGGER set_brand_products_updated_at
  BEFORE UPDATE ON public.brand_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_brand_products_updated_at();

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.brand_products ENABLE ROW LEVEL SECURITY;

-- Public read (non-deleted only)
CREATE POLICY "Brand products are publicly readable"
  ON public.brand_products
  FOR SELECT
  USING (deleted_at IS NULL);

-- Brand owner can create products
CREATE POLICY "Brand owners can create products"
  ON public.brand_products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = brand_products.brand_id
        AND brands.profile_id = auth.uid()
        AND brands.deleted_at IS NULL
    )
  );

-- Brand owner can update their products
CREATE POLICY "Brand owners can update their products"
  ON public.brand_products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = brand_products.brand_id
        AND brands.profile_id = auth.uid()
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = brand_products.brand_id
        AND brands.profile_id = auth.uid()
        AND brands.deleted_at IS NULL
    )
  );

-- No hard deletes (soft delete via UPDATE to set deleted_at)
CREATE POLICY "No hard deletes on brand products"
  ON public.brand_products
  FOR DELETE
  USING (false);

GRANT SELECT ON public.brand_products TO anon, authenticated;
GRANT INSERT, UPDATE ON public.brand_products TO authenticated;

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- get_brand_products: Returns all non-deleted products for a brand
CREATE OR REPLACE FUNCTION public.get_brand_products(p_brand_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT json_agg(row_to_json(p) ORDER BY p.sort_order ASC, p.created_at DESC)
     FROM (
       SELECT id, brand_id, name, description, images, external_url,
              sort_order, created_at, updated_at
       FROM public.brand_products
       WHERE brand_id = p_brand_id
         AND deleted_at IS NULL
     ) p),
    '[]'::json
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_brand_products TO anon, authenticated;

-- create_brand_product: Creates a new product for the caller's brand
CREATE OR REPLACE FUNCTION public.create_brand_product(
  p_brand_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_images JSONB DEFAULT '[]'::jsonb,
  p_external_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_next_sort INTEGER;
BEGIN
  -- Verify caller owns this brand
  IF NOT EXISTS (
    SELECT 1 FROM public.brands
    WHERE id = p_brand_id
      AND profile_id = auth.uid()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Brand not found or not owned by current user';
  END IF;

  -- Calculate next sort order
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort
  FROM public.brand_products
  WHERE brand_id = p_brand_id AND deleted_at IS NULL;

  INSERT INTO public.brand_products (brand_id, name, description, images, external_url, sort_order)
  VALUES (
    p_brand_id,
    trim(p_name),
    nullif(trim(p_description), ''),
    p_images,
    nullif(trim(p_external_url), '')
  )
  RETURNING id INTO v_product_id;

  RETURN json_build_object('success', true, 'product_id', v_product_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_brand_product TO authenticated;

-- update_brand_product: Updates an existing product
CREATE OR REPLACE FUNCTION public.update_brand_product(
  p_product_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_images JSONB DEFAULT NULL,
  p_external_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller owns the brand that owns this product
  IF NOT EXISTS (
    SELECT 1 FROM public.brand_products bp
    JOIN public.brands b ON b.id = bp.brand_id
    WHERE bp.id = p_product_id
      AND b.profile_id = auth.uid()
      AND bp.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Product not found or not owned by current user';
  END IF;

  UPDATE public.brand_products
  SET
    name = COALESCE(nullif(trim(p_name), ''), name),
    description = CASE WHEN p_description IS NOT NULL THEN nullif(trim(p_description), '') ELSE description END,
    images = COALESCE(p_images, images),
    external_url = CASE WHEN p_external_url IS NOT NULL THEN nullif(trim(p_external_url), '') ELSE external_url END
  WHERE id = p_product_id;

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_brand_product TO authenticated;

-- delete_brand_product: Soft-deletes a product
CREATE OR REPLACE FUNCTION public.delete_brand_product(p_product_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller owns the brand that owns this product
  IF NOT EXISTS (
    SELECT 1 FROM public.brand_products bp
    JOIN public.brands b ON b.id = bp.brand_id
    WHERE bp.id = p_product_id
      AND b.profile_id = auth.uid()
      AND bp.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Product not found or not owned by current user';
  END IF;

  UPDATE public.brand_products
  SET deleted_at = NOW()
  WHERE id = p_product_id;

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_brand_product TO authenticated;

COMMIT;

-- ============================================================
-- STORAGE BUCKET (outside transaction — storage schema)
-- ============================================================
SET search_path = storage;

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-products', 'brand-products', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Public brand product images access" ON storage.objects;
CREATE POLICY "Public brand product images access"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-products');

-- Authenticated upload (scoped to user folder)
DROP POLICY IF EXISTS "Brand users upload product images" ON storage.objects;
CREATE POLICY "Brand users upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brand-products'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::TEXT
);

-- Update own images
DROP POLICY IF EXISTS "Brand users update product images" ON storage.objects;
CREATE POLICY "Brand users update product images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brand-products'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

-- Delete own images
DROP POLICY IF EXISTS "Brand users delete product images" ON storage.objects;
CREATE POLICY "Brand users delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brand-products'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

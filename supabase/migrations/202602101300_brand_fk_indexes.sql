-- ============================================================================
-- BRAND FK INDEXES
-- ============================================================================
-- Add missing indexes on foreign keys for brand_posts and brand_products.
-- These tables are queried by brand_id on every brand profile page load.
-- Without indexes, queries do sequential scans as brand count grows.
-- ============================================================================

SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_brand_posts_brand_id
  ON public.brand_posts (brand_id);

CREATE INDEX IF NOT EXISTS idx_brand_products_brand_id
  ON public.brand_products (brand_id);

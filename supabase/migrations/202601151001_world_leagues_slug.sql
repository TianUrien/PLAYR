-- Add slug column to world_leagues for URL-friendly routing
ALTER TABLE world_leagues ADD COLUMN IF NOT EXISTS slug TEXT;

-- Generate slugs from names
UPDATE world_leagues SET slug = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '(', ''), ')', ''));

-- Make slug required and unique per province
ALTER TABLE world_leagues ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS world_leagues_province_slug_idx ON world_leagues(province_id, slug);

-- Add comment
COMMENT ON COLUMN world_leagues.slug IS 'URL-friendly slug for routing';

-- ============================================================================
-- Migration: Backfill nationality FKs + add base_city column
-- ============================================================================
-- Problem: Some profiles have nationality text but no nationality_country_id FK.
-- base_location is pure free text ("London, UK") with no structured city/country
-- separation. 5/5 profiles with base_location have NULL base_country_id.
--
-- This migration:
-- 1. Backfills nationality_country_id from nationality text using match_text_to_country()
-- 2. Adds base_city column for structured city storage
-- 3. Backfills base_country_id from base_location text where possible
-- ============================================================================

-- Step 1: Backfill nationality_country_id from legacy nationality text field
-- Uses the existing match_text_to_country() function for fuzzy matching
UPDATE profiles p
SET nationality_country_id = (
  SELECT c.id FROM countries c
  WHERE LOWER(c.name) = LOWER(p.nationality)
     OR LOWER(c.common_name) = LOWER(p.nationality)
     OR LOWER(c.nationality_name) = LOWER(p.nationality)
  LIMIT 1
)
WHERE p.nationality IS NOT NULL
  AND p.nationality != ''
  AND p.nationality_country_id IS NULL;

-- Step 2: Add base_city column for structured city storage
-- base_location remains as display fallback; base_city is the AI-queryable field
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS base_city TEXT;

COMMENT ON COLUMN profiles.base_city IS
  'Structured city name extracted from base_location. Used for AI search filtering.';

-- Step 3: Backfill base_city from base_location
-- For entries like "London, UK" or "Manchester, UK", extract the city part
-- For entries like "London" (no comma), use as-is
UPDATE profiles
SET base_city = CASE
  WHEN base_location LIKE '%,%'
    THEN TRIM(SPLIT_PART(base_location, ',', 1))
  ELSE TRIM(base_location)
END
WHERE base_location IS NOT NULL
  AND base_location != ''
  AND base_city IS NULL;

-- Step 4: Backfill base_country_id from base_location text where it contains country info
-- Match the part after the comma (e.g., "UK" from "London, UK")
UPDATE profiles p
SET base_country_id = (
  SELECT c.id FROM countries c
  WHERE LOWER(c.name) = LOWER(TRIM(SPLIT_PART(p.base_location, ',', 2)))
     OR LOWER(c.common_name) = LOWER(TRIM(SPLIT_PART(p.base_location, ',', 2)))
     OR LOWER(c.code) = LOWER(TRIM(SPLIT_PART(p.base_location, ',', 2)))
     OR LOWER(c.code_alpha3) = LOWER(TRIM(SPLIT_PART(p.base_location, ',', 2)))
  LIMIT 1
)
WHERE p.base_location LIKE '%,%'
  AND p.base_country_id IS NULL;

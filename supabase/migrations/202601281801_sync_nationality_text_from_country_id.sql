-- ============================================================================
-- SYNC NATIONALITY TEXT FROM NORMALIZED COUNTRY ID
-- ============================================================================
-- This migration syncs the legacy nationality TEXT column from the normalized
-- nationality_country_id for consistency and backward compatibility.
--
-- It also attempts to fill in missing nationality_country_id from free-text
-- values using the existing alias matching system.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- STEP 1: First, try to fill missing nationality_country_id from free-text
-- ============================================================================
-- Some old profiles have nationality text but no country_id
-- Use the existing match_text_to_country function to resolve them

UPDATE profiles p
SET nationality_country_id = matched.country_id
FROM (
  SELECT
    p2.id AS profile_id,
    (public.match_text_to_country(p2.nationality)).country_id AS country_id,
    (public.match_text_to_country(p2.nationality)).confidence AS confidence
  FROM profiles p2
  WHERE p2.nationality IS NOT NULL
    AND TRIM(p2.nationality) <> ''
    AND p2.nationality_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

-- ============================================================================
-- STEP 2: Sync nationality TEXT from countries table for all profiles
-- ============================================================================
-- This ensures the nationality TEXT field is consistent with the normalized data
-- Uses nationality_name (demonym) for the text field since that's what users see

UPDATE profiles p
SET nationality = c.nationality_name
FROM countries c
WHERE c.id = p.nationality_country_id
  AND p.nationality_country_id IS NOT NULL
  AND (
    -- Update if text is blank/null
    p.nationality IS NULL
    OR TRIM(p.nationality) = ''
    -- Or if text doesn't match the canonical nationality name (case-insensitive)
    OR LOWER(TRIM(p.nationality)) NOT IN (
      LOWER(c.nationality_name),
      LOWER(c.name)
    )
  );

-- ============================================================================
-- STEP 3: Report any profiles still missing nationality_country_id
-- ============================================================================
-- These need manual review or the user needs to update their profile

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM profiles
  WHERE nationality_country_id IS NULL
    AND NOT is_test_account
    AND onboarding_completed = TRUE;

  IF missing_count > 0 THEN
    RAISE NOTICE 'There are % completed profiles without nationality_country_id that may need review', missing_count;
  END IF;
END $$;

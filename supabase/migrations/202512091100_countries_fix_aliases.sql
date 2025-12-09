-- Fix missing country aliases and re-run migration for unmatched profiles
-- This adds common typos and passport text patterns that weren't matched initially

BEGIN;

-- ============================================================================
-- STEP 1: Add missing aliases for typos and passport text patterns
-- ============================================================================
INSERT INTO public.country_text_aliases (alias_text, country_id, confidence) VALUES
  -- Common typos
  ('agentina', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('argentian', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('argnetina', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  
  -- Passport text patterns - Argentina
  ('pasaporte argentino', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('pasaporte argentina', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('argentina passport', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('argentine passport', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('argentina passport.', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('argentine passport.', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  
  -- Passport text patterns - UK/British
  ('british passport', (SELECT id FROM countries WHERE code = 'GB'), 'high'),
  ('uk passport', (SELECT id FROM countries WHERE code = 'GB'), 'high'),
  ('united kingdom passport', (SELECT id FROM countries WHERE code = 'GB'), 'high'),
  ('english passport', (SELECT id FROM countries WHERE code = 'GB'), 'medium'),
  
  -- Passport text patterns - USA
  ('american passport', (SELECT id FROM countries WHERE code = 'US'), 'high'),
  ('us passport', (SELECT id FROM countries WHERE code = 'US'), 'high'),
  ('usa passport', (SELECT id FROM countries WHERE code = 'US'), 'high'),
  ('united states passport', (SELECT id FROM countries WHERE code = 'US'), 'high'),
  
  -- Passport text patterns - Spain
  ('spanish passport', (SELECT id FROM countries WHERE code = 'ES'), 'high'),
  ('pasaporte español', (SELECT id FROM countries WHERE code = 'ES'), 'high'),
  ('pasaporte espanol', (SELECT id FROM countries WHERE code = 'ES'), 'high'),
  ('española', (SELECT id FROM countries WHERE code = 'ES'), 'high'),
  ('espanola', (SELECT id FROM countries WHERE code = 'ES'), 'high'),
  
  -- Passport text patterns - Italy
  ('italian passport', (SELECT id FROM countries WHERE code = 'IT'), 'high'),
  ('passaporto italiano', (SELECT id FROM countries WHERE code = 'IT'), 'high'),
  
  -- Passport text patterns - Germany
  ('german passport', (SELECT id FROM countries WHERE code = 'DE'), 'high'),
  
  -- Passport text patterns - France
  ('french passport', (SELECT id FROM countries WHERE code = 'FR'), 'high'),
  
  -- Passport text patterns - Brazil
  ('brazilian passport', (SELECT id FROM countries WHERE code = 'BR'), 'high'),
  ('passaporte brasileiro', (SELECT id FROM countries WHERE code = 'BR'), 'high'),
  
  -- Passport text patterns - Portugal
  ('portuguese passport', (SELECT id FROM countries WHERE code = 'PT'), 'high'),
  ('passaporte português', (SELECT id FROM countries WHERE code = 'PT'), 'high'),
  ('passaporte portugues', (SELECT id FROM countries WHERE code = 'PT'), 'high'),
  
  -- Passport text patterns - Netherlands
  ('dutch passport', (SELECT id FROM countries WHERE code = 'NL'), 'high'),
  
  -- Passport text patterns - Australia
  ('australian passport', (SELECT id FROM countries WHERE code = 'AU'), 'high'),
  ('aussie passport', (SELECT id FROM countries WHERE code = 'AU'), 'medium'),
  
  -- Passport text patterns - New Zealand
  ('new zealand passport', (SELECT id FROM countries WHERE code = 'NZ'), 'high'),
  ('kiwi passport', (SELECT id FROM countries WHERE code = 'NZ'), 'medium'),
  ('nz passport', (SELECT id FROM countries WHERE code = 'NZ'), 'high'),
  
  -- Passport text patterns - Ireland
  ('irish passport', (SELECT id FROM countries WHERE code = 'IE'), 'high'),
  
  -- Passport text patterns - South Africa
  ('south african passport', (SELECT id FROM countries WHERE code = 'ZA'), 'high'),
  
  -- Other common variations
  ('argentina.', (SELECT id FROM countries WHERE code = 'AR'), 'high'),
  ('británico', (SELECT id FROM countries WHERE code = 'GB'), 'high'),
  ('britanico', (SELECT id FROM countries WHERE code = 'GB'), 'high')
ON CONFLICT (alias_text) DO NOTHING;

-- ============================================================================
-- STEP 2: Re-run nationality migration for profiles still missing country_id
-- ============================================================================
UPDATE public.profiles p
SET nationality_country_id = matched.country_id
FROM (
  SELECT 
    p2.id AS profile_id,
    (public.match_text_to_country(p2.nationality)).country_id AS country_id,
    (public.match_text_to_country(p2.nationality)).confidence AS confidence
  FROM public.profiles p2
  WHERE p2.nationality IS NOT NULL
    AND TRIM(p2.nationality) <> ''
    AND p2.nationality_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

-- ============================================================================
-- STEP 3: Re-run passport1 migration for profiles still missing country_id
-- ============================================================================
UPDATE public.profiles p
SET passport1_country_id = matched.country_id
FROM (
  SELECT 
    p2.id AS profile_id,
    (public.match_text_to_country(p2.passport_1)).country_id AS country_id,
    (public.match_text_to_country(p2.passport_1)).confidence AS confidence
  FROM public.profiles p2
  WHERE p2.passport_1 IS NOT NULL
    AND TRIM(p2.passport_1) <> ''
    AND p2.passport1_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

-- ============================================================================
-- STEP 4: Re-run passport2 migration for profiles still missing country_id
-- ============================================================================
UPDATE public.profiles p
SET passport2_country_id = matched.country_id
FROM (
  SELECT 
    p2.id AS profile_id,
    (public.match_text_to_country(p2.passport_2)).country_id AS country_id,
    (public.match_text_to_country(p2.passport_2)).confidence AS confidence
  FROM public.profiles p2
  WHERE p2.passport_2 IS NOT NULL
    AND TRIM(p2.passport_2) <> ''
    AND p2.passport2_country_id IS NULL
) AS matched
WHERE p.id = matched.profile_id
  AND matched.country_id IS NOT NULL
  AND matched.confidence IN ('high', 'medium');

COMMIT;

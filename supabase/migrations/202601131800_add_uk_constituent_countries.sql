-- Add UK Constituent Countries Migration
-- ============================================================================
-- For field hockey purposes, England, Scotland, and Wales have their own
-- leagues and structures, so they need to be selectable as separate countries.
-- Using ISO 3166-2 subdivision codes (GB-ENG, GB-SCT, GB-WLS)
-- ============================================================================

-- STEP 1: Alter the code column to support longer ISO 3166-2 codes
-- The current CHAR(2) only supports ISO 3166-1 alpha-2 codes
ALTER TABLE public.countries ALTER COLUMN code TYPE VARCHAR(6);

-- STEP 2: Insert England, Scotland, and Wales as separate selectable countries
-- Keep United Kingdom (GB) for legacy/general use
INSERT INTO public.countries (code, code_alpha3, name, nationality_name, region, flag_emoji)
VALUES
  ('GB-ENG', 'ENG', 'England', 'English', 'Europe', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
  ('GB-SCT', 'SCT', 'Scotland', 'Scottish', 'Europe', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
  ('GB-WLS', 'WLS', 'Wales', 'Welsh', 'Europe', '🏴󠁧󠁢󠁷󠁬󠁳󠁿')
ON CONFLICT (code) DO NOTHING;

-- STEP 3: Add common aliases for these countries
INSERT INTO public.country_text_aliases (alias_text, country_id, confidence)
SELECT aliases.alias_text, c.id, 'high'
FROM (
  VALUES
    ('GB-ENG', 'eng'),
    ('GB-ENG', 'english'),
    ('GB-ENG', 'england'),
    ('GB-SCT', 'sct'),
    ('GB-SCT', 'scottish'),
    ('GB-SCT', 'scotland'),
    ('GB-WLS', 'wls'),
    ('GB-WLS', 'welsh'),
    ('GB-WLS', 'wales'),
    ('GB-WLS', 'cymru')
) AS aliases(code, alias_text)
JOIN public.countries c ON c.code = aliases.code
ON CONFLICT (alias_text) DO NOTHING;

-- Add comment explaining the setup
COMMENT ON COLUMN public.countries.code IS 'ISO 3166-1 alpha-2 code, or ISO 3166-2 subdivision code for UK constituent countries (GB-ENG, GB-SCT, GB-WLS)';

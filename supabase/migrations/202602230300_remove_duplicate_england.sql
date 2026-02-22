-- Fix: duplicate England entry in countries table
-- id 199 (code GB-ENG) was created by the UK constituent countries migration
-- id 202 (code XE) is the canonical one used by World directory
-- Merge references from 199 → 202, then delete the duplicate.

-- Move nationality references
UPDATE public.profiles
SET nationality_country_id = 202
WHERE nationality_country_id = 199;

UPDATE public.profiles
SET nationality2_country_id = 202
WHERE nationality2_country_id = 199;

-- Delete the duplicate
DELETE FROM public.countries WHERE id = 199;

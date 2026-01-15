-- Fix Argentina league naming (remove AHBA suffix)
UPDATE public.world_leagues
SET name = 'Torneo Metropolitano A'
WHERE name = 'Torneo Metropolitano A (AHBA)';

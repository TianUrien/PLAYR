-- Phase 3a follow-up: fix CHECK constraints that didn't reject empty arrays.
-- Bug: array_length([], 1) returns NULL in Postgres, and NULL >= 1 evaluates
-- to NULL — which CHECK constraints treat as TRUE (pass). So empty arrays
-- slipped through despite the intent.
--
-- Fix: use cardinality() instead — cardinality([]) is 0 (not NULL), so the
-- comparison cardinality(...) >= 1 evaluates to false (not NULL) for empty
-- arrays, and CHECK correctly rejects them.
--
-- Order matters: cleanup any pre-existing empty-array rows BEFORE adding
-- the stricter constraint, otherwise ADD CONSTRAINT errors with 23514.

-- 1. Cleanup first — normalise any existing empty arrays to NULL.
UPDATE public.profiles
SET coaching_categories = NULL
WHERE coaching_categories IS NOT NULL AND cardinality(coaching_categories) = 0;

UPDATE public.profiles
SET umpiring_categories = NULL
WHERE umpiring_categories IS NOT NULL AND cardinality(umpiring_categories) = 0;

-- 2. Drop the broken constraints
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_coaching_categories;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_umpiring_categories;

-- 3. Re-add with cardinality()
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_coaching_categories
  CHECK (
    coaching_categories IS NULL
    OR (
      cardinality(coaching_categories) >= 1
      AND coaching_categories <@ ARRAY['adult_women','adult_men','girls','boys','mixed','any']::text[]
    )
  );

ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_umpiring_categories
  CHECK (
    umpiring_categories IS NULL
    OR (
      cardinality(umpiring_categories) >= 1
      AND umpiring_categories <@ ARRAY['adult_women','adult_men','girls','boys','mixed','any']::text[]
    )
  );

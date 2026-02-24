-- ============================================================================
-- Migration: Normalize position + gender values for AI search readiness
-- ============================================================================
-- Problem: profiles.position stores Title Case ("Midfielder", "Head Coach")
-- but community filters expect lowercase ("midfielder", "head coach") and
-- the vacancy system uses a DB enum with lowercase. No CHECK constraint
-- exists, so invalid values can be inserted.
--
-- This migration:
-- 1. Normalizes existing position/secondary_position values to lowercase
-- 2. Adds CHECK constraints to enforce the valid set
-- 3. Adds CHECK constraint on gender (currently free text)
-- ============================================================================

-- Step 1: Normalize existing position values to lowercase
-- Player positions: Title Case → lowercase
UPDATE profiles SET position = LOWER(position)
WHERE position IS NOT NULL AND position != LOWER(position);

UPDATE profiles SET secondary_position = LOWER(secondary_position)
WHERE secondary_position IS NOT NULL AND secondary_position != LOWER(secondary_position);

-- Step 2: Normalize career_history position_role (same issue)
UPDATE career_history SET position_role = LOWER(position_role)
WHERE position_role IS NOT NULL AND position_role != LOWER(position_role);

-- Step 3: Add CHECK constraint on profiles.position
-- Valid values match the community filter constants (lowercase with spaces for coaches)
-- Player: goalkeeper, defender, midfielder, forward
-- Coach: head coach, assistant coach, youth coach
ALTER TABLE profiles ADD CONSTRAINT chk_profiles_position
  CHECK (
    position IS NULL
    OR position IN (
      'goalkeeper', 'defender', 'midfielder', 'forward',
      'head coach', 'assistant coach', 'youth coach'
    )
  );

-- Step 4: Add CHECK constraint on profiles.secondary_position (same valid set)
ALTER TABLE profiles ADD CONSTRAINT chk_profiles_secondary_position
  CHECK (
    secondary_position IS NULL
    OR secondary_position IN (
      'goalkeeper', 'defender', 'midfielder', 'forward',
      'head coach', 'assistant coach', 'youth coach'
    )
  );

-- Step 5: Add CHECK constraint on profiles.gender
-- Values match the existing opportunity_gender enum: 'Men', 'Women'
ALTER TABLE profiles ADD CONSTRAINT chk_profiles_gender
  CHECK (gender IS NULL OR gender IN ('Men', 'Women'));

-- Step 6: Clean up empty-string nationality (found in audit: 1 profile with nationality="")
UPDATE profiles SET nationality = NULL WHERE nationality = '';

COMMENT ON CONSTRAINT chk_profiles_position ON profiles IS
  'AI search readiness: enforces lowercase position values matching community filters';
COMMENT ON CONSTRAINT chk_profiles_secondary_position ON profiles IS
  'AI search readiness: enforces lowercase secondary position values';
COMMENT ON CONSTRAINT chk_profiles_gender ON profiles IS
  'AI search readiness: enforces gender values matching opportunity_gender enum';

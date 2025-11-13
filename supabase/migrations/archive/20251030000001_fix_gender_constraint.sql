-- Fix gender constraint to allow coach gender values
-- Players use: 'Men', 'Women'
-- Coaches use: 'male', 'female', 'other'

-- Drop the old restrictive constraint
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_gender_check;

-- Add new flexible constraint that allows both player and coach values
ALTER TABLE profiles 
ADD CONSTRAINT profiles_gender_check 
CHECK (gender IN ('Men', 'Women', 'male', 'female', 'other') OR gender IS NULL);

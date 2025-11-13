-- Make position and gender nullable to support coach opportunities
-- Coach positions don't require these fields, only player positions do

-- Remove NOT NULL constraint from position
ALTER TABLE vacancies 
ALTER COLUMN position DROP NOT NULL;

-- Remove NOT NULL constraint from gender
ALTER TABLE vacancies 
ALTER COLUMN gender DROP NOT NULL;

-- Add a check constraint to ensure position and gender are provided for player opportunities
ALTER TABLE vacancies
ADD CONSTRAINT check_player_fields 
CHECK (
  (opportunity_type = 'coach') OR 
  (opportunity_type = 'player' AND position IS NOT NULL AND gender IS NOT NULL)
);

-- Comment explaining the constraint
COMMENT ON CONSTRAINT check_player_fields ON vacancies IS 
'Ensures position and gender are provided for player opportunities, but allows them to be null for coach opportunities';

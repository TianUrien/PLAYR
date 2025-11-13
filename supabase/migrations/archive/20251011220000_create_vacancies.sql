-- Create enums for vacancies
CREATE TYPE opportunity_type AS ENUM ('player', 'coach');
CREATE TYPE vacancy_position AS ENUM ('goalkeeper', 'defender', 'midfielder', 'forward');
CREATE TYPE vacancy_gender AS ENUM ('Men', 'Women');
CREATE TYPE vacancy_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE vacancy_status AS ENUM ('draft', 'open', 'closed');

-- Create vacancies table
CREATE TABLE vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Basic Information
  opportunity_type opportunity_type NOT NULL DEFAULT 'player',
  title TEXT NOT NULL,
  position vacancy_position NOT NULL,
  gender vacancy_gender NOT NULL,
  description TEXT,
  
  -- Location & Timeline
  location_city TEXT NOT NULL,
  location_country TEXT NOT NULL,
  start_date DATE,
  duration_text TEXT,
  
  -- Requirements & Benefits
  requirements TEXT[] DEFAULT '{}',
  benefits TEXT[] DEFAULT '{}',
  custom_benefits TEXT[] DEFAULT '{}',
  
  -- Priority & Status
  priority vacancy_priority DEFAULT 'medium',
  status vacancy_status DEFAULT 'draft',
  
  -- Application Details
  application_deadline DATE,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Audit timestamps
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Clubs can view their own vacancies
CREATE POLICY "Clubs can view their own vacancies"
ON vacancies FOR SELECT
USING (
  auth.uid() = club_id AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'club'
  )
);

-- Clubs can insert their own vacancies
CREATE POLICY "Clubs can insert their own vacancies"
ON vacancies FOR INSERT
WITH CHECK (
  auth.uid() = club_id AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'club'
  )
);

-- Clubs can update their own vacancies
CREATE POLICY "Clubs can update their own vacancies"
ON vacancies FOR UPDATE
USING (
  auth.uid() = club_id AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'club'
  )
);

-- Clubs can delete their own vacancies
CREATE POLICY "Clubs can delete their own vacancies"
ON vacancies FOR DELETE
USING (
  auth.uid() = club_id AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'club'
  )
);

-- Players/public can view open vacancies (for future)
CREATE POLICY "Public can view open vacancies"
ON vacancies FOR SELECT
USING (status = 'open');

-- Create indexes for performance
CREATE INDEX idx_vacancies_club_id ON vacancies(club_id);
CREATE INDEX idx_vacancies_club_status ON vacancies(club_id, status);
CREATE INDEX idx_vacancies_created_at ON vacancies(created_at DESC);
CREATE INDEX idx_vacancies_status ON vacancies(status) WHERE status = 'open';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vacancies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER set_vacancies_updated_at
  BEFORE UPDATE ON vacancies
  FOR EACH ROW
  EXECUTE FUNCTION update_vacancies_updated_at();

-- Create function to set published_at when status changes to 'open'
CREATE OR REPLACE FUNCTION set_vacancy_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'open' AND OLD.status != 'open' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  
  IF NEW.status = 'closed' AND OLD.status != 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for published_at and closed_at
CREATE TRIGGER set_vacancy_timestamps
  BEFORE UPDATE ON vacancies
  FOR EACH ROW
  EXECUTE FUNCTION set_vacancy_published_at();

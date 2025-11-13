-- Create vacancy applications table for tracking player applications to club vacancies
-- This enables the full recruitment flow: vacancy → applications → applicants list → player profile

-- Create update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create status enum constraint
CREATE TYPE application_status AS ENUM (
  'pending',
  'reviewed',
  'shortlisted',
  'interview',
  'accepted',
  'rejected',
  'withdrawn'
);

-- Create vacancy_applications table
CREATE TABLE IF NOT EXISTS public.vacancy_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id uuid NOT NULL REFERENCES public.vacancies(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_letter text,
  status application_status NOT NULL DEFAULT 'pending',
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Prevent duplicate applications from same player to same vacancy
  CONSTRAINT unique_application UNIQUE (vacancy_id, player_id)
);

-- Create indexes for performance
CREATE INDEX idx_vap_vacancy_id ON public.vacancy_applications(vacancy_id);
CREATE INDEX idx_vap_player_id ON public.vacancy_applications(player_id);
CREATE INDEX idx_vap_status ON public.vacancy_applications(status);
CREATE INDEX idx_vap_applied_at ON public.vacancy_applications(applied_at DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.vacancy_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.vacancy_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Clubs can view applications to their own vacancies
CREATE POLICY "Clubs can view applications to their vacancies"
  ON public.vacancy_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vacancies v
      WHERE v.id = vacancy_applications.vacancy_id
      AND v.club_id = auth.uid()
    )
  );

-- RLS Policy: Players can view their own applications
CREATE POLICY "Players can view their own applications"
  ON public.vacancy_applications
  FOR SELECT
  USING (player_id = auth.uid());

-- RLS Policy: Only players can create applications
CREATE POLICY "Players can create applications"
  ON public.vacancy_applications
  FOR INSERT
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'player'
    )
  );

-- RLS Policy: Only vacancy owners (clubs) can update application status
CREATE POLICY "Clubs can update application status"
  ON public.vacancy_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.vacancies v
      WHERE v.id = vacancy_applications.vacancy_id
      AND v.club_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vacancies v
      WHERE v.id = vacancy_applications.vacancy_id
      AND v.club_id = auth.uid()
    )
  );

-- RLS Policy: Players can withdraw their own applications
CREATE POLICY "Players can withdraw applications"
  ON public.vacancy_applications
  FOR UPDATE
  USING (player_id = auth.uid())
  WITH CHECK (
    player_id = auth.uid()
    AND status = 'withdrawn'
  );

-- Add comment for documentation
COMMENT ON TABLE public.vacancy_applications IS 'Tracks player applications to club vacancies with status management';

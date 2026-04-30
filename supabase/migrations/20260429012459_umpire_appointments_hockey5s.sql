-- Add Hockey5s as an officially-recognized match format on umpire appointments.
-- Tester (real field hockey official) flagged that the format dropdown was missing
-- Hockey5s, which is one of the FIH's official formats alongside Outdoor 11v11
-- and Indoor. The UI display label "Indoor 5v5" is also being relabelled to
-- simply "Indoor" — but the stored value 'indoor_5v5' stays for backward
-- compatibility with existing rows (no data migration needed).

-- Drop the old constraint and re-add with 'hockey5s' included.
ALTER TABLE public.umpire_appointments
  DROP CONSTRAINT IF EXISTS chk_umpire_appointments_format;

ALTER TABLE public.umpire_appointments ADD CONSTRAINT chk_umpire_appointments_format
  CHECK (
    match_format IS NULL
    OR match_format = ANY (ARRAY['outdoor_11v11'::text, 'indoor_5v5'::text, 'hockey5s'::text, 'other'::text])
  );

-- Allow the reference giver to edit their endorsement text on an accepted reference.
-- This enables fixing typos or updating the endorsement without withdrawing and re-requesting.

CREATE OR REPLACE FUNCTION public.edit_endorsement(
  p_reference_id UUID,
  p_endorsement TEXT
)
RETURNS public.profile_references
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
  updated_row public.profile_references;
BEGIN
  IF current_profile IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to edit an endorsement.';
  END IF;

  UPDATE public.profile_references
     SET endorsement_text = NULLIF(LEFT(btrim(COALESCE(p_endorsement, '')), 1200), ''),
         updated_at = timezone('utc', now())
   WHERE id = p_reference_id
     AND reference_id = current_profile
     AND status = 'accepted'
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reference not found or not in accepted state.';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_endorsement(UUID, TEXT) TO authenticated;

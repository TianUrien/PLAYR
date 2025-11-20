SET search_path = public;

CREATE OR REPLACE FUNCTION public.respond_reference(
  p_reference_id UUID,
  p_accept BOOLEAN,
  p_endorsement TEXT DEFAULT NULL
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
    RAISE EXCEPTION 'You must be signed in to respond to a reference request.';
  END IF;

  UPDATE public.profile_references
     SET status = CASE
                    WHEN p_accept THEN 'accepted'::public.profile_reference_status
                    ELSE 'declined'::public.profile_reference_status
                  END,
         endorsement_text = CASE
                               WHEN p_accept THEN NULLIF(LEFT(btrim(COALESCE(p_endorsement, '')), 1200), '')
                               ELSE endorsement_text
                             END,
         responded_at = timezone('utc', now())
   WHERE id = p_reference_id
     AND reference_id = current_profile
     AND status = 'pending'::public.profile_reference_status
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reference request not found or already handled.';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_reference(UUID, BOOLEAN, TEXT) TO authenticated;

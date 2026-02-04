-- Add nationality_country_id and nationality2_country_id to the profile JSON
-- payloads returned by all four reference RPC functions. This enables the
-- frontend to display nationality flags on trusted reference cards instead of
-- plain location text.

-- 1. get_my_references  – references the current user requested
CREATE OR REPLACE FUNCTION public.get_my_references()
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  status public.profile_reference_status,
  relationship_type TEXT,
  request_note TEXT,
  endorsement_text TEXT,
  created_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  reference_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
BEGIN
  IF current_profile IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.status,
    pr.relationship_type,
    pr.request_note,
    pr.endorsement_text,
    pr.created_at,
    pr.responded_at,
    pr.accepted_at,
    jsonb_build_object(
      'id', ref.id,
      'full_name', ref.full_name,
      'role', ref.role,
      'username', ref.username,
      'avatar_url', ref.avatar_url,
      'base_location', ref.base_location,
      'position', ref.position,
      'current_club', ref.current_club,
      'nationality_country_id', ref.nationality_country_id,
      'nationality2_country_id', ref.nationality2_country_id
    ) AS reference_profile
  FROM public.profile_references pr
  JOIN public.profiles ref ON ref.id = pr.reference_id
  WHERE pr.requester_id = current_profile
    AND pr.status IN ('pending', 'accepted')
  ORDER BY
    CASE pr.status WHEN 'accepted' THEN 0 ELSE 1 END,
    pr.created_at DESC;
END;
$$;

-- 2. get_my_reference_requests  – pending requests received by the current user
CREATE OR REPLACE FUNCTION public.get_my_reference_requests()
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  status public.profile_reference_status,
  relationship_type TEXT,
  request_note TEXT,
  created_at TIMESTAMPTZ,
  requester_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
BEGIN
  IF current_profile IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.status,
    pr.relationship_type,
    pr.request_note,
    pr.created_at,
    jsonb_build_object(
      'id', req.id,
      'full_name', req.full_name,
      'role', req.role,
      'username', req.username,
      'avatar_url', req.avatar_url,
      'base_location', req.base_location,
      'position', req.position,
      'current_club', req.current_club,
      'nationality_country_id', req.nationality_country_id,
      'nationality2_country_id', req.nationality2_country_id
    ) AS requester_profile
  FROM public.profile_references pr
  JOIN public.profiles req ON req.id = pr.requester_id
  WHERE pr.reference_id = current_profile
    AND pr.status = 'pending'
  ORDER BY pr.created_at ASC;
END;
$$;

-- 3. get_references_i_gave  – accepted references the current user has given
CREATE OR REPLACE FUNCTION public.get_references_i_gave()
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  status public.profile_reference_status,
  relationship_type TEXT,
  endorsement_text TEXT,
  accepted_at TIMESTAMPTZ,
  requester_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile UUID := auth.uid();
BEGIN
  IF current_profile IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.status,
    pr.relationship_type,
    pr.endorsement_text,
    pr.accepted_at,
    jsonb_build_object(
      'id', req.id,
      'full_name', req.full_name,
      'role', req.role,
      'username', req.username,
      'avatar_url', req.avatar_url,
      'base_location', req.base_location,
      'position', req.position,
      'current_club', req.current_club,
      'nationality_country_id', req.nationality_country_id,
      'nationality2_country_id', req.nationality2_country_id
    ) AS requester_profile
  FROM public.profile_references pr
  JOIN public.profiles req ON req.id = pr.requester_id
  WHERE pr.reference_id = current_profile
    AND pr.status = 'accepted'
  ORDER BY pr.accepted_at DESC NULLS LAST, pr.created_at DESC;
END;
$$;

-- 4. get_profile_references  – public-facing accepted references for a profile
CREATE OR REPLACE FUNCTION public.get_profile_references(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  reference_id UUID,
  relationship_type TEXT,
  endorsement_text TEXT,
  accepted_at TIMESTAMPTZ,
  reference_profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.requester_id,
    pr.reference_id,
    pr.relationship_type,
    pr.endorsement_text,
    pr.accepted_at,
    jsonb_build_object(
      'id', ref.id,
      'full_name', ref.full_name,
      'role', ref.role,
      'username', ref.username,
      'avatar_url', ref.avatar_url,
      'base_location', ref.base_location,
      'position', ref.position,
      'current_club', ref.current_club,
      'nationality_country_id', ref.nationality_country_id,
      'nationality2_country_id', ref.nationality2_country_id
    ) AS reference_profile
  FROM public.profile_references pr
  JOIN public.profiles ref ON ref.id = pr.reference_id
  WHERE pr.requester_id = p_profile_id
    AND pr.status = 'accepted'
  ORDER BY pr.accepted_at DESC NULLS LAST, pr.created_at DESC;
END;
$$;

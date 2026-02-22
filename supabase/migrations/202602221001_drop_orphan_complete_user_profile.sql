-- ============================================================================
-- Drop orphan overload of complete_user_profile
-- The 21-param version (with p_contact_email_public BOOLEAN) was created in
-- 202511130102 and never dropped when 202511171335 created a new overload
-- without the boolean param. Both existed simultaneously. The previous
-- migration (202602221000) dropped the 20-param version and recreated it
-- without passport params. This drops the orphan 21-param version.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.complete_user_profile(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, TEXT
);

COMMIT;

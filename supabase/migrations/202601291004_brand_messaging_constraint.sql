-- ============================================================================
-- Migration: Brand messaging constraint
-- ============================================================================
-- Brands cannot initiate conversations. They can only reply to messages
-- in conversations started by players, coaches, or clubs.
-- ============================================================================

SET search_path = public;

BEGIN;

-- ============================================================================
-- Trigger function: Prevent brands from creating conversations
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_brand_conversation_initiation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_role TEXT;
BEGIN
  -- Get the role of the user creating the conversation
  -- The creator is auth.uid() which should be one of the participants
  SELECT role INTO v_creator_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- If the creator is a brand, prevent conversation creation
  IF v_creator_role = 'brand' THEN
    RAISE EXCEPTION 'Brands cannot initiate conversations. Please wait for players or clubs to message you first.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_brand_conversation_initiation IS 'Trigger function to prevent brands from initiating conversations';

-- ============================================================================
-- Apply trigger to conversations table
-- ============================================================================
DROP TRIGGER IF EXISTS prevent_brand_conversation_initiation ON public.conversations;
CREATE TRIGGER prevent_brand_conversation_initiation
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_brand_conversation_initiation();

COMMIT;

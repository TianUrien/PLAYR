-- Fix: Recipients cannot reject friend requests because 'rejected' was missing
-- from the "friendships recipient update" WITH CHECK clause.
--
-- The trigger (handle_friendship_state) explicitly allows recipients to reject,
-- but RLS silently blocked the UPDATE before the trigger could fire because
-- the WITH CHECK only permitted ('accepted', 'blocked').
--
-- This adds 'rejected' so the recipient can set status to accepted, rejected,
-- or blocked — matching the trigger's intent.

BEGIN;

DROP POLICY IF EXISTS "friendships recipient update" ON public.profile_friendships;

CREATE POLICY "friendships recipient update"
  ON public.profile_friendships
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (
      auth.uid() <> requester_id
      AND (auth.uid() = user_one OR auth.uid() = user_two)
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.uid() <> requester_id
      AND (auth.uid() = user_one OR auth.uid() = user_two)
      AND status IN ('accepted', 'rejected', 'blocked')
    )
  );

COMMIT;

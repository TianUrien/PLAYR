-- Allow users to send new friend requests after removing/being rejected
-- This updates the handle_friendship_state trigger to allow transitioning 
-- from cancelled/rejected back to pending (but not from accepted/blocked)

SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_friendship_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := auth.role();
BEGIN
  IF NEW.user_one = NEW.user_two THEN
    RAISE EXCEPTION 'Cannot create friendship with yourself';
  END IF;

  IF NEW.requester_id IS NULL OR (NEW.requester_id <> NEW.user_one AND NEW.requester_id <> NEW.user_two) THEN
    RAISE EXCEPTION 'Requester must be part of the friendship';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF actor_role <> 'service_role' THEN
      IF actor_id IS NULL OR (actor_id <> OLD.user_one AND actor_id <> OLD.user_two) THEN
        RAISE EXCEPTION 'Only friendship participants can update the relationship';
      END IF;

      -- Allow changing requester_id when re-friending (transitioning to pending from cancelled/rejected)
      IF NEW.status = 'pending' AND OLD.status IN ('cancelled', 'rejected') THEN
        -- This is a re-friend request - allow requester_id to change
        IF NEW.requester_id <> actor_id THEN
          RAISE EXCEPTION 'Only the new requester can re-initiate a friendship';
        END IF;
        -- Reset created_at for new request
        NEW.created_at := timezone('utc', now());
      ELSE
        -- For all other updates, participants are immutable
        IF NEW.user_one <> OLD.user_one OR NEW.user_two <> OLD.user_two THEN
          RAISE EXCEPTION 'Friendship participants are immutable';
        END IF;
        -- Requester_id is immutable except for re-friending
        IF NEW.requester_id <> OLD.requester_id THEN
          RAISE EXCEPTION 'Requester cannot be changed';
        END IF;
      END IF;

      IF NEW.status = 'accepted' THEN
        IF OLD.status <> 'pending' THEN
          RAISE EXCEPTION 'Only pending friendships can be accepted';
        END IF;
        IF actor_id = OLD.requester_id THEN
          RAISE EXCEPTION 'Requester cannot accept their own friendship request';
        END IF;
      END IF;

      -- Allow recipient to reject; allow requester to cancel
      IF NEW.status = 'cancelled' AND actor_id <> OLD.requester_id THEN
        RAISE EXCEPTION 'Only the requester can cancel a friendship request';
      END IF;
      
      IF NEW.status = 'rejected' AND actor_id = OLD.requester_id THEN
        RAISE EXCEPTION 'Requester cannot reject their own friendship request';
      END IF;

      -- Block reverting to pending from accepted or blocked (but allow from cancelled/rejected)
      IF NEW.status = 'pending' AND OLD.status NOT IN ('cancelled', 'rejected') THEN
        RAISE EXCEPTION 'Cannot revert to pending from this state';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'accepted' THEN
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := timezone('utc', now());
    END IF;
  ELSE
    NEW.accepted_at := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, timezone('utc', now()));
  END IF;

  RETURN NEW;
END;
$$;

-- Update the RLS policy to allow updating requester_id during re-friending
DROP POLICY IF EXISTS "friendships requester update" ON public.profile_friendships;
CREATE POLICY "friendships requester update"
  ON public.profile_friendships
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = requester_id
    OR (
      -- Allow either participant to re-friend when status is cancelled/rejected
      status IN ('cancelled', 'rejected')
      AND (auth.uid() = user_one OR auth.uid() = user_two)
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.uid() = requester_id
      AND status IN ('pending', 'cancelled', 'rejected', 'blocked')
    )
  );

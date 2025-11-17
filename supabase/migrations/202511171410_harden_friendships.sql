-- Enforce participant immutability and stricter status transitions for friendships
BEGIN;

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

      IF NEW.user_one <> OLD.user_one OR NEW.user_two <> OLD.user_two OR NEW.requester_id <> OLD.requester_id THEN
        RAISE EXCEPTION 'Friendship participants are immutable';
      END IF;

      IF NEW.status = 'accepted' THEN
        IF OLD.status <> 'pending' THEN
          RAISE EXCEPTION 'Only pending friendships can be accepted';
        END IF;
        IF actor_id = OLD.requester_id THEN
          RAISE EXCEPTION 'Requester cannot accept their own friendship request';
        END IF;
      END IF;

      IF NEW.status IN ('cancelled', 'rejected') AND actor_id <> OLD.requester_id THEN
        RAISE EXCEPTION 'Only the requester can cancel or reject a friendship';
      END IF;

      IF NEW.status = 'pending' AND OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Friendships cannot revert to pending';
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

DROP POLICY IF EXISTS "friendships update" ON public.profile_friendships;
DROP POLICY IF EXISTS "friendships requester update" ON public.profile_friendships;
DROP POLICY IF EXISTS "friendships recipient update" ON public.profile_friendships;

CREATE POLICY "friendships requester update"
  ON public.profile_friendships
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = requester_id
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.uid() = requester_id
      AND status IN ('pending', 'cancelled', 'rejected', 'blocked')
    )
  );

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
      AND status IN ('accepted', 'blocked')
    )
  );

COMMIT;

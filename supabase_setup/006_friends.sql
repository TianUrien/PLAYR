CREATE TYPE IF NOT EXISTS public.friendship_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'blocked'
);

CREATE TABLE IF NOT EXISTS public.profile_friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  user_two UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  accepted_at TIMESTAMPTZ,
  pair_key_lower UUID GENERATED ALWAYS AS (LEAST(user_one, user_two)) STORED,
  pair_key_upper UUID GENERATED ALWAYS AS (GREATEST(user_one, user_two)) STORED,
  CONSTRAINT profile_friendships_participants_different CHECK (user_one <> user_two),
  CONSTRAINT profile_friendships_requester_in_pair CHECK (requester_id = user_one OR requester_id = user_two)
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_friendships_pair_key_idx
  ON public.profile_friendships (pair_key_lower, pair_key_upper);

CREATE INDEX IF NOT EXISTS profile_friendships_status_idx ON public.profile_friendships (status);
CREATE INDEX IF NOT EXISTS profile_friendships_requester_idx ON public.profile_friendships (requester_id);

CREATE OR REPLACE FUNCTION public.handle_friendship_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_one = NEW.user_two THEN
    RAISE EXCEPTION 'Cannot create friendship with yourself';
  END IF;

  IF NEW.requester_id IS NULL OR (NEW.requester_id <> NEW.user_one AND NEW.requester_id <> NEW.user_two) THEN
    RAISE EXCEPTION 'Requester must be part of the friendship';
  END IF;

  IF NEW.status = 'accepted' THEN
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := timezone('utc', now());
    END IF;
  ELSE
    NEW.accepted_at := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := coalesce(NEW.created_at, timezone('utc', now()));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_friendships_handle_state
BEFORE INSERT OR UPDATE ON public.profile_friendships
FOR EACH ROW EXECUTE FUNCTION public.handle_friendship_state();

CREATE TRIGGER profile_friendships_set_updated_at
BEFORE UPDATE ON public.profile_friendships
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE VIEW public.profile_friend_edges AS
SELECT
  pf.id,
  pf.user_one,
  pf.user_two,
  pf.requester_id,
  pf.status,
  pf.created_at,
  pf.updated_at,
  pf.accepted_at,
  pf.pair_key_lower,
  pf.pair_key_upper,
  pf.user_one AS profile_id,
  pf.user_two AS friend_id
FROM public.profile_friendships pf
UNION ALL
SELECT
  pf.id,
  pf.user_one,
  pf.user_two,
  pf.requester_id,
  pf.status,
  pf.created_at,
  pf.updated_at,
  pf.accepted_at,
  pf.pair_key_lower,
  pf.pair_key_upper,
  pf.user_two AS profile_id,
  pf.user_one AS friend_id
FROM public.profile_friendships pf;

ALTER TABLE public.profile_friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "friendships readable"
  ON public.profile_friendships
  FOR SELECT
  USING (
    status = 'accepted'
    OR auth.uid() = user_one
    OR auth.uid() = user_two
    OR auth.role() = 'service_role'
  );

CREATE POLICY IF NOT EXISTS "friendships insert"
  ON public.profile_friendships
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.uid() = requester_id
      AND (auth.uid() = user_one OR auth.uid() = user_two)
      AND status = 'pending'
    )
  );

CREATE POLICY IF NOT EXISTS "friendships update"
  ON public.profile_friendships
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = user_one
    OR auth.uid() = user_two
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.uid() = user_one
    OR auth.uid() = user_two
  );

CREATE POLICY IF NOT EXISTS "friendships delete"
  ON public.profile_friendships
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = user_one
    OR auth.uid() = user_two
  );

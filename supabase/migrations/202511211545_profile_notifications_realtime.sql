set search_path = public;

-- Ensure notification fan-out table is replicated via Realtime
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_notifications';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;
$$;

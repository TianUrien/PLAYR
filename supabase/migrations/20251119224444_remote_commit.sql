set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_concurrent_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    PERFORM pg_sleep(0.05); -- discourage rapid conflicting uploads
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_conversation_participants()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  tmp UUID;
BEGIN
  IF NEW.participant_one_id > NEW.participant_two_id THEN
    tmp := NEW.participant_one_id;
    NEW.participant_one_id := NEW.participant_two_id;
    NEW.participant_two_id := tmp;
  END IF;
  RETURN NEW;
END;
$function$
;



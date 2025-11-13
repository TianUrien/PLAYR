drop extension if exists "pg_net";

drop policy "Clubs can manage their vacancies" on "public"."vacancies";

drop policy "Applicants can create applications" on "public"."vacancy_applications";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cleanup_stale_locks()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Advisory locks are automatically cleaned up by PostgreSQL
  -- This function is a placeholder for future custom lock management
  RAISE NOTICE 'Advisory locks are automatically cleaned up by PostgreSQL on session end';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_vacancy_published_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'open' AND OLD.status != 'open' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  
  IF NEW.status = 'closed' AND OLD.status != 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at = now();
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_vacancies_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;


  create policy "Clubs can manage their vacancies"
  on "public"."vacancies"
  as permissive
  for all
  to public
using (((auth.uid() = club_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'club'::text))))))
with check (((auth.uid() = club_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'club'::text))))));



  create policy "Applicants can create applications"
  on "public"."vacancy_applications"
  as permissive
  for insert
  to public
with check (((auth.uid() = player_id) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['player'::text, 'coach'::text])))))));



  create policy "Authenticated users can delete avatars"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text) AND (owner = auth.uid())));



  create policy "Authenticated users can delete gallery photos"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'gallery'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can update avatars"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text) AND (owner = auth.uid())));



  create policy "Authenticated users can update gallery photos"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'gallery'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can upload avatars"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can upload gallery photos"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'gallery'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Public can view gallery photos"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'gallery'::text));




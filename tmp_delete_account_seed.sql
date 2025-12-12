BEGIN;

DROP TABLE IF EXISTS public._delete_account_test_ids;
CREATE TABLE public._delete_account_test_ids (
  label text primary key,
  user_id uuid not null,
  email text not null,
  password text not null
);

DO $$
DECLARE
  player_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  club_id uuid := gen_random_uuid();
  hashed_password text := crypt('Password123!', gen_salt('bf'));
BEGIN
  -- remove auth+profiles by email (cascades take care of children)
  DELETE FROM auth.users WHERE email IN ('delete.player@test.local','delete.other@test.local','delete.club@test.local');

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, role, aud,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
  (player_id,'00000000-0000-0000-0000-000000000000','delete.player@test.local',hashed_password,now(),now(),now(),'{"provider":"email","providers":["email"]}','{}',false,'authenticated','authenticated','','','',''),
  (other_id,'00000000-0000-0000-0000-000000000000','delete.other@test.local',hashed_password,now(),now(),now(),'{"provider":"email","providers":["email"]}','{}',false,'authenticated','authenticated','','','',''),
  (club_id,'00000000-0000-0000-0000-000000000000','delete.club@test.local',hashed_password,now(),now(),now(),'{"provider":"email","providers":["email"]}','{}',false,'authenticated','authenticated','','','','');

  INSERT INTO public.profiles (id,email,role,full_name,username,base_location,nationality,onboarding_completed,created_at,updated_at)
  VALUES
  (player_id,'delete.player@test.local','player','Delete Test Player','delete-test-player','Sydney, AU','Australia',true,now(),now()),
  (other_id,'delete.other@test.local','player','Delete Test Other','delete-test-other','Sydney, AU','Australia',true,now(),now()),
  (club_id,'delete.club@test.local','club','Delete Test Club','delete-test-club','Melbourne, AU','Australia',true,now(),now());

  INSERT INTO public.playing_history (user_id,club_name,position_role,years,division_league,highlights,entry_type,created_at,updated_at)
  VALUES (player_id,'Test HC','Midfielder','2020-2022','Div 1',ARRAY['captain'],'club',now(),now());

  INSERT INTO public.gallery_photos (user_id,photo_url,file_name,file_size,order_index,created_at,updated_at)
  VALUES (player_id,'http://127.0.0.1:54321/storage/v1/object/public/gallery/'||player_id||'/seed.jpg','seed.jpg',12345,0,now(),now());

  IF to_regclass('public.profile_friendships') IS NOT NULL THEN
    INSERT INTO public.profile_friendships (user_one,user_two,requester_id,status,created_at,updated_at)
    VALUES (player_id,other_id,player_id,'accepted',now(),now());
  END IF;

  IF to_regclass('public.profile_references') IS NOT NULL THEN
    INSERT INTO public.profile_references (requester_id,reference_id,status,created_at,updated_at)
    VALUES (player_id,other_id,'accepted',now(),now());
  END IF;

  INSERT INTO public.conversations (participant_one_id, participant_two_id, created_at, updated_at, last_message_at)
  VALUES (player_id, other_id, now(), now(), now());

  INSERT INTO public.messages (conversation_id, sender_id, content, sent_at)
  SELECT c.id, player_id, 'hello from player', now()
  FROM public.conversations c
  WHERE (c.participant_one_id = player_id AND c.participant_two_id = other_id)
     OR (c.participant_one_id = other_id AND c.participant_two_id = player_id);

  INSERT INTO public.vacancies (club_id, opportunity_type, title, position, gender, description, location_city, location_country, status, created_at, updated_at)
  VALUES (club_id, 'player', 'Delete Test Vacancy', 'midfielder', 'Men', 'Test vacancy to be deleted', 'Melbourne', 'Australia', 'open', now(), now());

  INSERT INTO public.vacancy_applications (vacancy_id, player_id, cover_letter, status, applied_at, updated_at)
  SELECT v.id, other_id, 'Applying to test vacancy', 'pending', now(), now()
  FROM public.vacancies v
  WHERE v.club_id = club_id;

  INSERT INTO public.club_media (club_id, file_url, file_name, file_size, order_index, created_at, updated_at)
  VALUES (club_id, 'http://127.0.0.1:54321/storage/v1/object/public/club-media/'||club_id||'/seed.jpg', 'seed.jpg', 23456, 0, now(), now());

  INSERT INTO public._delete_account_test_ids(label,user_id,email,password) VALUES
    ('player', player_id, 'delete.player@test.local', 'Password123!'),
    ('other', other_id, 'delete.other@test.local', 'Password123!'),
    ('club', club_id, 'delete.club@test.local', 'Password123!');
END $$;

COMMIT;

SELECT label,email,user_id FROM public._delete_account_test_ids ORDER BY label;

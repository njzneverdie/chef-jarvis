-- Link the two historical text identity columns to Supabase Auth so deleting
-- an Auth user removes every user-owned Chef Jarvis row.

drop policy if exists app_profiles_own on public.app_profiles;
drop policy if exists saved_meal_cards_own on public.saved_meal_cards;
drop policy if exists netlify_profile_insert_own on public.app_profiles;
drop policy if exists netlify_profile_select_own on public.app_profiles;
drop policy if exists netlify_profile_update_own on public.app_profiles;
drop policy if exists netlify_saved_cards_delete_own on public.saved_meal_cards;
drop policy if exists netlify_saved_cards_insert_own on public.saved_meal_cards;
drop policy if exists netlify_saved_cards_select_own on public.saved_meal_cards;
drop policy if exists netlify_saved_cards_update_own on public.saved_meal_cards;

delete from public.app_profiles profile
where profile.app_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or not exists (
     select 1
     from auth.users auth_user
     where auth_user.id::text = profile.app_user_id
   );

delete from public.saved_meal_cards card
where card.app_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or not exists (
     select 1
     from auth.users auth_user
     where auth_user.id::text = card.app_user_id
   );

alter table public.app_profiles
  alter column app_user_id type uuid using app_user_id::uuid;

alter table public.saved_meal_cards
  alter column app_user_id type uuid using app_user_id::uuid;

alter table public.app_profiles
  add constraint app_profiles_app_user_id_fkey
  foreign key (app_user_id)
  references auth.users (id)
  on delete cascade;

alter table public.saved_meal_cards
  add constraint saved_meal_cards_app_user_id_fkey
  foreign key (app_user_id)
  references auth.users (id)
  on delete cascade;

create policy app_profiles_own
on public.app_profiles
for all
to authenticated
using ((select auth.uid()) = app_user_id)
with check ((select auth.uid()) = app_user_id);

create policy saved_meal_cards_own
on public.saved_meal_cards
for all
to authenticated
using ((select auth.uid()) = app_user_id)
with check ((select auth.uid()) = app_user_id);

grant select, insert, update, delete
on table public.app_profiles, public.saved_meal_cards
to authenticated;

grant select, insert, update, delete
on table public.app_profiles, public.saved_meal_cards
to service_role;

-- Beginner features: cooking skill on the profile and quick feedback tags.
-- Both are optional; the apps keep working before this migration is applied.

alter table public.app_profiles
  add column if not exists cooking_skill text;

alter table public.app_profiles
  drop constraint if exists app_profiles_cooking_skill_check;
alter table public.app_profiles
  add constraint app_profiles_cooking_skill_check
  check (cooking_skill is null or cooking_skill in ('beginner', 'some', 'confident'));

alter table public.recipe_feedback
  add column if not exists tags text[] not null default '{}';

alter table public.recipe_feedback
  drop constraint if exists recipe_feedback_tags_check;
alter table public.recipe_feedback
  add constraint recipe_feedback_tags_check
  check (tags <@ array['too_salty', 'too_bland', 'too_hard', 'delicious']::text[]);

alter table public.nutrition_logs
  add column if not exists recipe_title text,
  add column if not exists servings_eaten numeric not null default 1,
  add column if not exists nutrition_source text not null default 'recipe_estimate',
  add column if not exists usda_coverage numeric;

create table if not exists public.recipe_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  recipe_title text not null,
  rating smallint not null check (rating between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

alter table public.recipe_feedback enable row level security;

drop policy if exists recipe_feedback_select_own on public.recipe_feedback;
create policy recipe_feedback_select_own
on public.recipe_feedback for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists recipe_feedback_insert_own on public.recipe_feedback;
create policy recipe_feedback_insert_own
on public.recipe_feedback for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists recipe_feedback_update_own on public.recipe_feedback;
create policy recipe_feedback_update_own
on public.recipe_feedback for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists recipe_feedback_delete_own on public.recipe_feedback;
create policy recipe_feedback_delete_own
on public.recipe_feedback for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.recipe_feedback from public, anon;
grant select, insert, update, delete on table public.recipe_feedback to authenticated;
grant select, insert, update, delete on table public.recipe_feedback to service_role;

create index if not exists recipe_feedback_user_created_idx
  on public.recipe_feedback (user_id, created_at desc);

create index if not exists recipe_feedback_recipe_idx
  on public.recipe_feedback (recipe_id);

create unique index if not exists meal_plans_user_week_unique
  on public.meal_plans (user_id, week_start)
  where user_id is not null;

create unique index if not exists meal_plan_items_slot_unique
  on public.meal_plan_items (meal_plan_id, scheduled_for, meal_type);

create index if not exists meal_plan_items_plan_date_idx
  on public.meal_plan_items (meal_plan_id, scheduled_for);

create index if not exists meal_plan_items_recipe_idx
  on public.meal_plan_items (recipe_id);

create index if not exists nutrition_logs_recipe_idx
  on public.nutrition_logs (recipe_id);

create index if not exists shopping_list_items_list_idx
  on public.shopping_list_items (shopping_list_id);

create index if not exists shopping_list_items_pantry_idx
  on public.shopping_list_items (pantry_item_id);

create index if not exists shopping_lists_user_idx
  on public.shopping_lists (user_id);

grant select, insert, update, delete on table public.meal_plans to authenticated;
grant select, insert, update, delete on table public.meal_plan_items to authenticated;
grant select, insert, update, delete on table public.nutrition_logs to authenticated;

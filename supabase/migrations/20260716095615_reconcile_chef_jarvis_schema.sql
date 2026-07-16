-- Production-safe reconciliation for columns that were historically created
-- in the Dashboard before the repository gained a complete schema baseline.

alter table public.shopping_list_items
  add column if not exists pantry_item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shopping_list_items_pantry_item_id_fkey'
      and conrelid = 'public.shopping_list_items'::regclass
  ) then
    alter table public.shopping_list_items
      add constraint shopping_list_items_pantry_item_id_fkey
      foreign key (pantry_item_id)
      references public.pantry_items(id)
      on delete set null;
  end if;
end
$$;

alter table public.nutrition_logs
  add column if not exists recipe_title text,
  add column if not exists servings_eaten numeric not null default 1,
  add column if not exists nutrition_source text not null default 'recipe_estimate',
  add column if not exists usda_coverage numeric;

create index if not exists shopping_list_items_pantry_idx
  on public.shopping_list_items (pantry_item_id);

create index if not exists cooking_sessions_recipe_idx
  on public.cooking_sessions (recipe_id);

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists pantry_own on public.pantry_items;
drop policy if exists netlify_pantry_select_own on public.pantry_items;
drop policy if exists netlify_pantry_insert_own on public.pantry_items;
drop policy if exists netlify_pantry_update_own on public.pantry_items;
drop policy if exists netlify_pantry_delete_own on public.pantry_items;
create policy pantry_own on public.pantry_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recipes_own on public.recipes;
create policy recipes_own on public.recipes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists shopping_lists_own on public.shopping_lists;
create policy shopping_lists_own on public.shopping_lists for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists shopping_items_own on public.shopping_list_items;
create policy shopping_items_own on public.shopping_list_items for all to authenticated
  using (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_id and list.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_id and list.user_id = (select auth.uid())
  ));

drop policy if exists meal_plans_own on public.meal_plans;
create policy meal_plans_own on public.meal_plans for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists meal_plan_items_own on public.meal_plan_items;
create policy meal_plan_items_own on public.meal_plan_items for all to authenticated
  using (exists (
    select 1 from public.meal_plans plan
    where plan.id = meal_plan_id and plan.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.meal_plans plan
    where plan.id = meal_plan_id and plan.user_id = (select auth.uid())
  ));

drop policy if exists sessions_own on public.cooking_sessions;
create policy sessions_own on public.cooking_sessions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists nutrition_own on public.nutrition_logs;
create policy nutrition_own on public.nutrition_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table
  public.profiles,
  public.pantry_items,
  public.recipes,
  public.shopping_lists,
  public.shopping_list_items,
  public.meal_plans,
  public.meal_plan_items,
  public.cooking_sessions,
  public.nutrition_logs
to authenticated;

-- Reconstructed from the production schema so a fresh `supabase db reset`
-- creates every table used by the web application before later migrations run.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  dietary_preferences text[] not null default '{}',
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  equipment text[] not null default '{}',
  goal text not null default 'balanced',
  daily_calorie_target integer,
  daily_protein_target integer,
  default_servings integer not null default 2 check (default_servings between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_profiles (
  app_user_id text primary key,
  mode text not null default 'calculated' check (mode in ('calculated', 'custom')),
  height_cm numeric,
  weight_kg numeric,
  age integer,
  biological_sex text,
  activity_level text,
  goal text,
  weekly_goal_kg numeric,
  calorie_target integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dietary_preferences text[] not null default '{}',
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  body_composition_goal text not null default 'maintain'
    check (body_composition_goal in ('maintain', 'fat_loss', 'muscle_gain', 'recomposition')),
  equipment text[] not null default '{}'
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  storage_zone text not null default 'fridge'
    check (storage_zone in ('fridge', 'freezer', 'pantry')),
  expires_on date,
  source text not null default 'manual'
    check (source in ('manual', 'scan', 'shopping_list')),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  app_user_id text
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  servings integer not null default 2,
  minutes integer,
  cuisine text,
  recipe jsonb not null default '{}',
  nutrition jsonb not null default '{}',
  adaptations jsonb not null default '[]',
  is_saved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  app_user_id text
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  title text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  store text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  app_user_id text
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  ingredient text not null,
  quantity numeric,
  unit text,
  category text not null default 'pantry',
  is_checked boolean not null default false,
  pantry_item_id uuid references public.pantry_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  budget_cents integer,
  target jsonb not null default '{}',
  created_at timestamptz not null default now(),
  app_user_id text,
  unique (user_id, week_start)
);

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  scheduled_for date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  servings integer not null default 2,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed', 'abandoned')),
  current_step integer not null default 0,
  timers jsonb not null default '[]',
  timeline jsonb not null default '[]',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  app_user_id text
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  eaten_on date not null default current_date,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz not null default now(),
  app_user_id text,
  recipe_title text,
  servings_eaten numeric not null default 1,
  nutrition_source text not null default 'recipe_estimate',
  usda_coverage numeric
);

create table if not exists public.saved_meal_cards (
  id uuid primary key default gen_random_uuid(),
  app_user_id text not null,
  title text not null,
  uses text[] not null default '{}',
  why text,
  minutes integer,
  kcal integer,
  protein integer,
  source_recipe_title text,
  saved_for_week boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_profiles enable row level security;
alter table public.pantry_items enable row level security;
alter table public.recipes enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.cooking_sessions enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.saved_meal_cards enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy app_profiles_own on public.app_profiles for all to authenticated
  using ((select auth.uid())::text = app_user_id)
  with check ((select auth.uid())::text = app_user_id);
create policy pantry_own on public.pantry_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy recipes_own on public.recipes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shopping_lists_own on public.shopping_lists for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shopping_items_own on public.shopping_list_items for all to authenticated
  using (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_id and list.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_id and list.user_id = (select auth.uid())
  ));
create policy meal_plans_own on public.meal_plans for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy meal_plan_items_own on public.meal_plan_items for all to authenticated
  using (exists (
    select 1 from public.meal_plans plan
    where plan.id = meal_plan_id and plan.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.meal_plans plan
    where plan.id = meal_plan_id and plan.user_id = (select auth.uid())
  ));
create policy sessions_own on public.cooking_sessions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy nutrition_own on public.nutrition_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy saved_meal_cards_own on public.saved_meal_cards for all to authenticated
  using ((select auth.uid())::text = app_user_id)
  with check ((select auth.uid())::text = app_user_id);

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

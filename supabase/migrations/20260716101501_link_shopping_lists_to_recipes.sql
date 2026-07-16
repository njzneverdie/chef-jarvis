alter table public.shopping_lists
  add column if not exists recipe_id uuid
  references public.recipes(id) on delete set null;

create index if not exists shopping_lists_recipe_idx
  on public.shopping_lists (recipe_id);

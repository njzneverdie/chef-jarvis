create index if not exists cooking_sessions_user_status_updated_idx
  on public.cooking_sessions (user_id, status, updated_at desc);

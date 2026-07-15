create table if not exists public.ai_request_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists ai_request_log_user_requested_at_idx
  on public.ai_request_log (user_id, requested_at desc);

alter table public.ai_request_log enable row level security;

revoke all on table public.ai_request_log from public, anon, authenticated;
grant select, insert, delete on table public.ai_request_log to service_role;
grant usage, select on sequence public.ai_request_log_id_seq to service_role;

create or replace function public.consume_chef_meal_plan_quota(p_user_id uuid)
returns table (allowed boolean, retry_after_seconds integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  minute_count integer;
  day_count integer;
begin
  if p_user_id is null then
    return query select false, 60, 'invalid_user';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.ai_request_log where requested_at < now() - interval '2 days';

  select count(*) into minute_count
  from public.ai_request_log
  where user_id = p_user_id and requested_at >= now() - interval '1 minute';

  if minute_count >= 5 then
    return query select false, 60, 'minute_limit';
    return;
  end if;

  select count(*) into day_count
  from public.ai_request_log
  where user_id = p_user_id and requested_at >= now() - interval '1 day';

  if day_count >= 100 then
    return query select false, 3600, 'daily_limit';
    return;
  end if;

  insert into public.ai_request_log (user_id) values (p_user_id);
  return query select true, 0, 'ok';
end;
$$;

revoke all on function public.consume_chef_meal_plan_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_chef_meal_plan_quota(uuid) to service_role;

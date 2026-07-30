alter table public.ai_request_log
  add column if not exists request_kind text not null default 'meal_plan';

create index if not exists ai_request_log_user_kind_requested_at_idx
  on public.ai_request_log (user_id, request_kind, requested_at desc);

create or replace function public.consume_chef_usda_quota(p_user_id uuid)
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

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':usda_nutrition', 0)
  );

  delete from public.ai_request_log
  where requested_at < now() - interval '2 days';

  select count(*) into minute_count
  from public.ai_request_log
  where user_id = p_user_id
    and request_kind = 'usda_nutrition'
    and requested_at >= now() - interval '1 minute';

  if minute_count >= 3 then
    return query select false, 60, 'minute_limit';
    return;
  end if;

  select count(*) into day_count
  from public.ai_request_log
  where user_id = p_user_id
    and request_kind = 'usda_nutrition'
    and requested_at >= now() - interval '1 day';

  if day_count >= 30 then
    return query select false, 3600, 'daily_limit';
    return;
  end if;

  insert into public.ai_request_log (user_id, request_kind)
  values (p_user_id, 'usda_nutrition');

  return query select true, 0, 'ok';
end;
$$;

revoke all on function public.consume_chef_usda_quota(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_chef_usda_quota(uuid)
  to service_role;

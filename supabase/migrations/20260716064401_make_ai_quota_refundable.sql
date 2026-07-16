alter table public.ai_request_log
  add column if not exists request_id uuid;

create unique index if not exists ai_request_log_request_id_idx
  on public.ai_request_log (request_id)
  where request_id is not null;

create function public.consume_chef_meal_plan_quota(
  p_user_id uuid,
  p_request_id uuid
)
returns table (allowed boolean, retry_after_seconds integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  minute_count integer;
  day_count integer;
begin
  if p_user_id is null or p_request_id is null then
    return query select false, 60, 'invalid_request';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.ai_request_log
  where requested_at < now() - interval '2 days';

  select count(*) into minute_count
  from public.ai_request_log
  where user_id = p_user_id
    and requested_at >= now() - interval '1 minute';

  if minute_count >= 5 then
    return query select false, 60, 'minute_limit';
    return;
  end if;

  select count(*) into day_count
  from public.ai_request_log
  where user_id = p_user_id
    and requested_at >= now() - interval '1 day';

  if day_count >= 100 then
    return query select false, 3600, 'daily_limit';
    return;
  end if;

  insert into public.ai_request_log (user_id, request_id)
  values (p_user_id, p_request_id);
  return query select true, 0, 'ok';
end;
$$;

create or replace function public.refund_chef_meal_plan_quota(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  refunded boolean;
begin
  if p_user_id is null or p_request_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  with deleted as (
    delete from public.ai_request_log
    where user_id = p_user_id and request_id = p_request_id
    returning 1
  )
  select exists(select 1 from deleted) into refunded;
  return refunded;
end;
$$;

revoke all on function public.consume_chef_meal_plan_quota(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_chef_meal_plan_quota(uuid, uuid)
  to service_role;

revoke all on function public.refund_chef_meal_plan_quota(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.refund_chef_meal_plan_quota(uuid, uuid)
  to service_role;

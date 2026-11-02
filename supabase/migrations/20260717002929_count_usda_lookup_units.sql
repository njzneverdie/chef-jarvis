alter table public.ai_request_log
  add column if not exists request_units integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_request_log_request_units_check'
      and conrelid = 'public.ai_request_log'::regclass
  ) then
    alter table public.ai_request_log
      add constraint ai_request_log_request_units_check
      check (request_units between 1 and 30);
  end if;
end
$$;

drop function if exists public.consume_chef_usda_quota(uuid);

create or replace function public.consume_chef_usda_quota(
  p_user_id uuid,
  p_lookup_count integer
)
returns table (allowed boolean, retry_after_seconds integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_units integer := greatest(1, least(coalesce(p_lookup_count, 1), 30));
  minute_units integer;
  day_units integer;
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

  select coalesce(sum(request_units), 0)::integer into minute_units
  from public.ai_request_log
  where user_id = p_user_id
    and request_kind = 'usda_nutrition'
    and requested_at >= now() - interval '1 minute';

  if minute_units + requested_units > 60 then
    return query select false, 60, 'minute_unit_limit';
    return;
  end if;

  select coalesce(sum(request_units), 0)::integer into day_units
  from public.ai_request_log
  where user_id = p_user_id
    and request_kind = 'usda_nutrition'
    and requested_at >= now() - interval '1 day';

  if day_units + requested_units > 300 then
    return query select false, 3600, 'daily_unit_limit';
    return;
  end if;

  insert into public.ai_request_log (user_id, request_kind, request_units)
  values (p_user_id, 'usda_nutrition', requested_units);

  return query select true, 0, 'ok';
end;
$$;

revoke all on function public.consume_chef_usda_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_chef_usda_quota(uuid, integer)
  to service_role;

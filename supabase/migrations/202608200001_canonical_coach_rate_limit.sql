begin;

create function public.consume_coach_rate_limit(
  p_user_id text,
  p_feature text,
  p_request_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  bucket public.coach_rate_limit_buckets%rowtype;
  retry_seconds integer;
begin
  if p_user_id is null
     or pg_catalog.btrim(p_user_id) = ''
     or p_user_id <> pg_catalog.btrim(p_user_id) then
    raise exception using
      errcode = '22023',
      message = 'invalid rate limit user';
  end if;

  if p_feature is null
     or pg_catalog.btrim(p_feature) = ''
     or p_feature <> pg_catalog.btrim(p_feature) then
    raise exception using
      errcode = '22023',
      message = 'invalid rate limit feature';
  end if;

  if p_request_limit is null
     or p_request_limit < 1
     or p_window_seconds is null
     or p_window_seconds < 1 then
    raise exception using
      errcode = '22023',
      message = 'rate limit values must be positive';
  end if;

  insert into public.coach_rate_limit_buckets (
    user_id,
    feature,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_user_id,
    p_feature,
    v_now,
    0,
    v_now
  )
  on conflict (user_id, feature) do nothing;

  select rate_bucket.*
  into strict bucket
  from public.coach_rate_limit_buckets rate_bucket
  where rate_bucket.user_id = p_user_id
    and rate_bucket.feature = p_feature
  for update;

  if bucket.window_started_at
       <= v_now - pg_catalog.make_interval(secs => p_window_seconds) then
    update public.coach_rate_limit_buckets rate_bucket
    set
      window_started_at = v_now,
      request_count = 1,
      updated_at = v_now
    where rate_bucket.user_id = p_user_id
      and rate_bucket.feature = p_feature;

    return query
    select
      true,
      case when p_request_limit > 1 then p_request_limit - 1 else 0 end,
      p_window_seconds;
    return;
  end if;

  retry_seconds := pg_catalog.ceil(
    extract(
      epoch from (
        bucket.window_started_at
        + pg_catalog.make_interval(secs => p_window_seconds)
        - v_now
      )
    )
  )::integer;
  if retry_seconds < 1 then
    retry_seconds := 1;
  end if;

  if bucket.request_count >= p_request_limit then
    return query select false, 0, retry_seconds;
    return;
  end if;

  update public.coach_rate_limit_buckets rate_bucket
  set
    request_count = rate_bucket.request_count + 1,
    updated_at = v_now
  where rate_bucket.user_id = p_user_id
    and rate_bucket.feature = p_feature;

  return query
  select
    true,
    case
      when p_request_limit - bucket.request_count - 1 > 0
        then p_request_limit - bucket.request_count - 1
      else 0
    end,
    retry_seconds;
end
$function$;

grant create on schema public to reflab_rls_owner;
alter function public.consume_coach_rate_limit(text, text, integer, integer)
  owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

revoke all on function public.consume_coach_rate_limit(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.consume_coach_rate_limit(
  text,
  text,
  integer,
  integer
) to service_role;

do $verification$
declare
  function_oid oid;
begin
  if pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  ) then
    raise exception 'reflab_rls_owner retained CREATE on public';
  end if;

  select procedure.oid
  into function_oid
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname = 'consume_coach_rate_limit'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_user_id text, p_feature text, p_request_limit integer, p_window_seconds integer'
    and owner_role.rolname = 'reflab_rls_owner'
    and procedure.prosecdef = false
    and procedure.proconfig = array['search_path=pg_catalog'];

  if function_oid is null then
    raise exception 'Canonical Coach rate-limit RPC security configuration is invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    function_oid,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    function_oid,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    function_oid,
    'EXECUTE'
  ) then
    raise exception 'Canonical Coach rate-limit RPC execution grants are invalid';
  end if;
end
$verification$;

commit;

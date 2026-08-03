-- Resolve Clerk Development subjects before access records are provisioned.
-- This migration depends on 202607300001_clerk_identity_links.sql.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if not exists (
    select 1
    from reflab_meta.reflab_schema_state schema_state
    where schema_state.installation_status = 'installed'
      and schema_state.environment = 'development'
  ) or pg_catalog.to_regclass(
    'reflab_private.user_identity_links'
  ) is null then
    raise exception
      'Development identity resolution requires the identity-link migration';
  end if;
end
$preflight$;

create function public.resolve_development_clerk_identity(
  p_external_subject text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_subject text;
  canonical_user_id text;
begin
  normalized_subject := nullif(
    pg_catalog.btrim(p_external_subject),
    ''
  );

  if normalized_subject is null
     or normalized_subject <> p_external_subject
     or pg_catalog.char_length(normalized_subject) > 255 then
    raise exception 'Invalid Clerk identity subject'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from reflab_meta.reflab_schema_state schema_state
    where schema_state.installation_status = 'installed'
      and schema_state.environment = 'development'
  ) then
    raise exception 'Development schema marker is invalid'
      using errcode = '55000';
  end if;

  select identity_link.user_id
  into canonical_user_id
  from reflab_private.user_identity_links identity_link
  where identity_link.provider = 'clerk'
    and identity_link.external_subject = normalized_subject;

  return canonical_user_id;
end;
$function$;

alter function public.resolve_development_clerk_identity(text)
  owner to reflab_rls_owner;

revoke all on function
  public.resolve_development_clerk_identity(text)
from public, anon, authenticated;

grant execute on function
  public.resolve_development_clerk_identity(text)
to service_role;

commit;

notify pgrst, 'reload schema';

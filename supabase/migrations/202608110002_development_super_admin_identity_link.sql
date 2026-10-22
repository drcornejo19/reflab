-- Development-only fixed link for the synthetic canonical Super Admin.
-- This migration must run after 202608110001_canonical_admin_user_access.sql.

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
  ) is null or pg_catalog.to_regprocedure(
    'public.link_development_clerk_identity(text)'
  ) is null then
    raise exception
      'Development Super Admin linking requires the canonical identity linker';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles role
    where role.rolname = 'reflab_rls_owner'
      and not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolbypassrls
  ) then
    raise exception 'Canonical RLS owner is missing or unsafe'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'reflab_private.user_identity_links'::pg_catalog.regclass
      and constraint_row.conname = 'user_identity_links_pkey'
      and constraint_row.contype = 'p'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'PRIMARY KEY (provider, external_subject)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'reflab_private.user_identity_links'::pg_catalog.regclass
      and constraint_row.conname = 'user_identity_links_provider_user_key'
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'UNIQUE (provider, user_id)'
  ) then
    raise exception 'Canonical identity uniqueness constraints are missing'
      using errcode = '55000';
  end if;
end
$preflight$;

create policy user_identity_links_super_admin_rls_owner_insert
on reflab_private.user_identity_links
for insert
to reflab_rls_owner
with check (
  provider = 'clerk'
  and user_id = 'user_dev_super_admin'
);

create policy user_profiles_super_admin_identity_rls_owner_read
on public.user_profiles
for select
to reflab_rls_owner
using (
  user_id = 'user_dev_super_admin'
  or user_id = pg_catalog.current_setting(
    'reflab.super_admin_identity_linker_subject',
    true
  )
);

create policy user_subscriptions_super_admin_identity_rls_owner_read
on public.user_subscriptions
for select
to reflab_rls_owner
using (
  user_id = 'user_dev_super_admin'
  or user_id = pg_catalog.current_setting(
    'reflab.super_admin_identity_linker_subject',
    true
  )
);

create function public.link_development_super_admin_clerk_identity(
  p_external_subject text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  target_user_id constant text := 'user_dev_super_admin';
  normalized_subject text;
  existing_user_id text;
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

  if normalized_subject = target_user_id then
    return 'conflict';
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

  perform pg_catalog.set_config(
    'reflab.super_admin_identity_linker_subject',
    normalized_subject,
    true
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reflab-development-identity:' || target_user_id,
      0
    )
  );

  if not exists (
    select 1
    from public.user_profiles profile
    join public.user_global_roles global_role
      on global_role.user_id = profile.user_id
    join public.user_subscriptions subscription
      on subscription.user_id = profile.user_id
    where profile.user_id = target_user_id
      and profile.email = 'super-admin@reflab.example.invalid'
      and profile.category = 'development'
      and profile.ref_card_id = 'RF-DEV-SA'
      and global_role.role_key = 'super_admin'
      and global_role.source = 'development_seed'
      and subscription.plan_key = 'pro'
      and subscription.status = 'active'
      and subscription.source = 'development_seed'
  ) then
    raise exception 'Synthetic Development Super Admin is unavailable'
      using errcode = '55000';
  end if;

  select identity_link.user_id
  into existing_user_id
  from reflab_private.user_identity_links identity_link
  where identity_link.provider = 'clerk'
    and identity_link.external_subject = normalized_subject;

  if found then
    if existing_user_id = target_user_id then
      return 'already_linked';
    end if;

    return 'conflict';
  end if;

  if exists (
    select 1
    from reflab_private.user_identity_links identity_link
    where identity_link.provider = 'clerk'
      and identity_link.user_id = target_user_id
  ) then
    return 'conflict';
  end if;

  if exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = normalized_subject
  ) or exists (
    select 1
    from public.user_global_roles global_role
    where global_role.user_id = normalized_subject
  ) or exists (
    select 1
    from public.user_subscriptions subscription
    where subscription.user_id = normalized_subject
  ) or exists (
    select 1
    from public.institution_memberships membership
    where membership.user_id = normalized_subject
  ) then
    return 'conflict';
  end if;

  insert into reflab_private.user_identity_links (
    provider,
    external_subject,
    user_id
  )
  values (
    'clerk',
    normalized_subject,
    target_user_id
  );

  return 'created';
exception
  when unique_violation then
    return 'conflict';
end
$function$;

grant create on schema public to reflab_rls_owner;
alter function public.link_development_super_admin_clerk_identity(text)
  owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

do $ownership_postflight$
begin
  if pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  ) then
    raise exception 'reflab_rls_owner retained CREATE on public'
      using errcode = '55000';
  end if;
end
$ownership_postflight$;

revoke all on function
  public.link_development_super_admin_clerk_identity(text)
from public, anon, authenticated, service_role;

grant execute on function
  public.link_development_super_admin_clerk_identity(text)
to service_role;

notify pgrst, 'reload schema';

commit;

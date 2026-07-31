-- Development-only Clerk subject mapping.
-- This migration is incremental and must run after the canonical baseline.

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
  ) then
    raise exception
      'Development identity links require an installed Development baseline';
  end if;
end
$preflight$;

create table reflab_private.user_identity_links (
  provider text not null
    constraint user_identity_links_provider_check
    check (provider = 'clerk'),
  external_subject text not null
    constraint user_identity_links_external_subject_check
    check (
      external_subject = pg_catalog.btrim(external_subject)
      and pg_catalog.char_length(external_subject) between 1 and 255
    ),
  user_id text not null,
  linked_at timestamptz not null default pg_catalog.now(),
  constraint user_identity_links_pkey
    primary key (provider, external_subject),
  constraint user_identity_links_provider_user_key
    unique (provider, user_id),
  constraint user_identity_links_user_id_fkey
    foreign key (user_id)
    references public.user_profiles (user_id)
    on update restrict
    on delete restrict
);

comment on table reflab_private.user_identity_links is
  'Private equivalence between an external identity subject and RefLab canonical user_id.';

alter table reflab_private.user_identity_links enable row level security;
alter table reflab_private.user_identity_links force row level security;

grant create on schema reflab_private to reflab_rls_owner;
alter table reflab_private.user_identity_links owner to reflab_rls_owner;
revoke all on table reflab_private.user_identity_links
  from public, anon, authenticated, service_role;

grant usage on schema reflab_meta to reflab_rls_owner;
grant select on table
  reflab_meta.reflab_schema_state,
  public.user_profiles,
  public.user_subscriptions
to reflab_rls_owner;

create policy user_identity_links_rls_owner_read
on reflab_private.user_identity_links
for select
to reflab_rls_owner
using (provider = 'clerk');

create policy user_identity_links_rls_owner_insert
on reflab_private.user_identity_links
for insert
to reflab_rls_owner
with check (
  provider = 'clerk'
  and user_id = 'user_dev_referee_a'
);

create policy reflab_schema_state_identity_rls_owner_read
on reflab_meta.reflab_schema_state
for select
to reflab_rls_owner
using (
  installation_status = 'installed'
  and environment = 'development'
);

create policy user_profiles_identity_rls_owner_read
on public.user_profiles
for select
to reflab_rls_owner
using (
  user_id = 'user_dev_referee_a'
  or user_id = pg_catalog.current_setting(
    'reflab.identity_linker_subject',
    true
  )
);

create policy user_subscriptions_identity_rls_owner_read
on public.user_subscriptions
for select
to reflab_rls_owner
using (
  user_id = 'user_dev_referee_a'
  or user_id = pg_catalog.current_setting(
    'reflab.identity_linker_subject',
    true
  )
);

create or replace function reflab_private.request_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with request_subject as (
    select nullif(
      pg_catalog.btrim(
        coalesce(
          (
            coalesce(
              nullif(
                pg_catalog.btrim(
                  pg_catalog.current_setting(
                    'request.jwt.claims',
                    true
                  )
                ),
                ''
              ),
              '{}'
            )::pg_catalog.jsonb
          )->>'sub',
          ''
        )
      ),
      ''
    ) as external_subject
  ),
  resolved_identity as (
    select identity_link.user_id
    from request_subject
    join reflab_private.user_identity_links identity_link
      on identity_link.provider = 'clerk'
     and identity_link.external_subject = request_subject.external_subject
  )
  select coalesce(
    (select resolved_identity.user_id from resolved_identity),
    request_subject.external_subject
  )
  from request_subject;
$function$;

alter function reflab_private.request_user_id()
  owner to reflab_rls_owner;
revoke create on schema reflab_private from reflab_rls_owner;

revoke all on function reflab_private.request_user_id()
  from public, anon, authenticated;
grant execute on function reflab_private.request_user_id()
  to authenticated;

create function public.link_development_clerk_identity(
  p_external_subject text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  target_user_id constant text := 'user_dev_referee_a';
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
    'reflab.identity_linker_subject',
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
      and profile.email = 'referee-a@reflab.example.invalid'
      and profile.category = 'development'
      and profile.ref_card_id = 'RF-DEV-A'
      and global_role.role_key = 'referee'
      and global_role.source = 'development_seed'
      and subscription.source = 'development_seed'
  ) then
    raise exception 'Synthetic Development identity target is unavailable'
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
alter function public.link_development_clerk_identity(text)
  owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

revoke all on function public.link_development_clerk_identity(text)
  from public, anon, authenticated;
grant execute on function public.link_development_clerk_identity(text)
  to service_role;

notify pgrst, 'reload schema';

commit;

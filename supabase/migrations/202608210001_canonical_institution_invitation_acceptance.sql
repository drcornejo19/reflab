begin;

create function public.accept_canonical_institution_invitation(
  p_user_id text,
  p_invitation_membership_id uuid,
  p_verified_emails text[]
)
returns table (
  status text,
  institution_id uuid,
  membership_id uuid,
  invitation_membership_id uuid,
  roles_added integer,
  groups_added integer
)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_verified_emails text[];
  v_invitation public.institution_memberships%rowtype;
  v_membership public.institution_memberships%rowtype;
  v_membership_id uuid;
  v_invitation_email text;
  v_accepted_by_user_id text;
  v_reconciled_membership_id uuid;
  v_roles_added integer := 0;
  v_groups_added integer := 0;
begin
  if p_user_id is null
     or pg_catalog.btrim(p_user_id) = ''
     or p_user_id <> pg_catalog.btrim(p_user_id)
     or pg_catalog.length(p_user_id) > 255
     or p_invitation_membership_id is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_institution_invitation_acceptance';
  end if;

  select coalesce(
    pg_catalog.array_agg(normalized.email order by normalized.email),
    array[]::text[]
  )
  into v_verified_emails
  from (
    select distinct pg_catalog.lower(pg_catalog.btrim(email_value)) as email
    from pg_catalog.unnest(
      coalesce(p_verified_emails, array[]::text[])
    ) as email_value
    where email_value is not null
      and pg_catalog.btrim(email_value) <> ''
  ) normalized;

  if pg_catalog.cardinality(v_verified_emails) = 0 then
    raise exception using
      errcode = '22023',
      message = 'verified_email_required';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(v_verified_emails) normalized_email
    where normalized_email !~
      '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_verified_email';
  end if;

  perform profile.user_id
  from public.user_profiles profile
  where profile.user_id = p_user_id
  for key share;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'canonical_profile_required';
  end if;

  select invitation.*
  into v_invitation
  from public.institution_memberships invitation
  where invitation.id = p_invitation_membership_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'institution_invitation_not_found';
  end if;

  v_accepted_by_user_id := nullif(
    v_invitation.metadata->>'accepted_by_user_id',
    ''
  );
  if v_accepted_by_user_id is not null then
    if v_accepted_by_user_id <> p_user_id then
      raise exception using
        errcode = '42501',
        message = 'institution_invitation_forbidden';
    end if;

    begin
      v_reconciled_membership_id := coalesce(
        nullif(
          v_invitation.metadata->>'reconciled_to_membership_id',
          ''
        )::uuid,
        v_invitation.id
      );
    exception when invalid_text_representation then
      raise exception using
        errcode = '55000',
        message = 'institution_invitation_state_invalid';
    end;

    if not exists (
      select 1
      from public.institution_memberships accepted_membership
      where accepted_membership.id = v_reconciled_membership_id
        and accepted_membership.institution_id = v_invitation.institution_id
        and accepted_membership.user_id = p_user_id
        and accepted_membership.status = 'active'
    ) then
      raise exception using
        errcode = '55000',
        message = 'institution_invitation_state_invalid';
    end if;

    return query
    select
      'already_accepted'::text,
      v_invitation.institution_id,
      v_reconciled_membership_id,
      v_invitation.id,
      0,
      0;
    return;
  end if;

  if v_invitation.status <> 'invited'
     or v_invitation.user_id not like 'invitation:%' then
    raise exception using
      errcode = '55000',
      message = 'institution_invitation_not_pending';
  end if;

  v_invitation_email := pg_catalog.lower(
    pg_catalog.btrim(v_invitation.metadata->>'email')
  );
  if v_invitation_email is null
     or v_invitation_email = ''
     or not (v_invitation_email = any(v_verified_emails)) then
    raise exception using
      errcode = '42501',
      message = 'institution_invitation_email_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_invitation.institution_id::text || ':' || p_user_id,
      0
    )
  );

  select membership.*
  into v_membership
  from public.institution_memberships membership
  where membership.institution_id = v_invitation.institution_id
    and membership.user_id = p_user_id
  for update;

  if found then
    if v_membership.status = 'suspended' then
      raise exception using
        errcode = '55000',
        message = 'institution_membership_suspended';
    elsif v_membership.status = 'revoked' then
      if v_membership.revoked_at is null
         or v_invitation.invited_at is null
         or v_invitation.invited_at <= v_membership.revoked_at then
        raise exception using
          errcode = '55000',
          message = 'institution_membership_revoked';
      end if;

      update public.institution_memberships membership
      set
        status = 'active',
        joined_at = coalesce(membership.joined_at, v_now),
        suspended_at = null,
        revoked_at = null,
        updated_at = v_now
      where membership.id = v_membership.id;
    elsif v_membership.status <> 'active' then
      raise exception using
        errcode = '55000',
        message = 'institution_membership_conflict';
    end if;

    v_membership_id := v_membership.id;

    insert into public.institution_membership_roles (
      institution_id,
      membership_id,
      role_id,
      assigned_by_user_id
    )
    select
      invitation_role.institution_id,
      v_membership_id,
      invitation_role.role_id,
      invitation_role.assigned_by_user_id
    from public.institution_membership_roles invitation_role
    join public.institution_roles assigned_role
      on assigned_role.id = invitation_role.role_id
     and (
       assigned_role.institution_id is null
       or assigned_role.institution_id = v_invitation.institution_id
     )
    where invitation_role.institution_id = v_invitation.institution_id
      and invitation_role.membership_id = v_invitation.id
    on conflict on constraint institution_membership_roles_unique do nothing;
    get diagnostics v_roles_added = row_count;

    insert into public.institution_group_memberships (
      institution_id,
      group_id,
      membership_id,
      group_role,
      status,
      joined_at,
      removed_at,
      created_at,
      updated_at
    )
    select
      invitation_group.institution_id,
      invitation_group.group_id,
      v_membership_id,
      invitation_group.group_role,
      invitation_group.status,
      invitation_group.joined_at,
      invitation_group.removed_at,
      invitation_group.created_at,
      v_now
    from public.institution_group_memberships invitation_group
    where invitation_group.institution_id = v_invitation.institution_id
      and invitation_group.membership_id = v_invitation.id
      and invitation_group.status <> 'removed'
    on conflict on constraint institution_group_memberships_unique do nothing;
    get diagnostics v_groups_added = row_count;

    update public.institution_memberships invitation
    set
      status = 'revoked',
      revoked_at = v_now,
      updated_at = v_now,
      metadata = invitation.metadata || pg_catalog.jsonb_build_object(
        'accepted_at', v_now,
        'accepted_by_user_id', p_user_id,
        'reconciled_to_membership_id', v_membership_id,
        'original_invitation_membership_id', v_invitation.id
      )
    where invitation.id = v_invitation.id;
  else
    v_membership_id := v_invitation.id;

    update public.institution_memberships invitation
    set
      user_id = p_user_id,
      status = 'active',
      joined_at = coalesce(invitation.joined_at, v_now),
      suspended_at = null,
      revoked_at = null,
      updated_at = v_now,
      metadata = invitation.metadata || pg_catalog.jsonb_build_object(
        'accepted_at', v_now,
        'accepted_by_user_id', p_user_id,
        'reconciled_to_membership_id', v_invitation.id,
        'original_invitation_membership_id', v_invitation.id
      )
    where invitation.id = v_invitation.id;
  end if;

  insert into public.institution_audit_logs (
    institution_id,
    actor_user_id,
    actor_membership_id,
    action,
    scope_type,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  )
  values (
    v_invitation.institution_id,
    p_user_id,
    v_membership_id,
    'member.invitation_accepted',
    'institution',
    'institution_membership',
    v_invitation.id::text,
    pg_catalog.jsonb_build_object(
      'invitation_status', v_invitation.status
    ),
    pg_catalog.jsonb_build_object(
      'membership_id', v_membership_id,
      'membership_status', 'active'
    ),
    pg_catalog.jsonb_build_object(
      'invitation_membership_id', v_invitation.id,
      'roles_added', v_roles_added,
      'groups_added', v_groups_added,
      'source', 'canonical_invitation_acceptance'
    )
  );

  return query
  select
    'accepted'::text,
    v_invitation.institution_id,
    v_membership_id,
    v_invitation.id,
    v_roles_added,
    v_groups_added;
end
$function$;

grant create on schema public to reflab_rls_owner;
alter function public.accept_canonical_institution_invitation(
  text,
  uuid,
  text[]
) owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

revoke all on function public.accept_canonical_institution_invitation(
  text,
  uuid,
  text[]
) from public, anon, authenticated;
grant execute on function public.accept_canonical_institution_invitation(
  text,
  uuid,
  text[]
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
    and procedure.proname = 'accept_canonical_institution_invitation'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_user_id text, p_invitation_membership_id uuid, p_verified_emails text[]'
    and pg_catalog.pg_get_function_result(procedure.oid)
      = 'TABLE(status text, institution_id uuid, membership_id uuid, invitation_membership_id uuid, roles_added integer, groups_added integer)'
    and owner_role.rolname = 'reflab_rls_owner'
    and procedure.prosecdef = false
    and procedure.proconfig = array['search_path=pg_catalog'];

  if function_oid is null then
    raise exception 'Canonical institution invitation RPC security configuration is invalid';
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
    raise exception 'Canonical institution invitation RPC execution grants are invalid';
  end if;
end
$verification$;

commit;

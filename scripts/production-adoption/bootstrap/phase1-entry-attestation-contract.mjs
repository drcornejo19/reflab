import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";

export const PHASE1_ENTRY_FORMAT = "REFLAB_PRODUCTION_PHASE1_ENTRY_ATTESTATION_V1";
export const PHASE1_ENTRY_QUERY_ID = "production_phase1_entry";
export const PHASE1_FOUNDATION_ARTIFACT = "supabase/migrations/202608310001_production_adoption_foundation.sql";
export const PHASE1_FOUNDATION_SHA256 = "ddab4d23370fcfd2e4b76c6eee26aeea8edf0ad20beeb3212b7b79703b4c9b54";

export function phase1ArtifactHash(repositoryRoot) {
  return createHash("sha256")
    .update(readFileSync(resolve(repositoryRoot, PHASE1_FOUNDATION_ARTIFACT)))
    .digest("hex");
}

export function assertPhase1ArtifactHash(repositoryRoot) {
  const observed = phase1ArtifactHash(repositoryRoot);
  if (observed !== PHASE1_FOUNDATION_SHA256) {
    throw new Error("Production Phase 1 foundation artifact hash mismatch.");
  }
  return observed;
}

export const phase1EntryQuery = jsonQuery(
  PHASE1_ENTRY_QUERY_ID,
  `(with target_role as (
    select oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
    from pg_catalog.pg_roles
    where rolname = 'reflab_rls_owner'
  ), ownership as (
    select
      (select pg_catalog.count(*) from pg_catalog.pg_class object, target_role where object.relowner = target_role.oid)
      + (select pg_catalog.count(*) from pg_catalog.pg_namespace object, target_role where object.nspowner = target_role.oid)
      + (select pg_catalog.count(*) from pg_catalog.pg_proc object, target_role where object.proowner = target_role.oid)
      + (select pg_catalog.count(*) from pg_catalog.pg_database object, target_role where object.datdba = target_role.oid)
      as object_count
  ), direct_acl as (
    select pg_catalog.count(*) as entry_count
    from (
      select acl.grantee from pg_catalog.pg_class object cross join lateral pg_catalog.aclexplode(object.relacl) acl
      union all
      select acl.grantee from pg_catalog.pg_attribute object cross join lateral pg_catalog.aclexplode(object.attacl) acl
      union all
      select acl.grantee from pg_catalog.pg_namespace object cross join lateral pg_catalog.aclexplode(object.nspacl) acl
      union all
      select acl.grantee from pg_catalog.pg_proc object cross join lateral pg_catalog.aclexplode(object.proacl) acl
      union all
      select acl.grantee from pg_catalog.pg_database object cross join lateral pg_catalog.aclexplode(object.datacl) acl
      union all
      select acl.grantee from pg_catalog.pg_default_acl object
        cross join lateral pg_catalog.aclexplode(object.defaclacl) acl
    ) entry, target_role
    where entry.grantee = target_role.oid
  ), memberships as (
    select
      pg_catalog.count(*) filter (
        where granted_role.rolname = 'reflab_rls_owner'
          and member_role.rolname = 'postgres'
          and grantor_role.rolname = 'supabase_admin'
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
      ) as automatic_count,
      pg_catalog.count(*) filter (
        where granted_role.rolname = 'reflab_rls_owner'
          and member_role.rolname = 'postgres'
          and grantor_role.rolname = 'postgres'
          and not membership.admin_option
          and not membership.inherit_option
          and membership.set_option
      ) as explicit_count,
      pg_catalog.count(*) filter (
        where not (
          granted_role.rolname = 'reflab_rls_owner'
          and member_role.rolname = 'postgres'
          and ((grantor_role.rolname = 'supabase_admin' and membership.admin_option
              and not membership.inherit_option and not membership.set_option)
            or (grantor_role.rolname = 'postgres' and not membership.admin_option
              and not membership.inherit_option and membership.set_option))
        )
      ) as unexpected_count
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
    where granted_role.rolname = 'reflab_rls_owner'
      or member_role.rolname = 'reflab_rls_owner'
  ), effective_writes as (
    select
      (select pg_catalog.count(*)
       from pg_catalog.pg_class relation
       join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
       cross join target_role
       where relation.relkind in ('r', 'p')
         and namespace.nspname not in ('pg_catalog', 'information_schema')
         and (pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'INSERT')
           or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'UPDATE')
           or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'DELETE')
           or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'TRUNCATE')
           or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'REFERENCES')
           or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'TRIGGER'))) as table_count,
      (select pg_catalog.count(*)
       from pg_catalog.pg_class sequence
       join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
       cross join target_role
       where sequence.relkind = 'S'
         and namespace.nspname not in ('pg_catalog', 'information_schema')
         and (pg_catalog.has_sequence_privilege(target_role.oid, sequence.oid, 'USAGE')
           or pg_catalog.has_sequence_privilege(target_role.oid, sequence.oid, 'UPDATE'))) as sequence_count,
      (select pg_catalog.count(*)
       from pg_catalog.pg_namespace namespace
       cross join target_role
       where namespace.nspname not like 'pg_%'
         and namespace.nspname <> 'information_schema'
         and pg_catalog.has_schema_privilege(target_role.oid, namespace.oid, 'CREATE')) as schema_create_count
  )
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'role_attestation', pg_catalog.json_build_object(
      'role_present', (select pg_catalog.count(*) = 1 from target_role),
      'attributes_exact', coalesce((select not rolcanlogin and not rolsuper and not rolcreatedb
        and not rolcreaterole and not rolinherit and not rolbypassrls from target_role), false),
      'automatic_memberships', (select automatic_count from memberships),
      'explicit_memberships', (select explicit_count from memberships),
      'unexpected_memberships', (select unexpected_count from memberships),
      'owned_objects', (select object_count from ownership),
      'direct_acl_entries', (select entry_count from direct_acl),
      'effective_table_writes', (select table_count from effective_writes),
      'effective_sequence_writes', (select sequence_count from effective_writes),
      'effective_schema_create', (select schema_create_count from effective_writes),
      'comment_exact', coalesce((select pg_catalog.shobj_description(oid, 'pg_authid') =
        'NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.' from target_role), false)
    ),
    'absence', pg_catalog.json_build_object(
      'reflab_meta_absent', pg_catalog.to_regnamespace('reflab_meta') is null,
      'reflab_private_absent', pg_catalog.to_regnamespace('reflab_private') is null,
      'reflab_audit_absent', pg_catalog.to_regnamespace('reflab_audit') is null,
      'schema_state_absent', not exists (
        select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'reflab_meta' and relation.relname = 'reflab_schema_state'
      ),
      'adoption_state_absent', not exists (
        select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'reflab_meta' and relation.relname = 'production_adoption_state'
      ),
      'canonical_marker_absent', not exists (
        select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'reflab_meta' and relation.relname = 'reflab_schema_state'
      ),
      'identity_links_absent', not exists (
        select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'reflab_private' and relation.relname = 'user_identity_links'
      ),
      'development_objects_absent', not exists (
        select 1 from pg_catalog.pg_proc routine
        join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
        where namespace.nspname = 'public'
          and routine.proname in (
            'resolve_development_clerk_identity',
            'link_development_clerk_identity',
            'link_development_super_admin_clerk_identity'
          )
          and pg_catalog.pg_get_function_identity_arguments(routine.oid) = 'text'
      )
    ),
    'partial_adoption_object_count',
      (select pg_catalog.count(*) from pg_catalog.pg_roles role
       where role.rolname in ('reflab_preflight_audit_owner', 'reflab_pre_cutover_evidence_owner'))
  ))`,
);

const expectedRoleAttestation = Object.freeze({
  role_present: true,
  attributes_exact: true,
  automatic_memberships: 1,
  explicit_memberships: 1,
  unexpected_memberships: 0,
  owned_objects: 0,
  direct_acl_entries: 0,
  effective_table_writes: 0,
  effective_sequence_writes: 0,
  effective_schema_create: 0,
  comment_exact: true,
});

const expectedAbsence = Object.freeze({
  reflab_meta_absent: true,
  reflab_private_absent: true,
  reflab_audit_absent: true,
  schema_state_absent: true,
  adoption_state_absent: true,
  canonical_marker_absent: true,
  identity_links_absent: true,
  development_objects_absent: true,
});

function classifyPhase1State(payload, installerClassification, expectedCaller) {
  const role = payload?.role_attestation;
  const absence = payload?.absence;
  const complete = Boolean(payload)
    && typeof payload.caller === "string"
    && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num)
    && Boolean(role)
    && Object.keys(expectedRoleAttestation).every((field) => Object.hasOwn(role, field))
    && Boolean(absence)
    && Object.keys(expectedAbsence).every((field) => Object.hasOwn(absence, field))
    && Number.isInteger(payload.partial_adoption_object_count)
    && typeof installerClassification?.managedProfile === "string"
    && typeof installerClassification?.lifecycleState === "string";
  if (!complete) {
    return { decision: "UNKNOWN", phase1Entry: "UNKNOWN" };
  }

  const callerExact = payload.caller === expectedCaller
    && payload.session_user === expectedCaller;
  const readOnlyExact = payload.transaction_read_only === "on";
  const postgresMajorExact = Math.trunc(payload.server_version_num / 10000) === 17;
  const roleExact = Object.entries(expectedRoleAttestation).every(([field, expected]) =>
    role[field] === expected);
  const absenceExact = Object.entries(expectedAbsence).every(([field, expected]) =>
    absence[field] === expected);
  const noPartialAdoption = payload.partial_adoption_object_count === 0;
  const installerPostBootstrapReady = installerClassification.managedProfile === "READY"
    && installerClassification.lifecycleState === "POST_BOOTSTRAP";
  const ready = callerExact && readOnlyExact && postgresMajorExact && roleExact
    && absenceExact && noPartialAdoption && installerPostBootstrapReady;

  return {
    decision: ready ? "PASS" : "BLOCKER",
    phase1Entry: ready ? "READY" : "BLOCKER",
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    roleExact,
    absenceExact,
    noPartialAdoption,
    installerPostBootstrapReady,
  };
}

export function classifyPhase1Entry(payload, installerClassification) {
  return classifyPhase1State(payload, installerClassification, "reflab_prod_preflight_ro");
}

export function classifyPhase1DdlEntry(payload, installerClassification) {
  return classifyPhase1State(payload, installerClassification, "postgres");
}

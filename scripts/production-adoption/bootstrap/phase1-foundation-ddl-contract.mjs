import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import {
  PHASE1_FOUNDATION_ARTIFACT,
  PHASE1_FOUNDATION_SHA256,
} from "./phase1-entry-attestation-contract.mjs";

export const PHASE1_FOUNDATION_DDL_FORMAT = "REFLAB_PRODUCTION_PHASE1_FOUNDATION_V1";
export const PHASE1_FOUNDATION_OPERATION = "--production-phase1-foundation";
export const PHASE1_FOUNDATION_OPT_IN = "ALLOW_PRODUCTION_PHASE1_FOUNDATION";
export const PHASE1_PRODUCT_FINGERPRINT_QUERY_ID = "phase1_product_fingerprint";
export const PHASE1_POST_ATTESTATION_QUERY_ID = "phase1_foundation_post_attestation";

export function phase1FoundationHash(repositoryRoot) {
  return createHash("sha256")
    .update(readFileSync(resolve(repositoryRoot, PHASE1_FOUNDATION_ARTIFACT)))
    .digest("hex");
}

export function assertPhase1FoundationArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PHASE1_FOUNDATION_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const hash = phase1FoundationHash(repositoryRoot);
  if (hash !== PHASE1_FOUNDATION_SHA256) {
    throw new Error("Production Phase 1 foundation artifact hash mismatch.");
  }

  const createdSchemas = [...sql.matchAll(/\bcreate\s+schema\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const createdTables = [...sql.matchAll(/\bcreate\s+table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const createdFunctions = [...sql.matchAll(/\bcreate\s+function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([^)]*\))/gi)]
    .map((match) => match[1].toLowerCase());
  const createdTriggers = [...sql.matchAll(/\bcreate\s+trigger\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const insertTargets = [...sql.matchAll(/\binsert\s+into\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());

  const exact = (observed, expected) => observed.length === expected.length
    && observed.every((value, index) => value === expected[index]);
  if (!exact(createdSchemas, ["reflab_meta", "reflab_private"])
      || !exact(createdTables, [
        "reflab_meta.reflab_schema_state",
        "reflab_meta.production_adoption_state",
      ])
      || !exact(createdFunctions, [
        "reflab_meta.reject_schema_state_mutation()",
        "reflab_meta.guard_production_adoption_state()",
      ])
      || !exact(createdTriggers, [
        "reflab_schema_state_immutable",
        "production_adoption_state_guard",
      ])
      || !exact(insertTargets, ["reflab_meta.production_adoption_state"])) {
    throw new Error("Production Phase 1 foundation DDL scope drifted.");
  }
  const reviewedGuardLiterals = Object.freeze({
    "'reflab_private.user_identity_links'": 2,
    "'public.resolve_development_clerk_identity(text)'": 1,
    "'public.link_development_clerk_identity(text)'": 1,
    "'public.link_development_super_admin_clerk_identity(text)'": 1,
    "'canonical_finalized'": 1,
  });
  let forbiddenScopeScan = sql;
  for (const [literal, expectedCount] of Object.entries(reviewedGuardLiterals)) {
    const observedCount = forbiddenScopeScan.split(literal).length - 1;
    if (observedCount !== expectedCount) {
      throw new Error("Production Phase 1 reviewed guard literals drifted.");
    }
    forbiddenScopeScan = forbiddenScopeScan.replaceAll(literal, "''");
  }
  if (/\b(?:update|delete\s+from|truncate)\s+(?:table\s+)?(?:public|storage)\./i.test(sql)
      || /\binsert\s+into\s+(?:public|storage)\./i.test(sql)
      || /\b(?:create|alter|drop)\s+(?:unique\s+)?(?:table|index|trigger|policy|function|view|materialized\s+view)\b[^;]*\b(?:public|storage)\./i.test(sql)
      || /\b(?:grant|revoke)\b[^;]*\bon\b[^;]*\b(?:public|storage)\./i.test(sql)
      || /supabase_migrations|user_identity_links|resolve_development_clerk_identity|canonical_finalized/i.test(forbiddenScopeScan)
      || /\bexecute\s+(?!function\b)/i.test(sql)) {
    throw new Error("Production Phase 1 foundation contains forbidden scope.");
  }
  if (!/values\s*\(\s*1\s*,\s*'foundation'\s*,\s*null\s*,\s*'production_adoption_bridge_v1'/i.test(sql)) {
    throw new Error("Production Phase 1 foundation ledger contract drifted.");
  }
  return { path: PHASE1_FOUNDATION_ARTIFACT, sha256: hash, sql };
}

export const phase1ProductFingerprintQuery = jsonQuery(
  PHASE1_PRODUCT_FINGERPRINT_QUERY_ID,
  `pg_catalog.json_build_object(
    'attempts', (select pg_catalog.count(*) from public.attempts),
    'exam_results', (select pg_catalog.count(*) from public.exam_results),
    'notifications', (select pg_catalog.count(*) from public.notifications)
  )`,
);

export const phase1PostAttestationQuery = jsonQuery(
  PHASE1_POST_ATTESTATION_QUERY_ID,
  `(with target_role as (
    select oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
    from pg_catalog.pg_roles where rolname = 'reflab_rls_owner'
  ), target_memberships as (
    select
      pg_catalog.count(*) filter (where granted.rolname = 'reflab_rls_owner'
        and member.rolname = 'postgres' and grantor.rolname = 'supabase_admin'
        and membership.admin_option and not membership.inherit_option and not membership.set_option) as automatic_count,
      pg_catalog.count(*) filter (where granted.rolname = 'reflab_rls_owner'
        and member.rolname = 'postgres' and grantor.rolname = 'postgres'
        and not membership.admin_option and not membership.inherit_option and membership.set_option) as explicit_count,
      pg_catalog.count(*) as total_count
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted on granted.oid = membership.roleid
    join pg_catalog.pg_roles member on member.oid = membership.member
    join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
    where granted.rolname = 'reflab_rls_owner' or member.rolname = 'reflab_rls_owner'
  ), target_ownership as (
    select
      (select pg_catalog.count(*) from pg_catalog.pg_class object, target_role where object.relowner = target_role.oid)
      + (select pg_catalog.count(*) from pg_catalog.pg_namespace object, target_role where object.nspowner = target_role.oid)
      + (select pg_catalog.count(*) from pg_catalog.pg_proc object, target_role where object.proowner = target_role.oid)
      + (select pg_catalog.count(*) from pg_catalog.pg_database object, target_role where object.datdba = target_role.oid)
      as object_count
  ), target_acl as (
    select pg_catalog.count(*) as entry_count from (
      select acl.grantee from pg_catalog.pg_class object cross join lateral pg_catalog.aclexplode(object.relacl) acl
      union all select acl.grantee from pg_catalog.pg_attribute object cross join lateral pg_catalog.aclexplode(object.attacl) acl
      union all select acl.grantee from pg_catalog.pg_namespace object cross join lateral pg_catalog.aclexplode(object.nspacl) acl
      union all select acl.grantee from pg_catalog.pg_proc object cross join lateral pg_catalog.aclexplode(object.proacl) acl
      union all select acl.grantee from pg_catalog.pg_database object cross join lateral pg_catalog.aclexplode(object.datacl) acl
      union all select acl.grantee from pg_catalog.pg_default_acl object cross join lateral pg_catalog.aclexplode(object.defaclacl) acl
    ) entry, target_role where entry.grantee = target_role.oid
  ), target_effective as (
    select
      (select pg_catalog.count(*) from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace cross join target_role
        where relation.relkind in ('r', 'p') and namespace.nspname not in ('pg_catalog', 'information_schema')
          and (pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'INSERT')
            or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'UPDATE')
            or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'DELETE')
            or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'TRUNCATE')
            or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'REFERENCES')
            or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'TRIGGER'))) as table_writes,
      (select pg_catalog.count(*) from pg_catalog.pg_class sequence
        join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace cross join target_role
        where sequence.relkind = 'S' and namespace.nspname not in ('pg_catalog', 'information_schema')
          and (pg_catalog.has_sequence_privilege(target_role.oid, sequence.oid, 'USAGE')
            or pg_catalog.has_sequence_privilege(target_role.oid, sequence.oid, 'UPDATE'))) as sequence_writes,
      (select pg_catalog.count(*) from pg_catalog.pg_namespace namespace cross join target_role
        where namespace.nspname not like 'pg_%' and namespace.nspname <> 'information_schema'
          and pg_catalog.has_schema_privilege(target_role.oid, namespace.oid, 'CREATE')) as schema_create
  ), adoption_acl as (
    select pg_catalog.count(*) as unexpected_count from (
      select acl.grantee, namespace.nspname from pg_catalog.pg_namespace namespace
        cross join lateral pg_catalog.aclexplode(namespace.nspacl) acl
        where namespace.nspname in ('reflab_meta', 'reflab_private')
      union all
      select acl.grantee, namespace.nspname from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        cross join lateral pg_catalog.aclexplode(relation.relacl) acl
        where namespace.nspname in ('reflab_meta', 'reflab_private')
      union all
      select acl.grantee, namespace.nspname from pg_catalog.pg_proc routine
        join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
        cross join lateral pg_catalog.aclexplode(routine.proacl) acl
        where namespace.nspname in ('reflab_meta', 'reflab_private')
    ) entry left join pg_catalog.pg_roles grantee on grantee.oid = entry.grantee
    where entry.grantee = 0 or grantee.rolname <> 'postgres'
  )
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'schemas_exact', (select pg_catalog.count(*) = 2 and pg_catalog.bool_and(owner.rolname = 'postgres')
      from pg_catalog.pg_namespace namespace join pg_catalog.pg_roles owner on owner.oid = namespace.nspowner
      where namespace.nspname in ('reflab_meta', 'reflab_private')),
    'audit_schema_absent', pg_catalog.to_regnamespace('reflab_audit') is null,
    'tables_exact', (select pg_catalog.count(*) = 2 and pg_catalog.bool_and(owner.rolname = 'postgres' and relation.relrowsecurity and not relation.relforcerowsecurity)
      from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_catalog.pg_roles owner on owner.oid = relation.relowner
      where namespace.nspname = 'reflab_meta' and relation.relkind = 'r'
        and relation.relname in ('reflab_schema_state', 'production_adoption_state')),
    'unexpected_meta_tables', (select pg_catalog.count(*) from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'reflab_meta' and relation.relkind = 'r'
        and relation.relname not in ('reflab_schema_state', 'production_adoption_state')),
    'private_schema_empty', not exists (select 1 from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace where namespace.nspname = 'reflab_private')
      and not exists (select 1 from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace where namespace.nspname = 'reflab_private'),
    'functions_exact', (select pg_catalog.count(*) = 2 and pg_catalog.bool_and(
        pg_catalog.pg_get_function_identity_arguments(routine.oid) = '' and routine.prorettype = 'trigger'::pg_catalog.regtype
        and language.lanname = 'plpgsql' and routine.provolatile = 'v' and not routine.proisstrict
        and not routine.prosecdef and routine.proconfig = array['search_path=pg_catalog']::text[] and owner.rolname = 'postgres')
      from pg_catalog.pg_proc routine join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
      join pg_catalog.pg_language language on language.oid = routine.prolang
      join pg_catalog.pg_roles owner on owner.oid = routine.proowner
      where namespace.nspname = 'reflab_meta'
        and routine.proname in ('reject_schema_state_mutation', 'guard_production_adoption_state')),
    'unexpected_meta_functions', (select pg_catalog.count(*) from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
      where namespace.nspname = 'reflab_meta'
        and routine.proname not in ('reject_schema_state_mutation', 'guard_production_adoption_state')),
    'triggers_exact', (select pg_catalog.count(*) = 2 and pg_catalog.bool_and(
        trigger.tgenabled = 'O' and not trigger.tgisinternal and trigger.tgqual is null
        and ((trigger.tgname = 'reflab_schema_state_immutable' and relation.relname = 'reflab_schema_state'
          and trigger.tgtype = 27 and function.proname = 'reject_schema_state_mutation')
        or (trigger.tgname = 'production_adoption_state_guard' and relation.relname = 'production_adoption_state'
          and trigger.tgtype = 31 and function.proname = 'guard_production_adoption_state')))
      from pg_catalog.pg_trigger trigger join pg_catalog.pg_class relation on relation.oid = trigger.tgrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_catalog.pg_proc function on function.oid = trigger.tgfoid
      where namespace.nspname = 'reflab_meta' and not trigger.tgisinternal),
    'schema_state_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
    'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state),
    'ledger_exact', exists (select 1 from reflab_meta.production_adoption_state where phase_order = 1
      and phase_key = 'foundation' and previous_phase_key is null
      and plan_version = 'production_adoption_bridge_v1'
      and plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
      and evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'),
    'unexpected_adoption_acl', (select unexpected_count from adoption_acl),
    'rls_owner_exact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(not rolcanlogin and not rolsuper
      and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls) from target_role),
    'rls_owner_memberships_exact', (select total_count = 2 and automatic_count = 1 and explicit_count = 1 from target_memberships),
    'rls_owner_owned_objects', (select object_count from target_ownership),
    'rls_owner_direct_acl', (select entry_count from target_acl),
    'rls_owner_table_writes', (select table_writes from target_effective),
    'rls_owner_sequence_writes', (select sequence_writes from target_effective),
    'rls_owner_schema_create', (select schema_create from target_effective),
    'identity_links_absent', not exists (select 1 from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'reflab_private' and relation.relname = 'user_identity_links'),
    'development_objects_absent', not exists (select 1 from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public' and routine.proname in (
        'resolve_development_clerk_identity', 'link_development_clerk_identity',
        'link_development_super_admin_clerk_identity')),
    'phase2_infrastructure_absent', not exists (select 1 from pg_catalog.pg_roles role
      where role.rolname in ('reflab_preflight_audit_owner', 'reflab_pre_cutover_evidence_owner'))
  ))`,
);

const expectedPostBooleans = Object.freeze({
  schemas_exact: true,
  audit_schema_absent: true,
  tables_exact: true,
  private_schema_empty: true,
  functions_exact: true,
  triggers_exact: true,
  ledger_exact: true,
  rls_owner_exact: true,
  rls_owner_memberships_exact: true,
  identity_links_absent: true,
  development_objects_absent: true,
  phase2_infrastructure_absent: true,
});

const expectedPostZeros = Object.freeze([
  "unexpected_meta_tables",
  "unexpected_meta_functions",
  "schema_state_rows",
  "unexpected_adoption_acl",
  "rls_owner_owned_objects",
  "rls_owner_direct_acl",
  "rls_owner_table_writes",
  "rls_owner_sequence_writes",
  "rls_owner_schema_create",
]);

export function classifyPhase1PostAttestation(payload, installerClassification, beforeFingerprint, afterFingerprint) {
  const complete = Boolean(payload)
    && typeof payload.caller === "string"
    && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num)
    && Object.keys(expectedPostBooleans).every((field) => typeof payload[field] === "boolean")
    && expectedPostZeros.every((field) => Number.isInteger(payload[field]))
    && Number.isInteger(payload.ledger_rows)
    && beforeFingerprint && afterFingerprint
    && ["attempts", "exam_results", "notifications"].every((field) =>
      Number.isInteger(beforeFingerprint[field]) && Number.isInteger(afterFingerprint[field]))
    && typeof installerClassification?.managedProfile === "string"
    && typeof installerClassification?.lifecycleState === "string";
  if (!complete) return { decision: "UNKNOWN", phase1PostState: "UNKNOWN" };

  const callerExact = payload.caller === "postgres" && payload.session_user === "postgres";
  const readOnlyExact = payload.transaction_read_only === "on";
  const postgresMajorExact = Math.trunc(payload.server_version_num / 10000) === 17;
  const booleansExact = Object.entries(expectedPostBooleans).every(([field, expected]) => payload[field] === expected);
  const zerosExact = expectedPostZeros.every((field) => payload[field] === 0);
  const ledgerExact = payload.ledger_rows === 1;
  const productFingerprintPreserved = ["attempts", "exam_results", "notifications"]
    .every((field) => beforeFingerprint[field] === afterFingerprint[field]);
  const installerReady = installerClassification.managedProfile === "READY"
    && installerClassification.lifecycleState === "POST_BOOTSTRAP";
  const ready = callerExact && readOnlyExact && postgresMajorExact && booleansExact
    && zerosExact && ledgerExact && productFingerprintPreserved && installerReady;
  return {
    decision: ready ? "PASS" : "BLOCKER",
    phase1PostState: ready ? "EXACT" : "BLOCKER",
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    booleansExact,
    zerosExact,
    ledgerExact,
    productFingerprintPreserved,
    installerReady,
  };
}

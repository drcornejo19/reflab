import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { PHASE3_DEVELOPMENT_RPCS, PHASE3_LEGACY_IDENTITY_HELPERS } from "./phase3-security-contract.mjs";
import {
  IDENTITY_MEMBERSHIP_PRE_SQL, IDENTITY_PRE_HELPER_ACL,
  identityMembershipsExact,
} from "./phase3-identity-pre-input.mjs";

export const IDENTITY_SECURITY_BRIDGE_ARTIFACT =
  "supabase/migrations/20260901064236_production_adoption_identity_security_bridge.sql";
export const IDENTITY_SECURITY_BRIDGE_SHA256 =
  "3cf17916b711b1fc301f0bd566d8d10d69b263f398a9305a4464e673e18acb1f";
export const IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID =
  "phase3_identity_security_bridge_pre";

export const IDENTITY_SECURITY_BRIDGE_PRE_CHECKS = Object.freeze([
  "sessionExact",
  "rlsOwnerExact",
  "roleMembershipsExact",
  "canonicalIdentityFunctionsAbsent",
  "developmentIdentityObjectsAbsent",
  "legacyHelpersExact",
  "legacyHelperAclsExact",
  "directIdentityReadersExact",
  "rlsOwnerCreateAbsent",
  "browserSchemaCreateAbsent",
]);

const helperSignaturesSql = PHASE3_LEGACY_IDENTITY_HELPERS
  .map((helper) => `('${helper.signature}', '${helper.sourceHash}')`)
  .join(",\n      ");
const developmentSignaturesSql = PHASE3_DEVELOPMENT_RPCS
  .map((signature) => `'${signature}'`)
  .join(", ");

export const identitySecurityBridgePreQuery = jsonQuery(
  IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID,
  `(with expected_helpers(signature, source_hash) as (
    values
      ${helperSignaturesSql}
  ), helper_state as (
    select expected.signature, procedure.oid is not null as exists,
      coalesce(pg_catalog.pg_get_function_identity_arguments(procedure.oid), '') as identity_arguments,
      case when procedure.oid is null then null
        else pg_catalog.pg_get_function_result(procedure.oid) end as result_type,
      language.lanname as language_name, procedure.provolatile as volatility,
      procedure.proisstrict as strict_mode, procedure.prosecdef as security_definer,
      procedure.proleakproof as leakproof, procedure.prokind as function_kind,
      pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
      procedure.proconfig as configuration,
      case when procedure.oid is null then null else pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(
          pg_catalog.regexp_replace(procedure.prosrc,
            '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'UTF8'), 'sha256'), 'hex') end as source_hash,
      case when procedure.oid is null then false else
        pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'auth.jwt()') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'request.jwt.claims') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'request.jwt.claim.sub') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'auth.uid()') > 0
      end as direct_identity_reader
    from expected_helpers expected
    left join pg_catalog.pg_proc procedure
      on procedure.oid = pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_language language on language.oid = procedure.prolang
  ), helper_acl as (
    select helper.signature,
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
      grantor.rolname as grantor, acl.privilege_type, acl.is_grantable
    from helper_state helper
    join pg_catalog.pg_proc procedure on procedure.oid = pg_catalog.to_regprocedure(helper.signature)
    cross join lateral pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid = acl.grantor
  ), direct_identity_readers as (
    select namespace.nspname || '.' || procedure.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')' as signature
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'reflab_private') and procedure.prokind = 'f'
      and (
        pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'auth.jwt()') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'request.jwt.claims') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'request.jwt.claim.sub') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)), 'auth.uid()') > 0
      )
  ), protected_memberships as (
    select granted.rolname as granted_role, member_role.rolname as member_role,
      grantor.rolname as grantor_role, membership.admin_option,
      membership.inherit_option, membership.set_option
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted on granted.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
    where granted.rolname in ('anon', 'authenticated', 'service_role', 'legacy_runtime',
      'reflab_rls_owner', 'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner')
      or member_role.rolname in ('anon', 'authenticated', 'service_role', 'legacy_runtime',
        'reflab_rls_owner', 'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner')
      or granted.rolname = current_user or member_role.rolname = current_user
  ) select pg_catalog.json_build_object(
    'checks', pg_catalog.json_build_object(
      'sessionExact', current_user = 'postgres' and session_user = 'postgres'
        and pg_catalog.current_database() = 'postgres'
        and pg_catalog.current_setting('transaction_read_only') = 'on'
        and pg_catalog.current_setting('server_version_num')::integer / 10000 = 17,
      'rlsOwnerExact', coalesce((select not rolcanlogin and not rolsuper and not rolcreatedb
        and not rolcreaterole and not rolinherit and not rolbypassrls
        from pg_catalog.pg_roles where rolname = 'reflab_rls_owner'), false),
      'roleMembershipsExact', ${IDENTITY_MEMBERSHIP_PRE_SQL},
      'canonicalIdentityFunctionsAbsent',
        pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
        and pg_catalog.to_regprocedure('reflab_private.is_super_admin()') is null,
      'developmentIdentityObjectsAbsent',
        not exists (select 1 from unnest(array[${developmentSignaturesSql}]::text[]) state(signature)
          where pg_catalog.to_regprocedure(state.signature) is not null)
        and pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'directIdentityReadersExact', (select pg_catalog.count(*) = 3 from direct_identity_readers)
        and not exists(select 1 from direct_identity_readers reader
          where reader.signature not in (${PHASE3_LEGACY_IDENTITY_HELPERS.map((helper) => `'${helper.signature}'`).join(", ")})),
      'rlsOwnerCreateAbsent', not pg_catalog.has_schema_privilege(
        'reflab_rls_owner', 'reflab_private', 'CREATE'),
      'browserSchemaCreateAbsent', not pg_catalog.has_schema_privilege('anon', 'reflab_private', 'CREATE')
        and not pg_catalog.has_schema_privilege('authenticated', 'reflab_private', 'CREATE')
    ),
    'legacy_helpers', (select coalesce(pg_catalog.json_agg(state order by signature), '[]'::json)
      from helper_state state),
    'legacy_helper_acl', (select coalesce(pg_catalog.json_agg(state order by signature, grantee, privilege_type), '[]'::json)
      from helper_acl state),
    'direct_identity_readers', (select coalesce(pg_catalog.json_agg(signature order by signature), '[]'::json)
      from direct_identity_readers),
    'canonical_functions', pg_catalog.json_build_object(
      'requestUserIdPresent', pg_catalog.to_regprocedure('reflab_private.request_user_id()') is not null,
      'isSuperAdminPresent', pg_catalog.to_regprocedure('reflab_private.is_super_admin()') is not null),
    'developmentIdentityObjectsPresent',
      (select coalesce(pg_catalog.json_agg(signature order by signature), '[]'::json)
       from unnest(array[${developmentSignaturesSql}]::text[]) state(signature)
       where pg_catalog.to_regprocedure(state.signature) is not null),
    'roleMemberships', (select coalesce(pg_catalog.json_agg(state order by granted_role, member_role, grantor_role), '[]'::json)
      from protected_memberships state),
    'effectiveRelationships', (select pg_catalog.json_agg(pg_catalog.json_build_object(
      'subject_role', subject.rolname, 'target_role', target.rolname,
      'member', pg_catalog.pg_has_role(subject.oid, target.oid, 'MEMBER'),
      'usage', pg_catalog.pg_has_role(subject.oid, target.oid, 'USAGE'),
      'set', pg_catalog.pg_has_role(subject.oid, target.oid, 'SET')))
      from pg_catalog.pg_roles subject cross join pg_catalog.pg_roles target
      where (subject.rolname in ('anon', 'authenticated', 'authenticator', 'service_role')
        and target.rolname in ('postgres', 'reflab_rls_owner', 'reflab_prod_preflight_ro',
          'reflab_preflight_audit_owner', 'supabase_admin', 'supabase_privileged_role'))
        or (subject.rolname = 'postgres' and target.rolname = 'reflab_rls_owner'))
  ))`,
);

const aclFields = ["signature", "grantee", "grantor", "privilege_type", "is_grantable"];
const expectedAcl = IDENTITY_PRE_HELPER_ACL;

const key = (value, fields) => fields.map((field) => JSON.stringify(value?.[field] ?? null)).join("|");

function exactSet(observed, expected, fields) {
  if (!Array.isArray(observed) || observed.length !== expected.length) return false;
  const actual = observed.map((entry) => key(entry, fields)).sort();
  const wanted = expected.map((entry) => key(entry, fields)).sort();
  return actual.every((entry, index) => entry === wanted[index]);
}

function helpersExact(observed) {
  if (!Array.isArray(observed) || observed.length !== PHASE3_LEGACY_IDENTITY_HELPERS.length) {
    return false;
  }
  return PHASE3_LEGACY_IDENTITY_HELPERS.every((expected) => observed.some((actual) =>
    actual.signature === expected.signature && actual.exists === true
      && actual.identity_arguments === "" && actual.result_type === "text"
      && actual.language_name === "sql" && actual.volatility === "s"
      && actual.strict_mode === false && actual.security_definer === false
      && actual.leakproof === false && actual.function_kind === "f"
      && actual.owner_name === expected.owner
      && actual.configuration === null
      && actual.source_hash === expected.sourceHash && actual.direct_identity_reader === true));
}

export function classifyIdentitySecurityBridgePreState(payload) {
  const baseChecks = payload?.checks;
  if (!baseChecks || IDENTITY_SECURITY_BRIDGE_PRE_CHECKS.slice(0, 5)
    .concat(IDENTITY_SECURITY_BRIDGE_PRE_CHECKS.slice(7))
    .some((name) => typeof baseChecks[name] !== "boolean")
    || !Array.isArray(payload?.legacy_helpers) || !Array.isArray(payload?.legacy_helper_acl)
    || !Array.isArray(payload?.direct_identity_readers)
    || !payload?.canonical_functions || !Array.isArray(payload?.roleMemberships)
    || !Array.isArray(payload?.effectiveRelationships)) {
    return { classification: "UNKNOWN" };
  }
  const checks = {
    ...baseChecks,
    roleMembershipsExact: baseChecks.roleMembershipsExact === true
      && identityMembershipsExact(payload.roleMemberships, payload.effectiveRelationships),
    legacyHelpersExact: helpersExact(payload.legacy_helpers),
    legacyHelperAclsExact: exactSet(payload.legacy_helper_acl, expectedAcl, aclFields),
  };
  const exact = IDENTITY_SECURITY_BRIDGE_PRE_CHECKS.every((name) => checks[name] === true);
  return { classification: exact ? "EXACT_EXPECTED_PRE_STATE" : "BLOCKER", checks };
}

export function assertIdentitySecurityBridgeArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, IDENTITY_SECURITY_BRIDGE_ARTIFACT);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (sha256 !== IDENTITY_SECURITY_BRIDGE_SHA256) {
    throw new Error("20260901064236 artifact hash mismatch.");
  }
  return { path, sha256 };
}

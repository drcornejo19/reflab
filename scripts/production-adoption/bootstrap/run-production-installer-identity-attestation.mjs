import { pathToFileURL } from "node:url";
import { jsonQuery, buildSqlBatch } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import {
  ROLE_BOOTSTRAP_INSTALLER,
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES,
  ROLE_BOOTSTRAP_MANAGED_PROFILE_FORMAT,
  ROLE_BOOTSTRAP_MANAGED_PROJECT_REF,
  ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
  ROLE_BOOTSTRAP_PRE_BOOTSTRAP_MEMBERSHIPS,
  ROLE_BOOTSTRAP_ROLE,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
} from "./production-role-bootstrap-contract.mjs";

export const INSTALLER_IDENTITY_QUERY_ID = "production_installer_identity";
export const REJECTED_INHERITED_PG_VARIABLES = Object.freeze([
  "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE",
  "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE",
]);

export const installerIdentityQuery = jsonQuery(
  INSTALLER_IDENTITY_QUERY_ID,
  `pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'installer', coalesce((select pg_catalog.row_to_json(role_contract) from (
      select role.rolname, role.rolcanlogin, role.rolinherit, role.rolcreaterole,
        role.rolsuper, role.rolcreatedb, role.rolbypassrls, role.rolreplication
      from pg_catalog.pg_roles role
      where role.rolname = 'postgres'
    ) role_contract), 'null'::json),
    'protected_role', coalesce((select pg_catalog.row_to_json(role_contract) from (
      select role.rolname, role.rolcanlogin, role.rolinherit, role.rolcreaterole,
        role.rolsuper, role.rolcreatedb, role.rolbypassrls
      from pg_catalog.pg_roles role
      where role.rolname = 'reflab_rls_owner'
    ) role_contract), 'null'::json),
    'memberships', coalesce((select pg_catalog.json_agg(membership_contract
      order by membership_contract.granted_role, membership_contract.member_role,
        membership_contract.grantor_role) from (
      select granted_role.rolname as granted_role,
        member_role.rolname as member_role,
        grantor_role.rolname as grantor_role,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
      join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
      where granted_role.rolname in ('postgres', 'reflab_rls_owner')
        or member_role.rolname in ('postgres', 'reflab_rls_owner')
    ) membership_contract), '[]'::json),
    'membership_summary', (select pg_catalog.json_build_object(
      'total_count', pg_catalog.count(*),
      'as_member_count', pg_catalog.count(*) filter (where member_role.rolname = 'postgres'),
      'as_granted_role_count', pg_catalog.count(*) filter (where granted_role.rolname = 'postgres')
    )
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
      where granted_role.rolname in ('postgres', 'reflab_rls_owner')
        or member_role.rolname in ('postgres', 'reflab_rls_owner')),
    'database', (select pg_catalog.json_build_object(
      'name', database.datname,
      'owner', owner_role.rolname,
      'postgres_has_create', pg_catalog.has_database_privilege('postgres', database.oid, 'CREATE')
    ) from pg_catalog.pg_database database
      join pg_catalog.pg_roles owner_role on owner_role.oid = database.datdba
      where database.datname = pg_catalog.current_database()),
    'schemas', coalesce((select pg_catalog.json_agg(schema_contract order by schema_contract.schema_name)
      from (
        select namespace.nspname as schema_name,
          owner_role.rolname as owner,
          pg_catalog.has_schema_privilege('postgres', namespace.oid, 'CREATE') as postgres_has_create
        from pg_catalog.pg_namespace namespace
        join pg_catalog.pg_roles owner_role on owner_role.oid = namespace.nspowner
        where namespace.nspname in ('public', 'reflab_meta', 'reflab_private')
      ) schema_contract), '[]'::json)
  )`,
);

function membershipKey(membership) {
  return [
    membership?.granted_role,
    membership?.member_role,
    membership?.grantor_role,
    membership?.admin_option,
    membership?.inherit_option,
    membership?.set_option,
  ].join("\u0000");
}

function expectedMembershipKeys(memberships) {
  return new Set(memberships.map((membership) => membershipKey({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  })));
}

function membershipsMatch(observedMembershipKeys, observedCount, expectedMemberships) {
  const expected = expectedMembershipKeys(expectedMemberships);
  return observedCount === expected.size
    && observedMembershipKeys.size === expected.size
    && [...expected].every((key) => observedMembershipKeys.has(key));
}

export function classifyInstallerIdentity(payload) {
  const installer = payload?.installer;
  const attributeEntries = Object.entries(ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES);
  const attributesObservable = Boolean(installer)
    && typeof installer.rolname === "string"
    && attributeEntries.every(([attribute]) => typeof installer[attribute] === "boolean");
  const installerNameExact = attributesObservable && installer.rolname === ROLE_BOOTSTRAP_INSTALLER;
  const requiredAttributesExact = installerNameExact
    && attributeEntries.every(([attribute, expected]) => installer[attribute] === expected);
  const databaseCreate = payload?.database?.postgres_has_create === true;
  const memberships = Array.isArray(payload?.memberships) ? payload.memberships : null;
  const summary = payload?.membership_summary;
  const membershipShapeExact = memberships !== null && memberships.every((membership) =>
    typeof membership?.granted_role === "string"
    && typeof membership?.member_role === "string"
    && typeof membership?.grantor_role === "string"
    && typeof membership?.admin_option === "boolean"
    && typeof membership?.inherit_option === "boolean"
    && typeof membership?.set_option === "boolean");
  const membershipCompletenessProven = membershipShapeExact
    && summary?.total_count === memberships.length
    && Number.isInteger(summary?.as_member_count)
    && Number.isInteger(summary?.as_granted_role_count)
    && summary.as_member_count <= memberships.length
    && summary.as_granted_role_count <= memberships.length;
  const observedMembershipKeys = memberships === null ? new Set() : new Set(memberships.map(membershipKey));
  const protectedRoleEvidencePresent = Object.hasOwn(payload ?? {}, "protected_role");
  const protectedRole = payload?.protected_role;
  const protectedRoleAbsent = protectedRoleEvidencePresent && protectedRole === null;
  const protectedRoleObservable = Boolean(protectedRole)
    && protectedRole.rolname === ROLE_BOOTSTRAP_ROLE
    && Object.keys(ROLE_BOOTSTRAP_ROLE_ATTRIBUTES).every((attribute) =>
      typeof protectedRole[attribute] === "boolean");
  const protectedRoleExact = protectedRoleObservable
    && Object.entries(ROLE_BOOTSTRAP_ROLE_ATTRIBUTES).every(([attribute, expected]) =>
      protectedRole[attribute] === expected);
  const preBootstrapMembershipsExact = membershipCompletenessProven
    && membershipsMatch(
      observedMembershipKeys,
      memberships.length,
      ROLE_BOOTSTRAP_PRE_BOOTSTRAP_MEMBERSHIPS,
    );
  const postBootstrapMembershipsExact = membershipCompletenessProven
    && membershipsMatch(
      observedMembershipKeys,
      memberships.length,
      ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
    );
  const lifecycleState = protectedRoleAbsent && preBootstrapMembershipsExact
    ? "PRE_BOOTSTRAP"
    : protectedRoleExact && postBootstrapMembershipsExact
      ? "POST_BOOTSTRAP"
      : "UNKNOWN";
  const membershipFingerprintExact = lifecycleState !== "UNKNOWN";
  const postgresMajorExact = Number.isInteger(payload?.server_version_num)
    && Math.trunc(payload.server_version_num / 10000) === 17;
  const observable = attributesObservable
    && typeof payload?.database?.postgres_has_create === "boolean"
    && membershipCompletenessProven
    && Number.isInteger(payload?.server_version_num)
    && (protectedRoleAbsent || protectedRoleObservable);
  const decision = !observable
    ? "UNKNOWN"
    : requiredAttributesExact && databaseCreate && membershipFingerprintExact
        && postgresMajorExact && (protectedRoleAbsent || protectedRoleExact)
      ? "PASS"
      : "BLOCKER";
  return {
    format: ROLE_BOOTSTRAP_MANAGED_PROFILE_FORMAT,
    projectRef: ROLE_BOOTSTRAP_MANAGED_PROJECT_REF,
    installerNameExact,
    requiredAttributesExact,
    databaseCreate,
    lifecycleState,
    protectedRoleExact: protectedRoleAbsent ? null : protectedRoleExact,
    membershipCompletenessProven,
    membershipFingerprintExact,
    expectedMembershipCount: lifecycleState === "PRE_BOOTSTRAP"
      ? ROLE_BOOTSTRAP_PRE_BOOTSTRAP_MEMBERSHIPS.length
      : lifecycleState === "POST_BOOTSTRAP"
        ? ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.length
        : null,
    observedMembershipCount: memberships?.length ?? null,
    postgresMajorExact,
    decision,
    managedProfile: decision === "PASS" ? "READY" : decision,
  };
}

export function assertNoInheritedPgState(environment) {
  const inherited = REJECTED_INHERITED_PG_VARIABLES.filter((name) => environment[name] !== undefined);
  if (inherited.length > 0) {
    throw new Error(`Production installer identity attestation rejects inherited PostgreSQL variables: ${inherited.join(", ")}.`);
  }
  return true;
}

export function runProductionInstallerIdentityAttestation(environment = process.env, dependencies = {}) {
  assertNoInheritedPgState(environment);
  const authorize = dependencies.authorize ?? authorizeProductionPreflightTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = authorize(environment);
  const sql = buildSqlBatch([installerIdentityQuery]);
  const results = execute(sql, target.connectionEnvironment, { processEnvironment: environment });
  const payload = results.get(INSTALLER_IDENTITY_QUERY_ID);
  if (!payload || payload.caller !== "reflab_prod_preflight_ro"
      || payload.session_user !== "reflab_prod_preflight_ro") {
    throw new Error("Production installer identity attestation caller contract failed.");
  }
  return {
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    readOnly: true,
    evidence: payload,
    classification: classifyInstallerIdentity(payload),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve().then(() => runProductionInstallerIdentityAttestation())
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`PRODUCTION_INSTALLER_IDENTITY_ATTESTATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}

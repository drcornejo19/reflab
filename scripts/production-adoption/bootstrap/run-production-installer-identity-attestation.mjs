import { pathToFileURL } from "node:url";
import { jsonQuery, buildSqlBatch } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";

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
      where granted_role.rolname = 'postgres' or member_role.rolname = 'postgres'
    ) membership_contract), '[]'::json),
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

export function classifyInstallerIdentity(payload) {
  const installer = payload?.installer;
  const requiredAttributesExact = Boolean(installer)
    && installer.rolname === "postgres"
    && installer.rolcanlogin === true
    && installer.rolinherit === true
    && installer.rolcreaterole === true
    && installer.rolsuper === false
    && installer.rolcreatedb === false
    && installer.rolbypassrls === false
    && installer.rolreplication === false;
  const databaseCreate = payload?.database?.postgres_has_create === true;
  const memberships = Array.isArray(payload?.memberships) ? payload.memberships : null;
  const membershipReview = memberships === null
    ? "UNKNOWN"
    : memberships.length === 0
      ? "PASS"
      : "UNKNOWN_REQUIRES_REVIEW";
  return {
    requiredAttributesExact,
    databaseCreate,
    membershipReview,
    decision: requiredAttributesExact && databaseCreate && membershipReview === "PASS" ? "PASS" : "UNKNOWN",
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

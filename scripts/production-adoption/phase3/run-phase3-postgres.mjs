import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSemanticSidecarFixtureSql } from "../phase2b/run-phase2b-postgres.mjs";
import {
  PHASE3_DEVELOPMENT_RPCS,
  PHASE3_LEGACY_IDENTITY_HELPERS,
  PHASE3_MIGRATIONS,
  PHASE3_POLICY_MATRIX,
} from "./phase3-security-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = {
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  dropdb: join(postgresBin, "dropdb.exe"),
  pgIsReady: join(postgresBin, "pg_isready.exe"),
  psql: join(postgresBin, "psql.exe"),
};
const phase2bFixture = readFileSync(resolve(root, "scripts", "production-adoption", "phase2b", "phase2b-production-fixture.sql"), "utf8");
const phase3Fixture = readFileSync(resolve(directory, "phase3-production-fixture.sql"), "utf8");
const phase1Migrations = [
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
];
const phase2aMigration = "202608310004_production_adoption_semantic_audit.sql";
const phase2bMigrations = [
  "202608310005_production_adoption_canonical_runtime_prerequisites.sql",
  "202608110001_canonical_admin_user_access.sql",
  "202608130001_canonical_training_attempts.sql",
  "202608150001_canonical_communication_feedback.sql",
  "202608310006_production_adoption_canonical_runtime_installed.sql",
];
const reviewedTables = [
  "user_profiles", "user_global_roles", "user_subscriptions", "attempts",
  "exam_results", "rules_exam_results", "referee_exam_sessions", "notification_events",
  "match_preparations", "post_match_reviews", "psychology_checkins",
  "psychology_wellbeing_assessments", "psychology_exercise_sessions",
];
const phase3NegativeCases = [
  "phase3_unsafe_identity", "phase3_source_drift", "phase3_policy_drift", "phase3_acl_drift",
  "phase3_role_membership", "phase3_role_membership_reverse", "phase3_rls_owner_membership",
  "phase3_audit_owner_membership", "phase3_unknown_granted_to_protected",
  "phase3_protected_granted_to_unknown", "phase3_development_rpc", "phase3_rls_disabled",
  "phase3_marker", "phase3_policy_metadata_drift", "phase3_other_schema_policy_helper",
  "phase3_unknown_policy_helper",
];
const phase3ClusterRoleInventory = [
  { role: "anon", classification: "scenario_bootstrap" },
  { role: "authenticated", classification: "scenario_bootstrap" },
  { role: "service_role", classification: "scenario_bootstrap" },
  { role: "legacy_runtime", classification: "scenario_bootstrap" },
  { role: "reflab_rls_owner", classification: "scenario_bootstrap" },
  { role: "reflab_prod_preflight_ro", classification: "scenario_bootstrap" },
  { role: "reflab_preflight_audit_owner", classification: "phase2a_cluster_global_side_effect" },
];

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function scalar(output) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) throw new Error("Unexpected local Phase 3 scalar output.");
  return lines[0];
}

export function parsePhase3PostgresFailure(error) {
  const diagnostic = String(error?.stderr ?? error ?? "").match(
    /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/,
  );
  return {
    sqlstate: diagnostic?.[1] ?? "UNKNOWN",
    message: diagnostic?.[2] ?? "Local Phase 3 SQL failed.",
  };
}

export function identityReaderDiagnosticSql() {
  return `select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema', reader.schema_name,
    'function_name', reader.function_name,
    'identity', reader.rendered_identity,
    'argument_signature', reader.argument_signature,
    'classification', case
      when reader.qualified_signature = any (array[
        'public.institution_request_user_id()',
        'public.platform_request_user_id()',
        'public.reflab_request_user_id()'
      ]::text[]) then 'expected_legacy'
      when reader.qualified_signature = 'reflab_private.request_user_id()' then 'allowed_canonical'
      else 'unexpected'
    end,
    'expected', reader.qualified_signature = any (array[
      'public.institution_request_user_id()',
      'public.platform_request_user_id()',
      'public.reflab_request_user_id()',
      'reflab_private.request_user_id()'
    ]::text[])
  ) order by reader.qualified_signature), '[]'::jsonb)::text
  from (
    select
      namespace.nspname as schema_name,
      routine.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(routine.oid) as argument_signature,
      routine.oid::pg_catalog.regprocedure::text as rendered_identity,
      pg_catalog.format('%I.%I(%s)', namespace.nspname, routine.proname,
        pg_catalog.pg_get_function_identity_arguments(routine.oid)) as qualified_signature
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'reflab_private')
      and routine.prokind = 'f'
      and (
        pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.jwt()') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claims') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claim.sub') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.uid()') > 0
      )
  ) reader;`;
}

export function identityHelperContractDiagnosticSql() {
  const expectedRows = PHASE3_LEGACY_IDENTITY_HELPERS.map((helper) =>
    `('${helper.signature}', '${helper.sourceHash}')`,
  ).join(",\n      ");
  return `with expected(signature, expected_source_hash) as (
    values
      ${expectedRows}
  ), helper as (
    select
      expected.signature,
      expected.expected_source_hash,
      routine.oid,
      namespace.nspname as schema_name,
      routine.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(routine.oid) as identity_arguments,
      pg_catalog.format_type(routine.prorettype, null) as return_type,
      language.lanname as language_name,
      case routine.provolatile when 'i' then 'immutable' when 's' then 'stable' when 'v' then 'volatile' end as volatility,
      routine.prosecdef,
      pg_catalog.pg_get_userbyid(routine.proowner) as owner_name,
      coalesce(pg_catalog.to_jsonb(routine.proconfig), '[]'::pg_catalog.jsonb) as normalized_proconfig,
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_proc overload
        where overload.pronamespace = routine.pronamespace
          and overload.proname = routine.proname
          and overload.prokind = 'f'
      ) as overload_count,
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(
            pg_catalog.regexp_replace(
              routine.prosrc,
              '^[[:space:]]+|[[:space:]]+$',
              '',
              'g'
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as observed_source_hash
    from expected
    left join pg_catalog.pg_proc routine
      on routine.oid = pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    left join pg_catalog.pg_language language on language.oid = routine.prolang
  ), matrix as (
    select helper.*, contract.attribute, contract.expected_value, contract.observed_value,
      contract.expected_value = contract.observed_value as passed
    from helper
    cross join lateral (values
      ('identity_arguments', '', coalesce(helper.identity_arguments, '<null>')),
      ('return_type', 'text', coalesce(helper.return_type, '<null>')),
      ('language', 'sql', coalesce(helper.language_name, '<null>')),
      ('volatility', 'stable', coalesce(helper.volatility, '<null>')),
      ('security_definer', 'false', coalesce(helper.prosecdef::text, '<null>')),
      ('owner', 'postgres', coalesce(helper.owner_name, '<null>')),
      ('proconfig', '["search_path=pg_catalog"]', helper.normalized_proconfig::text),
      ('overload_count', '1', coalesce(helper.overload_count::text, '<null>')),
      ('source_hash', helper.expected_source_hash, coalesce(helper.observed_source_hash, '<null>'))
    ) contract(attribute, expected_value, observed_value)
  )
  select pg_catalog.jsonb_build_object(
    'helpers', coalesce((
      select pg_catalog.jsonb_agg(helper_result order by helper_result->>'signature')
      from (
        select pg_catalog.jsonb_build_object(
          'schema', max(matrix.schema_name),
          'function_name', max(matrix.function_name),
          'oid', max(matrix.oid),
          'signature', matrix.signature,
          'checks', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'attribute', matrix.attribute,
            'expected', matrix.expected_value,
            'observed', matrix.observed_value,
            'status', case when matrix.passed then 'PASS' else 'FAIL' end
          ) order by array_position(array[
            'identity_arguments', 'return_type', 'language', 'volatility', 'security_definer',
            'owner', 'proconfig', 'overload_count', 'source_hash'
          ]::text[], matrix.attribute))
        ) as helper_result
        from matrix
        group by matrix.signature
      ) results
    ), '[]'::pg_catalog.jsonb),
    'first_failure', (
      select pg_catalog.jsonb_build_object(
        'signature', matrix.signature,
        'attribute', matrix.attribute,
        'expected', matrix.expected_value,
        'observed', matrix.observed_value
      )
      from matrix
      where not matrix.passed
      order by matrix.signature, array_position(array[
        'identity_arguments', 'return_type', 'language', 'volatility', 'security_definer',
        'owner', 'proconfig', 'overload_count', 'source_hash'
      ]::text[], matrix.attribute)
      limit 1
    )
  )::text;`;
}

export function policyExpressionDiagnosticSql() {
  const sqlLiteral = (value) => value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
  const expectedRows = PHASE3_POLICY_MATRIX.map((policy, index) => `(
      ${index + 1}, 'public', '${policy.table}', '${policy.name}', '${policy.command}',
      ${sqlLiteral(policy.using)}, ${sqlLiteral(policy.withCheck)}
    )`).join(",\n    ");
  return `with expected(ordinal, schema_name, table_name, policy_name, expected_command, expected_using, expected_check) as (
    values
    ${expectedRows}
  ), observed as (
    select
      expected.*,
      policy.oid as policy_oid,
      case policy.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end as observed_command,
      policy.polpermissive as observed_permissive,
      coalesce((
        select pg_catalog.jsonb_agg(role_name order by role_name)
        from (
          select case when role_oid = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(role_oid) end as role_name
          from unnest(policy.polroles) role_oid
        ) roles
      ), '[]'::pg_catalog.jsonb) as observed_roles,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) as observed_using,
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false) as observed_check
    from expected
    left join pg_catalog.pg_class relation
      on relation.oid = pg_catalog.to_regclass(expected.schema_name || '.' || expected.table_name)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = relation.oid and policy.polname = expected.policy_name
  ), normalized as (
    select observed.*,
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(observed.observed_using, '')),
        '(^|[^a-z0-9_.])((public[.])?platform_request_user_id)[[:space:]]*[(][[:space:]]*[)]',
        E'\\1reflab_private.request_user_id()', 'g'),
        '(^|[^a-z0-9_.])((public[.])?platform_is_super_admin)[[:space:]]*[(][[:space:]]*[)]',
        E'\\1reflab_private.is_super_admin()', 'g'),
        '[[:space:]()]', '', 'g') as normalized_observed_using,
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(observed.observed_check, '')),
        '(^|[^a-z0-9_.])((public[.])?platform_request_user_id)[[:space:]]*[(][[:space:]]*[)]',
        E'\\1reflab_private.request_user_id()', 'g'),
        '[[:space:]()]', '', 'g') as normalized_observed_check,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(observed.expected_using, ''), '[[:space:]()]', '', 'g')) as normalized_expected_using,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(observed.expected_check, ''), '[[:space:]()]', '', 'g')) as normalized_expected_check
    from observed
  ), results as (
    select normalized.*,
      policy_oid is not null
        and observed_command = expected_command
        and observed_permissive
        and observed_roles = '["authenticated"]'::pg_catalog.jsonb
        and normalized_observed_using = normalized_expected_using
        and normalized_observed_check = normalized_expected_check as passed,
      case
        when coalesce(observed_using, '') || coalesce(observed_check, '') like '%institution_request_user_id%' then 'institution_request_user_id'
        when coalesce(observed_using, '') || coalesce(observed_check, '') like '%platform_request_user_id%' then 'platform_request_user_id'
        when coalesce(observed_using, '') || coalesce(observed_check, '') like '%reflab_private.request_user_id%' then 'reflab_private.request_user_id'
        else null
      end as current_identity_helper
    from normalized
  )
  select pg_catalog.jsonb_build_object(
    'policies', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'ordinal', ordinal,
      'schema', schema_name,
      'table', table_name,
      'policy_name', policy_name,
      'command', observed_command,
      'expected_command', expected_command,
      'roles', observed_roles,
      'permissive', observed_permissive,
      'observed_using', observed_using,
      'expected_using', expected_using,
      'observed_with_check', observed_check,
      'expected_with_check', expected_check,
      'normalized_observed_using', normalized_observed_using,
      'normalized_expected_using', normalized_expected_using,
      'normalized_observed_with_check', normalized_observed_check,
      'normalized_expected_with_check', normalized_expected_check,
      'identity_helper', current_identity_helper,
      'status', case when passed then 'PASS' else 'FAIL' end
    ) order by ordinal),
    'first_failure', (
      select pg_catalog.jsonb_build_object(
        'ordinal', ordinal,
        'table', table_name,
        'policy_name', policy_name,
        'identity_helper', current_identity_helper
      )
      from results where not passed order by ordinal limit 1
    )
  )::text
  from results;`;
}

function requireFailure(error, expectedSqlstate, expectedMessage, stage) {
  const diagnostic = parsePhase3PostgresFailure(error);
  if (diagnostic.sqlstate !== expectedSqlstate || !diagnostic.message.includes(expectedMessage)) {
    throw new Error(`Unexpected sanitized Phase 3 diagnostic during ${stage}.`);
  }
  return { stage, sqlstate: diagnostic.sqlstate, message: expectedMessage, status: "PASS" };
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text || ':' || coalesce(user_id, ''), ',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text || ':' || user_id || ':' || coalesce(submission_id::text, ''), ',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text || ':' || user_id, ',' order by id) from public.notification_events),
    (select pg_catalog.string_agg(user_id, ',' order by user_id) from public.user_profiles)
  ));`;
}

function securityBlockerSnapshotSql() {
  const policyRows = PHASE3_POLICY_MATRIX.map((policy) => {
    const command = { SELECT: "r", INSERT: "a", UPDATE: "w", DELETE: "d" }[policy.command];
    const normalize = (value) => String(value ?? "").toLowerCase().replace(/[\s()]/g, "");
    return `('${policy.table}', '${policy.name}', '${command}', '${normalize(policy.using)}', '${normalize(policy.withCheck)}')`;
  }).join(",\n      ");
  const tableNames = reviewedTables.map((table) => `'${table}'`).join(",");
  return `with expected_policy(table_name, policy_name, command, using_expression, check_expression) as (
    values
      ${policyRows}
  ), actual_policy as (
    select
      relation.relname as table_name,
      policy.polname as policy_name,
      policy.polcmd as command,
      policy.polpermissive,
      policy.polroles,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false), ''), '[[:space:]()]', '', 'g')) as using_expression,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false), ''), '[[:space:]()]', '', 'g')) as check_expression
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
  ), direct_identity_reader as (
    select routine.oid
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'reflab_private')
      and routine.prokind = 'f'
      and (
        pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.jwt()') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claims') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claim.sub') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.uid()') > 0
      )
      and routine.oid is distinct from pg_catalog.to_regprocedure('reflab_private.request_user_id()')::oid
  )
  select pg_catalog.jsonb_build_object(
    'rls', (select pg_catalog.count(*) from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = any (array[${tableNames}]::text[])
        and not relation.relrowsecurity),
    'missingPolicies', (select pg_catalog.count(*) from expected_policy expected
      left join actual_policy actual using (table_name, policy_name)
      where actual.policy_name is null),
    'policyDrift', (select pg_catalog.count(*) from expected_policy expected
      join actual_policy actual using (table_name, policy_name)
      where actual.command <> expected.command
        or not actual.polpermissive
        or actual.polroles <> array[pg_catalog.to_regrole('authenticated')::oid]
        or actual.using_expression <> expected.using_expression
        or actual.check_expression <> expected.check_expression),
    'browserDml', (select pg_catalog.count(*) from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) privilege
      left join pg_catalog.pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname = 'public' and relation.relname = any (array[${tableNames}]::text[])
        and (privilege.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
        and privilege.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
    'routineExecute', (select pg_catalog.count(*) from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
      cross join lateral pg_catalog.aclexplode(coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))) privilege
      left join pg_catalog.pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname in ('public', 'reflab_private', 'reflab_audit')
        and (privilege.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role'))
        and privilege.privilege_type = 'EXECUTE'),
    'schemaUsage', (select pg_catalog.count(*) from pg_catalog.pg_namespace namespace
      cross join lateral pg_catalog.aclexplode(coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) privilege
      left join pg_catalog.pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname in ('public', 'reflab_private', 'reflab_meta', 'reflab_audit')
        and (privilege.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role'))
        and privilege.privilege_type = 'USAGE'),
    'identityReaders', (select pg_catalog.count(*) from direct_identity_reader)
  )::text;`;
}

export function roleMembershipDiagnosticSql() {
  return `with protected_role as (
    select role.oid, role.rolname, role.rolinherit, role.rolcanlogin, role.rolsuper,
      role.rolbypassrls, role.rolcreatedb, role.rolcreaterole
    from pg_catalog.pg_roles role
    where role.rolname in (
      'anon', 'authenticated', 'service_role', 'legacy_runtime', 'reflab_rls_owner',
      'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner'
    ) or role.rolname = current_user
  ), protected_membership as (
    select granted.rolname as granted_role, member_role.rolname as member_role
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted on granted.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where membership.roleid in (select oid from protected_role)
       or membership.member in (select oid from protected_role)
  )
  select pg_catalog.jsonb_build_object(
    'installer_role', current_user,
    'roles', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role', role.rolname,
      'inherit', role.rolinherit,
      'can_login', role.rolcanlogin,
      'superuser', role.rolsuper,
      'bypass_rls', role.rolbypassrls,
      'create_db', role.rolcreatedb,
      'create_role', role.rolcreaterole
    ) order by role.rolname), '[]'::pg_catalog.jsonb) from protected_role role),
    'memberships', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'granted_role', membership.granted_role,
      'member_role', membership.member_role
    ) order by membership.granted_role, membership.member_role), '[]'::pg_catalog.jsonb) from protected_membership membership),
    'membership_count', (select pg_catalog.count(*) from protected_membership)
  )::text;`;
}

export async function runPhase3Postgres() {
  const diagnosticOnly = process.argv.includes("--diagnose-identity-readers");
  const contractDiagnosticOnly = process.argv.includes("--diagnose-identity-contract");
  const policyParserDiagnosticOnly = process.argv.includes("--diagnose-policy-parser");
  const policyExpressionDiagnosticOnly = process.argv.includes("--diagnose-policy-expression");
  const roleMembershipDiagnosticOnly = process.argv.includes("--diagnose-role-memberships");
  const requestedNegativeCase = process.argv.find((argument) => argument.startsWith("--negative-case="))?.split("=", 2)[1] ?? null;
  if (requestedNegativeCase !== null && !phase3NegativeCases.includes(requestedNegativeCase)) {
    throw new Error("Unknown isolated Phase 3 negative scenario.");
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-phase3-"));
  const dataDirectory = join(temporaryRoot, "data");
  const logPath = join(temporaryRoot, "postgres.log");
  const port = await reservePort();
  const environment = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PATH: process.env.PATH,
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGSSLMODE: "disable",
  };
  let serverStarted = false;
  let clusterRemoved = false;
  const created = [];

  function run(binary, args, options = {}) {
    return execFileSync(binary, args, {
      env: { ...environment, ...options.environment },
      encoding: "utf8",
      input: options.input,
      stdio: options.quiet ? "ignore" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  }
  function sql(database, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-t", "-A"], {
      environment: { PGDATABASE: database },
      input: statement,
    });
  }
  function apply(database, migration) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", resolve(migrationsDirectory, migration)], {
      environment: { PGDATABASE: database },
    });
  }
  function createDatabase(name) {
    run(binaries.createdb, [name]);
    created.push(name);
    sql(name, "create schema extensions; create extension pgcrypto with schema extensions;");
  }
  function dropDatabase(name) {
    run(binaries.dropdb, ["--if-exists", name]);
    const index = created.indexOf(name);
    if (index >= 0) created.splice(index, 1);
  }
  function cleanupCluster() {
    if (clusterRemoved) {
      return { serverStopped: true, portClosed: true, directoryRemoved: true };
    }
    for (const database of [...created].reverse()) {
      try { run(binaries.dropdb, ["--if-exists", database]); } catch { /* full cluster removal follows */ }
    }
    created.length = 0;
    if (serverStarted) {
      run(binaries.pgCtl, ["stop", "-D", dataDirectory, "-m", "immediate", "-w"], { quiet: true });
      serverStarted = false;
    }
    const readiness = spawnSync(binaries.pgIsReady, ["-h", "127.0.0.1", "-p", String(port), "-d", "postgres"], {
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    if (readiness.status === 0) throw new Error("Local Phase 3 PostgreSQL process survived cleanup.");
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("Local Phase 3 temporary cluster directory survived cleanup.");
    clusterRemoved = true;
    return { serverStopped: true, portClosed: true, directoryRemoved: true };
  }
  function setupThroughPhase2b(name) {
    sql(name, phase2bFixture);
    for (const migration of phase1Migrations.slice(0, 2)) apply(name, migration);
    apply(name, phase1Migrations[2]);
    sql(name, buildSemanticSidecarFixtureSql());
    apply(name, phase2aMigration);
    for (const migration of phase2bMigrations) apply(name, migration);
    sql(name, phase3Fixture);
  }
  function migrationFailure(name, migration, setup, expectedMessage, rollbackSql) {
    setup();
    try {
      apply(name, migration);
    } catch (error) {
      const diagnostic = requireFailure(error, "55000", expectedMessage, `negative ${migration}`);
      if (scalar(sql(name, rollbackSql)) !== "t") {
        throw new Error(`Phase 3 rollback contract failed during ${expectedMessage}.`);
      }
      return { ...diagnostic, rollback: "PASS" };
    }
    throw new Error(`Phase 3 negative migration did not abort during ${expectedMessage}.`);
  }
  function attackFailure(name, stage, statement, expectedMessage) {
    const result = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: name },
      input: statement,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status === 0) throw new Error(`Phase 3 attack unexpectedly succeeded during ${stage}.`);
    return requireFailure(result, "42501", expectedMessage, stage);
  }
  function parserProbe(statement) {
    const result = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: "postgres" },
      input: statement,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return result.status === 0
      ? { status: "PASS", sqlstate: null, message: null }
      : { status: "FAIL", ...parsePhase3PostgresFailure(result) };
  }

  function runNegativeScenario(database) {
    setupThroughPhase2b(database);
    const cleanMembershipContract = JSON.parse(scalar(sql(database, roleMembershipDiagnosticSql())));
    if (cleanMembershipContract.membership_count !== 0) {
      throw new Error("Phase 3 negative scenario bootstrap contains an unexpected protected-role membership.");
    }
    if (database === "phase3_unsafe_identity") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "create function public.unsafe_identity_reader() returns text language sql as $$ select current_setting('request.jwt.claims', true) $$;"), "Unexpected direct external identity reader", "select pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_source_drift") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, `
        create or replace function public.platform_request_user_id()
        returns text language sql stable security invoker set search_path = pg_catalog
        as $function$
          select nullif((coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb)->>'sub', '') /* reviewed contract drift */;
        $function$;
      `), "Legacy identity helper contract or source hash is unexpected", "select pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_role_membership") {
      const result = migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "grant service_role to authenticated;"), "Unexpected application role membership", "select pg_catalog.pg_has_role('authenticated','service_role','MEMBER') and pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
      sql(database, "revoke service_role from authenticated;");
      return result;
    }
    if (database === "phase3_role_membership_reverse") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "grant authenticated to service_role;"), "Unexpected application role membership", "select pg_catalog.pg_has_role('service_role','authenticated','MEMBER') and pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_rls_owner_membership") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "grant reflab_rls_owner to authenticated;"), "Unexpected application role membership", "select pg_catalog.pg_has_role('authenticated','reflab_rls_owner','MEMBER') and pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_audit_owner_membership") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "grant reflab_preflight_audit_owner to reflab_prod_preflight_ro;"), "Unexpected application role membership", "select pg_catalog.pg_has_role('reflab_prod_preflight_ro','reflab_preflight_audit_owner','MEMBER') and pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_unknown_granted_to_protected") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "create role phase3_unknown_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; grant phase3_unknown_role to authenticated;"), "Unexpected application role membership", "select pg_catalog.pg_has_role('authenticated','phase3_unknown_role','MEMBER') and pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_protected_granted_to_unknown") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "create role phase3_unknown_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; grant authenticated to phase3_unknown_role;"), "Unexpected application role membership", "select pg_catalog.pg_has_role('phase3_unknown_role','authenticated','MEMBER') and pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_development_rpc") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "create function public.resolve_development_clerk_identity(text) returns text language sql as $$ select null::text $$;"), "Development identity infrastructure is forbidden", "select pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_marker") {
      return migrationFailure(database, PHASE3_MIGRATIONS[0], () => sql(database, "insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values ('premature',repeat('a',64),repeat('b',64),'production','local',1,'installed');"), "Reviewed Phase 2B state is required", "select pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null and (select count(*) from reflab_meta.production_adoption_state)=4;");
    }
    if (database === "phase3_policy_drift") {
      apply(database, PHASE3_MIGRATIONS[0]);
      return migrationFailure(database, PHASE3_MIGRATIONS[1], () => sql(database, "drop policy user_profiles_own_read on public.user_profiles; create policy user_profiles_own_read on public.user_profiles for select to authenticated using(true);"), "Reviewed policy expression drift", "select pg_catalog.strpos(pg_catalog.pg_get_expr(polqual,polrelid,false),'true')>0 from pg_catalog.pg_policy where polrelid='public.user_profiles'::regclass and polname='user_profiles_own_read';");
    }
    if (database === "phase3_policy_metadata_drift") {
      apply(database, PHASE3_MIGRATIONS[0]);
      return migrationFailure(database, PHASE3_MIGRATIONS[1], () => sql(database, "drop policy user_profiles_own_read on public.user_profiles; create policy user_profiles_own_read on public.user_profiles as restrictive for select to authenticated using(user_id = public.platform_request_user_id() or public.platform_is_super_admin());"), "Reviewed policy metadata drift", "select not polpermissive from pg_catalog.pg_policy where polrelid='public.user_profiles'::regclass and polname='user_profiles_own_read';");
    }
    if (database === "phase3_other_schema_policy_helper") {
      apply(database, PHASE3_MIGRATIONS[0]);
      return migrationFailure(database, PHASE3_MIGRATIONS[1], () => sql(database, "create schema other_identity; create function other_identity.platform_request_user_id() returns text language sql stable security invoker set search_path=pg_catalog as $$ select reflab_private.request_user_id() $$; drop policy user_profiles_own_read on public.user_profiles; create policy user_profiles_own_read on public.user_profiles for select to authenticated using(user_id = other_identity.platform_request_user_id() or public.platform_is_super_admin());"), "Reviewed policy expression drift", "select pg_catalog.strpos(pg_catalog.pg_get_expr(polqual,polrelid,false),'other_identity.platform_request_user_id')>0 from pg_catalog.pg_policy where polrelid='public.user_profiles'::regclass and polname='user_profiles_own_read';");
    }
    if (database === "phase3_unknown_policy_helper") {
      apply(database, PHASE3_MIGRATIONS[0]);
      return migrationFailure(database, PHASE3_MIGRATIONS[1], () => sql(database, "create function public.fourth_identity_helper() returns text language sql stable security invoker set search_path=pg_catalog as $$ select reflab_private.request_user_id() $$; drop policy user_profiles_own_read on public.user_profiles; create policy user_profiles_own_read on public.user_profiles for select to authenticated using(user_id = public.fourth_identity_helper() or public.platform_is_super_admin());"), "Reviewed policy expression drift", "select pg_catalog.strpos(pg_catalog.pg_get_expr(polqual,polrelid,false),'fourth_identity_helper')>0 from pg_catalog.pg_policy where polrelid='public.user_profiles'::regclass and polname='user_profiles_own_read';");
    }
    if (database === "phase3_rls_disabled") {
      apply(database, PHASE3_MIGRATIONS[0]);
      return migrationFailure(database, PHASE3_MIGRATIONS[1], () => sql(database, "alter table public.user_profiles disable row level security;"), "RLS must remain enabled", "select not relrowsecurity from pg_catalog.pg_class where oid='public.user_profiles'::regclass;");
    }
    apply(database, PHASE3_MIGRATIONS[0]);
    apply(database, PHASE3_MIGRATIONS[1]);
    return migrationFailure(database, PHASE3_MIGRATIONS[2], () => sql(database, "grant select(user_id) on public.user_profiles to anon;"), "Unexpected PUBLIC or column ACL drift", "select pg_catalog.has_table_privilege('anon','public.user_profiles','INSERT');");
  }

  function runIsolatedNegativeScenario(scenario) {
    const childEnvironment = {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      POSTGRES_BIN: postgresBin,
    };
    let output;
    try {
      output = execFileSync(process.execPath, [fileURLToPath(import.meta.url), `--negative-case=${scenario}`], {
        env: childEnvironment,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      throw new Error(`Isolated Phase 3 negative scenario failed: ${scenario}.`);
    }
    let parsed;
    try {
      parsed = JSON.parse(String(output).trim());
    } catch {
      throw new Error(`Isolated Phase 3 negative scenario returned an invalid sanitized envelope: ${scenario}.`);
    }
    if (parsed.scenario !== scenario
        || parsed.sidecarAbsentAtStart !== "PASS"
        || parsed.cleanup?.serverStopped !== true
        || parsed.cleanup?.portClosed !== true
        || parsed.cleanup?.directoryRemoved !== true) {
      throw new Error(`Isolated Phase 3 negative scenario contract failed: ${scenario}.`);
    }
    return parsed;
  }

  const positive = "phase3_positive";

  try {
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", dataDirectory]);
    run(binaries.pgCtl, ["start", "-D", dataDirectory, "-l", logPath, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    serverStarted = true;
    if (policyParserDiagnosticOnly) {
      const probe = (groupCaseExpression) => `do $probe$
      declare
        policy_kind text := 'read';
        policy_command text := 'r';
        policy_permissive boolean := true;
        policy_roles oid[] := array[1::oid];
        authenticated_oid oid := 1;
      begin
        if policy_command <> ${groupCaseExpression ? "(" : ""}case policy_kind
             when 'read' then 'r'
             when 'insert' then 'a'
             else 'w'
           end${groupCaseExpression ? ")" : ""}
           or not policy_permissive
           or policy_roles <> array[authenticated_oid] then
          null;
        end if;
      end
      $probe$;`;
      return {
        localOnly: true,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        schemaMutations: 0,
        currentExpression: parserProbe(probe(false)),
        groupedExpression: parserProbe(probe(true)),
        foreachCaseExpression: parserProbe(`do $probe$
          declare
            policy_kind text;
            table_name text := 'read_write';
            read_write_tables text[] := array['read_write'];
          begin
            foreach policy_kind in array case when table_name = any (read_write_tables)
              then array['read', 'insert', 'update']::text[]
              else array['read']::text[] end
            loop
              null;
            end loop;
          end
          $probe$;`),
        assignmentCaseExpression: parserProbe(`do $probe$
          declare
            policy_kind text := 'read';
            expected_value text;
          begin
            expected_value := case policy_kind
              when 'read' then 'read_value'
              else ''
            end;
          end
          $probe$;`),
        cleanup: "PASS",
      };
    }
    sql("postgres", `
      create role anon nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_prod_preflight_ro login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    `);

    if (requestedNegativeCase !== null) {
      if (scalar(sql("postgres", "select pg_catalog.to_regrole('reflab_preflight_audit_owner') is null;")) !== "t") {
        throw new Error("Isolated Phase 3 negative scenario inherited the semantic audit sidecar role.");
      }
      createDatabase(requestedNegativeCase);
      const result = runNegativeScenario(requestedNegativeCase);
      const cleanup = cleanupCluster();
      return {
        localOnly: true,
        scenario: requestedNegativeCase,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        sidecarAbsentAtStart: "PASS",
        result,
        cleanup,
      };
    }

    createDatabase(positive);
    setupThroughPhase2b(positive);
    if (roleMembershipDiagnosticOnly) {
      return {
        localOnly: true,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        phase3MigrationsApplied: 0,
        roleMembershipContract: JSON.parse(scalar(sql(positive, roleMembershipDiagnosticSql()))),
        cleanup: "PASS",
      };
    }
    if (diagnosticOnly || contractDiagnosticOnly) {
      return {
        localOnly: true,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        phase3MigrationsApplied: 0,
        ...(diagnosticOnly
          ? { identityReaders: JSON.parse(scalar(sql(positive, identityReaderDiagnosticSql()))) }
          : { identityContract: JSON.parse(scalar(sql(positive, identityHelperContractDiagnosticSql()))) }),
        cleanup: "PASS",
      };
    }
    if (policyExpressionDiagnosticOnly) {
      apply(positive, PHASE3_MIGRATIONS[0]);
      return {
        localOnly: true,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        phase3MigrationsApplied: 1,
        policyExpressions: JSON.parse(scalar(sql(positive, policyExpressionDiagnosticSql()))),
        cleanup: "PASS",
      };
    }
    const beforeFingerprint = scalar(sql(positive, historicalFingerprintSql()));
    const blockerDeltaBefore = JSON.parse(scalar(sql(positive, securityBlockerSnapshotSql())));
    const bootstrapRoleContract = JSON.parse(scalar(sql(positive, roleMembershipDiagnosticSql())));
    if (bootstrapRoleContract.membership_count !== 0) {
      throw new Error("Positive Phase 3 bootstrap contains an unexpected protected-role membership.");
    }
    const identityContractBefore = JSON.parse(scalar(sql(positive, identityHelperContractDiagnosticSql())));
    if (identityContractBefore.first_failure !== null) {
      throw new Error("Phase 3 local identity helper fixture does not match the reviewed source contract.");
    }
    const servicePrivilegesBefore = scalar(sql(positive, `select pg_catalog.count(*) from information_schema.role_table_grants where grantee = 'service_role' and table_schema = 'public' and table_name = any (array[${reviewedTables.map((table) => `'${table}'`).join(",")}]);`));
    for (const migration of PHASE3_MIGRATIONS) apply(positive, migration);
    const afterFingerprint = scalar(sql(positive, historicalFingerprintSql()));
    const blockerDeltaAfter = JSON.parse(scalar(sql(positive, securityBlockerSnapshotSql())));
    if (beforeFingerprint !== afterFingerprint) throw new Error("Phase 3 changed historical synthetic values.");

    sql(positive, `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"user_synthetic_001"}';
      insert into public.attempts (id, user_id, sport_type) values ('12000000-0000-4000-8000-000000000001','user_synthetic_001','football_11');
      insert into public.exam_results (id, user_id) values ('22000000-0000-4000-8000-000000000001','user_synthetic_001');
      insert into public.rules_exam_results (user_id) values ('user_synthetic_001'); commit;`);

    const structural = JSON.parse(scalar(sql(positive, `select pg_catalog.jsonb_build_object(
      'attempts', (select pg_catalog.count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results', (select pg_catalog.count(*) from public.exam_results where id::text like '20000000-%'),
      'notifications', (select pg_catalog.count(*) from public.notification_events),
      'schema_marker_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state),
      'sidecar_present', pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null,
      'identity_links_absent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'development_rpcs_absent', not exists (select 1 from unnest(array[${PHASE3_DEVELOPMENT_RPCS.map((value) => `'${value}'`).join(",")}]) signature where pg_catalog.to_regprocedure(signature) is not null),
      'reviewed_policy_count', (select pg_catalog.count(*) from pg_catalog.pg_policy policy join pg_catalog.pg_class relation on relation.oid = policy.polrelid join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace where namespace.nspname='public' and exists (select 1 from unnest(array[${PHASE3_POLICY_MATRIX.map((policy) => `'${policy.table}.${policy.name}'`).join(",")}]) expected(value) where expected.value = relation.relname || '.' || policy.polname)),
      'service_privileges', (select pg_catalog.count(*) from information_schema.role_table_grants where grantee = 'service_role' and table_schema = 'public' and table_name = any (array[${reviewedTables.map((table) => `'${table}'`).join(",")}]))
    )::text;`)));
    if (structural.attempts !== 37 || structural.exam_results !== 6 || structural.notifications !== 60
        || structural.schema_marker_rows !== 0 || structural.ledger_rows !== 4
        || !structural.sidecar_present || !structural.identity_links_absent || !structural.development_rpcs_absent
        || structural.reviewed_policy_count !== PHASE3_POLICY_MATRIX.length
        || String(structural.service_privileges) !== servicePrivilegesBefore) {
      throw new Error("Phase 3 structural, historical, or service-role contract failed.");
    }

    const sidecar = scalar(sql(positive, "set role reflab_prod_preflight_ro; select pg_catalog.jsonb_typeof(reflab_audit.production_semantic_snapshot());"));
    if (sidecar !== "object") throw new Error("Phase 3 disabled the temporary semantic audit sidecar.");

    const rpcResult = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: positive },
      input: `set role service_role; select public.submit_canonical_training_attempt('user_synthetic_001','97000000-0000-4000-8000-000000000099','{"sport_type":"football_11","activity_type":"rules_practice","source_item_type":"rule_question","source_item_id":"law-1"}'::jsonb,0);`,
      encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    });
    if (rpcResult.status === 0) throw new Error("Canonical RPC unexpectedly opened before marker finalization.");
    const rpcFailClosed = requireFailure(rpcResult, "55000", "Canonical", "canonical RPC fail-closed");

    const attacks = [
      attackFailure(positive, "anon insert", "begin; set local role anon; insert into public.user_profiles(user_id,ref_card_id) values ('user_attack','ATTACK');", "permission denied"),
      attackFailure(positive, "cross-user update", `begin; set local role authenticated; set local request.jwt.claims='{"sub":"user_synthetic_001"}'; do $test$ declare changed integer; begin update public.user_profiles set ref_card_id='ATTACK' where user_id='user_synthetic_002'; get diagnostics changed = row_count; if changed <> 0 then raise exception 'cross-user update succeeded' using errcode='55000'; end if; raise exception 'RLS denied cross-user update' using errcode='42501'; end $test$;`, "RLS denied cross-user update"),
      attackFailure(positive, "authenticated truncate", "begin; set local role authenticated; truncate table public.attempts;", "permission denied"),
      attackFailure(positive, "authenticated internal helper", "begin; set local role authenticated; select reflab_private.canonical_jsonb_text('{}'::jsonb);", "permission denied"),
      attackFailure(positive, "anon security definer", "begin; set local role anon; select reflab_private.is_super_admin();", "permission denied"),
    ];
    if (scalar(sql(positive, "select ref_card_id = 'REF-2' from public.user_profiles where user_id='user_synthetic_002';")) !== "t") {
      throw new Error("Phase 3 attack rehearsal changed another user's row.");
    }
    if (scalar(sql("postgres", "select pg_catalog.to_regrole('reflab_preflight_audit_owner') is not null;")) !== "t") {
      throw new Error("Positive Phase 3 scenario did not create the reviewed cluster-global audit owner.");
    }
    dropDatabase(positive);
    const databaseDropLeavesClusterRoles = scalar(sql("postgres", "select pg_catalog.to_regrole('reflab_preflight_audit_owner') is not null;")) === "t";
    if (!databaseDropLeavesClusterRoles) {
      throw new Error("Phase 3 isolation proof did not observe the cluster-global role after DROP DATABASE.");
    }
    const positiveCleanup = cleanupCluster();

    const negativeResults = {};
    const negativeIsolation = {};
    for (const scenario of phase3NegativeCases) {
      const isolated = runIsolatedNegativeScenario(scenario);
      negativeResults[scenario] = isolated.result;
      negativeIsolation[scenario] = {
        sidecarAbsentAtStart: isolated.sidecarAbsentAtStart,
        cleanup: isolated.cleanup,
      };
    }

    return {
      localOnly: true,
      localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      legacyIdentitySourceHashes: Object.fromEntries(identityContractBefore.helpers.map((helper) => [
        helper.signature,
        helper.checks.find((check) => check.attribute === "source_hash")?.observed,
      ])),
      migrationOrder: [...phase1Migrations, phase2aMigration, ...phase2bMigrations, ...PHASE3_MIGRATIONS],
      historicalCounts: { attempts: structural.attempts, examResults: structural.exam_results, notifications: structural.notifications },
      policyCount: structural.reviewed_policy_count,
      schemaMarkerRows: structural.schema_marker_rows,
      adoptionLedgerRows: structural.ledger_rows,
      semanticSidecar: "PASS",
      legacyWrites: "PASS",
      rpcFailClosed,
      attacks,
      negativeResults,
      blockerDelta: { before: blockerDeltaBefore, after: blockerDeltaAfter },
      bootstrapRoleContract,
      clusterRoleInventory: phase3ClusterRoleInventory,
      databaseDropLeavesClusterRoles,
      negativeIsolation,
      cleanup: { positive: positiveCleanup, negatives: "PASS" },
    };
  } finally {
    if (!clusterRemoved) cleanupCluster();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase3Postgres())}\n`);
}

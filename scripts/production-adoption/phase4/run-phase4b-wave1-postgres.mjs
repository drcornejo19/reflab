import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSemanticSidecarFixtureSql } from "../phase2b/run-phase2b-postgres.mjs";
import { PHASE3_DEVELOPMENT_RPCS, PHASE3_MIGRATIONS } from "../phase3/phase3-security-contract.mjs";
import {
  PHASE4B_WAVE1_HELPERS,
  PHASE4B_WAVE1_MIGRATION,
  PHASE4B_WAVE1_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE1_PLATFORM_WRAPPER,
  PHASE4B_WAVE1_PROVIDER,
} from "./phase4b-wave1-contract.mjs";
import {
  buildWave1FixtureDependencySql,
  wave1FixtureMissingColumnsSql,
} from "./phase4b-wave1-fixture-contract.mjs";
import { canonicalFunctionStatement } from "./generate-phase4b-wave1.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = {
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  pgIsReady: join(postgresBin, "pg_isready.exe"),
  psql: join(postgresBin, "psql.exe"),
};
const baseline = readFileSync(resolve(migrationsDirectory, "202607270000_reflab_canonical_baseline.sql"), "utf8")
  .replaceAll("\r\n", "\n");
const phase2bFixture = readFileSync(resolve(root, "scripts", "production-adoption", "phase2b", "phase2b-production-fixture.sql"), "utf8");
const phase3Fixture = readFileSync(resolve(root, "scripts", "production-adoption", "phase3", "phase3-production-fixture.sql"), "utf8");
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

const expectedNegativeMessage = Object.freeze({
  source_drift: "Wave 1 helper contract drift",
  return_type_drift: "Wave 1 helper contract drift",
  language_drift: "Wave 1 helper contract drift",
  volatility_drift: "Wave 1 helper contract drift",
  security_mode_drift: "Wave 1 helper contract drift",
  search_path_drift: "Wave 1 helper contract drift",
  owner_drift: "Wave 1 helper contract drift",
  unexpected_overload: "Unexpected Wave 1 helper overload",
  public_execute: "Pre-existing Wave 1 helper ACL is unsafe",
  authenticated_execute: "Pre-existing Wave 1 helper ACL is unsafe",
  unsafe_role_membership: "Unsafe protected-role membership",
  missing_adoption_prerequisite: "semantic audit sidecar is required",
  premature_canonical_marker: "adoption state is required",
  development_object_present: "Development-only identity infrastructure is forbidden",
  duplicate_provider_declaration: "Duplicate Wave 1 provider declaration",
  fourth_policy_caller: "Unexpected legacy policy identity caller",
  reviewed_policy_helper_drift: "temporary legacy INSERT policy contract is incomplete",
  reviewed_policy_command_drift: "temporary legacy INSERT policy contract is incomplete",
  reviewed_policy_role_drift: "temporary legacy INSERT policy contract is incomplete",
  reviewed_policy_permissive_drift: "temporary legacy INSERT policy contract is incomplete",
  wrapper_source_drift: "platform identity wrapper contract is incomplete",
  wrapper_security_definer: "platform identity wrapper contract is incomplete",
  unexpected_direct_identity_reader: "Phase 3 identity reconciliation is incomplete",
});

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
  if (lines.length !== 1) throw new Error("Unexpected local Phase 4B Wave 1 scalar output.");
  return lines[0];
}

export function parsePhase4BWave1Failure(error) {
  const diagnostic = String(error?.stderr ?? error ?? "").match(
    /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/,
  );
  return {
    sqlstate: diagnostic?.[1] ?? "UNKNOWN",
    message: diagnostic?.[2] ?? "Local Phase 4B Wave 1 SQL failed.",
  };
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text || ':' || coalesce(user_id, ''), ',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text || ':' || user_id || ':' || coalesce(submission_id::text, ''), ',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text || ':' || user_id, ',' order by id) from public.notification_events),
    (select pg_catalog.string_agg(user_id, ',' order by user_id) from public.user_profiles)
  ));`;
}

function helperCountSql() {
  const signatures = PHASE4B_WAVE1_HELPERS.map((helper) => `'${helper.signature}'`).join(",");
  return `select pg_catalog.count(*) from unnest(array[${signatures}]::text[]) expected(signature)
    where pg_catalog.to_regprocedure(expected.signature) is not null;`;
}

function exactHelperSnapshotSql() {
  const rows = PHASE4B_WAVE1_HELPERS.map((helper) => `(
    '${helper.signature}', '${helper.returns}', '${helper.language}', '${helper.volatility}',
    ${helper.strict}, ${helper.security === "DEFINER"}, '${helper.owner}', '${helper.sourceHash}'
  )`).join(",\n");
  return `with expected(signature, return_type, language_name, volatility_name, strict_mode,
    security_definer, owner_contract, source_hash) as (values ${rows}), actual as (
    select expected.*,
      routine.oid,
      pg_catalog.format_type(routine.prorettype, null) actual_return_type,
      language.lanname actual_language,
      case routine.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end actual_volatility,
      routine.proisstrict actual_strict,
      routine.prosecdef actual_security_definer,
      pg_catalog.pg_get_userbyid(routine.proowner) actual_owner,
      routine.proconfig,
      pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
        pg_catalog.regexp_replace(routine.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'UTF8'), 'sha256'), 'hex') actual_hash,
      pg_catalog.obj_description(routine.oid, 'pg_proc') provider_comment,
      (select pg_catalog.count(*) from pg_catalog.pg_proc overload
       where overload.pronamespace=routine.pronamespace and overload.proname=routine.proname and overload.prokind='f') overload_count
    from expected
    left join pg_catalog.pg_proc routine on routine.oid=pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_language language on language.oid=routine.prolang
  ) select pg_catalog.jsonb_build_object(
    'installed', count(*) filter(where oid is not null),
    'exact', count(*) filter(where oid is not null
      and actual_return_type=return_type and actual_language=language_name and actual_volatility=volatility_name
      and actual_strict=strict_mode and actual_security_definer=security_definer
      and actual_owner=case owner_contract when 'reflab_rls_owner' then 'reflab_rls_owner' else current_user end
      and proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and actual_hash=source_hash and provider_comment='${PHASE4B_WAVE1_PROVIDER}' and overload_count=1),
    'public_execute', count(*) filter(where exists(select 1 from pg_catalog.aclexplode(coalesce(
      (select proacl from pg_catalog.pg_proc where oid=actual.oid),
      pg_catalog.acldefault('f',(select proowner from pg_catalog.pg_proc where oid=actual.oid)))) acl
      where acl.grantee=0 and acl.privilege_type='EXECUTE')),
    'anon_execute', count(*) filter(where pg_catalog.has_function_privilege('anon',oid,'EXECUTE')),
    'authenticated_execute', count(*) filter(where pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')),
    'service_role_execute', count(*) filter(where pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')),
    'rls_owner_helpers', count(*) filter(where actual_owner='reflab_rls_owner'),
    'installer_helpers', count(*) filter(where actual_owner=current_user)
  )::text from actual;`;
}

function canonicalSetUpdatedAt() {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  return canonicalFunctionStatement(baseline, helper);
}

function closedExactSetUpdatedAtSql({ comment = null } = {}) {
  return `${canonicalSetUpdatedAt()}
    revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;
    ${comment === null ? "" : `comment on function reflab_private.set_updated_at() is '${comment}';`}`;
}

function sourceHashSql(alias) {
  return `pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.regexp_replace(${alias}.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'UTF8'), 'sha256'), 'hex')`;
}

function exactSetUpdatedAtPredicates(alias, { securityDefiner, securityDriftFrom = null }) {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  const expectedVolatility = { immutable: "i", stable: "s", volatile: "v" }[helper.volatility];
  return `${alias}.oid=pg_catalog.to_regprocedure('${helper.signature}')
      and pg_catalog.pg_get_function_identity_arguments(${alias}.oid)=''
      and pg_catalog.format_type(${alias}.prorettype,null)='${helper.returns}'
      and language.lanname='${helper.language}'
      and ${alias}.provolatile='${expectedVolatility}'
      and ${alias}.proisstrict=${helper.strict}
      and ${alias}.prosecdef=${securityDefiner}${securityDriftFrom === null ? "" : ` and ${alias}.prosecdef<>${securityDriftFrom}`}
      and pg_catalog.pg_get_userbyid(${alias}.proowner)=current_user
      and ${alias}.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and ${sourceHashSql(alias)}='${helper.sourceHash}'
      and not pg_catalog.has_function_privilege('public',${alias}.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',${alias}.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated',${alias}.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',${alias}.oid,'EXECUTE')`;
}

function exactSetUpdatedAtStateSql({ securityDefiner, securityDriftFrom = null }) {
  return `select exists(
    select 1
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_language language on language.oid=routine.prolang
    where ${exactSetUpdatedAtPredicates("routine", { securityDefiner, securityDriftFrom })}
  );`;
}

export function negativeInjectionSql(scenario) {
  const exact = canonicalSetUpdatedAt();
  if (scenario === "source_drift") {
    return `${exact.replace("begin\n", "begin\n  /* reviewed source drift */\n")}
      revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;`;
  }
  if (scenario === "return_type_drift") {
    return `create function reflab_private.set_updated_at() returns text language plpgsql volatile security invoker
      set search_path=pg_catalog as $$ begin return 'drift'; end $$;
      revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;`;
  }
  if (scenario === "language_drift") {
    return `create function reflab_private.has_active_institution_membership(uuid) returns boolean language plpgsql stable security definer
      set search_path=pg_catalog as $$ begin return false; end $$;
      alter function reflab_private.has_active_institution_membership(uuid) owner to reflab_rls_owner;
      revoke all on function reflab_private.has_active_institution_membership(uuid) from public, anon, authenticated, service_role;`;
  }
  if (scenario === "volatility_drift") {
    const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
    const injectedVolatility = helper.volatility === "volatile" ? "stable" : "volatile";
    return `${exact}
      alter function ${helper.signature} ${injectedVolatility};
      revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;`;
  }
  if (scenario === "security_mode_drift") {
    return `${exact}
      revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;`;
  }
  if (scenario === "search_path_drift") {
    return `${exact.replace("set search_path = pg_catalog", "set search_path = public")}
      revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;`;
  }
  if (scenario === "owner_drift") {
    return `create role phase4b_unexpected_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      ${exact}
      alter function reflab_private.set_updated_at() owner to phase4b_unexpected_owner;
      revoke all on function reflab_private.set_updated_at() from public, anon, authenticated, service_role;`;
  }
  if (scenario === "unexpected_overload") {
    return `${closedExactSetUpdatedAtSql()}
      create function reflab_private.set_updated_at(integer) returns integer language sql immutable strict security invoker
      set search_path=pg_catalog as $$ select $1 $$;
      revoke all on function reflab_private.set_updated_at(integer) from public, anon, authenticated, service_role;`;
  }
  if (scenario === "public_execute") return exact;
  if (scenario === "authenticated_execute") {
    return `${exact}
      revoke all on function reflab_private.set_updated_at() from public, anon, service_role;
      grant execute on function reflab_private.set_updated_at() to authenticated;`;
  }
  if (scenario === "unsafe_role_membership") return "grant service_role to authenticated;";
  if (scenario === "missing_adoption_prerequisite") return "drop function reflab_audit.production_semantic_snapshot();";
  if (scenario === "premature_canonical_marker") {
    return `insert into reflab_meta.reflab_schema_state
      (baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status)
      values ('premature',repeat('a',64),repeat('b',64),'production','local',1,'installed');`;
  }
  if (scenario === "development_object_present") {
    return "create function public.resolve_development_clerk_identity(text) returns text language sql as $$ select null::text $$;";
  }
  if (scenario === "duplicate_provider_declaration") {
    return closedExactSetUpdatedAtSql({ comment: "reflab:production_adoption_provider=conflicting_provider" });
  }
  if (scenario === "fourth_policy_caller") {
    return "create policy phase4b_unexpected_platform_caller on public.user_subscriptions for select to authenticated using(user_id=public.platform_request_user_id());";
  }
  if (scenario === "reviewed_policy_helper_drift") {
    return `drop policy attempts_own_insert on public.attempts;
      create policy attempts_own_insert on public.attempts for insert to authenticated
      with check(user_id=public.institution_request_user_id());`;
  }
  if (scenario === "reviewed_policy_command_drift") {
    return `drop policy attempts_own_insert on public.attempts;
      create policy attempts_own_insert on public.attempts for update to authenticated
      using(user_id=public.platform_request_user_id()) with check(user_id=public.platform_request_user_id());`;
  }
  if (scenario === "reviewed_policy_role_drift") {
    return `drop policy attempts_own_insert on public.attempts;
      create policy attempts_own_insert on public.attempts for insert to anon
      with check(user_id=public.platform_request_user_id());`;
  }
  if (scenario === "reviewed_policy_permissive_drift") {
    return `drop policy attempts_own_insert on public.attempts;
      create policy attempts_own_insert on public.attempts as restrictive for insert to authenticated
      with check(user_id=public.platform_request_user_id());`;
  }
  if (scenario === "wrapper_source_drift") {
    return `create or replace function public.platform_request_user_id() returns text language sql stable security invoker
      set search_path=pg_catalog as $$ select reflab_private.request_user_id() || ''::text $$;`;
  }
  if (scenario === "wrapper_security_definer") {
    return `create or replace function public.platform_request_user_id() returns text language sql stable security definer
      set search_path=pg_catalog as $$ select reflab_private.request_user_id(); $$;`;
  }
  if (scenario === "unexpected_direct_identity_reader") {
    return `create function public.phase4b_unexpected_identity_reader() returns text language sql stable security invoker
      set search_path=pg_catalog as $$ select pg_catalog.current_setting('request.jwt.claims',true) $$;
      revoke all on function public.phase4b_unexpected_identity_reader() from public,anon,authenticated,service_role;`;
  }
  throw new Error("Unknown Phase 4B Wave 1 negative scenario.");
}

export function negativePreMutationAssertionSql(scenario) {
  return scenario === "security_mode_drift"
    ? exactSetUpdatedAtStateSql({ securityDefiner: false })
    : null;
}

export function negativeMutationSql(scenario) {
  if (scenario === "security_mode_drift") {
    const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
    if (helper.security !== "INVOKER") {
      throw new Error("Wave 1 security-mode negative target is not a canonical invoker.");
    }
    return `alter function ${helper.signature} security definer;`;
  }
  return null;
}

export function negativeMutationAssertionSql(scenario) {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  const helperOid = `pg_catalog.to_regprocedure('${helper.signature}')`;
  const helperSourceHash = sourceHashSql("routine");
  if (scenario === "source_drift") {
    return `select exists(select 1 from pg_catalog.pg_proc routine where routine.oid=${helperOid} and ${helperSourceHash}<>'${helper.sourceHash}');`;
  }
  if (scenario === "return_type_drift") {
    return `select exists(select 1 from pg_catalog.pg_proc routine where routine.oid=${helperOid} and pg_catalog.format_type(routine.prorettype,null)<>'${helper.returns}');`;
  }
  if (scenario === "language_drift") {
    const target = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "has_active_institution_membership");
    return `select exists(select 1 from pg_catalog.pg_proc routine join pg_catalog.pg_language language on language.oid=routine.prolang where routine.oid=pg_catalog.to_regprocedure('${target.signature}') and language.lanname<>'${target.language}');`;
  }
  if (scenario === "volatility_drift") {
    const expectedCode = { immutable: "i", stable: "s", volatile: "v" }[helper.volatility];
    const injectedCode = expectedCode === "v" ? "s" : "v";
    return `select exists(
      select 1
      from pg_catalog.pg_proc routine
      join pg_catalog.pg_language language on language.oid=routine.prolang
      where routine.oid=${helperOid}
        and routine.provolatile='${injectedCode}' and routine.provolatile<>'${expectedCode}'
        and pg_catalog.format_type(routine.prorettype,null)='${helper.returns}'
        and language.lanname='${helper.language}'
        and routine.proisstrict=${helper.strict}
        and routine.prosecdef=${helper.security === "DEFINER"}
        and pg_catalog.pg_get_userbyid(routine.proowner)=current_user
        and routine.proconfig is not distinct from array['search_path=pg_catalog']::text[]
        and ${helperSourceHash}='${helper.sourceHash}'
        and not pg_catalog.has_function_privilege('public',routine.oid,'EXECUTE')
        and not pg_catalog.has_function_privilege('anon',routine.oid,'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated',routine.oid,'EXECUTE')
        and not pg_catalog.has_function_privilege('service_role',routine.oid,'EXECUTE')
    );`;
  }
  if (scenario === "security_mode_drift") {
    return exactSetUpdatedAtStateSql({ securityDefiner: true, securityDriftFrom: false });
  }
  if (scenario === "search_path_drift") {
    return `select exists(select 1 from pg_catalog.pg_proc routine where routine.oid=${helperOid} and routine.proconfig is distinct from array['search_path=pg_catalog']::text[]);`;
  }
  if (scenario === "owner_drift") {
    return `select exists(select 1 from pg_catalog.pg_proc routine where routine.oid=${helperOid} and pg_catalog.pg_get_userbyid(routine.proowner)<>current_user);`;
  }
  if (scenario === "unexpected_overload") {
    return `with same_name as (
      select routine.oid, pg_catalog.pg_get_function_identity_arguments(routine.oid) identity_arguments
      from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace on namespace.oid=routine.pronamespace
      where namespace.nspname='reflab_private' and routine.proname='set_updated_at' and routine.prokind='f'
    )
    select (select pg_catalog.count(*) from same_name)=2
      and (select pg_catalog.array_agg(identity_arguments order by identity_arguments) from same_name)
        = array['','integer']::text[]
      and exists(
        select 1 from pg_catalog.pg_proc routine
        join pg_catalog.pg_language language on language.oid=routine.prolang
        where ${exactSetUpdatedAtPredicates("routine", { securityDefiner: false })}
      )
      and exists(
        select 1 from same_name
        where oid=pg_catalog.to_regprocedure('reflab_private.set_updated_at(integer)')
          and identity_arguments='integer'
      );`;
  }
  if (scenario === "public_execute") return `select pg_catalog.has_function_privilege('public',${helperOid},'EXECUTE');`;
  if (scenario === "authenticated_execute") return `select pg_catalog.has_function_privilege('authenticated',${helperOid},'EXECUTE');`;
  if (scenario === "unsafe_role_membership") return "select pg_catalog.pg_has_role('authenticated','service_role','MEMBER');";
  if (scenario === "missing_adoption_prerequisite") return "select pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null;";
  if (scenario === "premature_canonical_marker") return "select (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)>0;";
  if (scenario === "development_object_present") return "select pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is not null;";
  if (scenario === "duplicate_provider_declaration") return `select pg_catalog.obj_description(${helperOid},'pg_proc')='reflab:production_adoption_provider=conflicting_provider';`;
  if (scenario === "fourth_policy_caller") return "select pg_catalog.to_regclass('public.user_subscriptions') is not null and exists(select 1 from pg_catalog.pg_policy where polname='phase4b_unexpected_platform_caller');";
  if (scenario === "reviewed_policy_helper_drift") return "select exists(select 1 from pg_catalog.pg_policy where polname='attempts_own_insert' and pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_expr(polwithcheck,polrelid,false)),'institution_request_user_id')>0);";
  if (scenario === "reviewed_policy_command_drift") return "select exists(select 1 from pg_catalog.pg_policy where polname='attempts_own_insert' and polcmd='w');";
  if (scenario === "reviewed_policy_role_drift") return "select exists(select 1 from pg_catalog.pg_policy where polname='attempts_own_insert' and polroles=array[pg_catalog.to_regrole('anon')::oid]);";
  if (scenario === "reviewed_policy_permissive_drift") return "select exists(select 1 from pg_catalog.pg_policy where polname='attempts_own_insert' and not polpermissive);";
  if (scenario === "wrapper_source_drift") return `select exists(select 1 from pg_catalog.pg_proc routine where routine.oid=pg_catalog.to_regprocedure('public.platform_request_user_id()') and ${helperSourceHash}<>'${PHASE4B_WAVE1_PLATFORM_WRAPPER.sourceHash}');`;
  if (scenario === "wrapper_security_definer") return "select prosecdef from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.platform_request_user_id()');";
  if (scenario === "unexpected_direct_identity_reader") return "select pg_catalog.to_regprocedure('public.phase4b_unexpected_identity_reader()') is not null;";
  throw new Error("Unknown Phase 4B Wave 1 mutation assertion scenario.");
}

async function runScenario(scenario) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), `reflab-phase4b-wave1-${scenario}-`));
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
      environment: { PGDATABASE: database }, input: statement,
    });
  }
  function apply(database, migration) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", resolve(migrationsDirectory, migration)], {
      environment: { PGDATABASE: database },
    });
  }
  function cleanup() {
    if (clusterRemoved) return { serverStopped: true, portClosed: true, directoryRemoved: true };
    for (const database of [...created].reverse()) {
      try { run(binaries.dropdb, ["--if-exists", database]); } catch { /* full cluster removal follows */ }
    }
    if (serverStarted) {
      run(binaries.pgCtl, ["stop", "-D", dataDirectory, "-m", "immediate", "-w"], { quiet: true });
      serverStarted = false;
    }
    const readiness = spawnSync(binaries.pgIsReady, ["-h", "127.0.0.1", "-p", String(port), "-d", "postgres"], {
      env: environment, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
    });
    if (readiness.status === 0) throw new Error("Local Phase 4B Wave 1 PostgreSQL process survived cleanup.");
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("Local Phase 4B Wave 1 temporary directory survived cleanup.");
    clusterRemoved = true;
    return { serverStopped: true, portClosed: true, directoryRemoved: true };
  }
  function setup(database) {
    sql(database, phase2bFixture);
    for (const migration of phase1Migrations) apply(database, migration);
    sql(database, buildSemanticSidecarFixtureSql());
    const missingBefore = JSON.parse(scalar(sql(database, wave1FixtureMissingColumnsSql(baseline))));
    sql(database, buildWave1FixtureDependencySql(baseline));
    const missingAfter = JSON.parse(scalar(sql(database, wave1FixtureMissingColumnsSql(baseline))));
    if (missingAfter.length !== 0) {
      throw new Error("Local Wave 1 fixture dependency columns remain incomplete.");
    }
    apply(database, phase2aMigration);
    for (const migration of phase2bMigrations) apply(database, migration);
    sql(database, phase3Fixture);
    for (const migration of PHASE3_MIGRATIONS) apply(database, migration);
    return { missingBefore, missingAfter };
  }

  const database = `wave1_${scenario}`;
  try {
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", dataDirectory]);
    run(binaries.pgCtl, ["start", "-D", dataDirectory, "-l", logPath, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    serverStarted = true;
    sql("postgres", `
      create role anon nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_prod_preflight_ro login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    `);
    run(binaries.createdb, [database]);
    created.push(database);
    sql(database, "create schema extensions; create extension pgcrypto with schema extensions;");
    const fixtureDependencies = setup(database);

    const beforeFingerprint = scalar(sql(database, historicalFingerprintSql()));
    const helpersBefore = Number(scalar(sql(database, helperCountSql())));
    if (helpersBefore !== 0) throw new Error("Wave 1 scenario did not start with all 16 helpers absent.");

    if (scenario !== "positive") {
      sql(database, negativeInjectionSql(scenario));
      const preMutationAssertion = negativePreMutationAssertionSql(scenario);
      if (preMutationAssertion !== null && scalar(sql(database, preMutationAssertion)) !== "t") {
        throw new Error(`HARNESS_SETUP_FAIL: ${scenario} canonical pre-mutation state.`);
      }
      const mutation = negativeMutationSql(scenario);
      if (mutation !== null) sql(database, mutation);
      if (scalar(sql(database, negativeMutationAssertionSql(scenario))) !== "t") {
        throw new Error(`HARNESS_SETUP_FAIL: ${scenario}.`);
      }
      const injectedHelpers = Number(scalar(sql(database, helperCountSql())));
      let failure;
      try {
        apply(database, PHASE4B_WAVE1_MIGRATION);
      } catch (error) {
        failure = parsePhase4BWave1Failure(error);
      }
      if (!failure || failure.sqlstate !== "55000" || !failure.message.includes(expectedNegativeMessage[scenario])) {
        throw new Error(`Unexpected sanitized Wave 1 negative result: ${scenario}.`);
      }
      const helpersAfter = Number(scalar(sql(database, helperCountSql())));
      const afterFingerprint = scalar(sql(database, historicalFingerprintSql()));
      if (helpersAfter !== injectedHelpers || afterFingerprint !== beforeFingerprint) {
        throw new Error(`Wave 1 rollback contract failed: ${scenario}.`);
      }
      return {
        scenario,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        sqlstate: failure.sqlstate,
        message: expectedNegativeMessage[scenario],
        abort: "PASS",
        mutationAssertion: "PASS",
        rollback: "PASS",
        historicalFingerprint: "PASS",
        cleanup: cleanup(),
      };
    }

    apply(database, PHASE4B_WAVE1_MIGRATION);
    apply(database, PHASE4B_WAVE1_MIGRATION);
    const helpers = JSON.parse(scalar(sql(database, exactHelperSnapshotSql())));
    if (helpers.installed !== 16 || helpers.exact !== 16 || helpers.public_execute !== 0
        || helpers.anon_execute !== 0 || helpers.authenticated_execute !== 0
        || helpers.service_role_execute !== 0 || helpers.rls_owner_helpers !== 3
        || helpers.installer_helpers !== 13) {
      throw new Error("Positive Wave 1 helper catalog or ACL contract failed.");
    }

    sql(database, `begin; set local role authenticated; set local request.jwt.claims='{"sub":"user_synthetic_001"}';
      insert into public.attempts (id,user_id,sport_type) values ('13000000-0000-4000-8000-000000000001','user_synthetic_001','football_11');
      insert into public.exam_results (id,user_id) values ('23000000-0000-4000-8000-000000000001','user_synthetic_001'); rollback;`);
    if (scalar(sql(database, historicalFingerprintSql())) !== beforeFingerprint) {
      throw new Error("Positive Wave 1 changed historical values.");
    }

    const rpc = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: database }, encoding: "utf8", windowsHide: true,
      input: `set role service_role; select public.submit_canonical_training_attempt('user_synthetic_001','97000000-0000-4000-8000-000000000099','{"sport_type":"football_11","activity_type":"rules_practice","source_item_type":"rule_question","source_item_id":"law-1"}'::jsonb,0);`,
      maxBuffer: 16 * 1024 * 1024,
    });
    const rpcFailure = parsePhase4BWave1Failure(rpc);
    if (rpc.status === 0 || rpcFailure.sqlstate !== "55000" || !rpcFailure.message.includes("Canonical")) {
      throw new Error("Canonical RPC did not remain fail-closed after Wave 1.");
    }

    const state = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'attempts',(select count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results',(select count(*) from public.exam_results where id::text like '20000000-%'),
      'notifications',(select count(*) from public.notification_events),
      'schema_state_rows',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows',(select count(*) from reflab_meta.production_adoption_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'sidecar',pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null,
      'identity_links_absent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'development_absent',not exists(select 1 from unnest(array[${PHASE3_DEVELOPMENT_RPCS.map((value) => `'${value}'`).join(",")}]) signature where pg_catalog.to_regprocedure(signature) is not null),
      'reviewed_legacy_insert_policies',(select count(*) from pg_catalog.pg_policy policy join pg_catalog.pg_class relation on relation.oid=policy.polrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and (relation.relname,policy.polname) in (('attempts','attempts_own_insert'),('exam_results','exam_results_own_insert'),('rules_exam_results','rules_exam_results_own_insert')) and policy.polcmd='a' and policy.polpermissive and policy.polroles=array[pg_catalog.to_regrole('authenticated')::oid] and policy.polqual is null and pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),''),'[[:space:]()]','','g'))=any(array['user_id=platform_request_user_id','user_id=public.platform_request_user_id']::text[])),
      'unexpected_legacy_policy_callers',(select count(*) from pg_catalog.pg_policy policy join pg_catalog.pg_class relation on relation.oid=policy.polrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where (pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),''))||pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),''))) ~ '(platform_request_user_id|platform_is_super_admin|institution_request_user_id|reflab_request_user_id)' and not(namespace.nspname='public' and (relation.relname,policy.polname) in (('attempts','attempts_own_insert'),('exam_results','exam_results_own_insert'),('rules_exam_results','rules_exam_results_own_insert')))),
      'unexpected_direct_identity_readers',(select count(*) from pg_catalog.pg_proc routine join pg_catalog.pg_namespace namespace on namespace.oid=routine.pronamespace where namespace.nspname in('public','reflab_private') and routine.prokind='f' and routine.oid is distinct from pg_catalog.to_regprocedure('reflab_private.request_user_id()')::oid and (pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)),'request.jwt.claims')>0 or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)),'request.jwt.claim.sub')>0 or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)),'auth.jwt()')>0 or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)),'auth.uid()')>0))
    )::text;`)));
    if (state.attempts !== 37 || state.exam_results !== 6 || state.notifications !== 60
        || state.schema_state_rows !== 0 || state.ledger_rows !== 4
        || state.ledger_phase !== "canonical_objects" || state.ledger_order !== 4
        || !state.sidecar || !state.identity_links_absent || !state.development_absent
        || state.reviewed_legacy_insert_policies !== 3 || state.unexpected_legacy_policy_callers !== 0
        || state.unexpected_direct_identity_readers !== 0) {
      throw new Error("Positive Wave 1 adoption or historical invariant failed.");
    }
    if (scalar(sql(database, "set role reflab_prod_preflight_ro; select pg_catalog.jsonb_typeof(reflab_audit.production_semantic_snapshot());")) !== "object") {
      throw new Error("Wave 1 disabled the temporary semantic audit sidecar.");
    }

    return {
      scenario,
      localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      helpers,
      fixtureDependencies,
      idempotentReplay: "PASS",
      historicalCounts: { attempts: state.attempts, examResults: state.exam_results, notifications: state.notifications },
      legacyWrites: "PASS",
      rpcFailClosed: { status: "PASS", sqlstate: rpcFailure.sqlstate },
      schemaStateRows: state.schema_state_rows,
      canonicalMarker: "absent",
      semanticSidecar: "PASS",
      identityLinks: "absent",
      developmentObjects: "absent",
      reviewedLegacyInsertPolicies: state.reviewed_legacy_insert_policies,
      unexpectedLegacyPolicyCallers: state.unexpected_legacy_policy_callers,
      unexpectedDirectIdentityReaders: state.unexpected_direct_identity_readers,
      ledger: { phase: state.ledger_phase, order: state.ledger_order, rows: state.ledger_rows },
      cleanup: cleanup(),
    };
  } finally {
    if (!clusterRemoved) cleanup();
  }
}

export async function runPhase4BWave1Postgres() {
  const positiveOnly = process.argv.includes("--positive-only");
  const requestedScenario = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=", 2)[1] ?? null;
  if (requestedScenario !== null) {
    if (!PHASE4B_WAVE1_NEGATIVE_SCENARIOS.includes(requestedScenario)) {
      throw new Error("Unknown isolated Phase 4B Wave 1 scenario.");
    }
    return runScenario(requestedScenario);
  }

  const positive = await runScenario("positive");
  if (positiveOnly) return { localOnly: true, positive, negatives: null };
  const negatives = {};
  for (const scenario of PHASE4B_WAVE1_NEGATIVE_SCENARIOS) {
    const childEnvironment = {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      POSTGRES_BIN: postgresBin,
    };
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--scenario=${scenario}`], {
      env: childEnvironment, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`Isolated Wave 1 negative scenario failed: ${scenario}.`);
    let parsed;
    try { parsed = JSON.parse(String(child.stdout).trim()); } catch {
      throw new Error(`Isolated Wave 1 negative scenario returned invalid output: ${scenario}.`);
    }
    if (parsed.scenario !== scenario || parsed.abort !== "PASS" || parsed.rollback !== "PASS"
        || !parsed.cleanup?.serverStopped || !parsed.cleanup?.portClosed || !parsed.cleanup?.directoryRemoved) {
      throw new Error(`Isolated Wave 1 negative scenario contract failed: ${scenario}.`);
    }
    negatives[scenario] = parsed;
  }

  return {
    localOnly: true,
    positive,
    negatives,
    negativeAbortCount: Object.keys(negatives).length,
    negativeRollbackCount: Object.values(negatives).filter((result) => result.rollback === "PASS").length,
    functionDelta: {
      before: { missing: 18, drift: 1 },
      resolved: 16,
      remaining: {
        missing: 2,
        drift: 1,
        cutoverOnly: [
          "public.submit_referee_exam(text, uuid, uuid, text, jsonb)",
          "public.accept_canonical_institution_invitation(text, uuid, text[])",
          "public.consume_coach_rate_limit(text, text, integer, integer)",
        ],
      },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase4BWave1Postgres())}\n`);
}

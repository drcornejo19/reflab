import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const postgresBin =
  process.env.POSTGRES_BIN ??
  "C:\\Program Files\\PostgreSQL\\18\\bin";
const initdb = join(postgresBin, "initdb.exe");
const pgCtl = join(postgresBin, "pg_ctl.exe");
const createdb = join(postgresBin, "createdb.exe");
const psql = join(postgresBin, "psql.exe");
const baselinePath = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202607270000_reflab_canonical_baseline.sql"
);
const seedPath = resolve(
  repositoryRoot,
  "supabase",
  "seed",
  "development_seed.sql"
);
const migrationPath = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202607300001_clerk_identity_links.sql"
);
const resolutionMigrationPath = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202608030001_development_identity_resolution.sql"
);
const adminAccessMigrationPath = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202608110001_canonical_admin_user_access.sql"
);
const temporaryRoot = mkdtempSync(
  join(tmpdir(), "reflab-identity-linker-postgres-")
);
const dataDirectory = join(temporaryRoot, "data");
const logPath = join(temporaryRoot, "postgres.log");
const bootstrapPath = join(temporaryRoot, "supabase-bootstrap.sql");
const behaviorPath = join(temporaryRoot, "identity-linker-behavior.sql");
const rollbackMigrationPath = join(
  temporaryRoot,
  "identity-linker-rollback.sql"
);
const rollbackResolutionMigrationPath = join(
  temporaryRoot,
  "identity-resolution-rollback.sql"
);
const failedResolutionMigrationPath = join(
  temporaryRoot,
  "identity-resolution-failure.sql"
);
const rollbackAdminAccessMigrationPath = join(
  temporaryRoot,
  "admin-access-rollback.sql"
);
const concurrentDemotionPath = join(
  temporaryRoot,
  "admin-access-concurrent-demotion.sql"
);
const staleAuthorizationPath = join(
  temporaryRoot,
  "admin-access-stale-authorization.sql"
);
const port = await reservePort();
const connectionEnvironment = {
  ...process.env,
  PGHOST: "127.0.0.1",
  PGPORT: String(port),
  PGUSER: "postgres",
};
let serverStarted = false;

try {
  run(initdb, [
    "--auth=trust",
    "--username=postgres",
    "--encoding=UTF8",
    "--no-locale",
    "--pgdata",
    dataDirectory,
  ]);
  run(pgCtl, [
    "start",
    "-D",
    dataDirectory,
    "-l",
    logPath,
    "-o",
    `-h 127.0.0.1 -p ${port}`,
    "-w",
  ], { quiet: true });
  serverStarted = true;

  writeFileSync(bootstrapPath, bootstrapSql(), "utf8");
  writeFileSync(behaviorPath, behaviorSql(), "utf8");

  createDatabase("reflab_identity_linker_test");
  applyBootstrapAndBaseline("reflab_identity_linker_test");
  applySqlFile("reflab_identity_linker_test", seedPath);
  applySqlFile("reflab_identity_linker_test", migrationPath);
  assertNoPublicCreatePrivilege(
    "reflab_identity_linker_test",
    "before identity resolver migration"
  );
  applySqlFile("reflab_identity_linker_test", resolutionMigrationPath);
  assertNoPublicCreatePrivilege(
    "reflab_identity_linker_test",
    "after identity resolver migration"
  );
  applySqlFile("reflab_identity_linker_test", adminAccessMigrationPath);
  assertNoPublicCreatePrivilege(
    "reflab_identity_linker_test",
    "after canonical admin access migration"
  );
  applySqlFile("reflab_identity_linker_test", behaviorPath);
  await assertAdminAccessConcurrency("reflab_identity_linker_test");
  assertCanonicalStructure("reflab_identity_linker_test");

  createDatabase("reflab_identity_linker_rollback");
  applyBootstrapAndBaseline("reflab_identity_linker_rollback");
  applySqlFile("reflab_identity_linker_rollback", seedPath);
  writeFileSync(
    rollbackMigrationPath,
    migrationWithRollback(readFileSync(migrationPath, "utf8")),
    "utf8"
  );
  applySqlFile(
    "reflab_identity_linker_rollback",
    rollbackMigrationPath
  );
  assertRollback("reflab_identity_linker_rollback");

  createDatabase("reflab_identity_resolution_rollback");
  applyBootstrapAndBaseline("reflab_identity_resolution_rollback");
  applySqlFile("reflab_identity_resolution_rollback", seedPath);
  applySqlFile("reflab_identity_resolution_rollback", migrationPath);
  writeFileSync(
    rollbackResolutionMigrationPath,
    migrationWithRollback(readFileSync(resolutionMigrationPath, "utf8")),
    "utf8"
  );
  applySqlFile(
    "reflab_identity_resolution_rollback",
    rollbackResolutionMigrationPath
  );
  assertResolutionRollback("reflab_identity_resolution_rollback");

  createDatabase("reflab_identity_resolution_failure");
  applyBootstrapAndBaseline("reflab_identity_resolution_failure");
  applySqlFile("reflab_identity_resolution_failure", seedPath);
  applySqlFile("reflab_identity_resolution_failure", migrationPath);
  assertNoPublicCreatePrivilege(
    "reflab_identity_resolution_failure",
    "before intentional migration failure"
  );
  writeFileSync(
    failedResolutionMigrationPath,
    migrationWithIntentionalFailure(
      readFileSync(resolutionMigrationPath, "utf8")
    ),
    "utf8"
  );
  applySqlFileExpectFailure(
    "reflab_identity_resolution_failure",
    failedResolutionMigrationPath
  );
  assertResolutionRollback("reflab_identity_resolution_failure");
  assertNoPublicCreatePrivilege(
    "reflab_identity_resolution_failure",
    "after intentional migration failure"
  );

  createDatabase("reflab_admin_access_rollback");
  applyBootstrapAndBaseline("reflab_admin_access_rollback");
  applySqlFile("reflab_admin_access_rollback", seedPath);
  applySqlFile("reflab_admin_access_rollback", migrationPath);
  applySqlFile("reflab_admin_access_rollback", resolutionMigrationPath);
  writeFileSync(
    rollbackAdminAccessMigrationPath,
    migrationWithRollback(readFileSync(adminAccessMigrationPath, "utf8")),
    "utf8"
  );
  applySqlFile(
    "reflab_admin_access_rollback",
    rollbackAdminAccessMigrationPath
  );
  assertAdminAccessRollback("reflab_admin_access_rollback");

  console.log(
    "Development identity linker PostgreSQL test passed in an isolated local cluster."
  );
} finally {
  if (serverStarted) {
    try {
      run(
        pgCtl,
        ["stop", "-D", dataDirectory, "-m", "fast", "-w"],
        { quiet: true }
      );
    } catch {
      console.error(
        "The isolated PostgreSQL server could not be stopped cleanly."
      );
    }
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function run(executable, args, options = {}) {
  return execFileSync(executable, args, {
    cwd: repositoryRoot,
    env: connectionEnvironment,
    encoding: "utf8",
    stdio: options.quiet ? "ignore" : ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    windowsHide: true,
  });
}

function createDatabase(databaseName) {
  run(createdb, ["--maintenance-db", "postgres", databaseName]);
}

function applyBootstrapAndBaseline(databaseName) {
  applySqlFile(databaseName, bootstrapPath);
  applySqlFile(databaseName, baselinePath);
}

function applySqlFile(databaseName, filePath) {
  run(psql, [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "--dbname",
    databaseName,
    "--file",
    filePath,
  ]);
}

function applySqlFileExpectFailure(databaseName, filePath) {
  let failed = false;

  try {
    applySqlFile(databaseName, filePath);
  } catch {
    failed = true;
  }

  if (!failed) {
    throw new Error("The intentionally failing migration succeeded.");
  }
}

function query(databaseName, sql) {
  return run(
    psql,
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "--dbname",
      databaseName,
      "--tuples-only",
      "--no-align",
      "--command",
      sql,
    ],
    { capture: true }
  ).trim();
}

async function assertAdminAccessConcurrency(databaseName) {
  query(
    databaseName,
    String.raw`
update public.user_global_roles
set role_key = 'super_admin',
    source = 'local_concurrency_setup',
    assigned_by_user_id = 'user_dev_super_admin'
where user_id = 'user_dev_referee_b';

update public.user_subscriptions
set plan_key = 'basic',
    status = 'active',
    ends_at = null,
    source = 'local_concurrency_setup',
    assigned_by_user_id = 'user_dev_super_admin'
where user_id = 'user_dev_referee_a';

delete from public.access_change_audit
where reason in ('local concurrent demotion', 'local stale authorization');
`
  );

  writeFileSync(
    concurrentDemotionPath,
    String.raw`
begin;
select public.admin_set_canonical_global_role(
  'user_dev_referee_b',
  'user_dev_super_admin',
  'referee',
  'local concurrent demotion'
);
select pg_catalog.pg_sleep(2);
commit;
`,
    "utf8"
  );
  writeFileSync(
    staleAuthorizationPath,
    String.raw`
\set VERBOSITY verbose
begin;
select public.admin_set_canonical_user_plan(
  'user_dev_super_admin',
  'user_dev_referee_a',
  'pro',
  'local stale authorization'
);
commit;
`,
    "utf8"
  );

  const demotion = runPsqlFileAsync(
    databaseName,
    concurrentDemotionPath,
    "reflab_admin_concurrent_demotion"
  );
  await waitForActiveQuery(
    databaseName,
    "reflab_admin_concurrent_demotion",
    "pg_sleep"
  );

  let staleAuthorizationRejected = false;
  try {
    applySqlFile(databaseName, staleAuthorizationPath);
  } catch (error) {
    const diagnostic = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
    staleAuthorizationRejected =
      /Only a canonical Super Admin can change plans/.test(diagnostic) &&
      /42501/.test(diagnostic);
  }

  await demotion;
  if (!staleAuthorizationRejected) {
    throw new Error("A stale Super Admin authorization was not rejected.");
  }

  const result = JSON.parse(
    query(
      databaseName,
      String.raw`
select pg_catalog.json_build_object(
  'actor_role', (
    select role_key
    from public.user_global_roles
    where user_id = 'user_dev_super_admin'
  ),
  'target_plan', (
    select plan_key
    from public.user_subscriptions
    where user_id = 'user_dev_referee_a'
  ),
  'demotion_audits', (
    select pg_catalog.count(*)
    from public.access_change_audit
    where reason = 'local concurrent demotion'
      and action = 'access.global_role.changed'
  ),
  'stale_plan_audits', (
    select pg_catalog.count(*)
    from public.access_change_audit
    where reason = 'local stale authorization'
  )
);
`
    )
  );

  if (
    result.actor_role !== "referee" ||
    result.target_plan !== "basic" ||
    Number(result.demotion_audits) !== 1 ||
    Number(result.stale_plan_audits) !== 0
  ) {
    throw new Error("Concurrent administration left inconsistent state or audit rows.");
  }
}

function runPsqlFileAsync(databaseName, filePath, applicationName) {
  const child = spawn(
    psql,
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "--dbname",
      databaseName,
      "--file",
      filePath,
    ],
    {
      cwd: repositoryRoot,
      env: { ...connectionEnvironment, PGAPPNAME: applicationName },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error("Concurrent PostgreSQL test timed out."));
    }, 15_000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Concurrent PostgreSQL process failed: ${stdout}${stderr}`));
    });
  });
}

async function waitForActiveQuery(databaseName, applicationName, fragment) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = query(
      databaseName,
    String.raw`select exists (
  select 1
  from pg_catalog.pg_stat_activity activity
  where activity.application_name = '${applicationName}'
    and activity.state = 'active'
    and pg_catalog.strpos(activity.query, '${fragment}') > 0
);`
    );
    if (active === "t") return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  throw new Error("Concurrent PostgreSQL demotion did not reach its lock barrier.");
}

function bootstrapSql() {
  return String.raw`
do $roles$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'anon'
  ) then
    create role anon nologin;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) then
    create role authenticated nologin;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'service_role'
  ) then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create schema extensions;
create schema storage;
create schema supabase_migrations;

create table supabase_migrations.schema_migrations (
  version text primary key
);

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key,
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id text
);

alter table storage.objects enable row level security;

create function storage.foldername(name text)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $function$
  select pg_catalog.string_to_array(name, '/');
$function$;
`;
}

function behaviorSql() {
  return String.raw`
begin;

do $assertions$
declare
  link_status text;
  resolved_user_id text;
  mutation_result jsonb;
  audit_count integer;
  plan_before_failure text;
  incomplete_target text;
begin
  if exists (
    select 1
    from pg_catalog.pg_roles role
    where role.rolname = 'reflab_rls_owner'
      and (
        role.rolcanlogin
        or role.rolsuper
        or role.rolcreatedb
        or role.rolcreaterole
        or role.rolinherit
        or role.rolbypassrls
      )
  ) then
    raise exception 'canonical RLS owner has unsafe attributes';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles role
    where role.rolname = 'reflab_identity_linker_owner'
  ) then
    raise exception 'unexpected identity linker role was created';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where namespace.nspname = 'public'
      and function_row.proname = 'link_development_clerk_identity'
      and owner_role.rolname = 'reflab_rls_owner'
      and function_row.prosecdef
      and function_row.proconfig = array['search_path=pg_catalog']
  ) then
    raise exception 'identity linker RPC ownership is unsafe';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where namespace.nspname = 'public'
      and function_row.proname = 'resolve_development_clerk_identity'
      and owner_role.rolname = 'reflab_rls_owner'
      and function_row.prosecdef
      and function_row.proconfig = array['search_path=pg_catalog']
  ) then
    raise exception 'identity resolver RPC ownership is unsafe';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class table_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = table_row.relnamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = table_row.relowner
    where namespace.nspname = 'reflab_private'
      and table_row.relname = 'user_identity_links'
      and table_row.relrowsecurity
      and table_row.relforcerowsecurity
      and owner_role.rolname = 'reflab_rls_owner'
  ) then
    raise exception 'identity link table ownership or RLS is unsafe';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'reflab_private.user_identity_links',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'reflab_private.user_identity_links',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'reflab_private.user_identity_links',
    'SELECT'
  ) then
    raise exception 'identity link table leaked direct read access';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.link_development_clerk_identity(text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.link_development_clerk_identity(text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.link_development_clerk_identity(text)',
    'EXECUTE'
  ) then
    raise exception 'identity linker RPC grants are incorrect';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.resolve_development_clerk_identity(text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.resolve_development_clerk_identity(text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.resolve_development_clerk_identity(text)',
    'EXECUTE'
  ) then
    raise exception 'identity resolver RPC grants are incorrect';
  end if;

  if (
    select pg_catalog.array_agg(policy.policyname order by policy.policyname)
    from pg_catalog.pg_policies policy
    where policy.policyname in (
      'user_identity_links_rls_owner_read',
      'user_identity_links_rls_owner_insert',
      'reflab_schema_state_identity_rls_owner_read',
      'user_profiles_identity_rls_owner_read',
      'user_subscriptions_identity_rls_owner_read'
    )
  ) <> array[
    'reflab_schema_state_identity_rls_owner_read',
    'user_identity_links_rls_owner_insert',
    'user_identity_links_rls_owner_read',
    'user_profiles_identity_rls_owner_read',
    'user_subscriptions_identity_rls_owner_read'
  ]::name[] then
    raise exception 'identity linker policy inventory is incomplete';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"user_clerk_unlinked"}',
    true
  );
  select reflab_private.request_user_id()
  into resolved_user_id;
  if resolved_user_id <> 'user_clerk_unlinked' then
    raise exception 'unlinked Clerk subject did not use the fallback';
  end if;

  select public.resolve_development_clerk_identity(
    'user_clerk_unlinked'
  )
  into resolved_user_id;
  if resolved_user_id is not null then
    raise exception 'unlinked Clerk subject resolved unexpectedly';
  end if;

  link_status := public.link_development_clerk_identity(
    'user_clerk_local_a'
  );
  if link_status <> 'created' then
    raise exception 'new link did not return created';
  end if;

  link_status := public.link_development_clerk_identity(
    'user_clerk_local_a'
  );
  if link_status <> 'already_linked' then
    raise exception 'repeated link was not idempotent';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"user_clerk_local_a"}',
    true
  );
  select reflab_private.request_user_id()
  into resolved_user_id;
  if resolved_user_id <> 'user_dev_referee_a' then
    raise exception 'linked Clerk subject did not resolve to the synthetic user';
  end if;

  select public.resolve_development_clerk_identity(
    'user_clerk_local_a'
  )
  into resolved_user_id;
  if resolved_user_id <> 'user_dev_referee_a' then
    raise exception 'server identity resolver did not return the canonical user';
  end if;

  delete from reflab_private.user_identity_links;
  insert into reflab_private.user_identity_links (
    provider,
    external_subject,
    user_id
  )
  values (
    'clerk',
    'user_clerk_conflicting_subject',
    'user_dev_referee_b'
  );

  link_status := public.link_development_clerk_identity(
    'user_clerk_conflicting_subject'
  );
  if link_status <> 'conflict' then
    raise exception 'subject linked to another person was not rejected';
  end if;

  delete from reflab_private.user_identity_links;
  insert into reflab_private.user_identity_links (
    provider,
    external_subject,
    user_id
  )
  values (
    'clerk',
    'user_clerk_other_subject',
    'user_dev_referee_a'
  );

  link_status := public.link_development_clerk_identity(
    'user_clerk_new_subject'
  );
  if link_status <> 'conflict' then
    raise exception 'person linked to another subject was not rejected';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where namespace.nspname = 'public'
      and function_row.proname in (
        'admin_set_canonical_user_plan',
        'admin_set_canonical_global_role'
      )
      and owner_role.rolname = 'reflab_rls_owner'
      and function_row.prosecdef
      and function_row.proconfig = array['search_path=pg_catalog']
  ) <> 2 then
    raise exception 'canonical admin RPC ownership is unsafe';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.admin_set_canonical_user_plan(text,text,text,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_set_canonical_user_plan(text,text,text,text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_set_canonical_user_plan(text,text,text,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.admin_set_canonical_global_role(text,text,text,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_set_canonical_global_role(text,text,text,text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_set_canonical_global_role(text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'canonical admin RPC grants are incorrect';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies policy
    where policy.policyname in (
      'reflab_schema_state_admin_mutation_read',
      'user_profiles_admin_mutation_target_read',
      'user_subscriptions_admin_mutation_target_read',
      'user_subscriptions_admin_mutation_target_update',
      'user_global_roles_admin_mutation_target_update',
      'user_global_roles_admin_actor_lock',
      'access_change_audit_admin_mutation_insert'
    )
      and policy.roles = array['reflab_rls_owner']::name[]
  ) <> 7 then
    raise exception 'canonical admin policy inventory is incomplete';
  end if;

  mutation_result := public.admin_set_canonical_user_plan(
    'user_dev_super_admin',
    'user_dev_referee_b',
    'pro',
    'local transactional test'
  );
  if mutation_result ->> 'status' <> 'updated' then
    raise exception 'canonical plan upgrade did not update';
  end if;

  mutation_result := public.admin_set_canonical_user_plan(
    'user_dev_super_admin',
    'user_dev_referee_b',
    'pro',
    'local transactional test'
  );
  if mutation_result ->> 'status' <> 'unchanged' then
    raise exception 'canonical plan retry was not idempotent';
  end if;

  select pg_catalog.count(*)
  into audit_count
  from public.access_change_audit audit
  where audit.target_user_id = 'user_dev_referee_b'
    and audit.action = 'access.plan.changed';
  if audit_count <> 1 then
    raise exception 'canonical plan retry duplicated audit records';
  end if;

  mutation_result := public.admin_set_canonical_global_role(
    'user_dev_super_admin',
    'user_dev_referee_b',
    'super_admin',
    'local transactional test'
  );
  if mutation_result ->> 'status' <> 'updated' then
    raise exception 'canonical role promotion did not update';
  end if;

  mutation_result := public.admin_set_canonical_global_role(
    'user_dev_super_admin',
    'user_dev_referee_b',
    'super_admin',
    'local transactional test'
  );
  if mutation_result ->> 'status' <> 'unchanged' then
    raise exception 'canonical role retry was not idempotent';
  end if;

  select pg_catalog.count(*)
  into audit_count
  from public.access_change_audit audit
  where audit.target_user_id = 'user_dev_referee_b'
    and audit.action = 'access.global_role.changed';
  if audit_count <> 1 then
    raise exception 'canonical role retry duplicated audit records';
  end if;

  begin
    perform public.admin_set_canonical_user_plan(
      'user_dev_referee_a',
      'user_dev_referee_b',
      'basic',
      null
    );
    raise exception 'non-Super Admin plan change succeeded';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.admin_set_canonical_user_plan(
      'user_dev_institution_admin',
      'user_dev_referee_b',
      'basic',
      null
    );
    raise exception 'institution administrator used a global RPC';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.admin_set_canonical_global_role(
      'user_dev_super_admin',
      'missing_canonical_user',
      'referee',
      null
    );
    raise exception 'missing canonical target was accepted';
  exception
    when sqlstate 'P0002' then null;
  end;

  begin
    perform public.admin_set_canonical_user_plan(
      'user_dev_super_admin',
      'user_dev_referee_b',
      'enterprise',
      null
    );
    raise exception 'invalid individual plan was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.admin_set_canonical_user_plan(
      'user_dev_super_admin',
      'user_dev_referee_b',
      null,
      null
    );
    raise exception 'null individual plan was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.admin_set_canonical_global_role(
      'user_dev_super_admin',
      'user_dev_referee_b',
      'institution_admin',
      null
    );
    raise exception 'invalid global role was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.admin_set_canonical_global_role(
      'user_dev_super_admin',
      'user_dev_referee_b',
      null,
      null
    );
    raise exception 'null global role was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.admin_set_canonical_global_role(
      'user_dev_super_admin',
      'user_dev_super_admin',
      'referee',
      null
    );
    raise exception 'self-demotion was accepted';
  exception
    when sqlstate '42501' then null;
  end;

  insert into public.user_global_roles (
    user_id,
    role_key,
    source,
    assigned_by_user_id
  ) values (
    'local_missing_profile',
    'referee',
    'local_test',
    'user_dev_super_admin'
  );
  insert into public.user_subscriptions (
    user_id,
    plan_key,
    status,
    source,
    assigned_by_user_id
  ) values (
    'local_missing_profile',
    'basic',
    'active',
    'local_test',
    'user_dev_super_admin'
  );

  insert into public.user_profiles (user_id)
  values ('local_missing_role');
  insert into public.user_subscriptions (
    user_id,
    plan_key,
    status,
    source,
    assigned_by_user_id
  ) values (
    'local_missing_role',
    'basic',
    'active',
    'local_test',
    'user_dev_super_admin'
  );

  insert into public.user_profiles (user_id)
  values ('local_missing_subscription');
  insert into public.user_global_roles (
    user_id,
    role_key,
    source,
    assigned_by_user_id
  ) values (
    'local_missing_subscription',
    'referee',
    'local_test',
    'user_dev_super_admin'
  );

  foreach incomplete_target in array array[
    'local_missing_profile',
    'local_missing_role',
    'local_missing_subscription'
  ] loop
    begin
      perform public.admin_set_canonical_user_plan(
        'user_dev_super_admin',
        incomplete_target,
        'pro',
        null
      );
      raise exception 'plan RPC accepted incomplete target %', incomplete_target;
    exception
      when sqlstate 'P0002' then null;
    end;

    begin
      perform public.admin_set_canonical_global_role(
        'user_dev_super_admin',
        incomplete_target,
        'super_admin',
        null
      );
      raise exception 'role RPC accepted incomplete target %', incomplete_target;
    exception
      when sqlstate 'P0002' then null;
    end;
  end loop;

  if exists (
    select 1
    from public.access_change_audit audit
    where audit.target_user_id like 'local_missing_%'
  ) then
    raise exception 'incomplete canonical target produced an audit row';
  end if;

  select subscription.plan_key
  into plan_before_failure
  from public.user_subscriptions subscription
  where subscription.user_id = 'user_dev_referee_b';

  execute 'alter table public.access_change_audit add constraint access_change_audit_local_failure check (false) not valid';
  begin
    perform public.admin_set_canonical_user_plan(
      'user_dev_super_admin',
      'user_dev_referee_b',
      'basic',
      'must rollback'
    );
    raise exception 'forced audit failure did not fail';
  exception
    when check_violation then null;
  end;
  execute 'alter table public.access_change_audit drop constraint access_change_audit_local_failure';

  if (
    select subscription.plan_key
    from public.user_subscriptions subscription
    where subscription.user_id = 'user_dev_referee_b'
  ) <> plan_before_failure then
    raise exception 'RPC failure did not rollback its subscription update';
  end if;

  if exists (
    select 1
    from public.user_roles legacy_role
    where legacy_role.user_id = 'user_dev_referee_b'
  ) then
    raise exception 'canonical administration touched legacy user_roles';
  end if;
end
$assertions$;

select pg_catalog.set_config(
  'reflab.admin_actor_user_id',
  'user_dev_super_admin',
  true
);
select pg_catalog.set_config(
  'reflab.admin_target_user_id',
  'user_dev_referee_b',
  true
);
set local role reflab_rls_owner;

do $admin_policy_boundaries$
declare
  updated_rows integer;
begin
  begin
    update public.user_global_roles global_role
    set source = global_role.source
    where global_role.user_id = 'user_dev_super_admin';
    raise exception 'actor lock policy authorized an actor UPDATE';
  exception
    when sqlstate '42501' then null;
  end;

  update public.user_global_roles global_role
  set source = global_role.source
  where global_role.user_id = 'user_dev_referee_b';
  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'target mutation policy did not authorize the target UPDATE';
  end if;
end
$admin_policy_boundaries$;

reset role;

rollback;
`;
}

function migrationWithRollback(migrationSql) {
  const matches = [...migrationSql.matchAll(/^commit;\s*$/gim)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected one canonical migration COMMIT, found ${matches.length}.`
    );
  }

  return migrationSql.replace(/^commit;\s*$/im, "rollback;");
}

function migrationWithIntentionalFailure(migrationSql) {
  const matches = [...migrationSql.matchAll(/^commit;\s*$/gim)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected one canonical migration COMMIT, found ${matches.length}.`
    );
  }

  return migrationSql.replace(
    /^commit;\s*$/im,
    String.raw`do $intentional_failure$
begin
  raise exception 'intentional identity resolution migration failure';
end
$intentional_failure$;

commit;`
  );
}

function assertNoPublicCreatePrivilege(databaseName, stage) {
  const hasPrivilege = query(
    databaseName,
    String.raw`select pg_catalog.has_schema_privilege(
  'reflab_rls_owner',
  'public',
  'CREATE'
);`
  );

  if (hasPrivilege !== "f") {
    throw new Error(
      `reflab_rls_owner retained CREATE on public ${stage}.`
    );
  }
}

function assertCanonicalStructure(databaseName) {
  const result = query(
    databaseName,
    String.raw`
select pg_catalog.json_build_object(
  'public_tables',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_class table_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relkind in ('r', 'p')
  ),
  'private_tables',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_class table_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = table_row.relnamespace
    where namespace.nspname in ('reflab_private', 'reflab_meta')
      and table_row.relkind in ('r', 'p')
  ),
  'functions',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    where namespace.nspname in (
      'public',
      'reflab_private',
      'reflab_meta'
    )
  ),
  'policies',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies policy
    where policy.schemaname in (
      'public',
      'reflab_private',
      'reflab_meta'
    )
       or (
         policy.schemaname = 'storage'
         and policy.tablename = 'objects'
       )
  ),
  'triggers',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class table_row
      on table_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = table_row.relnamespace
    where namespace.nspname in (
      'public',
      'reflab_private',
      'reflab_meta'
    )
      and not trigger_row.tgisinternal
  )
);
`
  );
  const parsed = JSON.parse(result);
  const expected = {
    public_tables: 79,
    private_tables: 2,
    functions: 25,
    policies: 132,
    triggers: 82,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (Number(parsed[key]) !== expectedValue) {
      throw new Error(
        `Unexpected ${key}: expected ${expectedValue}, found ${parsed[key]}.`
      );
    }
  }

  const baselineSql = readFileSync(baselinePath, "utf8");
  const migrationSql = readFileSync(migrationPath, "utf8");
  const resolutionMigrationSql = readFileSync(
    resolutionMigrationPath,
    "utf8"
  );
  const adminAccessMigrationSql = readFileSync(
    adminAccessMigrationPath,
    "utf8"
  );
  const explicitIndexCount =
    (
      baselineSql.match(
        /^\s*create\s+(?:unique\s+)?index\s+/gim
      ) ?? []
    ).length +
    (
      migrationSql.match(
        /^\s*create\s+(?:unique\s+)?index\s+/gim
      ) ?? []
    ).length +
    (
      resolutionMigrationSql.match(
        /^\s*create\s+(?:unique\s+)?index\s+/gim
      ) ?? []
    ).length +
    (
      adminAccessMigrationSql.match(
        /^\s*create\s+(?:unique\s+)?index\s+/gim
      ) ?? []
    ).length;
  if (explicitIndexCount !== 110) {
    throw new Error(
      `Unexpected explicit index count: ${explicitIndexCount}.`
    );
  }
}

function assertRollback(databaseName) {
  const result = query(
    databaseName,
    String.raw`
select pg_catalog.json_build_object(
  'table_absent',
  pg_catalog.to_regclass(
    'reflab_private.user_identity_links'
  ) is null,
  'rpc_absent',
  pg_catalog.to_regprocedure(
    'public.link_development_clerk_identity(text)'
  ) is null,
  'rls_owner_safe',
  exists (
    select 1
    from pg_catalog.pg_roles role
    where role.rolname = 'reflab_rls_owner'
      and not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolbypassrls
  ),
  'helper_invoker',
  not function_row.prosecdef
)
from pg_catalog.pg_proc function_row
join pg_catalog.pg_namespace namespace
  on namespace.oid = function_row.pronamespace
where namespace.nspname = 'reflab_private'
  and function_row.proname = 'request_user_id';
`
  );
  const parsed = JSON.parse(result);
  if (
  parsed.table_absent !== true ||
    parsed.rpc_absent !== true ||
    parsed.rls_owner_safe !== true ||
    parsed.helper_invoker !== true
  ) {
    throw new Error("Identity linker rollback left persistent objects.");
  }
}

function assertResolutionRollback(databaseName) {
  const result = query(
    databaseName,
    String.raw`
select pg_catalog.json_build_object(
  'resolver_absent',
  pg_catalog.to_regprocedure(
    'public.resolve_development_clerk_identity(text)'
  ) is null,
  'identity_table_present',
  pg_catalog.to_regclass(
    'reflab_private.user_identity_links'
  ) is not null,
  'linker_rpc_present',
  pg_catalog.to_regprocedure(
    'public.link_development_clerk_identity(text)'
  ) is not null,
  'owner_has_no_public_create',
  not pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  )
);
`
  );
  const parsed = JSON.parse(result);
  if (
    parsed.resolver_absent !== true ||
    parsed.identity_table_present !== true ||
    parsed.linker_rpc_present !== true ||
    parsed.owner_has_no_public_create !== true
  ) {
    throw new Error(
      "Identity resolution rollback left persistent objects."
    );
  }
}

function assertAdminAccessRollback(databaseName) {
  const result = query(
    databaseName,
    String.raw`
select pg_catalog.json_build_object(
  'plan_rpc_absent',
  pg_catalog.to_regprocedure(
    'public.admin_set_canonical_user_plan(text,text,text,text)'
  ) is null,
  'role_rpc_absent',
  pg_catalog.to_regprocedure(
    'public.admin_set_canonical_global_role(text,text,text,text)'
  ) is null,
  'admin_policies_absent',
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.policyname in (
      'reflab_schema_state_admin_mutation_read',
      'user_profiles_admin_mutation_target_read',
      'user_subscriptions_admin_mutation_target_read',
      'user_subscriptions_admin_mutation_target_update',
      'user_global_roles_admin_mutation_target_update',
      'user_global_roles_admin_actor_lock',
      'access_change_audit_admin_mutation_insert'
    )
  ),
  'owner_has_no_public_create',
  not pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  ),
  'owner_has_no_role_update',
  not pg_catalog.has_table_privilege(
    'reflab_rls_owner',
    'public.user_global_roles',
    'UPDATE'
  ),
  'owner_has_no_subscription_update',
  not pg_catalog.has_table_privilege(
    'reflab_rls_owner',
    'public.user_subscriptions',
    'UPDATE'
  )
);
`
  );
  const parsed = JSON.parse(result);
  if (Object.values(parsed).some((value) => value !== true)) {
    throw new Error("Canonical admin migration rollback left privileges or objects.");
  }
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local PostgreSQL port."));
        return;
      }
      const selectedPort = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(selectedPort);
      });
    });
  });
}

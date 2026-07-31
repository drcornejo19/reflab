import { execFileSync } from "node:child_process";
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
  applySqlFile("reflab_identity_linker_test", behaviorPath);
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
end
$assertions$;

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
    functions: 22,
    policies: 125,
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

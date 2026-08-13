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
const superAdminIdentityMigrationPath = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202608110002_development_super_admin_identity_link.sql"
);
const trainingAttemptsMigrationPath = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202608130001_canonical_training_attempts.sql"
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
const rollbackSuperAdminIdentityMigrationPath = join(
  temporaryRoot,
  "super-admin-identity-rollback.sql"
);
const concurrentDemotionPath = join(
  temporaryRoot,
  "admin-access-concurrent-demotion.sql"
);
const staleAuthorizationPath = join(
  temporaryRoot,
  "admin-access-stale-authorization.sql"
);
const concurrentIdentityPath = join(
  temporaryRoot,
  "identity-link-concurrent-first.sql"
);
const trainingBehaviorPath = join(
  temporaryRoot,
  "canonical-training-behavior.sql"
);
const concurrentTrainingPath = join(
  temporaryRoot,
  "canonical-training-concurrent-first.sql"
);
const rollbackTrainingMigrationPath = join(
  temporaryRoot,
  "canonical-training-rollback.sql"
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
  writeFileSync(trainingBehaviorPath, trainingBehaviorSql(), "utf8");

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
  applySqlFile(
    "reflab_identity_linker_test",
    superAdminIdentityMigrationPath
  );
  assertNoPublicCreatePrivilege(
    "reflab_identity_linker_test",
    "after Development Super Admin identity migration"
  );
  applySqlFile(
    "reflab_identity_linker_test",
    trainingAttemptsMigrationPath
  );
  assertNoPublicCreatePrivilege(
    "reflab_identity_linker_test",
    "after canonical training attempts migration"
  );
  assertTrainingAttemptSecurity("reflab_identity_linker_test");
  assertRlsOwnerPolicyIsolation("reflab_identity_linker_test");
  await assertIdentityLinkConcurrency("reflab_identity_linker_test");
  applySqlFile("reflab_identity_linker_test", behaviorPath);
  await assertAdminAccessConcurrency("reflab_identity_linker_test");
  applySqlFile("reflab_identity_linker_test", trainingBehaviorPath);
  await assertTrainingAttemptConcurrency("reflab_identity_linker_test");
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

  createDatabase("reflab_super_admin_identity_rollback");
  applyBootstrapAndBaseline("reflab_super_admin_identity_rollback");
  applySqlFile("reflab_super_admin_identity_rollback", seedPath);
  applySqlFile("reflab_super_admin_identity_rollback", migrationPath);
  applySqlFile(
    "reflab_super_admin_identity_rollback",
    resolutionMigrationPath
  );
  applySqlFile(
    "reflab_super_admin_identity_rollback",
    adminAccessMigrationPath
  );
  writeFileSync(
    rollbackSuperAdminIdentityMigrationPath,
    migrationWithRollback(
      readFileSync(superAdminIdentityMigrationPath, "utf8")
    ),
    "utf8"
  );
  applySqlFile(
    "reflab_super_admin_identity_rollback",
    rollbackSuperAdminIdentityMigrationPath
  );
  assertSuperAdminIdentityRollback(
    "reflab_super_admin_identity_rollback"
  );

  createDatabase("reflab_training_attempts_rollback");
  applyBootstrapAndBaseline("reflab_training_attempts_rollback");
  applySqlFile("reflab_training_attempts_rollback", seedPath);
  applySqlFile("reflab_training_attempts_rollback", migrationPath);
  applySqlFile(
    "reflab_training_attempts_rollback",
    resolutionMigrationPath
  );
  applySqlFile(
    "reflab_training_attempts_rollback",
    adminAccessMigrationPath
  );
  applySqlFile(
    "reflab_training_attempts_rollback",
    superAdminIdentityMigrationPath
  );
  writeFileSync(
    rollbackTrainingMigrationPath,
    migrationWithRollback(
      readFileSync(trainingAttemptsMigrationPath, "utf8")
    ),
    "utf8"
  );
  applySqlFile(
    "reflab_training_attempts_rollback",
    rollbackTrainingMigrationPath
  );
  assertTrainingAttemptRollback("reflab_training_attempts_rollback");

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

async function assertIdentityLinkConcurrency(databaseName) {
  const initialCount = query(
    databaseName,
    "select pg_catalog.count(*) from reflab_private.user_identity_links;"
  );
  if (initialCount !== "0") {
    throw new Error("Identity concurrency test requires an empty link table.");
  }

  const crossSubject = "user_clerk_concurrent_cross_target";
  const { operation: crossTargetFirst } = await startConcurrentIdentityCall(
    databaseName,
    "reflab_identity_cross_target",
    `public.link_development_clerk_identity('${crossSubject}')`
  );
  const crossTargetSecond = query(
    databaseName,
    `select public.link_development_super_admin_clerk_identity('${crossSubject}');`
  );
  await crossTargetFirst;
  if (crossTargetSecond !== "conflict") {
    throw new Error("One Clerk subject was linked to two canonical targets.");
  }
  assertExactIdentityLinks(databaseName, [
    [crossSubject, "user_dev_referee_a"],
  ]);
  deleteIdentityTestLinks(databaseName, [crossSubject]);

  query(
    databaseName,
    String.raw`begin;
select public.link_development_super_admin_clerk_identity(
  'user_clerk_concurrent_rollback'
);
rollback;`
  );
  if (
    query(
      databaseName,
      "select pg_catalog.count(*) from reflab_private.user_identity_links;"
    ) !== "0"
  ) {
    throw new Error("Rolled-back identity linking left a residual row.");
  }

  const protectedRefereeSubject = "user_clerk_protected_referee";
  if (
    query(
      databaseName,
      `select public.link_development_clerk_identity('${protectedRefereeSubject}');`
    ) !== "created"
  ) {
    throw new Error("The protected referee fixture link was not created.");
  }

  const winningSubject = "user_clerk_super_admin_winner";
  const losingSubject = "user_clerk_super_admin_conflict";
  const { operation: differentSubjectsFirst } =
    await startConcurrentIdentityCall(
    databaseName,
    "reflab_identity_same_target",
    `public.link_development_super_admin_clerk_identity('${winningSubject}')`
  );
  const differentSubjectsSecond = query(
    databaseName,
    `select public.link_development_super_admin_clerk_identity('${losingSubject}');`
  );
  await differentSubjectsFirst;
  if (differentSubjectsSecond !== "conflict") {
    throw new Error("Two Clerk subjects linked to the fixed Super Admin target.");
  }
  assertExactIdentityLinks(databaseName, [
    [protectedRefereeSubject, "user_dev_referee_a"],
    [winningSubject, "user_dev_super_admin"],
  ]);
  deleteIdentityTestLinks(databaseName, [winningSubject]);

  const repeatedSubject = "user_clerk_super_admin_repeated";
  const { operation: samePairFirst } = await startConcurrentIdentityCall(
    databaseName,
    "reflab_identity_same_pair",
    `public.link_development_super_admin_clerk_identity('${repeatedSubject}')`
  );
  const samePairSecond = query(
    databaseName,
    `select public.link_development_super_admin_clerk_identity('${repeatedSubject}');`
  );
  await samePairFirst;
  if (samePairSecond !== "already_linked") {
    throw new Error("Concurrent identical linking was not idempotent.");
  }
  assertExactIdentityLinks(databaseName, [
    [protectedRefereeSubject, "user_dev_referee_a"],
    [repeatedSubject, "user_dev_super_admin"],
  ]);

  deleteIdentityTestLinks(databaseName, [
    protectedRefereeSubject,
    repeatedSubject,
  ]);
  if (
    query(
      databaseName,
      "select pg_catalog.count(*) from reflab_private.user_identity_links;"
    ) !== "0"
  ) {
    throw new Error("Identity concurrency test left residual rows.");
  }
}

function trainingBehaviorSql() {
  return String.raw`
begin;

insert into public.clips (
  id,
  sport_type,
  title,
  video_url,
  topic,
  difficulty,
  mode,
  correct_foul,
  correct_restart,
  correct_discipline,
  correct_var,
  is_active,
  status
)
values (
  '91000000-0000-4000-8000-000000000001',
  'football_11',
  'Local canonical training clip',
  'https://development.invalid/training.mp4',
  'Dispute',
  'basic',
  'field',
  true,
  'Tiro libre directo',
  'Sin sancion',
  false,
  true,
  'published'
);

insert into public.user_profiles (user_id, ref_card_id, reflab_name)
values ('user_local_training_basic', 'RF-LOCAL-TRAINING', 'Local training basic');

insert into public.user_global_roles (
  user_id, role_key, source, assigned_by_user_id
)
values (
  'user_local_training_basic',
  'referee',
  'local_training_test',
  'user_dev_super_admin'
);

insert into public.user_subscriptions (
  id, user_id, plan_key, status, source, assigned_by_user_id
)
values (
  '91500000-0000-4000-8000-000000000001',
  'user_local_training_basic',
  'basic',
  'active',
  'local_training_test',
  'user_dev_super_admin'
);

set local role service_role;

do $training_behavior$
declare
  first_result jsonb;
  repeated_result jsonb;
  attempt_row public.attempts%rowtype;
  rejected boolean;
  index_value integer;
begin
  first_result := public.submit_canonical_training_attempt(
    'user_dev_referee_a',
    '92000000-0000-4000-8000-000000000001',
    '{
      "sport_type":"football_11",
      "activity_type":"video_training",
      "clip_id":"91000000-0000-4000-8000-000000000001",
      "clip_title":"Local canonical training clip",
      "source_item_type":"global_clip",
      "source_item_id":"91000000-0000-4000-8000-000000000001",
      "module":"decision",
      "mode":"training",
      "topic":"Dispute",
      "score":100,
      "is_correct":true,
      "selected_decision":"Falta",
      "correct_decision":"Falta",
      "technical_correct":true
    }'::jsonb,
    0
  );

  if first_result->>'status' <> 'created' then
    raise exception 'canonical training attempt was not created';
  end if;

  repeated_result := public.submit_canonical_training_attempt(
    'user_dev_referee_a',
    '92000000-0000-4000-8000-000000000001',
    '{
      "technical_correct":true,
      "correct_decision":"Falta",
      "selected_decision":"Falta",
      "is_correct":true,
      "score":100,
      "topic":"Dispute",
      "mode":"training",
      "module":"decision",
      "source_item_id":"91000000-0000-4000-8000-000000000001",
      "source_item_type":"global_clip",
      "clip_title":"Local canonical training clip",
      "clip_id":"91000000-0000-4000-8000-000000000001",
      "activity_type":"video_training",
      "sport_type":"football_11"
    }'::jsonb,
    0
  );

  if repeated_result->>'status' <> 'already_recorded' then
    raise exception 'canonical training retry was not idempotent';
  end if;

  select attempt.*
  into attempt_row
  from public.attempts attempt
  where attempt.submission_id = '92000000-0000-4000-8000-000000000001';

  if attempt_row.user_id <> 'user_dev_referee_a'
     or attempt_row.exam_result_id is not null
     or attempt_row.canonical_payload_hash !~ '^[0-9a-f]{64}$'
     or attempt_row.source_occurrence_id <> attempt_row.submission_id then
    raise exception 'canonical training attempt identity or provenance is invalid';
  end if;

  rejected := false;
  begin
    perform public.submit_canonical_training_attempt(
      'user_dev_referee_a',
      '92000000-0000-4000-8000-000000000001',
      '{
        "sport_type":"football_11",
        "activity_type":"video_training",
        "clip_id":"91000000-0000-4000-8000-000000000001",
        "clip_title":"Local canonical training clip",
        "source_item_type":"global_clip",
        "source_item_id":"91000000-0000-4000-8000-000000000001",
        "module":"decision",
        "mode":"training",
        "topic":"Dispute",
        "score":0,
        "is_correct":false
      }'::jsonb,
      0
    );
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'conflicting canonical training retry was accepted';
  end if;

  rejected := false;
  begin
    perform public.submit_canonical_training_attempt(
      'user_dev_referee_a',
      '92000000-0000-4000-8000-000000000002',
      '{
        "sport_type":"football_11",
        "activity_type":"video_training",
        "clip_id":"91000000-0000-4000-8000-000000000099",
        "clip_title":"Missing clip",
        "source_item_type":"global_clip",
        "source_item_id":"91000000-0000-4000-8000-000000000099",
        "score":100
      }'::jsonb,
      0
    );
  exception when no_data_found then
    rejected := true;
  end;
  if not rejected then
    raise exception 'missing canonical training clip was accepted';
  end if;

  rejected := false;
  begin
    perform public.submit_canonical_training_attempt(
      'user_dev_referee_a',
      '92000000-0000-4000-8000-000000000003',
      '{
        "sport_type":"football_11",
        "activity_type":"video_training",
        "clip_id":"91000000-0000-4000-8000-000000000001",
        "source_item_type":"global_clip",
        "source_item_id":"91000000-0000-4000-8000-000000000001",
        "score":100,
        "user_id":"attacker"
      }'::jsonb,
      0
    );
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then
    raise exception 'unsupported canonical training field was accepted';
  end if;

  rejected := false;
  begin
    perform public.submit_canonical_training_attempt(
      'user_dev_referee_a',
      '92000000-0000-4000-8000-000000000004',
      '{
        "sport_type":"football_11",
        "activity_type":"video_training",
        "clip_id":"91000000-0000-4000-8000-000000000001",
        "source_item_type":"global_clip",
        "source_item_id":"91000000-0000-4000-8000-000000000001",
        "score":"100"
      }'::jsonb,
      0
    );
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then
    raise exception 'invalid canonical training field type was accepted';
  end if;

  rejected := false;
  begin
    perform public.submit_canonical_training_attempt(
      'user_local_training_basic',
      '93000000-0000-4000-8000-000000000000',
      '{
        "sport_type":"football_11",
        "activity_type":"video_training",
        "clip_id":"91000000-0000-4000-8000-000000000001",
        "source_item_type":"global_clip",
        "source_item_id":"91000000-0000-4000-8000-000000000001",
        "score":100
      }'::jsonb,
      0
    );
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then
    raise exception 'client-supplied weekly limit bypassed canonical access';
  end if;

  for index_value in 1..5 loop
    perform public.submit_canonical_training_attempt(
      'user_local_training_basic',
      ('93000000-0000-4000-8000-' || pg_catalog.lpad(index_value::text, 12, '0'))::uuid,
      pg_catalog.jsonb_build_object(
        'sport_type', 'football_11',
        'activity_type', 'video_training',
        'clip_id', '91000000-0000-4000-8000-000000000001',
        'clip_title', 'Local canonical training clip',
        'source_item_type', 'global_clip',
        'source_item_id', '91000000-0000-4000-8000-000000000001',
        'module', 'decision',
        'mode', 'training',
        'topic', 'Dispute',
        'score', 100,
        'criterion_result', pg_catalog.jsonb_build_object('ordinal', index_value)
      ),
      5
    );
  end loop;

  rejected := false;
  begin
    perform public.submit_canonical_training_attempt(
      'user_local_training_basic',
      '93000000-0000-4000-8000-000000000006',
      '{
        "sport_type":"football_11",
        "activity_type":"video_training",
        "clip_id":"91000000-0000-4000-8000-000000000001",
        "clip_title":"Local canonical training clip",
        "source_item_type":"global_clip",
        "source_item_id":"91000000-0000-4000-8000-000000000001",
        "module":"decision",
        "mode":"training",
        "topic":"Dispute",
        "score":100
      }'::jsonb,
      5
    );
  exception when raise_exception then
    if sqlerrm = 'Canonical weekly training limit reached' then
      rejected := true;
    else
      raise;
    end if;
  end;
  if not rejected then
    raise exception 'canonical weekly training limit was not enforced';
  end if;

  if exists (select 1 from public.user_roles)
     or exists (
       select 1 from public.user_global_roles where source = 'automatic_default'
     )
     or exists (
       select 1 from public.user_subscriptions where source = 'automatic_default'
     ) then
    raise exception 'canonical training created legacy or default access rows';
  end if;
end
$training_behavior$;

reset role;

set local role reflab_rls_owner;
select pg_catalog.set_config(
  'reflab.training_user_id',
  'user_dev_referee_a',
  true
);
select pg_catalog.set_config(
  'reflab.training_institution_id',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $training_lock_boundaries$
declare
  rejected boolean;
begin
  rejected := false;
  begin
    update public.user_global_roles
    set source = 'forbidden_training_policy_update'
    where user_id = 'user_dev_referee_a';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'training role lock policy allowed mutation';
  end if;

  rejected := false;
  begin
    update public.user_subscriptions
    set source = 'forbidden_training_policy_update'
    where user_id = 'user_dev_referee_a';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'training subscription lock policy allowed mutation';
  end if;

  rejected := false;
  begin
    update public.institution_memberships
    set category = 'forbidden_training_policy_update'
    where user_id = 'user_dev_referee_a';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'training membership lock policy allowed mutation';
  end if;

  rejected := false;
  begin
    update public.institutions
    set updated_at = updated_at
    where id = '30000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'training institution lock policy allowed mutation';
  end if;

  rejected := false;
  begin
    update public.institution_subscriptions
    set source = 'forbidden_training_policy_update'
    where institution_id = '30000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'training institution subscription lock policy allowed mutation';
  end if;
end
$training_lock_boundaries$;

reset role;
rollback;
`;
}

async function assertTrainingAttemptConcurrency(databaseName) {
  query(
    databaseName,
    String.raw`
insert into public.clips (
  id, sport_type, title, video_url, topic, difficulty, mode,
  correct_foul, correct_restart, correct_discipline, correct_var,
  is_active, status
)
values (
  '91000000-0000-4000-8000-000000000002',
  'football_11',
  'Concurrent canonical training clip',
  'https://development.invalid/concurrent.mp4',
  'Dispute',
  'basic',
  'field',
  true,
  'Tiro libre directo',
  'Sin sancion',
  false,
  true,
  'published'
);

insert into public.user_profiles (user_id, ref_card_id, reflab_name)
values ('user_local_training_concurrent', 'RF-LOCAL-CONCURRENT', 'Local concurrent');

insert into public.user_global_roles (
  user_id, role_key, source, assigned_by_user_id
)
values (
  'user_local_training_concurrent',
  'referee',
  'local_training_test',
  'user_dev_super_admin'
);

insert into public.user_subscriptions (
  id, user_id, plan_key, status, source, assigned_by_user_id
)
values (
  '91500000-0000-4000-8000-000000000002',
  'user_local_training_concurrent',
  'basic',
  'active',
  'local_training_test',
  'user_dev_super_admin'
);`
  );

  const payload = String.raw`'{
    "sport_type":"football_11",
    "activity_type":"video_training",
    "clip_id":"91000000-0000-4000-8000-000000000002",
    "clip_title":"Concurrent canonical training clip",
    "source_item_type":"global_clip",
    "source_item_id":"91000000-0000-4000-8000-000000000002",
    "module":"decision",
    "mode":"training",
    "topic":"Dispute",
    "score":100
  }'::jsonb`;
  writeFileSync(
    concurrentTrainingPath,
    String.raw`
begin;
set local role service_role;
select public.submit_canonical_training_attempt(
  'user_dev_referee_a',
  '94000000-0000-4000-8000-000000000001',
  ${payload},
  0
);
select pg_catalog.pg_sleep(1);
commit;
`,
    "utf8"
  );

  const first = runPsqlFileAsync(
    databaseName,
    concurrentTrainingPath,
    "reflab_training_same_submission"
  );
  await waitForActiveQuery(
    databaseName,
    "reflab_training_same_submission",
    "pg_sleep"
  );
  const second = query(
    databaseName,
    String.raw`set role service_role;
select public.submit_canonical_training_attempt(
  'user_dev_referee_a',
  '94000000-0000-4000-8000-000000000001',
  ${payload},
  0
);
reset role;`
  );
  await first;

  if (!second.includes("already_recorded")) {
    throw new Error("Concurrent identical training retry was not idempotent.");
  }
  if (
    query(
      databaseName,
      String.raw`select pg_catalog.count(*)
from public.attempts
where submission_id = '94000000-0000-4000-8000-000000000001';`
    ) !== "1"
  ) {
    throw new Error("Concurrent training submissions created duplicate attempts.");
  }

  for (let index = 1; index <= 4; index += 1) {
    query(
      databaseName,
      String.raw`set role service_role;
select public.submit_canonical_training_attempt(
  'user_local_training_concurrent',
  ('95000000-0000-4000-8000-' || pg_catalog.lpad('${index}', 12, '0'))::uuid,
  ${payload},
  5
);
reset role;`
    );
  }

  writeFileSync(
    concurrentTrainingPath,
    String.raw`
begin;
set local role service_role;
select public.submit_canonical_training_attempt(
  'user_local_training_concurrent',
  '95000000-0000-4000-8000-000000000005',
  ${payload},
  5
);
select pg_catalog.pg_sleep(1);
commit;
`,
    "utf8"
  );

  const fifthAttempt = runPsqlFileAsync(
    databaseName,
    concurrentTrainingPath,
    "reflab_training_last_weekly_slot"
  );
  await waitForActiveQuery(
    databaseName,
    "reflab_training_last_weekly_slot",
    "pg_sleep"
  );

  let secondDistinctRejected = false;
  try {
    query(
      databaseName,
      String.raw`set role service_role;
select public.submit_canonical_training_attempt(
  'user_local_training_concurrent',
  '95000000-0000-4000-8000-000000000006',
  ${payload},
  5
);`
    );
  } catch (error) {
    secondDistinctRejected = String(error).includes(
      "Canonical weekly training limit reached"
    );
  }
  await fifthAttempt;

  if (!secondDistinctRejected) {
    throw new Error(
      "Concurrent distinct submissions did not serialize the final weekly slot."
    );
  }
  if (
    query(
      databaseName,
      String.raw`select pg_catalog.count(*)
from public.attempts
where user_id = 'user_local_training_concurrent'
  and activity_type = 'video_training';`
    ) !== "5"
  ) {
    throw new Error("Concurrent weekly limit did not leave exactly five attempts.");
  }

  query(
    databaseName,
    String.raw`delete from public.attempts
where submission_id = '94000000-0000-4000-8000-000000000001';
delete from public.attempts
where user_id = 'user_local_training_concurrent';
delete from public.user_subscriptions
where user_id = 'user_local_training_concurrent';
delete from public.user_global_roles
where user_id = 'user_local_training_concurrent';
delete from public.user_profiles
where user_id = 'user_local_training_concurrent';
delete from public.clips
where id = '91000000-0000-4000-8000-000000000002';`
  );
}

function assertTrainingAttemptSecurity(databaseName) {
  const result = JSON.parse(
    query(
      databaseName,
      String.raw`select pg_catalog.json_build_object(
  'policies', (
    select pg_catalog.json_agg(
      pg_catalog.json_build_array(
        policy.policyname,
        policy.cmd,
        policy.roles,
        policy.with_check
      )
      order by policy.policyname
    )
    from pg_catalog.pg_policies policy
    where policy.policyname like 'training_attempt_%'
  ),
  'rpc_owner_safe', exists (
    select 1
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where namespace.nspname = 'public'
      and function_row.proname = 'submit_canonical_training_attempt'
      and owner_role.rolname = 'reflab_rls_owner'
      and function_row.prosecdef
      and function_row.proconfig = array['search_path=pg_catalog']
  ),
  'service_role_execute', pg_catalog.has_function_privilege(
    'service_role',
    'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)',
    'EXECUTE'
  ),
  'forbidden_execute',
    pg_catalog.has_function_privilege(
      'anon',
      'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)',
      'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc function_row,
      lateral pg_catalog.aclexplode(
        coalesce(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )
      ) privilege
      where function_row.oid =
        'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)'::pg_catalog.regprocedure
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ),
  'unexpected_training_guc_functions', (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where owner_role.rolname = 'reflab_rls_owner'
      and pg_catalog.strpos(
        pg_catalog.lower(function_row.prosrc),
        'reflab.training_'
      ) > 0
      and function_row.proname <> 'submit_canonical_training_attempt'
  ),
  'index_matches_non_exam_contract', exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_relation
      on index_relation.oid = index_row.indexrelid
    where index_relation.relname =
      'attempts_canonical_training_submission_unique'
      and pg_catalog.pg_get_expr(
        index_row.indpred,
        index_row.indrelid
      ) = '((exam_result_id IS NULL) AND (submission_id IS NOT NULL))'
  ),
  'owner_has_no_public_create', not pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  )
);`
    )
  );

  const expectedPolicies = [
    ["training_attempt_clip_read", "SELECT"],
    ["training_attempt_existing_read", "SELECT"],
    ["training_attempt_global_role_lock", "UPDATE"],
    ["training_attempt_global_role_read", "SELECT"],
    ["training_attempt_insert", "INSERT"],
    ["training_attempt_institution_lock", "UPDATE"],
    ["training_attempt_institution_read", "SELECT"],
    ["training_attempt_institution_subscription_lock", "UPDATE"],
    ["training_attempt_institution_subscription_read", "SELECT"],
    ["training_attempt_marker_read", "SELECT"],
    ["training_attempt_membership_lock", "UPDATE"],
    ["training_attempt_membership_read", "SELECT"],
    ["training_attempt_profile_read", "SELECT"],
    ["training_attempt_subscription_lock", "UPDATE"],
    ["training_attempt_subscription_read", "SELECT"],
  ];
  const policySummary = result.policies.map(
    ([name, command, roles]) => [name, command, roles]
  );
  if (
    JSON.stringify(policySummary) !==
      JSON.stringify(
        expectedPolicies.map(([name, command]) => [
          name,
          command,
          ["reflab_rls_owner"],
        ])
      ) ||
    result.policies
      .filter(([, command]) => command === "UPDATE")
      .some(([, , , withCheck]) => withCheck !== "false") ||
    result.rpc_owner_safe !== true ||
    result.service_role_execute !== true ||
    result.forbidden_execute !== false ||
    Number(result.unexpected_training_guc_functions) !== 0 ||
    result.index_matches_non_exam_contract !== true ||
    result.owner_has_no_public_create !== true
  ) {
    throw new Error("Canonical training policy or RPC isolation is invalid.");
  }
}

function assertTrainingAttemptRollback(databaseName) {
  const result = JSON.parse(
    query(
      databaseName,
      String.raw`select pg_catalog.json_build_object(
  'column_absent', not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attempts'
      and column_name = 'canonical_payload_hash'
  ),
  'rpc_absent', pg_catalog.to_regprocedure(
    'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)'
  ) is null,
  'index_absent', pg_catalog.to_regclass(
    'public.attempts_canonical_training_submission_unique'
  ) is null,
  'policies_absent', not exists (
    select 1
    from pg_catalog.pg_policies
    where policyname like 'training_attempt_%'
  ),
  'rls_owner_safe', not pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  )
);`
    )
  );
  if (Object.values(result).some((value) => value !== true)) {
    throw new Error("Canonical training migration rollback left residual objects.");
  }
}

async function startConcurrentIdentityCall(
  databaseName,
  applicationName,
  functionCall
) {
  writeFileSync(
    concurrentIdentityPath,
    `begin;\nselect ${functionCall};\nselect pg_catalog.pg_sleep(1);\ncommit;\n`,
    "utf8"
  );
  const operation = runPsqlFileAsync(
    databaseName,
    concurrentIdentityPath,
    applicationName
  );
  await waitForActiveQuery(databaseName, applicationName, "pg_sleep");
  return { operation };
}

function assertExactIdentityLinks(databaseName, expectedLinks) {
  const result = JSON.parse(
    query(
      databaseName,
      String.raw`select coalesce(
  pg_catalog.json_agg(
    pg_catalog.json_build_array(external_subject, user_id)
    order by external_subject
  ),
  '[]'::pg_catalog.json
)
from reflab_private.user_identity_links;`
    )
  );
  const sortedExpected = [...expectedLinks].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (JSON.stringify(result) !== JSON.stringify(sortedExpected)) {
    throw new Error("Concurrent identity links do not match the expected set.");
  }
}

function deleteIdentityTestLinks(databaseName, subjects) {
  const literals = subjects
    .map((subject) => `'${subject.replaceAll("'", "''")}'`)
    .join(", ");
  query(
    databaseName,
    `delete from reflab_private.user_identity_links where external_subject in (${literals});`
  );
}

function assertRlsOwnerPolicyIsolation(databaseName) {
  const result = JSON.parse(
    query(
      databaseName,
      String.raw`select pg_catalog.json_build_object(
  'constraints', (
    select pg_catalog.array_agg(constraint_row.conname order by constraint_row.conname)
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'reflab_private.user_identity_links'::pg_catalog.regclass
      and constraint_row.conname in (
        'user_identity_links_pkey',
        'user_identity_links_provider_user_key'
      )
  ),
  'new_policies', (
    select pg_catalog.json_agg(
      pg_catalog.json_build_array(
        policy.policyname,
        policy.cmd,
        policy.roles
      )
      order by policy.policyname
    )
    from pg_catalog.pg_policies policy
    where policy.policyname in (
      'user_identity_links_super_admin_rls_owner_insert',
      'user_profiles_super_admin_identity_rls_owner_read',
      'user_subscriptions_super_admin_identity_rls_owner_read'
    )
  ),
  'unexpected_identity_mutators', (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where owner_role.rolname = 'reflab_rls_owner'
      and pg_catalog.lower(function_row.prosrc) like
        '%insert into reflab_private.user_identity_links%'
      and function_row.proname not in (
        'link_development_clerk_identity',
        'link_development_super_admin_clerk_identity'
      )
  ),
  'authenticated_helpers_expose_new_rows', (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where owner_role.rolname = 'reflab_rls_owner'
      and pg_catalog.has_function_privilege(
        'authenticated',
        function_row.oid,
        'EXECUTE'
      )
      and (
        pg_catalog.lower(function_row.prosrc) like '%public.user_profiles%'
        or pg_catalog.lower(function_row.prosrc) like '%public.user_subscriptions%'
        or pg_catalog.lower(function_row.prosrc) like
          '%insert into reflab_private.user_identity_links%'
      )
  ),
  'public_executes_owner_functions', (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = function_row.proowner
    where owner_role.rolname = 'reflab_rls_owner'
      and exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            function_row.proacl,
            pg_catalog.acldefault('f', function_row.proowner)
          )
        ) privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
  )
);`
    )
  );

  const expectedPolicies = [
    [
      "user_identity_links_super_admin_rls_owner_insert",
      "INSERT",
      ["reflab_rls_owner"],
    ],
    [
      "user_profiles_super_admin_identity_rls_owner_read",
      "SELECT",
      ["reflab_rls_owner"],
    ],
    [
      "user_subscriptions_super_admin_identity_rls_owner_read",
      "SELECT",
      ["reflab_rls_owner"],
    ],
  ];
  if (
    JSON.stringify(result.constraints) !==
      JSON.stringify([
        "user_identity_links_pkey",
        "user_identity_links_provider_user_key",
      ]) ||
    JSON.stringify(result.new_policies) !==
      JSON.stringify(expectedPolicies) ||
    Number(result.unexpected_identity_mutators) !== 0 ||
    Number(result.authenticated_helpers_expose_new_rows) !== 0 ||
    Number(result.public_executes_owner_functions) !== 0
  ) {
    throw new Error("RLS owner policy isolation is broader than expected.");
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
      and function_row.proname =
        'link_development_super_admin_clerk_identity'
      and owner_role.rolname = 'reflab_rls_owner'
      and function_row.prosecdef
      and function_row.proconfig = array['search_path=pg_catalog']
  ) then
    raise exception 'Super Admin identity linker RPC ownership is unsafe';
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

  if pg_catalog.has_function_privilege(
    'anon',
    'public.link_development_super_admin_clerk_identity(text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.link_development_super_admin_clerk_identity(text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.link_development_super_admin_clerk_identity(text)',
    'EXECUTE'
  ) then
    raise exception 'Super Admin identity linker RPC grants are incorrect';
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

  if (
    select pg_catalog.array_agg(policy.policyname order by policy.policyname)
    from pg_catalog.pg_policies policy
    where policy.policyname in (
      'user_identity_links_super_admin_rls_owner_insert',
      'user_profiles_super_admin_identity_rls_owner_read',
      'user_subscriptions_super_admin_identity_rls_owner_read'
    )
      and policy.roles = array['reflab_rls_owner']::name[]
  ) <> array[
    'user_identity_links_super_admin_rls_owner_insert',
    'user_profiles_super_admin_identity_rls_owner_read',
    'user_subscriptions_super_admin_identity_rls_owner_read'
  ]::name[] then
    raise exception 'Super Admin identity policy inventory is incomplete';
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

  link_status := public.link_development_super_admin_clerk_identity(
    'user_clerk_super_admin_local'
  );
  if link_status <> 'created' then
    raise exception 'Super Admin link did not return created';
  end if;

  link_status := public.link_development_super_admin_clerk_identity(
    'user_clerk_super_admin_local'
  );
  if link_status <> 'already_linked' then
    raise exception 'repeated Super Admin link was not idempotent';
  end if;

  if (
    select pg_catalog.count(*)
    from reflab_private.user_identity_links
  ) <> 2 or not exists (
    select 1
    from reflab_private.user_identity_links
    where provider = 'clerk'
      and external_subject = 'user_clerk_local_a'
      and user_id = 'user_dev_referee_a'
  ) or not exists (
    select 1
    from reflab_private.user_identity_links
    where provider = 'clerk'
      and external_subject = 'user_clerk_super_admin_local'
      and user_id = 'user_dev_super_admin'
  ) then
    raise exception 'independent Development identity links are incorrect';
  end if;

  link_status := public.link_development_super_admin_clerk_identity(
    'user_clerk_local_a'
  );
  if link_status <> 'conflict' then
    raise exception 'existing referee subject was not protected';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"user_clerk_super_admin_local"}',
    true
  );
  select reflab_private.request_user_id()
  into resolved_user_id;
  if resolved_user_id <> 'user_dev_super_admin' then
    raise exception 'linked Super Admin subject did not resolve canonically';
  end if;

  if (select pg_catalog.count(*) from public.user_profiles) <> 5
     or (select pg_catalog.count(*) from public.user_global_roles) <> 5
     or (select pg_catalog.count(*) from public.user_subscriptions) <> 5
     or (select pg_catalog.count(*) from public.institution_memberships) <> 4
     or (select pg_catalog.count(*) from public.user_roles) <> 0
     or exists (
       select 1 from public.user_global_roles
       where source = 'automatic_default'
     ) or exists (
       select 1 from public.user_subscriptions
       where source = 'automatic_default'
     ) then
    raise exception 'Super Admin linking provisioned lateral access records';
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
    functions: 27,
    policies: 150,
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
  const superAdminIdentityMigrationSql = readFileSync(
    superAdminIdentityMigrationPath,
    "utf8"
  );
  const trainingAttemptsMigrationSql = readFileSync(
    trainingAttemptsMigrationPath,
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
    ).length +
    (
      superAdminIdentityMigrationSql.match(
        /^\s*create\s+(?:unique\s+)?index\s+/gim
      ) ?? []
    ).length +
    (
      trainingAttemptsMigrationSql.match(
        /^\s*create\s+(?:unique\s+)?index\s+/gim
      ) ?? []
    ).length;
  if (explicitIndexCount !== 111) {
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

function assertSuperAdminIdentityRollback(databaseName) {
  const result = query(
    databaseName,
    String.raw`
select pg_catalog.json_build_object(
  'super_admin_rpc_absent',
  pg_catalog.to_regprocedure(
    'public.link_development_super_admin_clerk_identity(text)'
  ) is null,
  'super_admin_policies_absent',
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.policyname in (
      'user_identity_links_super_admin_rls_owner_insert',
      'user_profiles_super_admin_identity_rls_owner_read',
      'user_subscriptions_super_admin_identity_rls_owner_read'
    )
  ),
  'original_linker_present',
  pg_catalog.to_regprocedure(
    'public.link_development_clerk_identity(text)'
  ) is not null,
  'identity_table_present',
  pg_catalog.to_regclass(
    'reflab_private.user_identity_links'
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
  if (Object.values(parsed).some((value) => value !== true)) {
    throw new Error(
      "Development Super Admin identity migration rollback left objects."
    );
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

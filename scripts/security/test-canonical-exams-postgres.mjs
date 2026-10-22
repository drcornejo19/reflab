import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = {
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  psql: join(postgresBin, "psql.exe"),
};
const baseline = resolve(root, "supabase/migrations/202607270000_reflab_canonical_baseline.sql");
const seed = resolve(root, "supabase/seed/development_seed.sql");
const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-canonical-exams-"));
const dataDirectory = join(temporaryRoot, "data");
const logPath = join(temporaryRoot, "postgres.log");
const bootstrapPath = join(temporaryRoot, "bootstrap.sql");
const behaviorPath = join(temporaryRoot, "canonical-exam-behavior.sql");
const concurrencySetupPath = join(temporaryRoot, "canonical-exam-concurrency-setup.sql");
const concurrencyValidPath = join(temporaryRoot, "canonical-exam-concurrency-valid.sql");
const concurrencyInvalidPath = join(temporaryRoot, "canonical-exam-concurrency-invalid.sql");
const concurrencyVerifyPath = join(temporaryRoot, "canonical-exam-concurrency-verify.sql");
const port = await reservePort();
const environment = {
  ...process.env,
  PGHOST: "127.0.0.1",
  PGPORT: String(port),
  PGUSER: "postgres",
};
let serverStarted = false;

try {
  run(binaries.initdb, [
    "--auth=trust",
    "--username=postgres",
    "--encoding=UTF8",
    "--no-locale",
    "--pgdata",
    dataDirectory,
  ]);
  run(binaries.pgCtl, [
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
  writeFileSync(concurrencySetupPath, concurrencySetupSql(), "utf8");
  writeFileSync(concurrencyValidPath, concurrencyValidSql(), "utf8");
  writeFileSync(concurrencyInvalidPath, concurrencyInvalidSql(), "utf8");
  writeFileSync(concurrencyVerifyPath, concurrencyVerifySql(), "utf8");
  run(binaries.createdb, ["reflab_canonical_exams"]);
  apply(bootstrapPath);
  apply(baseline);
  apply(seed);
  apply(behaviorPath);
  await assertConcurrentSubmission();
  console.log("Canonical exam PostgreSQL transaction test passed in an isolated local cluster.");
} finally {
  if (serverStarted) {
    try {
      run(
        binaries.pgCtl,
        ["stop", "-D", dataDirectory, "-m", "immediate", "-w"],
        { quiet: true }
      );
    } catch {
      // Cleanup below still removes the isolated cluster if shutdown reports an error.
    }
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function apply(filePath) {
  run(binaries.psql, [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "--dbname",
    "reflab_canonical_exams",
    "--file",
    filePath,
  ]);
}

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {
    env: environment,
    encoding: "utf8",
    stdio: options.quiet ? "ignore" : ["ignore", "pipe", "pipe"],
  });
}

async function assertConcurrentSubmission() {
  apply(concurrencySetupPath);
  const validSubmission = runPsqlFileAsync(
    concurrencyValidPath,
    "reflab_exam_concurrent_valid"
  );
  await waitForActiveQuery("reflab_exam_concurrent_valid", "pg_sleep");

  let invalidRejected = false;
  try {
    apply(concurrencyInvalidPath);
  } catch (error) {
    invalidRejected = String(error.stderr ?? error).includes(
      "submission_id does not match the referee exam session"
    );
  }
  await validSubmission;
  if (!invalidRejected) {
    throw new Error("Concurrent mismatched exam submission was not rejected.");
  }
  apply(concurrencyVerifyPath);
}

function runPsqlFileAsync(filePath, applicationName) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      binaries.psql,
      [
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "--dbname",
        "reflab_canonical_exams",
        "--file",
        filePath,
      ],
      {
        env: { ...environment, PGAPPNAME: applicationName },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`Concurrent psql failed: ${stderr || stdout}`));
    });
  });
}

async function waitForActiveQuery(applicationName, fragment) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = query(String.raw`
select pg_catalog.count(*)
from pg_catalog.pg_stat_activity activity
where activity.application_name = '${applicationName}'
  and activity.state = 'active'
  and pg_catalog.strpos(activity.query, '${fragment}') > 0;
`);
    if (active === "1") return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Concurrent exam submission did not reach its lock barrier.");
}

function query(sql) {
  return run(binaries.psql, [
    "-X",
    "-A",
    "-t",
    "-q",
    "--dbname",
    "reflab_canonical_exams",
    "--command",
    sql,
  ]).trim();
}

function bootstrapSql() {
  return String.raw`
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create schema extensions;
create schema storage;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key);
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
returns text[] language sql immutable set search_path = pg_catalog
as $function$ select pg_catalog.string_to_array(name, '/'); $function$;
`;
}

function behaviorSql() {
  return String.raw`
begin;
set local role service_role;

do $canonical_exam_test$
declare
  seed_result public.exam_results%rowtype;
  replay jsonb;
  conflicting_attempts jsonb;
  conflicting_hash text;
  conflict_rejected boolean := false;
  failure_rejected boolean := false;
  failure_manifest jsonb;
  failure_attempts jsonb;
  failure_manifest_hash text;
  failure_payload_hash text;
begin
  select result.* into strict seed_result
  from public.exam_results result
  where result.exam_session_id = '60000000-0000-4000-8000-000000000001';

  replay := public.submit_referee_exam(
    seed_result.user_id,
    seed_result.exam_session_id,
    seed_result.submission_id,
    seed_result.payload_hash,
    seed_result.details
  );
  if replay->>'idempotent_replay' <> 'true' then
    raise exception 'identical exam retry was not idempotent';
  end if;
  if (select pg_catalog.count(*) from public.exam_results result
      where result.exam_session_id = seed_result.exam_session_id) <> 1
     or (select pg_catalog.count(*) from public.attempts attempt
         where attempt.exam_result_id = seed_result.id) <> 1
     or (select session.status from public.referee_exam_sessions session
         where session.id = seed_result.exam_session_id) <> 'submitted' then
    raise exception 'idempotent exam retry created duplicate rows';
  end if;

  conflicting_attempts := pg_catalog.jsonb_set(
    seed_result.details,
    '{0,score}',
    '0'::jsonb
  );
  conflicting_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        reflab_private.canonical_jsonb_text(conflicting_attempts),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  begin
    perform public.submit_referee_exam(
      seed_result.user_id,
      seed_result.exam_session_id,
      seed_result.submission_id,
      conflicting_hash,
      conflicting_attempts
    );
  exception when raise_exception then
    if sqlerrm = 'submission_id was already used with different content' then
      conflict_rejected := true;
    else
      raise;
    end if;
  end;
  if not conflict_rejected then
    raise exception 'conflicting exam retry was accepted';
  end if;

  conflict_rejected := false;
  begin
    perform public.submit_referee_exam(
      seed_result.user_id,
      seed_result.exam_session_id,
      '63000000-0000-4000-8000-000000000001',
      seed_result.payload_hash,
      seed_result.details
    );
  exception when raise_exception then
    if sqlerrm = 'submission_id does not match the referee exam session' then
      conflict_rejected := true;
    else
      raise;
    end if;
  end;
  if not conflict_rejected then
    raise exception 'submitted session accepted a new submission_id';
  end if;

  conflict_rejected := false;
  begin
    perform public.submit_referee_exam(
      'user_dev_referee_b',
      seed_result.exam_session_id,
      seed_result.submission_id,
      seed_result.payload_hash,
      seed_result.details
    );
  exception when raise_exception then
    if sqlerrm = 'referee exam session does not belong to the authenticated user' then
      conflict_rejected := true;
    else
      raise;
    end if;
  end;
  if not conflict_rejected then
    raise exception 'different canonical user submitted another user exam';
  end if;
  if (select pg_catalog.count(*) from public.exam_results result
      where result.exam_session_id = seed_result.exam_session_id) <> 1
     or exists (select 1 from public.attempts attempt
                where attempt.exam_result_id = seed_result.id
                  and attempt.user_id <> seed_result.user_id)
     or exists (select 1 from public.attempts attempt
                where attempt.submission_id = seed_result.submission_id
                  and attempt.exam_result_id is null) then
    raise exception 'official exam rows were duplicated, misowned, or mixed with training';
  end if;

  failure_manifest := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_item_type', 'rule_question',
    'source_item_id', 'late-failure-rule-question-1',
    'occurrence_id', '70000000-0000-4000-8000-000000000001',
    'position', 1,
    'source_version', 'local-test-v1'
  ));
  failure_manifest_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(reflab_private.canonical_jsonb_text(failure_manifest), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  insert into public.referee_exam_sessions (
    id, user_id, submission_id, context_type, sport_type, activity_type,
    season, source_version, item_manifest, manifest_hash, item_count, status, expires_at
  ) values (
    '71000000-0000-4000-8000-000000000001',
    'user_dev_referee_a',
    '72000000-0000-4000-8000-000000000001',
    'individual', 'football_11', 'referee_exam', 'local', 'local-test-v1',
    failure_manifest, failure_manifest_hash, 1, 'active', pg_catalog.now() + interval '1 hour'
  );
  failure_attempts := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'occurrence_id', '70000000-0000-4000-8000-000000000001',
    'source_item_type', 'rule_question',
    'source_item_id', 'late-failure-rule-question-1',
    'score', 100,
    'max_score', 100,
    'is_correct', true,
    'time_spent_seconds', 2147483648
  ));
  failure_payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(reflab_private.canonical_jsonb_text(failure_attempts), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  begin
    perform public.submit_referee_exam(
      'user_dev_referee_a',
      '71000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      failure_payload_hash,
      failure_attempts
    );
  exception when numeric_value_out_of_range then
    failure_rejected := true;
  end;
  if not failure_rejected then
    raise exception 'intentional late exam failure did not occur';
  end if;
  if exists (select 1 from public.exam_results result
             where result.exam_session_id = '71000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.attempts attempt
                where attempt.submission_id = '72000000-0000-4000-8000-000000000001')
     or (select session.status from public.referee_exam_sessions session
         where session.id = '71000000-0000-4000-8000-000000000001') <> 'active' then
    raise exception 'failed exam submit left partial rows or changed session state';
  end if;
  if exists (select 1 from public.user_roles)
     or exists (select 1 from public.user_global_roles where source = 'automatic_default')
     or exists (select 1 from public.user_subscriptions where source = 'automatic_default') then
    raise exception 'canonical exam test created legacy or automatic access rows';
  end if;
end
$canonical_exam_test$;

do $canonical_rules_exam_test$
declare
  legacy_rules_count bigint := (select pg_catalog.count(*) from public.rules_exam_results);
  football_manifest jsonb;
  football_attempts jsonb;
  football_result jsonb;
  futsal_manifest jsonb;
  futsal_attempts jsonb;
  futsal_result jsonb;
begin
  football_manifest := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_item_type', 'rule_question',
    'source_item_id', 'football-rule-local-1',
    'occurrence_id', '74000000-0000-4000-8000-000000000001',
    'position', 1,
    'source_version', 'football-rules-local-v1'
  ));
  insert into public.referee_exam_sessions (
    id, user_id, submission_id, context_type, sport_type, activity_type,
    season, source_version, item_manifest, manifest_hash, item_count, status, expires_at
  ) values (
    '74100000-0000-4000-8000-000000000001',
    'user_dev_referee_a',
    '74200000-0000-4000-8000-000000000001',
    'individual', 'football_11', 'referee_exam', 'local', 'football-rules-local-v1',
    football_manifest,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(reflab_private.canonical_jsonb_text(football_manifest), 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    1, 'active', pg_catalog.now() + interval '1 hour'
  );
  football_attempts := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'occurrence_id', '74000000-0000-4000-8000-000000000001',
    'source_item_type', 'rule_question',
    'source_item_id', 'football-rule-local-1',
    'topic', 'VAR',
    'rule_reference', 'VAR Protocol',
    'selected_decision', 'Correcta',
    'correct_decision', 'Correcta',
    'score', 1,
    'max_score', 1,
    'is_correct', true,
    'technical_correct', true,
    'var_correct', true
  ));
  football_result := public.submit_referee_exam(
    'user_dev_referee_a',
    '74100000-0000-4000-8000-000000000001',
    '74200000-0000-4000-8000-000000000001',
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(reflab_private.canonical_jsonb_text(football_attempts), 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    football_attempts
  );

  futsal_manifest := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_item_type', 'rule_question',
    'source_item_id', 'futsal-rule-local-1',
    'occurrence_id', '75000000-0000-4000-8000-000000000001',
    'position', 1,
    'source_version', 'futsal-rules-local-v1'
  ));
  insert into public.referee_exam_sessions (
    id, user_id, submission_id, context_type, sport_type, activity_type,
    season, source_version, item_manifest, manifest_hash, item_count, status, expires_at
  ) values (
    '75100000-0000-4000-8000-000000000001',
    'user_dev_referee_a',
    '75200000-0000-4000-8000-000000000001',
    'individual', 'futsal', 'referee_exam', 'local', 'futsal-rules-local-v1',
    futsal_manifest,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(reflab_private.canonical_jsonb_text(futsal_manifest), 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    1, 'active', pg_catalog.now() + interval '1 hour'
  );
  futsal_attempts := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'occurrence_id', '75000000-0000-4000-8000-000000000001',
    'source_item_type', 'rule_question',
    'source_item_id', 'futsal-rule-local-1',
    'topic', 'Faltas tacticas',
    'rule_reference', 'Law 13',
    'selected_decision', 'Incorrecta',
    'correct_decision', 'Correcta',
    'score', 0,
    'max_score', 1,
    'is_correct', false,
    'technical_correct', false,
    'accumulated_foul_correct', false
  ));
  futsal_result := public.submit_referee_exam(
    'user_dev_referee_a',
    '75100000-0000-4000-8000-000000000001',
    '75200000-0000-4000-8000-000000000001',
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(reflab_private.canonical_jsonb_text(futsal_attempts), 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    futsal_attempts
  );

  if football_result->>'avg_score' <> '100.00'
     or futsal_result->>'avg_score' <> '0.00'
     or (select pg_catalog.count(*) from public.exam_results result
         where result.exam_session_id in (
           '74100000-0000-4000-8000-000000000001',
           '75100000-0000-4000-8000-000000000001'
         )) <> 2
     or (select pg_catalog.count(*) from public.attempts attempt
         where attempt.exam_result_id in (
           (football_result->>'exam_result_id')::uuid,
           (futsal_result->>'exam_result_id')::uuid
         )
           and attempt.source_item_type = 'rule_question') <> 2
     or exists (
       select 1
       from public.attempts attempt
       where attempt.exam_result_id in (
         (football_result->>'exam_result_id')::uuid,
         (futsal_result->>'exam_result_id')::uuid
       ) and (
         attempt.user_id <> 'user_dev_referee_a'
         or attempt.exam_result_id is null
       )
     )
     or (select pg_catalog.count(*) from public.rules_exam_results) <> legacy_rules_count then
    raise exception 'canonical rules exam persistence invariants failed';
  end if;
end
$canonical_rules_exam_test$;

reset role;
rollback;
`;
}

function concurrencySetupSql() {
  return String.raw`
do $setup$
declare
  manifest jsonb := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_item_type', 'rule_question',
    'source_item_id', 'concurrent-rule-question-1',
    'occurrence_id', '80000000-0000-4000-8000-000000000001',
    'position', 1,
    'source_version', 'local-concurrency-v1'
  ));
begin
  insert into public.referee_exam_sessions (
    id, user_id, submission_id, context_type, sport_type, activity_type,
    season, source_version, item_manifest, manifest_hash, item_count, status, expires_at
  ) values (
    '81000000-0000-4000-8000-000000000001',
    'user_dev_referee_a',
    '82000000-0000-4000-8000-000000000001',
    'individual', 'football_11', 'referee_exam', 'local', 'local-concurrency-v1',
    manifest,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(reflab_private.canonical_jsonb_text(manifest), 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    1, 'active', pg_catalog.now() + interval '1 hour'
  );
end
$setup$;
`;
}

function concurrentPayload() {
  return String.raw`pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'occurrence_id', '80000000-0000-4000-8000-000000000001',
    'source_item_type', 'rule_question',
    'source_item_id', 'concurrent-rule-question-1',
    'score', 100,
    'max_score', 100,
    'is_correct', true
  ))`;
}

function concurrentHash(payload) {
  return String.raw`pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(reflab_private.canonical_jsonb_text(${payload}), 'UTF8'),
      'sha256'
    ),
    'hex'
  )`;
}

function concurrencyValidSql() {
  const payload = concurrentPayload();
  return String.raw`
begin;
set local role service_role;
select public.submit_referee_exam(
  'user_dev_referee_a',
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  ${concurrentHash(payload)},
  ${payload}
);
select pg_catalog.pg_sleep(2);
commit;
`;
}

function concurrencyInvalidSql() {
  const payload = concurrentPayload();
  return String.raw`
begin;
set local role service_role;
select public.submit_referee_exam(
  'user_dev_referee_a',
  '81000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  ${concurrentHash(payload)},
  ${payload}
);
commit;
`;
}

function concurrencyVerifySql() {
  return String.raw`
do $verify$
declare
  result_id uuid;
begin
  select result.id into strict result_id
  from public.exam_results result
  where result.exam_session_id = '81000000-0000-4000-8000-000000000001';

  if (select pg_catalog.count(*) from public.exam_results result
      where result.exam_session_id = '81000000-0000-4000-8000-000000000001') <> 1
     or (select pg_catalog.count(*) from public.attempts attempt
         where attempt.exam_result_id = result_id) <> 1
     or (select pg_catalog.count(*) from public.attempts attempt
         where attempt.submission_id = '82000000-0000-4000-8000-000000000001') <> 1
     or exists (select 1 from public.attempts attempt
                where attempt.submission_id in (
                  '82000000-0000-4000-8000-000000000001',
                  '83000000-0000-4000-8000-000000000001'
                ) and attempt.exam_result_id is null)
     or exists (select 1 from public.exam_results result
                where result.submission_id = '83000000-0000-4000-8000-000000000001')
     or (select session.status from public.referee_exam_sessions session
         where session.id = '81000000-0000-4000-8000-000000000001') <> 'submitted'
     or exists (select 1 from public.referee_exam_sessions session
                where session.user_id = 'user_clerk_never_persisted')
     or exists (select 1 from public.exam_results result
                where result.user_id = 'user_clerk_never_persisted')
     or exists (select 1 from public.attempts attempt
                where attempt.user_id = 'user_clerk_never_persisted') then
    raise exception 'concurrent canonical exam invariants failed';
  end if;
end
$verify$;
`;
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
        reject(new Error("Could not reserve a PostgreSQL port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { SEMANTIC_AUDIT_SOURCE_HASH, semanticAuditFunctionSource } from "../phase2a/semantic-audit-contract.mjs";
import {
  PRE_CUTOVER_AGGREGATE_ITEMS, PRE_CUTOVER_BOUNDARY_OWNER, PRE_CUTOVER_DOMAIN_COUNTS,
  PRE_CUTOVER_EVIDENCE_ITEMS, PRE_CUTOVER_POLICY_NAME, assertPreCutoverEvidenceContract,
  requiredColumnGrants,
} from "./pre-cutover-evidence-contract.mjs";
import {
  PRE_CUTOVER_BOUNDARY_SOURCE, PRE_CUTOVER_BOUNDARY_SOURCE_HASH, buildPreCutoverAggregateBatch,
  PRE_CUTOVER_TEARDOWN, assertBalancedGeneratedSql, buildPreCutoverCatalogBatch, buildPreCutoverMigration,
  buildPreCutoverTeardown, generatedAggregateSqlFor, validateReadOnlyEvidenceSql,
} from "./generate-pre-cutover-evidence-sql.mjs";
import {
  PRE_CUTOVER_MAX_BUFFER_BYTES, PRE_CUTOVER_PRODUCTION_OPT_IN,
  authorizeProductionEvidenceTarget, buildPreCutoverColumnFixtureSql, buildPreCutoverRlsFixtureSql,
  executeProductionEvidenceBatch, parseOperationalEvidenceOutput, preCutoverNegativeMutationAssertionSql,
  runProductionEvidence,
} from "./run-pre-cutover-evidence.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PREFLIGHT_DATABASE_URL, PREFLIGHT_OPT_IN, PREFLIGHT_PROJECT_REF } from "../../production-preflight/target.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

test("pre-cutover contract has exactly 442 unique evidence items", () => {
  assert.equal(assertPreCutoverEvidenceContract(), true);
  assert.equal(PRE_CUTOVER_EVIDENCE_ITEMS.length, 442);
  assert.equal(new Set(PRE_CUTOVER_EVIDENCE_ITEMS.map((entry) => entry.id)).size, 442);
  assert.deepEqual(Object.fromEntries(Object.keys(PRE_CUTOVER_DOMAIN_COUNTS).map((domain) => [
    domain, PRE_CUTOVER_EVIDENCE_ITEMS.filter((entry) => entry.domain === domain).length,
  ])), PRE_CUTOVER_DOMAIN_COUNTS);
});

test("aggregate mapping is complete, unique, and contains no orphan metric", () => {
  assert.equal(PRE_CUTOVER_AGGREGATE_ITEMS.length, 405);
  assert.equal(new Set(PRE_CUTOVER_AGGREGATE_ITEMS.map((entry) => entry.id)).size, 405);
  assert.ok(PRE_CUTOVER_AGGREGATE_ITEMS.every((entry) => PRE_CUTOVER_EVIDENCE_ITEMS.includes(entry)));
});

test("both evidence batches are deterministic and read-only", () => {
  const catalog = buildPreCutoverCatalogBatch();
  const aggregate = buildPreCutoverAggregateBatch();
  assert.equal(catalog, buildPreCutoverCatalogBatch());
  assert.equal(aggregate, buildPreCutoverAggregateBatch());
  assert.equal(validateReadOnlyEvidenceSql(catalog), true);
  assert.equal(validateReadOnlyEvidenceSql(aggregate), true);
  assert.doesNotMatch(catalog, /has_function_privilege\('PUBLIC'/i);
  assert.match(catalog, /acl\.grantee=0/);
  for (const sql of [catalog, aggregate]) {
    assert.match(sql, /begin read only;/i);
    assert.match(sql, /show transaction_read_only;/i);
    assert.match(sql, /rollback;/i);
  }
});

test("read-only validator rejects writes and unsupported session escalation", () => {
  for (const sql of ["insert into x values (1);", "create temp table x(i int);", "set role postgres;", "grant select on x to public;"]) {
    assert.throws(() => validateReadOnlyEvidenceSql(sql), /Writable|unsupported/);
  }
});

test("temporary boundary is a fixed SQL SECURITY DEFINER with strict ACL and owner", () => {
  const migration = buildPreCutoverMigration();
  assert.match(migration, /create function reflab_audit\.pre_cutover_evidence_snapshot_v1\(\) returns jsonb/i);
  assert.match(migration, /language sql stable security definer set search_path=pg_catalog/i);
  assert.match(migration, new RegExp(`owner to "${PRE_CUTOVER_BOUNDARY_OWNER}"`, "i"));
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role, reflab_rls_owner, reflab_preflight_audit_owner/i);
  assert.match(migration, /grant execute on function[\s\S]*to reflab_prod_preflight_ro/i);
  assert.match(migration, /aclexplode[\s\S]*acl\.grantee not in \(p\.proowner,pg_catalog\.to_regrole\('reflab_prod_preflight_ro'\)\)/i);
  assert.doesNotMatch(PRE_CUTOVER_BOUNDARY_SOURCE, /\bexecute\b|\bformat\s*\(/i);
  assert.doesNotMatch(PRE_CUTOVER_BOUNDARY_SOURCE, /\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i);
});

test("owner capabilities, policies, and column grants are minimum and teardown-addressable", () => {
  const migration = buildPreCutoverMigration();
  assert.match(migration, /nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls/i);
  assert.ok(requiredColumnGrants().length > 0);
  assert.ok(requiredColumnGrants().every((entry) => entry.columns.length > 0));
  assert.equal((migration.match(new RegExp(`create policy "${PRE_CUTOVER_POLICY_NAME}"`, "gi")) ?? []).length, requiredColumnGrants().length);
  assert.doesNotMatch(migration, /grant\s+select\s+on\s+table/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|truncate)/i);
  assert.match(buildPreCutoverMigration(), /grant select \([^)]*\) on/i);
  assert.ok(!requiredColumnGrants().find((entry) => entry.table === "public.notification_events").columns.includes("id"));
});

test("boundary attestation uses exact global EXECUTE and effective column allowlists", () => {
  const migration = buildPreCutoverMigration();
  assert.doesNotMatch(migration, /pg_catalog\.coalesce/i);
  assert.doesNotMatch(migration, /aclexplode\(coalesce\((?:a\.attacl|n\.nspacl)/i);
  assert.match(migration, /aclexplode[\s\S]*grantee not in \(p\.proowner,pg_catalog\.to_regrole\('reflab_prod_preflight_ro'\)\)/i);
  assert.match(migration, /acl\.grantee=pg_catalog\.to_regrole\('reflab_prod_preflight_ro'\)[\s\S]*not acl\.is_grantable/i);
  assert.match(migration, /has_column_privilege\('reflab_pre_cutover_evidence_owner',c\.oid,a\.attnum,'SELECT'\)/i);
  assert.match(migration, /select \* from actual except select \* from expected/i);
  assert.match(migration, /select \* from expected except select \* from actual/i);
  assert.match(migration, /has_table_privilege\('reflab_pre_cutover_evidence_owner',c\.oid,'SELECT'\)/i);
  assert.match(migration, /pg_catalog\.pg_auth_members/i);
  assert.match(migration, /pg_catalog\.to_regrole\('reflab_prod_preflight_ro'\)/i);
  assert.match(migration, /p\.polroles=array\[pg_catalog\.to_regrole\('reflab_pre_cutover_evidence_owner'\)::oid\]/i);
  assert.match(migration, /owner has unexpected ownership/i);
});

test("local structural fixture restores RLS for every aggregate dependency", () => {
  const fixture = buildPreCutoverRlsFixtureSql();
  assert.equal((fixture.match(/enable row level security;/g) ?? []).length, requiredColumnGrants().length);
  for (const entry of requiredColumnGrants()) assert.match(fixture, new RegExp(`alter table "${entry.schema}"\\."${entry.relation}" enable row level security;`));
});

test("local boundary fixture derives every required column from the canonical baseline", () => {
  const fixture = buildPreCutoverColumnFixtureSql();
  const expected = requiredColumnGrants().reduce((sum, entry) => sum + entry.columns.length, 0);
  assert.equal((fixture.match(/add column if not exists/g) ?? []).length, expected);
  assert.match(fixture, /access_plans" add column if not exists audience /);
  assert.doesNotMatch(fixture, /add column if not exists[^;]+\bnot null\b/i);
  assert.doesNotMatch(fixture, /add column if not exists[^;]+\bdefault\b/i);
});

test("output schema cannot expose prohibited row fields", () => {
  const prohibitedOutputKeys = ["user_id", "email", "name", "subject", "payload", "answer", "token", "path", "notification_content", "row_id"];
  for (const key of prohibitedOutputKeys) assert.doesNotMatch(PRE_CUTOVER_BOUNDARY_SOURCE, new RegExp(`'${key}'\\s*,`, "i"));
  assert.match(PRE_CUTOVER_BOUNDARY_SOURCE, /'status_counts'/);
  assert.match(PRE_CUTOVER_BOUNDARY_SOURCE, /'status',status,'count',status_count/);
});

test("catalog output contains structural metadata without function bodies", () => {
  const sql = buildPreCutoverCatalogBatch();
  for (const required of [
    "'referenced_columns'", "'source_columns'", "'target_columns'", "'access_method'",
    "'opclass'", "'collation'", "'function_source_hash'", "'callers'",
    "'caller_schema'", "'caller_object'", "'caller_type'", "'called_signature'",
  ]) assert.match(sql, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /'function_body'|'prosrc'\s*,/i);
});

test("catalog results fail closed instead of passing on table existence alone", () => {
  const sql = buildPreCutoverCatalogBatch();
  assert.match(sql, /then 'SKIPPED'.*then 'PASS' else 'BLOCKER'/s);
  assert.match(sql, /then 'BLOCKER' else 'PASS'/);
  assert.doesNotMatch(sql, /then 'SKIPPED' else 'PASS' end,\s*\n\s*'observed'/);
});

test("local rehearsal cannot label synthetic aggregates as Production evidence", () => {
  assert.match(PRE_CUTOVER_BOUNDARY_SOURCE, /'evidence_provenance', 'TEMPORARY_SECURITY_BOUNDARY'/);
  assert.doesNotMatch(PRE_CUTOVER_BOUNDARY_SOURCE, /'evidence_provenance', 'PRIVILEGED_PRODUCTION'/);
});

test("boundary hash is pinned and deterministic", () => {
  for (const item of PRE_CUTOVER_AGGREGATE_ITEMS) {
    assert.doesNotThrow(() => assertBalancedGeneratedSql(generatedAggregateSqlFor(item)), item.id);
  }
  assert.equal(assertBalancedGeneratedSql(PRE_CUTOVER_BOUNDARY_SOURCE), true);
  assert.equal(PRE_CUTOVER_BOUNDARY_SOURCE_HASH, createHash("sha256").update(PRE_CUTOVER_BOUNDARY_SOURCE.trim()).digest("hex"));
  assert.match(buildPreCutoverMigration(), new RegExp(PRE_CUTOVER_BOUNDARY_SOURCE_HASH));
  assert.match(buildPreCutoverMigration(), /replace\(p\.prosrc,pg_catalog\.chr\(13\)\|\|pg_catalog\.chr\(10\),pg_catalog\.chr\(10\)\)/);
  assert.doesNotMatch(PRE_CUTOVER_BOUNDARY_SOURCE, /pg_catalog\.coalesce/i);
});

test("Phase 2A sidecar source contract remains unchanged", () => {
  assert.equal(createHash("sha256").update(semanticAuditFunctionSource().trim()).digest("hex"), SEMANTIC_AUDIT_SOURCE_HASH);
  assert.doesNotMatch(buildPreCutoverMigration(), /create\s+or\s+replace\s+function\s+reflab_audit\.production_semantic_snapshot/i);
  assert.doesNotMatch(buildPreCutoverMigration(), /alter\s+function\s+reflab_audit\.production_semantic_snapshot/i);
});

test("temporary evidence infrastructure blocks final marker and has complete teardown inventory", () => {
  const migration = buildPreCutoverMigration();
  assert.match(migration, /ADOPTION_TEMPORARY/);
  assert.match(migration, /reflab_schema_state\) <> 0/);
  assert.match(migration, /canonical_objects' and phase_order=4/);
  assert.equal(requiredColumnGrants().length, new Set(requiredColumnGrants().map((entry) => entry.table)).size);
  const teardown = buildPreCutoverTeardown();
  assert.match(teardown, /revoke execute on function reflab_audit\.pre_cutover_evidence_snapshot_v1\(\)/i);
  assert.match(teardown, /drop function reflab_audit\.pre_cutover_evidence_snapshot_v1\(\)/i);
  assert.equal((teardown.match(new RegExp(`drop policy "${PRE_CUTOVER_POLICY_NAME}"`, "gi")) ?? []).length, requiredColumnGrants().length);
  assert.equal((teardown.match(/revoke select \([^)]*\) on/gi) ?? []).length, requiredColumnGrants().length);
  assert.match(teardown, /revoke usage on schema public, reflab_audit/i);
  assert.match(teardown, /drop role "reflab_pre_cutover_evidence_owner"/i);
  assert.doesNotMatch(teardown, /\bcascade\b/i);
  assert.doesNotMatch(teardown, /(create|alter|drop)\s+function\s+reflab_audit\.production_semantic_snapshot/i);
  assert.doesNotMatch(teardown, /(insert|update|delete)\s+(into\s+|from\s+)?reflab_meta\.(reflab_schema_state|production_adoption_state)/i);
});

test("generated files match the deterministic generators", () => {
  assert.equal(readFileSync(resolve(root, "scripts/production-adoption/phase4/pre-cutover-catalog-evidence.sql"), "utf8"), buildPreCutoverCatalogBatch());
  assert.equal(readFileSync(resolve(root, "scripts/production-adoption/phase4/pre-cutover-aggregate-evidence.sql"), "utf8"), buildPreCutoverAggregateBatch());
  assert.equal(readFileSync(resolve(root, "supabase/migrations/20260901064301_production_adoption_pre_cutover_evidence_boundary.sql"), "utf8"), buildPreCutoverMigration());
  assert.equal(readFileSync(resolve(root, PRE_CUTOVER_TEARDOWN), "utf8"), buildPreCutoverTeardown());
});

test("Production evidence execution is double-opt-in, target-pinned, and environment-sanitized", () => {
  const environment = {
    [PRE_CUTOVER_PRODUCTION_OPT_IN]: "true",
    [PREFLIGHT_OPT_IN]: "true",
    [PREFLIGHT_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PREFLIGHT_DATABASE_URL]: `postgresql://reflab_prod_preflight_ro:fixture-password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PGPASSWORD: "external-password",
    PGOPTIONS: "-c role=postgres",
    PGSERVICE: "unsafe-service",
    PGSERVICEFILE: "unsafe-service-file",
    PGPASSFILE: "unsafe-pass-file",
  };
  const calls = [];
  const spawn = (_command, args, options) => {
    calls.push({ args, options });
    const payload = options.input.includes("catalog evidence")
      ? { format: "REFLAB_PRE_CUTOVER_PRODUCTION_EVIDENCE_V1", items: Array.from({ length: 442 }, () => ({})) }
      : { format: "REFLAB_PRE_CUTOVER_PRODUCTION_EVIDENCE_V1", metrics: Array.from({ length: 405 }, () => ({})) };
    return { status: 0, stdout: `on\n${JSON.stringify(payload)}\n`, stderr: "" };
  };
  const result = runProductionEvidence(environment, { spawn });
  assert.equal(result.productionEvidence, true);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.args.includes("--quiet"));
    assert.equal(call.options.maxBuffer, PRE_CUTOVER_MAX_BUFFER_BYTES);
    assert.equal(call.options.env.PGUSER, "reflab_prod_preflight_ro");
    assert.equal(call.options.env.PGPASSWORD, "fixture-password");
    for (const forbidden of ["PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE"]) assert.equal(call.options.env[forbidden], undefined);
  }
  assert.throws(() => authorizeProductionEvidenceTarget({ ...environment, [PRE_CUTOVER_PRODUCTION_OPT_IN]: "false" }), /independent explicit opt-in/);
  let invoked = false;
  assert.throws(() => runProductionEvidence({ ...environment, [PREFLIGHT_DATABASE_URL]: "postgresql://reflab_prod_preflight_ro:x@localhost/postgres?sslmode=require" }, {
    spawn: () => { invoked = true; return { status: 0, stdout: "", stderr: "" }; },
  }), /exact allowlisted host/);
  assert.equal(invoked, false);
});

test("operational read-only output must be exactly on before strict JSON", () => {
  assert.deepEqual(parseOperationalEvidenceOutput('on\n{"result":"PASS"}\n'), { result: "PASS" });
  assert.throws(() => parseOperationalEvidenceOutput('off\n{"result":"PASS"}\n'), /not confirmed as on/);
  assert.throws(() => parseOperationalEvidenceOutput('{"result":"PASS"}\n'), /not confirmed as on/);
  assert.throws(() => parseOperationalEvidenceOutput('on\nnot-json\n'), /invalid JSON/);
  assert.throws(() => parseOperationalEvidenceOutput('on\n{"result":"PASS"}\nunexpected\n'), /malformed/);
  const guarded = buildPreCutoverAggregateBatch();
  assert.match(guarded, /case when pg_catalog\.current_setting\('transaction_read_only'\)='on'[\s\S]*then reflab_audit\.pre_cutover_evidence_snapshot_v1\(\)/i);
  assert.throws(() => executeProductionEvidenceBatch(guarded, {}, {
    spawn: () => ({ status: 0, stdout: 'off\n{"result":"PASS"}\n', stderr: "" }), processEnvironment: {},
  }), /not confirmed as on/);
});

test("negative mutation assertions use PostgreSQL special syntax safely", () => {
  const assertion = preCutoverNegativeMutationAssertionSql("public_table_select");
  assert.match(assertion, /aclexplode\(coalesce\(c\.relacl/i);
  assert.doesNotMatch(assertion, /pg_catalog\.coalesce/i);
});

test("invalid evidence IDs and duplicate IDs fail closed", () => {
  const missing = PRE_CUTOVER_EVIDENCE_ITEMS.slice(1);
  assert.throws(() => assertPreCutoverEvidenceContract(missing), /cardinality/);
  const duplicate = [...PRE_CUTOVER_EVIDENCE_ITEMS.slice(0, -1), PRE_CUTOVER_EVIDENCE_ITEMS[0]];
  assert.throws(() => assertPreCutoverEvidenceContract(duplicate), /cardinality/);
});

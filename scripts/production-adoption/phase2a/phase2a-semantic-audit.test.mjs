import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalObjectManifest, identityColumns, migrationManifest } from "../../production-preflight/manifest.mjs";
import {
  generateSemanticAuditMigration,
  SEMANTIC_AUDIT_CALLER,
  SEMANTIC_AUDIT_FUNCTION,
  SEMANTIC_AUDIT_OWNER,
  SEMANTIC_AUDIT_POLICY,
  semanticAuditExpectedFields,
  semanticAuditFunctionSource,
  semanticAuditTableColumns,
  semanticAuditTables,
} from "./semantic-audit-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migration = readFileSync(
  resolve(root, "supabase", "migrations", "202608310004_production_adoption_semantic_audit.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const docs = readFileSync(resolve(root, "docs", "production-adoption", "phase2a-semantic-audit.md"), "utf8");
const runner = readFileSync(resolve(directory, "run-phase2a-semantic-audit-postgres.mjs"), "utf8");

test("generated migration is deterministic and checked in exactly", () => {
  assert.equal(migration, generateSemanticAuditMigration());
  assert.match(migration, /^begin;/im);
  assert.match(migration, /^commit;/im);
  assert.match(migration, /set local lock_timeout = '5s'/i);
  assert.match(migration, /set local statement_timeout = '60s'/i);
});

test("Phase 2A has a separate least-privilege NOLOGIN owner", () => {
  assert.notEqual(SEMANTIC_AUDIT_OWNER, "reflab_rls_owner");
  assert.match(migration, new RegExp(`create role ${SEMANTIC_AUDIT_OWNER}\\s+[\\s\\S]*nologin[\\s\\S]*nosuperuser[\\s\\S]*nocreatedb[\\s\\S]*nocreaterole[\\s\\S]*noinherit[\\s\\S]*nobypassrls`, "i"));
  assert.match(migration, new RegExp(`pg_has_role\\('${SEMANTIC_AUDIT_CALLER}', '${SEMANTIC_AUDIT_OWNER}', 'MEMBER'\\)`, "i"));
  assert.doesNotMatch(migration, new RegExp(`grant ${SEMANTIC_AUDIT_OWNER} to ${SEMANTIC_AUDIT_CALLER}`, "i"));
});

test("audit function is fixed, aggregate-only and has no caller-controlled input", () => {
  const source = semanticAuditFunctionSource();
  assert.match(migration, new RegExp(`create function ${SEMANTIC_AUDIT_FUNCTION.replace(/[()]/g, "\\$&")}`, "i"));
  assert.match(migration, /language sql\s+stable\s+security definer\s+set search_path = pg_catalog/i);
  assert.doesNotMatch(source, /\bexecute\b|format\s*\(|\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i);
  assert.doesNotMatch(source, /returning\s+(user_id|token|payload|raw_source_reference)/i);
  assert.deepEqual(Object.keys(semanticAuditExpectedFields).sort(), [
    "attempt_semantics",
    "exam_integrity",
    "fixture_creator_identity",
    "identity_reference_integrity",
    "institution_catalog",
    "institution_tenant_integrity",
    "legacy_access",
    "matches_tenant_integrity",
    "notification_integrity",
    "scoring_versions",
  ]);
});

test("every identity reference contributes only aggregate counts", () => {
  const source = semanticAuditFunctionSource();
  const expectedReferenceCount = Object.values(identityColumns).reduce((sum, columns) => sum + columns.length, 0);
  assert.equal(expectedReferenceCount, 63);
  assert.equal((source.match(/as total_non_null/g) ?? []).length, expectedReferenceCount);
  assert.equal((source.match(/as unresolved_profile_refs/g) ?? []).length, expectedReferenceCount);
  for (const [table, columns] of Object.entries(identityColumns)) {
    assert.ok(Object.hasOwn(semanticAuditTableColumns, table));
    for (const column of columns) assert.ok(semanticAuditTableColumns[table].includes(column));
  }
});

test("audit owner receives only reviewed column SELECT grants and RLS policies", () => {
  assert.equal((migration.match(/^grant select \(/gim) ?? []).length, semanticAuditTables.length);
  assert.equal((migration.match(new RegExp(`^create policy ${SEMANTIC_AUDIT_POLICY}$`, "gim")) ?? []).length, semanticAuditTables.length);
  assert.doesNotMatch(migration, new RegExp(`grant (insert|update|delete|truncate|references|trigger|all)[^;]*${SEMANTIC_AUDIT_OWNER}`, "i"));
  assert.match(migration, /inherited an unsafe product-table privilege/i);
});

test("only the Production preflight role can invoke the aggregate boundary", () => {
  assert.match(migration, new RegExp(`grant execute on function ${SEMANTIC_AUDIT_FUNCTION.replace(/[()]/g, "\\$&")} to ${SEMANTIC_AUDIT_CALLER}`, "i"));
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role, reflab_rls_owner/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (public|anon|authenticated|service_role|reflab_rls_owner)/i);
});

test("migration requires Phase 1 but advances neither ledger nor canonical marker", () => {
  assert.match(migration, /phase_order = 3 and phase_key = 'psychology_notification_prerequisites'/i);
  assert.doesNotMatch(migration, /insert into reflab_meta\.(production_adoption_state|reflab_schema_state)/i);
  assert.match(migration, /count\(\*\) from reflab_meta\.reflab_schema_state\) <> 0/i);
  assert.match(migration, /must not advance canonical or adoption markers/i);
});

test("migration fails before role creation when dependencies are incomplete", () => {
  assert.ok(migration.indexOf("Semantic audit dependency table is missing") < migration.indexOf(`create role ${SEMANTIC_AUDIT_OWNER}`));
  assert.ok(migration.indexOf("Semantic audit dependency column is missing") < migration.indexOf(`create role ${SEMANTIC_AUDIT_OWNER}`));
  assert.equal(semanticAuditTables.length, 58);
});

test("Phase 2A migration is classified for manual Production adoption", () => {
  const entry = migrationManifest.find((candidate) => candidate.version === "202608310004");
  assert.equal(entry?.classification, "production_adoption_audit");
  assert.equal(entry?.productionAction, "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE");
});

test("local PostgreSQL runner is isolated and proves non-exposure", () => {
  assert.match(runner, /PGHOST: "127\.0\.0\.1"/);
  assert.match(runner, /PGSSLMODE: "disable"/);
  assert.match(runner, /directRowsVisibleToCaller: 0/);
  assert.match(runner, /noSensitiveValuesReturned: true/);
  assert.match(runner, /sourceHashExact: true/);
  assert.match(runner, /missingDependencyRollback: true/);
  assert.match(runner, /sqlAs\(SEMANTIC_AUDIT_CALLER/);
  assert.doesNotMatch(runner, /set role \$\{SEMANTIC_AUDIT_CALLER\}/);
  assert.doesNotMatch(runner, /supabase[.]co|PGPASSWORD|dotenv|--env-file|readFileSync\([^)]*[.]env/i);
});

test("documentation captures the threat model and unresolved risks", () => {
  for (const phrase of [
    "SECURITY DEFINER is not sufficient by itself",
    "count side channel",
    "no arguments",
    "RLS policy",
    "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN",
    "does not reuse `reflab_rls_owner`",
    "must not be applied automatically",
  ]) assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("semantic audit is temporary and teardown precedes canonical finalization", () => {
  const dependencyGraph = readFileSync(
    resolve(root, "docs", "production-adoption", "phase1-dependency-graph.md"),
    "utf8",
  );
  for (const phrase of [
    "temporary Production-adoption infrastructure",
    "BLOCKER_TEMPORARY_SEMANTIC_AUDIT_PRESENT",
    "semantic_audit_teardown_future",
    "Only then insert the canonical installation marker",
    "No destructive migration is created in Phase 2A",
  ]) assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(dependencyGraph, /semantic_audit_teardown_future[\s\S]*only then insert the canonical marker/i);
  assert.ok(!canonicalObjectManifest.tables.some((table) => table.startsWith("reflab_audit.")));
  assert.ok(!canonicalObjectManifest.functions.some((entry) => entry.signature === SEMANTIC_AUDIT_FUNCTION));
  assert.ok(!canonicalObjectManifest.policies.some((entry) => entry.name === SEMANTIC_AUDIT_POLICY));
});

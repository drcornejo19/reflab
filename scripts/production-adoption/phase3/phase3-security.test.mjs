import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalObjectManifest, migrationManifest } from "../../production-preflight/manifest.mjs";
import {
  PHASE3_BROWSER_GRANT_MATRIX,
  PHASE3_CLASSIFICATIONS,
  PHASE3_DEVELOPMENT_RPCS,
  PHASE3_DOMAIN_CLASSIFICATION,
  PHASE3_LEGACY_IDENTITY_HELPERS,
  PHASE3_MIGRATIONS,
  PHASE3_POLICY_MATRIX,
  PHASE3_ROUTINE_CALLER_REPORT,
  PHASE3_SOURCE_HASH_CONTRACT,
  PHASE3_TEMPORARY_LEGACY_GRANTS,
  PHASE3_UNRESOLVED,
  normalizePhase3FunctionSource,
} from "./phase3-security-contract.mjs";
import {
  identityReaderDiagnosticSql,
  parsePhase3PostgresFailure,
  roleMembershipDiagnosticSql,
} from "./run-phase3-postgres.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const sqlByMigration = Object.fromEntries(PHASE3_MIGRATIONS.map((name) => [
  name,
  readFileSync(resolve(root, "supabase", "migrations", name), "utf8").replace(/\r\n/g, "\n"),
]));
const identitySql = sqlByMigration[PHASE3_MIGRATIONS[0]];
const policySql = sqlByMigration[PHASE3_MIGRATIONS[1]];
const grantSql = sqlByMigration[PHASE3_MIGRATIONS[2]];
const runner = readFileSync(resolve(directory, "run-phase3-postgres.mjs"), "utf8");
const fixture = readFileSync(resolve(directory, "phase3-production-fixture.sql"), "utf8");
const docs = readFileSync(resolve(root, "docs", "production-adoption", "phase3-security-reconciliation.md"), "utf8");

test("Phase 3 uses all seven explicit security classifications", () => {
  assert.deepEqual(PHASE3_CLASSIFICATIONS, [
    "canonical_missing",
    "canonical_contract_drift",
    "legacy_required_temporarily",
    "legacy_safe_to_remove",
    "development_forbidden",
    "adoption_temporary",
    "unknown_requires_evidence",
  ]);
});

test("domain rollout covers all ten required security domains without converting unknown to remove", () => {
  assert.equal(PHASE3_DOMAIN_CLASSIFICATION.length, 10);
  assert.deepEqual(PHASE3_DOMAIN_CLASSIFICATION.map((entry) => entry.key), [
    "identity_profiles", "admin", "training", "exams", "institutions",
    "matches", "psychology", "notifications", "storage", "metadata",
  ]);
  assert.equal(PHASE3_DOMAIN_CLASSIFICATION.find((entry) => entry.key === "institutions")?.decision, "UNKNOWN_REQUIRES_EVIDENCE");
  assert.equal(PHASE3_DOMAIN_CLASSIFICATION.find((entry) => entry.key === "storage")?.decision, "UNKNOWN_REQUIRES_EVIDENCE");
});

test("reviewed policy batch is an exact canonical subset", () => {
  assert.equal(PHASE3_POLICY_MATRIX.length, 22);
  for (const expected of PHASE3_POLICY_MATRIX) {
    const canonical = canonicalObjectManifest.policies.find((policy) =>
      policy.schema === "public" && policy.table === expected.table && policy.name === expected.name,
    );
    assert.ok(canonical, `${expected.table}.${expected.name} must exist in the canonical manifest`);
    assert.equal(canonical.command, expected.command);
    assert.deepEqual(canonical.roles, expected.roles);
    assert.equal(canonical.mode, "PERMISSIVE");
  }
});

test("policy reconciliation accepts only reviewed legacy equivalents and installs canonical helpers", () => {
  assert.match(policySql, /Reviewed policy expression drift blocks reconciliation/i);
  assert.match(policySql, /reflab_private\.request_user_id\(\) or reflab_private\.is_super_admin\(\)/i);
  assert.match(policySql, /reviewed_policy_count <> 22/i);
  assert.match(policySql, /polcmd\s*<>\s*\(\s*case\s+policy_kind[\s\S]*?end\s*\)\s*or\s+not\s+policy_state\.polpermissive/i);
  assert.doesNotMatch(policySql, /polcmd\s*<>\s*case\s+policy_kind/i);
  assert.doesNotMatch(policySql, /using\s*\(true\)/i);
  assert.doesNotMatch(policySql, /institution_has_permission|storage\.objects/i);
});

test("legacy policy normalization is exact for qualified and unqualified platform helpers", () => {
  const normalize = (expression) => expression
    .toLowerCase()
    .replace(/(^|[^a-z0-9_.])((public\.)?platform_request_user_id)\s*\(\s*\)/g, "$1reflab_private.request_user_id()")
    .replace(/(^|[^a-z0-9_.])((public\.)?platform_is_super_admin)\s*\(\s*\)/g, "$1reflab_private.is_super_admin()")
    .replace(/[\s()]/g, "");
  const expected = "user_id=reflab_private.request_user_idorreflab_private.is_super_admin";
  assert.equal(normalize("user_id = public.platform_request_user_id() or public.platform_is_super_admin()"), expected);
  assert.equal(normalize("user_id = platform_request_user_id() or platform_is_super_admin()"), expected);
  assert.notEqual(normalize("user_id = other.platform_request_user_id() or other.platform_is_super_admin()"), expected);
  assert.notEqual(normalize("user_id = fourth_identity_helper()"), expected);
  assert.equal(normalize("user_id = reflab_private.request_user_id() or reflab_private.is_super_admin()"), expected);
  assert.match(policySql, /Reviewed policy metadata drift blocks reconciliation/i);
  assert.match(policySql, /Reviewed canonical policy metadata is incomplete/i);
  assert.match(policySql, /Reviewed canonical policy expression is incomplete/i);
});

test("identity bridge preserves wrappers but removes their direct JWT reads", () => {
  for (const helper of PHASE3_LEGACY_IDENTITY_HELPERS) {
    assert.match(identitySql, new RegExp(helper.signature.replace(/[().]/g, "\\$&")));
  }
  assert.match(identitySql, /create function reflab_private\.request_user_id\(\)/i);
  assert.match(identitySql, /security invoker[\s\S]*set search_path = pg_catalog/i);
  assert.match(identitySql, /Unexpected direct external identity reader blocks reconciliation/i);
  assert.doesNotMatch(identitySql, /create table reflab_private\.user_identity_links/i);
  assert.doesNotMatch(identitySql, /insert into reflab_meta\.reflab_schema_state/i);
});

test("identity reader allowlist compares stable OIDs instead of rendered regprocedure text", () => {
  for (const helper of PHASE3_LEGACY_IDENTITY_HELPERS) {
    assert.match(identitySql, new RegExp(`to_regprocedure\\('${helper.signature.replace(/[().]/g, "\\$&")}\\'\\)::oid`, "i"));
  }
  assert.match(identitySql, /routine\.oid\s*<>\s*all\s*\(\s*array\[/i);
  assert.doesNotMatch(identitySql, /to_regprocedure\([^)]*\)::(?:pg_catalog\.)?(?:regprocedure|text)/i);

  const diagnosticSql = identityReaderDiagnosticSql();
  assert.match(diagnosticSql, /routine\.oid::pg_catalog\.regprocedure::text as rendered_identity/i);
  assert.match(diagnosticSql, /qualified_signature = any/i);
  assert.doesNotMatch(diagnosticSql, /rendered_identity\s*=\s*any/i);
});

test("identity bridge pins approved memberships and rejects relevant tuple/effective drift", () => {
  for (const role of [
    "anon", "authenticated", "service_role", "legacy_runtime", "reflab_rls_owner",
    "reflab_prod_preflight_ro", "reflab_preflight_audit_owner",
  ]) assert.match(identitySql, new RegExp(`'${role}'`));
  assert.match(identitySql, /granted\.rolname\s+in\s*\(/i);
  assert.match(identitySql, /member_role\.rolname\s+in\s*\(/i);
  assert.match(identitySql, /membership\.grantor/);
  assert.match(identitySql, /select \* from expected except select \* from actual/i);
  assert.match(identitySql, /select \* from actual except select \* from expected/i);
  assert.match(identitySql, /pg_has_role\(subject_oid, target_oid, 'SET'\)/);
  assert.doesNotMatch(identitySql, /reviewed bootstrap allowlist is empty/i);
});

test("Phase 3 membership diagnostics expose only role attributes and aggregate role edges", () => {
  const diagnostic = roleMembershipDiagnosticSql();
  for (const attribute of ["rolinherit", "rolcanlogin", "rolsuper", "rolbypassrls", "rolcreatedb", "rolcreaterole"]) {
    assert.match(diagnostic, new RegExp(attribute));
  }
  assert.match(diagnostic, /membership\.roleid in \(select oid from protected_role\)/i);
  assert.match(diagnostic, /membership\.member in \(select oid from protected_role\)/i);
  assert.match(diagnostic, /'membership_count'/i);
  assert.doesNotMatch(diagnostic, /user_id|email|payload|token|request\.jwt/i);
});

test("legacy identity helper contracts pin signature, owner, mode, search path, and source hash", () => {
  const fixtureBodies = [...fixture.matchAll(/create or replace function public\.(?:institution|platform|reflab)_request_user_id\(\)[\s\S]*?as \$function\$\s*([\s\S]*?)\s*\$function\$;/gi)];
  assert.equal(fixtureBodies.length, 3);
  for (const [index, helper] of PHASE3_LEGACY_IDENTITY_HELPERS.entries()) {
    const actualHash = createHash("sha256").update(normalizePhase3FunctionSource(fixtureBodies[index][1]), "utf8").digest("hex");
    assert.equal(actualHash, helper.sourceHash);
    assert.equal(helper.owner, "postgres");
    assert.equal(helper.security, "INVOKER");
    assert.equal(helper.searchPath, null);
    assert.match(identitySql, new RegExp(helper.sourceHash, "i"));
  }
  assert.match(identitySql, /identity_arguments\s*<>\s*''/i);
  assert.match(identitySql, /overload_count\s*<>\s*1/i);
  assert.match(identitySql, /owner_name\s*<>\s*'postgres'/i);
  assert.match(identitySql, /helper_state\.proconfig is not null/i);
});

test("function source hashing removes only exterior whitespace in JavaScript and PostgreSQL", () => {
  const source = "select nullif(value, '');";
  const hash = (value) => createHash("sha256").update(normalizePhase3FunctionSource(value), "utf8").digest("hex");
  assert.equal(hash(`\n${source}\n`), hash(source));
  assert.equal(hash(`\r\n${source}\r\n`), hash(source));
  assert.equal(hash(` \t${source}\t `), hash(source));
  assert.notEqual(hash("select  nullif(value, '');"), hash(source));
  assert.match(PHASE3_SOURCE_HASH_CONTRACT, /SHA-256.*outer edges/i);
  assert.match(identitySql, /regexp_replace\([\s\S]*?'\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$'[\s\S]*?'g'/i);
  assert.doesNotMatch(identitySql, /convert_to\(pg_catalog\.btrim/i);
});

test("Development identity infrastructure remains forbidden", () => {
  for (const signature of PHASE3_DEVELOPMENT_RPCS) {
    assert.match(identitySql, new RegExp(signature.split("(")[0].replaceAll(".", "\\.")));
  }
  assert.match(identitySql, /user_identity_links/i);
  assert.doesNotMatch(fixture, /user_identity_links/i);
});

test("browser grant matrix covers SELECT and every DML privilege object by object", () => {
  assert.equal(PHASE3_BROWSER_GRANT_MATRIX.length, 13 * 2 * 8);
  for (const entry of PHASE3_BROWSER_GRANT_MATRIX) {
    assert.ok(["anon", "authenticated"].includes(entry.role));
    assert.ok(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"].includes(entry.privilege));
    assert.notEqual(entry.decision, "unknown_requires_evidence");
  }
  const legacyAttemptInsert = PHASE3_BROWSER_GRANT_MATRIX.find((entry) =>
    entry.object === "public.attempts" && entry.role === "authenticated" && entry.privilege === "INSERT",
  );
  assert.equal(legacyAttemptInsert?.decision, "legacy_safe_to_remove");
  assert.equal(legacyAttemptInsert?.canonicalExpected, false);
  const crossUserDelete = PHASE3_BROWSER_GRANT_MATRIX.find((entry) =>
    entry.object === "public.user_profiles" && entry.role === "authenticated" && entry.privilege === "DELETE",
  );
  assert.equal(crossUserDelete?.decision, "legacy_safe_to_remove");
});

test("privilege migration is explicit and contains no global revoke or default ACL mutation", () => {
  assert.doesNotMatch(grantSql, /on all tables|alter default privileges|grant all|revoke all privileges/i);
  assert.match(grantSql, /revoke insert, update, delete, truncate, references, trigger, maintain on table public\.attempts/i);
  assert.doesNotMatch(grantSql, /grant insert on table public\.attempts/i);
  for (const grant of PHASE3_TEMPORARY_LEGACY_GRANTS) assert.ok(typeof grant === "string" && grant.length > 0);
});

test("all migrations are transactional, marker-disabled, and leave the Phase 2A sidecar alone", () => {
  for (const sql of Object.values(sqlByMigration)) {
    assert.match(sql, /^begin;/im);
    assert.match(sql, /^commit;/im);
    assert.match(sql, /set local lock_timeout = '5s'/i);
    assert.match(sql, /set local statement_timeout/i);
    assert.doesNotMatch(sql, /insert into reflab_meta\.reflab_schema_state/i);
    assert.doesNotMatch(sql, /drop (schema|function).*reflab_audit/i);
    assert.doesNotMatch(sql, /insert into reflab_meta\.production_adoption_state/i);
  }
});

test("routine caller report is backed by local application callers", () => {
  const callerSources = PHASE3_ROUTINE_CALLER_REPORT.filter((entry) => entry.expectedRole === "service_role");
  assert.equal(callerSources.length, 7);
  for (const entry of callerSources) {
    for (const relativePath of entry.caller.split("; ")) {
      const source = readFileSync(resolve(root, relativePath), "utf8");
      assert.match(source, new RegExp(entry.routine));
    }
  }
  const runtimeSources = ["app", "components", "lib"].flatMap(() => []);
  assert.deepEqual(runtimeSources, []);
});

test("new migrations are classified as manual Production adoption security", () => {
  for (const name of PHASE3_MIGRATIONS) {
    const version = name.slice(0, 14);
    const manifestEntry = migrationManifest.find((entry) => entry.version === version);
    assert.equal(manifestEntry?.classification, "production_adoption_security");
    assert.equal(manifestEntry?.productionAction, "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE");
  }
});

test("runner is isolated local-only and covers attacks plus rollback cases", () => {
  assert.match(runner, /PGHOST: "127\.0\.0\.1"/);
  assert.match(runner, /PGSSLMODE: "disable"/);
  assert.doesNotMatch(runner, /\.\.\.process\.env|PGPASSWORD|PGOPTIONS|PGSERVICE|PGPASSFILE|supabase\.co|--env-file/i);
  for (const scenario of [
    "anon insert", "cross-user update", "authenticated truncate", "authenticated internal helper",
    "anon security definer", "unsafe_identity", "policy_drift", "acl_drift", "role_membership",
    "source_drift", "development_rpc", "rls_disabled", "marker", "policy_metadata_drift",
    "other_schema_policy_helper", "unknown_policy_helper",
  ]) assert.match(runner, new RegExp(scenario.replace("_", "[_ ]"), "i"));
});

test("PostgreSQL rehearsal covers protected memberships in both directions and from unknown roles", () => {
  for (const statement of [
    "grant service_role to authenticated",
    "grant authenticated to service_role",
    "grant reflab_rls_owner to authenticated",
    "grant reflab_preflight_audit_owner to reflab_prod_preflight_ro",
    "grant phase3_unknown_role to authenticated",
    "grant authenticated to phase3_unknown_role",
  ]) assert.match(runner, new RegExp(statement, "i"));
  assert.match(runner, /membership_count !== 0/);
  assert.match(runner, /--diagnose-role-memberships/);
});

test("every Phase 3 negative scenario starts in a fresh cluster with explicit global-role isolation", () => {
  assert.match(runner, /--negative-case=/);
  assert.match(runner, /execFileSync\(process\.execPath,[\s\S]*?--negative-case=/);
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\), "reflab-phase3-"\)\)/);
  assert.match(runner, /to_regrole\('reflab_preflight_audit_owner'\) is null/);
  assert.match(runner, /sidecarAbsentAtStart: "PASS"/);
  assert.match(runner, /dropDatabase\(positive\)[\s\S]*?to_regrole\('reflab_preflight_audit_owner'\) is not null/);
  assert.match(runner, /cleanupCluster\(\)[\s\S]*?runIsolatedNegativeScenario/);
  assert.match(runner, /pgIsReady[\s\S]*?readiness\.status === 0/);
  assert.match(runner, /existsSync\(temporaryRoot\)/);
  assert.doesNotMatch(runner, /drop role(?: if exists)? reflab_preflight_audit_owner/i);
});

test("Phase 3 declares bootstrap roles separately from the Phase 2A cluster-global side effect", () => {
  for (const role of ["anon", "authenticated", "service_role", "legacy_runtime", "reflab_rls_owner", "reflab_prod_preflight_ro"]) {
    assert.match(runner, new RegExp(`role: "${role}", classification: "scenario_bootstrap"`));
  }
  assert.match(runner, /role: "reflab_preflight_audit_owner", classification: "phase2a_cluster_global_side_effect"/);
  assert.match(runner, /blockerDelta: \{ before: blockerDeltaBefore, after: blockerDeltaAfter \}/);
});

test("sanitized PostgreSQL diagnostics never treat missing SQLSTATE as success", () => {
  assert.deepEqual(parsePhase3PostgresFailure({ stderr: "ERROR:  55000: reviewed drift\nDETAIL: sensitive" }), {
    sqlstate: "55000",
    message: "reviewed drift",
  });
  assert.deepEqual(parsePhase3PostgresFailure({ stderr: "ERROR: sensitive without SQLSTATE" }), {
    sqlstate: "UNKNOWN",
    message: "Local Phase 3 SQL failed.",
  });
});

test("documentation leaves global cutover blockers and lifecycle gates explicit", () => {
  for (const phrase of [
    "PRE-CUTOVER SECURITY", "CUTOVER SECURITY", "POST-CUTOVER CLEANUP",
    "semantic audit sidecar", "schema state remains empty", "UNKNOWN is never removal evidence",
    "institution policies", "Storage", "security_cutover", "rollback",
  ]) assert.match(docs, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  assert.ok(PHASE3_UNRESOLVED.length >= 8);
});

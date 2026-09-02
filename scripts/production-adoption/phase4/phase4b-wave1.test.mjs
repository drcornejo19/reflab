import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationManifest } from "../../production-preflight/manifest.mjs";
import { PHASE4_PROVIDER_MAP } from "./phase4-structural-contract.mjs";
import {
  PHASE4B_WAVE1_HELPERS,
  PHASE4B_WAVE1_LEGACY_INSERT_POLICIES,
  PHASE4B_WAVE1_MIGRATION,
  PHASE4B_WAVE1_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE1_PREEXISTING_DEPENDENCIES,
  PHASE4B_WAVE1_PROVIDER,
  PHASE4B_WAVE1_RUNTIME_EXCLUSIONS,
  PHASE4B_WAVE1_VERSION,
  buildWave1DependencyGraph,
  isReviewedLegacyPolicyContract,
  isReviewedLegacyPolicyExpression,
  topologicallySortWave1Helpers,
} from "./phase4b-wave1-contract.mjs";
import {
  buildPhase4BWave1Migration,
  canonicalFunctionStatement,
  validateWave1DependencyDeclarations,
} from "./generate-phase4b-wave1.mjs";
import {
  PHASE4B_WAVE1_FIXTURE_COLUMN_USAGE,
  buildWave1FixtureDependencyContract,
  buildWave1FixtureDependencySql,
  wave1FixtureMissingColumnsSql,
} from "./phase4b-wave1-fixture-contract.mjs";
import {
  negativeInjectionSql,
  negativeMutationSql,
  negativeMutationAssertionSql,
  negativePreMutationAssertionSql,
} from "./run-phase4b-wave1-postgres.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const baseline = readFileSync(resolve(root, "supabase", "migrations", "202607270000_reflab_canonical_baseline.sql"), "utf8")
  .replaceAll("\r\n", "\n");
const migration = readFileSync(resolve(root, "supabase", "migrations", PHASE4B_WAVE1_MIGRATION), "utf8");

function bodyFromStatement(statement) {
  const match = statement.match(/as \$function\$([\s\S]*?)\$function\$;/i);
  assert.ok(match, "canonical function body must be extractable");
  return match[1];
}

function sourceHash(source) {
  return createHash("sha256").update(String(source).trim(), "utf8").digest("hex");
}

test("Wave 1 owns exactly the 16 reviewed baseline-only helpers", () => {
  assert.equal(PHASE4B_WAVE1_HELPERS.length, 16);
  assert.equal(new Set(PHASE4B_WAVE1_HELPERS.map((helper) => helper.signature)).size, 16);
  assert.ok(PHASE4B_WAVE1_HELPERS.every((helper) => helper.schema === "reflab_private"));
  assert.ok(PHASE4B_WAVE1_HELPERS.every((helper) => helper.classification === "SAFE_INSTALL_PHASE4B"));
});

test("every helper contract is derived exactly from the canonical baseline source", () => {
  for (const helper of PHASE4B_WAVE1_HELPERS) {
    const statement = canonicalFunctionStatement(baseline, helper);
    assert.equal(sourceHash(bodyFromStatement(statement)), helper.sourceHash, helper.signature);
    assert.match(statement, new RegExp(`^create function ${helper.schema}\\.${helper.name}\\(`, "i"));
  }
});

test("the dependency graph records every intra-Wave helper edge", () => {
  const graph = buildWave1DependencyGraph();
  assert.deepEqual([...graph.entries()].filter(([, dependencies]) => dependencies.length > 0), [
    ["reflab_private.can_access_user_data(text, uuid, text)", ["reflab_private.has_institution_permission(uuid, text)"]],
    ["reflab_private.has_institution_permission(uuid, text)", ["reflab_private.has_active_institution_membership(uuid)"]],
  ]);
  assert.doesNotThrow(() => validateWave1DependencyDeclarations(baseline));
  assert.ok(PHASE4B_WAVE1_PREEXISTING_DEPENDENCIES.includes("extensions.digest(bytea, text)"));
  assert.ok(PHASE4B_WAVE1_PREEXISTING_DEPENDENCIES.includes("reflab_private.request_user_id()"));
});

test("topological order places every dependency before its dependent", () => {
  const graph = buildWave1DependencyGraph();
  const ordered = topologicallySortWave1Helpers();
  const positions = new Map(ordered.map((helper, index) => [helper.signature, index]));
  const installStart = migration.indexOf("do $install$");
  const installEnd = migration.indexOf("$install$;", installStart);
  const install = migration.slice(installStart, installEnd);
  for (const [signature, dependencies] of graph) {
    for (const dependency of dependencies) {
      assert.ok(positions.get(dependency) < positions.get(signature), `${dependency} must precede ${signature}`);
      assert.ok(
        install.indexOf(`create function ${dependency.split("(")[0]}(`)
          < install.indexOf(`create function ${signature.split("(")[0]}(`),
        `generated SQL must create ${dependency} before ${signature}`,
      );
    }
  }
  assert.ok(
    positions.get("reflab_private.has_institution_permission(uuid, text)")
      < positions.get("reflab_private.can_access_user_data(text, uuid, text)"),
  );
});

test("dependency ordering is deterministic", () => {
  const first = topologicallySortWave1Helpers().map((helper) => helper.signature);
  const second = topologicallySortWave1Helpers().map((helper) => helper.signature);
  assert.deepEqual(first, second);
});

test("dependency graph rejects cycles", () => {
  const first = { ...PHASE4B_WAVE1_HELPERS[0], name: "cycle_a", signature: "reflab_private.cycle_a()", dependencies: ["reflab_private.cycle_b()"] };
  const second = { ...PHASE4B_WAVE1_HELPERS[1], name: "cycle_b", signature: "reflab_private.cycle_b()", dependencies: ["reflab_private.cycle_a()"] };
  assert.throws(() => topologicallySortWave1Helpers([first, second]), /Cyclic Wave 1 helper dependency/);
});

test("dependency graph rejects unknown and duplicate dependencies", () => {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  assert.throws(
    () => buildWave1DependencyGraph([{ ...helper, dependencies: ["reflab_private.unknown_dependency()"] }]),
    /Unknown Wave 1 dependency/,
  );
  assert.throws(
    () => buildWave1DependencyGraph([{ ...helper, dependencies: ["public.appointments", "public.appointments"] }]),
    /Duplicate Wave 1 dependency/,
  );
});

test("dependency graph rejects duplicate provider signatures", () => {
  const helper = PHASE4B_WAVE1_HELPERS[0];
  assert.throws(() => buildWave1DependencyGraph([helper, { ...helper }]), /Duplicate Wave 1 provider signature/);
});

test("generator rejects an undeclared intra-Wave dependency", () => {
  const helpers = PHASE4B_WAVE1_HELPERS.map((helper) => helper.name === "can_access_user_data"
    ? { ...helper, dependencies: helper.dependencies.filter((dependency) => dependency !== "reflab_private.has_institution_permission(uuid, text)") }
    : helper);
  assert.throws(() => validateWave1DependencyDeclarations(baseline, helpers), /dependency declaration drift/);
});

test("fixture dependency contract covers every Wave 1 helper and named relation", () => {
  assert.deepEqual(Object.keys(PHASE4B_WAVE1_FIXTURE_COLUMN_USAGE).sort(), PHASE4B_WAVE1_HELPERS.map((helper) => helper.signature).sort());
  for (const helper of PHASE4B_WAVE1_HELPERS) {
    const coveredTables = new Set(PHASE4B_WAVE1_FIXTURE_COLUMN_USAGE[helper.signature].map((usage) => usage.table));
    for (const dependency of helper.dependencies.filter((candidate) => candidate.startsWith("public."))) {
      assert.ok(coveredTables.has(dependency), `${helper.signature} must inventory ${dependency}`);
    }
  }
});

test("fixture dependency columns are derived from canonical table definitions", () => {
  const contract = buildWave1FixtureDependencyContract(baseline);
  assert.ok(contract.length > 40);
  assert.equal(new Set(contract.map((entry) => entry.identity)).size, contract.length);
  assert.ok(contract.every((entry) => entry.definition.startsWith(`${entry.column} `)));
  assert.ok(contract.every((entry) => entry.canonicalProvider === "202607270000_reflab_canonical_baseline.sql"));
  for (const identity of [
    "public.institution_permissions.id",
    "public.institution_membership_permission_overrides.allowed",
    "public.institution_membership_permission_overrides.permission_id",
    "public.institution_membership_roles.role_id",
    "public.institution_role_permissions.permission_id",
    "public.appointments.fixture_id",
    "public.appointments.sport_type",
    "public.performance_checkins.id",
    "public.institutional_clips.is_public",
  ]) assert.ok(contract.some((entry) => entry.identity === identity), identity);
});

test("fixture completion adds only absent canonical columns and exposes a completeness query", () => {
  const contract = buildWave1FixtureDependencyContract(baseline);
  const fixtureSql = buildWave1FixtureDependencySql(baseline);
  assert.equal((fixtureSql.match(/alter table /gi) ?? []).length, contract.length);
  assert.equal((fixtureSql.match(/add column if not exists/gi) ?? []).length, contract.length);
  assert.doesNotMatch(fixtureSql, /\b(?:insert|update|delete|merge|truncate|create function|create trigger)\b/i);
  assert.match(fixtureSql, /alter table public\.institution_permissions add column if not exists id uuid primary key default gen_random_uuid\(\)/i);
  const missingSql = wave1FixtureMissingColumnsSql(baseline);
  assert.match(missingSql, /pg_catalog\.pg_attribute/i);
  assert.match(missingSql, /not attribute\.attisdropped/i);
});

test("generated migration is deterministic and contains only the reviewed function provider", () => {
  assert.equal(migration, buildPhase4BWave1Migration());
  assert.equal((migration.match(/create function reflab_private\./gi) ?? []).length, 16);
  assert.doesNotMatch(migration, /create\s+(?:constraint\s+)?trigger|create\s+(?:unique\s+)?index|create\s+table|create\s+policy|alter\s+table\s+.*add\s+constraint/i);
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function/i);
  assert.match(migration, new RegExp(PHASE4B_WAVE1_PROVIDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("runtime and cutover-only functions are excluded", () => {
  for (const signature of PHASE4B_WAVE1_RUNTIME_EXCLUSIONS) {
    assert.doesNotMatch(migration, new RegExp(`create function ${signature.split("(")[0].replaceAll(".", "\\.")}`, "i"));
  }
  assert.doesNotMatch(migration, /submit_referee_exam|accept_canonical_institution_invitation|consume_coach_rate_limit/i);
});

test("Wave 1 is transactional, fail-closed, and leaves the adoption ledger unchanged", () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/i);
  assert.match(migration, /set local lock_timeout = '5s'/i);
  assert.match(migration, /set local statement_timeout = '60s'/i);
  assert.match(migration, /using errcode = '55000'/i);
  assert.match(migration, /phase_order = 4 and phase_key = 'canonical_objects'/i);
  assert.doesNotMatch(migration, /insert\s+into\s+reflab_meta\.(?:production_adoption_state|reflab_schema_state)/i);
  assert.match(migration, /commit;\s*$/i);
});

test("schema state remains empty and Development identity objects stay forbidden", () => {
  assert.match(migration, /count\(\*\) from reflab_meta\.reflab_schema_state\) <> 0/i);
  assert.match(migration, /reflab_private\.user_identity_links/i);
  assert.match(migration, /resolve_development_clerk_identity/i);
  assert.match(migration, /link_development_clerk_identity/i);
  assert.match(migration, /link_development_super_admin_clerk_identity/i);
});

test("exact drift and overload gates precede installation", () => {
  const preflightEnd = migration.indexOf("$preflight$;");
  const installStart = migration.indexOf("do $install$");
  assert.ok(preflightEnd > 0 && installStart > preflightEnd);
  const preflight = migration.slice(0, preflightEnd);
  for (const field of ["return_type", "language_name", "volatility_name", "strict_mode", "security_definer", "owner_name", "proconfig", "source_hash"]) {
    assert.match(preflight, new RegExp(field));
  }
  assert.match(preflight, /Unexpected Wave 1 helper overload/i);
  assert.match(preflight, /Duplicate Wave 1 provider declaration/i);
});

test("all application EXECUTE privileges are closed without inventing grants", () => {
  assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated, service_role;/i);
  assert.doesNotMatch(migration, /grant\s+execute/i);
  assert.match(migration, /has_function_privilege\(application_role\.role_name, routine\.oid, 'EXECUTE'\)/i);
});

test("owner, security mode, and search_path contract matches the inert design", () => {
  const definers = PHASE4B_WAVE1_HELPERS.filter((helper) => helper.security === "DEFINER");
  const invokers = PHASE4B_WAVE1_HELPERS.filter((helper) => helper.security === "INVOKER");
  assert.equal(definers.length, 3);
  assert.ok(definers.every((helper) => helper.owner === "reflab_rls_owner" && helper.language === "sql" && helper.volatility === "stable"));
  assert.equal(invokers.length, 13);
  assert.ok(invokers.every((helper) => helper.owner === "installer" && helper.language === "plpgsql" && helper.volatility === "volatile"));
  assert.ok(PHASE4B_WAVE1_HELPERS.every((helper) => helper.searchPath === "pg_catalog" && helper.strict === false));
});

test("the provider map assigns one Production-safe provider to every Wave 1 helper", () => {
  for (const helper of PHASE4B_WAVE1_HELPERS) {
    assert.equal(PHASE4_PROVIDER_MAP.get(helper.signature), PHASE4B_WAVE1_VERSION);
  }
});

test("migration manifest classifies Wave 1 as manual structural adoption", () => {
  const entry = migrationManifest.find((candidate) => candidate.version === PHASE4B_WAVE1_VERSION);
  assert.deepEqual(entry, {
    version: PHASE4B_WAVE1_VERSION,
    name: "production_adoption_inert_private_helpers",
    classification: "production_adoption_structural",
    productionAction: "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE",
  });
});

test("the isolated rehearsal contract contains the original and identity-policy negative scenarios", () => {
  assert.equal(PHASE4B_WAVE1_NEGATIVE_SCENARIOS.length, 23);
  assert.deepEqual(PHASE4B_WAVE1_NEGATIVE_SCENARIOS, [
    "source_drift", "return_type_drift", "language_drift", "volatility_drift",
    "security_mode_drift", "search_path_drift", "owner_drift", "unexpected_overload",
    "public_execute", "authenticated_execute", "unsafe_role_membership",
    "missing_adoption_prerequisite", "premature_canonical_marker",
    "development_object_present", "duplicate_provider_declaration",
    "fourth_policy_caller", "reviewed_policy_helper_drift",
    "reviewed_policy_command_drift", "reviewed_policy_role_drift",
    "reviewed_policy_permissive_drift", "wrapper_source_drift",
    "wrapper_security_definer", "unexpected_direct_identity_reader",
  ]);
});

test("volatility drift alters the exact canonical helper instead of relying on optional DDL text", () => {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  assert.equal(helper.volatility, "volatile");

  const injection = negativeInjectionSql("volatility_drift");
  assert.match(injection, /create function reflab_private\.set_updated_at\(\)/i);
  assert.match(injection, /alter function reflab_private\.set_updated_at\(\) stable;/i);
  assert.doesNotMatch(injection, /alter function reflab_private\.set_updated_at\(\) volatile;/i);
});

test("volatility mutation assertion isolates catalog volatility drift", () => {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  const assertionSql = negativeMutationAssertionSql("volatility_drift");

  assert.match(assertionSql, /routine\.provolatile='s'/i);
  assert.match(assertionSql, /routine\.provolatile<>'v'/i);
  assert.match(assertionSql, new RegExp(helper.sourceHash, "i"));
  for (const invariant of [
    "format_type(routine.prorettype,null)='trigger'",
    "language.lanname='plpgsql'",
    "routine.proisstrict=false",
    "routine.prosecdef=false",
    "pg_get_userbyid(routine.proowner)=current_user",
    "routine.proconfig is not distinct from array['search_path=pg_catalog']::text[]",
  ]) assert.ok(assertionSql.includes(invariant), invariant);
  for (const role of ["public", "anon", "authenticated", "service_role"]) {
    assert.match(assertionSql, new RegExp(`not pg_catalog\\.has_function_privilege\\('${role}'`, "i"));
  }
});

test("security mode drift uses ALTER FUNCTION after an exact canonical invoker pre-state", () => {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  assert.equal(helper.security, "INVOKER");

  const setup = negativeInjectionSql("security_mode_drift");
  assert.match(setup, /create function reflab_private\.set_updated_at\(\)/i);
  assert.doesNotMatch(setup, /security\s+definer/i);
  assert.doesNotMatch(setup, /\.replace\(/i);

  const mutation = negativeMutationSql("security_mode_drift");
  assert.equal(mutation, "alter function reflab_private.set_updated_at() security definer;");
});

test("security mode mutation assertions preserve every non-security function attribute", () => {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  const before = negativePreMutationAssertionSql("security_mode_drift");
  const after = negativeMutationAssertionSql("security_mode_drift");

  assert.match(before, /routine\.prosecdef=false/i);
  assert.doesNotMatch(before, /routine\.prosecdef=true/i);
  assert.match(after, /routine\.prosecdef=true/i);
  assert.match(after, /routine\.prosecdef<>false/i);
  for (const assertionSql of [before, after]) {
    assert.match(assertionSql, /pg_get_function_identity_arguments\(routine\.oid\)=''/i);
    assert.match(assertionSql, /format_type\(routine\.prorettype,null\)='trigger'/i);
    assert.match(assertionSql, /language\.lanname='plpgsql'/i);
    assert.match(assertionSql, /routine\.provolatile='v'/i);
    assert.match(assertionSql, /routine\.proisstrict=false/i);
    assert.match(assertionSql, /pg_get_userbyid\(routine\.proowner\)=current_user/i);
    assert.match(assertionSql, /routine\.proconfig is not distinct from array\['search_path=pg_catalog'\]::text\[\]/i);
    assert.match(assertionSql, new RegExp(helper.sourceHash, "i"));
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      assert.match(assertionSql, new RegExp(`not pg_catalog\\.has_function_privilege\\('${role}'`, "i"));
    }
  }
});

test("unexpected overload setup contains the canonical signature and exactly one synthetic overload", () => {
  const injection = negativeInjectionSql("unexpected_overload");
  assert.equal((injection.match(/create function reflab_private\.set_updated_at\(\)/gi) ?? []).length, 1);
  assert.equal((injection.match(/create function reflab_private\.set_updated_at\(integer\)/gi) ?? []).length, 1);
  assert.match(injection, /revoke all on function reflab_private\.set_updated_at\(\)/i);
  assert.match(injection, /revoke all on function reflab_private\.set_updated_at\(integer\)/i);
});

test("unexpected overload assertion requires the exact identity-argument set", () => {
  const helper = PHASE4B_WAVE1_HELPERS.find((candidate) => candidate.name === "set_updated_at");
  const assertionSql = negativeMutationAssertionSql("unexpected_overload");

  assert.match(assertionSql, /pg_get_function_identity_arguments\(routine\.oid\)/i);
  assert.match(assertionSql, /count\(\*\) from same_name\)=2/i);
  assert.match(assertionSql, /= array\['','integer'\]::text\[\]/i);
  assert.match(assertionSql, /to_regprocedure\('reflab_private\.set_updated_at\(integer\)'\)/i);
  assert.match(assertionSql, /identity_arguments='integer'/i);
  assert.doesNotMatch(assertionSql, /count\(\*\)[^;]*>\s*1/i);

  for (const canonicalInvariant of [
    "pg_get_function_identity_arguments(routine.oid)=''",
    "format_type(routine.prorettype,null)='trigger'",
    "language.lanname='plpgsql'",
    "routine.provolatile='v'",
    "routine.proisstrict=false",
    "routine.prosecdef=false",
    "pg_get_userbyid(routine.proowner)=current_user",
    "routine.proconfig is not distinct from array['search_path=pg_catalog']::text[]",
  ]) assert.ok(assertionSql.includes(canonicalInvariant), canonicalInvariant);
  assert.match(assertionSql, new RegExp(helper.sourceHash, "i"));
});

test("an integer-only fixture cannot satisfy the exact overload assertion", () => {
  const assertionSql = negativeMutationAssertionSql("unexpected_overload");
  assert.match(assertionSql, /count\(\*\) from same_name\)=2/i);
  assert.match(assertionSql, /array_agg\(identity_arguments order by identity_arguments\)/i);
  assert.match(assertionSql, /exists\([\s\S]*set_updated_at\(\)'/i);
});

test("every negative scenario has an explicit fail-closed mutation assertion", () => {
  for (const scenario of PHASE4B_WAVE1_NEGATIVE_SCENARIOS) {
    const assertionSql = negativeMutationAssertionSql(scenario);
    assert.match(assertionSql, /^(?:select\b|with\b[\s\S]*\bselect\b)/i, scenario);
    assert.match(assertionSql, /;\s*$/, scenario);
  }

  const runner = readFileSync(resolve(directory, "run-phase4b-wave1-postgres.mjs"), "utf8");
  assert.match(runner, /HARNESS_SETUP_FAIL:\s*\$\{scenario\}/);
  assert.ok(
    runner.indexOf("negativeMutationAssertionSql(scenario)")
      < runner.indexOf("apply(database, PHASE4B_WAVE1_MIGRATION)"),
    "the mutation assertion must run before the migration under test",
  );
});

test("only the three exact reviewed INSERT policies are allowlisted", () => {
  assert.deepEqual(PHASE4B_WAVE1_LEGACY_INSERT_POLICIES.map((policy) => `${policy.schema}.${policy.table}.${policy.name}`), [
    "public.attempts.attempts_own_insert",
    "public.exam_results.exam_results_own_insert",
    "public.rules_exam_results.rules_exam_results_own_insert",
  ]);
  for (const policy of PHASE4B_WAVE1_LEGACY_INSERT_POLICIES) {
    assert.equal(isReviewedLegacyPolicyContract(policy), true);
  }
});

test("qualified and unqualified reviewed platform wrapper expressions are equivalent", () => {
  assert.equal(isReviewedLegacyPolicyExpression("user_id = platform_request_user_id()"), true);
  assert.equal(isReviewedLegacyPolicyExpression("((user_id = public.platform_request_user_id()))"), true);
});

test("legacy policy expression allowlist rejects other schemas, helpers, and extra clauses", () => {
  for (const expression of [
    "user_id = other.platform_request_user_id()",
    "user_id = platform_is_super_admin()",
    "user_id = institution_request_user_id()",
    "user_id = reflab_request_user_id()",
    "user_id = platform_request_user_id() or true",
  ]) assert.equal(isReviewedLegacyPolicyExpression(expression), false, expression);
});

test("legacy policy metadata drift is rejected field by field", () => {
  const exact = PHASE4B_WAVE1_LEGACY_INSERT_POLICIES[0];
  assert.equal(isReviewedLegacyPolicyContract({ ...exact, command: "UPDATE" }), false);
  assert.equal(isReviewedLegacyPolicyContract({ ...exact, roles: ["anon"] }), false);
  assert.equal(isReviewedLegacyPolicyContract({ ...exact, permissive: false }), false);
  assert.equal(isReviewedLegacyPolicyContract({ ...exact, using: "true" }), false);
  assert.equal(isReviewedLegacyPolicyContract({ ...exact, withCheck: "user_id = institution_request_user_id()" }), false);
});

test("generated gate validates 22 canonical policies, three legacy policies, wrapper hash, and zero unexpected callers", () => {
  assert.match(migration, /canonical_policy_count <> 22/i);
  assert.match(migration, /reviewed_legacy_policy_count <> 3/i);
  assert.match(migration, /unexpected_legacy_policy_count <> 0/i);
  assert.match(migration, /3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c/i);
  assert.match(migration, /direct_reader_count <> 1/i);
  assert.doesNotMatch(migration, /regexp_replace[^;]+public[.]platform_request_user_id[^;]+reflab_private/si);
});

test("PL/pgSQL record variables do not collide with CTE names", () => {
  const preflight = migration.slice(migration.indexOf("do $preflight$"), migration.indexOf("$preflight$;"));
  const recordVariables = new Set(
    [...preflight.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+record\s*;/gim)].map((match) => match[1]),
  );
  const cteNames = new Set(
    [...preflight.matchAll(/\bwith\s+([a-z_][a-z0-9_]*)\s*\(/gi)].map((match) => match[1]),
  );
  assert.deepEqual([...recordVariables].filter((name) => cteNames.has(name)), []);
  assert.ok(recordVariables.has("expected"));
  assert.ok(cteNames.has("expected_canonical_policies"));
  assert.ok(cteNames.has("expected_legacy_policies"));
});

test("policy CTE projections never resolve through the expected record variable", () => {
  const preflight = migration.slice(migration.indexOf("do $preflight$"), migration.indexOf("$preflight$;"));
  const policyGate = preflight.slice(
    preflight.indexOf("with expected_canonical_policies"),
    preflight.indexOf("into protected_membership_count"),
  );
  assert.doesNotMatch(policyGate, /\bexpected\s*\./i);
  assert.doesNotMatch(policyGate, /\b(?:from|join)\s+expected\b/i);
  assert.equal((policyGate.match(/select\s+expected_policy\s*\.\s*\*/gi) ?? []).length, 2);
  assert.match(policyGate, /from\s+expected_canonical_policies\s+expected_policy/i);
  assert.match(policyGate, /from\s+expected_legacy_policies\s+expected_policy/i);
});

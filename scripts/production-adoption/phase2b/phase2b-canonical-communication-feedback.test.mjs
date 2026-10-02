import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { hashFunctionSource } from "../../production-preflight/queries.mjs";
import { ADMIN_CANONICAL_ACCESS_COLUMN_ACL } from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_TRAINING_CHECK_EXPRESSION,
  CANONICAL_TRAINING_FUNCTION,
  CANONICAL_TRAINING_FUNCTION_ACL,
  CANONICAL_TRAINING_INDEX_DEFINITION,
  CANONICAL_TRAINING_POLICIES,
  CANONICAL_TRAINING_RLS,
  CANONICAL_TRAINING_SCHEMA_ACL,
  CANONICAL_TRAINING_TABLE_ACL,
} from "./phase2b-canonical-training-attempts-contract.mjs";
import {
  CANONICAL_COMMUNICATION_ARTIFACT,
  CANONICAL_COMMUNICATION_FUNCTION,
  CANONICAL_COMMUNICATION_FUNCTION_ACL,
  CANONICAL_COMMUNICATION_POST_SOURCE_TYPE_EXPRESSION,
  CANONICAL_COMMUNICATION_PRE_SOURCE_TYPE_EXPRESSION,
  CANONICAL_COMMUNICATION_SHA256,
  CANONICAL_COMMUNICATION_SOURCE_SHA256,
  assertCanonicalCommunicationArtifact,
  canonicalCommunicationPostQuery,
  canonicalCommunicationPreQuery,
  classifyCanonicalCommunicationCompletionPreservation,
  classifyCanonicalCommunicationEntry,
  classifyCanonicalCommunicationPostComposition,
  classifyCanonicalCommunicationState,
} from "./phase2b-canonical-communication-feedback-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(resolve(root, CANONICAL_COMMUNICATION_ARTIFACT), "utf8");
const communicationBody = migration.match(/create function public[.]submit_canonical_communication_feedback[(][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i)?.[1] ?? "";
const trainingMigration = readFileSync(resolve(root,
  "supabase/migrations/202608130001_canonical_training_attempts.sql"), "utf8");
const trainingBody = trainingMigration.match(/create function public[.]submit_canonical_training_attempt[(][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i)?.[1] ?? "";

function prerequisitePreservationPayload() {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170011,
    checks: {
      sessionExact: true, columnShapeExact: true, historicalCountsExact: true,
      historicalSemanticsExact: true, clipsExact: true, sidecarExact: true,
      providerStateExact: false, ledgerExact: true, markerAbsent: true,
      leaderboardExact: true, createdAtIndexesExact: true, phase2bEntryExact: false,
    },
    counts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      score_non_null: 36, score_null: 1, training_duplicate_groups: 0 },
  };
}

function trainingPreservationPayload() {
  return {
    checks: Object.fromEntries([
      "sessionExact", "historicalFingerprintsExact", "ledgerExact", "schemaStateEmpty",
      "canonicalMarkerAbsent", "providerObjectsExact", "columnStateExact",
      "historicalPayloadHashNullsExact", "trainingDuplicatesAbsent", "rlsOwnerCreateAbsent",
    ].map((name) => [name, true]).concat([["laterProvidersAbsent", false]])),
    counts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      payload_hash_nulls: 37, training_duplicate_groups: 0 },
    function: { ...CANONICAL_TRAINING_FUNCTION,
      configuration: [...CANONICAL_TRAINING_FUNCTION.configuration],
      source_base64: Buffer.from(trainingBody).toString("base64") },
    function_acl: CANONICAL_TRAINING_FUNCTION_ACL.map((entry) => ({ ...entry })),
    policies: CANONICAL_TRAINING_POLICIES.map((entry) => ({ ...entry, roles: [...entry.roles] })),
    schema_acl: CANONICAL_TRAINING_SCHEMA_ACL.map((entry) => ({ ...entry })),
    table_acl: CANONICAL_TRAINING_TABLE_ACL.map((entry) => ({ ...entry })),
    column_acl: ADMIN_CANONICAL_ACCESS_COLUMN_ACL.map((entry) => ({ ...entry })),
    rls: CANONICAL_TRAINING_RLS.map((entry) => ({ ...entry })),
    check_expression: CANONICAL_TRAINING_CHECK_EXPRESSION,
    index_definition: CANONICAL_TRAINING_INDEX_DEFINITION,
    prerequisite_preservation: prerequisitePreservationPayload(),
  };
}

function payload(post = false) {
  return {
    checks: Object.fromEntries([
      "sessionExact", "historicalFingerprintsExact", "ledgerExact", "schemaStateEmpty",
      "canonicalMarkerAbsent", "communicationProviderStateExact", "communicationRowsAbsent",
      "sourceConstraintPresent", "laterAdoptionAbsent", "rlsOwnerCreateAbsent",
    ].map((name) => [name, true])),
    counts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      communication_attempts: 0, payload_hash_nulls: 37 },
    function: post ? { ...CANONICAL_COMMUNICATION_FUNCTION,
      configuration: [...CANONICAL_COMMUNICATION_FUNCTION.configuration],
      source_base64: Buffer.from(communicationBody).toString("base64") } : null,
    function_acl: post ? CANONICAL_COMMUNICATION_FUNCTION_ACL.map((entry) => ({ ...entry })) : [],
    source_constraint: {
      expression: post ? CANONICAL_COMMUNICATION_POST_SOURCE_TYPE_EXPRESSION
        : CANONICAL_COMMUNICATION_PRE_SOURCE_TYPE_EXPRESSION,
      validated: true, no_inherit: false,
    },
    training_preservation: trainingPreservationPayload(),
  };
}

test("corrected 202608150001 artifact is pinned and hardens ACL before owner transfer", () => {
  const artifact = assertCanonicalCommunicationArtifact(root);
  assert.equal(artifact.sha256, CANONICAL_COMMUNICATION_SHA256);
  assert.ok(migration.indexOf("revoke all on function")
    < migration.indexOf("alter function public.submit_canonical_communication_feedback"));
  assert.match(migration, /Canonical communication RPC ACL is invalid/);
});

test("communication RPC body remains exact while ACL lifecycle changes", () => {
  assert.equal(hashFunctionSource(communicationBody), CANONICAL_COMMUNICATION_SOURCE_SHA256);
});

test("migration scope is one CHECK replacement and one provider function", () => {
  assert.equal((migration.match(/^create function public[.]submit_canonical_communication_feedback/gmi) ?? []).length, 1);
  assert.equal((migration.match(/drop constraint attempts_source_type_check/gmi) ?? []).length, 1);
  assert.equal((migration.match(/add constraint attempts_source_type_check/gmi) ?? []).length, 1);
  const withoutBody = migration.replace(/as [$]function[$][\s\S]*?[$]function[$];/i, "");
  assert.doesNotMatch(withoutBody, /^\s*(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public|reflab_meta)[.]/gmi);
  assert.doesNotMatch(migration, /\bnotify\b/i);
});

test("PRE and POST queries are bounded catalog and aggregate evidence", () => {
  for (const query of [canonicalCommunicationPreQuery, canonicalCommunicationPostQuery]) {
    assert.match(query.payloadSql, /transaction_read_only/);
    assert.match(query.payloadSql, /pg_catalog[.]pg_proc/);
    assert.match(query.payloadSql, /training_preservation/);
    assert.doesNotMatch(query.payloadSql, /select\s+[*]\s+from\s+(?:public|reflab_meta)[.]/i);
  }
});

test("exact post-Training PRE passes and exact Communication POST is exact", () => {
  assert.equal(classifyCanonicalCommunicationState(payload()).classification, "PASS");
  assert.equal(classifyCanonicalCommunicationState(payload(true), { post: true }).classification, "EXACT");
});

test("completion preservation permits only the reviewed phase-4 ledger transition", () => {
  const value = payload(true);
  value.checks.ledgerExact = false;
  value.checks.laterAdoptionAbsent = false;
  value.training_preservation.checks.ledgerExact = false;
  value.training_preservation.prerequisite_preservation.checks.ledgerExact = false;
  const result = classifyCanonicalCommunicationCompletionPreservation(value);
  assert.equal(result.classification, "EXACT");
  assert.deepEqual(result.observedLifecycle, { ledgerExact: false, laterAdoptionAbsent: false });
});

for (const [name, mutate] of [
  ["source constraint", (value) => { value.source_constraint.expression = "source_item_type is null"; }],
  ["RPC source", (value) => { value.function.source_base64 = Buffer.from("begin return null; end").toString("base64"); }],
  ["RPC ACL", (value) => { value.function_acl.push({ grantee: "anon", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["Training preservation", (value) => { value.training_preservation.policies.pop(); }],
  ["historical rows", (value) => { value.counts.communication_attempts = 1; }],
]) test(`completion preservation still blocks ${name} drift`, () => {
  const value = payload(true);
  value.checks.ledgerExact = false;
  value.checks.laterAdoptionAbsent = false;
  value.training_preservation.checks.ledgerExact = false;
  value.training_preservation.prerequisite_preservation.checks.ledgerExact = false;
  mutate(value);
  assert.equal(classifyCanonicalCommunicationCompletionPreservation(value).classification, "BLOCKER");
});

test("entry composition requires exact Phase2A, helper, admin and Communication PRE", () => {
  const exact = {
    phase2a: { postState: "EXACT" }, helper: { classification: "EXACT" },
    admin: { classification: "EXACT" }, communication: { classification: "PASS" },
  };
  assert.equal(classifyCanonicalCommunicationEntry(exact).classification, "EXACT");
  for (const name of Object.keys(exact)) {
    const drift = structuredClone(exact);
    if (name === "phase2a") drift[name].postState = "BLOCKER";
    else drift[name].classification = "BLOCKER";
    assert.equal(classifyCanonicalCommunicationEntry(drift).classification, "BLOCKER");
  }
});

test("post composition preserves Phase2A, helper and stage-aware Admin contracts", () => {
  const exact = {
    phase2a: { postState: "EXACT" }, helper: { classification: "EXACT" },
    admin: { classification: "EXACT" }, communication: { classification: "EXACT" },
  };
  assert.equal(classifyCanonicalCommunicationPostComposition(exact).classification, "EXACT");
  for (const name of Object.keys(exact)) {
    const drift = structuredClone(exact);
    if (name === "phase2a") drift[name].postState = "BLOCKER";
    else drift[name].classification = "BLOCKER";
    assert.equal(classifyCanonicalCommunicationPostComposition(drift).classification, "BLOCKER");
  }
});

for (const [name, mutate] of [
  ["Training provider", (value) => { value.training_preservation.function.owner_name = "postgres"; }],
  ["historical counts", (value) => { value.counts.attempts = 38; }],
  ["communication provider collision", (value) => { value.function = { unexpected: true }; }],
  ["source CHECK", (value) => { value.source_constraint.expression = "source_item_type is null"; }],
  ["later provider", (value) => { value.checks.laterAdoptionAbsent = false; }],
  ["ledger", (value) => { value.checks.ledgerExact = false; }],
  ["schema state", (value) => { value.checks.schemaStateEmpty = false; }],
  ["canonical marker", (value) => { value.checks.canonicalMarkerAbsent = false; }],
]) test(`PRE ${name} drift fails closed`, () => {
  const value = payload(); mutate(value);
  assert.equal(classifyCanonicalCommunicationState(value).classification, "BLOCKER");
});

for (const [name, mutate] of [
  ["RPC source", (value) => { value.function.source_base64 = Buffer.from("begin return null; end").toString("base64"); }],
  ["RPC owner", (value) => { value.function.owner_name = "postgres"; }],
  ["SECURITY DEFINER", (value) => { value.function.security_definer = false; }],
  ["search path", (value) => { value.function.configuration = ["search_path=public"]; }],
  ["PUBLIC execute", (value) => { value.function_acl.push({ grantee: "PUBLIC", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["anon execute", (value) => { value.function_acl.push({ grantee: "anon", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["authenticated execute", (value) => { value.function_acl.push({ grantee: "authenticated", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["service role", (value) => { value.function_acl.pop(); }],
  ["grant option", (value) => { value.function_acl[1].is_grantable = true; }],
  ["constraint validation", (value) => { value.source_constraint.validated = false; }],
  ["constraint expression", (value) => { value.source_constraint.expression = CANONICAL_COMMUNICATION_PRE_SOURCE_TYPE_EXPRESSION; }],
  ["Training ACL", (value) => { value.training_preservation.function_acl[0].is_grantable = true; }],
  ["Training policy", (value) => { value.training_preservation.policies.pop(); }],
  ["Training RLS", (value) => { value.training_preservation.rls[0].enabled = false; }],
  ["historical communication row", (value) => { value.counts.communication_attempts = 1; }],
  ["rls owner CREATE", (value) => { value.checks.rlsOwnerCreateAbsent = false; }],
]) test(`POST ${name} drift fails closed`, () => {
  const value = payload(true); mutate(value);
  assert.equal(classifyCanonicalCommunicationState(value, { post: true }).classification, "BLOCKER");
});

test("communication provider grants no browser privilege and adds no policy or table ACL", () => {
  assert.deepEqual(CANONICAL_COMMUNICATION_FUNCTION_ACL.map(({ grantee }) => grantee).sort(),
    ["reflab_rls_owner", "service_role"]);
  assert.doesNotMatch(migration, /grant\s+\w+[\s\S]*?\s+to\s+(?:public|anon|authenticated)\b/i);
  assert.doesNotMatch(migration, /^create\s+policy\b/gmi);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete|truncate|references|trigger|maintain)\s+on\s+table/i);
});

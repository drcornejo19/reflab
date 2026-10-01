import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS,
  ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
} from "../bootstrap/production-role-bootstrap-contract.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_POST_CHECKS,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_CHECKS,
  ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
  ADMIN_CANONICAL_ACCESS_FUNCTIONS,
  ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
  ADMIN_CANONICAL_ACCESS_POLICIES,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_JSONB_TEXT_ACL,
  CANONICAL_RUNTIME_PREREQUISITES_CHECKS,
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  CANONICAL_TRAINING_CHECK_EXPRESSION,
  CANONICAL_TRAINING_COLUMN_ACL,
  CANONICAL_TRAINING_FUNCTION,
  CANONICAL_TRAINING_FUNCTION_ACL,
  CANONICAL_TRAINING_INDEX_DEFINITION,
  CANONICAL_TRAINING_POLICIES,
  CANONICAL_TRAINING_POST_QUERY_ID,
  CANONICAL_TRAINING_RLS,
  CANONICAL_TRAINING_SCHEMA_ACL,
  CANONICAL_TRAINING_TABLE_ACL,
} from "./phase2b-canonical-training-attempts-contract.mjs";
import {
  PRE_PHASE2B_POST_QUERY_ID,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID,
  CANONICAL_TRAINING_FORENSIC_OPERATION,
  ReadOnlyForensicFailure,
  buildCanonicalTrainingForensicCatalogBatch,
  buildCanonicalTrainingForensicPrerequisiteBatch,
  classifyCanonicalTrainingPostDdlForensic,
  formatCanonicalTrainingForensicFailure,
  authorizeProductionCanonicalTrainingForensicTarget,
  runProductionCanonicalTrainingPostDdlForensic,
  runProductionCanonicalTrainingPostDdlForensicCli,
} from "./run-production-phase2b-canonical-training-attempts-post-ddl-forensic.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const trainingMigration = readFileSync(resolve(root,
  "supabase/migrations/202608130001_canonical_training_attempts.sql"), "utf8");
const helperMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"), "utf8");
const adminMigration = readFileSync(resolve(root,
  "supabase/migrations/202608110001_canonical_admin_user_access.sql"), "utf8");
const sidecarMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310004_production_adoption_semantic_audit.sql"), "utf8");
const forensicSource = readFileSync(resolve(import.meta.dirname,
  "run-production-phase2b-canonical-training-attempts-post-ddl-forensic.mjs"), "utf8");
const productionRunnerPath = resolve(import.meta.dirname,
  "run-production-phase2b-canonical-training-attempts.mjs");
const productionRunner = readFileSync(productionRunnerPath, "utf8");

const helperSource = helperMigration.match(/as \$function\$([\s\S]*?)\$function\$;/i)?.[1] ?? "";
const sidecarSource = sidecarMigration.match(/as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i)?.[1] ?? "";
const trainingSource = trainingMigration.match(
  /create function public[.]submit_canonical_training_attempt[(][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i,
)?.[1] ?? "";

function adminFunctionSource(name) {
  return adminMigration.match(new RegExp(
    `create function public\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`, "i",
  ))?.[1] ?? "";
}

function installerPayload() {
  const memberships = ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
  return {
    caller: "postgres", session_user: "postgres", server_version_num: 170011,
    installer: {
      rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true,
      rolsuper: false, rolcreatedb: true, rolbypassrls: true, rolreplication: true,
    },
    protected_role: {
      rolname: "reflab_rls_owner", rolcanlogin: false, rolinherit: false,
      rolcreaterole: false, rolsuper: false, rolcreatedb: false, rolbypassrls: false,
    },
    semantic_audit_role: {
      rolname: "reflab_preflight_audit_owner", ...ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
    },
    memberships,
    membership_summary: {
      total_count: memberships.length,
      as_member_count: memberships.filter((entry) => entry.member_role === "postgres").length,
      as_granted_role_count: memberships.filter((entry) => entry.granted_role === "postgres").length,
    },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
  };
}

function sidecarPayload() {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170011,
    checks: Object.fromEntries(PHASE2A_SEMANTIC_AUDIT_POST_CHECKS.map((name) => [name, true])),
    counts: { policies: 58, column_grants: 100, effective_select_columns: 100,
      ledger_rows: 3, schema_state_rows: 0 },
    function_source_base64: Buffer.from(sidecarSource, "utf8").toString("base64"),
  };
}

function helperPayload() {
  return {
    checks: {
      ...Object.fromEntries(CANONICAL_RUNTIME_PREREQUISITES_CHECKS.map((name) => [name, true])),
      adminProvidersAbsent: false,
    },
    source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    counts: { attempts: 37, exam_results: 6, notification_events: 60, ledger: 3, schema_state: 0 },
  };
}

function adminPayload() {
  const checks = Object.fromEntries(ADMIN_CANONICAL_ACCESS_CHECKS.map((name) => [name, true]));
  checks.adminTablePrivilegesAbsent = false;
  return {
    checks,
    helper_source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    helper_acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    functions: ADMIN_CANONICAL_ACCESS_FUNCTIONS.map((fn) => ({
      name: fn.name, identity_arguments: fn.identity_arguments, result_type: "jsonb",
      language_name: "plpgsql", volatility: "v", strict_mode: false,
      security_definer: true, leakproof: false, function_kind: "f",
      owner_name: "reflab_rls_owner", configuration: ["search_path=pg_catalog"],
      source_base64: Buffer.from(adminFunctionSource(fn.name), "utf8").toString("base64"),
    })),
    function_acl: ADMIN_CANONICAL_ACCESS_FUNCTION_ACL.map((entry) => ({ ...entry })),
    policies: ADMIN_CANONICAL_ACCESS_POLICIES.map((entry) => ({ ...entry })),
    schema_acl: ADMIN_CANONICAL_ACCESS_SCHEMA_ACL.map((entry) => ({ ...entry })),
    table_acl: [{ ...CANONICAL_TRAINING_TABLE_ACL[0] }],
    column_acl: ADMIN_CANONICAL_ACCESS_COLUMN_ACL.map((entry) => ({ ...entry })),
    counts: { attempts: 37, exam_results: 6, notification_events: 60, ledger: 3, schema_state: 0 },
  };
}

function trainingPayload() {
  return {
    checks: Object.fromEntries([
      "sessionExact", "historicalFingerprintsExact", "ledgerExact", "schemaStateEmpty",
      "canonicalMarkerAbsent", "providerObjectsExact", "columnStateExact",
      "historicalPayloadHashNullsExact", "trainingDuplicatesAbsent", "laterProvidersAbsent",
      "rlsOwnerCreateAbsent",
    ].map((name) => [name, true])),
    counts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      payload_hash_nulls: 37, training_duplicate_groups: 0 },
    function: {
      ...CANONICAL_TRAINING_FUNCTION,
      configuration: [...CANONICAL_TRAINING_FUNCTION.configuration],
      source_base64: Buffer.from(trainingSource, "utf8").toString("base64"),
    },
    function_acl: CANONICAL_TRAINING_FUNCTION_ACL.map((entry) => ({ ...entry })),
    policies: CANONICAL_TRAINING_POLICIES.map((entry) => ({ ...entry, roles: [...entry.roles] })),
    schema_acl: CANONICAL_TRAINING_SCHEMA_ACL.map((entry) => ({ ...entry })),
    table_acl: CANONICAL_TRAINING_TABLE_ACL.map((entry) => ({ ...entry })),
    column_acl: CANONICAL_TRAINING_COLUMN_ACL.map((entry) => ({ ...entry })),
    rls: CANONICAL_TRAINING_RLS.map((entry) => ({ ...entry })),
    check_expression: CANONICAL_TRAINING_CHECK_EXPRESSION,
    index_definition: CANONICAL_TRAINING_INDEX_DEFINITION,
  };
}

function prerequisitePayload() {
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

function postResults(payload = trainingPayload()) {
  return new Map([
    [installerIdentityQuery.id, installerPayload()],
    [phase1ProductFingerprintQuery.id, { attempts: 37, exam_results: 6, notification_events: 60 }],
    [phase2aSemanticAuditPostQuery.id, sidecarPayload()],
    [CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID, helperPayload()],
    [ADMIN_CANONICAL_ACCESS_POST_QUERY_ID, adminPayload()],
    [CANONICAL_TRAINING_POST_QUERY_ID, payload],
  ]);
}

function prerequisiteResults(payload = prerequisitePayload()) {
  return new Map([[PRE_PHASE2B_POST_QUERY_ID, payload]]);
}

function catalogPayload(overrides = {}) {
  return {
    function_raw_acl: ["reflab_rls_owner=X/reflab_rls_owner", "service_role=X/reflab_rls_owner"],
    column: { data_type: "text", not_null: false, default_expression: null },
    check: {
      name: "attempts_canonical_payload_hash_check",
      expression: CANONICAL_TRAINING_CHECK_EXPRESSION,
      definition: `CHECK (${CANONICAL_TRAINING_CHECK_EXPRESSION})`,
      validated: true, deferrable: false, initially_deferred: false,
    },
    index: {
      name: "attempts_canonical_training_submission_unique",
      definition: CANONICAL_TRAINING_INDEX_DEFINITION,
      predicate: "((exam_result_id IS NULL) AND (submission_id IS NOT NULL))",
      unique_index: true, valid: true, ready: true,
    },
    training_policy_scope: CANONICAL_TRAINING_POLICIES.map((entry) => ({ ...entry })),
    browser_function_execute: [],
    browser_table_privileges: [],
    browser_column_privileges: [],
    service_role_execute: true,
    rls_owner_create_absent: true,
    ...overrides,
  };
}

test("exact forensic state classifies the aggregate POST failure as a diagnostic false negative", () => {
  const output = classifyCanonicalTrainingPostDdlForensic(
    postResults(), prerequisiteResults(), catalogPayload(),
  );
  assert.equal(output.classification, "A. POST_STATE_EXACT_DIAGNOSTIC_FALSE_NEGATIVE");
  assert.equal(output.migrationCommitted, true);
  assert.deepEqual(output.failedComponents, []);
  assert.deepEqual(output.unknownComponents, []);
  assert.deepEqual(output.differences, []);
  assert.equal(output.observed.rpc.source_sha256, CANONICAL_TRAINING_FUNCTION.source_hash);
  assert.equal(output.observed.rpc.source_base64, undefined);
});

for (const [area, mutate] of [
  ["PAYLOAD_HASH_COLUMN", (_payload, catalog) => { catalog.column.data_type = "integer"; }],
  ["PAYLOAD_HASH_NULL_COUNT", (payload) => { payload.counts.payload_hash_nulls = 36; }],
  ["CHECK", (_payload, catalog) => { catalog.check.validated = false; }],
  ["PARTIAL_UNIQUE_INDEX", (_payload, catalog) => { catalog.index.ready = false; }],
  ["RPC", (payload) => { payload.function.owner_name = "postgres"; }],
  ["FUNCTION_ACL", (payload) => { payload.function_acl.pop(); }],
  ["POLICIES", (payload) => { payload.policies.pop(); }],
  ["SCHEMA_ACL", (payload) => { payload.schema_acl.pop(); }],
  ["TABLE_ACL", (payload) => { payload.table_acl.pop(); }],
  ["COLUMN_ACL", (payload) => { payload.column_acl.pop(); }],
  ["RLS", (payload) => { payload.rls[0].enabled = false; }],
]) test(`${area} mismatch is reported as an individual expected/observed delta`, () => {
  const payload = trainingPayload();
  const catalog = catalogPayload();
  mutate(payload, catalog);
  const output = classifyCanonicalTrainingPostDdlForensic(
    postResults(payload), prerequisiteResults(), catalog,
  );
  const difference = output.differences.find((entry) => entry.area === area);
  assert.ok(difference);
  assert.ok(Array.isArray(difference.missing));
  assert.ok(Array.isArray(difference.unexpected));
});

test("browser EXECUTE exposure is reported and classified unsafe", () => {
  const output = classifyCanonicalTrainingPostDdlForensic(
    postResults(), prerequisiteResults(), catalogPayload({
      browser_function_execute: [{ grantee: "PUBLIC", grantor: "reflab_rls_owner",
        privilege_type: "EXECUTE", is_grantable: false }],
    }),
  );
  assert.equal(output.classification, "C. COMMITTED_PARTIAL_OR_UNSAFE_STATE");
  assert.equal(output.security.productionExposureIncreased, true);
});

test("grantor-only ACL drift is distinguished as committed safe contract drift", () => {
  const payload = trainingPayload();
  payload.function_acl[0].grantor = "postgres";
  const output = classifyCanonicalTrainingPostDdlForensic(
    postResults(payload), prerequisiteResults(), catalogPayload(),
  );
  assert.equal(output.classification, "B. COMMITTED_SAFE_BUT_CONTRACT_DRIFT");
  assert.equal(output.security.productionExposureIncreased, false);
  assert.ok(output.differences.some(({ area }) => area === "FUNCTION_ACL"));
});

test("unknown predecessor evidence remains UNKNOWN and fails closed", () => {
  const results = postResults();
  results.delete(installerIdentityQuery.id);
  const output = classifyCanonicalTrainingPostDdlForensic(
    results, prerequisiteResults(), catalogPayload(),
  );
  assert.equal(output.classification, "D. UNKNOWN");
  assert.ok(output.unknownComponents.includes("installerManagedProfileExact"));
});

test("all forensic SQL batches are bounded BEGIN READ ONLY and ROLLBACK", () => {
  for (const batch of [
    buildCanonicalTrainingForensicCatalogBatch(),
    buildCanonicalTrainingForensicPrerequisiteBatch(),
  ]) {
    assert.doesNotThrow(() => assertReadOnlyBatch(batch));
    assert.match(batch, /^begin read only;/i);
    assert.match(batch, /statement_timeout/);
    assert.match(batch, /lock_timeout/);
    assert.match(batch, /transaction_read_only/);
    assert.match(batch, /rollback;\s*$/i);
  }
});

test("forensic runner has no migration execution, notification, or provider continuation path", () => {
  assert.doesNotMatch(forensicSource,
    /executeMigration|assertCanonicalTrainingArtifact|db\s+push|readdirSync|\bglob\b|\bnotify\b/i);
  assert.doesNotMatch(forensicSource, /202608150001_canonical_communication_feedback[.]sql|202608310006/);
  assert.match(forensicSource, /buildCanonicalTrainingPostBatch/);
  assert.match(forensicSource, /buildSqlBatch/);
});

test("exact operation and inherited PG state block before any query", () => {
  let calls = 0;
  assert.throws(() => runProductionCanonicalTrainingPostDdlForensic({}, {
    argument: "wrong", executeReadOnly: () => { calls += 1; return new Map(); },
  }), /OPERATION_GUARD/);
  assert.throws(() => runProductionCanonicalTrainingPostDdlForensic({ PGHOST: "inherited" }, {
    argument: CANONICAL_TRAINING_FORENSIC_OPERATION,
    executeReadOnly: () => { calls += 1; return new Map(); },
  }), /ENVIRONMENT_GUARD/);
  assert.equal(calls, 0);
});

test("DDL configuration is rejected by the dedicated forensic target", () => {
  assert.throws(() => authorizeProductionCanonicalTrainingForensicTarget({
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION: "true",
    ALLOW_PRODUCTION_PHASE2B_CANONICAL_TRAINING_ATTEMPTS_POST_DDL_FORENSIC: "true",
    ALLOW_PRODUCTION_DDL: "true",
  }), /REJECTS_DDL_CONFIGURATION/);
});

test("missing framed query ID is reported by safe query name", () => {
  const head = "a".repeat(40);
  assert.throws(() => runProductionCanonicalTrainingPostDdlForensic({
    REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD: head,
  }, {
    argument: CANONICAL_TRAINING_FORENSIC_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => ({ connectionEnvironment: {} }),
    executeReadOnly: () => new Map(),
  }), (error) => error instanceof ReadOnlyForensicFailure
    && error.reason === "QUERY_RESULT_SHAPE_MISMATCH"
    && error.queryId === installerIdentityQuery.id);
});

test("failure output is bounded and redacts URLs and passwords", async () => {
  let stderr = "";
  const exitCode = await runProductionCanonicalTrainingPostDdlForensicCli({}, {
    run: () => { throw new Error("postgresql://user:password@example.invalid/private"); },
    writeStdout: () => { throw new Error("unexpected stdout"); },
    writeStderr: (value) => { stderr += value; },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr, /^REFLAB_202608130001_POST_DDL_FORENSIC_FAIL\n/);
  assert.doesNotMatch(stderr, /password|postgresql:|example[.]invalid/i);
});

test("formatter refuses secret-bearing structured fields", () => {
  const output = formatCanonicalTrainingForensicFailure(
    new ReadOnlyForensicFailure("postgresql://unsafe", "password", "secret", {
      queryId: "postgresql://unsafe", stderrClass: "password",
    }),
  );
  assert.doesNotMatch(output, /unsafe|password|secret|postgresql:/i);
});

test("CLI happy path emits safe JSON only", async () => {
  let stdout = "";
  const exitCode = await runProductionCanonicalTrainingPostDdlForensicCli({}, {
    run: () => ({ format: "REFLAB_202608130001_POST_DDL_FORENSIC_V1",
      classification: "A. POST_STATE_EXACT_DIAGNOSTIC_FALSE_NEGATIVE" }),
    writeStdout: (value) => { stdout += value; },
    writeStderr: () => { throw new Error("unexpected stderr"); },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /POST_STATE_EXACT_DIAGNOSTIC_FALSE_NEGATIVE/);
});

test("protected migration and Production DDL runner remain byte-identical", async () => {
  const { createHash } = await import("node:crypto");
  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  assert.equal(sha256(Buffer.from(trainingMigration)),
    "c2239f6ae55e220579c4cc3489c9fbe2f2b63114b63f6980cfd001feab30fc59");
  assert.equal(sha256(Buffer.from(productionRunner)),
    "43dc37fada5261cccfa247c0318c5a4899d0e2122944bc3a33d397d74a895bd2");
});

test("catalog query exposes safe metadata but never a function body", () => {
  assert.equal(CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID,
    "phase2b_canonical_training_attempts_forensic_catalog");
  assert.doesNotMatch(forensicSource, /source_base64[^\n]*JSON[.]stringify/);
  assert.doesNotMatch(forensicSource, /JSON[.]stringify\((?:process[.]env|environment|connectionEnvironment)\)/);
  assert.doesNotMatch(forensicSource, /select\s+[*]\s+from\s+public[.]/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
  ADMIN_CANONICAL_ACCESS_FUNCTIONS,
  ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
  ADMIN_CANONICAL_ACCESS_POLICIES,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_JSONB_TEXT_ACL,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_FORENSIC_CATALOG_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_FORENSIC_OPERATION,
  buildAdminCanonicalAccessForensicCatalogBatch,
  classifyAdminCanonicalAccessPostDdlForensic,
  runProductionAdminCanonicalAccessPostDdlForensic,
  runProductionAdminCanonicalAccessPostDdlForensicCli,
} from "./run-production-phase2b-admin-canonical-access-post-ddl-forensic.mjs";
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
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(resolve(root,
  "supabase/migrations/202608110001_canonical_admin_user_access.sql"), "utf8");
const helperMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"), "utf8");
const helperSource = helperMigration.match(/as \$function\$([\s\S]*?)\$function\$;/i)?.[1] ?? "";
const sidecarMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310004_production_adoption_semantic_audit.sql"), "utf8");
const sidecarSource = sidecarMigration
  .match(/as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i)?.[1] ?? "";
const source = readFileSync(resolve(import.meta.dirname,
  "run-production-phase2b-admin-canonical-access-post-ddl-forensic.mjs"), "utf8");

function functionSource(name) {
  return migration.match(new RegExp(
    `create function public\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`, "i",
  ))?.[1] ?? "";
}

function postPayload() {
  return {
    checks: {
      sessionExact: true, installerCanGrantPublicExact: true, rlsOwnerExact: true,
      dependenciesExact: true, historicalFingerprintsExact: true, ledgerExact: true,
      schemaStateEmpty: true, canonicalMarkerAbsent: true, developmentObjectsAbsent: true,
      canonicalJsonbTextCatalogExact: true, prerequisiteAbsent: true,
      trainingProviderAbsent: true, communicationProviderAbsent: true,
      canonicalPayloadHashAbsent: true, laterAdoptionAbsent: true,
      adminFunctionsStateExact: true, adminPoliciesStateExact: true,
      adminSchemaPrivilegesStateExact: true, adminTablePrivilegesAbsent: true,
      adminColumnPrivilegesStateExact: true, rlsOwnerCreateAbsent: true,
    },
    helper_source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    helper_acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    functions: ADMIN_CANONICAL_ACCESS_FUNCTIONS.map((entry) => ({
      name: entry.name,
      identity_arguments: entry.identity_arguments,
      result_type: "jsonb", language_name: "plpgsql", volatility: "v",
      strict_mode: false, security_definer: true, leakproof: false, function_kind: "f",
      owner_name: "reflab_rls_owner", configuration: ["search_path=pg_catalog"],
      source_base64: Buffer.from(functionSource(entry.name), "utf8").toString("base64"),
    })),
    function_acl: ADMIN_CANONICAL_ACCESS_FUNCTION_ACL.map((entry) => ({ ...entry })),
    policies: ADMIN_CANONICAL_ACCESS_POLICIES.map((entry) => ({ ...entry })),
    schema_acl: ADMIN_CANONICAL_ACCESS_SCHEMA_ACL.map((entry) => ({ ...entry })),
    table_acl: [],
    column_acl: ADMIN_CANONICAL_ACCESS_COLUMN_ACL.map((entry) => ({ ...entry })),
    counts: { attempts: 37, exam_results: 6, notification_events: 60, ledger: 3, schema_state: 0 },
  };
}

function results(payload = postPayload()) {
  const memberships = ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
  return new Map([
    [installerIdentityQuery.id, {
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
        rolname: "reflab_preflight_audit_owner",
        ...ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
      },
      memberships,
      membership_summary: {
        total_count: memberships.length,
        as_member_count: memberships.filter((entry) => entry.member_role === "postgres").length,
        as_granted_role_count: memberships.filter((entry) => entry.granted_role === "postgres").length,
      },
      database: { name: "postgres", owner: "postgres", postgres_has_create: true },
      schemas: [],
    }],
    [phase1ProductFingerprintQuery.id, { attempts: 37, exam_results: 6, notification_events: 60 }],
    [phase2aSemanticAuditPostQuery.id, {
      caller: "postgres", session_user: "postgres", transaction_read_only: "on",
      server_version_num: 170011,
      checks: Object.fromEntries(PHASE2A_SEMANTIC_AUDIT_POST_CHECKS
        .map((name) => [name, true])),
      counts: { policies: 58, column_grants: 100, effective_select_columns: 100,
        ledger_rows: 3, schema_state_rows: 0 },
      function_source_base64: Buffer.from(sidecarSource, "utf8").toString("base64"),
    }],
    [ADMIN_CANONICAL_ACCESS_POST_QUERY_ID, payload],
  ]);
}

function catalogPayload() {
  return {
    functions: ADMIN_CANONICAL_ACCESS_FUNCTIONS.map(({ name }) => ({
      name, raw_acl: [`reflab_rls_owner=X/reflab_rls_owner`, `service_role=X/reflab_rls_owner`],
    })),
    public_schema: {
      owner: "pg_database_owner", direct_owner: false, effective_owner: true,
      raw_acl: ["pg_database_owner=UC/pg_database_owner", "=U/pg_database_owner"],
    },
    public_schema_acl: [],
  };
}

test("exact post-state is classified as a diagnostic false negative", () => {
  const output = classifyAdminCanonicalAccessPostDdlForensic(results(), catalogPayload());
  assert.equal(output.classification, "A. POST_STATE_EXACT_DIAGNOSTIC_FALSE_NEGATIVE");
  assert.equal(output.postState, "EXACT");
  assert.equal(output.preStateInterpretation,
    "PRE_STATE_FALSE_IS_EXPECTED_AFTER_PROVIDER_INSTALLATION");
  assert.ok(output.observed.functions.every((entry) => entry.exists === true));
  assert.deepEqual(output.differences, []);
});

test("function ACL drift is reported as individual missing and unexpected entries", () => {
  const payload = postPayload();
  payload.function_acl[0] = { ...payload.function_acl[0], grantor: "postgres" };
  const output = classifyAdminCanonicalAccessPostDdlForensic(results(payload), catalogPayload());
  const difference = output.differences.find((entry) => entry.area === "FUNCTION_ACL");
  assert.equal(difference.delta.missing.length, 1);
  assert.equal(difference.delta.unexpected.length, 1);
  assert.equal(output.security.productionExposureIncreased, false);
});

test("PUBLIC function EXECUTE is classified as increased exposure", () => {
  const payload = postPayload();
  payload.function_acl.push({ routine: ADMIN_CANONICAL_ACCESS_FUNCTIONS[0].name,
    grantee: "PUBLIC", grantor: "reflab_rls_owner", privilege_type: "EXECUTE",
    is_grantable: false });
  const output = classifyAdminCanonicalAccessPostDdlForensic(results(payload), catalogPayload());
  assert.equal(output.classification, "C. COMMITTED_PARTIAL_OR_UNSAFE_STATE");
  assert.equal(output.security.productionExposureIncreased, true);
});

for (const [area, mutate] of [
  ["FUNCTIONS", (payload) => { payload.functions[0].owner_name = "postgres"; }],
  ["POLICIES", (payload) => { payload.policies[0].using_expression = "true"; }],
  ["SCHEMA_ACL", (payload) => { payload.schema_acl.pop(); }],
  ["COLUMN_ACL", (payload) => { payload.column_acl.pop(); }],
  ["TABLE_ACL", (payload) => { payload.table_acl.push({ schema_name: "public", table_name: "user_profiles",
    grantee: "reflab_rls_owner", grantor: "postgres", privilege_type: "SELECT", is_grantable: false }); }],
]) test(`${area} drift is reported without collapsing the delta`, () => {
  const payload = postPayload();
  mutate(payload);
  const output = classifyAdminCanonicalAccessPostDdlForensic(results(payload), catalogPayload());
  assert.ok(output.differences.some((entry) => entry.area === area));
});

test("absent mutable artifacts classify migration as not committed", () => {
  const payload = postPayload();
  payload.functions = [];
  payload.function_acl = [];
  payload.policies = [];
  payload.schema_acl = [];
  payload.column_acl = [];
  const output = classifyAdminCanonicalAccessPostDdlForensic(results(payload), {
    ...catalogPayload(), functions: [],
  });
  assert.equal(output.classification, "D. MIGRATION_NOT_COMMITTED");
  assert.equal(output.migrationCommitted, false);
  assert.ok(output.observed.functions.every((entry) => entry.exists === false));
});

test("forensic catalog batch is fixed, bounded, and read-only", () => {
  const batch = buildAdminCanonicalAccessForensicCatalogBatch();
  assert.doesNotThrow(() => assertReadOnlyBatch(batch));
  assert.match(batch, /^begin read only;/i);
  assert.match(batch, /statement_timeout/);
  assert.match(batch, /lock_timeout/);
  assert.match(batch, /transaction_read_only/);
  assert.match(batch, /rollback;\s*$/i);
  assert.doesNotMatch(batch, /\b(?:create|alter|drop|grant|revoke|comment|insert|update|delete|call)\b/i);
});

test("forensic source has no migration execution or continuation path", () => {
  assert.doesNotMatch(source,
    /executeMigration|assertAdminCanonicalAccessArtifact|db\s+push|readdir|\bglob\b/i);
  assert.doesNotMatch(source, /202608130001|202608150001|202608310006/);
  assert.match(source, /buildAdminCanonicalAccessPostBatch/);
  assert.match(source, /executeReadOnlyBatch/);
});

test("runner enforces exact operation before any read-only query", () => {
  let calls = 0;
  assert.throws(() => runProductionAdminCanonicalAccessPostDdlForensic({}, {
    argument: "wrong",
    executeReadOnly: () => { calls += 1; return new Map(); },
  }), /EXACT_202608110001_POST_DDL_FORENSIC_ARGUMENT_REQUIRED/);
  assert.equal(calls, 0);
  assert.equal(ADMIN_CANONICAL_ACCESS_FORENSIC_OPERATION,
    "--production-phase2b-admin-canonical-access-post-ddl-forensic");
});

test("runner rejects inherited PostgreSQL state before any read-only query", () => {
  let calls = 0;
  assert.throws(() => runProductionAdminCanonicalAccessPostDdlForensic({
    PGHOST: "inherited.invalid",
  }, {
    argument: ADMIN_CANONICAL_ACCESS_FORENSIC_OPERATION,
    executeReadOnly: () => { calls += 1; return new Map(); },
  }), /inherited PostgreSQL/i);
  assert.equal(calls, 0);
});

test("forensic catalog query uses only safe catalog metadata", () => {
  assert.equal(ADMIN_CANONICAL_ACCESS_FORENSIC_CATALOG_QUERY_ID,
    "phase2b_admin_canonical_access_forensic_catalog");
  assert.doesNotMatch(source, /source_base64[^\n]*JSON\.stringify|password|DB_URL/);
  assert.doesNotMatch(source, /select\s+\*\s+from\s+public\./i);
});

test("CLI failure output is bounded and never exposes connection material", async () => {
  let stderr = "";
  const exitCode = await runProductionAdminCanonicalAccessPostDdlForensicCli({}, {
    run: () => { throw new Error("postgresql://user:password@example.invalid/private"); },
    writeStdout: () => { throw new Error("unexpected stdout"); },
    writeStderr: (value) => { stderr += value; },
  });
  assert.equal(exitCode, 1);
  assert.equal(stderr, [
    "REFLAB_202608110001_POST_DDL_FORENSIC_FAIL",
    "stage=READ_ONLY_FORENSIC",
    "reason=READ_ONLY_FORENSIC_ABORTED",
    "",
  ].join("\n"));
  assert.doesNotMatch(stderr, /password|postgresql:|example\.invalid/i);
});

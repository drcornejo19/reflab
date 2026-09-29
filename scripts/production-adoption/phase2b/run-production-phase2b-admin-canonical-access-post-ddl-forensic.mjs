import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch, hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  assertRepositoryAttestation,
} from "../bootstrap/production-managed-postgres-target.mjs";
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  phase1HistoricalFingerprintExact,
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
  ADMIN_CANONICAL_ACCESS_FUNCTIONS,
  ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
  ADMIN_CANONICAL_ACCESS_POLICIES,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  assertAdminCanonicalAccessSessionPoolerTarget,
  buildAdminCanonicalAccessPostBatch,
} from "./run-production-phase2b-admin-canonical-access.mjs";
import {
  authorizeProductionAdminCanonicalAccessDiagnosticTarget,
} from "./run-production-phase2b-admin-canonical-access-read-only-diagnostic.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const ADMIN_CANONICAL_ACCESS_FORENSIC_FORMAT =
  "REFLAB_202608110001_POST_DDL_FORENSIC_V1";
export const ADMIN_CANONICAL_ACCESS_FORENSIC_OPERATION =
  "--production-phase2b-admin-canonical-access-post-ddl-forensic";
export const ADMIN_CANONICAL_ACCESS_FORENSIC_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS_POST_DDL_FORENSIC";
export const ADMIN_CANONICAL_ACCESS_FORENSIC_CATALOG_QUERY_ID =
  "phase2b_admin_canonical_access_forensic_catalog";

export const adminCanonicalAccessForensicCatalogQuery = jsonQuery(
  ADMIN_CANONICAL_ACCESS_FORENSIC_CATALOG_QUERY_ID,
  `(with target_functions as (
    select procedure.proname name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) identity_arguments,
      (select pg_catalog.array_agg(entry::text order by entry::text)
       from pg_catalog.unnest(coalesce(procedure.proacl,
         pg_catalog.acldefault('f',procedure.proowner))) entry) raw_acl
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public'
      and procedure.proname in ('admin_set_canonical_user_plan','admin_set_canonical_global_role')
  ), public_schema as (
    select namespace.oid,namespace.nspowner,owner_role.rolname owner_name,
      namespace.nspowner=(select oid from pg_catalog.pg_roles where rolname=current_user) direct_owner,
      coalesce(pg_catalog.pg_has_role(current_user,namespace.nspowner,'USAGE'),false) effective_owner,
      (select pg_catalog.array_agg(entry::text order by entry::text)
       from pg_catalog.unnest(coalesce(namespace.nspacl,
         pg_catalog.acldefault('n',namespace.nspowner))) entry) raw_acl
    from pg_catalog.pg_namespace namespace
    join pg_catalog.pg_roles owner_role on owner_role.oid=namespace.nspowner
    where namespace.nspname='public'
  ), public_schema_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from public_schema schema_state
    cross join lateral pg_catalog.aclexplode(coalesce(
      (select nspacl from pg_catalog.pg_namespace where oid=schema_state.oid),
      pg_catalog.acldefault('n',schema_state.nspowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ) select pg_catalog.json_build_object(
    'functions',coalesce((select pg_catalog.json_agg(target_functions order by name)
      from target_functions),'[]'::json),
    'public_schema',coalesce((select pg_catalog.json_build_object(
      'owner',owner_name,'direct_owner',direct_owner,'effective_owner',effective_owner,
      'raw_acl',raw_acl) from public_schema),'null'::json),
    'public_schema_acl',coalesce((select pg_catalog.json_agg(public_schema_acl
      order by grantee,grantor,privilege_type) from public_schema_acl),'[]'::json)
  ))`,
);

const functionFields = Object.freeze([
  "name", "identity_arguments", "result_type", "language_name", "volatility",
  "strict_mode", "security_definer", "leakproof", "function_kind", "owner_name",
  "configuration", "source_sha256",
]);
const functionAclFields = Object.freeze([
  "routine", "grantee", "grantor", "privilege_type", "is_grantable",
]);
const policyFields = Object.freeze([
  "schema_name", "table_name", "policy_name", "permissive", "command", "roles",
  "using_expression", "check_expression",
]);
const schemaAclFields = Object.freeze([
  "schema_name", "grantee", "grantor", "privilege_type", "is_grantable",
]);
const columnAclFields = Object.freeze([
  "schema_name", "table_name", "column_name", "grantee", "grantor",
  "privilege_type", "is_grantable",
]);

function normalizedValue(value) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value ?? "<null>");
}

function entryKey(entry, fields) {
  return fields.map((field) => normalizedValue(entry?.[field])).join("\u0000");
}

function setDelta(expected, observed, fields) {
  const expectedKeys = new Set(expected.map((entry) => entryKey(entry, fields)));
  const observedKeys = new Set(observed.map((entry) => entryKey(entry, fields)));
  return {
    missing: expected.filter((entry) => !observedKeys.has(entryKey(entry, fields))),
    unexpected: observed.filter((entry) => !expectedKeys.has(entryKey(entry, fields))),
  };
}

function sourceSha256(sourceBase64) {
  try {
    return hashFunctionSource(Buffer.from(sourceBase64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function sanitizeFunctions(payload, catalogPayload) {
  const rawAclByName = new Map((catalogPayload?.functions ?? [])
    .map((entry) => [entry.name, entry.raw_acl ?? null]));
  return (payload?.functions ?? []).map((entry) => ({
    name: entry.name,
    identity_arguments: entry.identity_arguments,
    result_type: entry.result_type,
    language_name: entry.language_name,
    volatility: entry.volatility,
    strict_mode: entry.strict_mode,
    security_definer: entry.security_definer,
    leakproof: entry.leakproof,
    function_kind: entry.function_kind,
    owner_name: entry.owner_name,
    configuration: entry.configuration,
    source_sha256: sourceSha256(entry.source_base64),
    proacl: rawAclByName.get(entry.name) ?? null,
  }));
}

function expectedFunctions() {
  return ADMIN_CANONICAL_ACCESS_FUNCTIONS.map((entry) => ({
    name: entry.name,
    identity_arguments: entry.identity_arguments,
    result_type: "jsonb",
    language_name: "plpgsql",
    volatility: "v",
    strict_mode: false,
    security_definer: true,
    leakproof: false,
    function_kind: "f",
    owner_name: "reflab_rls_owner",
    configuration: ["search_path=pg_catalog"],
    source_sha256: entry.source_hash,
  }));
}

function functionObservations(functions) {
  const byName = new Map(functions.map((entry) => [entry.name, entry]));
  return ADMIN_CANONICAL_ACCESS_FUNCTIONS.map(({ name }) => {
    const observed = byName.get(name);
    return observed ? { exists: true, ...observed } : {
      exists: false,
      name,
      identity_arguments: null,
      result_type: null,
      language_name: null,
      volatility: null,
      strict_mode: null,
      security_definer: null,
      leakproof: null,
      function_kind: null,
      owner_name: null,
      configuration: null,
      source_sha256: null,
      proacl: null,
    };
  });
}

function aclSemanticsExact(expected, observed, identityFields) {
  const fields = identityFields.filter((field) => field !== "grantor");
  const delta = setDelta(expected, observed, fields);
  return delta.missing.length === 0 && delta.unexpected.length === 0;
}

function mutableArtifactsAbsent(payload) {
  return (payload?.functions?.length ?? -1) === 0
    && (payload?.function_acl?.length ?? -1) === 0
    && (payload?.policies?.length ?? -1) === 0
    && (payload?.schema_acl?.length ?? -1) === 0
    && (payload?.column_acl?.length ?? -1) === 0;
}

export function classifyAdminCanonicalAccessPostDdlForensic(postResults, catalogPayload) {
  const installerPayload = postResults instanceof Map
    ? postResults.get(installerIdentityQuery.id) : undefined;
  const fingerprintPayload = postResults instanceof Map
    ? postResults.get(phase1ProductFingerprintQuery.id) : undefined;
  const sidecarPayload = postResults instanceof Map
    ? postResults.get(phase2aSemanticAuditPostQuery.id) : undefined;
  const payload = postResults instanceof Map
    ? postResults.get(ADMIN_CANONICAL_ACCESS_POST_QUERY_ID) : undefined;
  const installer = classifyInstallerIdentity(installerPayload);
  const adjustedSidecar = {
    ...sidecarPayload,
    checks: { ...sidecarPayload?.checks, phase2bAbsent: true },
  };
  const sidecar = classifyPhase2aSemanticAuditPost(adjustedSidecar);
  const postState = classifyAdminCanonicalAccessState(payload, { post: true });
  const functions = sanitizeFunctions(payload, catalogPayload);
  const expectedFunctionState = expectedFunctions();
  const functionDelta = setDelta(expectedFunctionState, functions, functionFields);
  const functionAclDelta = setDelta(
    ADMIN_CANONICAL_ACCESS_FUNCTION_ACL, payload?.function_acl ?? [], functionAclFields,
  );
  const policyDelta = setDelta(
    ADMIN_CANONICAL_ACCESS_POLICIES, payload?.policies ?? [], policyFields,
  );
  const schemaAclDelta = setDelta(
    ADMIN_CANONICAL_ACCESS_SCHEMA_ACL, payload?.schema_acl ?? [], schemaAclFields,
  );
  const columnAclDelta = setDelta(
    ADMIN_CANONICAL_ACCESS_COLUMN_ACL, payload?.column_acl ?? [], columnAclFields,
  );
  const differences = [
    { area: "FUNCTIONS", expected: expectedFunctionState, observed: functions,
      delta: functionDelta, likelyCause: "FUNCTION_METADATA_OWNER_SOURCE_OR_SEARCH_PATH_DRIFT" },
    { area: "FUNCTION_ACL", expected: ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
      observed: payload?.function_acl ?? [], delta: functionAclDelta,
      likelyCause: "FUNCTION_GRANTEE_GRANTOR_OR_GRANTABILITY_DRIFT" },
    { area: "POLICIES", expected: ADMIN_CANONICAL_ACCESS_POLICIES,
      observed: payload?.policies ?? [], delta: policyDelta,
      likelyCause: "POLICY_IDENTITY_ROLE_COMMAND_OR_EXPRESSION_DRIFT" },
    { area: "SCHEMA_ACL", expected: ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
      observed: payload?.schema_acl ?? [], delta: schemaAclDelta,
      likelyCause: "SCHEMA_GRANTEE_GRANTOR_OR_PRIVILEGE_DRIFT" },
    { area: "COLUMN_ACL", expected: ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
      observed: payload?.column_acl ?? [], delta: columnAclDelta,
      likelyCause: "COLUMN_GRANTEE_GRANTOR_OR_PRIVILEGE_DRIFT" },
    { area: "TABLE_ACL", expected: [], observed: payload?.table_acl ?? [],
      delta: { missing: [], unexpected: payload?.table_acl ?? [] },
      likelyCause: "UNEXPECTED_TABLE_PRIVILEGE" },
  ].filter((entry) => entry.delta.missing.length > 0 || entry.delta.unexpected.length > 0);

  const browserExecuteExposure = (payload?.function_acl ?? []).filter((entry) =>
    ["PUBLIC", "anon", "authenticated"].includes(entry.grantee)
      && entry.privilege_type === "EXECUTE");
  const serviceRoleAccessUsable = ADMIN_CANONICAL_ACCESS_FUNCTIONS.every(({ name }) =>
    (payload?.function_acl ?? []).some((entry) => entry.routine === name
      && entry.grantee === "service_role" && entry.privilege_type === "EXECUTE"));
  const requiredObjectsPresent = functions.length === 2;
  const grantorOnlyDrift = functionDelta.missing.length === 0
    && functionDelta.unexpected.length === 0
    && policyDelta.missing.length === 0 && policyDelta.unexpected.length === 0
    && (payload?.table_acl?.length ?? 0) === 0
    && aclSemanticsExact(ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
      payload?.function_acl ?? [], functionAclFields)
    && aclSemanticsExact(ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
      payload?.schema_acl ?? [], schemaAclFields)
    && aclSemanticsExact(ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
      payload?.column_acl ?? [], columnAclFields);
  const complete = payload && catalogPayload
    && Array.isArray(payload.functions) && Array.isArray(payload.function_acl)
    && Array.isArray(payload.policies) && Array.isArray(payload.schema_acl)
    && Array.isArray(payload.table_acl) && Array.isArray(payload.column_acl)
    && Array.isArray(catalogPayload.functions) && catalogPayload.public_schema
    && Array.isArray(catalogPayload.public_schema_acl);
  let classification = "E. UNKNOWN";
  if (complete && postState.classification === "EXACT"
      && installer.managedProfile === "READY"
      && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT"
      && phase1HistoricalFingerprintExact(fingerprintPayload)
      && sidecar.postState === "EXACT") {
    classification = "A. POST_STATE_EXACT_DIAGNOSTIC_FALSE_NEGATIVE";
  } else if (complete && mutableArtifactsAbsent(payload)) {
    classification = "D. MIGRATION_NOT_COMMITTED";
  } else if (complete && requiredObjectsPresent && browserExecuteExposure.length === 0
      && serviceRoleAccessUsable && grantorOnlyDrift) {
    classification = "B. COMMITTED_SAFE_BUT_CONTRACT_DRIFT";
  } else if (complete && !mutableArtifactsAbsent(payload)) {
    classification = "C. COMMITTED_PARTIAL_OR_UNSAFE_STATE";
  }

  return {
    format: ADMIN_CANONICAL_ACCESS_FORENSIC_FORMAT,
    classification,
    migrationCommitted: classification.startsWith("A.") || classification.startsWith("B.")
      || classification.startsWith("C.") ? true
      : classification.startsWith("D.") ? false : null,
    postState: postState.classification ?? "UNKNOWN",
    preStateInterpretation: requiredObjectsPresent
      ? "PRE_STATE_FALSE_IS_EXPECTED_AFTER_PROVIDER_INSTALLATION"
      : "PRE_STATE_REMAINS_RELEVANT",
    checks: payload?.checks ?? null,
    derivedChecks: postState.checks ?? null,
    observed: {
      installerManagedProfile: installer.managedProfile ?? null,
      installerLifecycleState: installer.lifecycleState ?? null,
      historicalFingerprintExact: typeof phase1HistoricalFingerprintExact(fingerprintPayload) === "boolean"
        ? phase1HistoricalFingerprintExact(fingerprintPayload) : null,
      phase2aSidecarPostState: sidecar.postState ?? null,
      counts: payload?.counts ?? null,
      functions: functionObservations(functions),
      functionAcl: payload?.function_acl ?? null,
      policies: payload?.policies ?? null,
      publicSchema: catalogPayload?.public_schema ?? null,
      publicSchemaAcl: catalogPayload?.public_schema_acl ?? null,
      contractSchemaAcl: payload?.schema_acl ?? null,
      tableAcl: payload?.table_acl ?? null,
      columnAcl: payload?.column_acl ?? null,
    },
    security: {
      productionExposureIncreased: browserExecuteExposure.length > 0,
      unexpectedBrowserExecuteEntries: browserExecuteExposure,
      serviceRoleAccessUsable,
      rlsOwnerCreateAbsent: payload?.checks?.rlsOwnerCreateAbsent ?? null,
      tableAclAbsent: Array.isArray(payload?.table_acl) ? payload.table_acl.length === 0 : null,
    },
    differences,
  };
}

export function buildAdminCanonicalAccessForensicCatalogBatch() {
  return buildSqlBatch([adminCanonicalAccessForensicCatalogQuery]);
}

export function authorizeProductionAdminCanonicalAccessForensicTarget(environment = process.env) {
  if (environment[ADMIN_CANONICAL_ACCESS_FORENSIC_OPT_IN] !== "true") {
    throw new Error("202608110001_POST_DDL_FORENSIC_NOT_AUTHORIZED");
  }
  return assertAdminCanonicalAccessSessionPoolerTarget(
    authorizeProductionAdminCanonicalAccessDiagnosticTarget(environment),
  );
}

export function runProductionAdminCanonicalAccessPostDdlForensic(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== ADMIN_CANONICAL_ACCESS_FORENSIC_OPERATION) {
    throw new Error("EXACT_202608110001_POST_DDL_FORENSIC_ARGUMENT_REQUIRED");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }));
  assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead: git(["rev-parse", "HEAD"]).trim(),
    status: git(["status", "--short"]),
  });
  const target = (dependencies.authorize
    ?? authorizeProductionAdminCanonicalAccessForensicTarget)(environment);
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const execute = (batch) => executeReadOnly(
    batch, target.connectionEnvironment, { processEnvironment: environment },
  );
  const postResults = execute(buildAdminCanonicalAccessPostBatch());
  const catalogResults = execute(buildAdminCanonicalAccessForensicCatalogBatch());
  return classifyAdminCanonicalAccessPostDdlForensic(
    postResults,
    catalogResults.get(ADMIN_CANONICAL_ACCESS_FORENSIC_CATALOG_QUERY_ID),
  );
}

export async function runProductionAdminCanonicalAccessPostDdlForensicCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run
      ?? runProductionAdminCanonicalAccessPostDdlForensic)(environment, {
        ...dependencies,
        argument,
      });
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return 0;
  } catch {
    (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))([
      "REFLAB_202608110001_POST_DDL_FORENSIC_FAIL",
      "stage=READ_ONLY_FORENSIC",
      "reason=READ_ONLY_FORENSIC_ABORTED",
      "",
    ].join("\n"));
    return 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionAdminCanonicalAccessPostDdlForensicCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}

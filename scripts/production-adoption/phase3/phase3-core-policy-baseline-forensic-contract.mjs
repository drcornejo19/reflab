import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery, INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES } from "../bootstrap/production-role-bootstrap-contract.mjs";
import { CORE_POLICY_TABLES, CORE_POLICY_QUERY_ID, corePolicyQuery, normalizeCorePolicyExpression, isRetiredCorePolicy } from "./phase3-core-policy-contract.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID, identityBridgePostQuery, identityBridgePostExact } from "./phase3-identity-security-bridge-ddl-contract.mjs";

export const CORE_BASELINE_FORENSIC_FORMAT = "REFLAB_64245_PRODUCTION_BASELINE_FORENSIC_V1";
export const CORE_BASELINE_ADOPTION_QUERY_ID = "phase3_core_policy_baseline_adoption";
export const coreBaselineAdoptionQuery = jsonQuery(CORE_BASELINE_ADOPTION_QUERY_ID, `(
  select pg_catalog.jsonb_build_object(
    'ledgerRows', (select coalesce(jsonb_agg(to_jsonb(s) order by s.phase_order),'[]'::jsonb)
      from reflab_meta.production_adoption_state s),
    'schemaStateRows', (select coalesce(jsonb_agg(to_jsonb(s) order by to_jsonb(s)::text),'[]'::jsonb)
      from reflab_meta.reflab_schema_state s),
    'canonicalMarkerAbsent', (select count(*)=0 from reflab_meta.reflab_schema_state),
    'historicalCounts', jsonb_build_object(
      'attempts',(select count(*) from public.attempts),
      'exam_results',(select count(*) from public.exam_results),
      'notification_events',(select count(*) from public.notification_events),
      'clips',(select count(*) from public.clips)),
    'developmentObjects', jsonb_build_object(
      'reflab_private.user_identity_links',to_regclass('reflab_private.user_identity_links') is not null,
      'public.resolve_development_clerk_identity(text)',to_regprocedure('public.resolve_development_clerk_identity(text)') is not null,
      'public.link_development_clerk_identity(text)',to_regprocedure('public.link_development_clerk_identity(text)') is not null,
      'public.link_development_super_admin_clerk_identity(text)',to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is not null),
    'schemaCreatePrivileges', (select jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'role',r.rolname,'create',has_schema_privilege(r.oid,n.oid,'CREATE'))
      order by n.nspname,r.rolname) from pg_namespace n cross join pg_roles r
      where n.nspname in ('public','reflab_private')
        and r.rolname in ('postgres','reflab_rls_owner','anon','authenticated'))
  )
)`);
export function buildCorePolicyBaselineForensicBatch() {
  return buildSqlBatch([installerIdentityQuery, identityBridgePostQuery, corePolicyQuery, coreBaselineAdoptionQuery]);
}
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strings = (row, keys) => record(row) && keys.every((key) => typeof row[key] === "string");
const booleans = (row, keys) => record(row) && keys.every((key) => typeof row[key] === "boolean");
const rows = (v, predicate) => Array.isArray(v) && v.every(predicate);
const textOrNull = (v) => v === null || typeof v === "string";
const select = (row, fields) => Object.fromEntries(fields.map((key) => [key, row[key]]));
const tableFields = ["schema", "table", "owner", "rls", "force", "installer_authority"];
const policyFields = ["oid", "schema", "table", "name", "command", "permissive", "roles", "using", "withCheck"];
const aclFields = ["table", "grantee", "grantor", "privilege", "grantable"];
const functionFields = ["signature", "identity_arguments", "result_type", "language", "volatility", "strict",
  "security_definer", "leakproof", "kind", "owner", "configuration", "proacl", "source_hash"];
const signatures = ["reflab_private.request_user_id()", "reflab_private.is_super_admin()",
  ...["institution", "platform", "reflab"].map((p) => `public.${p}_request_user_id()` )];
const policyKey = (p) => `${p.table}.${p.name}`;
const matrix = new Map(PHASE3_POLICY_MATRIX.map((p) => [policyKey(p), p]));
const stable = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function expressionClass(policy, expected) {
  if (!expected) return "NOT_TARGETED";
  const equal = (historical) => ["using", "withCheck"].every((key) =>
    normalizeCorePolicyExpression(policy[key], historical) === normalizeCorePolicyExpression(expected[key]));
  if (equal(false)) return "CANONICAL_EXPRESSION";
  return equal(true) ? "RECOGNIZED_HISTORICAL_EXPRESSION" : "UNRECOGNIZED_EXPRESSION";
}

// Completion attests collection, not the acceptability of the observed policy/ACL state.
export function classifyCorePolicyBaselineObservation(results, { targetExact = false } = {}) {
  const e = results instanceof Map ? results : new Map();
  const p = e.get(CORE_POLICY_QUERY_ID);
  const identity = e.get(IDENTITY_BRIDGE_POST_QUERY_ID);
  const adoption = e.get(CORE_BASELINE_ADOPTION_QUERY_ID);
  const installer = e.get(INSTALLER_IDENTITY_QUERY_ID);
  const tableShape = rows(p?.tables, (r) => strings(r, ["schema", "table", "owner"])
    && booleans(r, ["rls", "force", "installer_authority"]));
  const policyShape = rows(p?.policies, (r) => strings(r, ["schema", "table", "name", "command"])
    && r.schema === "public" && CORE_POLICY_TABLES.includes(r.table)
    && /^[1-9][0-9]*$/.test(String(r.oid)) && typeof r.permissive === "boolean"
    && rows(r.roles, (v) => typeof v === "string") && textOrNull(r.using) && textOrNull(r.withCheck));
  const aclShape = (r) => strings(r, ["table", "grantee", "grantor", "privilege"])
    && CORE_POLICY_TABLES.includes(r.table) && typeof r.grantable === "boolean";
  const functions = identity?.functions ?? [];
  const functionAcls = identity?.acl ?? [];
  const identityShape = record(identity) && Object.hasOwn(identity, "functions") && Object.hasOwn(identity, "acl")
    && rows(functions, (f) => strings(f, ["signature", "identity_arguments", "result_type", "language", "volatility", "kind", "owner", "source_hash"])
      && /^[a-f0-9]{64}$/.test(f.source_hash) && booleans(f, ["strict", "security_definer", "leakproof"])
      && signatures.includes(f.signature)
      && (f.configuration === null || rows(f.configuration, (s) => typeof s === "string"))
      && (f.proacl === null || rows(f.proacl, (s) => typeof s === "string")))
    && rows(functionAcls, (a) => strings(a, ["signature", "grantee", "grantor", "privilege"]) && typeof a.grantable === "boolean")
    && typeof identity.rls_owner_create === "boolean";
  const adoptionShape = record(adoption) && rows(adoption.ledgerRows, record) && rows(adoption.schemaStateRows, record)
    && typeof adoption.canonicalMarkerAbsent === "boolean"
    && ["attempts", "exam_results", "notification_events", "clips"].every((k) => Number.isSafeInteger(adoption.historicalCounts?.[k]) && adoption.historicalCounts[k] >= 0)
    && record(adoption.developmentObjects) && Object.keys(adoption.developmentObjects).length === 4
    && Object.values(adoption.developmentObjects).every((v) => typeof v === "boolean")
    && rows(adoption.schemaCreatePrivileges, (r) => strings(r, ["schema", "role"]) && typeof r.create === "boolean")
    && adoption.schemaCreatePrivileges.length === 8
    && ["public", "reflab_private"].every((schema) => ["postgres", "reflab_rls_owner", "anon", "authenticated"].every((role) =>
      adoption.schemaCreatePrivileges.filter((r) => r.schema === schema && r.role === role).length === 1));
  const checks = {
    targetExact: targetExact === true,
    transactionReadOnly: e.get("read_only_guard") === "on",
    managedInstallerExact: installer?.caller === "postgres" && installer?.session_user === "postgres"
      && installer?.database?.name === "postgres" && Math.floor(installer?.server_version_num / 10000) === 17
      && installer?.installer?.rolname === "postgres"
      && Object.entries(ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES).every(([k, v]) => installer.installer[k] === v),
    tableEvidenceComplete: tableShape,
    tenTablesPresent: tableShape && p.tables.length === 10 && CORE_POLICY_TABLES.every((t) => p.tables.filter((r) => r.schema === "public" && r.table === t).length === 1),
    policyEvidenceComplete: policyShape,
    tableAclEvidenceComplete: rows(p?.table_acl, aclShape),
    columnAclEvidenceComplete: rows(p?.column_acl, (r) => aclShape(r) && typeof r.column === "string"),
    identityEvidenceComplete: identityShape,
    adoptionEvidenceComplete: adoptionShape,
    boundaryEvidenceComplete: booleans(p, ["phase4Absent", "cutoverAbsent", "runtimeDisabled"]),
    fingerprintEvidenceComplete: ["productFingerprint", "protectedObjectsHash"].every((k) => /^[a-f0-9]{32}$/.test(p?.[k] ?? "")),
  };
  const failedChecks = Object.keys(checks).filter((k) => checks[k] !== true);
  const policies = policyShape ? stable(p.policies.map((row) => ({ ...select(row, policyFields), roles: [...row.roles].sort() }))) : [];
  const targetPolicies = policies.filter((r) => matrix.has(policyKey(r))).map((r) => ({ ...r,
    label: "TARGET_SLOT_CANDIDATE", intendedEffect: "DROP_REPLACE", expressionClass: expressionClass(r, matrix.get(policyKey(r))) }));
  const missingTargetSlots = PHASE3_POLICY_MATRIX.filter((r) => !targetPolicies.some((p) => policyKey(p) === policyKey(r)))
    .map((r) => ({ table: r.table, command: r.command, policyName: r.name, observation: "MISSING", intendedEffect: "CREATE" }));
  return {
    format: CORE_BASELINE_FORENSIC_FORMAT, classification: failedChecks.length ? "BLOCKER" : "OBSERVATION_COMPLETE",
    targetExact: checks.targetExact, transactionReadOnly: checks.transactionReadOnly,
    checks, failedChecks, unknownChecks: failedChecks.filter((k) => /EvidenceComplete$/.test(k)),
    predecessor64236State: { comparison: identityShape && identityBridgePostExact(identity) ? "EXACT" : "NOT_EXACT_OR_INCOMPLETE",
      functionPresence: signatures.map((signature) => ({ signature, present: identityShape && functions.some((f) => f.signature === signature) })),
      functions: identityShape ? stable(functions.map((f) => select(f, functionFields))) : [],
      executeAcl: identityShape ? stable(functionAcls.map((a) => select(a, ["signature", "grantee", "grantor", "privilege", "grantable"]))) : [],
      rlsOwnerSchemaCreate: identityShape ? identity.rls_owner_create : null,
      schemaCreatePrivileges: adoptionShape ? stable(adoption.schemaCreatePrivileges) : [] },
    adoptionState: adoptionShape ? { ledgerRows: adoption.ledgerRows, schemaStateRows: adoption.schemaStateRows,
      schemaStateRowCount: adoption.schemaStateRows.length, canonicalMarkerAbsent: adoption.canonicalMarkerAbsent,
      runtimeDisabled: p?.runtimeDisabled ?? null, cutoverAbsent: p?.cutoverAbsent ?? null,
      phase4Absent: p?.phase4Absent ?? null, developmentObjects: adoption.developmentObjects } : null,
    historicalState: adoptionShape ? { counts: adoption.historicalCounts,
      productFingerprint: p?.productFingerprint ?? null, protectedObjectsHash: p?.protectedObjectsHash ?? null } : null,
    tableSecurityInventory: tableShape ? stable(p.tables.map((r) => select(r, tableFields))) : [],
    targetPolicyInventory: [...targetPolicies, ...missingTargetSlots],
    nonTargetPolicyInventory: policies.filter((r) => !matrix.has(policyKey(r))).map((r) => ({ ...r, label: "NON_TARGET",
      intendedEffect: isRetiredCorePolicy(r) ? "RETIRE_IF_EXACT_APPROVED_PRE" : "PRESERVE" })),
    tableAclInventory: checks.tableAclEvidenceComplete ? stable(p.table_acl.map((r) => ({ ...select(r, aclFields), object: `public.${r.table}` }))) : [],
    columnAclInventory: checks.columnAclEvidenceComplete ? stable(p.column_acl.map((r) => ({ ...select(r, [...aclFields, "column"]), object: `public.${r.table}.${r.column}` }))) : [],
    targetedObservedPolicies: targetPolicies.length, missingTargetSlots,
    nonTargetPolicies: policies.length - targetPolicies.length,
    approval: "NOT_PERFORMED", mutationCount: 0,
  };
}

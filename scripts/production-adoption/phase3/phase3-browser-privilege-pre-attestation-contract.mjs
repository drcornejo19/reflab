import { BROWSER_TRANSITION_BASELINE as baseline, BROWSER_TRANSITION_BASELINE_DIGEST } from "./phase3-browser-privilege-production-baseline.mjs";
import { classifyBrowserTransition, classifyLocalBrowserTransition, canonicalBrowserBaseline,
  expandBrowserBaselineAcls, browserExpectedPostAcls, BROWSER_MIGRATION_PATH, BROWSER_MIGRATION_SHA } from "./phase3-browser-privilege-contract.mjs";
import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, browserPrePrivileges, browserPostPrivileges } from "./phase3-browser-privilege-matrix.mjs";

export const BROWSER_PRE_FORMAT = "REFLAB_20260901064249_CURRENT_PRODUCTION_PRE_ATTESTATION_V1";
export const BROWSER_PRE_ARTIFACTS = Object.freeze({
  [BROWSER_MIGRATION_PATH]: BROWSER_MIGRATION_SHA,
  "scripts/production-adoption/phase3/phase3-browser-privilege-production-baseline.mjs": "910756fea6221bb7b7d28eac7b06192191831c545318e2ef8ef3d3c22259c2fa",
  "scripts/production-adoption/phase3/phase3-browser-privilege-contract.mjs": "36b24a064bcf80ed89698d38c151350bc8819c6b99fec6cb2f614b6979e1f5bc",
  "scripts/production-adoption/phase3/phase3-security-contract.mjs": "ac456680b924a30aba0df10afb1515da045854c6ae5f9aff904412fbeac92bed",
  "scripts/production-adoption/phase3/phase3-browser-privilege-matrix.mjs": "450f2c85e32b4a528dd68179845d4955a1e99f42fbb532650dbd0cf0e4163943",
  "scripts/production-adoption/phase3/phase3-browser-privilege-baseline-forensic-contract.mjs": "0918af6e56f9adb6ca6625d11be2224516c43b67463332389cabecc04fbbe66c",
  "scripts/production-adoption/phase3/run-production-browser-privilege-baseline-forensic.mjs": "b45e4693557feacdfef67861c2b8a28e13b0d59f933dbf00e5e346b47806b323",
});
export const BROWSER_PRE_VERIFICATION_CHECKS = Object.freeze([
  "approvedHeadExact", "migrationArtifactExact", "baselineArtifactExact", "baselineDigestExact",
  "classifierExact", "sharedSecurityContractExact", "observationCodeExact", "targetExact",
]);
const equal = (a, b) => a !== undefined && b !== undefined
  && JSON.stringify(canonicalBrowserBaseline(a)) === JSON.stringify(canonicalBrowserBaseline(b));
const safeRows = (rows) => Array.isArray(rows) ? rows : [];
const browserAcl = (rows) => safeRows(rows).filter((r) => ["anon", "authenticated", "PUBLIC"].includes(r.grantee));
const infrastructureAcl = (rows) => safeRows(rows).filter((r) => !["anon", "authenticated"].includes(r.grantee));
function effectiveRoleExact(observation, role, post, privileges = PG17_TABLE_PRIVILEGES) {
  const rows = safeRows(observation?.effectiveBrowserPrivileges);
  return rows.filter((r) => r.role === role).length === BROWSER_TABLES.length * PG17_TABLE_PRIVILEGES.length
    && BROWSER_TABLES.every((table) => privileges.every((privilege) => {
      const found = rows.filter((r) => r.schema === "public" && r.table === table && r.role === role && r.privilege === privilege);
      return found.length === 1 && found[0].granted === (post ? browserPostPrivileges : browserPrePrivileges)(table, role).includes(privilege);
    }));
}
function buildReport(observation, verification, transition) {
  const before = expandBrowserBaselineAcls(), after = browserExpectedPostAcls();
  const adoption = observation?.adoptionState;
  const common = {
    ...Object.fromEntries(BROWSER_PRE_VERIFICATION_CHECKS.map((k) => [k, verification?.[k] === true])),
    transactionReadOnly: observation?.transactionReadOnly === true,
    collectionExact: transition.checks.collectionExact === true,
    "64236Exact": transition.checks.identity64236Exact === true,
    "64245PostExact": transition.checks.core64245Exact === true,
    tableSecurityExact: transition.checks.tableSecurityExact === true,
    columnsExact: transition.checks.columnsExact === true,
    policyCatalogExact: transition.checks.policyCatalogExact === true,
    serviceRolePreservedExact: equal(safeRows(observation?.tableAcls).filter((r) => r.grantee === "service_role"), before.filter((r) => r.grantee === "service_role"))
      && equal(safeRows(observation?.columnAcls).filter((r) => r.grantee === "service_role"), baseline.columnAcls.filter((r) => r.grantee === "service_role")),
    auditInfrastructureExact: equal(infrastructureAcl(observation?.tableAcls), infrastructureAcl(before))
      && equal(infrastructureAcl(observation?.columnAcls), infrastructureAcl(baseline.columnAcls)),
    ledgerExact: equal(adoption?.ledgerRows, baseline.adoption.ledgerRows),
    schemaStateEmpty: equal(adoption?.schemaStateRows, []) && adoption?.schemaStateRowCount === 0,
    markerAbsent: adoption?.canonicalMarkerAbsent === true,
    developmentObjectsAbsent: equal(adoption?.developmentObjects, baseline.adoption.developmentObjects),
    historicalFingerprintsExact: transition.checks.historicalExact === true,
    runtimeDisabled: adoption?.runtimeDisabled === true,
    cutoverAbsent: adoption?.cutoverAbsent === true,
    phase4Absent: adoption?.phase4Absent === true,
    adoptionExact: transition.checks.adoptionExact === true,
    preVsPostClassificationUnique: transition.executablePre === true
      || transition.classification === "64249_ALREADY_INSTALLED_POST",
  };
  const pre = {
    anonPreExact: effectiveRoleExact(observation, "anon", false),
    authenticatedPreExact: effectiveRoleExact(observation, "authenticated", false),
    maintainPreExact: ["anon", "authenticated"].every((role) => effectiveRoleExact(observation, role, false, ["MAINTAIN"])),
    rawBrowserAclExact: equal(browserAcl(observation?.tableAcls), browserAcl(before)),
    effectiveBrowserAclExact: transition.preChecks.effectiveTableAclExact === true,
    columnAclPreExact: transition.preChecks.rawColumnAclExact === true && transition.preChecks.effectiveColumnAclExact === true,
    refereeExamSessionsPreExact: equal(safeRows(observation?.tableAcls).filter((r) => r.table === "referee_exam_sessions"), before.filter((r) => r.table === "referee_exam_sessions"))
      && equal(safeRows(observation?.policies).filter((r) => r.table === "referee_exam_sessions").map(({oid: _oid, label: _label, ...p}) => { void _oid; void _label; return p; }), baseline.policies.filter((r) => r.table === "referee_exam_sessions")),
    completePreAclExact: Object.values(transition.preChecks).every((v) => v === true),
  };
  const post = {
    anonPostExact: effectiveRoleExact(observation, "anon", true),
    authenticatedPostExact: effectiveRoleExact(observation, "authenticated", true),
    rawPostAclExact: equal(observation?.tableAcls, after.tableAcls),
    columnAclPostExact: transition.postChecks.rawColumnAclExact === true && transition.postChecks.effectiveColumnAclExact === true,
    completePostAclExact: Object.values(transition.postChecks).every((v) => v === true),
  };
  const installed = transition.classification === "64249_ALREADY_INSTALLED_POST";
  const checks = { ...common, ...pre, ...post };
  // PRE-only checks are deliberately false in installed POST, not POST failures.
  const applicable = { ...common, ...(installed ? post : pre) };
  const failedChecks = Object.keys(applicable).filter((k) => applicable[k] !== true);
  const unknownChecks = [...new Set(safeRows(observation?.unknownChecks).filter((k) => typeof k === "string").map((k) => `collection.${k}`))].sort();
  const exact = failedChecks.length === 0 && unknownChecks.length === 0;
  const classification = exact && transition.classification === "64249_PRE_EXECUTABLE_EXACT" ? "64249_PRE_EXECUTABLE_EXACT"
    : exact && installed ? "64249_ALREADY_INSTALLED_POST" : "BLOCKER";
  return {
    format: BROWSER_PRE_FORMAT, classification, executablePre: classification === "64249_PRE_EXECUTABLE_EXACT",
    checkCount: Object.keys(checks).length, checks, failedChecks, unknownChecks,
    checkApplicability: { common: Object.keys(common), pre: Object.keys(pre), post: Object.keys(post), evaluatedState: installed ? "POST" : "PRE" },
    approvedHead: verification?.approvedHead ?? null,
    artifact: { path: BROWSER_MIGRATION_PATH, sha256: BROWSER_MIGRATION_SHA },
    baseline: { version: baseline.version, digest: BROWSER_TRANSITION_BASELINE_DIGEST,
      approvalScope: baseline.approvalScope, committedArtifactVerified: BROWSER_PRE_VERIFICATION_CHECKS.every((k) => verification?.[k] === true) },
    target: { project: baseline.project, hostCategory: "APPROVED_SESSION_POOLER", database: "postgres", installer: "postgres.nagjddldrldwavmfaytc" },
    transactionReadOnly: common.transactionReadOnly, transaction: "ROLLBACK",
    predecessorState: { "64236": observation?.["64236State"] ?? null, "64245": observation?.["64245PostState"] ?? null },
    browserPrivilegeState: { tables: observation?.tables ?? [], rawAcls: observation?.tableAcls ?? [], effectivePrivileges: observation?.effectiveBrowserPrivileges ?? [] },
    columnPrivilegeState: { rawAcls: observation?.columnAcls ?? [], effectivePrivileges: observation?.effectiveBrowserColumnPrivileges ?? [] },
    policyState: { policies: observation?.policies ?? [], count: safeRows(observation?.policies).length, exact: common.policyCatalogExact },
    adoptionState: adoption ?? null, historicalState: observation?.historicalState ?? null,
    boundaryState: { runtimeDisabled: common.runtimeDisabled, cutoverAbsent: common.cutoverAbsent, phase4Absent: common.phase4Absent },
    historicalEvidence: transition.historicalEvidence, mutationCount: 0, migrationInvocationCount: 0,
    productionDdlAuthorized: false, reexecutionRefused: installed,
    "64249_SCOPE": "BROWSER_PRIVILEGE_RECONCILIATION_ONLY", GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE",
    SEPARATE_SERVICE_ROLE_PRIVILEGE_WAVE_REQUIRED: "YES", TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES",
    RUNTIME_ENABLEMENT_BLOCKED_BY_FINAL_PRIVILEGE_WAVE: "YES", "64253_INDEPENDENT_REVIEW_REQUIRED": "YES",
  };
}
export function classifyBrowserPreAttestation(observation, verification) {
  return buildReport(observation, verification, classifyBrowserTransition(observation));
}
export function browserPreFailureReport(diagnostic = {}) {
  const report = classifyBrowserPreAttestation(undefined, {});
  return { ...diagnostic, ...report, target: null, transactionReadOnly: null, transaction: "NOT_OPENED_OR_ROLLED_BACK_ON_SESSION_CLOSE",
    failedChecks: ["authorizationOrCollectionFailed"], unknownChecks: Object.keys(report.checks) };
}
// Only the disposable PG17 harness may substitute synthetic row/OID fingerprints.
export function classifyLocalBrowserPreAttestation(observation, verification, proof) {
  return { ...buildReport(observation, verification, classifyLocalBrowserTransition(observation, proof)), fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY" };
}

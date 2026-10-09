import { PG17_TABLE_PRIVILEGES, browserPostPrivileges } from "./phase3-browser-privilege-matrix.mjs";
export const PHASE3_PLAN_VERSION = "production_security_reconciliation_v1";

export const PHASE3_SOURCE_HASH_CONTRACT =
  "SHA-256 of function source after removing ASCII/POSIX whitespace only from both outer edges";

export function normalizePhase3FunctionSource(source) {
  return String(source).replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, "");
}

export const PHASE3_MIGRATIONS = Object.freeze([
  "20260901064236_production_adoption_identity_security_bridge.sql",
  "20260901064245_production_adoption_core_policy_reconciliation.sql",
  "20260901064249_production_adoption_browser_privilege_reconciliation.sql",
]);

export const PHASE3_CLASSIFICATIONS = Object.freeze([
  "canonical_missing",
  "canonical_contract_drift",
  "legacy_required_temporarily",
  "legacy_safe_to_remove",
  "development_forbidden",
  "adoption_temporary",
  "unknown_requires_evidence",
]);

export const PHASE3_DEVELOPMENT_RPCS = Object.freeze([
  "public.resolve_development_clerk_identity(text)",
  "public.link_development_clerk_identity(text)",
  "public.link_development_super_admin_clerk_identity(text)",
]);

export const PHASE3_LEGACY_IDENTITY_HELPERS = Object.freeze([
  {
    signature: "public.institution_request_user_id()",
    sourceHash: "d035c5365d2bef99fa241696564a74587dd47635005771c54731b8c76132edc1",
    owner: "postgres",
    security: "INVOKER",
    searchPath: null,
    callerSource: "202607160001_institutional_multitenant_foundation.sql",
    replacement: "reflab_private.request_user_id()",
    decision: "legacy_required_temporarily",
    executeRoles: ["authenticated", "service_role"],
  },
  {
    signature: "public.platform_request_user_id()",
    sourceHash: "d035c5365d2bef99fa241696564a74587dd47635005771c54731b8c76132edc1",
    owner: "postgres",
    security: "INVOKER",
    searchPath: null,
    callerSource: "202607240001/202607240002 access-control policies and helpers",
    replacement: "reflab_private.request_user_id()",
    decision: "legacy_required_temporarily",
    executeRoles: ["authenticated", "service_role"],
  },
  {
    signature: "public.reflab_request_user_id()",
    sourceHash: "d035c5365d2bef99fa241696564a74587dd47635005771c54731b8c76132edc1",
    owner: "postgres",
    security: "INVOKER",
    searchPath: null,
    callerSource: "Production-only object; privileged caller inventory still required",
    replacement: "reflab_private.request_user_id()",
    decision: "unknown_requires_evidence",
    executeRoles: ["authenticated", "service_role"],
  },
]);

const ownedRead = (table) => ({
  table,
  name: `${table}_own_read`,
  command: "SELECT",
  roles: ["authenticated"],
  permissive: true,
  using: "user_id = reflab_private.request_user_id() or reflab_private.is_super_admin()",
  withCheck: null,
  classification: "canonical_contract_drift",
  decision: "REPLACE",
});

const ownedInsert = (table) => ({
  table,
  name: `${table}_own_insert`,
  command: "INSERT",
  roles: ["authenticated"],
  permissive: true,
  using: null,
  withCheck: "user_id = reflab_private.request_user_id()",
  classification: "canonical_contract_drift",
  decision: "REPLACE",
});

const ownedUpdate = (table) => ({
  table,
  name: `${table}_own_update`,
  command: "UPDATE",
  roles: ["authenticated"],
  permissive: true,
  using: "user_id = reflab_private.request_user_id()",
  withCheck: "user_id = reflab_private.request_user_id()",
  classification: "canonical_contract_drift",
  decision: "REPLACE",
});

const ownedReadWriteTables = Object.freeze([
  "user_profiles",
  "match_preparations",
  "post_match_reviews",
  "psychology_checkins",
  "psychology_wellbeing_assessments",
  "psychology_exercise_sessions",
]);

const serverWriteTables = Object.freeze([
  "attempts",
  "exam_results",
  "rules_exam_results",
  "notification_events",
]);

export const PHASE3_POLICY_MATRIX = Object.freeze([
  ...ownedReadWriteTables.flatMap((table) => [ownedRead(table), ownedInsert(table), ownedUpdate(table)]),
  ...serverWriteTables.map(ownedRead),
]);

const browserPrivileges = PG17_TABLE_PRIVILEGES;

function grantDecision(table, role, contract) {
  return browserPrivileges.map((privilege) => ({
    object: `public.${table}`,
    role,
    privilege,
    source: "explicit_or_default_acl_requires_catalog_confirmation",
    canonicalExpected: contract.canonical.includes(privilege),
    runtimeCaller: contract.keep.includes(privilege) ? contract.caller : null,
    decision: contract.keep.includes(privilege)
      ? contract.canonical.includes(privilege) ? "canonical_missing" : "legacy_required_temporarily"
      : "legacy_safe_to_remove",
    migrationPhase: "pre_cutover_security",
  }));
}

const authenticatedGrantContracts = Object.freeze({
  user_profiles: { keep: ["SELECT"], canonical: ["SELECT"], caller: "profile table read; writes are column-scoped" },
  user_global_roles: { keep: ["SELECT"], canonical: ["SELECT"], caller: "canonical access snapshot" },
  user_subscriptions: { keep: ["SELECT"], canonical: ["SELECT"], caller: "canonical access snapshot" },
  attempts: { keep: ["SELECT"], canonical: ["SELECT"], caller: "canonical browser read; inserts are server/RPC-only" },
  exam_results: { keep: ["SELECT"], canonical: ["SELECT"], caller: "canonical browser read; inserts are server-only" },
  rules_exam_results: { keep: ["SELECT"], canonical: ["SELECT"], caller: "canonical browser read; inserts are server-only" },
  referee_exam_sessions: { keep: ["SELECT"], canonical: ["SELECT"], caller: "SELECT ACL reserved; browser policy absent at 64249" },
  notification_events: { keep: ["SELECT"], canonical: ["SELECT"], caller: "canonical notification read" },
  match_preparations: { keep: ["SELECT", "INSERT", "UPDATE"], canonical: ["SELECT", "INSERT", "UPDATE"], caller: "canonical owned browser flow" },
  post_match_reviews: { keep: ["SELECT", "INSERT", "UPDATE"], canonical: ["SELECT", "INSERT", "UPDATE"], caller: "canonical owned browser flow" },
  psychology_checkins: { keep: ["SELECT", "INSERT", "UPDATE"], canonical: ["SELECT", "INSERT", "UPDATE"], caller: "canonical owned browser flow" },
  psychology_wellbeing_assessments: { keep: ["SELECT", "INSERT", "UPDATE"], canonical: ["SELECT", "INSERT", "UPDATE"], caller: "canonical owned browser flow" },
  psychology_exercise_sessions: { keep: ["SELECT", "INSERT", "UPDATE"], canonical: ["SELECT", "INSERT", "UPDATE"], caller: "canonical owned browser flow" },
});

export const PHASE3_BROWSER_GRANT_MATRIX = Object.freeze([
  ...Object.keys(authenticatedGrantContracts).flatMap((table) => grantDecision(table, "anon", { keep: [], canonical: [], caller: null })),
  ...Object.entries(authenticatedGrantContracts).flatMap(([table, contract]) => grantDecision(table, "authenticated", {
    ...contract, keep: browserPostPrivileges(table,"authenticated"), canonical: browserPostPrivileges(table,"authenticated"),
    caller: table === "referee_exam_sessions" ? "SELECT ACL only; authenticated policy absent until separate reviewed provider" : "reviewed canonical capability; profile writes use column ACLs",
  })),
]);

export const PHASE3_TEMPORARY_LEGACY_GRANTS = Object.freeze([
  ...PHASE3_LEGACY_IDENTITY_HELPERS.flatMap((helper) =>
    helper.executeRoles.map((role) => `${role}:EXECUTE:${helper.signature}`),
  ),
]);

export const PHASE3_DOMAIN_CLASSIFICATION = Object.freeze([
  { key: "identity_profiles", domain: "Identity / profiles", decision: "PRE_CUTOVER", independentlyDeployable: true },
  { key: "admin", domain: "Admin / subscriptions / global roles", decision: "PARTIAL_PRE_CUTOVER", independentlyDeployable: true },
  { key: "training", domain: "Training / attempts / clips", decision: "DUAL_RUNTIME", independentlyDeployable: true },
  { key: "exams", domain: "Exams", decision: "DUAL_RUNTIME", independentlyDeployable: false },
  { key: "institutions", domain: "Institutions", decision: "UNKNOWN_REQUIRES_EVIDENCE", independentlyDeployable: false },
  { key: "matches", domain: "Matches", decision: "PARTIAL_PRE_CUTOVER", independentlyDeployable: true },
  { key: "psychology", domain: "Psychology", decision: "PARTIAL_PRE_CUTOVER", independentlyDeployable: true },
  { key: "notifications", domain: "Notifications", decision: "READ_ONLY_PRE_CUTOVER", independentlyDeployable: true },
  { key: "storage", domain: "Storage", decision: "UNKNOWN_REQUIRES_EVIDENCE", independentlyDeployable: false },
  { key: "metadata", domain: "Metadata / adoption infrastructure", decision: "ADOPTION_TEMPORARY", independentlyDeployable: false },
]);

export const PHASE3_ROUTINE_CALLER_REPORT = Object.freeze([
  { routine: "admin_set_canonical_user_plan", caller: "lib/admin/usersWrite.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "admin_set_canonical_global_role", caller: "lib/admin/usersWrite.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "submit_canonical_training_attempt", caller: "lib/training/attempts.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "submit_canonical_communication_feedback", caller: "lib/coach/communicationFeedback.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "submit_referee_exam", caller: "lib/exams/canonicalExam.ts; lib/exams/canonicalRulesExam.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "consume_coach_rate_limit", caller: "lib/coach/security.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "accept_canonical_institution_invitation", caller: "lib/institutional/invitations.ts", expectedRole: "service_role", decision: "canonical_missing" },
  { routine: "Development identity linker family", caller: "Development-only linker endpoints", expectedRole: null, decision: "development_forbidden" },
]);

export const PHASE3_UNRESOLVED = Object.freeze([
  "full institution policy and grant cutover",
  "Storage policy and grant cutover",
  "remaining routine EXECUTE inventory",
  "remaining canonical policy families",
  "service_role global reconciliation",
  "legacy helper teardown after privileged zero-caller proof",
  "semantic audit sidecar teardown",
  "security_cutover ledger transition",
  "runtime cutover and canonical marker",
]);

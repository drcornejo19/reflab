const blocker = (code, details = {}) => ({ code, ...details });

export function connectionCredentialBlockers(results) {
  const role = results.get("connection_role_security");
  const writes = results.get("connection_effective_writes");
  const blockers = [];
  if (!role) return [blocker("BLOCKER_CONNECTION_ROLE_NOT_INVENTORIED")];
  for (const [attribute, code] of [
    ["rolsuper", "BLOCKER_CONNECTION_SUPERUSER"],
    ["rolcreatedb", "BLOCKER_CONNECTION_CREATEDB"],
    ["rolcreaterole", "BLOCKER_CONNECTION_CREATEROLE"],
    ["rolbypassrls", "BLOCKER_CONNECTION_BYPASSRLS"],
  ]) {
    if (role[attribute]) blockers.push(blocker(code, { role: role.rolname }));
  }
  if (!writes) return [...blockers, blocker("BLOCKER_EFFECTIVE_WRITE_PRIVILEGES_NOT_INVENTORIED")];
  for (const [field, code] of [
    ["schemas_with_create", "BLOCKER_CONNECTION_SCHEMA_CREATE"],
    ["tables_with_dml", "BLOCKER_CONNECTION_TABLE_DML"],
    ["sequences_with_write", "BLOCKER_CONNECTION_SEQUENCE_WRITE"],
  ]) {
    for (const object of writes[field] ?? []) blockers.push(blocker(code, { object }));
  }
  return blockers;
}

function nonZeroBlockers(payload, query, fields, code = "BLOCKER_SEMANTIC_MISMATCH") {
  if (!payload) return [];
  return fields.flatMap((field) => Number(payload[field] ?? 0) === 0
    ? []
    : [blocker(code, { query, field, actual: Number(payload[field]), allowed: 0 })]
  );
}

export function identityDataBlockers(results, identityLinksAvailable) {
  const blockers = [];
  if (!identityLinksAvailable) blockers.push(blocker("BLOCKER_IDENTITY_LINKS_UNAVAILABLE"));
  blockers.push(...nonZeroBlockers(results.get("identity_link_structure"), "identity_link_structure", [
    "duplicate_external_subjects",
    "duplicate_canonical_users",
    "links_without_profile",
    "profiles_with_multiple_links",
  ], "BLOCKER_IDENTITY_INTEGRITY"));
  for (const [query, payload] of results) {
    if (!query.startsWith("identity_") || query === "identity_link_structure") continue;
    if (Number(payload?.unresolved_candidates ?? 0) > 0) {
      blockers.push(blocker("BLOCKER_UNRESOLVED_CLERK_REFERENCE", {
        query,
        actual: Number(payload.unresolved_candidates),
        allowed: 0,
      }));
    }
  }
  const fixtureIdentity = results.get("fixture_creator_identity");
  if (fixtureIdentity && Number(fixtureIdentity.candidate_clerk_refs ?? 0) !== Number(fixtureIdentity.mapped_clerk_refs ?? 0)) {
    blockers.push(blocker("BLOCKER_UNRESOLVED_FIXTURE_CREATOR", {
      candidateCount: Number(fixtureIdentity.candidate_clerk_refs ?? 0),
      mappedCount: Number(fixtureIdentity.mapped_clerk_refs ?? 0),
    }));
  }
  return blockers;
}

export function semanticIntegrityBlockers(results, skipped) {
  const blockers = skipped.map((entry) => blocker("BLOCKER_SEMANTIC_CHECK_SKIPPED", { query: entry.query }));
  blockers.push(...nonZeroBlockers(results.get("attempt_semantics"), "attempt_semantics", [
    "official_orphans", "official_owner_mismatches", "invalid_communication_feedback",
  ]));
  blockers.push(...nonZeroBlockers(results.get("exam_integrity"), "exam_integrity", [
    "results_without_session", "session_owner_mismatches", "session_submission_mismatches",
  ]));
  blockers.push(...nonZeroBlockers(results.get("legacy_access"), "legacy_access", [
    "user_roles", "automatic_default_global_roles", "automatic_default_subscriptions", "unknown_global_roles",
  ]));
  blockers.push(...nonZeroBlockers(results.get("institution_tenant_integrity"), "institution_tenant_integrity", [
    "membership_role_mismatches", "group_membership_mismatches", "permission_override_mismatches",
  ]));
  blockers.push(...nonZeroBlockers(results.get("matches_tenant_integrity"), "matches_tenant_integrity", [
    "institutional_appointments_without_active_membership",
  ]));
  blockers.push(...nonZeroBlockers(results.get("notification_integrity"), "notification_integrity", [
    "token_owner_conflicts", "events_without_profile", "preferences_without_profile",
  ]));
  const catalog = results.get("institution_catalog");
  if (catalog) {
    for (const [field, expected] of [["permissions", 27], ["system_roles", 10], ["system_relations", 87], ["forbidden_roles", 0]]) {
      if (Number(catalog[field]) !== expected) {
        blockers.push(blocker("BLOCKER_INSTITUTION_CATALOG_MISMATCH", {
          query: "institution_catalog", field, actual: Number(catalog[field]), expected,
        }));
      }
    }
  }
  return blockers;
}

export function buildGateReport({
  results,
  migrationHistory,
  manifestComparison,
  skipped,
  identityLinksAvailable,
  targetBlockers = [],
}) {
  const migrationBlockers = migrationHistory
    .filter((entry) => entry.gate.startsWith("BLOCKER_"))
    .map((entry) => blocker(entry.gate, { version: entry.version, name: entry.remoteName ?? entry.name }));
  const identityBlockers = [
    ...identityDataBlockers(results, identityLinksAvailable),
    ...manifestComparison.identityFallbackBlockers,
  ];
  const rlsBlockers = [
    ...manifestComparison.rlsContractDrift,
    ...manifestComparison.policyContractDrift,
    ...manifestComparison.missingPolicies.map((object) => blocker("BLOCKER_MISSING_POLICY", { object })),
  ];
  const functionBlockers = [
    ...manifestComparison.functionContractDrift,
    ...manifestComparison.identityFallbackBlockers,
    ...manifestComparison.missingSharedFunctions.map((object) => blocker("BLOCKER_MISSING_FUNCTION", { object })),
    ...manifestComparison.missingRequiredProductionRpcs.map((object) => blocker("BLOCKER_MISSING_REQUIRED_RPC", { object })),
    ...manifestComparison.executableDevelopmentRpcs.map((object) => blocker("BLOCKER_EXECUTABLE_DEVELOPMENT_RPC", { object })),
  ];
  const grantBlockers = manifestComparison.grantBlockers;
  const integrityBlockers = semanticIntegrityBlockers(results, skipped);
  const storagePolicyNames = new Set(["avatars_public_read", "institutional_content_authenticated_read", "videos_public_read"]);
  const storageBlockers = [
    ...manifestComparison.missingBuckets.map((object) => blocker("BLOCKER_MISSING_BUCKET", { object })),
    ...manifestComparison.bucketContractDrift.map((entry) => blocker("BLOCKER_BUCKET_CONTRACT_DRIFT", { object: entry.bucket })),
    ...manifestComparison.policyContractDrift
      .filter((entry) => storagePolicyNames.has(entry.policy.split(".").at(-1)))
      .map((entry) => blocker("BLOCKER_STORAGE_POLICY_DRIFT", { object: entry.policy })),
  ];
  const categorizedObjectTypes = new Set([
    "MISSING_REQUIRED_RPC", "FUNCTION_CONTRACT_DRIFT", "EXECUTABLE_DEVELOPMENT_RPC",
    "MISSING_POLICY", "POLICY_CONTRACT_DRIFT", "MISSING_BUCKET", "BUCKET_CONTRACT_DRIFT",
  ]);
  const objectBlockers = manifestComparison.objectBlockers
    .filter((entry) => !categorizedObjectTypes.has(entry.type))
    .map((entry) => blocker(`BLOCKER_${entry.type}`, { object: entry.object }));
  const categories = {
    targetBlockers,
    migrationBlockers,
    identityBlockers,
    rlsBlockers,
    functionBlockers,
    grantBlockers,
    integrityBlockers,
    storageBlockers,
    objectBlockers,
  };
  return {
    ...categories,
    overallGate: Object.values(categories).every((entries) => entries.length === 0) ? "PASS" : "BLOCKER",
  };
}

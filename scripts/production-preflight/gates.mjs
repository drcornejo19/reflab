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
  for (const object of writes.tables_owned ?? []) {
    blockers.push(blocker("BLOCKER_CONNECTION_TABLE_OWNER", { object }));
  }
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

export function identityDataBlockers(results) {
  const blockers = [];
  const aggregate = results.get("identity_reference_integrity");
  if (aggregate && Number(aggregate.unresolved_profile_refs ?? 0) > 0) {
    blockers.push(blocker("BLOCKER_UNRESOLVED_CANONICAL_REFERENCE", {
      query: "identity_reference_integrity",
      actual: Number(aggregate.unresolved_profile_refs),
      allowed: 0,
    }));
  }
  for (const [query, payload] of results) {
    if (!query.startsWith("identity_")) continue;
    if (Number(payload?.unresolved_profile_refs ?? 0) > 0) {
      blockers.push(blocker("BLOCKER_UNRESOLVED_CANONICAL_REFERENCE", {
        query,
        actual: Number(payload.unresolved_profile_refs),
        allowed: 0,
      }));
    }
  }
  const fixtureIdentity = results.get("fixture_creator_identity");
  if (fixtureIdentity && Number(fixtureIdentity.unresolved_profile_refs ?? 0) > 0) {
    blockers.push(blocker("BLOCKER_UNRESOLVED_FIXTURE_CREATOR", {
      actual: Number(fixtureIdentity.unresolved_profile_refs),
      allowed: 0,
    }));
  }
  return blockers;
}

export function semanticIntegrityBlockers(results, skipped) {
  const blockers = skipped.map((entry) => blocker("BLOCKER_SEMANTIC_CHECK_SKIPPED", {
    query: entry.query,
    reason: entry.status,
    blockedTables: entry.blockedTables ?? [],
  }));
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
  targetBlockers = [],
  temporarySemanticAuditPresent = false,
}) {
  const migrationBlockers = migrationHistory
    .filter((entry) => entry.gate.startsWith("BLOCKER_"))
    .map((entry) => blocker(entry.gate, { version: entry.version, name: entry.remoteName ?? entry.name }));
  const identityBlockers = [
    ...identityDataBlockers(results),
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
  const storageInventoryProven = results.has("storage_buckets") &&
    !skipped.some((entry) => entry.query === "storage_buckets");
  const storageBlockers = [
    ...(storageInventoryProven
      ? manifestComparison.missingBuckets.map((object) => blocker("BLOCKER_MISSING_BUCKET", { object }))
      : []),
    ...(storageInventoryProven
      ? manifestComparison.bucketContractDrift.map((entry) => blocker("BLOCKER_BUCKET_CONTRACT_DRIFT", { object: entry.bucket }))
      : []),
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
  if (temporarySemanticAuditPresent) {
    objectBlockers.push(blocker("BLOCKER_TEMPORARY_SEMANTIC_AUDIT_PRESENT", {
      object: "reflab_audit.production_semantic_snapshot()",
      requiredAction: "ATOMIC_SEMANTIC_ASSERTION_TEARDOWN_AND_CANONICAL_FINALIZATION",
    }));
  }
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

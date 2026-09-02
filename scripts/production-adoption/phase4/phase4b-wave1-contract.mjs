export const PHASE4B_WAVE1_VERSION = "20260901064253";
export const PHASE4B_WAVE1_MIGRATION = `${PHASE4B_WAVE1_VERSION}_production_adoption_inert_private_helpers.sql`;
export const PHASE4B_WAVE1_PROVIDER = `reflab:production_adoption_provider=${PHASE4B_WAVE1_VERSION}`;

const helper = (name, signature, returns, language, volatility, security, owner, sourceHash, dependencies) => Object.freeze({
  schema: "reflab_private",
  name,
  signature,
  returns,
  language,
  volatility,
  strict: false,
  security,
  owner,
  searchPath: "pg_catalog",
  proconfig: ["search_path=pg_catalog"],
  sourceHash,
  dependencies: Object.freeze(dependencies),
  provider: PHASE4B_WAVE1_VERSION,
  classification: "SAFE_INSTALL_PHASE4B",
});

export const PHASE4B_WAVE1_HELPERS = Object.freeze([
  helper("can_access_user_data", "reflab_private.can_access_user_data(text, uuid, text)", "boolean", "sql", "stable", "DEFINER", "reflab_rls_owner", "b39a28d925e10cffa32e79f787a3fcf2a84a204ee9870055a8c4ed3a960c1b64", ["reflab_private.request_user_id()", "reflab_private.is_super_admin()", "reflab_private.has_institution_permission(uuid, text)", "public.institution_memberships"]),
  helper("has_active_institution_membership", "reflab_private.has_active_institution_membership(uuid)", "boolean", "sql", "stable", "DEFINER", "reflab_rls_owner", "d761b8b6242beddf871f8b0bc6e0f6fa26c39b414462054c85affce037477b55", ["reflab_private.request_user_id()", "reflab_private.is_super_admin()", "public.institution_memberships", "public.institutions", "public.institution_subscriptions"]),
  helper("has_institution_permission", "reflab_private.has_institution_permission(uuid, text)", "boolean", "sql", "stable", "DEFINER", "reflab_rls_owner", "ac23f15ab7a4f9b423be59efccb4d7cb071eb23f3e220be6c6b777beca3e024a", ["reflab_private.request_user_id()", "reflab_private.is_super_admin()", "reflab_private.has_active_institution_membership(uuid)", "public.institution_memberships", "public.institution_permissions", "public.institution_membership_permission_overrides", "public.institution_membership_roles", "public.institution_roles", "public.institution_role_permissions"]),
  helper("protect_referee_exam_session", "reflab_private.protect_referee_exam_session()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "1fdf254bef00727661db48024649eaaa731f9f5799d62273a8717cdb0f2d51c9", ["public.referee_exam_sessions"]),
  helper("set_updated_at", "reflab_private.set_updated_at()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "841260c0f06f596b48e6bdef7500aedef161a2b14eed6752f30f2635245f14f0", []),
  helper("validate_assessment_session_assignment", "reflab_private.validate_assessment_session_assignment()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "2c0e009cc55b54dd8346d74fa3b82d4d0f527b4365a5409701dcef4173bece0a", ["public.institution_assessment_assignments", "public.institution_memberships", "public.institution_group_memberships"]),
  helper("validate_attempt_exam_context", "reflab_private.validate_attempt_exam_context()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "787acfbdff7c42182f1fe1d4c762c9e1fed9b3a175008f9640172f12b656841a", ["public.exam_results"]),
  helper("validate_exam_result_context", "reflab_private.validate_exam_result_context()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "ee601e6f5952b12aeccd2509bb02e338eda1f328d0cbcd273ab1d37fbba2ea4c", ["public.referee_exam_sessions"]),
  helper("validate_institution_data_consent", "reflab_private.validate_institution_data_consent()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "c3a1a18709b493c90fecefd4bb3bf977cb44617dc5ca41c0b82ad04c071bc5b4", ["public.institution_memberships"]),
  helper("validate_institution_role_scope", "reflab_private.validate_institution_role_scope()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "2324cf72967edd04be8b9c8828ce14931c1b37728bb5e01a63148eaf60a0e321", ["public.institution_roles", "public.institution_memberships"]),
  helper("validate_institution_user_target", "reflab_private.validate_institution_user_target()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "3fe56554d558ff85970edad7679c1c22c35ff0f41a6885cbd732e486ead985c1", ["public.institution_memberships"]),
  helper("validate_owned_appointment", "reflab_private.validate_owned_appointment()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "f897b0b7aa860edac711b91cabd3e072f90be418f5a8f95eaed14821899d7a8f", ["public.appointments"]),
  helper("validate_performance_checkin_owner", "reflab_private.validate_performance_checkin_owner()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "3f6805d4a5ff46b61d3bbfe22f5f54f27fb12b049908d6587695b5afba050781", ["public.performance_checkins"]),
  helper("validate_referee_exam_manifest", "reflab_private.validate_referee_exam_manifest()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "3ba01c88fba53b07729a21c1bb4b73e7ee932b72dc62c22bf449a55c1916b1eb", ["extensions.digest(bytea, text)", "reflab_private.canonical_jsonb_text(jsonb)", "public.clips", "public.institutional_clips"]),
  helper("validate_referee_exam_session_context", "reflab_private.validate_referee_exam_session_context()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "d9a1b496830ab363e40646f973bd1ea32d29b1d6f80740ee9d6c2e0af6482b21", ["public.institution_assessment_sessions", "public.institution_assessments"]),
  helper("validate_user_appointment_context", "reflab_private.validate_user_appointment_context()", "trigger", "plpgsql", "volatile", "INVOKER", "installer", "b3679326a4e0444a5ba860e63e5fdc300fd447316b59afcdc6bb38dfb2b2ffc0", ["public.appointments"]),
]);

export const PHASE4B_WAVE1_PREEXISTING_DEPENDENCIES = Object.freeze([
  "extensions.digest(bytea, text)",
  "reflab_private.canonical_jsonb_text(jsonb)",
  "reflab_private.is_super_admin()",
  "reflab_private.request_user_id()",
  "public.appointments",
  "public.clips",
  "public.exam_results",
  "public.institution_assessment_assignments",
  "public.institution_assessment_sessions",
  "public.institution_assessments",
  "public.institution_group_memberships",
  "public.institution_membership_permission_overrides",
  "public.institution_membership_roles",
  "public.institution_memberships",
  "public.institution_permissions",
  "public.institution_role_permissions",
  "public.institution_roles",
  "public.institution_subscriptions",
  "public.institutional_clips",
  "public.institutions",
  "public.performance_checkins",
  "public.referee_exam_sessions",
]);

export function buildWave1DependencyGraph(helpers = PHASE4B_WAVE1_HELPERS) {
  const bySignature = new Map();
  for (const candidate of helpers) {
    if (bySignature.has(candidate.signature)) {
      throw new Error(`Duplicate Wave 1 provider signature: ${candidate.signature}`);
    }
    bySignature.set(candidate.signature, candidate);
  }

  const preexisting = new Set(PHASE4B_WAVE1_PREEXISTING_DEPENDENCIES);
  const graph = new Map();
  for (const candidate of helpers) {
    const dependencies = [...candidate.dependencies];
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error(`Duplicate Wave 1 dependency: ${candidate.signature}`);
    }
    const unknown = dependencies.filter((dependency) => !bySignature.has(dependency) && !preexisting.has(dependency));
    if (unknown.length > 0) {
      throw new Error(`Unknown Wave 1 dependency for ${candidate.signature}: ${unknown.join(", ")}`);
    }
    graph.set(candidate.signature, Object.freeze(dependencies.filter((dependency) => bySignature.has(dependency)).sort()));
  }
  return graph;
}

export function topologicallySortWave1Helpers(helpers = PHASE4B_WAVE1_HELPERS) {
  const graph = buildWave1DependencyGraph(helpers);
  const bySignature = new Map(helpers.map((candidate) => [candidate.signature, candidate]));
  const emitted = new Set();
  const ordered = [];

  while (ordered.length < helpers.length) {
    const ready = [...bySignature.keys()]
      .filter((signature) => !emitted.has(signature))
      .filter((signature) => graph.get(signature).every((dependency) => emitted.has(dependency)))
      .sort();
    if (ready.length === 0) {
      const unresolved = [...bySignature.keys()].filter((signature) => !emitted.has(signature)).sort();
      throw new Error(`Cyclic Wave 1 helper dependency: ${unresolved.join(", ")}`);
    }
    for (const signature of ready) {
      emitted.add(signature);
      ordered.push(bySignature.get(signature));
    }
  }

  return Object.freeze(ordered);
}

export const PHASE4B_WAVE1_NEGATIVE_SCENARIOS = Object.freeze([
  "source_drift",
  "return_type_drift",
  "language_drift",
  "volatility_drift",
  "security_mode_drift",
  "search_path_drift",
  "owner_drift",
  "unexpected_overload",
  "public_execute",
  "authenticated_execute",
  "unsafe_role_membership",
  "missing_adoption_prerequisite",
  "premature_canonical_marker",
  "development_object_present",
  "duplicate_provider_declaration",
  "fourth_policy_caller",
  "reviewed_policy_helper_drift",
  "reviewed_policy_command_drift",
  "reviewed_policy_role_drift",
  "reviewed_policy_permissive_drift",
  "wrapper_source_drift",
  "wrapper_security_definer",
  "unexpected_direct_identity_reader",
]);

export const PHASE4B_WAVE1_RUNTIME_EXCLUSIONS = Object.freeze([
  "public.submit_referee_exam(text, uuid, uuid, text, jsonb)",
  "public.accept_canonical_institution_invitation(text, uuid, text[])",
  "public.consume_coach_rate_limit(text, text, integer, integer)",
]);

export const PHASE4B_WAVE1_CANONICAL_POLICIES = PHASE3_POLICY_MATRIX;

export const PHASE4B_WAVE1_LEGACY_INSERT_POLICIES = Object.freeze([
  "attempts",
  "exam_results",
  "rules_exam_results",
].map((table) => Object.freeze({
  schema: "public",
  table,
  name: `${table}_own_insert`,
  command: "INSERT",
  roles: Object.freeze(["authenticated"]),
  permissive: true,
  using: null,
  withCheck: "user_id = platform_request_user_id()",
  allowedRenderedChecks: Object.freeze([
    "user_id=platform_request_user_id",
    "user_id=public.platform_request_user_id",
  ]),
  classification: "LEGACY_REQUIRED_TEMPORARILY",
})));

export const PHASE4B_WAVE1_PLATFORM_WRAPPER = Object.freeze({
  signature: "public.platform_request_user_id()",
  returns: "text",
  language: "sql",
  volatility: "stable",
  strict: false,
  security: "INVOKER",
  owner: "postgres",
  searchPath: "pg_catalog",
  proconfig: Object.freeze(["search_path=pg_catalog"]),
  sourceHash: "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c",
  executeRoles: Object.freeze(["authenticated", "service_role"]),
});

export function normalizeReviewedLegacyPolicyExpression(value) {
  return String(value ?? "").toLowerCase().replace(/[\s()]/g, "");
}

export function isReviewedLegacyPolicyExpression(value) {
  const normalized = normalizeReviewedLegacyPolicyExpression(value);
  return PHASE4B_WAVE1_LEGACY_INSERT_POLICIES[0].allowedRenderedChecks.includes(normalized);
}

export function isReviewedLegacyPolicyContract(policy) {
  const expected = PHASE4B_WAVE1_LEGACY_INSERT_POLICIES.find((candidate) =>
    candidate.schema === policy?.schema
    && candidate.table === policy?.table
    && candidate.name === policy?.name
  );
  return Boolean(expected
    && policy.command === expected.command
    && policy.permissive === expected.permissive
    && JSON.stringify(policy.roles) === JSON.stringify(expected.roles)
    && policy.using === null
    && isReviewedLegacyPolicyExpression(policy.withCheck));
}
import { PHASE3_POLICY_MATRIX } from "../phase3/phase3-security-contract.mjs";

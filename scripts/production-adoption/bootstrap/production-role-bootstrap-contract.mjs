import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ROLE_BOOTSTRAP_FORMAT = "REFLAB_PRODUCTION_ROLE_BOOTSTRAP_V1";
export const ROLE_BOOTSTRAP_MANAGED_PROFILE_FORMAT = "REFLAB_PRODUCTION_MANAGED_INSTALLER_PROFILE_V1";
export const ROLE_BOOTSTRAP_ROLE = "reflab_rls_owner";
export const ROLE_BOOTSTRAP_INSTALLER = "postgres";
export const ROLE_BOOTSTRAP_MANAGED_PROJECT_REF = "nagjddldrldwavmfaytc";
export const ROLE_BOOTSTRAP_ARTIFACT = "scripts/production-adoption/bootstrap/reflab-rls-owner-bootstrap.sql";
export const ROLE_BOOTSTRAP_ATTESTATION = "scripts/production-adoption/bootstrap/reflab-rls-owner-attestation.sql";
export const ROLE_BOOTSTRAP_ARTIFACT_SHA256 = "51a9585ae9fef21c542dbb7e90962aed8de9e57f565ab84c9f69849d1d97397a";
export const ROLE_BOOTSTRAP_ATTESTATION_SHA256 = "1a6020e532c6f32d7ed7a85fcf11d3c708c888ab028a3ef9ff277ac7936386ee";
export const ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS = Object.freeze([
  Object.freeze({
    grantedRole: ROLE_BOOTSTRAP_ROLE,
    memberRole: ROLE_BOOTSTRAP_INSTALLER,
    grantorRole: "supabase_admin",
    adminOption: true,
    inheritOption: false,
    setOption: false,
  }),
  Object.freeze({
    grantedRole: ROLE_BOOTSTRAP_ROLE,
    memberRole: ROLE_BOOTSTRAP_INSTALLER,
    grantorRole: ROLE_BOOTSTRAP_INSTALLER,
    adminOption: false,
    inheritOption: false,
    setOption: true,
  }),
]);

export const ROLE_BOOTSTRAP_ROLE_ATTRIBUTES = Object.freeze({
  rolcanlogin: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolbypassrls: false,
});

// These are the capabilities RefLab actually consumes during bootstrap. The
// remaining installer attributes are pinned ambient managed-platform state.
export const ROLE_BOOTSTRAP_REQUIRED_CAPABILITIES = Object.freeze({
  rolcanlogin: true,
  rolsuper: false,
  rolcreaterole: true,
  databaseCreate: true,
});

export const ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES = Object.freeze({
  rolcanlogin: true,
  rolinherit: true,
  rolcreaterole: true,
  rolsuper: false,
  rolcreatedb: true,
  rolbypassrls: true,
  rolreplication: true,
});

export const ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS = Object.freeze([
  ["anon", true, true, true],
  ["authenticated", true, true, true],
  ["authenticator", true, true, true],
  ["pg_create_subscription", true, true, true],
  ["pg_monitor", true, true, true],
  ["pg_read_all_data", true, true, true],
  ["pg_signal_backend", true, true, true],
  ["reflab_prod_preflight_ro", true, false, false],
  ["service_role", true, true, true],
  ["supabase_privileged_role", false, true, true],
].map(([grantedRole, adminOption, inheritOption, setOption]) => Object.freeze({
  grantedRole,
  memberRole: ROLE_BOOTSTRAP_INSTALLER,
  grantorRole: "supabase_admin",
  adminOption,
  inheritOption,
  setOption,
})));

export const ROLE_BOOTSTRAP_PRE_BOOTSTRAP_MEMBERSHIPS = ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS;
export const ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS = Object.freeze([
  ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS,
  ...ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS,
]);
export const ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER = "reflab_preflight_audit_owner";
export const ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES = Object.freeze({
  ...ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
  rolreplication: false,
});
export const ROLE_BOOTSTRAP_SEMANTIC_AUDIT_MEMBERSHIP = Object.freeze({
  grantedRole: ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER,
  memberRole: ROLE_BOOTSTRAP_INSTALLER,
  grantorRole: "supabase_admin",
  adminOption: true,
  inheritOption: false,
  setOption: false,
});
export const ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS = Object.freeze([
  ...ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
  ROLE_BOOTSTRAP_SEMANTIC_AUDIT_MEMBERSHIP,
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function artifactHash(repositoryRoot, artifact) {
  return sha256(readFileSync(resolve(repositoryRoot, artifact)));
}

export function assertPinnedArtifacts(repositoryRoot) {
  const observed = {
    bootstrap: artifactHash(repositoryRoot, ROLE_BOOTSTRAP_ARTIFACT),
    attestation: artifactHash(repositoryRoot, ROLE_BOOTSTRAP_ATTESTATION),
  };
  if (observed.bootstrap !== ROLE_BOOTSTRAP_ARTIFACT_SHA256
      || observed.attestation !== ROLE_BOOTSTRAP_ATTESTATION_SHA256) {
    throw new Error("Production role bootstrap artifact hash mismatch.");
  }
  return observed;
}

export function assertRoleAttestation(payload) {
  const expected = {
    role_present: true,
    attributes_exact: true,
    automatic_memberships: 1,
    explicit_memberships: 1,
    unexpected_memberships: 0,
    owned_objects: 0,
    direct_acl_entries: 0,
    effective_table_writes: 0,
    effective_sequence_writes: 0,
    effective_schema_create: 0,
    comment_exact: true,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (payload?.[field] !== value) {
      throw new Error(`Production role bootstrap attestation failed: ${field}; expected=${value}; observed=${payload?.[field] ?? "MISSING"}.`);
    }
  }
  return true;
}

export function assertAbsentRoleAttestation(payload) {
  const expected = {
    role_present: false,
    attributes_exact: false,
    automatic_memberships: 0,
    explicit_memberships: 0,
    unexpected_memberships: 0,
    owned_objects: 0,
    direct_acl_entries: 0,
    effective_table_writes: 0,
    effective_sequence_writes: 0,
    effective_schema_create: 0,
    comment_exact: false,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (payload?.[field] !== value) {
      throw new Error(`Production role bootstrap absent-state attestation failed: ${field}; expected=${value}; observed=${payload?.[field] ?? "MISSING"}.`);
    }
  }
  return true;
}

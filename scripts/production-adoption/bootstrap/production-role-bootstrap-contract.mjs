import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ROLE_BOOTSTRAP_FORMAT = "REFLAB_PRODUCTION_ROLE_BOOTSTRAP_V1";
export const ROLE_BOOTSTRAP_ROLE = "reflab_rls_owner";
export const ROLE_BOOTSTRAP_INSTALLER = "postgres";
export const ROLE_BOOTSTRAP_ARTIFACT = "scripts/production-adoption/bootstrap/reflab-rls-owner-bootstrap.sql";
export const ROLE_BOOTSTRAP_ATTESTATION = "scripts/production-adoption/bootstrap/reflab-rls-owner-attestation.sql";
export const ROLE_BOOTSTRAP_ARTIFACT_SHA256 = "51856f8e5448822290e1020805eda9efc18b80c81a0a8689a26678f49ed56fa2";
export const ROLE_BOOTSTRAP_ATTESTATION_SHA256 = "f6500193bedcfe91707f545a84a78f0d8b3355e52ba3bfe1c743ea6d10497a95";
export const ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS = Object.freeze([
  Object.freeze({ grantedRole: ROLE_BOOTSTRAP_ROLE, memberRole: ROLE_BOOTSTRAP_INSTALLER }),
]);

export const ROLE_BOOTSTRAP_ROLE_ATTRIBUTES = Object.freeze({
  rolcanlogin: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolbypassrls: false,
});

export const ROLE_BOOTSTRAP_INSTALLER_ATTRIBUTES = Object.freeze({
  rolcanlogin: true,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: true,
  rolinherit: true,
  rolbypassrls: false,
});

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
    approved_memberships: 1,
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

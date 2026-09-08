import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import {
  ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS,
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES,
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
} from "./production-role-bootstrap-contract.mjs";
import { classifyInstallerIdentity, installerIdentityQuery } from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_FOUNDATION_ARTIFACT,
  PHASE1_FOUNDATION_SHA256,
  assertPhase1ArtifactHash,
  classifyPhase1Entry,
  phase1ArtifactHash,
  phase1EntryQuery,
} from "./phase1-entry-attestation-contract.mjs";
import { runProductionPhase1EntryAttestation } from "./run-production-phase1-entry-attestation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(resolve(root, PHASE1_FOUNDATION_ARTIFACT), "utf8");

function catalogMemberships(memberships) {
  return memberships.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
}

function installerPayload({ rolePresent = true, memberships, summary = true } = {}) {
  const observed = memberships ?? catalogMemberships([
    ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS,
    ...(rolePresent ? ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS : []),
  ]);
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    server_version_num: 170000,
    installer: { rolname: "postgres", ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES },
    protected_role: rolePresent ? { rolname: "reflab_rls_owner", ...ROLE_BOOTSTRAP_ROLE_ATTRIBUTES } : null,
    memberships: observed,
    membership_summary: summary ? {
      total_count: observed.length,
      as_member_count: observed.filter((entry) => entry.member_role === "postgres").length,
      as_granted_role_count: observed.filter((entry) => entry.granted_role === "postgres").length,
    } : undefined,
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
  };
}

const exactRole = Object.freeze({
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
});

const exactAbsence = Object.freeze({
  reflab_meta_absent: true,
  reflab_private_absent: true,
  reflab_audit_absent: true,
  schema_state_absent: true,
  adoption_state_absent: true,
  canonical_marker_absent: true,
  identity_links_absent: true,
  development_objects_absent: true,
});

function phase1Payload(overrides = {}) {
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    transaction_read_only: "on",
    server_version_num: 170000,
    role_attestation: { ...exactRole },
    absence: { ...exactAbsence },
    partial_adoption_object_count: 0,
    ...overrides,
  };
}

function phase1Classification(phaseOverrides = {}, installerOverrides = {}) {
  const rawInstaller = { ...installerPayload(), ...installerOverrides };
  return classifyPhase1Entry(phase1Payload(phaseOverrides), classifyInstallerIdentity(rawInstaller));
}

test("PRE_BOOTSTRAP exact 10 memberships is READY", () => {
  const result = classifyInstallerIdentity(installerPayload({ rolePresent: false }));
  assert.equal(result.lifecycleState, "PRE_BOOTSTRAP");
  assert.equal(result.managedProfile, "READY");
});

test("POST_BOOTSTRAP exact 12 memberships is READY", () => {
  const result = classifyInstallerIdentity(installerPayload());
  assert.equal(result.lifecycleState, "POST_BOOTSTRAP");
  assert.equal(result.observedMembershipCount, 12);
  assert.equal(result.managedProfile, "READY");
});

const ambient = catalogMemberships(ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS);
const post = catalogMemberships([...ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS, ...ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS]);
const lifecycleBlockers = [
  ["absent role with 12 memberships", installerPayload({ rolePresent: false, memberships: post })],
  ["present role with 10 memberships", installerPayload({ memberships: ambient })],
  ["present role with 11 memberships", installerPayload({ memberships: post.slice(0, 11) })],
  ["present role with 13 memberships", installerPayload({ memberships: [...post, {
    granted_role: "extra", member_role: "postgres", grantor_role: "supabase_admin",
    admin_option: false, inherit_option: false, set_option: false,
  }] })],
  ["approved membership wrong grantor", installerPayload({ memberships: post.map((entry, index) =>
    index === 10 ? { ...entry, grantor_role: "wrong" } : entry) })],
  ["approved membership wrong options", installerPayload({ memberships: post.map((entry, index) =>
    index === 11 ? { ...entry, set_option: false } : entry) })],
  ["unexpected reverse membership", installerPayload({ memberships: [...post, {
    granted_role: "postgres", member_role: "extra", grantor_role: "supabase_admin",
    admin_option: false, inherit_option: false, set_option: false,
  }] })],
  ["third protected-role membership", installerPayload({ memberships: [...post, {
    granted_role: "reflab_rls_owner", member_role: "extra", grantor_role: "postgres",
    admin_option: false, inherit_option: false, set_option: true,
  }] })],
  ["protected role as unexpected member", installerPayload({ memberships: [...post, {
    granted_role: "extra", member_role: "reflab_rls_owner", grantor_role: "postgres",
    admin_option: false, inherit_option: false, set_option: true,
  }] })],
  ["ambient membership drift", installerPayload({ memberships: post.map((entry, index) =>
    index === 0 ? { ...entry, admin_option: false } : entry) })],
  ["protected role attribute drift", {
    ...installerPayload(),
    protected_role: { ...installerPayload().protected_role, rolbypassrls: true },
  }],
];

for (const [name, payload] of lifecycleBlockers) {
  test(`${name} is BLOCKER`, () => {
    const result = classifyInstallerIdentity(payload);
    assert.equal(result.lifecycleState, "UNKNOWN");
    assert.equal(result.managedProfile, "BLOCKER");
  });
}

test("incomplete lifecycle evidence is UNKNOWN", () => {
  assert.equal(classifyInstallerIdentity(installerPayload({ summary: false })).managedProfile, "UNKNOWN");
});

test("exact post-bootstrap state and absent Phase 1 objects is READY", () => {
  assert.equal(phase1Classification().phase1Entry, "READY");
});

for (const [name, field] of [
  ["reflab_meta exists", "reflab_meta_absent"],
  ["reflab_private exists", "reflab_private_absent"],
  ["reflab_audit exists", "reflab_audit_absent"],
  ["state table exists", "schema_state_absent"],
  ["canonical marker exists", "canonical_marker_absent"],
  ["user_identity_links exists", "identity_links_absent"],
  ["Development RPC exists", "development_objects_absent"],
]) {
  test(`${name} blocks Phase 1 entry`, () => {
    const result = phase1Classification({ absence: { ...exactAbsence, [field]: false } });
    assert.equal(result.phase1Entry, "BLOCKER");
  });
}

test("partial adoption object blocks Phase 1 entry", () => {
  assert.equal(phase1Classification({ partial_adoption_object_count: 1 }).phase1Entry, "BLOCKER");
});

test("transaction_read_only off blocks Phase 1 entry", () => {
  assert.equal(phase1Classification({ transaction_read_only: "off" }).phase1Entry, "BLOCKER");
});

test("wrong caller blocks Phase 1 entry", () => {
  assert.equal(phase1Classification({ caller: "postgres" }).phase1Entry, "BLOCKER");
});

test("Phase 1 artifact hash is exact and hash drift aborts before target execution", () => {
  assert.equal(phase1ArtifactHash(root), PHASE1_FOUNDATION_SHA256);
  assert.equal(assertPhase1ArtifactHash(root), PHASE1_FOUNDATION_SHA256);
  let authorized = false;
  assert.throws(() => runProductionPhase1EntryAttestation({}, {
    assertArtifact: () => { throw new Error("hash mismatch"); },
    authorize: () => { authorized = true; },
  }), /hash mismatch/);
  assert.equal(authorized, false);
});

test("Phase 1 foundation DDL scope remains exact and contains no product mutation", () => {
  assert.deepEqual([...migration.matchAll(/create schema ([a-z_]+)/gi)].map((match) => match[1]), ["reflab_meta", "reflab_private"]);
  assert.equal((migration.match(/create table /gi) ?? []).length, 2);
  assert.equal((migration.match(/create function /gi) ?? []).length, 2);
  assert.equal((migration.match(/create trigger /gi) ?? []).length, 2);
  assert.match(migration, /insert into reflab_meta\.production_adoption_state/i);
  assert.doesNotMatch(migration, /create table reflab_private\.user_identity_links/i);
  assert.doesNotMatch(migration, /insert into (?:public|auth|storage)\./i);
  assert.doesNotMatch(migration, /update (?:public|auth|storage)\./i);
  assert.doesNotMatch(migration, /delete from (?:public|auth|storage)\./i);
});

test("Phase 1 entry runner uses only the approved read-only target path", () => {
  const installer = installerPayload();
  const phase1 = phase1Payload();
  let observedSql;
  const result = runProductionPhase1EntryAttestation({}, {
    authorize: () => ({
      projectRef: "nagjddldrldwavmfaytc",
      host: "db.nagjddldrldwavmfaytc.supabase.co",
      connectionEnvironment: { PGUSER: "reflab_prod_preflight_ro" },
    }),
    execute: (sql, connectionEnvironment) => {
      observedSql = sql;
      assert.equal(connectionEnvironment.PGUSER, "reflab_prod_preflight_ro");
      return new Map([
        [installerIdentityQuery.id, installer],
        [phase1EntryQuery.id, phase1],
      ]);
    },
  });
  assert.doesNotThrow(() => assertReadOnlyBatch(observedSql));
  assert.doesNotMatch(phase1EntryQuery.payloadSql, /to_regclass\('reflab_(?:meta|private|audit)\./i);
  assert.match(phase1EntryQuery.payloadSql, /pg_catalog\.pg_class/);
  assert.match(phase1EntryQuery.payloadSql, /pg_catalog\.pg_proc/);
  assert.equal(result.installer.lifecycleState, "POST_BOOTSTRAP");
  assert.equal(result.installer.managedProfile, "READY");
  assert.equal(result.phase1.phase1Entry, "READY");
});

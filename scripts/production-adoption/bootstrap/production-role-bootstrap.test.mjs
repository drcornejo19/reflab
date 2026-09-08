import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ROLE_BOOTSTRAP_ARTIFACT,
  ROLE_BOOTSTRAP_ARTIFACT_SHA256,
  ROLE_BOOTSTRAP_ATTESTATION,
  ROLE_BOOTSTRAP_ATTESTATION_SHA256,
  ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS,
  ROLE_BOOTSTRAP_INSTALLER_ATTRIBUTES,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
  artifactHash,
  assertPinnedArtifacts,
  assertRoleAttestation,
} from "./production-role-bootstrap-contract.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  PRODUCTION_DDL_DATABASE_URL,
  PRODUCTION_DDL_OPT_IN,
  PRODUCTION_DDL_PROJECT_REF,
  ROLE_BOOTSTRAP_OPT_IN,
  assertRepositoryAttestation,
  authorizeProductionDdlTarget,
  parseAttestationOutput,
  runProductionRoleBootstrap,
} from "./run-production-role-bootstrap.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { createTargetSql } from "./run-production-role-bootstrap-postgres.mjs";
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
  runProductionInstallerIdentityAttestation,
} from "./run-production-installer-identity-attestation.mjs";
import {
  PREFLIGHT_DATABASE_URL,
  PREFLIGHT_OPT_IN,
  PREFLIGHT_PROJECT_REF,
} from "../../production-preflight/target.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const bootstrap = readFileSync(resolve(root, ROLE_BOOTSTRAP_ARTIFACT), "utf8");
const attestation = readFileSync(resolve(root, ROLE_BOOTSTRAP_ATTESTATION), "utf8");
const head = "a".repeat(40);
const exactPayload = Object.freeze({
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
const absentPayload = Object.freeze({ role_present: false });

function environment(overrides = {}) {
  return {
    [ROLE_BOOTSTRAP_OPT_IN]: "true",
    [PRODUCTION_DDL_OPT_IN]: "true",
    [PRODUCTION_DDL_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PRODUCTION_DDL_APPROVED_HEAD]: head,
    [PRODUCTION_DDL_DATABASE_URL]: `postgresql://postgres:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PGPASSWORD: "must-not-be-inherited",
    PGOPTIONS: "must-not-be-inherited",
    PGSERVICE: "must-not-be-inherited",
    ...overrides,
  };
}

test("role and installer contracts pin one canonical relationship as two PG17 membership rows", () => {
  assert.deepEqual(ROLE_BOOTSTRAP_ROLE_ATTRIBUTES, {
    rolcanlogin: false, rolsuper: false, rolcreatedb: false,
    rolcreaterole: false, rolinherit: false, rolbypassrls: false,
  });
  assert.deepEqual(ROLE_BOOTSTRAP_INSTALLER_ATTRIBUTES, {
    rolcanlogin: true, rolsuper: false, rolcreatedb: false,
    rolcreaterole: true, rolinherit: true, rolreplication: false, rolbypassrls: false,
  });
  assert.deepEqual(ROLE_BOOTSTRAP_APPROVED_MEMBERSHIPS, [
    {
      grantedRole: "reflab_rls_owner", memberRole: "postgres", grantorRole: "supabase_admin",
      adminOption: true, inheritOption: false, setOption: false,
    },
    {
      grantedRole: "reflab_rls_owner", memberRole: "postgres", grantorRole: "postgres",
      adminOption: false, inheritOption: false, setOption: true,
    },
  ]);
});

test("bootstrap is transactional, fail-closed, and does not alter incompatible roles", () => {
  assert.match(bootstrap, /^--[\s\S]*\nbegin;/i);
  assert.match(bootstrap, /commit;\s*$/i);
  assert.match(bootstrap, /create role reflab_rls_owner[\s\S]*nologin[\s\S]*noinherit[\s\S]*nobypassrls/i);
  assert.match(bootstrap, /set local createrole_self_grant = ''/i);
  assert.match(bootstrap, /grant reflab_rls_owner to postgres\s+with admin false, inherit false, set true\s+granted by postgres/i);
  assert.match(bootstrap, /grantor_role[.]rolname = 'supabase_admin'[\s\S]*membership[.]admin_option[\s\S]*not membership[.]inherit_option[\s\S]*not membership[.]set_option/i);
  assert.doesNotMatch(bootstrap, /alter\s+role\s+reflab_rls_owner/i);
  assert.doesNotMatch(bootstrap, /\b(insert|update|delete|truncate)\b\s+(?:into|from|table)?\s*(?:public|storage)\./i);
  assert.doesNotMatch(bootstrap, /\b(bypassrls|login|superuser|createdb)\s*;/i);
  assert.match(bootstrap, /ownership or direct privileges/);
  assert.match(bootstrap, /unexpected effective write privileges/);
});

test("attestation is deterministic read-only catalog SQL", () => {
  assert.match(attestation, /^begin read only;/i);
  assert.match(attestation, /show transaction_read_only/i);
  assert.match(attestation, /rollback;\s*$/i);
  assert.doesNotThrow(() => assertReadOnlyBatch(attestation));
  assert.match(attestation, /aclexplode\(object\.defaclacl\)/i);
  assert.doesNotMatch(attestation, /select\s+object\.defaclrole\s+as\s+grantee/i);
  assert.equal(parseAttestationOutput(`on\n${JSON.stringify(exactPayload)}\n`).role_present, true);
  assert.throws(() => parseAttestationOutput(`off\n${JSON.stringify(exactPayload)}\n`), /malformed/);
});

test("bootstrap and attestation hashes are pinned", () => {
  assert.equal(artifactHash(root, ROLE_BOOTSTRAP_ARTIFACT), ROLE_BOOTSTRAP_ARTIFACT_SHA256);
  assert.equal(artifactHash(root, ROLE_BOOTSTRAP_ATTESTATION), ROLE_BOOTSTRAP_ATTESTATION_SHA256);
  assert.deepEqual(assertPinnedArtifacts(root), {
    bootstrap: ROLE_BOOTSTRAP_ARTIFACT_SHA256,
    attestation: ROLE_BOOTSTRAP_ATTESTATION_SHA256,
  });
});

test("role attestation rejects every unsafe field", () => {
  assert.equal(assertRoleAttestation(exactPayload), true);
  for (const field of Object.keys(exactPayload)) {
    const invalid = { ...exactPayload, [field]: typeof exactPayload[field] === "boolean" ? !exactPayload[field] : exactPayload[field] + 1 };
    assert.throws(() => assertRoleAttestation(invalid), new RegExp(field));
  }
});

test("target guard requires double opt-in, exact Production target, postgres, and SSL", () => {
  const direct = authorizeProductionDdlTarget(environment());
  assert.equal(direct.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(direct.connectionEnvironment.PGUSER, "postgres");
  assert.equal(direct.connectionEnvironment.PGSSLMODE, "require");
  assert.throws(() => authorizeProductionDdlTarget(environment({ [ROLE_BOOTSTRAP_OPT_IN]: "false" })), /both explicit opt-ins/);
  assert.throws(() => authorizeProductionDdlTarget(environment({ [PRODUCTION_DDL_OPT_IN]: "false" })), /both explicit opt-ins/);
  assert.throws(() => authorizeProductionDdlTarget(environment({ [PRODUCTION_DDL_PROJECT_REF]: "not-production" })), /not allowlisted/);
  assert.throws(() => authorizeProductionDdlTarget(environment({ [PRODUCTION_DDL_DATABASE_URL]: `postgresql://reflab_prod_preflight_ro:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require` })), /exact allowlisted host/);
  assert.throws(() => authorizeProductionDdlTarget(environment({ [PRODUCTION_DDL_DATABASE_URL]: `postgresql://postgres:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=disable` })), /exact allowlisted host/);
});

test("repository gate rejects wrong HEAD and dirty worktrees", () => {
  assert.equal(assertRepositoryAttestation({ expectedHead: head, actualHead: head, status: "" }), true);
  assert.throws(() => assertRepositoryAttestation({ expectedHead: head, actualHead: "b".repeat(40), status: "" }), /HEAD/);
  assert.throws(() => assertRepositoryAttestation({ expectedHead: head, actualHead: head, status: "?? unsafe.sql" }), /clean worktree/);
});

test("runner has exactly one write artifact and sanitizes inherited PG variables", () => {
  const calls = [];
  const spawn = (_command, _args, options) => {
    calls.push(options);
    if (options.input === bootstrap) return { status: 0, stdout: "", stderr: "" };
    const payload = calls.filter((entry) => entry.input === attestation).length === 1 ? absentPayload : exactPayload;
    return { status: 0, stdout: `on\n${JSON.stringify(payload)}\n`, stderr: "" };
  };
  const result = runProductionRoleBootstrap(environment(), {
    argument: "--production-role-bootstrap",
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    spawn,
  });
  assert.equal(result.result, "PASS");
  assert.equal(calls.filter((entry) => entry.input === bootstrap).length, 1);
  for (const call of calls) {
    assert.equal(call.env.PGOPTIONS, undefined);
    assert.equal(call.env.PGSERVICE, undefined);
    assert.notEqual(call.env.PGPASSWORD, "must-not-be-inherited");
  }
});

test("runner fails before psql on wrong operation, target, dirty tree, or hash mismatch", () => {
  let spawned = false;
  const dependencies = {
    argument: "--production-role-bootstrap",
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    spawn: () => { spawned = true; throw new Error("must not spawn"); },
  };
  assert.throws(() => runProductionRoleBootstrap(environment(), { ...dependencies, argument: "--another-operation" }), /exact operation/);
  assert.throws(() => runProductionRoleBootstrap(environment({ [PRODUCTION_DDL_PROJECT_REF]: "wrong" }), dependencies), /not allowlisted/);
  assert.throws(() => runProductionRoleBootstrap(environment(), { ...dependencies, git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M file" }), /clean worktree/);
  assert.throws(() => runProductionRoleBootstrap(environment(), { ...dependencies, assertHashes: () => { throw new Error("hash mismatch"); } }), /hash mismatch/);
  assert.equal(spawned, false);
});

test("bootstrap SQL is PostgreSQL 17 compatible and does not weaken the PG18 Wave 5 contract", () => {
  assert.doesNotMatch(`${bootstrap}\n${attestation}`, /\bindnullsnotdistinct\b|\bnulls\s+not\s+distinct\b/i);
  assert.match(`${bootstrap}\n${attestation}`, /admin_option/);
  assert.match(`${bootstrap}\n${attestation}`, /inherit_option/);
  assert.match(`${bootstrap}\n${attestation}`, /set_option/);
  const wave5 = readFileSync(resolve(root, "scripts/production-adoption/phase4/phase4b-wave5-gate.sql"), "utf8");
  assert.match(wave5, /server_version_num[\s\S]*<> 18/i);
});

test("negative role fixtures emit one non-conflicting option per attribute", () => {
  for (const attribute of ["login", "inherit", "bypassrls", "superuser", "createdb", "createrole"]) {
    const sql = createTargetSql({ [attribute]: true }).match(/create role reflab_rls_owner ([^;]+);/i)?.[1] ?? "";
    const tokens = sql.toLowerCase().split(/\s+/);
    for (const option of ["login", "inherit", "bypassrls", "superuser", "createdb", "createrole"]) {
      assert.equal(tokens.includes(option) || tokens.includes(`no${option}`), true);
      assert.equal(tokens.includes(option) && tokens.includes(`no${option}`), false);
    }
  }
});

test("rollback fingerprint does not schema-qualify PostgreSQL special forms", () => {
  const harness = readFileSync(resolve(root, "scripts/production-adoption/bootstrap/run-production-role-bootstrap-postgres.mjs"), "utf8");
  assert.doesNotMatch(harness, /pg_catalog\.coalesce\s*\(/i);
  assert.match(harness, /pg_catalog\.md5\(coalesce\(/i);
});

test("installer identity attestation reuses the approved read-only target and SQL runner", () => {
  const readOnlyEnvironment = {
    [PREFLIGHT_OPT_IN]: "true",
    [PREFLIGHT_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PREFLIGHT_DATABASE_URL]: `postgresql://reflab_prod_preflight_ro:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
  };
  const payload = {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    server_version_num: 170000,
    installer: {
      rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true,
      rolsuper: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false,
    },
    memberships: [],
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
  };
  let observedSql;
  const result = runProductionInstallerIdentityAttestation(readOnlyEnvironment, {
    execute: (sql, connectionEnvironment) => {
      observedSql = sql;
      assert.equal(connectionEnvironment.PGUSER, "reflab_prod_preflight_ro");
      return new Map([["production_installer_identity", payload]]);
    },
  });
  assert.doesNotThrow(() => assertReadOnlyBatch(observedSql));
  assert.equal(result.readOnly, true);
  assert.equal(result.classification.decision, "PASS");
  assert.match(installerIdentityQuery.payloadSql, /pg_catalog\.pg_auth_members/);
  assert.doesNotMatch(installerIdentityQuery.payloadSql, /rolpassword|set\s+role/i);
});

test("installer identity attestation fails closed for missing config, inherited PG state, and caller drift", () => {
  assert.throws(() => runProductionInstallerIdentityAttestation({}), /explicit read-only opt-in/);
  assert.throws(() => assertNoInheritedPgState({ PGOPTIONS: "unsafe" }), /PGOPTIONS/);
  const readOnlyEnvironment = {
    [PREFLIGHT_OPT_IN]: "true",
    [PREFLIGHT_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PREFLIGHT_DATABASE_URL]: `postgresql://reflab_prod_preflight_ro:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
  };
  assert.throws(() => runProductionInstallerIdentityAttestation(readOnlyEnvironment, {
    execute: () => new Map([["production_installer_identity", {
      caller: "another_role", session_user: "another_role",
    }]]),
  }), /caller contract/);
});

test("installer identity classification never passes unknown memberships or elevated attributes", () => {
  const base = {
    installer: {
      rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true,
      rolsuper: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false,
    },
    database: { postgres_has_create: true },
    memberships: [],
  };
  assert.equal(classifyInstallerIdentity(base).decision, "PASS");
  assert.equal(classifyInstallerIdentity({ ...base, memberships: [{ granted_role: "unexpected" }] }).decision, "UNKNOWN");
  assert.equal(classifyInstallerIdentity({ ...base, installer: { ...base.installer, rolreplication: true } }).decision, "UNKNOWN");
});

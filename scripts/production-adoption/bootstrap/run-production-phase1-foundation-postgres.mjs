import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  classifyPhase1DdlEntry,
  phase1EntryQuery,
} from "./phase1-entry-attestation-contract.mjs";
import {
  assertPhase1FoundationArtifact,
  classifyPhase1PostAttestation,
  phase1PostAttestationQuery,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  psql,
  roleBootstrapSql,
  withCluster,
} from "./run-production-role-bootstrap-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function payload(environment, query) {
  const output = psql(environment, `begin read only; select (${query.payloadSql})::text; rollback;`).stdout.trim();
  return JSON.parse(output);
}

function createHistoricalFingerprintFixture(environment) {
  psql(environment, `
    create table public.attempts(id integer primary key);
    create table public.exam_results(id integer primary key);
    create table public.notifications(id integer primary key);
    insert into public.attempts select value from pg_catalog.generate_series(1, 37) value;
    insert into public.exam_results select value from pg_catalog.generate_series(1, 6) value;
    insert into public.notifications select value from pg_catalog.generate_series(1, 60) value;
  `, "supabase_admin");
}

function assertPg18VersionOnlyBlock(classification, label) {
  if (classification.decision !== "BLOCKER" || classification.postgresMajorExact !== false) {
    throw new Error(`${label} did not preserve the PostgreSQL 17 fail-closed gate.`);
  }
  for (const [field, value] of Object.entries(classification)) {
    if ([
      "decision", "phase1Entry", "phase1PostState", "postgresMajorExact",
      "installerPostBootstrapReady", "installerReady",
    ].includes(field)) continue;
    if (typeof value === "boolean" && value !== true) {
      throw new Error(`${label} failed non-version field ${field}.`);
    }
  }
}

async function positive() {
  return withCluster("absent", async (environment) => {
    psql(environment, roleBootstrapSql);
    createHistoricalFingerprintFixture(environment);
    const artifact = assertPhase1FoundationArtifact(root);
    const beforeFingerprint = payload(environment, phase1ProductFingerprintQuery);
    const installerBefore = classifyInstallerIdentity(payload(environment, installerIdentityQuery));
    if (installerBefore.lifecycleState !== "POST_BOOTSTRAP"
        || installerBefore.membershipFingerprintExact !== true
        || installerBefore.requiredAttributesExact !== true
        || installerBefore.databaseCreate !== true
        || installerBefore.protectedRoleExact !== true
        || installerBefore.postgresMajorExact !== false) {
      throw new Error("Phase 1 local installer fixture is not structurally exact.");
    }
    const entryBefore = classifyPhase1DdlEntry(payload(environment, phase1EntryQuery), installerBefore);
    assertPg18VersionOnlyBlock(entryBefore, "Phase 1 pre-DDL rehearsal");

    psql(environment, artifact.sql);

    const installerAfter = classifyInstallerIdentity(payload(environment, installerIdentityQuery));
    const afterFingerprint = payload(environment, phase1ProductFingerprintQuery);
    const postEvidence = payload(environment, phase1PostAttestationQuery);
    const post = classifyPhase1PostAttestation(
      postEvidence,
      installerAfter,
      beforeFingerprint,
      afterFingerprint,
    );
    assertPg18VersionOnlyBlock(post, "Phase 1 post-DDL rehearsal");
    if (postEvidence.schema_state_rows !== 0 || postEvidence.ledger_rows !== 1
        || postEvidence.ledger_exact !== true || post.productFingerprintPreserved !== true) {
      throw new Error("Phase 1 PostgreSQL positive postcondition failed.");
    }
    return {
      migration: "PASS",
      structuralPostcondition: "PASS",
      productFingerprint: "PASS",
      schemaStateRows: 0,
      ledger: "foundation/1",
      postgresMajor: Math.trunc(postEvidence.server_version_num / 10000),
      productionVersionGate: "EXPECTED_BLOCKER_NON_PG17",
      cleanup: "PASS",
    };
  });
}

async function rollback() {
  return withCluster("absent", async (environment) => {
    psql(environment, roleBootstrapSql);
    createHistoricalFingerprintFixture(environment);
    const artifact = assertPhase1FoundationArtifact(root);
    const failingSql = artifact.sql.replace(/\ncommit;\s*$/i, `
do $forced_failure$ begin
  raise exception 'phase1 local rollback rehearsal' using errcode = '55000';
end $forced_failure$;
commit;
`);
    if (failingSql === artifact.sql) throw new Error("Phase 1 rollback mutation was not installed.");
    const result = psql(environment, failingSql, "postgres", true);
    const sqlstate = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
    if (result.status === 0 || sqlstate !== "55000") {
      throw new Error("Phase 1 rollback rehearsal did not abort with SQLSTATE 55000.");
    }
    const absence = psql(environment, `select pg_catalog.to_regnamespace('reflab_meta') is null
      and pg_catalog.to_regnamespace('reflab_private') is null;`).stdout.trim();
    const fingerprint = payload(environment, phase1ProductFingerprintQuery);
    if (absence !== "t" || fingerprint.attempts !== 37
        || fingerprint.exam_results !== 6 || fingerprint.notifications !== 60) {
      throw new Error("Phase 1 rollback did not preserve the pre-DDL state.");
    }
    return { expectedSqlstate: "55000", observedSqlstate: sqlstate, abort: "PASS", rollback: "PASS", cleanup: "PASS" };
  });
}

export async function runPhase1FoundationPostgresRehearsal() {
  return {
    localOnly: true,
    positive: await positive(),
    rollback: await rollback(),
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1FoundationPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_FOUNDATION_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}

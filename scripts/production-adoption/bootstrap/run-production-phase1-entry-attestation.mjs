import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
  assertNoInheritedPgState,
} from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_ENTRY_FORMAT,
  PHASE1_ENTRY_QUERY_ID,
  PHASE1_FOUNDATION_ARTIFACT,
  assertPhase1ArtifactHash,
  classifyPhase1Entry,
  phase1EntryQuery,
} from "./phase1-entry-attestation-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export function runProductionPhase1EntryAttestation(environment = process.env, dependencies = {}) {
  assertNoInheritedPgState(environment);
  const artifactHash = (dependencies.assertArtifact ?? assertPhase1ArtifactHash)(root);
  const authorize = dependencies.authorize ?? authorizeProductionPreflightTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = authorize(environment);
  const sql = buildSqlBatch([installerIdentityQuery, phase1EntryQuery]);
  const results = execute(sql, target.connectionEnvironment, { processEnvironment: environment });
  const installerEvidence = results.get(installerIdentityQuery.id);
  const phase1Evidence = results.get(PHASE1_ENTRY_QUERY_ID);
  const installer = classifyInstallerIdentity(installerEvidence);
  const phase1 = classifyPhase1Entry(phase1Evidence, installer);

  return {
    format: PHASE1_ENTRY_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    caller: "reflab_prod_preflight_ro",
    readOnly: true,
    artifact: { path: PHASE1_FOUNDATION_ARTIFACT, sha256: artifactHash },
    installer,
    phase1,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve().then(() => runProductionPhase1EntryAttestation())
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`PRODUCTION_PHASE1_ENTRY_ATTESTATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}

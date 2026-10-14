import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { FORMAT, COMPLETE, policyDependencyEvidence, policyRoleActionEvidence, hashBytes, inspectCatalogTree, functionEvidenceComplete,
  serializeCurrentHarness, safeHarnessFailure } from "./phase3-additional-browser-forensic-contract.mjs";

export function parseSavedBrowserForensic(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("ARCHIVE_BYTES_REQUIRED");
  const text = bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? "utf16le" : "utf8").replace(/^\uFEFF/, "");
  const start = text.search(/^\s*\{/m);
  if (start < 0) throw new Error("ARCHIVE_JSON_MISSING");
  const evidence = JSON.parse(text.slice(start));
  if (evidence.format !== FORMAT) throw new Error("ARCHIVE_FORMAT_MISMATCH");
  return evidence;
}

export function reprocessBrowserForensic(archive) {
  if (archive.format !== FORMAT || archive.transactionReadOnly !== true || archive.transaction !== "ROLLBACK"
    || ["mutationCount", "ddlCount", "dmlCount", "migrationInvocationCount"].some((key) => archive[key] !== 0))
    throw new Error("ARCHIVE_READ_ONLY_EVIDENCE_REQUIRED");
  const inventory = { policies: archive.additionalRuntimePolicies, tables: archive.additionalRuntimeTables,
    columns: archive.additionalRuntimeTables.flatMap((t) => t.columns), roleAttributes: archive.roleAttributes,
    operatorFunctions: archive.additionalRuntimePolicyOperatorFunctions ?? [],
    policyTypeIoCatalog: archive.additionalRuntimePolicyTypeIoCatalog ?? undefined };
  const policies = policyDependencyEvidence(inventory, archive.additionalRuntimePolicyFunctions);
  const roleActionEvidence = policyRoleActionEvidence(policies, archive.additionalRuntimePolicyRoleApplicability);
  const originalDependencyReasons = new Set(archive.additionalRuntimePolicies.flatMap((p) =>
    [p.usingDependencyEvidence?.reason, p.withCheckDependencyEvidence?.reason, ...(p.dependencyUnknownChecks ?? [])].filter(Boolean)));
  const unknownChecks = [...new Set([
    ...archive.unknownChecks.filter((r) => r !== "policyReferencesResolved" && r !== "functionsComplete" && !originalDependencyReasons.has(r)),
    ...policies.flatMap((p) => p.dependencyUnknownChecks),
    ...(!policies.every((p) => p.dependencyComplete) ? ["policyReferencesResolved"] : []),
  ])];
  const nestedFunctionOids = archive.additionalRuntimePolicyFunctions.flatMap((f) => [
    ...f.catalogDependencies.filter((d) => d.catalog === "pg_proc").map((d) => d.oid),
    ...inspectCatalogTree(f.sqlBodyTree, inventory.operatorFunctions).functionOids]);
  const missingFunctionOids = [...new Set([...policies.flatMap((p) => p.missingFunctionOids), ...nestedFunctionOids.filter((oid) =>
    !archive.additionalRuntimePolicyFunctions.some((f) => f.oid === oid && functionEvidenceComplete(f)))])].sort((a,b) => a-b);
  if (missingFunctionOids.length) unknownChecks.push("functionsComplete");
  const requiredTypeOids = [...new Set(policies.flatMap((p) => [p.usingDependencyEvidence, p.withCheckDependencyEvidence]
    .flatMap((e) => e.requiredTypeOids ?? [])))].sort((a,b) => a-b);
  const context = (prior) => ({ ...prior, policies: policies.filter((p) => prior.policies.some((old) => old.oid === p.oid)),
    roleActionEvidence: roleActionEvidence.filter((r) => r.table === prior.table && r.command === (prior.table === "clips" ? "r" : "a")),
    policyFunctionOids: policies.some((p) => prior.policies.some((old) => old.oid === p.oid) && !p.dependencyComplete)
      ? null : [...new Set(policies.filter((p) => prior.policies.some((old) => old.oid === p.oid)).flatMap((p) => p.resolvedFunctionOids))] });
  return { ...archive, classification: archive.failedChecks.length ? "BLOCKER" : unknownChecks.length ? "UNKNOWN" : COMPLETE,
    observationComplete: !archive.failedChecks.length && !unknownChecks.length, unknownChecks,
    checks: { ...archive.checks, policyReferencesResolved: policies.every((p) => p.dependencyComplete), functionsComplete: missingFunctionOids.length === 0 },
    additionalRuntimePolicies: policies, additionalRuntimePolicyRoleActionEvidence: roleActionEvidence,
    additionalRuntimeTables: archive.additionalRuntimeTables.map((t) => ({ ...t, policies: policies.filter((p) => p.table === t.table) })),
    institutionalLeadsEvidence: context(archive.institutionalLeadsEvidence), clipsEvidence: context(archive.clipsEvidence),
    localReprocessing: { basis: "ARCHIVED_PRODUCTION_CATALOG_ONLY_NO_LOCAL_CATALOG_SUBSTITUTION", remoteConnection: "NOT_EXECUTED",
      missingFunctionOids, requiredTypeOids, typeCatalogObservation: inventory.policyTypeIoCatalog === undefined ? "NOT_CAPTURED" : "ARCHIVED",
      integrityFacts: "ARCHIVED_REMOTE_FACTS_NOT_CURRENT_LOCAL_TOOLING_ATTESTATION",
      authorization: "NONE" }, remoteBrowserForensicAuthorized: false, remoteDdlAuthorized: false };
}

export function reprocessBrowserFile(path) {
  const bytes = readFileSync(path), report = reprocessBrowserForensic(parseSavedBrowserForensic(bytes));
  return { ...report, archiveBytesSha256: hashBytes(bytes) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error("ONE_LOCAL_ARCHIVE_PATH_REQUIRED");
    const report = reprocessBrowserFile(process.argv[2]);
    process.stdout.write(serializeCurrentHarness(report, {}) + "\n");
    process.exitCode = report.classification === COMPLETE ? 0 : 1;
  } catch (error) { process.stderr.write(safeHarnessFailure(error) + "\n"); process.exitCode = 1; }
}

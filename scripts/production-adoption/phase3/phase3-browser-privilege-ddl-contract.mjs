import { createHash } from "node:crypto";
import { maskSqlCommentsAndStrings, assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { browserPrivilegeInventoryQuery } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { BROWSER_MIGRATION_SHA, canonicalBrowserBaseline, observeBrowserTransitionResults, browserMutationAccounting } from "./phase3-browser-privilege-contract.mjs";
import { classifyBrowserPreAttestation, classifyLocalBrowserPreAttestation } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { BROWSER_TABLES } from "./phase3-browser-privilege-matrix.mjs";

export const BROWSER_DDL_FORMAT = "REFLAB_64249_ISOLATED_PRODUCTION_EXECUTION_V1";
export const BROWSER_DDL_BEGIN = `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local transaction_timeout='180s';
set local idle_in_transaction_session_timeout='15s';
lock table ${[...BROWSER_TABLES].sort().map((t) => `public.${t}`).join(", ")} in access exclusive mode;`;
export const BROWSER_DDL_ZERO = Object.freeze({ effectivePrivilegeRevocations: 0, anonRevocations: 0,
  authenticatedRevocations: 0, tableGrants: 0, columnGrants: 0, sqlRevokeStatements: 0, sqlGrantStatements: 0,
  serviceRoleMutations: 0, policyMutations: 0, functionMutations: 0, ownerMutations: 0,
  rlsMutations: 0, forceRlsMutations: 0, schemaMutations: 0, indexMutations: 0,
  constraintMutations: 0, triggerMutations: 0, productDml: 0, adoptionWrites: 0, runtimeWrites: 0, cutoverWrites: 0 });
const sha = (v) => createHash("sha256").update(v).digest("hex");
const equal = (a, b) => JSON.stringify(canonicalBrowserBaseline(a)) === JSON.stringify(canonicalBrowserBaseline(b));

// Quoted PL/pgSQL bodies are opaque. Only the five verified top-level statements are parsed.
export function validateBrowserDdlEnvelope(source) {
  const masked = maskSqlCommentsAndStrings(source);
  if (/\\/.test(masked)) throw new Error("TRANSACTION_ENVELOPE_REJECTED");
  const statements = [...masked.matchAll(/([^;]*);/g)].map((m) => ({ text: m[1].trim().replace(/\s+/g, " ").toLowerCase(),
    start: m.index, end: m.index + m[0].length })).filter((s) => s.text);
  if (statements.length !== 5 || statements[0].text !== "begin" || statements.at(-1).text !== "commit"
    || statements[1].text !== "set local lock_timeout =" || statements[2].text !== "set local statement_timeout ="
    || statements[3].text !== "do" || masked.slice(statements.at(-1)?.end ?? 0).trim())
    throw new Error("TRANSACTION_ENVELOPE_REJECTED");
  const first = statements[0], last = statements.at(-1);
  const start = masked.indexOf("begin", first.start), end = masked.indexOf("commit", last.start);
  if (source.slice(start, first.end) !== "begin;" || source.slice(end, last.end) !== "commit;")
    throw new Error("TRANSACTION_ENVELOPE_REJECTED");
  return { body: source.slice(0, start) + source.slice(first.end, end) + source.slice(last.end),
    removed: [{ start, end: first.end }, { start: end, end: last.end }] };
}
export function extractBrowserDdlBody(bytes) {
  if (!Buffer.isBuffer(bytes) || sha(bytes) !== BROWSER_MIGRATION_SHA) throw new Error("MIGRATION_SHA_MISMATCH");
  const result = validateBrowserDdlEnvelope(bytes.toString("utf8"));
  return { ...result, bodySha: sha(result.body) };
}
export function assertBrowserDdlBody(body, verifiedBytes) {
  if (body !== extractBrowserDdlBody(verifiedBytes).body) throw new Error("MIGRATION_BODY_PARITY_REJECTED");
}
export function buildBrowserDdlObservation() {
  const sql = [jsonQuery("read_only_guard", "pg_catalog.current_setting('transaction_read_only')"),
    installerIdentityQuery, identityBridgePostQuery, corePolicyQuery, coreBaselineAdoptionQuery,
    browserPrivilegeInventoryQuery].map((q) => q.sql).join(";\n") + ";\n";
  assertReadOnlySql(sql);
  return sql;
}
export function observeBrowserDdlEvidence(evidence) {
  if (!(evidence instanceof Map) || evidence.get("read_only_guard") !== "off") throw new Error("WRITE_TRANSACTION_GUARD_FAILED");
  return observeBrowserTransitionResults(evidence);
}
function executionClassification(observation, verification, classify) {
  const { transactionReadOnly, ...collection } = observation.checks ?? {};
  const transportExact = observation.transactionReadOnly === false && transactionReadOnly === false;
  const collectionExact = Object.values(collection).every((v) => v === true)
    && (observation.failedChecks ?? []).every((k) => k === "transactionReadOnly") && !observation.unknownChecks?.length;
  // Catalog checks are reused via a transport-only projection. Actual evidence and output stay writable.
  const projection = { ...observation, transactionReadOnly: true, classification: collectionExact ? "OBSERVATION_COMPLETE" : "BLOCKER",
    checks: { ...collection, transactionReadOnly: true }, failedChecks: (observation.failedChecks ?? []).filter((k) => k !== "transactionReadOnly") };
  const r = classify(projection, verification);
  const { transactionReadOnly: _readOnly, ...checks } = r.checks;
  void _readOnly;
  checks.runnerOwnedWriteTransaction = transportExact;
  checks.completeLiveCollection = collectionExact;
  const failedChecks = [...r.failedChecks.filter((k) => k !== "transactionReadOnly"),
    ...Object.keys(checks).filter((k) => ["runnerOwnedWriteTransaction", "completeLiveCollection"].includes(k) && checks[k] !== true)];
  const exact = !failedChecks.length && !r.unknownChecks.length;
  return { classification: exact ? r.classification : "BLOCKER", executablePre: exact && r.executablePre,
    failedChecks, unknownChecks: r.unknownChecks, checks, transactionReadOnly: false };
}
export const classifyBrowserDdlEvidence = (observation, verification) => executionClassification(observation, verification, classifyBrowserPreAttestation);
export function classifyLocalBrowserDdlEvidence(observation, verification, proof) {
  return executionClassification(observation, verification, (o, v) => classifyLocalBrowserPreAttestation(o, v, proof));
}
export function assertBrowserDdlAccounting(before, after) {
  const infrastructure = (o) => ({ tables: o.tables.map(({ raw_acl: _acl, acl_origin: _origin, ...t }) => { void _acl; void _origin; return t; }),
    columns: o.columns.map(({ raw_acl: _acl, ...c }) => { void _acl; return c; }), policies: o.policies,
    tableAcls: o.tableAcls.filter((a) => !["anon", "authenticated"].includes(a.grantee)),
    columnAcls: o.columnAcls.filter((a) => !["anon", "authenticated"].includes(a.grantee)),
    identity: o["64236State"], core: o["64245PostState"], adoption: o.adoptionState, historical: o.historicalState });
  if (!equal(infrastructure(before), infrastructure(after))) throw new Error("PRESERVATION_MISMATCH");
  const delta = (a, b) => a.filter((v) => !b.some((w) => equal(v, w)));
  const removed = delta(before.tableAcls, after.tableAcls), added = delta(after.tableAcls, before.tableAcls);
  const columns = delta(after.columnAcls, before.columnAcls), columnRemoved = delta(before.columnAcls, after.columnAcls);
  const expected = browserMutationAccounting();
  if (!equal(removed, expected.tableRevokes) || !equal(added, expected.tableGrants)
    || !equal(columns, expected.columnGrants) || columnRemoved.length) throw new Error("ACL_MUTATION_ACCOUNTING_MISMATCH");
  const revokedEffective = before.effectiveBrowserPrivileges.filter((r) => r.granted && after.effectiveBrowserPrivileges.some((a) =>
    a.table === r.table && a.role === r.role && a.privilege === r.privilege && !a.granted));
  if (revokedEffective.length !== 122 || revokedEffective.filter((r) => r.role === "anon").length !== 48)
    throw new Error("EFFECTIVE_MUTATION_ACCOUNTING_MISMATCH");
  return { ...BROWSER_DDL_ZERO, effectivePrivilegeRevocations: removed.length, anonRevocations: 48,
    authenticatedRevocations: 74, tableGrants: added.length, columnGrants: columns.length,
    sqlRevokeStatements: 18, sqlGrantStatements: 3 };
}

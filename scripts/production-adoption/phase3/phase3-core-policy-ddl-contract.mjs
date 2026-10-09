import { createHash } from "node:crypto";
import { maskSqlCommentsAndStrings, assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { identityBridgePostQueries, IDENTITY_BRIDGE_POST_QUERY_ID, classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CORE_POLICY_SHA256, CORE_POLICY_QUERY_ID, CORE_POLICY_TABLES, corePolicyQuery,
  preservedCorePolicies, classifyCorePolicyInventory } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery, CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { classifyCorePolicyPreAttestation } from "./phase3-core-policy-pre-attestation-contract.mjs";
import { APPROVED_CORE_POLICY_PRODUCTION_BASELINE, sameCorePolicyBaseline } from "./phase3-core-policy-production-baseline-contract.mjs";
import { classifyCanonicalRuntimeInstalledEvidence } from "../phase2b/run-production-phase2b-canonical-runtime-installed.mjs";
import { classifyCanonicalRuntimeInstalledComposition } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { classifyPhase2aSemanticAuditPost, phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import { classifyCanonicalCommunicationCompletionPreservation, CANONICAL_COMMUNICATION_POST_QUERY_ID } from "../phase2b/phase2b-canonical-communication-feedback-contract.mjs";

export const CORE_POLICY_DDL_FORMAT = "REFLAB_64245_ISOLATED_PRODUCTION_EXECUTION_V1";
export const CORE_POLICY_BODY_SHA256 = "a30878157daca5344edd4852f7abe99e8bcf2faa1e865d6e18731d1dcd12e43a";
export function assertCorePolicyBodyParity(body) {
  if (typeof body !== "string" || createHash("sha256").update(body).digest("hex") !== CORE_POLICY_BODY_SHA256)
    throw new Error("MIGRATION_BODY_PARITY_REJECTED");
}
export const CORE_POLICY_TRANSACTION_SETTINGS = "set local lock_timeout='5s';\nset local statement_timeout='90s';\nset local transaction_timeout='180s';\nset local idle_in_transaction_session_timeout='15s';";
export const CORE_POLICY_LOCK_SQL = `lock table ${[...CORE_POLICY_TABLES].sort().map((t) => `public.${t}`).join(", ")} in access exclusive mode;`;
export const CORE_POLICY_BEGIN_SQL = `begin;\n${CORE_POLICY_TRANSACTION_SETTINGS}\n${CORE_POLICY_LOCK_SQL}`;

// Only top-level statements are considered; PL/pgSQL dollar-quoted bodies are opaque.
export function validateCorePolicyEnvelope(source) {
  const masked = maskSqlCommentsAndStrings(source);
  if (/\\/.test(masked)) throw new Error("TRANSACTION_ENVELOPE_REJECTED");
  const statements = [...masked.matchAll(/([^;]*);/g)].map((m) => ({
    text: m[1].trim().replace(/\s+/g, " ").toLowerCase(), start: m.index, end: m.index + m[0].length,
  })).filter((s) => s.text);
  if (statements.length !== 12 || statements[0].text !== "begin" || statements.at(-1).text !== "commit"
    || masked.slice(statements.at(-1)?.end ?? 0).trim()
    || statements.slice(1, -1).some((s) => /^(?:begin|commit|rollback|end|start\s+transaction|savepoint|release|prepare\s+transaction|set\s+(?:local\s+)?transaction)\b/.test(s.text)))
    throw new Error("TRANSACTION_ENVELOPE_REJECTED");
  const first = statements[0], last = statements.at(-1);
  const beginStart = masked.indexOf("begin", first.start);
  const commitStart = masked.indexOf("commit", last.start);
  if (source.slice(beginStart, first.end) !== "begin;" || source.slice(commitStart, last.end) !== "commit;")
    throw new Error("TRANSACTION_ENVELOPE_REJECTED");
  const body = source.slice(0, beginStart) + source.slice(first.end, commitStart) + source.slice(last.end);
  return { body, removed: [{ start: beginStart, end: first.end }, { start: commitStart, end: last.end }] };
}
export function extractCorePolicyMigrationBody(bytes) {
  if (!Buffer.isBuffer(bytes) || createHash("sha256").update(bytes).digest("hex") !== CORE_POLICY_SHA256)
    throw new Error("MIGRATION_SHA_MISMATCH");
  const extracted = validateCorePolicyEnvelope(bytes.toString("utf8"));
  assertCorePolicyBodyParity(extracted.body);
  return extracted;
}
export function buildCorePolicyExecutionObservation() {
  const guard = jsonQuery("read_only_guard", "pg_catalog.current_setting('transaction_read_only')");
  const counts = [0, 0, 0, 1, 1, 3, 1, 1, 0];
  const executionQueries = identityBridgePostQueries.map((q, index) => {
    const predicate = /pg_catalog\.current_setting\('transaction_read_only'\)\s*=\s*'on'/g;
    if ([...q.payloadSql.matchAll(predicate)].length !== counts[index]) throw new Error("TRANSPORT_QUERY_PARITY_REJECTED");
    return jsonQuery(q.id, q.payloadSql.replace(predicate, "pg_catalog.current_setting('transaction_read_only')='off'"));
  });
  const sql = [guard, ...executionQueries, corePolicyQuery, coreBaselineAdoptionQuery].map((q) => q.sql).join(";\n") + ";\n";
  assertReadOnlySql(sql);
  return sql;
}

// Reuse every authoritative state check without falsifying the READ ONLY evidence.
// A runner-owned writable transaction explicitly replaces only that transport check.
export function classifyCorePolicyExecutionPredecessors(evidence) {
  const predecessor = classifyCanonicalRuntimeInstalledEvidence(evidence, { post: true });
  const payload = evidence.get(phase2aSemanticAuditPostQuery.id);
  const phase2a = classifyPhase2aSemanticAuditPost({ ...payload,
    checks: { ...payload?.checks, phase2bAbsent: true, ledgerExact: true },
    counts: { ...payload?.counts, ledger_rows: 3 } }, { transactionReadOnly: "off" });
  const communication = classifyCanonicalCommunicationCompletionPreservation(
    evidence.get(CANONICAL_COMMUNICATION_POST_QUERY_ID), { transactionReadOnly: "off" });
  const components = { ...predecessor, phase2a, communication };
  return { ...components, composition: classifyCanonicalRuntimeInstalledComposition(components, { post: true }) };
}
export function classifyCorePolicyExecutionEvidence(evidence, approval = APPROVED_CORE_POLICY_PRODUCTION_BASELINE, composition) {
  const classifyIdentity = (e) => classifyIdentityBridgePostBatch(e, { classifyPredecessor: classifyCorePolicyExecutionPredecessors });
  const original = classifyCorePolicyPreAttestation(evidence, approval, {
    classifyIdentity,
    classifyCore: (e, baseline) => classifyCorePolicyInventory(e.get(CORE_POLICY_QUERY_ID), baseline,
      classifyIdentity(e).classification === "EXACT"),
    ...composition,
  });
  const { transactionReadOnly, ...stateChecks } = original.checks;
  const checks = { ...stateChecks, runnerOwnedWriteTransaction: evidence instanceof Map
    && evidence.get("read_only_guard") === "off" && transactionReadOnly === false };
  const failedChecks = Object.keys(checks).filter((k) => checks[k] === false);
  const unknownChecks = Object.keys(checks).filter((k) => checks[k] === "UNKNOWN" || checks[k] == null);
  const exact = !failedChecks.length && !unknownChecks.length;
  const state = original.targetPolicyState.classification;
  const classification = exact && state === "EXECUTABLE_PRE" ? "64245_PRE_EXECUTABLE_EXACT"
    : exact && state === "ALREADY_INSTALLED_POST" ? "64245_ALREADY_INSTALLED_POST" : "BLOCKER";
  return { ...original, checks, failedChecks, unknownChecks, checkCount: Object.keys(checks).length,
    classification, executablePre: classification === "64245_PRE_EXECUTABLE_EXACT", transactionReadOnly: false };
}
export function corePolicyPreservationSnapshot(evidence) {
  const p = evidence.get(CORE_POLICY_QUERY_ID);
  return { tables: p.tables, tableAcl: p.table_acl, columnAcl: p.column_acl,
    preservedPolicies: preservedCorePolicies(p.policies), historical: [p.productFingerprint, p.protectedObjectsHash],
    identity: evidence.get(IDENTITY_BRIDGE_POST_QUERY_ID), adoption: evidence.get(CORE_BASELINE_ADOPTION_QUERY_ID) };
}
export function assertCorePolicyTransitionAccounting(before, after) {
  if (!sameCorePolicyBaseline(corePolicyPreservationSnapshot(before), corePolicyPreservationSnapshot(after)))
    throw new Error("POST_PRESERVATION_MISMATCH");
  const ids = (e) => new Set(e.get(CORE_POLICY_QUERY_ID).policies.map((p) => `${p.table}.${p.name}.${p.oid}`));
  const pre = ids(before), post = ids(after);
  const drops = [...pre].filter((id) => !post.has(id)).length;
  const creates = [...post].filter((id) => !pre.has(id)).length;
  if (drops !== 7 || creates !== 22) throw new Error("POLICY_MUTATION_ACCOUNTING_MISMATCH");
  return { ...CORE_POLICY_DDL_ZERO_MUTATIONS, policyDrops: drops, policyCreates: creates };
}
export const CORE_POLICY_DDL_ZERO_MUTATIONS = Object.freeze({ policyDrops: 0, policyCreates: 0,
  productInserts: 0, productUpdates: 0, productDeletes: 0, productBackfill: 0, ledgerWrites: 0,
  schemaStateWrites: 0, canonicalMarkerWrites: 0, notifications: 0, runtimeEnablement: 0,
  cutover: 0, phase4Writes: 0, functionMutations: 0, grants: 0, revokes: 0, ownerTransfers: 0,
  rlsChanges: 0, forceRlsChanges: 0, indexes: 0, constraints: 0, triggers: 0, schemaMutations: 0 });

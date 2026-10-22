import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import { canonicalRuntimePrerequisitesPostQuery } from "../phase2b/phase2b-canonical-runtime-prerequisites-contract.mjs";
import { adminCanonicalAccessPostQuery } from "../phase2b/phase2b-admin-canonical-access-contract.mjs";
import { canonicalCommunicationPostQuery } from "../phase2b/phase2b-canonical-communication-feedback-contract.mjs";
import { canonicalRuntimeInstalledPostQuery } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { classifyCanonicalRuntimeInstalledEvidence } from "../phase2b/run-production-phase2b-canonical-runtime-installed.mjs";
import { identitySecurityBridgePreQuery } from "./phase3-identity-security-bridge-pre-attestation-contract.mjs";
import { identityMembershipsExact } from "./phase3-identity-pre-input.mjs";

// Reviewed intermediate 64236 POST, previously exercised by the PG17 rehearsal.
const postFunctions = [
  ["reflab_private.request_user_id()", "text", false, "postgres", "e8f03466a3552a13b61c5555e9bed5a8fb392d4236d9fd69fea720fc529cbcd5", ["postgres", "authenticated", "reflab_rls_owner"]],
  ["reflab_private.is_super_admin()", "boolean", true, "reflab_rls_owner", "5daabe23a490557055a2129814bf408ebf2af42604ad21d25226cce01e4b9986", ["reflab_rls_owner", "authenticated"]],
  ...["institution", "platform", "reflab"].map((name) => [`public.${name}_request_user_id()`, "text", false, "postgres", "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c", ["postgres", "authenticated", "service_role"]]),
];
const signatures = postFunctions.map(([signature]) => `'${signature}'`).join(",");
export const identityBridgePostEvidenceSql = `select pg_catalog.jsonb_build_object(
  'functions', (select jsonb_agg(jsonb_build_object(
    'signature', n.nspname || '.' || p.proname || '()', 'identity_arguments', pg_get_function_identity_arguments(p.oid),
    'result_type', pg_get_function_result(p.oid), 'language', l.lanname, 'volatility', p.provolatile,
    'strict', p.proisstrict, 'security_definer', p.prosecdef, 'leakproof', p.proleakproof, 'kind', p.prokind,
    'owner', pg_get_userbyid(p.proowner), 'configuration', p.proconfig, 'proacl', p.proacl,
    'source_hash', encode(extensions.digest(convert_to(pg_catalog.regexp_replace(
      p.prosrc,'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8'),'sha256'),'hex')) order by n.nspname,p.proname)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid in (select to_regprocedure(s) from unnest(array[${signatures}]) s)),
  'acl', (select jsonb_agg(jsonb_build_object('signature', n.nspname || '.' || p.proname || '()',
    'grantee', case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'grantor', pg_get_userbyid(a.grantor), 'privilege', a.privilege_type, 'grantable', a.is_grantable)
    order by n.nspname,p.proname,a.grantee,a.grantor)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid in (select to_regprocedure(s) from unnest(array[${signatures}]) s)),
  'rls_owner_create', has_schema_privilege('reflab_rls_owner','public','CREATE')
    or has_schema_privilege('reflab_rls_owner','reflab_private','CREATE'),
  'ledger_rows', (select count(*) from reflab_meta.production_adoption_state),
  'schema_state_rows', (select count(*) from reflab_meta.reflab_schema_state)
)::text;`;

export function identityBridgePostExact(evidence) {
  if (!Array.isArray(evidence?.functions) || !Array.isArray(evidence?.acl)) return false;
  const canonical = (rows) => rows.map((r) => JSON.stringify(Object.fromEntries(
    Object.entries(r).sort(([a], [b]) => a.localeCompare(b))))).sort().join("\n");
  const expectedAcl = postFunctions.flatMap(([signature, , , owner, , grantees]) =>
    grantees.map((grantee) => ({ signature, grantee, grantor: owner, privilege: "EXECUTE", grantable: false })));
  return evidence.functions.length === 5 && postFunctions.every(([signature, result, definer, owner, source]) => {
    const f = evidence.functions.find((row) => row.signature === signature);
    return f?.identity_arguments === "" && f.result_type === result && f.language === "sql"
      && f.volatility === "s" && f.strict === false && f.security_definer === definer
      && f.leakproof === false && f.kind === "f" && f.owner === owner
      && JSON.stringify(f.configuration) === '["search_path=pg_catalog"]' && f.source_hash === source;
  }) && canonical(evidence.acl) === canonical(expectedAcl)
    && evidence.rls_owner_create === false && evidence.ledger_rows === 4 && evidence.schema_state_rows === 0;
}

export const IDENTITY_BRIDGE_POST_QUERY_ID = "phase3_identity_security_bridge_post";
export const identityBridgePostQuery = jsonQuery(IDENTITY_BRIDGE_POST_QUERY_ID,
  identityBridgePostEvidenceSql.slice("select ".length).replace(/::text;$/, ""));

function atIdentityBridgeStage(query) {
  const boundary = "pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null";
  if (query.payloadSql.split(boundary).length !== 2) throw new Error("IDENTITY_STAGE_QUERY_PARITY_FAILED");
  // Only this installed provider changes stage. set_updated_at/evidence/cutover guards stay intact.
  return jsonQuery(query.id, query.payloadSql.replace(boundary,
    "pg_catalog.to_regprocedure('reflab_private.request_user_id()') is not null"));
}
export const identityBridgePostQueries = Object.freeze([
  installerIdentityQuery, phase1ProductFingerprintQuery, atIdentityBridgeStage(phase2aSemanticAuditPostQuery),
  atIdentityBridgeStage(canonicalRuntimePrerequisitesPostQuery),
  atIdentityBridgeStage(adminCanonicalAccessPostQuery), canonicalCommunicationPostQuery,
  atIdentityBridgeStage(canonicalRuntimeInstalledPostQuery), identitySecurityBridgePreQuery,
  identityBridgePostQuery,
]);
export function buildIdentityBridgePostBatch() {
  return buildSqlBatch(identityBridgePostQueries);
}
export function classifyIdentityBridgePostBatch(results, { classifyPredecessor = classifyCanonicalRuntimeInstalledEvidence } = {}) {
  if (!(results instanceof Map) || identityBridgePostQueries.some((q) => !results.has(q.id))) {
    return { classification: "UNKNOWN" };
  }
  try {
    const predecessor = classifyPredecessor(results, { post: true });
    const identity = results.get(identitySecurityBridgePreQuery.id);
    const checks = {
      predecessorsPreservedExact: predecessor.composition?.classification === "EXACT",
      identityFunctionsExact: identityBridgePostExact(results.get(IDENTITY_BRIDGE_POST_QUERY_ID)),
      roleMembershipsExact: identityMembershipsExact(identity?.roleMemberships, identity?.effectiveRelationships),
      rlsOwnerExact: identity?.checks?.rlsOwnerExact === true,
      browserSchemaCreateAbsent: identity?.checks?.browserSchemaCreateAbsent === true,
      developmentObjectsAbsent: identity?.checks?.developmentIdentityObjectsAbsent === true,
      directReadersExact: JSON.stringify(identity?.direct_identity_readers) === '["reflab_private.request_user_id()"]',
    };
    return { classification: Object.values(checks).every((v) => v === true) ? "EXACT" : "BLOCKER",
      checks, predecessorComponents: predecessor.composition.components,
      failedChecks: Object.keys(checks).filter((k) => !checks[k]) };
  } catch {
    return { classification: "UNKNOWN" };
  }
}

export const IDENTITY_BRIDGE_MUTATIONS = Object.freeze({
  productInserts: 0, productUpdates: 0, productDeletes: 0, productBackfill: 0,
  ledgerWrites: 0, schemaStateWrites: 0, canonicalMarkerWrites: 0, notifications: 0,
  phase4Writes: 0, runtimeEnablement: 0, cutover: 0, functionsCreated: 2,
  wrappersReplaced: 3, functionOwnerTransfers: 1,
});

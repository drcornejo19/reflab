import { readFileSync, readdirSync } from "node:fs";
import { posix, resolve } from "node:path";
import { PINNED_ARTIFACTS } from "./phase3-additional-runtime-pre-contract.mjs";
import { HARNESS_ROOT, TARGET, defaultGit, hashBytes, failHarness, resolveCurrentHarnessTarget,
  serializeCurrentHarness } from "./phase3-current-service-role-pre-contract.mjs";
import { BEGIN, functionEvidenceComplete, functionSourceSha256, SOURCE_HASH_BASIS } from "./phase3-additional-browser-forensic-contract.mjs";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";

export { BEGIN, TARGET, hashBytes, failHarness, functionSourceSha256, SOURCE_HASH_BASIS, serializeCurrentHarness };
export const FORMAT = "REFLAB_ADDITIONAL_RUNTIME_BROWSER_SUPPLEMENTAL_FORENSIC_V1";
export const COMPLETE = "ADDITIONAL_RUNTIME_BROWSER_SUPPLEMENTAL_OBSERVATION_COMPLETE";
export const OPERATION = "--production-additional-runtime-browser-supplemental-forensic";
export const RUNNER = "scripts/production-adoption/phase3/run-production-additional-browser-supplemental-forensic.mjs";
export const ARCHIVE_SHA = "cddebda30d4bf4ff7bb06ed67a4b7497fb7ffd654d28e12705f6bb51b03dc0ec";
export const FUNCTION_OIDS = Object.freeze([2956, 3214]);
export const TYPE_OIDS = Object.freeze([25, 2950]);
export const VARIABLES = Object.freeze(["ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_BROWSER_SUPPLEMENTAL_FORENSIC", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL"]);
export const BOUNDARY = Object.freeze({ purpose: "ARCHIVE_PINNED_SUPPLEMENT_ONLY_NO_BROWSER_TARGET_AUTHORIZATION",
  archiveSha256Expected: ARCHIVE_SHA, initialFunctionOids: FUNCTION_OIDS, typeOids: TYPE_OIDS,
  ioFunctionScope: "ONLY_TYPE_2950_TYPOUTPUT_AND_TYPE_25_TYPINPUT", recursiveDiscovery: false,
  broadInventory: false, mutationAuthorized: false });
const oid = (x) => Number.isSafeInteger(x) && x > 0 && x <= 4294967295;
const exact = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && new Set(actual).size === actual.length && actual.every((x) => expected.includes(x));
export function discoverIoFunctions(types) {
  if (!Array.isArray(types) || !exact(types.map((t) => t?.oid), TYPE_OIDS)
    || types.some((t) => !oid(t.namespaceOid) || typeof t.schema !== "string" || !t.schema
      || typeof t.name !== "string" || !t.name || !oid(t.typinput) || !oid(t.typoutput)))
    failHarness("TYPE_IO_EVIDENCE_INCOMPLETE");
  return [...new Set([types.find((t) => t.oid === 2950).typoutput, types.find((t) => t.oid === 25).typinput])].sort((a, b) => a - b);
}
export function supplementalTypeSql() {
  const sql = jsonQuery("browser_supplemental_types", `(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from
    (select t.oid::bigint as oid,t.typnamespace::bigint as "namespaceOid",n.nspname as schema,t.typname as name,
    t.typinput::oid::bigint as typinput,t.typoutput::oid::bigint as typoutput
    from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.oid in (25,2950) order by t.oid) x)`).sql + ";";
  assertReadOnlySql(sql); return sql;
}
export function supplementalFunctionSql(oids, types = null) {
  const allowed = types === null ? FUNCTION_OIDS : [...new Set([...FUNCTION_OIDS, ...discoverIoFunctions(types)])];
  if (!Array.isArray(oids) || !oids.length || !exact(oids, [...new Set(oids)]) || oids.some((x) => !oid(x) || !allowed.includes(x)))
    failHarness("FUNCTION_SCOPE_REJECTED");
  const sql = jsonQuery("browser_supplemental_functions", `(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from
    (select p.oid::bigint as oid,n.nspname as schema,p.proname as name,
    pg_get_function_identity_arguments(p.oid) as "identityArguments",pg_get_function_result(p.oid) as "returnType",
    l.lanname as language,pg_get_userbyid(p.proowner) as owner,p.prosecdef as "securityDefiner",p.proconfig as configuration,
    p.provolatile as volatility,p.proisstrict as strict,p.proleakproof as leakproof,p.prosrc as "sourceText",p.prosqlbody::text as "sqlBodyTree",
    p.proacl as "rawAcl",
    (select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))) as "executeAclEntryCount",
    (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from
      (select d.refobjid::bigint as oid,d.refclassid::regclass::text as catalog,d.refobjsubid as subobject
       from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid
       and d.refclassid in ('pg_proc'::regclass,'pg_class'::regclass) order by d.refclassid,d.refobjid,d.refobjsubid) d) as "catalogDependencies",
    (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from
      (select p.oid::bigint as function,case when p.proacl is null then 'POSTGRESQL_DEFAULT_ACL' else 'EXPLICIT_ACL' end as basis,
       case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       pg_get_userbyid(a.grantor) as grantor,a.privilege_type as privilege,a.is_grantable as grantable
       from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a order by a.grantee,a.privilege_type,a.grantor) a) as "executeAcls",
    (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from
      (select r.role,case when r.role='PUBLIC' then exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') else has_function_privilege(r.role,p.oid,'EXECUTE') end as effective
       from (select distinct role from (values ('anon'),('authenticated'),('PUBLIC'),('service_role'),(pg_get_userbyid(p.proowner))) v(role)) r order by r.role) e) as "effectiveExecute"
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where p.oid in (${[...oids].sort((a, b) => a-b).join(",")}) order by p.oid) x)`).sql + ";";
  assertReadOnlySql(sql); return sql;
}
export function classifySupplemental(e) {
  const unknownChecks = [];
  const check = (name, valid) => { if (!valid) unknownChecks.push(name); };
  check("transactionReadOnly", e.transactionReadOnly === true);
  let discovered = [];
  try { discovered = discoverIoFunctions(e.typeEvidence); } catch { unknownChecks.push("typeIoEvidence"); }
  check("requestedScope", exact(e.requestedFunctionOids, FUNCTION_OIDS) && exact(e.requestedTypeOids, TYPE_OIDS));
  check("discoveredIoScope", exact(e.discoveredIoFunctionOids, discovered));
  for (const [key, expected] of [["directFunctionEvidence", FUNCTION_OIDS], ["ioFunctionEvidence", discovered]]) {
    const rows = e[key];
    check(key, Array.isArray(rows) && exact(rows.map((f) => f?.oid), expected)
      && rows.every((f) => functionEvidenceComplete(f) && !Object.hasOwn(f, "sourceText")
        && (f.rawAcl === null || typeof f.rawAcl === "string" || Array.isArray(f.rawAcl) && f.rawAcl.every((a) => typeof a === "string"))
        && (f.sqlBodyTree === null || typeof f.sqlBodyTree === "string")
        && (f.configuration === null || Array.isArray(f.configuration) && f.configuration.every((c) => typeof c === "string"))));
  }
  return { ...e, format: FORMAT, classification: unknownChecks.length ? "UNKNOWN" : COMPLETE,
    observationComplete: unknownChecks.length === 0, checks: { supplementalScopeExact: unknownChecks.length === 0 },
    failedChecks: [], unknownChecks, archiveSha256Expected: ARCHIVE_SHA, scopeBoundary: BOUNDARY };
}
export function sameSupplementalFunction(left, right) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const fields = ["oid", "schema", "name", "identityArguments", "returnType", "owner", "securityDefiner", "configuration",
    "language", "volatility", "strict", "leakproof", "sqlBodyTree", "rawAcl", "catalogDependencies", "executeAclEntryCount",
    "executeAcls", "effectiveExecute", "sourceSha256", "sourceHashBasis"];
  const pick = (f) => canonical(Object.fromEntries(fields.map((k) => [k, f[k]])));
  return JSON.stringify(pick(left)) === JSON.stringify(pick(right));
}
export function validateSupplementalForMerge(e, archiveSha, archiveTarget) {
  if (archiveSha !== ARCHIVE_SHA || e.archiveSha256Expected !== ARCHIVE_SHA) failHarness("ARCHIVE_IDENTITY_MISMATCH");
  if (e.format !== FORMAT || e.classification !== COMPLETE || !e.observationComplete || e.transaction !== "ROLLBACK"
    || e.failedChecks?.length !== 0 || e.unknownChecks?.length !== 0 || e.runnerArtifactExact !== true || e.protectedArtifactsExact !== true
    || !/^[a-f0-9]{40}$/.test(e.approvedHead ?? "") || e.approval !== "NOT_PERFORMED"
    || ["mutationCount", "ddlCount", "dmlCount", "migrationInvocationCount"].some((k) => e[k] !== 0))
    failHarness("SUPPLEMENTAL_CONTRACT_MISMATCH");
  if (Object.keys(TARGET).some((k) => e.target?.[k] !== TARGET[k] || archiveTarget?.[k] !== TARGET[k]))
    failHarness("SUPPLEMENTAL_TARGET_MISMATCH");
  if (classifySupplemental(e).classification !== COMPLETE) failHarness("SUPPLEMENTAL_SCOPE_INCOMPLETE");
  const duplicates = e.directFunctionEvidence.filter((f) => e.ioFunctionEvidence.some((io) => io.oid === f.oid));
  if (duplicates.some((f) => !sameSupplementalFunction(f, e.ioFunctionEvidence.find((io) => io.oid === f.oid))))
    failHarness("SUPPLEMENTAL_FUNCTION_CONFLICT");
}
export function prepareSupplemental(environment, dependencies, executingBytes) {
  const git = dependencies.git ?? defaultGit;
  if (dependencies.argument !== OPERATION) failHarness("OPERATION_NOT_AUTHORIZED");
  if (VARIABLES.slice(0, 3).some((k) => environment[k] !== "true")) failHarness("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((k) => /^PG/i.test(k))) failHarness("INHERITED_PG_STATE");
  if (Object.keys(environment).some((k) => /^(NODE_OPTIONS$|NODE_PATH$|NODE_TEST)/i.test(k))) failHarness("INHERITED_EXECUTION_OVERRIDE");
  if (Object.keys(environment).some((k) => /^(ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/i.test(k) && !VARIABLES.includes(k)))
    failHarness("CONFLICTING_PRODUCTION_CONFIGURATION");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || environment[VARIABLES[4]] !== head) failHarness("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) failHarness("WORKTREE_DIRTY");
  const canonicalFile = (p) => /^supabase\/migrations\/2026\d{8}_.+[.]sql$/.test(p) && p.split("/").at(-1) >= "202607270000";
  const sources = String(git(["ls-tree", "-r", "--name-only", head, "--", "supabase/migrations"]))
    .trim().split(/\r?\n/).filter(canonicalFile).sort();
  const checkoutSources = (dependencies.readMigrationNames ?? (() => readdirSync(resolve(HARNESS_ROOT, "supabase/migrations"))))()
    .map((name) => `supabase/migrations/${name}`).filter(canonicalFile).sort();
  if (JSON.stringify(sources) !== JSON.stringify(checkoutSources)) failHarness("SOURCE_ARTIFACT_INVENTORY_MISMATCH");
  const pending = [...Object.keys(PINNED_ARTIFACTS), ...sources, "supabase/baseline/manifest.json", RUNNER, "package.json"], hashes = {};
  while (pending.length) {
    const path = pending.shift();
    if (Object.hasOwn(hashes, path)) continue;
    if (path.startsWith("../") || !/^[a-zA-Z0-9_./-]+$/.test(path)) failHarness("ARTIFACT_PATH_REJECTED");
    const bytes = Buffer.from(git(["show", `${head}:${path}`]));
    const checkout = (dependencies.readCheckout ?? ((p) => readFileSync(resolve(HARNESS_ROOT, p))))(path);
    if (!Buffer.isBuffer(checkout) || checkout.toString("utf8").replaceAll("\r\n", "\n") !== bytes.toString("utf8")) failHarness("CHECKOUT_ARTIFACT_MISMATCH");
    hashes[path] = hashBytes(bytes);
    if (PINNED_ARTIFACTS[path] && PINNED_ARTIFACTS[path] !== hashes[path]) failHarness("COMMITTED_ARTIFACT_MISMATCH");
    if (path.endsWith(".mjs")) {
      for (const match of bytes.toString("utf8").matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+)["']/g))
        pending.push(posix.normalize(posix.join(posix.dirname(path), match[1])));
      if (/\bimport\s*\(/.test(bytes.toString("utf8"))) failHarness("DYNAMIC_EXECUTION_DEPENDENCY_REJECTED");
    }
  }
  if (!Buffer.isBuffer(executingBytes) || hashBytes(executingBytes) !== hashes[RUNNER]) failHarness("RUNNER_ARTIFACT_MISMATCH");
  const target = resolveCurrentHarnessTarget(environment, VARIABLES[3], VARIABLES[5]);
  const metadata = { approvedHead: head, target: TARGET, runnerArtifactExact: true, protectedArtifactsExact: true,
    artifactHashes: hashes, archiveSha256Expected: ARCHIVE_SHA, scopeBoundary: BOUNDARY };
  serializeCurrentHarness(metadata, environment);
  return { metadata, connectionEnvironment: target.connectionEnvironment };
}

import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserExpectedPostAcls } from "./phase3-browser-privilege-contract.mjs";
import { browserPrivilegeInventoryQuery } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { serviceRoleInventoryQuery } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CURRENT_FUNCTIONS, CURRENT_EXECUTE_ACLS, currentTableAcls, functionMetadata } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_TABLES, serviceMatrix } from "./phase3-current-service-role-matrix.mjs";
import { additionalAcls, additionalMatrix, additionalBrowserMatrix, additionalAccounting, ADDITIONAL_SERVICE_TABLES } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { additionalSecurity, additionalInventoryQuery, additionalPreservationQuery } from "./phase3-additional-runtime-service-role-contract.mjs";
import { maskSqlCommentsAndStrings } from "../../production-preflight/sql-safety.mjs";

const json = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const sorted = (v) => `(select coalesce(jsonb_agg(x order by x::text),'[]'::jsonb) from jsonb_array_elements(${v}) x)`;
const strip = (v, fields) => `(select coalesce(jsonb_agg(x ${fields.map((f) => `- '${f}'`).join(" ")}), '[]'::jsonb) from jsonb_array_elements(${v}) x)`;
const names = (tables) => tables.map((t) => `'${t}'`).join(",");
const scope = (v, tables) => `(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(${v}) x where x->>'table' in (${names(tables)}))`;
const tables = ADDITIONAL_SERVICE_TABLES;
const stateGuard = (post) => `${sorted(scope("service->'tableAcls'", tables))} is distinct from ${sorted(json(additionalAcls(post)))}
    or ${sorted(scope("service->'effectiveTablePrivileges'", tables))} is distinct from ${sorted(json(additionalMatrix(post)))}`;
const primaryGuard = `${sorted("browser->'tableAcls'")} is distinct from ${sorted(json(currentTableAcls(true)))}
    or ${sorted(scope("service->'tableAcls'", SERVICE_TABLES))} is distinct from ${sorted(json(currentTableAcls(true)))}
    or ${sorted(scope("service->'effectiveTablePrivileges'", SERVICE_TABLES))} is distinct from ${sorted(json(serviceMatrix(true)))}
    or ${sorted("browser->'columnAcls'")} is distinct from ${sorted(json(browserExpectedPostAcls().columnAcls))}
    or ${sorted(strip("browser->'tables'", ["raw_acl", "acl_origin"]))} is distinct from ${sorted(json(baseline.tables))}
    or ${sorted(strip("browser->'policies'", ["oid"]))} is distinct from ${sorted(json(baseline.policies))}`;
const functions = `(select jsonb_agg(case when (x->>'exists')::boolean then x - 'rawAcl' - 'sourceHash'
    else jsonb_build_object('name',x->'name','exists',false) end) from jsonb_array_elements(service->'relevantFunctions') x)`;
const boundary = `jsonb_build_object('core',(${corePolicyQuery.payloadSql}) - 'table_acl',
    'identity',${identityBridgePostQuery.payloadSql},'adoption',${coreBaselineAdoptionQuery.payloadSql})`;

export function buildAdditionalMigration() {
  return `-- CURRENT-INSTALLED additional-runtime service_role TABLE ACL reconciliation only.
-- No Production authorization. A future isolated harness must pin bytes and classify LIVE PRE/POST.
-- Real Production function/product fingerprints are pinned by the dedicated external classifier.
-- Browser ACLs, the completed thirteen-table wave, and future coach INVOKER grants are excluded.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local transaction_timeout = '180s';
set local idle_in_transaction_session_timeout = '15s';
do $additional_service_transition$
declare
  browser jsonb;
  service jsonb;
  extra jsonb;
  identity_state jsonb;
  adoption_state jsonb;
  boundary_before jsonb;
  preservation_before text;
begin
  if current_user <> 'postgres' or current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'Managed postgres on PG17 required' using errcode='55000';
  end if;
  select ${browserPrivilegeInventoryQuery.payloadSql} into browser;
  select ${serviceRoleInventoryQuery.payloadSql} into service;
  select ${additionalInventoryQuery.payloadSql} into extra;
  if ${stateGuard(false)}
    or ${sorted(strip(scope("service->'tables'", tables), ["rawAcl", "aclOrigin"]))} is distinct from ${sorted(json(additionalSecurity()))}
    or ${sorted("extra->'browser'")} is distinct from ${sorted(json(additionalBrowserMatrix()))} then
    raise exception 'Exact additional-runtime broad PRE required; installed POST and hybrids refused' using errcode='55000';
  end if;
  if ${primaryGuard}
    or ${sorted(functions)} is distinct from ${sorted(json(functionMetadata(CURRENT_FUNCTIONS, false)))}
    or ${sorted("service->'functionExecuteAcls'")} is distinct from ${sorted(json(CURRENT_EXECUTE_ACLS))} then
    raise exception 'Completed primary/browser/policy/function topology drift' using errcode='55000';
  end if;
  if (select count(*) <> 1 or bool_and((x->>'rolbypassrls')::boolean and (x->>'rolinherit')::boolean
      and not (x->>'rolsuper')::boolean and not (x->>'rolcreaterole')::boolean and not (x->>'rolcreatedb')::boolean
      and not (x->>'rolcanlogin')::boolean and not (x->>'rolreplication')::boolean and (x->>'rolconnlimit')::integer=-1) is distinct from true
      from jsonb_array_elements(service->'roleAttributes') x where x->>'name'='service_role')
    or exists(select 1 from pg_roles r where r.rolname <> 'service_role' and
      (pg_has_role('service_role',r.oid,'MEMBER') or pg_has_role('service_role',r.oid,'USAGE') or pg_has_role('service_role',r.oid,'SET'))) then
    raise exception 'Service role attributes or membership substitute drift' using errcode='55000';
  end if;
  select ${identityBridgePostQuery.payloadSql} into identity_state;
  select ${coreBaselineAdoptionQuery.payloadSql} into adoption_state;
  if ${sorted(strip("identity_state->'functions'", ["proacl"]))} is distinct from ${sorted(json(baseline.identity.functions))}
    or ${sorted("identity_state->'acl'")} is distinct from ${sorted(json(baseline.identity.executeAcl))}
    or identity_state->'rls_owner_create' is distinct from 'false'::jsonb
    or ${sorted("adoption_state->'schemaCreatePrivileges'")} is distinct from ${sorted(json(baseline.identity.schemaCreatePrivileges))}
    or ${sorted("adoption_state->'ledgerRows'")} is distinct from ${sorted(json(baseline.adoption.ledgerRows))}
    or adoption_state->'schemaStateRows' is distinct from '[]'::jsonb
    or adoption_state->'canonicalMarkerAbsent' is distinct from 'true'::jsonb
    or adoption_state->'developmentObjects' is distinct from ${json(baseline.adoption.developmentObjects)}
    or adoption_state->'historicalCounts' is distinct from ${json(baseline.historical.counts)} then
    raise exception 'Identity/adoption/historical PRE drift' using errcode='55000';
  end if;
  select ${boundary} into boundary_before;
  if boundary_before->'core'->'runtimeDisabled' is distinct from 'true'::jsonb
    or boundary_before->'core'->'cutoverAbsent' is distinct from 'true'::jsonb
    or boundary_before->'core'->'phase4Absent' is distinct from 'true'::jsonb then
    raise exception 'Runtime/cutover/Phase4 boundary drift' using errcode='55000';
  end if;
  select ${additionalPreservationQuery.payloadSql} into preservation_before;

  -- BEGIN ADDITIONAL SERVICE TABLE ACL STATEMENTS
  ${additionalAccounting().statements.join("\n  ")}
  -- END ADDITIONAL SERVICE TABLE ACL STATEMENTS

  select ${browserPrivilegeInventoryQuery.payloadSql} into browser;
  select ${serviceRoleInventoryQuery.payloadSql} into service;
  select ${additionalInventoryQuery.payloadSql} into extra;
  if ${stateGuard(true)} or ${primaryGuard}
    or ${sorted("extra->'browser'")} is distinct from ${sorted(json(additionalBrowserMatrix()))} then
    raise exception 'Exact current additional-runtime POST required' using errcode='55000';
  end if;
  if preservation_before is distinct from ${additionalPreservationQuery.payloadSql}
    or boundary_before is distinct from ${boundary} then
    raise exception 'Non-target catalog/column/function/data/boundary mutation' using errcode='55000';
  end if;
end
$additional_service_transition$;
commit;
`;
}
export function additionalMutationStatements(sql) {
  const start = "  -- BEGIN ADDITIONAL SERVICE TABLE ACL STATEMENTS\n", end = "  -- END ADDITIONAL SERVICE TABLE ACL STATEMENTS";
  if (sql.split(start).length !== 2 || sql.split(end).length !== 2 || sql.indexOf(start) >= sql.indexOf(end))
    throw new Error("ADDITIONAL_MUTATION_BOUNDARY_AMBIGUOUS");
  return sql.slice(sql.indexOf(start) + start.length, sql.indexOf(end)).trim().split("\n").map((s) => s.trim());
}
export function verifyAdditionalMigration(sql) {
  if (sql !== buildAdditionalMigration()) throw new Error("ADDITIONAL_MIGRATION_SOURCE_DRIFT");
  const masked = maskSqlCommentsAndStrings(sql);
  const parsed = [...masked.matchAll(/([^;]*);/g)].map((m) => ({ start: m.index, end: m.index + m[0].length,
    text: m[1].trim().replace(/\s+/g, " ").toLowerCase() })).filter((r) => r.text);
  const expectedEnvelope = ["begin", "set local lock_timeout =", "set local statement_timeout =",
    "set local transaction_timeout =", "set local idle_in_transaction_session_timeout =", "do", "commit"];
  if (JSON.stringify(parsed.map((r) => r.text)) !== JSON.stringify(expectedEnvelope)
    || masked.slice(parsed.at(-1)?.end ?? 0).trim() || /\\/.test(masked)) throw new Error("ADDITIONAL_TRANSACTION_ENVELOPE_REJECTED");
  const first = parsed[0], last = parsed.at(-1);
  const start = masked.indexOf("begin", first.start), end = masked.indexOf("commit", last.start);
  if (sql.slice(start, first.end) !== "begin;" || sql.slice(end, last.end) !== "commit;")
    throw new Error("ADDITIONAL_TRANSACTION_ENVELOPE_REJECTED");
  const body = { body: sql.slice(0, start) + sql.slice(first.end, end) + sql.slice(last.end),
    removed: [{ start, end: first.end }, { start: end, end: last.end }] };
  const statements = additionalMutationStatements(sql), expected = additionalAccounting().statements;
  if (JSON.stringify(statements) !== JSON.stringify(expected)) throw new Error("ADDITIONAL_MUTATION_ACCOUNTING_DRIFT");
  return { ...body, sqlRevokeStatements: statements.length, sqlGrantStatements: 0 };
}

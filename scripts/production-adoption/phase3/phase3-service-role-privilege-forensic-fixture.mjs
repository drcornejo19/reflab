import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserLineageObservation, buildBrowserLineageFixture } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { browserForensicFixtureEvidence } from "./phase3-browser-privilege-forensic-fixture.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { PRIMARY_TABLES, ADDITIONAL_TABLES, TABLE_PRIVILEGES, RELEVANT_FUNCTIONS, DELETE_CALLER_TABLES, SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS, browserPostPrivileges } from "./phase3-browser-privilege-matrix.mjs";

export const SERVICE_FIXTURE_STATUS = "LOCAL_MECHANICAL_FIXTURE_ONLY";
const definer = (name) => /^(submit_canonical_|admin_set_canonical_)/.test(name);
export function serviceRoleFixtureEvidence() {
  const e = browserForensicFixtureEvidence(), o = browserLineageObservation(true);
  const tables = o.tables.map((t) => ({...t, raw_acl: [], acl_origin: "EXPLICIT_ACL"}));
  const policies = o.policies.map((p, i) => ({...p, oid: 70000 + i}));
  e.set(BROWSER_FORENSIC_QUERY_ID, {...o, tables, policies, catalogCounts: {
    columns: o.columns.length, policies: policies.length, tableAcls: o.tableAcls.length, columnAcls: o.columnAcls.length,
  }});
  const core = e.get(CORE_POLICY_QUERY_ID), coreTables = PRIMARY_TABLES.slice(0, 10);
  Object.assign(core, {tables: tables.filter((t) => coreTables.includes(t.table)), policies: policies.filter((p) => coreTables.includes(p.table)),
    table_acl: o.tableAcls.filter((a) => coreTables.includes(a.table)), column_acl: o.columnAcls.filter((a) => coreTables.includes(a.table)),
    productFingerprint: baseline.historical.productFingerprint, protectedObjectsHash: baseline.historical.protectedObjectsHash});
  e.set(IDENTITY_BRIDGE_POST_QUERY_ID, {functions: baseline.identity.functions.map((f) => ({...structuredClone(f), proacl: []})),
    acl: structuredClone(baseline.identity.executeAcl), rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0});
  e.set(CORE_BASELINE_ADOPTION_QUERY_ID, {ledgerRows: structuredClone(baseline.adoption.ledgerRows), schemaStateRows: [],
    canonicalMarkerAbsent: true, historicalCounts: structuredClone(baseline.historical.counts), developmentObjects: structuredClone(baseline.adoption.developmentObjects),
    schemaCreatePrivileges: structuredClone(baseline.identity.schemaCreatePrivileges)});
  const allTables = [...PRIMARY_TABLES, ...ADDITIONAL_TABLES].map((table) => ({schema: "public", table, exists: true, owner: "postgres", rls: true,
    force: false, rawAcl: [], aclOrigin: "EXPLICIT_ACL"}));
  const tableAcls = [...o.tableAcls, ...ADDITIONAL_TABLES.flatMap((table) => ["SELECT", "INSERT", "UPDATE", ...(DELETE_CALLER_TABLES.includes(table) ? ["DELETE"] : [])]
    .map((privilege) => ({schema: "public", table, grantee: "service_role", grantor: "postgres", privilege, grantable: false})))];
  const names = new Set(["service_role", "authenticator", "postgres", "reflab_rls_owner", "reflab_prod_preflight_ro", "reflab_preflight_audit_owner",
    ...tableAcls.flatMap((a) => [a.grantee, a.grantor]), ...o.columnAcls.flatMap((a) => [a.grantee, a.grantor])]);
  names.delete("PUBLIC");
  const roleAttributes = [...names].map((name) => ({name, rolsuper: false, rolinherit: true, rolcreaterole: false, rolcreatedb: false,
    rolcanlogin: false, rolreplication: false, rolbypassrls: name === "service_role", rolconnlimit: -1,
    serviceRoleMember: name === "service_role", serviceRoleInherits: name === "service_role", serviceRoleCanSet: name === "service_role"}));
  const relevantFunctions = RELEVANT_FUNCTIONS.map((name) => ({name, exists: true, signature: `public.${name}()`, owner: definer(name) ? "reflab_rls_owner" : "postgres",
    language: "sql", security_definer: definer(name), volatility: "v", strict: false, leakproof: false,
    configuration: ["search_path=pg_catalog"], sourceHash: "0".repeat(32), rawAcl: [], serviceRoleExecute: true}));
  const p = {serverVersion: 170011, roleAttributes, roleMemberships: [], tables: allTables, tableAcls, columns: o.columns, columnAcls: o.columnAcls,
    effectiveTablePrivileges: allTables.flatMap(({table}) => TABLE_PRIVILEGES.map((privilege) => ({schema: "public", table, role: "service_role", privilege,
      granted: tableAcls.some((a) => a.table === table && a.grantee === "service_role" && a.privilege === privilege)}))),
    effectiveColumnPrivileges: o.columns.flatMap(({table, column}) => ["SELECT", "INSERT", "UPDATE", "REFERENCES"].map((privilege) => ({schema: "public", table, column, role: "service_role", privilege,
      granted: tableAcls.some((a) => a.table === table && a.grantee === "service_role" && a.privilege === privilege)}))),
    relevantFunctions, functionExecuteAcls: relevantFunctions.map((f) => ({signature: f.signature, grantee: "service_role", grantor: f.owner, privilege: "EXECUTE", grantable: false}))};
  e.set(SERVICE_FORENSIC_QUERY_ID, p);
  refreshServiceFixtureCounts(p);
  return e;
}
export function refreshServiceFixtureCounts(p) {
  p.databaseOwner = "postgres";
  p.catalogCounts = {roles: p.roleAttributes.length, memberships: p.roleMemberships.length, tableAcls: p.tableAcls.length,
    columnAcls: p.columnAcls.length, functionAcls: p.functionExecuteAcls.length};
}
// All extra table data, role attributes and RPC stubs are mechanical, not observed Production truth.
export function buildServiceRoleMechanicalFixture() {
  const sql = [buildBrowserLineageFixture(), "-- LOCAL_MECHANICAL_FIXTURE_ONLY; LOCAL_SYNTHETIC_DATA_ONLY",
    "alter role service_role bypassrls; set session authorization postgres;",
    ...PRIMARY_TABLES.filter((t) => t !== "referee_exam_sessions").map((t) => `revoke ${TABLE_PRIVILEGES.filter((p) => !browserPostPrivileges(t, "authenticated").includes(p)).join(",")} on public.${t} from authenticated;`),
    ...["match_preparations", "post_match_reviews", "psychology_checkins", "psychology_wellbeing_assessments", "psychology_exercise_sessions", "notification_events"]
      .map((t) => `revoke ${TABLE_PRIVILEGES.join(",")} on public.${t} from anon;`),
    "grant select on public.referee_exam_sessions to authenticated;",
    `grant insert(${PROFILE_INSERT_COLUMNS.join(",")}),update(${PROFILE_UPDATE_COLUMNS.join(",")}) on public.user_profiles to authenticated;`,
    ...ADDITIONAL_TABLES.filter((t) => t !== "clips").map((t) => `create table public.${t}(id text); alter table public.${t} enable row level security;`),
    ...ADDITIONAL_TABLES.map((t) => `grant select,insert,update${DELETE_CALLER_TABLES.includes(t) ? ",delete" : ""} on public.${t} to service_role;`),
    ...RELEVANT_FUNCTIONS.flatMap((name) => [`create function public.${name}() returns integer language sql ${definer(name) ? "security definer" : "security invoker"} set search_path=pg_catalog as 'select 1';`,
      `revoke all on function public.${name}() from public; grant execute on function public.${name}() to service_role;`,
      "grant create on schema public to reflab_rls_owner;", ...(definer(name) ? [`alter function public.${name}() owner to reflab_rls_owner;`] : []),
      "revoke create on schema public from reflab_rls_owner;"]),
    "reset session authorization;"];
  return sql.join("\n");
}

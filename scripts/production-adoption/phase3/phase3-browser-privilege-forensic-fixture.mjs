import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CORE_POLICY_PRODUCTION_BASELINE as baseline } from "./phase3-core-policy-production-baseline.mjs";
import { buildCorePolicyProductionInventory } from "./phase3-core-policy-production-baseline-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";
import { IDENTITY_PRE_MEMBERSHIPS } from "./phase3-identity-pre-input.mjs";
import { BROWSER_FORENSIC_QUERY_ID, BROWSER_FORENSIC_TABLES, BROWSER_EXTRA_TABLES,
  TABLE_PRIVILEGES, COLUMN_PRIVILEGES } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";

export const BROWSER_FIXTURE_STATUS = "LOCAL_MECHANICAL_FIXTURE_ONLY";
export function browserForensicFixtureEvidence() {
  const core = structuredClone(buildCorePolicyProductionInventory());
  core.policies = [...baseline.preservedPolicies, ...PHASE3_POLICY_MATRIX.map((p,i) => ({
    schema:"public",table:p.table,name:p.name,command:p.command,roles:p.roles,permissive:p.permissive,
    using:p.using,withCheck:p.withCheck,oid:50000+i,
  }))].map((p) => structuredClone(p));
  const tables = BROWSER_FORENSIC_TABLES.map((table) => ({schema:"public",table,exists:true,owner:"postgres",
    rls:true,force:false,installer_authority:true,raw_acl:[],acl_origin:"EXPLICIT_ACL"}));
  const columns = BROWSER_FORENSIC_TABLES.flatMap((table) => ["user_id","id"].map((column) => ({schema:"public",table,column,raw_acl:null})));
  const policies = [...core.policies, ...BROWSER_EXTRA_TABLES.map((table,i) => ({schema:"public",table,
    name:`${table}_mechanical_read`,command:"SELECT",permissive:true,roles:["authenticated"],
    using:"user_id = platform_request_user_id()",withCheck:null,oid:60000+i}))];
  const tableAcls = core.table_acl.map((r) => ({schema:"public",...r}));
  const columnAcls = core.column_acl.map((r) => ({schema:"public",...r}));
  const p = {tables,columns,policies,tableAcls,columnAcls,
    effectiveBrowserPrivileges:BROWSER_FORENSIC_TABLES.flatMap((table) => ["anon","authenticated"].flatMap((role) => TABLE_PRIVILEGES
      .map((privilege) => ({schema:"public",table,role,privilege,granted:tableAcls.some((a) => a.table===table && a.grantee===role && a.privilege===privilege)})))),
    effectiveBrowserColumnPrivileges:columns.flatMap((c) => ["anon","authenticated"].flatMap((role) => COLUMN_PRIVILEGES.map((privilege) =>
      ({schema:"public",table:c.table,column:c.column,role,privilege,granted:false})))),
    catalogCounts:{tableAcls:tableAcls.length,columnAcls:columnAcls.length,policies:policies.length,columns:columns.length}};
  return new Map([["read_only_guard","on"],[BROWSER_FORENSIC_QUERY_ID,p],[CORE_POLICY_QUERY_ID,core],
    [IDENTITY_BRIDGE_POST_QUERY_ID,{functions:structuredClone(baseline.identity.functions).map((r) => ({...r,proacl:[]})),
      acl:structuredClone(baseline.identity.acl),rls_owner_create:false,ledger_rows:4,schema_state_rows:0}],
    [CORE_BASELINE_ADOPTION_QUERY_ID,{ledgerRows:structuredClone(baseline.adoption.ledgerChain),schemaStateRows:[],
      canonicalMarkerAbsent:true,historicalCounts:structuredClone(baseline.historical.counts),
      developmentObjects:structuredClone(baseline.adoption.developmentObjects),schemaCreatePrivileges:structuredClone(baseline.identity.schemaCreate)}],
    [INSTALLER_IDENTITY_QUERY_ID,{caller:"postgres",session_user:"postgres",database:{name:"postgres"},server_version_num:170011,
      installer:{rolname:"postgres",rolcanlogin:true,rolinherit:true,rolcreaterole:true,rolsuper:false,rolcreatedb:true,rolbypassrls:true,rolreplication:true}}]]);
}
const ident = (s) => `"${s.replaceAll('"','""')}"`;
const policySql = (p) => `create policy ${ident(p.name)} on public.${ident(p.table)} as ${p.permissive ? "permissive" : "restrictive"}
  for ${p.command} to ${p.roles.map(ident).join(",")} ${p.using === null ? "" : `using (${p.using})`}
  ${p.withCheck === null ? "" : `with check (${p.withCheck})`};`;

// Build POST directly. No migration file, preflight, or transaction body is executed.
export function buildBrowserForensicMechanicalFixture() {
  const source = readFileSync(new URL("../../../supabase/migrations/20260901064236_production_adoption_identity_security_bridge.sql",import.meta.url),"utf8").replaceAll("\r\n","\n");
  if (createHash("sha256").update(source).digest("hex") !== "3cf17916b711b1fc301f0bd566d8d10d69b263f398a9305a4464e673e18acb1f")
    throw new Error("LOCAL_FIXTURE_FUNCTION_SOURCE_CHANGED");
  const definitions = [...source.matchAll(/create (?:or replace )?function (?:reflab_private|public)\.[a-z_]+\(\)\n[\s\S]*?\$function\$;/g)].map((m) => m[0]);
  if (definitions.length !== 5) throw new Error("LOCAL_FIXTURE_FUNCTION_DEFINITIONS_AMBIGUOUS");
  const roles = [...new Set(IDENTITY_PRE_MEMBERSHIPS.flatMap((r) => [r.grantedRole,r.memberRole]))]
    .filter((r) => r !== "postgres" && !r.startsWith("pg_"));
  const sql = ["-- LOCAL_MECHANICAL_FIXTURE_ONLY; NOT A PRODUCTION BASELINE.",
    "set createrole_self_grant = ''; create role postgres login nosuperuser inherit createrole createdb replication bypassrls;",
    ...roles.map((r) => `create role ${ident(r)} nologin nosuperuser noinherit;`),
    "create role mechanical_inherited nologin;",
    "alter database postgres owner to postgres;",
    ...IDENTITY_PRE_MEMBERSHIPS.filter((r) => r.grantorRole === "supabase_admin").map((r) =>
      `grant ${ident(r.grantedRole)} to ${ident(r.memberRole)} with admin ${r.adminOption}, inherit ${r.inheritOption}, set ${r.setOption};`),
    "set session authorization postgres; grant reflab_rls_owner to postgres with admin false, inherit false, set true;",
    "create schema extensions; create extension pgcrypto with schema extensions; create schema reflab_private; create schema reflab_meta;",
    "revoke create on schema public from public; grant usage on schema public,reflab_private to authenticated,anon,service_role,reflab_rls_owner;",
    "create table reflab_meta.production_adoption_state(phase_order integer,phase_key text,previous_phase_key text);",
    "insert into reflab_meta.production_adoption_state values (1,'foundation',null),(2,'exam_training_prerequisites','foundation'),(3,'psychology_notification_prerequisites','exam_training_prerequisites'),(4,'canonical_objects','psychology_notification_prerequisites');",
    "create table reflab_meta.reflab_schema_state(baseline_version text);",
    ...[...BROWSER_FORENSIC_TABLES,"clips"].map((t) => `create table public.${ident(t)}(id integer,user_id text,role_key text,submission_id uuid,
      canonical_payload_hash text,exam_result_id text,institution_id text,institution_group_id text,institution_assessment_session_id text,
      criterion_result text,score integer,source_item_type text,exam_session_id text,display_name text); alter table public.${ident(t)} enable row level security;`),
    ...Object.entries(baseline.historical.counts).map(([t,n]) => `insert into public.${ident(t)}(id,user_id) select n,'local_synthetic' from generate_series(1,${n}) n;`),
    ...definitions,
    ...baseline.identity.functions.flatMap((f) => [
      `revoke all on function ${f.signature} from public;`,
      ...baseline.identity.acl.filter((a) => a.signature === f.signature && a.grantee !== f.owner)
        .map((a) => `grant execute on function ${f.signature} to ${ident(a.grantee)};`),
    ]),
    "grant create on schema reflab_private to reflab_rls_owner; alter function reflab_private.is_super_admin() owner to reflab_rls_owner; revoke create on schema reflab_private from reflab_rls_owner;",
    ...PHASE3_POLICY_MATRIX.map(policySql), ...baseline.preservedPolicies.map(policySql),
    ...baseline.tableAcl.map((a) => `grant ${a.privileges.join(",")} on public.${ident(a.table)} to ${ident(a.grantee)};`),
    ...baseline.columnAcl.map((a) => `grant ${a.privilege}(${ident(a.column)}) on public.${ident(a.table)} to ${ident(a.grantee)};`),
    ...BROWSER_EXTRA_TABLES.map((table) => policySql({table,name:`${table}_mechanical_read`,command:"SELECT",permissive:true,
      roles:["authenticated"],using:"user_id = public.platform_request_user_id()",withCheck:null})),
    "grant select on public.user_global_roles to public; grant maintain on public.user_subscriptions to mechanical_inherited;",
    "grant select on public.referee_exam_sessions to authenticated with grant option;",
    "grant insert(user_id,display_name),update(display_name) on public.user_profiles to authenticated;",
    "reset session authorization; grant mechanical_inherited to authenticated with inherit true, set false;",
  ];
  return sql.join("\n");
}

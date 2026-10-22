import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { buildBrowserForensicMechanicalFixture } from "./phase3-browser-privilege-forensic-fixture.mjs";
import { expandBrowserBaselineAcls, browserExpectedPostAcls } from "./phase3-browser-privilege-contract.mjs";
import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, browserPostPrivileges, PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS } from "./phase3-browser-privilege-matrix.mjs";

const ident = (s) => `"${s.replaceAll('"','""')}"`;
const literal = (s) => `'${s.replaceAll("'","''")}'`;
export function browserLineageObservation(post = false) {
  const b=structuredClone(baseline),acls=post ? browserExpectedPostAcls() : {tableAcls:expandBrowserBaselineAcls(),columnAcls:b.columnAcls};
  const columns=Object.entries(b.columns).flatMap(([table,names]) => names.map((column) => ({schema:"public",table,column,raw_acl:null})));
  return {classification:"OBSERVATION_COMPLETE",targetExact:true,transactionReadOnly:true,failedChecks:[],unknownChecks:[],
    tables:b.tables,columns,tableAcls:acls.tableAcls,columnAcls:acls.columnAcls,
    policies:b.policies,["64236State"]:b.identity,["64245PostState"]:{comparison:"EXACT"},adoptionState:b.adoption,historicalState:b.historical,
    effectiveBrowserPrivileges:BROWSER_TABLES.flatMap((table) => ["anon","authenticated"].flatMap((role) => PG17_TABLE_PRIVILEGES.map((privilege) =>
      ({schema:"public",table,role,privilege,granted:post ? browserPostPrivileges(table,role).includes(privilege)
        : b.effectiveTableGranted.some((r) => r.table===table && r.role===role && r.privileges.includes(privilege))})))),
    effectiveBrowserColumnPrivileges:columns.flatMap(({schema,table,column}) => ["anon","authenticated"].flatMap((role) => ["SELECT","INSERT","UPDATE","REFERENCES"].map((privilege) =>
      ({schema,table,column,role,privilege,granted:post ? browserPostPrivileges(table,role).includes(privilege)
        || role==="authenticated" && table==="user_profiles" && (privilege==="INSERT" ? PROFILE_INSERT_COLUMNS : privilege==="UPDATE" ? PROFILE_UPDATE_COLUMNS : []).includes(column)
        : b.effectiveColumnGranted.some((r) => r.table===table && r.role===role && r.privilege===privilege && r.columns.includes(column))})))),
  };
}
// Catalog definitions/ACLs are observed Production evidence; product rows below are synthetic, never Production truth.
export function buildBrowserLineageFixture() {
  const mechanical=buildBrowserForensicMechanicalFixture();
  const prefix=mechanical.slice(0,mechanical.indexOf("create policy "));
  if(!prefix.includes("alter function reflab_private.is_super_admin() owner")) throw new Error("FIXTURE_PREFIX_AMBIGUOUS");
  const tables=prefix.replace(/create table public\."([a-z_]+)"\([\s\S]*?\); alter table public\."\1" enable row level security;/g, (source,table) => {
    if(!BROWSER_TABLES.includes(table)) return source;
    return `create table public.${ident(table)}(${baseline.columns[table].map((column) => `${ident(column)} ${column === "submission_id" ? "uuid" : "text"}`).join(",")}); alter table public.${ident(table)} enable row level security;`;
  });
  const sql=[tables,
    "-- OBSERVED_64249_CATALOG_LINEAGE; LOCAL_SYNTHETIC_DATA_ONLY",
    "create function public.reflab_is_super_admin(text) returns boolean language sql stable as 'select false';",
    "insert into public.referee_exam_sessions(id,user_id) values ('local_fixture_referee_session','local_synthetic');",
    ...baseline.policies.map((p) => `create policy ${ident(p.name)} on public.${ident(p.table)} as ${p.permissive ? "permissive" : "restrictive"}
      for ${p.command} to ${p.roles.map(ident).join(",")} ${p.using===null ? "" : `using (${p.using})`} ${p.withCheck===null ? "" : `with check (${p.withCheck})`};`),
    ...baseline.tableAcl.map((a) => `grant ${a.privileges.join(",")} on table public.${ident(a.table)} to ${ident(a.grantee)}${a.grantable ? " with grant option" : ""};`),
    ...baseline.columnAcls.map((a) => `grant ${a.privilege}(${ident(a.column)}) on public.${ident(a.table)} to ${ident(a.grantee)}${a.grantable ? " with grant option" : ""};`),
    "alter table reflab_meta.production_adoption_state add column plan_hash text,add column recorded_at text,add column plan_version text,add column evidence_hash text;",
    ...baseline.adoption.ledgerRows.map((r) => `update reflab_meta.production_adoption_state set plan_hash=${literal(r.plan_hash)},recorded_at=${literal(r.recorded_at)},plan_version=${literal(r.plan_version)},evidence_hash=${literal(r.evidence_hash)} where phase_order=${r.phase_order};`),
    "reset session authorization;",
  ];
  return sql.join("\n");
}

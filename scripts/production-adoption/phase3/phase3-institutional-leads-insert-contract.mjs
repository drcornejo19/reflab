import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { TARGET, HARNESS_ROOT, hashBytes, PINNED_ARTIFACTS } from "./phase3-additional-runtime-pre-contract.mjs";
import { additionalQueries, classifyAdditionalTransition, classifyLocalAdditionalTransition,
  additionalPreserved, POST_EXACT as PREDECESSOR_POST } from "./phase3-additional-runtime-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { exactServiceRows } from "./phase3-current-service-role-contract.mjs";

export const MIGRATION = "scripts/production-adoption/phase3/20261014000000_production_adoption_institutional_leads_service_role_insert.sql";
export const PRE = "INSTITUTIONAL_LEADS_INSERT_PRE_EXACT";
export const POST = "INSTITUTIONAL_LEADS_INSERT_ALREADY_INSTALLED_POST";
export const QUERY_ID = "institutional_leads_insert_security";
export const GRANT = "grant insert on table public.institutional_leads to service_role;";
export const PRIVILEGES = Object.freeze(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]);
export const COLUMN_TYPES = Object.freeze({ id: "uuid", full_name: "text", first_name: "text", last_name: "text", role: "text",
  institution_name: "text", institution_type: "text", country: "text", city: "text", referee_count: "integer", instructor_count: "integer",
  email: "text", whatsapp: "text", interest_areas: "text[]", interest: "text", source: "text", message: "text", potential_plan: "text",
  status: "text", owner_user_id: "text", next_contact_at: "timestamp with time zone", notes: "text", lost_reason: "text",
  archived_at: "timestamp with time zone", converted_institution_id: "uuid", converted_at: "timestamp with time zone",
  converted_by_user_id: "text", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" });
export const EXPECTED_POLICY = Object.freeze({ name: "reflab_preflight_audit_owner_read", command: "r", permissive: true,
  roles: ["reflab_preflight_audit_owner"], using: "true", withCheck: null });
const literal = (v) => "'" + v.replaceAll("'", "''") + "'";
const universe = PRIVILEGES.map(literal).join(",");

// The only excluded ACL entry is the one permitted delta. Product values never leave PostgreSQL.
export const securityExpression = `(with relation as (select c.* from pg_catalog.pg_class c
  where c.oid=pg_catalog.to_regclass('public.institutional_leads') and c.relkind='r')
select jsonb_build_object(
 'tableCount',(select count(*) from relation),
 'owner',(select pg_get_userbyid(relowner) from relation),
 'rls',(select relrowsecurity from relation),'force',(select relforcerowsecurity from relation),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attname),'[]')
   from relation r join pg_attribute a on a.attrelid=r.oid where a.attnum>0 and not a.attisdropped),
 'rawService',(select coalesce(jsonb_agg(jsonb_build_object('privilege',x.privilege_type,'grantor',pg_get_userbyid(x.grantor),
   'grantable',x.is_grantable) order by x.privilege_type),'[]') from relation r
   cross join lateral aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) x where x.grantee=to_regrole('service_role')),
 'effectiveService',(select coalesce(jsonb_agg(jsonb_build_object('privilege',p,'granted',has_table_privilege('service_role',r.oid,p)) order by p),'[]')
   from relation r cross join unnest(array[${universe}]) p),
 'browser',(select coalesce(jsonb_agg(jsonb_build_object('role',role,'privilege',p,'granted',case when role='PUBLIC' then
   exists(select 1 from aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) x where x.grantee=0 and x.privilege_type=p)
   else has_table_privilege(role,r.oid,p) end) order by role,p),'[]') from relation r
   cross join unnest(array['PUBLIC','anon','authenticated']) role cross join unnest(array[${universe}]) p),
 'columnWriteSubstitutes',(select count(*) from relation r join pg_attribute a on a.attrelid=r.oid
   cross join lateral aclexplode(a.attacl) x where a.attnum>0 and not a.attisdropped
   and (x.grantee=0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role'))),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',(select jsonb_agg(case when role=0 then 'PUBLIC' else pg_get_userbyid(role) end order by role) from unnest(p.polroles) role),
   'using',pg_get_expr(p.polqual,p.polrelid,false),'withCheck',pg_get_expr(p.polwithcheck,p.polrelid,false)) order by p.polname),'[]')
   from relation r join pg_policy p on p.polrelid=r.oid),
 'serviceBypass',(select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),
 'serviceMemberships',(select count(*) from pg_auth_members where member=to_regrole('service_role')),
 'protected',md5(jsonb_build_object(
   'tableAcls',(select jsonb_agg(jsonb_build_array(c.oid,x.grantee,x.grantor,x.privilege_type,x.is_grantable)
     order by c.oid,x.grantee,x.grantor,x.privilege_type) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
     where n.nspname='public' and c.relkind in ('r','p') and not(c.oid=to_regclass('public.institutional_leads')
       and x.grantee=to_regrole('service_role') and x.privilege_type='INSERT')),
   'columns',(select jsonb_agg(to_jsonb(a) order by a.attnum) from relation r join pg_attribute a on a.attrelid=r.oid where a.attnum>0),
   'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
   'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.proconfig,p.prosrc) order by p.oid)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reflab_private','reflab_audit')),
   'rows',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]')::text) from public.institutional_leads x)
 )::text)
))`;
export const leadQuery = jsonQuery(QUERY_ID, securityExpression);
export function observationSql() {
  const sql = [jsonQuery("read_only_guard", "current_setting('transaction_read_only')"), ...additionalQueries, leadQuery]
    .map((q) => q.sql + ";").join("\n");
  assertReadOnlySql(sql); return sql;
}
export function leadChecks(e, post) {
  const expected = post ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT", "UPDATE"];
  return {
    tableSecurity: e?.tableCount === 1 && e.owner === "postgres" && e.rls === true && e.force === false,
    columns: exactServiceRows(e?.columns, Object.entries(COLUMN_TYPES).map(([column, type]) => ({ column, type }))),
    rawAcl: exactServiceRows(e?.rawService, expected.map((privilege) => ({ privilege, grantor: "postgres", grantable: false }))),
    effectiveAcl: exactServiceRows(e?.effectiveService, PRIVILEGES.map((privilege) => ({ privilege, granted: expected.includes(privilege) }))),
    browser: exactServiceRows(e?.browser, ["PUBLIC", "anon", "authenticated"].flatMap((role) => PRIVILEGES.map((privilege) => ({ role, privilege, granted: false })))),
    noColumnSubstitute: e?.columnWriteSubstitutes === 0,
    policies: exactServiceRows(e?.policies, [EXPECTED_POLICY]),
    serviceRole: e?.serviceBypass === true && e.serviceMemberships === 0,
    preservation: /^[a-f0-9]{32}$/.test(e?.protected ?? ""),
  };
}
function classify(results, proof, readOnly) {
  const base = { migrationInvocationCount: 0, approval: "NOT_PERFORMED", productionDdlAuthorized: false };
  if (!(results instanceof Map) || !results.has(QUERY_ID) || !results.has(SERVICE_FORENSIC_QUERY_ID))
    return { ...base, classification: "UNKNOWN", failedChecks: [], unknownChecks: ["missingObservation"] };
  try {
    const e = results.get(QUERY_ID), pre = leadChecks(e, false), post = leadChecks(e, true);
    const preExact = Object.values(pre).every(Boolean), postExact = Object.values(post).every(Boolean);
    // Only after validating the actual new target may an in-memory predecessor projection remove INSERT.
    const projected = structuredClone(results), p = projected.get(SERVICE_FORENSIC_QUERY_ID);
    if (p.catalogCounts.tableAcls !== p.tableAcls.length) throw new Error("ACL_COUNT_MISMATCH");
    if (postExact) {
      p.tableAcls = p.tableAcls.filter((a) => !(a.table === "institutional_leads" && a.grantee === "service_role" && a.privilege === "INSERT"));
      for (const a of p.effectiveTablePrivileges) if (a.table === "institutional_leads" && a.privilege === "INSERT") a.granted = false;
      p.catalogCounts.tableAcls--;
    }
    const predecessor = proof ? classifyLocalAdditionalTransition(projected, proof, { readOnly })
      : classifyAdditionalTransition(projected, { readOnly });
    const predecessorExact = predecessor.classification === PREDECESSOR_POST && !predecessor.failedChecks.length && !predecessor.unknownChecks.length;
    return { ...base, classification: predecessorExact && preExact ? PRE : predecessorExact && postExact ? POST : "BLOCKER",
      reexecution: postExact && predecessorExact ? "REFUSED" : "NOT_APPLICABLE", executablePre: predecessorExact && preExact,
      failedChecks: [...(!predecessorExact ? ["completedPredecessorsExact"] : []), ...(!preExact && !postExact ? ["leadTargetExact"] : [])],
      unknownChecks: [], preChecks: pre, postChecks: post, predecessor, evidence: proof ? "LOCAL_SYNTHETIC_ONLY" : "OBSERVED_CATALOG" };
  } catch { return { ...base, classification: "BLOCKER", failedChecks: ["malformedObservation"], unknownChecks: [] }; }
}
export const classifyLead = (results, { readOnly = true } = {}) => classify(results, null, readOnly);
export function classifyLocalLead(results, proof, { readOnly = true } = {}) {
  if (proof?.fixtureStatus !== "LOCAL_SYNTHETIC_DATA_ONLY") throw new Error("LOCAL_PROOF_REQUIRED");
  return classify(results, proof, readOnly);
}
export const preserved = (before, after) => additionalPreserved(before, after)
  && before.get(QUERY_ID)?.protected === after.get(QUERY_ID)?.protected
  && /^[a-f0-9]{32}$/.test(before.get(QUERY_ID)?.protected ?? "");

// No connector or Production execution runner is provided. This gate is for a future separately reviewed runner.
export function verifyCandidate({ approvedHead, target }, git, readCheckout = (p) => readFileSync(resolve(HARNESS_ROOT, p))) {
  if (!/^[a-f0-9]{40}$/.test(approvedHead ?? "") || String(git(["rev-parse", "HEAD"])).trim() !== approvedHead) throw new Error("HEAD_MISMATCH");
  if (!exactServiceRows([target], [TARGET])) throw new Error("TARGET_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) throw new Error("WORKTREE_DIRTY");
  const paths = [...Object.keys(PINNED_ARTIFACTS), MIGRATION,
    "scripts/production-adoption/phase3/phase3-institutional-leads-insert-contract.mjs", "app/api/institutional-leads/route.ts"];
  for (const path of paths) {
    const bytes = Buffer.from(git(["show", `${approvedHead}:${path}`]));
    if (readCheckout(path).toString("utf8").replaceAll("\r\n", "\n") !== bytes.toString("utf8")) throw new Error("CHECKOUT_DRIFT");
    if (PINNED_ARTIFACTS[path] && hashBytes(bytes) !== PINNED_ARTIFACTS[path]) throw new Error("PREDECESSOR_ARTIFACT_DRIFT");
    if (path === MIGRATION) assertMigration(bytes);
  }
  return { approvedHead, target: TARGET, productionDdlAuthorized: false };
}
const expectedColumns = JSON.stringify(Object.entries(COLUMN_TYPES).map(([column, type]) => ({ column, type })).sort((a,b) => a.column.localeCompare(b.column)));
const policies = JSON.stringify([EXPECTED_POLICY]);
const acl = (post) => JSON.stringify((post ? ["INSERT", "SELECT", "UPDATE"] : ["SELECT", "UPDATE"]).map((privilege) => ({ privilege, grantor: "postgres", grantable: false })));
const effective = (post) => JSON.stringify([...PRIVILEGES].sort().map((privilege) => ({ privilege, granted: (post ? ["INSERT", "SELECT", "UPDATE"] : ["SELECT", "UPDATE"]).includes(privilege) })));
export function migrationSource() {
  return `-- Local candidate only: isolated institutional_leads INSERT, never chronological migration push.
-- Full predecessor/target/committed-HEAD contract is mandatory in a future reviewed execution harness.
begin;
set local search_path=pg_catalog,public;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local idle_in_transaction_session_timeout='15s';
set local transaction_timeout='180s';
do $lead_insert$
declare before_state jsonb; after_state jsonb;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' or current_database() <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or (select rolsuper from pg_roles where rolname='postgres') then
    raise exception 'Managed PostgreSQL 17 installer required' using errcode='55000';
  end if;
  lock table public.institutional_leads in access exclusive mode;
  before_state := ${securityExpression};
  if before_state->>'owner' <> 'postgres' or before_state->>'tableCount' <> '1'
     or before_state->>'rls' <> 'true' or before_state->>'force' <> 'false'
     or before_state->>'serviceBypass' <> 'true' or before_state->>'serviceMemberships' <> '0'
     or before_state->>'columnWriteSubstitutes' <> '0'
     or before_state->'columns' is distinct from ${literal(expectedColumns)}::jsonb
     or before_state->'policies' is distinct from ${literal(policies)}::jsonb
     or before_state->'rawService' is distinct from ${literal(acl(false))}::jsonb
     or before_state->'effectiveService' is distinct from ${literal(effective(false))}::jsonb
     or jsonb_array_length(before_state->'browser') <> 24
     or exists(select 1 from jsonb_array_elements(before_state->'browser') b where (b->>'granted')::boolean) then
    raise exception 'Exact institutional_leads PRE required; reexecution refused' using errcode='55000';
  end if;
  ${GRANT}
  after_state := ${securityExpression};
  if after_state->'rawService' is distinct from ${literal(acl(true))}::jsonb
     or after_state->'effectiveService' is distinct from ${literal(effective(true))}::jsonb
     or (after_state - 'rawService' - 'effectiveService') is distinct from (before_state - 'rawService' - 'effectiveService') then
    raise exception 'Exact institutional_leads POST and preservation required' using errcode='55000';
  end if;
end
$lead_insert$;
commit;
`;
}
export function assertMigration(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.toString("utf8").replaceAll("\r\n", "\n") !== migrationSource()) throw new Error("MIGRATION_SOURCE_DRIFT");
  return { tableGrantChanges: 1, productInserts: 0, productUpdates: 0, productDeletes: 0, otherChanges: 0 };
}

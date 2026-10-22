import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { browserPrivilegeInventoryQuery, classifyBrowserPrivilegeObservation, COLUMN_PRIVILEGES } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, classifyBrowserTransition, classifyLocalBrowserTransition } from "./phase3-browser-privilege-contract.mjs";

export const SERVICE_FORENSIC_FORMAT = "REFLAB_SERVICE_ROLE_PRIVILEGE_PRODUCTION_FORENSIC_V1";
export const SERVICE_FORENSIC_QUERY_ID = "service_role_privilege_inventory";
export const PRIMARY_TABLES = BROWSER_TABLES;
export const TABLE_PRIVILEGES = PG17_TABLE_PRIVILEGES;
export const PREDEFINED_TABLE_AUTHORITIES = Object.freeze({
  pg_read_all_data: ["SELECT"], pg_write_all_data: ["INSERT", "UPDATE", "DELETE"], pg_maintain: ["MAINTAIN"],
});
export const ADDITIONAL_TABLES = Object.freeze([
  "capabilities", "capability_overrides", "plan_capabilities", "institutions", "institution_subscriptions",
  "institution_permissions", "institution_roles", "institution_role_permissions", "institution_membership_permission_overrides",
  "institution_memberships", "institution_membership_roles", "institution_groups", "institution_group_memberships", "institution_cohorts",
  "institution_contents", "institution_content_assignments", "institution_assessments", "institution_assessment_items",
  "institution_assessment_assignments", "institution_assessment_sessions", "institution_assessment_history",
  "institution_notification_campaigns", "institution_notification_recipients", "institution_demo_sessions", "institution_data_consents",
  "countries", "associations", "competitions", "competition_seasons", "competition_categories", "teams", "venues", "referee_roles",
  "referee_eligibility", "fixtures", "fixture_sync_logs", "appointments", "appointment_history", "match_officials", "match_context_snapshots",
  "performance_checkins", "performance_sessions", "physical_tests", "readiness_scores", "wellness_logs", "clips", "ifab_library_documents",
  "institutional_clips", "institutional_leads", "notification_preferences", "notification_tokens", "coach_runs", "coach_evidence",
  "ai_usage_ledger", "platform_audit_logs", "institution_audit_logs", "coach_rate_limit_buckets",
]);
export const DELETE_CALLER_TABLES = Object.freeze(["institution_content_assignments", "institution_assessment_items", "institution_membership_roles", "institution_notification_campaigns"]);
export const RELEVANT_FUNCTIONS = Object.freeze([
  "submit_referee_exam", "submit_canonical_training_attempt", "submit_canonical_communication_feedback",
  "admin_set_canonical_user_plan", "admin_set_canonical_global_role", "consume_coach_rate_limit", "accept_canonical_institution_invitation",
]);
export const DESIGN_PRIVILEGES = Object.freeze(Object.fromEntries(PRIMARY_TABLES.map((table) => [table,
  table === "user_profiles" ? ["SELECT", "UPDATE"] :
    ["match_preparations", "post_match_reviews", "psychology_checkins", "psychology_wellbeing_assessments", "psychology_exercise_sessions", "referee_exam_sessions"].includes(table)
      ? ["SELECT", "INSERT", "UPDATE"] : ["attempts", "exam_results", "notification_events"].includes(table) ? ["SELECT", "INSERT"] : ["SELECT"]])));
const list = (a) => a.map((v) => `'${v}'`).join(",");
const scope = [...PRIMARY_TABLES, ...ADDITIONAL_TABLES];

// pg_has_role(..., USAGE/SET) is authoritative for PG17's distinct edge options.
export const serviceRoleInventoryQuery = jsonQuery(SERVICE_FORENSIC_QUERY_ID, `(
 with expected(table_name) as (select unnest(array[${list(scope)}]::text[])),
 svc as (select * from pg_catalog.pg_roles where rolname='service_role'),
 relations as (select c.* from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in (${list(scope)}) and c.relkind in ('r','p')),
 cols as (select c.relname as table_name,c.oid as table_oid,a.* from relations c join pg_catalog.pg_attribute a on a.attrelid=c.oid
   where a.attnum>0 and not a.attisdropped),
 ta as (select c.relname as table_name,a.* from relations c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a),
 ca as (select c.table_name,c.attname,a.* from cols c cross join lateral pg_catalog.aclexplode(c.attacl) a),
 funcs as (select p.*,n.nspname,l.lanname,n.nspname||'.'||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' as signature
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace join pg_catalog.pg_language l on l.oid=p.prolang
   where n.nspname='public' and p.proname in (${list(RELEVANT_FUNCTIONS)})),
 fa as (select f.signature,a.* from funcs f cross join lateral pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a)
 select jsonb_build_object(
 'serverVersion',current_setting('server_version_num')::integer,
 'databaseOwner',(select pg_get_userbyid(datdba) from pg_catalog.pg_database where datname=current_database()),
 'catalogCounts',jsonb_build_object('roles',(select count(*) from pg_catalog.pg_roles),'memberships',(select count(*) from pg_catalog.pg_auth_members),
   'tableAcls',(select count(*) from ta),'columnAcls',(select count(*) from ca where table_name in (${list(PRIMARY_TABLES)})),
   'functionAcls',(select count(*) from fa)),
 'roleAttributes',(select jsonb_agg(jsonb_build_object('name',r.rolname,'rolsuper',r.rolsuper,'rolinherit',r.rolinherit,
   'rolcreaterole',r.rolcreaterole,'rolcreatedb',r.rolcreatedb,'rolcanlogin',r.rolcanlogin,'rolreplication',r.rolreplication,
   'rolbypassrls',r.rolbypassrls,'rolconnlimit',r.rolconnlimit,'serviceRoleMember',pg_has_role(s.oid,r.oid,'MEMBER'),
   'serviceRoleInherits',pg_has_role(s.oid,r.oid,'USAGE'),'serviceRoleCanSet',pg_has_role(s.oid,r.oid,'SET')) order by r.rolname)
   from pg_catalog.pg_roles r cross join svc s),
 'roleMemberships',(select coalesce(jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),'role',pg_get_userbyid(m.roleid),
   'grantor',pg_get_userbyid(m.grantor),'adminOption',m.admin_option,'inheritOption',m.inherit_option,'setOption',m.set_option)
   order by m.member,m.roleid,m.grantor),'[]'::jsonb) from pg_catalog.pg_auth_members m),
 'tables',(select jsonb_agg(jsonb_build_object('schema','public','table',e.table_name,'exists',c.oid is not null,
   'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'rawAcl',c.relacl,
   'aclOrigin',case when c.oid is null then 'ABSENT' when c.relacl is null then 'DEFAULT_OWNER_ACL' else 'EXPLICIT_ACL' end)
   order by e.table_name) from expected e left join relations c on c.relname=e.table_name),
 'tableAcls',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,
   'grantee',case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end,'grantor',pg_get_userbyid(grantor),
   'privilege',privilege_type,'grantable',is_grantable) order by table_name,grantee,grantor,privilege_type),'[]'::jsonb) from ta),
 'effectiveTablePrivileges',(select jsonb_agg(jsonb_build_object('schema','public','table',e.table_name,'role','service_role',
   'privilege',p.privilege,'granted',case when c.oid is null then null else pg_catalog.has_table_privilege(s.oid,c.oid,p.privilege) end)
   order by e.table_name,p.privilege) from expected e left join relations c on c.relname=e.table_name cross join svc s
   cross join unnest(array[${list(TABLE_PRIVILEGES)}]::text[]) p(privilege)),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,'column',attname,'rawAcl',attacl)
   order by table_name,attnum),'[]'::jsonb) from cols where table_name in (${list(PRIMARY_TABLES)})),
 'columnAcls',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,'column',attname,
   'grantee',case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end,'grantor',pg_get_userbyid(grantor),
   'privilege',privilege_type,'grantable',is_grantable) order by table_name,attname,grantee,grantor,privilege_type),'[]'::jsonb)
   from ca where table_name in (${list(PRIMARY_TABLES)})),
 'effectiveColumnPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',c.table_name,'column',c.attname,
   'role','service_role','privilege',p.privilege,'granted',pg_catalog.has_column_privilege(s.oid,c.table_oid,c.attnum,p.privilege))
   order by c.table_name,c.attnum,p.privilege),'[]'::jsonb) from cols c cross join svc s
   cross join unnest(array[${list(COLUMN_PRIVILEGES)}]::text[]) p(privilege) where c.table_name in (${list(PRIMARY_TABLES)})),
 'relevantFunctions',(select jsonb_agg(jsonb_build_object('name',e.name,'exists',f.oid is not null,'signature',f.signature,
   'owner',pg_get_userbyid(f.proowner),'language',f.lanname,'security_definer',f.prosecdef,'volatility',f.provolatile,
   'strict',f.proisstrict,'leakproof',f.proleakproof,'configuration',f.proconfig,'sourceHash',md5(f.prosrc),
   'rawAcl',f.proacl,'serviceRoleExecute',case when f.oid is null then null else pg_catalog.has_function_privilege(s.oid,f.oid,'EXECUTE') end)
   order by e.name,f.signature) from unnest(array[${list(RELEVANT_FUNCTIONS)}]::text[]) e(name)
   left join funcs f on f.proname=e.name cross join svc s),
 'functionExecuteAcls',(select coalesce(jsonb_agg(jsonb_build_object('signature',signature,
   'grantee',case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end,'grantor',pg_get_userbyid(grantor),
   'privilege',privilege_type,'grantable',is_grantable) order by signature,grantee,grantor),'[]'::jsonb) from fa)
 )
)`);
export function buildServiceRoleForensicBatch() {
  return buildSqlBatch([installerIdentityQuery, identityBridgePostQuery, corePolicyQuery, coreBaselineAdoptionQuery,
    browserPrivilegeInventoryQuery, serviceRoleInventoryQuery]);
}
const stable = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
const unique = (rows, key) => Array.isArray(rows) && new Set(rows.map(key)).size === rows.length;
const bools = (row, keys) => keys.every((k) => typeof row?.[k] === "boolean");
export function serviceRolePaths(inventory, target, option = "inheritOption") {
  const paths = [], edges = inventory.roleMemberships;
  let visits = 0;
  function visit(role, path) {
    if (++visits > 65536 || paths.length > 4096 || path.length > Math.min(128, inventory.roleAttributes.length)) throw new Error("ROLE_PATH_LIMIT_EXCEEDED");
    if (role === target) {paths.push(path); return;}
    for (const edge of edges.filter((e) => e.member === role && (option === null || e[option]))) {
      if (path.includes(edge.role)) throw new Error("ROLE_PATH_CYCLE");
      visit(edge.role, [...path, edge.role]);
    }
  }
  visit("service_role", ["service_role"]);
  return paths;
}
export function privilegeOrigins(row, inventory, column = false, execute = false) {
  const service = inventory.roleAttributes.find((r) => r.name === "service_role");
  const roles = new Map(inventory.roleAttributes.map((r) => [r.name, r]));
  const acl = execute ? inventory.functionExecuteAcls.filter((a) => a.signature === row.signature) : [
    ...inventory.tableAcls.filter((a) => a.table === row.table),
    ...(column ? inventory.columnAcls.filter((a) => a.table === row.table && a.column === row.column) : []),
  ];
  const origins = acl.filter((a) => a.privilege === row.privilege && (a.grantee === "PUBLIC" || roles.get(a.grantee)?.serviceRoleInherits))
    .map((a) => ({path: a.grantee === "PUBLIC" ? "PUBLIC" : a.grantee === "service_role" ? "DIRECT_SERVICE_ROLE_GRANT" : a.grantee === "pg_database_owner" ? "IMPLICIT_DATABASE_OWNER" : "INHERITED_ROLE_GRANT",
      grantee: a.grantee, grantor: a.grantor, grantable: a.grantable, scope: a.column ? "COLUMN" : execute ? "FUNCTION" : "TABLE",
      ownershipAcl: !execute && inventory.tables.find((t) => t.table === row.table)?.owner === a.grantee,
      membershipPaths: a.grantee === "PUBLIC" || service?.rolsuper ? [] : serviceRolePaths(inventory, a.grantee)}));
  if (!execute) for (const [role, privileges] of Object.entries(PREDEFINED_TABLE_AUTHORITIES)) {
    if (privileges.includes(row.privilege) && roles.get(role)?.serviceRoleInherits) origins.push({path: "PREDEFINED_ROLE_AUTHORITY",
      role, privilege: row.privilege, scope: column ? "TABLE_DERIVED_COLUMN" : "TABLE", grantable: false,
      membershipPaths: service?.rolsuper ? [] : serviceRolePaths(inventory, role)});
  }
  if (service?.rolsuper) origins.push({path: "SUPERUSER"});
  return stable(origins);
}
export function currentDesignDelta(effective) {
  const rows = effective.filter((r) => PRIMARY_TABLES.includes(r.table));
  const revoke = rows.filter((r) => r.granted === true && !DESIGN_PRIVILEGES[r.table].includes(r.privilege));
  const grant = rows.filter((r) => r.granted === false && DESIGN_PRIVILEGES[r.table].includes(r.privilege));
  return {purpose: "DESIGN_INPUT_ONLY_NOT_AUTHORIZED", revoke: stable(revoke), grant: stable(grant),
    unchangedRequired: stable(rows.filter((r) => r.granted === true && DESIGN_PRIVILEGES[r.table].includes(r.privilege))),
    unexpectedPrivileges: stable(revoke), missingRequiredPrivileges: stable(grant),
    effectivePrivilegeEntryRevocations: revoke.length, effectivePrivilegeEntryGrants: grant.length,
    sqlRevokeStatementCount: "NOT_DERIVED", sqlGrantStatementCount: "NOT_DERIVED"};
}
function classify(results, options, localProof) {
  const inventory = results?.get?.(SERVICE_FORENSIC_QUERY_ID);
  const browser = classifyBrowserPrivilegeObservation(results, {targetExact: options.targetExact === true});
  const transition = localProof ? classifyLocalBrowserTransition(browser, localProof) : classifyBrowserTransition(browser);
  const {executablePre: _executablePre, ...browser64249Observation} = transition;
  void _executablePre;
  const roles = inventory?.roleAttributes ?? [], memberships = inventory?.roleMemberships ?? [];
  const tables = inventory?.tables ?? [], acls = inventory?.tableAcls ?? [], columns = inventory?.columns ?? [];
  const effective = inventory?.effectiveTablePrivileges ?? [], columnEffective = inventory?.effectiveColumnPrivileges ?? [];
  const functions = inventory?.relevantFunctions ?? [], functionAcls = inventory?.functionExecuteAcls ?? [];
  const roleNames = new Set(roles.map((r) => r.name));
  const aclValid = (a, column = false) => a?.schema === "public" && scope.includes(a.table) && typeof a.grantee === "string"
    && (a.grantee === "PUBLIC" || roleNames.has(a.grantee)) && roleNames.has(a.grantor) && typeof a.grantable === "boolean"
    && (column ? COLUMN_PRIVILEGES : TABLE_PRIVILEGES).includes(a.privilege) && (!column || typeof a.column === "string");
  const checks = {
    transactionReadOnly: results?.get?.("read_only_guard") === "on", targetExact: options.targetExact === true,
    pg17Exact: Number.isInteger(inventory?.serverVersion) && inventory.serverVersion >= 170000 && inventory.serverVersion < 180000,
    rolesComplete: unique(roles, (r) => r.name) && ["service_role", "authenticator", "postgres", "reflab_rls_owner", "reflab_prod_preflight_ro", "reflab_preflight_audit_owner"].every((r) => roleNames.has(r))
      && roles.every((r) => typeof r.name === "string" && Number.isInteger(r.rolconnlimit) && bools(r, ["rolsuper", "rolinherit", "rolcreaterole", "rolcreatedb", "rolcanlogin", "rolreplication", "rolbypassrls", "serviceRoleMember", "serviceRoleInherits", "serviceRoleCanSet"])),
    membershipsComplete: unique(memberships, (m) => `${m.member}:${m.role}:${m.grantor}`) && memberships.every((m) => [m.member, m.role, m.grantor].every((r) => roleNames.has(r)) && bools(m, ["adminOption", "inheritOption", "setOption"])),
    catalogCountsExact: inventory?.catalogCounts?.roles === roles.length && inventory?.catalogCounts?.memberships === memberships.length
      && inventory?.catalogCounts?.tableAcls === acls.length && inventory?.catalogCounts?.columnAcls === inventory?.columnAcls?.length && inventory?.catalogCounts?.functionAcls === functionAcls.length,
    tableScopeComplete: unique(tables, (t) => t.table) && tables.length === scope.length && scope.every((t) => tables.some((r) => r.schema === "public" && r.table === t && typeof r.exists === "boolean"))
      && tables.every((t) => !t.exists || roleNames.has(t.owner) && bools(t, ["rls", "force"])),
    rawAclComplete: unique(acls, (a) => `${a.table}:${a.grantee}:${a.grantor}:${a.privilege}`) && acls.every((a) => aclValid(a)),
    effectiveTableComplete: unique(effective, (r) => `${r.table}:${r.privilege}`) && effective.length === scope.length * 8
      && scope.every((table) => TABLE_PRIVILEGES.every((privilege) => effective.some((r) => r.schema === "public" && r.table === table && r.role === "service_role" && r.privilege === privilege
        && (tables.find((t) => t.table === table)?.exists ? typeof r.granted === "boolean" : r.granted === null)))),
    columnsComplete: unique(columns, (c) => `${c.table}:${c.column}`) && columns.length === browser.columns?.length
      && columns.every((c) => c.schema === "public" && browser.columns.some((b) => b.table === c.table && b.column === c.column)),
    columnAclComplete: Array.isArray(inventory?.columnAcls) && inventory.columnAcls.every((a) => aclValid(a, true))
      && unique(inventory.columnAcls, (a) => `${a.table}:${a.column}:${a.grantee}:${a.grantor}:${a.privilege}`),
    effectiveColumnComplete: unique(columnEffective, (r) => `${r.table}:${r.column}:${r.privilege}`) && columnEffective.length === columns.length * 4
      && columns.every((c) => COLUMN_PRIVILEGES.every((p) => columnEffective.some((r) => r.schema === "public" && r.table === c.table && r.column === c.column && r.privilege === p && r.role === "service_role" && typeof r.granted === "boolean"))),
    functionsComplete: unique(functions, (f) => f.exists ? f.signature : `ABSENT:${f.name}`) && RELEVANT_FUNCTIONS.every((name) => functions.some((f) => f.name === name && typeof f.exists === "boolean"))
      && functions.every((f) => RELEVANT_FUNCTIONS.includes(f.name) && (!f.exists || typeof f.signature === "string" && roleNames.has(f.owner) && typeof f.language === "string"
        && ["i", "s", "v"].includes(f.volatility) && /^[a-f0-9]{32}$/.test(f.sourceHash) && (f.configuration === null || Array.isArray(f.configuration) && f.configuration.every((s) => typeof s === "string"))
        && bools(f, ["security_definer", "serviceRoleExecute", "strict", "leakproof"]))),
    functionAclsComplete: unique(functionAcls, (a) => `${a.signature}:${a.grantee}:${a.grantor}:${a.privilege}`) && functionAcls.every((a) => functions.some((f) => f.signature === a.signature)
      && a.privilege === "EXECUTE" && (a.grantee === "PUBLIC" || roleNames.has(a.grantee)) && roleNames.has(a.grantor) && typeof a.grantable === "boolean"),
    protected64249PostExact: transition.classification === "64249_ALREADY_INSTALLED_POST",
    protected64245Exact: browser["64245PostState"]?.comparison === "EXACT" && browser.policies?.length === 55,
    protected64236Exact: browser["64236State"]?.comparison === "EXACT",
    historicalExact: transition.checks.historicalExact === true, adoptionExact: transition.checks.adoptionExact === true,
  };
  checks.primaryCatalogCopiesExact = JSON.stringify(stable(acls.filter((a) => PRIMARY_TABLES.includes(a.table)))) === JSON.stringify(stable(browser.tableAcls ?? []))
    && JSON.stringify(stable(inventory?.columnAcls ?? [])) === JSON.stringify(stable(browser.columnAcls ?? []))
    && tables.filter((t) => PRIMARY_TABLES.includes(t.table)).every((t) => browser.tables?.some((b) => b.table === t.table && b.owner === t.owner && b.rls === t.rls && b.force === t.force));
  checks.membershipPathsExact = checks.rolesComplete && checks.membershipsComplete && roles.every((r) => {
    if (roles.find((s) => s.name === "service_role")?.rolsuper || r.name === "pg_database_owner" && inventory.databaseOwner === "service_role") return true;
    return r.serviceRoleInherits === (serviceRolePaths(inventory, r.name).length > 0)
      && r.serviceRoleCanSet === (serviceRolePaths(inventory, r.name, "setOption").length > 0)
      && r.serviceRoleMember === (serviceRolePaths(inventory, r.name, null).length > 0);
  });
  const shapeExact = Object.entries(checks).filter(([k]) => !k.startsWith("protected") && !["historicalExact", "adoptionExact"].includes(k)).every(([, v]) => v);
  const enriched = shapeExact ? effective.map((r) => ({...r, origins: privilegeOrigins(r, inventory)})) : [];
  const enrichedColumns = shapeExact ? columnEffective.map((r) => ({...r, origins: privilegeOrigins(r, inventory, true)})) : [];
  const enrichedFunctions = shapeExact ? functions.map((f) => ({...f, underlyingAccessRole: !f.exists ? "ABSENT" : f.security_definer ? f.owner : "CALLER_INVOKER_SERVICE_ROLE",
    executeOrigins: !f.exists ? [] : privilegeOrigins({signature: f.signature, privilege: "EXECUTE"}, inventory, false, true)})) : functions;
  checks.effectiveOriginsExact = shapeExact && [...enriched, ...enrichedColumns].every((r) => r.granted === null || r.granted === (r.origins.length > 0))
    && enrichedFunctions.every((f) => !f.exists || f.serviceRoleExecute === (f.executeOrigins.length > 0));
  const service = roles.find((r) => r.name === "service_role");
  const withRls = tables.map((t) => ({...t, serviceRoleRowAccessPath: !t.exists ? "ABSENT" : !t.rls ? "ACL_ONLY_SUFFICIENT"
    : service?.rolsuper ? "SUPERUSER_BYPASS" : service?.rolbypassrls ? "BYPASSRLS" : !t.force && roles.find((r) => r.name === t.owner)?.serviceRoleInherits ? "OWNER_BYPASS" : "POLICY_REQUIRED",
    tableAclStillRequired: true}));
  const failedChecks = Object.keys(checks).filter((k) => !checks[k]);
  return {format: SERVICE_FORENSIC_FORMAT, classification: failedChecks.length ? "BLOCKER" : "SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE",
    approvedHead: options.approvedHead ?? null, target: options.target ?? null, transactionReadOnly: checks.transactionReadOnly,
    transaction: "ROLLBACK", checks, failedChecks, unknownChecks: checks.effectiveOriginsExact ? [] : ["effectivePrivilegeOrigins"], roleAttributes: stable(roles), roleMemberships: stable(memberships),
    membershipDirection: "MEMBER_CAN_REACH_GRANTED_ROLE; INHERIT_AND_SET_OPTIONS_DISTINCT",
    roleCapabilities: Object.fromEntries(roles.map((r) => [r.name, {canSetRole: r.serviceRoleCanSet, inheritsPrivileges: r.serviceRoleInherits, member: r.serviceRoleMember,
      membershipPaths: shapeExact ? serviceRolePaths(inventory, r.name, null) : [],
      inheritPaths: shapeExact ? serviceRolePaths(inventory, r.name) : [], setRolePaths: shapeExact ? serviceRolePaths(inventory, r.name, "setOption") : []}])),
    primaryTables: withRls.filter((t) => PRIMARY_TABLES.includes(t.table)), primaryTableRawAcls: stable(acls.filter((a) => PRIMARY_TABLES.includes(a.table))),
    primaryEffectiveServiceRolePrivileges: stable(enriched.filter((r) => PRIMARY_TABLES.includes(r.table))), primaryColumnAcls: stable(inventory?.columnAcls ?? []),
    primaryEffectiveColumnPrivileges: stable(enrichedColumns), policies: browser.policies ?? [], relevantFunctions: stable(enrichedFunctions), functionExecuteAcls: stable(functionAcls),
    directTableCallerDomains: ["psychology", "notification_events", "profile", "match_preparations", "post_match_reviews"],
    rulesExamSubmissionRpc: "submit_referee_exam", refereeSessionSubmissionRpc: "submit_referee_exam",
    additionalRuntimeTables: withRls.filter((t) => ADDITIONAL_TABLES.includes(t.table)), additionalTableRawAcls: stable(acls.filter((a) => ADDITIONAL_TABLES.includes(a.table))),
    additionalEffectiveServiceRolePrivileges: stable(enriched.filter((r) => ADDITIONAL_TABLES.includes(r.table))),
    ADDITIONAL_RUNTIME_SCOPE: "ADDITIONAL_RUNTIME_SCOPE_OBSERVED_NOT_MUTATION_AUTHORIZED",
    deleteCallerTables: Object.fromEntries(DELETE_CALLER_TABLES.map((t) => [t, {table: withRls.find((r) => r.table === t), effectivePrivileges: enriched.filter((r) => r.table === t)}])),
    coachRateLimitState: {table: withRls.find((t) => t.table === "coach_rate_limit_buckets"), effectivePrivileges: enriched.filter((r) => r.table === "coach_rate_limit_buckets"),
      functions: enrichedFunctions.filter((f) => f.name === "consume_coach_rate_limit")},
    predecessorState: {identity64236: browser["64236State"], core64245: browser["64245PostState"], browser64249: {
      ...browser64249Observation, reexecutionAuthorized: false, executionAuthorization: "NOT_GRANTED_BY_FORENSIC"}},
    adoptionState: browser.adoptionState, historicalState: browser.historicalState,
    historicalEvidence: localProof ? "LOCAL_SYNTHETIC_DATA_ONLY" : "PINNED_PRODUCTION_EVIDENCE",
    currentServiceRoleMatrix: stable(enriched.filter((r) => PRIMARY_TABLES.includes(r.table))),
    proposedDesignMatrix: {status: "REPOSITORY_CALLER_DESIGN_PENDING_PRODUCTION_OBSERVATION", privileges: DESIGN_PRIVILEGES},
    currentVsDesignDelta: checks.effectiveOriginsExact ? currentDesignDelta(enriched) : null,
    rawAclItemCount: tables.reduce((n, t) => n + (t.rawAcl?.length ?? 0), 0), expandedAclPrivilegeEntryCount: acls.length,
    approval: "NOT_PERFORMED", mutationCount: 0, migrationInvocationCount: 0,
    GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE", SEPARATE_SERVICE_ROLE_PRIVILEGE_WAVE_REQUIRED: "YES",
    TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES", RUNTIME_ENABLEMENT_BLOCKED_BY_FINAL_PRIVILEGE_WAVE: "YES",
    "64253_INDEPENDENT_REVIEW_REQUIRED": "YES", productionDdlAuthorized: false};
}
export const classifyServiceRoleForensic = (results, options = {}) => classify(results, options, null);
export function classifyLocalServiceRoleForensic(results, options, proof) {
  if (proof?.fixtureStatus !== "LOCAL_SYNTHETIC_DATA_ONLY") throw new Error("LOCAL_FIXTURE_PROOF_REQUIRED");
  return classify(results, options, proof);
}

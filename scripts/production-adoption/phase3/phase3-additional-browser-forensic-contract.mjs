import { readFileSync, readdirSync } from "node:fs";
import { posix, resolve } from "node:path";
import { ADDITIONAL_SERVICE_TABLES, ADDITIONAL_PRIVILEGES, additionalBrowserMatrix } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { PINNED_ARTIFACTS, PRE_BEGIN } from "./phase3-additional-runtime-pre-contract.mjs";
import { HARNESS_ROOT, TARGET, defaultGit, hashBytes, failHarness, resolveCurrentHarnessTarget,
  serializeCurrentHarness, safeHarnessFailure } from "./phase3-current-service-role-pre-contract.mjs";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";

export { TARGET, HARNESS_ROOT, defaultGit, hashBytes, failHarness, serializeCurrentHarness, safeHarnessFailure };
export const TABLES = ADDITIONAL_SERVICE_TABLES;
export const PRIVILEGES = ADDITIONAL_PRIVILEGES;
export const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];
export const FORMAT = "REFLAB_ADDITIONAL_RUNTIME_BROWSER_POLICY_COLUMN_FORENSIC_V1";
export const COMPLETE = "ADDITIONAL_RUNTIME_BROWSER_POLICY_COLUMN_OBSERVATION_COMPLETE";
export const OPERATION = "--production-additional-runtime-browser-policy-column-forensic";
export const RUNNER = "scripts/production-adoption/phase3/run-production-additional-browser-forensic.mjs";
export const VARIABLES = ["ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_BROWSER_FORENSIC", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL"];
export const BEGIN = PRE_BEGIN + "\nset transaction isolation level repeatable read;\nset local search_path=pg_catalog;";
export const BOUNDARY = Object.freeze({ purpose: "OBSERVATION_ONLY_NOT_ACL_TARGET_AUTHORIZATION",
  primaryServiceRole: "COMPLETED_IN_PRODUCTION_NOT_REEXECUTABLE", additionalServiceRole: "COMPLETED_IN_PRODUCTION_NOT_REEXECUTABLE",
  browserMutationAuthorized: false, runtime: "NOT_EXECUTED", cutover: "NOT_EXECUTED", phase4: "NOT_EXECUTED",
  genericMigrationPushAuthorized: false, additionalBrowserTarget: "PENDING_POLICY_DEPENDENCY_EVIDENCE" });

export function prepareBrowserForensic(environment, dependencies, executingBytes) {
  const git = dependencies.git ?? defaultGit;
  if (dependencies.argument !== OPERATION) failHarness("OPERATION_NOT_AUTHORIZED");
  if (VARIABLES.slice(0, 3).some((key) => environment[key] !== "true")) failHarness("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((key) => /^PG/i.test(key))) failHarness("INHERITED_PG_STATE");
  if (Object.keys(environment).some((key) => /^(NODE_OPTIONS$|NODE_PATH$|NODE_TEST)/i.test(key))) failHarness("INHERITED_EXECUTION_OVERRIDE");
  if (Object.keys(environment).some((key) => /^(ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/i.test(key) && !VARIABLES.includes(key)))
    failHarness("CONFLICTING_PRODUCTION_CONFIGURATION");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || environment[VARIABLES[4]] !== head) failHarness("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) failHarness("WORKTREE_DIRTY");
  // The shared canonical-contract loader reads these sources at module initialization.
  // Pin read dependencies only; none is selected for migration execution.
  const canonicalFile = (path) => /^supabase\/migrations\/2026\d{8}_.+[.]sql$/.test(path)
    && path.split("/").at(-1) >= "202607270000";
  const sourceFiles = String(git(["ls-tree", "-r", "--name-only", head, "--", "supabase/migrations"]))
    .trim().split(/\r?\n/).filter(canonicalFile).sort();
  const checkoutSources = (dependencies.readMigrationNames ?? (() => readdirSync(resolve(HARNESS_ROOT, "supabase/migrations"))))()
    .map((name) => `supabase/migrations/${name}`).filter(canonicalFile).sort();
  if (JSON.stringify(sourceFiles) !== JSON.stringify(checkoutSources)) failHarness("SOURCE_ARTIFACT_INVENTORY_MISMATCH");
  const pending = [...Object.keys(PINNED_ARTIFACTS), ...sourceFiles, "supabase/baseline/manifest.json", RUNNER, "package.json"], hashes = {};
  while (pending.length) {
    const path = pending.shift();
    if (Object.hasOwn(hashes, path)) continue;
    if (path.startsWith("../") || !/^[a-zA-Z0-9_./-]+$/.test(path)) failHarness("ARTIFACT_PATH_REJECTED");
    const bytes = Buffer.from(git(["show", `${head}:${path}`]));
    const checkout = (dependencies.readCheckout ?? ((p) => readFileSync(resolve(HARNESS_ROOT, p))))(path);
    if (!Buffer.isBuffer(checkout) || checkout.toString("utf8").replaceAll("\r\n", "\n") !== bytes.toString("utf8"))
      failHarness("CHECKOUT_ARTIFACT_MISMATCH");
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
    artifactHashes: hashes, scopeBoundary: BOUNDARY };
  serializeCurrentHarness(metadata, environment);
  return { metadata, connectionEnvironment: target.connectionEnvironment };
}

const literalList = (values) => values.map((x) => `'${x}'`).join(",");
const aggregate = (sql) => `(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (${sql}) x)`;
const scope = `c.relnamespace='public'::regnamespace and c.relname in (${literalList(TABLES)}) and c.relkind in ('r','p')`;
const roleName = (field) => `case when ${field}=0 then 'PUBLIC' else pg_get_userbyid(${field}) end`;
const aclRows = (fields) => `select ${fields}, ${roleName("a.grantee")} as grantee,
  pg_get_userbyid(a.grantor) as grantor, a.privilege_type as privilege, a.is_grantable as grantable`;
const rolesSql = `select r.oid::bigint as oid,r.rolname as name,r.rolsuper,r.rolinherit,r.rolbypassrls,r.rolcanlogin,r.rolcreaterole,
 r.rolcreatedb,r.rolreplication,r.rolconnlimit,
 ${["anon", "authenticated", "service_role"].map((role) => `pg_has_role('${role}',r.oid,'USAGE') as "${role}Inherits"`).join(",")}
 from pg_roles r order by r.rolname`;

export function inventorySql() {
  const query = jsonQuery("additional_browser_inventory", `jsonb_build_object(
    'transactionReadOnly',current_setting('transaction_read_only'), 'serverVersion',current_setting('server_version_num'),
    'roleAttributes',${aggregate(rolesSql)}, 'roleCount',(select count(*) from pg_roles),
    'membershipCount',(select count(*) from pg_auth_members),
    'operatorFunctions',${aggregate(`select oid::bigint as oid,oprcode::oid::bigint as "functionOid" from pg_operator order by oid`)},
    'roleMemberships',${aggregate(`select pg_get_userbyid(member) as member,pg_get_userbyid(roleid) as role,
      pg_get_userbyid(grantor) as grantor,admin_option,inherit_option,set_option from pg_auth_members order by member,roleid,grantor`)},
    'tables',${aggregate(`select 'public' as schema,c.relname as table,c.oid,pg_get_userbyid(c.relowner) as owner,
      c.relrowsecurity as rls,c.relforcerowsecurity as force,c.relacl as "rawAcl",
      (select count(*) from pg_policy p where p.polrelid=c.oid) as "policyCount",
      (select count(*) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))) as "rawAclEntryCount",
      (select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as "columnCount"
      from pg_class c where ${scope} order by c.relname`)},
    'tableAcls',${aggregate(`${aclRows("'public' as schema,c.relname as table,case when c.relacl is null then 'POSTGRESQL_DEFAULT_ACL' else 'EXPLICIT_ACL' end as basis")}
      from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where ${scope} order by c.relname,a.grantee,a.privilege_type,a.grantor`)},
    'effectiveTables',${aggregate(`select 'public' as schema,c.relname as table,r.role,p.privilege,
      case when r.role='PUBLIC' then exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where a.grantee=0 and a.privilege_type=p.privilege) else has_table_privilege(r.role,c.oid,p.privilege) end as effective
      from pg_class c cross join (values ('anon'),('authenticated'),('PUBLIC')) r(role)
      cross join (values ${PRIVILEGES.map((p) => `('${p}')`).join(",")}) p(privilege)
      where ${scope} order by c.relname,r.role,p.privilege`)},
    'policies',${aggregate(`select 'public' as schema,c.relname as table,p.oid::bigint as oid,p.polname as name,
      case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
      p.polcmd as command,ARRAY(select ${roleName("x")} from unnest(p.polroles) x order by x) as roles,
      pg_get_expr(p.polqual,p.polrelid,false) as "usingExpression",pg_get_expr(p.polwithcheck,p.polrelid,false) as "withCheckExpression",
      p.polqual::text as "usingTree",p.polwithcheck::text as "withCheckTree",
      ARRAY(select d.refobjid::bigint from pg_depend d where d.classid='pg_policy'::regclass and d.objid=p.oid
        and d.refclassid='pg_proc'::regclass order by d.refobjid) as "catalogFunctionOids"
      from pg_policy p join pg_class c on c.oid=p.polrelid where ${scope} order by c.relname,p.polname`)},
    'columns',${aggregate(`select 'public' as schema,c.relname as table,a.attname as column,a.attnum,a.attacl as "rawAcl",
      (select count(*) from aclexplode(a.attacl)) as "rawAclEntryCount"
      from pg_class c join pg_attribute a on a.attrelid=c.oid where ${scope} and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`)},
    'columnAcls',${aggregate(`${aclRows("'public' as schema,c.relname as table,b.attname as column")}
      from pg_class c join pg_attribute b on b.attrelid=c.oid cross join lateral aclexplode(b.attacl) a
      where ${scope} and b.attnum>0 and not b.attisdropped order by c.relname,b.attnum,a.grantee,a.privilege_type,a.grantor`)},
    'effectiveColumns',${aggregate(`select 'public' as schema,c.relname as table,a.attname as column,r.role,p.privilege,
      has_column_privilege(r.role,c.oid,a.attnum,p.privilege) as effective,
      has_table_privilege(r.role,c.oid,p.privilege) as "tableLevelEffective"
      from pg_class c join pg_attribute a on a.attrelid=c.oid cross join (values ('anon'),('authenticated')) r(role)
      cross join (values ${COLUMN_PRIVILEGES.map((p) => `('${p}')`).join(",")}) p(privilege)
      where ${scope} and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum,r.role,p.privilege`)}
  )`).sql + ";";
  assertReadOnlySql(query); return query;
}

export function functionsSql(oids) {
  if (!oids.length || oids.some((oid) => !Number.isSafeInteger(oid) || oid <= 0)) failHarness("FUNCTION_OID_REJECTED");
  const query = jsonQuery("additional_browser_functions", aggregate(`select p.oid::bigint as oid,n.nspname as schema,p.proname as name,
    pg_get_function_identity_arguments(p.oid) as "identityArguments",pg_get_function_result(p.oid) as "returnType",
    l.lanname as language,pg_get_userbyid(p.proowner) as owner,p.prosecdef as "securityDefiner",p.proconfig as configuration,
    p.provolatile as volatility,p.proisstrict as strict,p.proleakproof as leakproof,
    md5(p.prosrc || coalesce(p.prosqlbody::text,'')) as "sourceHash",'MD5_PROSRC_AND_CATALOG_SQL_BODY' as "sourceHashBasis",
    p.proacl as "rawAcl",p.prosqlbody::text as "sqlBodyTree",
    (select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))) as "executeAclEntryCount",
    ${aggregate(`select d.refobjid::bigint as oid,d.refclassid::regclass::text as catalog,d.refobjsubid as subobject
      from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid
      and d.refclassid in ('pg_proc'::regclass,'pg_class'::regclass) order by d.refclassid,d.refobjid,d.refobjsubid`)} as "catalogDependencies",
    ${aggregate(`${aclRows("p.oid::bigint as function,case when p.proacl is null then 'POSTGRESQL_DEFAULT_ACL' else 'EXPLICIT_ACL' end as basis")}
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a order by a.grantee,a.privilege_type,a.grantor`)} as "executeAcls",
    ${aggregate(`select c.oid::bigint as oid,n.nspname as schema,c.relname as table,c.relkind as kind,
      pg_get_userbyid(c.relowner) as owner,c.relrowsecurity as rls,c.relforcerowsecurity as force
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid in
      (select d.refobjid from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_class'::regclass)
      order by c.oid`)} as "relationIdentities",
    ${aggregate(`select r.role,case when r.role='PUBLIC' then exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE') else has_function_privilege(r.role,p.oid,'EXECUTE') end as effective
      from (select distinct role from (values ('anon'),('authenticated'),('PUBLIC'),('service_role'),(pg_get_userbyid(p.proowner))) v(role)) r order by r.role`)} as "effectiveExecute"
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where p.oid in (${oids.join(",")}) order by p.oid`)).sql + ";";
  assertReadOnlySql(query); return query;
}

// Parse PostgreSQL's catalog node serialization, not deparsed SQL or function names.
export function parseCatalogTree(text) {
  if (text === null || text === undefined) return null;
  const tokens = String(text).match(/"(?:\\.|[^"\\])*"|[{}()]|:[A-Za-z0-9_]+|[^\s{}()]+/g) ?? [];
  let at = 0;
  function value(depth = 0) {
    if (depth > 1000 || at >= tokens.length) throw new Error("CATALOG_TREE_INCOMPLETE");
    const token = tokens[at++];
    if (token === "{") {
      const node = { tag: tokens[at++] };
      while (tokens[at] !== "}") {
        const key = tokens[at++];
        if (!key?.startsWith(":")) throw new Error("CATALOG_TREE_FIELD");
        const values = [];
        while (at < tokens.length && tokens[at] !== "}" && !tokens[at].startsWith(":")) values.push(value(depth + 1));
        node[key.slice(1)] = values.length === 1 ? values[0] : values;
      }
      at++; return node;
    }
    if (token === "(") {
      const list = [];
      while (tokens[at] !== ")") list.push(value(depth + 1));
      at++; return list;
    }
    if ([")", "}"].includes(token)) throw new Error("CATALOG_TREE_DELIMITER");
    return /^-?\d+$/.test(token) ? Number(token) : token;
  }
  const result = value();
  if (at !== tokens.length) throw new Error("CATALOG_TREE_TRAILING");
  return result;
}

export function inspectCatalogTree(text, operators = []) {
  const functions = new Set(), tableOperations = [], unresolved = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (["COERCEVIAIO", "COERCETODOMAIN", "NEXTVALUEEXPR"].includes(node.tag)) unresolved.push(node.tag);
    for (const key of ["funcid", "opfuncid", "aggfnoid", "winfnoid", "hashfuncid", "negfuncid"]) if (Number(node[key]) > 0) functions.add(Number(node[key]));
    if (Number(node.opno) > 0 && !Number(node.opfuncid)) {
      const oid = operators.find((o) => o.oid === Number(node.opno))?.functionOid;
      if (oid > 0) functions.add(oid); else unresolved.push("OPERATOR_IMPLEMENTATION_UNRESOLVED");
    }
    if (node.tag === "ROWCOMPAREEXPR") for (const op of (node.opnos ?? []).filter((o) => Number.isInteger(o))) {
      const oid = operators.find((o) => o.oid === op)?.functionOid;
      if (oid > 0) functions.add(oid); else unresolved.push("ROW_OPERATOR_IMPLEMENTATION_UNRESOLVED");
    }
    if (node.tag === "RTEPERMISSIONINFO" && Number(node.relid) > 0) {
      const bits = Number(node.requiredPerms);
      if (!Number.isSafeInteger(bits) || bits < 0) throw new Error("CATALOG_PERMISSION_BITS");
      tableOperations.push({ relationOid: Number(node.relid), checkAsUserOid: Number(node.checkAsUser ?? 0), operations: [[1, "INSERT"], [2, "SELECT"], [4, "UPDATE"], [8, "DELETE"]]
        .filter(([mask]) => bits & mask).map(([, operation]) => operation), evidence: "PG17_RTEPERMISSIONINFO" });
      if (bits & ~15) unresolved.push("UNMODELED_RELATION_PERMISSION");
    }
    for (const child of Object.values(node)) walk(child);
  }
  walk(parseCatalogTree(text));
  return { functionOids: [...functions].sort((a, b) => a - b), tableOperations, unresolved };
}

export function policyFunctionOids(inventory) {
  const result = new Set();
  for (const p of inventory.policies) {
    for (const oid of p.catalogFunctionOids) result.add(oid);
    for (const tree of [p.usingTree, p.withCheckTree]) for (const oid of inspectCatalogTree(tree, inventory.operatorFunctions).functionOids) result.add(oid);
  }
  return [...result].sort((a, b) => a - b);
}

export function inheritancePaths(inventory, role, target) {
  if (target === "PUBLIC") return [[role, "PUBLIC"]];
  if (role === target) return [[role]];
  const paths = [];
  let steps = 0;
  function visit(path) {
    if (++steps > 10000 || path.length > 100) failHarness("MEMBERSHIP_PATH_BOUND_EXCEEDED");
    for (const edge of inventory.roleMemberships.filter((m) => m.member === path.at(-1) && m.inherit_option)) {
      if (path.includes(edge.role)) continue;
      const next = [...path, edge.role];
      if (edge.role === target) paths.push(next); else visit(next);
    }
  }
  visit([role]); return paths;
}

export function buildBrowserReport(inventory, functions) {
  const checks = {}, unknownChecks = [], failedChecks = [];
  const check = (name, exact) => { checks[name] = Boolean(exact); if (!exact) unknownChecks.push(name); };
  check("pg17Exact", Number(inventory.serverVersion) >= 170000 && Number(inventory.serverVersion) < 180000);
  checks.transactionReadOnly = inventory.transactionReadOnly === "on";
  if (!checks.transactionReadOnly) failedChecks.push("transactionReadOnly");
  const unique = (rows, key) => new Set(rows.map(key)).size === rows.length;
  check("tableSecurityComplete", inventory.tables.length === 57 && unique(inventory.tables, (t) => t.table)
    && TABLES.every((table) => inventory.tables.some((t) => t.schema === "public" && t.table === table
      && typeof t.owner === "string" && typeof t.rls === "boolean" && typeof t.force === "boolean")));
  check("rolesComplete", ["anon", "authenticated", "service_role", "postgres", "reflab_rls_owner"]
    .every((name) => inventory.roleAttributes.some((r) => r.name === name)) && inventory.roleCount === inventory.roleAttributes.length
    && inventory.membershipCount === inventory.roleMemberships.length && unique(inventory.roleAttributes, (r) => r.name));
  check("tableCapabilitiesComplete", inventory.effectiveTables.length === 57 * 3 * 8
    && TABLES.every((table) => ["anon", "authenticated", "PUBLIC"].every((role) => PRIVILEGES.every((privilege) =>
      inventory.effectiveTables.filter((e) => e.table === table && e.role === role && e.privilege === privilege && typeof e.effective === "boolean").length === 1))));
  check("policiesComplete", inventory.tables.every((t) => inventory.policies.filter((p) => p.table === t.table).length === t.policyCount)
    && inventory.policies.every((p) => p.schema === "public" && TABLES.includes(p.table)) && unique(inventory.policies, (p) => p.oid));
  check("columnsComplete", inventory.tables.every((t) => inventory.columns.filter((c) => c.table === t.table).length === t.columnCount)
    && inventory.columns.every((c) => c.schema === "public" && TABLES.includes(c.table) && typeof c.column === "string")
    && unique(inventory.columns, (c) => `${c.table}.${c.column}`));
  check("rawTableAclsComplete", inventory.tables.every((t) => inventory.tableAcls.filter((a) => a.table === t.table).length === t.rawAclEntryCount)
    && inventory.tableAcls.every((a) => TABLES.includes(a.table) && a.schema === "public" && PRIVILEGES.includes(a.privilege)
      && typeof a.grantee === "string" && typeof a.grantor === "string" && typeof a.grantable === "boolean")
    && unique(inventory.tableAcls, (a) => `${a.table}:${a.grantee}:${a.grantor}:${a.privilege}`));
  check("rawColumnAclsComplete", inventory.columns.every((c) => inventory.columnAcls.filter((a) => a.table === c.table && a.column === c.column).length === c.rawAclEntryCount)
    && inventory.columnAcls.every((a) => inventory.columns.some((c) => c.table === a.table && c.column === a.column)
      && COLUMN_PRIVILEGES.includes(a.privilege) && typeof a.grantee === "string" && typeof a.grantor === "string" && typeof a.grantable === "boolean")
    && unique(inventory.columnAcls, (a) => `${a.table}:${a.column}:${a.grantee}:${a.grantor}:${a.privilege}`));
  check("effectiveColumnsComplete", inventory.effectiveColumns.length === inventory.columns.length * 8
    && inventory.columns.every((c) => ["anon", "authenticated"].every((role) => COLUMN_PRIVILEGES.every((privilege) =>
      inventory.effectiveColumns.filter((e) => e.table === c.table && e.column === c.column && e.role === role
        && e.privilege === privilege && typeof e.effective === "boolean" && typeof e.tableLevelEffective === "boolean").length === 1))));
  const requested = policyFunctionOids(inventory);
  for (const f of functions) {
    requested.push(...f.catalogDependencies.filter((d) => d.catalog === "pg_proc").map((d) => d.oid), ...inspectCatalogTree(f.sqlBodyTree, inventory.operatorFunctions).functionOids);
  }
  check("functionsComplete", requested.every((oid) => functions.some((f) => f.oid === oid)) && unique(functions, (f) => f.oid));
  const dependencies = functions.map((f) => {
    const tree = inspectCatalogTree(f.sqlBodyTree, inventory.operatorFunctions);
    // String-body SQL / PLpgSQL are not dependency-tracked. Never infer table operations from their text.
    const status = f.sqlBodyTree ? (tree.unresolved.length ? "UNKNOWN" : "CATALOG_TRACKED_SQL_BODY") : "UNKNOWN_UNTRACKED_OR_EXTERNAL_BODY";
    return { functionOid: f.oid, signature: `${f.schema}.${f.name}(${f.identityArguments})`, status,
      underlyingAccessRole: f.securityDefiner ? f.owner : "CALLER", securityMode: f.securityDefiner ? "SECURITY DEFINER" : "SECURITY INVOKER",
      catalogDependencies: f.catalogDependencies,
      nestedFunctionOids: [...new Set([...tree.functionOids, ...f.catalogDependencies.filter((d) => d.catalog === "pg_proc").map((d) => d.oid)])].sort((a, b) => a - b),
      tableOperations: tree.tableOperations.map((t) => ({ ...t, relation: f.relationIdentities?.find((r) => r.oid === t.relationOid) ?? null,
        checkAsUser: t.checkAsUserOid ? inventory.roleAttributes.find((r) => r.oid === t.checkAsUserOid)?.name ?? "UNKNOWN" : "EXECUTION_ROLE" })),
      unresolved: tree.unresolved, sourceHash: f.sourceHash };
  });
  // Unknown body dependencies are explicit evidence, not invented catalog incompleteness.
  const policyRoleApplicability = inventory.policies.flatMap((p) => ["anon", "authenticated", "PUBLIC"].map((role) => ({
    policyOid: p.oid, table: p.table, role, applies: p.roles.some((target) => target === "PUBLIC" || (role !== "PUBLIC"
      && inventory.roleAttributes.some((r) => r.name === target && r[`${role}Inherits`]))),
    paths: p.roles.flatMap((target) => role === "PUBLIC" ? (target === "PUBLIC" ? [["PUBLIC"]] : []) : inheritancePaths(inventory, role, target))
  })));
  check("policyApplicabilityProven", policyRoleApplicability.every((p) => p.applies === (p.paths.length > 0)));
  check("policyExpressionsCaptured", inventory.policies.every((p) => typeof p.name === "string" && Array.isArray(p.roles)
    && ["PERMISSIVE", "RESTRICTIVE"].includes(p.mode) && ["*", "r", "a", "w", "d"].includes(p.command)
    && [p.usingExpression, p.withCheckExpression].every((v) => v === null || typeof v === "string")));
  check("policyRolesResolved", inventory.policies.every((p) => p.roles.every((role) => role === "PUBLIC" || inventory.roleAttributes.some((r) => r.name === role))));
  const policyEvidence = inventory.policies.map((p) => ({ ...p,
    resolvedFunctionOids: policyFunctionOids({ policies: [p], operatorFunctions: inventory.operatorFunctions }),
    referenceResolutionBasis: "PG_DEPEND_AND_PG17_CATALOG_NODE_OIDS" }));
  check("policyReferencesResolved", inventory.policies.every((p) => [p.usingTree, p.withCheckTree].every((t) => !inspectCatalogTree(t, inventory.operatorFunctions).unresolved.length)));
  check("functionIdentityComplete", functions.every((f) => typeof f.securityDefiner === "boolean" && f.owner && f.language
    && f.identityArguments !== undefined && f.returnType && f.sourceHash && Array.isArray(f.executeAcls)
    && typeof f.strict === "boolean" && typeof f.leakproof === "boolean" && ["i", "s", "v"].includes(f.volatility)
    && ["anon", "authenticated", "PUBLIC", "service_role", f.owner].every((role) =>
      f.effectiveExecute.some((e) => e.role === role && typeof e.effective === "boolean"))));
  check("functionExecuteAclsComplete", functions.every((f) => f.executeAcls.length === f.executeAclEntryCount
    && f.executeAcls.every((a) => a.privilege === "EXECUTE" && typeof a.grantee === "string" && typeof a.grantor === "string"
      && typeof a.grantable === "boolean") && unique(f.executeAcls, (a) => `${a.grantee}:${a.grantor}:${a.privilege}`)));
  check("functionRelationsResolved", dependencies.every((d) => d.tableOperations.every((t) => t.relation !== null && t.checkAsUser !== "UNKNOWN")));
  const executionPaths = [];
  function visitFunction(oid, caller, path, seen = new Set()) {
    const f = functions.find((f) => f.oid === oid), d = dependencies.find((d) => d.functionOid === oid);
    if (!f || !d || seen.has(`${oid}:${caller}`)) return;
    if (path.length > 100) failHarness("EXECUTION_PATH_BOUND_EXCEEDED");
    if (executionPaths.length >= 10000) failHarness("EXECUTION_PATH_BOUND_EXCEEDED");
    const executionRole = f.securityDefiner ? f.owner : caller;
    executionPaths.push({ functionOid: oid, callerRole: caller, executionRole, path: [...path, oid],
      tableOperations: d.tableOperations.map((t) => ({ ...t, permissionCheckRole: t.checkAsUser === "EXECUTION_ROLE" ? executionRole : t.checkAsUser })), status: d.status });
    const nextSeen = new Set([...seen, `${oid}:${caller}`]);
    for (const child of d.nestedFunctionOids) visitFunction(child, executionRole, [...path, oid], nextSeen);
  }
  for (const p of inventory.policies) for (const role of ["anon", "authenticated"])
    if (policyRoleApplicability.some((a) => a.policyOid === p.oid && a.role === role && a.applies))
      for (const oid of policyFunctionOids({ policies: [p], operatorFunctions: inventory.operatorFunctions })) visitFunction(oid, role, []);
  const context = (table, privilege, command) => ({
    table, tableCapabilities: inventory.effectiveTables.filter((e) => e.table === table && e.privilege === privilege),
    policies: policyEvidence.filter((p) => p.table === table && [command, "*"].includes(p.command)),
    columnRawAcls: inventory.columnAcls.filter((a) => a.table === table && a.privilege === privilege),
    effectiveBrowserColumns: inventory.effectiveColumns.filter((e) => e.table === table && e.privilege === privilege),
    policyFunctionOids: policyFunctionOids({ policies: inventory.policies.filter((p) => p.table === table && [command, "*"].includes(p.command)),
      operatorFunctions: inventory.operatorFunctions })
  });
  const observed = Object.fromEntries(["anon", "authenticated"].map((role) => [role,
    inventory.effectiveTables.filter((e) => e.role === role && e.effective).length]));
  const archivedCellDrift = additionalBrowserMatrix().flatMap((archived) => {
    const live = inventory.effectiveTables.find((e) => e.table === archived.table && e.role === archived.role && e.privilege === archived.privilege);
    return live && live.effective === archived.granted ? [] : [{ table: archived.table, role: archived.role, privilege: archived.privilege,
      archived: archived.granted, observed: live?.effective ?? "UNKNOWN" }];
  });
  return { format: FORMAT, classification: failedChecks.length ? "BLOCKER" : unknownChecks.length ? "UNKNOWN" : COMPLETE,
    observationComplete: !failedChecks.length && !unknownChecks.length, checks, failedChecks, unknownChecks,
    transactionReadOnly: checks.transactionReadOnly, roleAttributes: inventory.roleAttributes, roleMemberships: inventory.roleMemberships,
    membershipDirection: "member -> role; inherit_option controls implicit access; SET ROLE is not implicit applicability",
    additionalRuntimeTables: inventory.tables.map((t) => ({ ...t, policies: policyEvidence.filter((p) => p.table === t.table),
      columns: inventory.columns.filter((c) => c.table === t.table) })),
    additionalBrowserTableRawAcls: inventory.tableAcls,
    additionalBrowserEffectiveTablePrivileges: inventory.effectiveTables,
    additionalRuntimePolicies: policyEvidence, additionalRuntimePolicyRoleApplicability: policyRoleApplicability,
    additionalRuntimePolicyFunctions: functions.map((f) => ({ ...f, securityMode: f.securityDefiner ? "SECURITY DEFINER" : "SECURITY INVOKER",
      searchPathConfiguration: f.configuration?.filter((c) => c.startsWith("search_path=")) ?? [],
      searchPathStatus: f.configuration?.some((c) => c.startsWith("search_path=")) ? "FUNCTION_CONFIGURED" : "CALLER_SESSION_SETTING" })),
    additionalRuntimePolicyFunctionExecuteAcls: functions.flatMap((f) => f.executeAcls.map((a) =>
      ({ ...a, signature: `${f.schema}.${f.name}(${f.identityArguments})` }))),
    additionalRuntimePolicyFunctionDependencies: dependencies,
    policyFunctionExecutionPaths: executionPaths,
    dependencyUnknowns: dependencies.filter((d) => d.status.startsWith("UNKNOWN")),
    additionalRuntimeColumnRawAcls: inventory.columnAcls,
    additionalRuntimeEffectiveAnonColumnPrivileges: inventory.effectiveColumns.filter((e) => e.role === "anon"),
    additionalRuntimeEffectiveAuthenticatedColumnPrivileges: inventory.effectiveColumns.filter((e) => e.role === "authenticated"),
    institutionalLeadsEvidence: context("institutional_leads", "INSERT", "a"), clipsEvidence: context("clips", "SELECT", "r"),
    archivedTableAclCrossCheck: { expected: { anon: 352, authenticated: 408 }, observed,
      cellDrift: archivedCellDrift, drift: archivedCellDrift.length > 0 || observed.anon !== 352 || observed.authenticated !== 408,
      semantics: "ARCHIVED_OBSERVATION_CROSSCHECK_NOT_TARGET_OR_AUTHORIZATION" },
    approval: "NOT_PERFORMED", mutationCount: 0, ddlCount: 0, dmlCount: 0, migrationInvocationCount: 0,
    remoteDdlAuthorized: false, automaticRetryAuthorized: false, scopeBoundary: BOUNDARY };
}

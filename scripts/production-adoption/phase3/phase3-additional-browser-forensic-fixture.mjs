import { TABLES, PRIVILEGES, COLUMN_PRIVILEGES } from "./phase3-additional-browser-forensic-contract.mjs";
import { additionalBrowserMatrix, additionalAccounting } from "./phase3-additional-runtime-service-role-matrix.mjs";

export const BOOLEAN_CONST_TREE = "{CONST :consttype 16 :constisnull false :constvalue 1 [ 1 ]}";
export const BOOLEAN_VAR_TREE = "{VAR :varno 1 :varattno 1 :vartype 16 :varlevelsup 0}";
export const functionPredicateTree = (oid) => `{FUNCEXPR :funcid ${oid} :funcresulttype 16 :args <>}`;
export const operatorPredicateTree = (identity = ":opno 90 :opfuncid 0") =>
  `{OPEXPR ${identity} :opresulttype 16 :args (${BOOLEAN_CONST_TREE} ${BOOLEAN_CONST_TREE})}`;
export const scalarArrayPredicateTree = (identity = ":opno 90 :opfuncid 0") =>
  `{SCALARARRAYOPEXPR ${identity} :useOr true :args (${BOOLEAN_CONST_TREE} {ARRAYEXPR :array_typeid 1000 :element_typeid 16 :multidims false :elements (${BOOLEAN_CONST_TREE})})}`;

export function browserFixtureEvidence() {
  const columns = TABLES.map((table) => ({ schema: "public", table, column: "id", attnum: 1, rawAcl: null, rawAclEntryCount: 0 }));
  const effectiveTables = [...additionalBrowserMatrix().map((e) => ({ schema: e.schema, table: e.table, role: e.role, privilege: e.privilege, effective: e.granted })),
    ...TABLES.flatMap((table) => PRIVILEGES.map((privilege) => ({ schema: "public", table, role: "PUBLIC", privilege, effective: false })))];
  const tables = TABLES.map((table, i) => ({ schema: "public", table, oid: 1000 + i, owner: "postgres", rls: true,
    force: false, rawAcl: null, policyCount: 0, columnCount: 1, columnAcls: [],
    rawAclEntryCount: effectiveTables.filter((e) => e.table === table && e.effective).length }));
  const policies = [
    { table: "clips", name: "authenticated_read", roles: ["authenticated"], command: "r", usingExpression: "true", withCheckExpression: null },
    { table: "institutions", name: "anon_read", roles: ["anon"], command: "r", usingExpression: "true", withCheckExpression: null },
    { table: "appointments", name: "public_read", roles: ["PUBLIC"], command: "r", usingExpression: "true", withCheckExpression: null },
    { table: "institutional_leads", name: "anon_insert", roles: ["anon"], command: "a", usingExpression: null, withCheckExpression: "true" },
  ].map((p, i) => ({ ...p, schema: "public", oid: 2000 + i, mode: "PERMISSIVE",
    usingTree: p.usingExpression === null ? null : BOOLEAN_CONST_TREE,
    withCheckTree: p.withCheckExpression === null ? null : BOOLEAN_CONST_TREE, catalogFunctionOids: [] }));
  for (const p of policies) tables.find((t) => t.table === p.table).policyCount++;
  return { transactionReadOnly: "on", serverVersion: "170009", tables, policies, columns, roleCount: 5, membershipCount: 0, operatorFunctions: [],
    roleAttributes: ["anon", "authenticated", "service_role", "postgres", "reflab_rls_owner"].map((name) => ({ name,
      anonInherits: name === "anon", authenticatedInherits: name === "authenticated", service_roleInherits: name === "service_role",
      rolsuper: false, rolinherit: true, rolbypassrls: name === "service_role" })), roleMemberships: [],
    tableAcls: effectiveTables.filter((e) => e.effective).map((e) => ({ schema: "public", table: e.table, grantee: e.role,
      grantor: "postgres", privilege: e.privilege, grantable: false })), effectiveTables, columnAcls: [],
    effectiveColumns: columns.flatMap((c) => ["anon", "authenticated"].flatMap((role) => COLUMN_PRIVILEGES.map((privilege) => {
      const effective = effectiveTables.find((e) => e.table === c.table && e.role === role && e.privilege === privilege).effective;
      return { schema: "public", table: c.table, column: c.column, role, privilege, effective, tableLevelEffective: effective };
    }))) };
}

export function buildBrowserFixtureSetup() {
  return `-- SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH
    ${additionalAccounting().statements.join("\n")}
    create function public.browser_leaf() returns boolean language sql set search_path=pg_catalog
      return exists(select 1 from public.capabilities);
    create function public.browser_definer() returns boolean language sql security definer set search_path=pg_catalog
      return public.browser_leaf();
    create function public.browser_invoker() returns boolean language sql security invoker set search_path=pg_catalog
      return public.browser_leaf();
    create function public.browser_dynamic() returns boolean language plpgsql security invoker set search_path=pg_catalog
      as $$begin execute 'select true'; return true; end$$;
    create policy browser_auth_select on public.clips for select to authenticated using(public.browser_definer());
    create policy browser_anon_select on public.institutions for select to anon using(public.browser_invoker());
    create policy browser_public_select on public.appointments for select to public using(true);
    create policy browser_anon_insert on public.institutional_leads for insert to anon with check(id is not null);
    grant select(id) on public.clips to anon;
    grant insert(id) on public.institutional_leads to anon;
    revoke execute on function public.browser_definer() from public;
    grant execute on function public.browser_definer() to authenticated;
    create role browser_policy_group;
    grant browser_policy_group to authenticated with inherit true;
    create policy browser_membership on public.teams for select to browser_policy_group using(true);
    create policy browser_operator on public.venues for select to authenticated using(id=id);
    create policy browser_scalar_array on public.fixtures for all to authenticated
      using(id = any(array[id])) with check(id = any(array[id]));
    create policy browser_hash_probe on public.coach_evidence for select to authenticated using(pg_catalog.int4eq(1,1));
    create schema auth;
    create function auth.uid() returns uuid language sql set search_path=pg_catalog
      return '00000000-0000-0000-0000-000000000001'::uuid;
    create function auth.jwt() returns jsonb language sql set search_path=pg_catalog return '{"sub":"fixture_only"}'::jsonb;
    create policy browser_real_coalesce on public.readiness_scores for all to authenticated
      using(id::text=coalesce(auth.jwt()->>'sub',auth.uid()::text)) with check(id::text=coalesce(auth.jwt()->>'sub',auth.uid()::text));
    create policy browser_real_sublink on public.institution_contents for all to authenticated
      using(exists(select 1 from public.institutions institution_row where institution_row.id=institution_contents.id
        and public.browser_invoker() and exists(select 1 from public.institution_memberships member_row where member_row.id=institution_row.id)))
      with check(exists(select 1 from public.institutions institution_row where institution_row.id=institution_contents.id));
    create policy browser_owner_cast on public.clips for select to reflab_rls_owner using(id::text=auth.uid()::text);
  `;
}

export const fixturePreservationSql = `select md5(jsonb_build_object(
  'tables',(select jsonb_agg(to_jsonb(x) order by x.oid) from (select oid,relowner,relacl,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace) x),
  'columns',(select jsonb_agg(to_jsonb(x) order by x.attrelid,x.attnum) from (select a.attrelid,a.attnum,a.attname,a.attacl from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped) x),
  'policies',(select jsonb_agg(to_jsonb(x) order by x.oid) from pg_policy x),
  'functions',(select jsonb_agg(to_jsonb(x) order by x.oid) from (select oid,proowner,proacl,prosecdef,proconfig,prosrc,prosqlbody::text from pg_proc where pronamespace='public'::regnamespace) x),
  'roles',(select jsonb_agg(to_jsonb(x) order by x.oid) from pg_roles x),
  'memberships',(select jsonb_agg(to_jsonb(x) order by x.oid) from pg_auth_members x)
)::text);`;

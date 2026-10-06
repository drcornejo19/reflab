import assert from "node:assert/strict";
import { IDENTITY_PRE_MEMBERSHIPS } from "./phase3-identity-pre-input.mjs";
import { classifyIdentitySecurityBridgePreState, identitySecurityBridgePreQuery } from "./phase3-identity-security-bridge-pre-attestation-contract.mjs";

// Intermediate 64236 state: request_user_id and the wrappers still belong to postgres.
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

// Called only by the disposable, loopback-only Phase3 harness. Never a Production entry point.
export function rehearseIdentityBridge({ sql, execute, migration, historicalFingerprintSql, preOnly = false }) {
  const scalar = (statement, user = "postgres") => String(sql(statement, user)).trim();
  const postgresVersion = scalar("show server_version;");
  const roles = [...new Set(IDENTITY_PRE_MEMBERSHIPS.map((r) => r.grantedRole))];
  sql("create role authenticator nologin noinherit; "
    + "create role supabase_privileged_role nologin noinherit; "
    + "create role supabase_storage_admin nologin noinherit; create role supabase_etl_admin nologin noinherit;");
  sql("alter role postgres nosuperuser createrole createdb replication bypassrls inherit;", "supabase_admin");
  const grant = (r) => `grant ${r.grantedRole} to ${r.memberRole} with admin ${r.adminOption}, inherit ${r.inheritOption}, set ${r.setOption};`;
  function restoreMemberships() {
    sql(roles.map((role) => `revoke ${role} from postgres, authenticator cascade;`).join("\n"), "supabase_admin");
    sql(IDENTITY_PRE_MEMBERSHIPS.filter((r) => r.grantorRole === "supabase_admin").map(grant).join("\n"), "supabase_admin");
    sql(IDENTITY_PRE_MEMBERSHIPS.filter((r) => r.grantorRole === "postgres").map(grant).join("\n"));
  }
  restoreMemberships();
  sql("grant authenticator to supabase_storage_admin with admin false, inherit false, set true; "
    + "grant supabase_privileged_role to supabase_etl_admin with admin false, inherit true, set true;", "supabase_admin");
  let lastEvidence;
  const observe = () => {
    const payload = JSON.parse(scalar(`begin read only; set local lock_timeout='2s';
      set local statement_timeout='15s'; select ${identitySecurityBridgePreQuery.payloadSql}; rollback;`));
    lastEvidence = payload;
    return classifyIdentitySecurityBridgePreState(payload);
  };
  const pre = observe();
  assert.equal(pre.classification, "EXACT_EXPECTED_PRE_STATE", JSON.stringify({ checks: pre.checks,
    memberships: lastEvidence.roleMemberships,
    effectiveDrift: lastEvidence.effectiveRelationships.filter((r) => r.subject_role !== "postgres"
      && (r.member || r.usage || r.set)) }));
  if (preOnly) return { classification: pre.classification, checks: pre.checks,
    phase3MigrationsApplied: 0, postgresMajor: 17, postgresVersion, localOnly: true };
  const negatives = [];
  let migrationInvocations = 0;
  const invoke = (statement) => { migrationInvocations++; return execute(statement); };
  const roleDrifts = [
    ["missing", "revoke anon from authenticator;"],
    ["grantor", "revoke anon from authenticator;", "grant anon to authenticator with admin false, inherit false, set true;"],
    ["ADMIN", "grant reflab_preflight_audit_owner to postgres with admin false, inherit false, set false;"],
    ["INHERIT", "grant reflab_rls_owner to postgres with admin false, inherit true, set true;", null, "postgres"],
    ["SET", "grant reflab_rls_owner to postgres with admin false, inherit false, set false;", null, "postgres"],
    ["reversed", "revoke anon from postgres cascade; revoke anon from authenticator cascade; grant postgres to anon with admin false, inherit false, set true;"],
    ["browser_owner", "grant reflab_rls_owner to authenticated with admin false, inherit false, set true;"],
    ["authenticator_owner", "grant reflab_rls_owner to authenticator with admin false, inherit false, set true;"],
    ["service_owner", "grant reflab_rls_owner to service_role with admin false, inherit false, set true;"],
    ["additional_owner", "grant reflab_rls_owner to supabase_storage_admin with admin false, inherit false, set false;"],
  ];
  for (const [name, change, second, user = "supabase_admin"] of roleDrifts) {
    sql(change, user);
    if (second) sql(second);
    const evidence = observe();
    assert.equal(evidence.classification, "BLOCKER", name);
    assert.equal(evidence.checks.roleMembershipsExact, false, name);
    assert.equal(migrationInvocations, 0);
    negatives.push({ name, migrationInvocations: 0, result: "BLOCKER" });
    // Remove only the test-created extra edge, then reconstruct the independently reviewed base.
    sql("revoke postgres from anon; revoke reflab_rls_owner from authenticated, authenticator, service_role, supabase_storage_admin cascade;", "supabase_admin");
    restoreMemberships();
    assert.equal(observe().classification, "EXACT_EXPECTED_PRE_STATE", "restore " + name);
  }
  for (const [name, change, restore, check] of [
    ["source", "create or replace function public.platform_request_user_id() returns text language sql stable as $$ select null::text $$;", "create or replace function public.platform_request_user_id() returns text language sql stable as $$ select nullif(auth.jwt() ->> 'sub', ''); $$;", "legacyHelpersExact"],
    ["configuration", "alter function public.platform_request_user_id() set search_path=pg_catalog;", "alter function public.platform_request_user_id() reset all;", "legacyHelpersExact"],
    ["security", "alter function public.platform_request_user_id() security definer;", "alter function public.platform_request_user_id() security invoker;", "legacyHelpersExact"],
    ["owner", "grant create on schema public to reflab_rls_owner; alter function public.platform_request_user_id() owner to reflab_rls_owner;", "alter function public.platform_request_user_id() owner to postgres; revoke create on schema public from reflab_rls_owner;", "legacyHelpersExact"],
    ["platform_PUBLIC", "grant execute on function public.platform_request_user_id() to public;", "revoke execute on function public.platform_request_user_id() from public;", "legacyHelperAclsExact"],
    ["platform_anon", "grant execute on function public.platform_request_user_id() to anon;", "revoke execute on function public.platform_request_user_id() from anon;", "legacyHelperAclsExact"],
    ["service_missing", "revoke execute on function public.platform_request_user_id() from service_role;", "grant execute on function public.platform_request_user_id() to service_role;", "legacyHelperAclsExact"],
    ["service_grantable", "grant execute on function public.platform_request_user_id() to service_role with grant option;", "revoke grant option for execute on function public.platform_request_user_id() from service_role;", "legacyHelperAclsExact"],
    ["service_grantor", "grant execute on function public.platform_request_user_id() to reflab_rls_owner with grant option; set role reflab_rls_owner; grant execute on function public.platform_request_user_id() to service_role; reset role;", "revoke execute on function public.platform_request_user_id() from reflab_rls_owner cascade;", "legacyHelperAclsExact"],
  ]) {
    sql(change);
    const evidence = observe();
    assert.equal(evidence.classification, "BLOCKER", name);
    assert.equal(evidence.checks[check], false, name);
    assert.equal(migrationInvocations, 0);
    negatives.push({ name, migrationInvocations: 0, result: "BLOCKER" });
    sql(restore, "supabase_admin");
    assert.equal(observe().classification, "EXACT_EXPECTED_PRE_STATE", "restore " + name);
  }
  const snapshot = () => scalar(`select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'functions', (select jsonb_agg(jsonb_build_array(oid,proowner,prosrc,proacl,proconfig,prosecdef)) from pg_catalog.pg_proc where pronamespace in (select oid from pg_catalog.pg_namespace where nspname in ('public','reflab_private'))),
    'schemas', (select jsonb_agg(jsonb_build_array(oid,nspowner,nspacl)) from pg_catalog.pg_namespace where nspname in ('public','reflab_private','reflab_meta')),
    'tables', (select jsonb_agg(jsonb_build_array(oid,relowner,relacl,relrowsecurity,relforcerowsecurity)) from pg_catalog.pg_class where relnamespace in (select oid from pg_catalog.pg_namespace where nspname in ('public','reflab_private','reflab_meta'))),
    'policies', (select jsonb_agg(to_jsonb(p)) from pg_catalog.pg_policy p),
    'attempts', (select jsonb_agg(to_jsonb(a) order by id) from public.attempts a),
    'exams', (select jsonb_agg(to_jsonb(e) order by id) from public.exam_results e),
    'notifications', (select jsonb_agg(to_jsonb(n) order by id) from public.notification_events n),
    'clips', (select jsonb_agg(to_jsonb(c) order by id) from public.clips c),
    'ledger', (select jsonb_agg(to_jsonb(l)) from reflab_meta.production_adoption_state l),
    'schema_state', (select count(*) from reflab_meta.reflab_schema_state)
  )::text);`) + scalar(historicalFingerprintSql);
  const before = snapshot();
  const preservedDataSql = `select pg_catalog.md5(jsonb_build_object(
    'attempts',(select jsonb_agg(to_jsonb(r) order by id) from public.attempts r),
    'exams',(select jsonb_agg(to_jsonb(r) order by id) from public.exam_results r),
    'notifications',(select jsonb_agg(to_jsonb(r) order by id) from public.notification_events r),
    'clips',(select jsonb_agg(to_jsonb(r) order by id) from public.clips r),
    'ledger',(select jsonb_agg(to_jsonb(r) order by phase_order) from reflab_meta.production_adoption_state r),
    'schema_state',(select jsonb_agg(to_jsonb(r)) from reflab_meta.reflab_schema_state r)
  )::text);`;
  const preservedDataBefore = scalar(preservedDataSql);
  const forced = "do $forced$ begin raise exception 'FORCED_LOCAL_ROLLBACK' using errcode='55000'; end $forced$;\n";
  const rollbacks = [];
  for (const [stage, boundary] of [
    ["before_acl_hardening", "revoke all on function reflab_private.request_user_id()"],
    ["after_acl_before_owner", "alter function reflab_private.is_super_admin() owner"],
    ["after_owner_transfer", "create or replace function public.institution_request_user_id()"],
    ["before_final_assertion", "do $assertions$"],
  ]) {
    const index = migration.indexOf(boundary);
    assert.ok(index > 0);
    const result = invoke(migration.slice(0, index) + forced + migration.slice(index));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FORCED_LOCAL_ROLLBACK/);
    assert.equal(snapshot(), before);
    assert.equal(observe().classification, "EXACT_EXPECTED_PRE_STATE");
    rollbacks.push({ stage, result: "PASS" });
  }
  // Reproduce the prior defect locally so the positive result cannot mask it.
  const ownership = "alter function reflab_private.is_super_admin() owner to reflab_rls_owner;\nrevoke create on schema reflab_private from reflab_rls_owner;";
  const oldOrder = migration.replace(ownership, "").replace(
    "revoke all on function reflab_private.request_user_id()", ownership + "\nrevoke all on function reflab_private.request_user_id()");
  const oldResult = invoke(oldOrder);
  assert.notEqual(oldResult.status, 0);
  assert.match(oldResult.stderr, /Canonical identity boundary contract is incomplete/);
  assert.equal(snapshot(), before);
  assert.equal(observe().classification, "EXACT_EXPECTED_PRE_STATE");
  const lifecycleNegatives = [{ name: "ownership_too_early", result: "BLOCKER", rollback: "PASS" }];
  for (const [name, altered] of [
    ["acl_hardening_omitted", migration.replace("revoke all on function reflab_private.is_super_admin() from public, anon, authenticated, service_role;", "")],
    ["final_assertion_mismatch", migration.replace("do $assertions$", "grant execute on function public.platform_request_user_id() to anon;\ndo $assertions$")],
  ]) {
    const failure = invoke(altered);
    assert.notEqual(failure.status, 0, name);
    assert.match(failure.stderr, /55000:/);
    assert.equal(snapshot(), before);
    assert.equal(observe().classification, "EXACT_EXPECTED_PRE_STATE");
    lifecycleNegatives.push({ name, result: "BLOCKER", rollback: "PASS" });
  }
  const result = invoke(migration);
  const warnings = (String(result.stderr).match(/WARNING:/g) ?? []).length;
  const sqlstate = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1] ?? null;
  if (result.status !== 0) {
    assert.equal(snapshot(), before);
    return { postgresVersion, pre: "EXACT", migration: "BLOCKER", post: "NOT_REACHED", sqlstate,
      privilegeWarnings: warnings, aclWarning: /no privileges were (revoked|granted)|permission denied/i.test(result.stderr),
      postGuardRejectedBrowserExecute: /Canonical identity boundary contract is incomplete/i.test(result.stderr),
      rollback: "EXACT_PRE_RESTORED", negatives, rollbacks };
  }
  const postEvidence = JSON.parse(scalar(`begin read only; ${identityBridgePostEvidenceSql} rollback;`));
  assert.equal(identityBridgePostExact(postEvidence), true, JSON.stringify(postEvidence));
  assert.equal(scalar(preservedDataSql), preservedDataBefore, "historical rows and adoption data preserved");
  assert.equal(warnings, 0, "privilege warnings must fail the positive rehearsal");
  const postNegatives = [];
  for (const [name, change] of [
    ["wrong_owner", "alter function reflab_private.is_super_admin() owner to postgres;"],
    ["PUBLIC_execute", "grant execute on function reflab_private.is_super_admin() to public;"],
    ["anon_execute", "grant execute on function reflab_private.is_super_admin() to anon;"],
    ["service_missing", "revoke execute on function public.platform_request_user_id() from service_role;"],
    ["wrong_grantor", "grant execute on function public.platform_request_user_id() to reflab_rls_owner with grant option; set role reflab_rls_owner; grant execute on function public.platform_request_user_id() to service_role; reset role;"],
    ["grant_option", "grant execute on function reflab_private.is_super_admin() to authenticated with grant option;"],
    ["configuration", "alter function reflab_private.is_super_admin() set search_path=public;"],
    ["security_mode", "alter function reflab_private.is_super_admin() security invoker;"],
    ["source", "create or replace function public.platform_request_user_id() returns text language sql stable security invoker set search_path=pg_catalog as $$ select null::text $$;"],
    ["residual_CREATE", "grant create on schema reflab_private to reflab_rls_owner;"],
  ]) {
    const drift = JSON.parse(scalar(`begin; ${change} ${identityBridgePostEvidenceSql} rollback;`, "supabase_admin"));
    assert.equal(identityBridgePostExact(drift), false, name);
    assert.equal(identityBridgePostExact(JSON.parse(scalar(identityBridgePostEvidenceSql))), true, "restore " + name);
    postNegatives.push({ name, result: "BLOCKER", rollback: "PASS" });
  }
  return { postgresVersion, pre: "EXACT", migration: "PASS", post: "EXACT", sqlstate,
    privilegeWarnings: warnings, oldOrderingRejected: true, historicalAndAdoptionDataPreserved: true,
    functionEvidence: postEvidence,
    negatives, postNegatives, lifecycleNegatives, rollbacks };
}

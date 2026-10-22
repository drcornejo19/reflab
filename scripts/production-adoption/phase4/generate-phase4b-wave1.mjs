import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHASE4B_WAVE1_CANONICAL_POLICIES,
  PHASE4B_WAVE1_HELPERS,
  PHASE4B_WAVE1_LEGACY_INSERT_POLICIES,
  PHASE4B_WAVE1_MIGRATION,
  PHASE4B_WAVE1_PLATFORM_WRAPPER,
  PHASE4B_WAVE1_PROVIDER,
  PHASE4B_WAVE1_VERSION,
  buildWave1DependencyGraph,
  topologicallySortWave1Helpers,
} from "./phase4b-wave1-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const baselinePath = resolve(root, "supabase", "migrations", "202607270000_reflab_canonical_baseline.sql");
const outputPath = resolve(root, "supabase", "migrations", PHASE4B_WAVE1_MIGRATION);

function sqlLiteral(value) {
  if (value === null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizePolicyExpression(value) {
  return String(value ?? "").toLowerCase().replace(/[\s()]/g, "");
}

function canonicalPolicyRows() {
  const commandCode = { SELECT: "r", INSERT: "a", UPDATE: "w", DELETE: "d" };
  return PHASE4B_WAVE1_CANONICAL_POLICIES.map((policy) => `(
      ${sqlLiteral(policy.table)}, ${sqlLiteral(policy.name)}, ${sqlLiteral(commandCode[policy.command])},
      ${sqlLiteral(normalizePolicyExpression(policy.using))},
      ${sqlLiteral(normalizePolicyExpression(policy.withCheck))}
    )`).join(",\n    ");
}

function legacyPolicyRows() {
  return PHASE4B_WAVE1_LEGACY_INSERT_POLICIES.map((policy) => `(
      ${sqlLiteral(policy.table)}, ${sqlLiteral(policy.name)}
    )`).join(",\n    ");
}

export function canonicalFunctionStatement(source, helper) {
  const prefix = `create function ${helper.schema}.${helper.name}(`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Canonical helper is absent from the baseline: ${helper.signature}`);
  const end = source.indexOf("$function$;", start);
  if (end < 0) throw new Error(`Canonical helper terminator is missing: ${helper.signature}`);
  const statement = source.slice(start, end + "$function$;".length).trim();
  if (source.indexOf(prefix, start + prefix.length) >= 0) {
    throw new Error(`Canonical helper is declared more than once: ${helper.signature}`);
  }
  return statement;
}

function expectedRows(helpers) {
  return helpers.map((helper) => `(
      ${sqlLiteral(helper.name)},
      ${sqlLiteral(helper.signature)},
      ${sqlLiteral(helper.returns)},
      ${sqlLiteral(helper.language)},
      ${sqlLiteral(helper.volatility)},
      ${helper.strict},
      ${helper.security === "DEFINER"},
      ${sqlLiteral(helper.owner)},
      ${sqlLiteral(helper.sourceHash)}
    )`).join(",\n    ");
}

function installBlocks(source, helpers) {
  return helpers.map((helper, index) => {
    const statement = canonicalFunctionStatement(source, helper);
    const tag = `$wave1_helper_${String(index + 1).padStart(2, "0")}$`;
    return `  if pg_catalog.to_regprocedure(${sqlLiteral(helper.signature)}) is null then
    execute ${tag}${statement}${tag};
  end if;`;
  }).join("\n\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBody(statement, signature) {
  const match = statement.match(/as \$function\$([\s\S]*?)\$function\$;/i);
  if (!match) throw new Error(`Canonical helper body is missing: ${signature}`);
  return match[1];
}

export function validateWave1DependencyDeclarations(source, helpers = PHASE4B_WAVE1_HELPERS) {
  const graph = buildWave1DependencyGraph(helpers);
  for (const helper of helpers) {
    const body = functionBody(canonicalFunctionStatement(source, helper), helper.signature);
    const observed = helpers
      .filter((candidate) => candidate.signature !== helper.signature)
      .filter((candidate) => new RegExp(`\\b${escapeRegExp(`${candidate.schema}.${candidate.name}`)}\\s*\\(`, "i").test(body))
      .map((candidate) => candidate.signature)
      .sort();
    const declared = [...graph.get(helper.signature)].sort();
    if (JSON.stringify(observed) !== JSON.stringify(declared)) {
      throw new Error(`Wave 1 dependency declaration drift for ${helper.signature}`);
    }
  }
}

export function buildPhase4BWave1Migration() {
  const baseline = readFileSync(baselinePath, "utf8").replaceAll("\r\n", "\n");
  validateWave1DependencyDeclarations(baseline);
  const orderedHelpers = topologicallySortWave1Helpers();
  const expected = expectedRows(orderedHelpers);
  const canonicalPolicies = canonicalPolicyRows();
  const legacyPolicies = legacyPolicyRows();
  const provider = sqlLiteral(PHASE4B_WAVE1_PROVIDER);
  const platformWrapper = PHASE4B_WAVE1_PLATFORM_WRAPPER;
  const developmentSignatures = [
    "public.resolve_development_clerk_identity(text)",
    "public.link_development_clerk_identity(text)",
    "public.link_development_super_admin_clerk_identity(text)",
  ].map(sqlLiteral).join(", ");
  const requiredFunctions = [
    "reflab_private.request_user_id()",
    "reflab_private.is_super_admin()",
    "reflab_private.canonical_jsonb_text(jsonb)",
    "public.admin_set_canonical_user_plan(text, text, text, text)",
    "public.admin_set_canonical_global_role(text, text, text, text)",
    "public.submit_canonical_training_attempt(text, uuid, jsonb, integer)",
    "public.submit_canonical_communication_feedback(text, uuid, text, jsonb)",
    "reflab_audit.production_semantic_snapshot()",
  ].map(sqlLiteral).join(", ");

  return `-- Production adoption Phase 4B Wave 1: inert private canonical helpers.
-- Generated from the empty-database baseline; no trigger, policy, or runtime activation.
-- Phase 4A contract: production_structural_evidence_v2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  expected record;
  routine record;
  overload_count integer;
  expected_owner text;
  protected_membership_count integer;
  platform_wrapper record;
  direct_reader_count integer;
  canonical_policy_count integer;
  reviewed_legacy_policy_count integer;
  unexpected_legacy_policy_count integer;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (
       select 1 from reflab_meta.production_adoption_state
       where phase_order = 4 and phase_key = 'canonical_objects'
     )
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Reviewed Phase 1 through Phase 3 adoption state is required for Wave 1'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regnamespace('reflab_audit') is null
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()'))) <> 'reflab_preflight_audit_owner'
     or not (select prosecdef from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()'))
     or (select proconfig from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')) is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'Reviewed Phase 2A semantic audit sidecar is required for Wave 1'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from unnest(array[${requiredFunctions}]::text[]) required(signature)
    where pg_catalog.to_regprocedure(required.signature) is null
  ) then
    raise exception 'Reviewed Phase 2B or Phase 3 function prerequisite is missing'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or exists (
       select 1 from unnest(array[${developmentSignatures}]::text[]) forbidden(signature)
       where pg_catalog.to_regprocedure(forbidden.signature) is not null
     ) then
    raise exception 'Development-only identity infrastructure is forbidden in Wave 1'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*)
  into direct_reader_count
  from pg_catalog.pg_proc candidate
  join pg_catalog.pg_namespace namespace on namespace.oid = candidate.pronamespace
  where namespace.nspname in ('public', 'reflab_private')
    and candidate.prokind = 'f'
    and (
      pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claims') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claim.sub') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.jwt()') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.uid()') > 0
    );

  if direct_reader_count <> 1
     or pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
     or not (
       select
         pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claims') > 0
         or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claim.sub') > 0
         or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.jwt()') > 0
         or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.uid()') > 0
       from pg_catalog.pg_proc candidate
       where candidate.oid = pg_catalog.to_regprocedure('reflab_private.request_user_id()')
     ) then
    raise exception 'Reviewed Phase 3 identity reconciliation is incomplete'
      using errcode = '55000';
  end if;

  select
    pg_catalog.pg_get_function_identity_arguments(wrapper.oid) as identity_arguments,
    pg_catalog.format_type(wrapper.prorettype, null) as return_type,
    language.lanname as language_name,
    case wrapper.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility_name,
    wrapper.proisstrict as strict_mode,
    wrapper.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(wrapper.proowner) as owner_name,
    wrapper.proconfig,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      pg_catalog.regexp_replace(wrapper.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'UTF8'
    ), 'sha256'), 'hex') as source_hash,
    (select pg_catalog.count(*) from pg_catalog.pg_proc overload
     where overload.pronamespace=wrapper.pronamespace and overload.proname=wrapper.proname and overload.prokind='f') as overload_count,
    wrapper.oid
  into platform_wrapper
  from pg_catalog.pg_proc wrapper
  join pg_catalog.pg_language language on language.oid=wrapper.prolang
  where wrapper.oid=pg_catalog.to_regprocedure(${sqlLiteral(platformWrapper.signature)});

  if not found
     or platform_wrapper.identity_arguments <> ''
     or platform_wrapper.return_type <> ${sqlLiteral(platformWrapper.returns)}
     or platform_wrapper.language_name <> ${sqlLiteral(platformWrapper.language)}
     or platform_wrapper.volatility_name <> ${sqlLiteral(platformWrapper.volatility)}
     or platform_wrapper.strict_mode <> ${platformWrapper.strict}
     or platform_wrapper.security_definer
     or platform_wrapper.owner_name <> ${sqlLiteral(platformWrapper.owner)}
     or platform_wrapper.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or platform_wrapper.source_hash <> ${sqlLiteral(platformWrapper.sourceHash)}
     or platform_wrapper.overload_count <> 1
     or exists (
       select 1 from pg_catalog.aclexplode(coalesce(
         (select proacl from pg_catalog.pg_proc where oid=platform_wrapper.oid),
         pg_catalog.acldefault('f',(select proowner from pg_catalog.pg_proc where oid=platform_wrapper.oid))
       )) acl where acl.grantee=0 and acl.privilege_type='EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', platform_wrapper.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', platform_wrapper.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', platform_wrapper.oid, 'EXECUTE') then
    raise exception 'Reviewed Phase 3 platform identity wrapper contract is incomplete'
      using errcode = '55000';
  end if;

  with expected_canonical_policies(table_name, policy_name, command_code, expected_using, expected_check) as (
    values
    ${canonicalPolicies}
  ), observed as (
    select expected_policy.*,
      policy.oid,
      policy.polcmd,
      policy.polpermissive,
      policy.polroles,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),''),'[[:space:]()]','','g')) normalized_using,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),''),'[[:space:]()]','','g')) normalized_check,
      pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'') || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')) raw_expression
    from expected_canonical_policies expected_policy
    left join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass('public.' || expected_policy.table_name)
    left join pg_catalog.pg_policy policy on policy.polrelid=relation.oid and policy.polname=expected_policy.policy_name
  )
  select pg_catalog.count(*) into canonical_policy_count
  from observed
  where oid is not null and polcmd=command_code and polpermissive
    and polroles=array[pg_catalog.to_regrole('authenticated')::oid]
    and normalized_using=expected_using and normalized_check=expected_check
    and pg_catalog.strpos(raw_expression,'platform_request_user_id')=0
    and pg_catalog.strpos(raw_expression,'platform_is_super_admin')=0
    and pg_catalog.strpos(raw_expression,'institution_request_user_id')=0
    and pg_catalog.strpos(raw_expression,'reflab_request_user_id')=0;

  if canonical_policy_count <> ${PHASE4B_WAVE1_CANONICAL_POLICIES.length} then
    raise exception 'Reviewed Phase 3 canonical policy contract is incomplete'
      using errcode = '55000';
  end if;

  with expected_legacy_policies(table_name, policy_name) as (
    values
    ${legacyPolicies}
  ), observed as (
    select expected_policy.*,
      policy.oid,
      policy.polcmd,
      policy.polpermissive,
      policy.polroles,
      pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false) using_expression,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),''),'[[:space:]()]','','g')) normalized_check
    from expected_legacy_policies expected_policy
    left join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass('public.' || expected_policy.table_name)
    left join pg_catalog.pg_policy policy on policy.polrelid=relation.oid and policy.polname=expected_policy.policy_name
  )
  select pg_catalog.count(*) into reviewed_legacy_policy_count
  from observed
  where oid is not null and polcmd='a' and polpermissive
    and polroles=array[pg_catalog.to_regrole('authenticated')::oid]
    and using_expression is null
    and normalized_check = any(array['user_id=platform_request_user_id','user_id=public.platform_request_user_id']::text[]);

  if reviewed_legacy_policy_count <> ${PHASE4B_WAVE1_LEGACY_INSERT_POLICIES.length} then
    raise exception 'Reviewed temporary legacy INSERT policy contract is incomplete'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*) into unexpected_legacy_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid=policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where (
    pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'platform_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'platform_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'platform_is_super_admin') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'platform_is_super_admin') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'institution_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'institution_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'reflab_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'reflab_request_user_id') > 0
  ) and not (
    namespace.nspname='public'
    and (relation.relname,policy.polname) in (
      ${PHASE4B_WAVE1_LEGACY_INSERT_POLICIES.map((policy) => `(${sqlLiteral(policy.table)},${sqlLiteral(policy.name)})`).join(",\n      ")}
    )
  );

  if unexpected_legacy_policy_count <> 0 then
    raise exception 'Unexpected legacy policy identity caller blocks Wave 1'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*)
  into protected_membership_count
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
  where granted_role.rolname in (
      'anon', 'authenticated', 'service_role', 'legacy_runtime', 'reflab_rls_owner',
      'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner'
    )
     or member_role.rolname in (
      'anon', 'authenticated', 'service_role', 'legacy_runtime', 'reflab_rls_owner',
      'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner'
    );

  if protected_membership_count <> 0 then
    raise exception 'Unsafe protected-role membership blocks Wave 1'
      using errcode = '55000';
  end if;

  for expected in
    select * from (values
    ${expected}
    ) contract(function_name, signature, return_type, language_name, volatility_name,
      strict_mode, security_definer, owner_contract, source_hash)
  loop
    select pg_catalog.count(*)
    into overload_count
    from pg_catalog.pg_proc overload
    join pg_catalog.pg_namespace namespace on namespace.oid = overload.pronamespace
    where namespace.nspname = 'reflab_private'
      and overload.proname = expected.function_name
      and overload.prokind = 'f';

    if (pg_catalog.to_regprocedure(expected.signature) is null and overload_count <> 0)
       or (pg_catalog.to_regprocedure(expected.signature) is not null and overload_count <> 1) then
      raise exception 'Unexpected Wave 1 helper overload blocks installation: %', expected.signature
        using errcode = '55000';
    end if;

    if pg_catalog.to_regprocedure(expected.signature) is not null then
      select
        pg_catalog.format_type(candidate.prorettype, null) as return_type,
        language.lanname as language_name,
        case candidate.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility_name,
        candidate.proisstrict as strict_mode,
        candidate.prosecdef as security_definer,
        pg_catalog.pg_get_userbyid(candidate.proowner) as owner_name,
        candidate.proconfig,
        pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(
              pg_catalog.regexp_replace(candidate.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        ) as source_hash,
        pg_catalog.obj_description(candidate.oid, 'pg_proc') as provider_comment,
        candidate.oid
      into routine
      from pg_catalog.pg_proc candidate
      join pg_catalog.pg_language language on language.oid = candidate.prolang
      where candidate.oid = pg_catalog.to_regprocedure(expected.signature);

      expected_owner := case expected.owner_contract
        when 'reflab_rls_owner' then 'reflab_rls_owner'
        else current_user
      end;

      if routine.return_type <> expected.return_type
         or routine.language_name <> expected.language_name
         or routine.volatility_name <> expected.volatility_name
         or routine.strict_mode <> expected.strict_mode
         or routine.security_definer <> expected.security_definer
         or routine.owner_name <> expected_owner
         or routine.proconfig is distinct from array['search_path=pg_catalog']::text[]
         or routine.source_hash <> expected.source_hash then
        raise exception 'Wave 1 helper contract drift blocks installation: %', expected.signature
          using errcode = '55000';
      end if;

      if routine.provider_comment is not null
         and routine.provider_comment <> ${provider} then
        raise exception 'Duplicate Wave 1 provider declaration blocks installation: %', expected.signature
          using errcode = '55000';
      end if;

      if exists (
        select 1 from pg_catalog.aclexplode(
          coalesce((select proacl from pg_catalog.pg_proc where oid = routine.oid),
            pg_catalog.acldefault('f', (select proowner from pg_catalog.pg_proc where oid = routine.oid)))
        ) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ) or exists (
        select 1 from unnest(array['anon', 'authenticated', 'service_role']::text[]) application_role(role_name)
        where pg_catalog.has_function_privilege(application_role.role_name, routine.oid, 'EXECUTE')
      ) then
        raise exception 'Pre-existing Wave 1 helper ACL is unsafe: %', expected.signature
          using errcode = '55000';
      end if;
    end if;
  end loop;
end
$preflight$;

do $install$
begin
${installBlocks(baseline, orderedHelpers)}
end
$install$;

${orderedHelpers.map((helper) => `comment on function ${helper.signature} is ${provider};`).join("\n")}

${orderedHelpers.filter((helper) => helper.owner === "reflab_rls_owner").map((helper) => `alter function ${helper.signature} owner to reflab_rls_owner;`).join("\n")}

revoke all on function
  ${orderedHelpers.map((helper) => helper.signature).join(",\n  ")}
from public, anon, authenticated, service_role;

do $postconditions$
declare
  expected record;
  routine record;
  expected_owner text;
  exact_count integer := 0;
begin
  for expected in
    select * from (values
    ${expected}
    ) contract(function_name, signature, return_type, language_name, volatility_name,
      strict_mode, security_definer, owner_contract, source_hash)
  loop
    select
      pg_catalog.format_type(candidate.prorettype, null) as return_type,
      language.lanname as language_name,
      case candidate.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility_name,
      candidate.proisstrict as strict_mode,
      candidate.prosecdef as security_definer,
      pg_catalog.pg_get_userbyid(candidate.proowner) as owner_name,
      candidate.proconfig,
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(
            pg_catalog.regexp_replace(candidate.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as source_hash,
      pg_catalog.obj_description(candidate.oid, 'pg_proc') as provider_comment,
      candidate.oid,
      (select pg_catalog.count(*) from pg_catalog.pg_proc overload
       where overload.pronamespace = candidate.pronamespace
         and overload.proname = candidate.proname and overload.prokind = 'f') as overload_count
    into routine
    from pg_catalog.pg_proc candidate
    join pg_catalog.pg_language language on language.oid = candidate.prolang
    where candidate.oid = pg_catalog.to_regprocedure(expected.signature);

    expected_owner := case expected.owner_contract
      when 'reflab_rls_owner' then 'reflab_rls_owner'
      else current_user
    end;

    if not found
       or routine.return_type <> expected.return_type
       or routine.language_name <> expected.language_name
       or routine.volatility_name <> expected.volatility_name
       or routine.strict_mode <> expected.strict_mode
       or routine.security_definer <> expected.security_definer
       or routine.owner_name <> expected_owner
       or routine.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or routine.source_hash <> expected.source_hash
       or routine.provider_comment <> ${provider}
       or routine.overload_count <> 1
       or exists (
         select 1 from pg_catalog.aclexplode(
           coalesce((select proacl from pg_catalog.pg_proc where oid = routine.oid),
             pg_catalog.acldefault('f', (select proowner from pg_catalog.pg_proc where oid = routine.oid)))
         ) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
       )
       or exists (
         select 1 from unnest(array['anon', 'authenticated', 'service_role']::text[]) application_role(role_name)
         where pg_catalog.has_function_privilege(application_role.role_name, routine.oid, 'EXECUTE')
       ) then
      raise exception 'Wave 1 helper postcondition is incomplete: %', expected.signature
        using errcode = '55000';
    end if;
    exact_count := exact_count + 1;
  end loop;

  if exact_count <> 16
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (select 1 from reflab_meta.production_adoption_state where phase_order = 4 and phase_key = 'canonical_objects')
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Wave 1 structural or disabled-runtime invariant failed'
      using errcode = '55000';
  end if;
end
$postconditions$;

commit;
`;
}

if (process.argv.includes("--write")) {
  writeFileSync(outputPath, buildPhase4BWave1Migration(), "utf8");
  process.stdout.write(`${PHASE4B_WAVE1_VERSION} ${outputPath}\n`);
}

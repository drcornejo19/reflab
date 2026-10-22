import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PHASE3_DEVELOPMENT_RPCS } from "../phase3/phase3-security-contract.mjs";
import { PHASE4B_WAVE1_HELPERS, PHASE4B_WAVE1_PROVIDER } from "./phase4b-wave1-contract.mjs";
import { PHASE4B_WAVE2_PROVIDER } from "./phase4b-wave2-contract.mjs";
import {
  PHASE4B_WAVE3_FUNCTIONS,
  PHASE4B_WAVE3_GATE,
  PHASE4B_WAVE3_LEGACY_VALIDATORS,
  PHASE4B_WAVE3_UPDATED_AT_PAIRS,
  assertWave3ProviderContract,
} from "./phase4b-wave3-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");

function literal(value) {
  if (value === null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `array[${values.map(literal).join(",")}]::text[]`;
}

function functionValues() {
  return PHASE4B_WAVE3_FUNCTIONS.map((contract) => `(
    ${literal(contract.signature)}, ${literal(contract.returns)}, ${literal(contract.language)},
    ${literal(contract.volatility)}, ${contract.strict}, ${contract.securityDefiner}, ${literal(contract.owner)},
    ${sqlArray(contract.configuration)}, ${literal(contract.sourceHash)}
  )`).join(",\n");
}

function updatedAtValues() {
  return PHASE4B_WAVE3_UPDATED_AT_PAIRS.map((pair) => `(
    ${literal(pair.schema)}, ${literal(pair.table)}, ${literal(pair.canonicalName)},
    ${literal(pair.historicalName)}, ${literal(pair.historicalFunction)}
  )`).join(",\n");
}

function validatorValues() {
  return PHASE4B_WAVE3_LEGACY_VALIDATORS.map((pair) => `(
    ${literal(pair.schema)}, ${literal(pair.table)}, ${literal(pair.canonicalName)},
    ${literal(pair.historicalName)}, ${literal(pair.historicalFunction)}
  )`).join(",\n");
}

export function buildPhase4BWave3GateSql() {
  assertWave3ProviderContract();
  const canonicalUpdatedAt = PHASE4B_WAVE1_HELPERS.find((helper) => helper.signature === "reflab_private.set_updated_at()");
  if (!canonicalUpdatedAt) throw new Error("Wave 3 requires the canonical updated_at helper contract.");
  const effectiveHashes = [...new Set([
    canonicalUpdatedAt.sourceHash,
    ...PHASE4B_WAVE3_FUNCTIONS.map((contract) => contract.sourceHash),
  ])];

  return `-- Phase 4B Wave 3 is a read-only reconciliation gate. The reviewed historical
-- triggers are reused in place; this file intentionally performs no schema DDL.
begin read only;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $phase4b_wave3_gate$
declare
  expected_function record;
  expected_trigger record;
  actual_trigger record;
  matching_count integer;
  effective_count integer;
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception using errcode='55000', message='Wave 3 requires an absent canonical marker';
  end if;
  if not exists (
    select 1 from reflab_meta.production_adoption_state
    where phase_key='canonical_objects' and phase_order=4
  ) or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception using errcode='55000', message='Wave 3 adoption prerequisite is missing';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
      or (select pg_catalog.count(*) from pg_catalog.pg_proc
          where pg_catalog.obj_description(oid,'pg_proc')=${literal(PHASE4B_WAVE1_PROVIDER)}) <> 16
      or (select pg_catalog.count(*) from pg_catalog.pg_class
          where relkind='i' and pg_catalog.obj_description(oid,'pg_class')=${literal(PHASE4B_WAVE2_PROVIDER)}) <> 32 then
    raise exception using errcode='55000', message='Wave 3 adoption prerequisite is missing';
  end if;
  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
      or exists (
        select 1 from pg_catalog.unnest(${sqlArray(PHASE3_DEVELOPMENT_RPCS)}) signature
        where pg_catalog.to_regprocedure(signature) is not null
      ) then
    raise exception using errcode='55000', message='Wave 3 forbids Development-only objects';
  end if;

  for expected_function in
    select * from (values
${functionValues()}
    ) contract(signature, return_type, language_name, volatility, strict_mode, security_definer, owner_name, configuration, source_hash)
  loop
    select pg_catalog.count(*) into matching_count
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid=routine.pronamespace
    where namespace.nspname=pg_catalog.split_part(expected_function.signature,'.',1)
      and routine.proname=pg_catalog.split_part(pg_catalog.split_part(expected_function.signature,'.',2),'(',1);
    if matching_count <> 1 then
      raise exception using errcode='55000', message='Reviewed updated_at helper overload contract drift';
    end if;
    if not exists (
      select 1
      from pg_catalog.pg_proc routine
      join pg_catalog.pg_language language_row on language_row.oid=routine.prolang
      where routine.oid=pg_catalog.to_regprocedure(expected_function.signature)
        and pg_catalog.format_type(routine.prorettype,null)=expected_function.return_type
        and language_row.lanname=expected_function.language_name
        and routine.provolatile=expected_function.volatility
        and routine.proisstrict=expected_function.strict_mode
        and routine.prosecdef=expected_function.security_definer
        and pg_catalog.pg_get_userbyid(routine.proowner)=expected_function.owner_name
        and coalesce(routine.proconfig,array[]::text[])=expected_function.configuration
        and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
          pg_catalog.regexp_replace(routine.prosrc,'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8'
        ),'sha256'),'hex')=expected_function.source_hash
    ) then
      raise exception using errcode='55000', message='Reviewed updated_at helper contract drift';
    end if;
  end loop;

  for expected_trigger in
    select * from (values
${updatedAtValues()}
    ) contract(schema_name, table_name, canonical_name, historical_name, function_signature)
  loop
    if pg_catalog.to_regclass(expected_trigger.schema_name || '.' || expected_trigger.table_name) is null then
      raise exception using errcode='55000', message='Wave 3 trigger prerequisite is missing';
    end if;
    select trigger_row.tgtype, trigger_row.tgenabled, trigger_row.tgqual,
      trigger_row.tgconstraint, function_namespace.nspname || '.' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')' function_signature
    into actual_trigger
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=routine.pronamespace
    where namespace.nspname=expected_trigger.schema_name
      and relation.relname=expected_trigger.table_name
      and trigger_row.tgname=expected_trigger.historical_name
      and not trigger_row.tgisinternal;
    if not found or actual_trigger.tgtype <> 19 or actual_trigger.tgenabled <> 'O'
        or actual_trigger.tgqual is not null or actual_trigger.tgconstraint <> 0
        or actual_trigger.function_signature <> expected_trigger.function_signature then
      raise exception using errcode='55000', message='Reviewed updated_at trigger contract drift';
    end if;
    if expected_trigger.canonical_name <> expected_trigger.historical_name and exists (
      select 1 from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid=pg_catalog.to_regclass(expected_trigger.schema_name || '.' || expected_trigger.table_name)
        and trigger_row.tgname=expected_trigger.canonical_name and not trigger_row.tgisinternal
    ) then
      raise exception using errcode='55000', message='Canonical trigger duplicate would cause double execution';
    end if;
    select pg_catalog.count(*) into effective_count
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    where trigger_row.tgrelid=pg_catalog.to_regclass(expected_trigger.schema_name || '.' || expected_trigger.table_name)
      and not trigger_row.tgisinternal and trigger_row.tgenabled <> 'D'
      and trigger_row.tgtype=19 and trigger_row.tgqual is null
      and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
        pg_catalog.regexp_replace(routine.prosrc,'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8'
      ),'sha256'),'hex')=any(${sqlArray(effectiveHashes)});
    if effective_count <> 1 then
      raise exception using errcode='55000', message='Updated_at trigger double execution contract drift';
    end if;
  end loop;

  for expected_trigger in
    select * from (values
${validatorValues()}
    ) contract(schema_name, table_name, canonical_name, historical_name, function_signature)
  loop
    select trigger_row.tgtype, trigger_row.tgenabled, trigger_row.tgqual,
      trigger_row.tgconstraint, function_namespace.nspname || '.' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')' function_signature
    into actual_trigger
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=routine.pronamespace
    where namespace.nspname=expected_trigger.schema_name
      and relation.relname=expected_trigger.table_name
      and trigger_row.tgname=expected_trigger.historical_name
      and not trigger_row.tgisinternal;
    if not found or actual_trigger.tgtype <> 23 or actual_trigger.tgenabled <> 'O'
        or actual_trigger.tgqual is not null or actual_trigger.tgconstraint <> 0
        or actual_trigger.function_signature <> expected_trigger.function_signature then
      raise exception using errcode='55000', message='Reviewed legacy validator trigger contract drift';
    end if;
  end loop;
end
$phase4b_wave3_gate$;

rollback;
`;
}

export function writePhase4BWave3Gate() {
  const destination = resolve(root, PHASE4B_WAVE3_GATE);
  writeFileSync(destination, buildPhase4BWave3GateSql(), "utf8");
  return destination;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${writePhase4BWave3Gate()}\n`);
}

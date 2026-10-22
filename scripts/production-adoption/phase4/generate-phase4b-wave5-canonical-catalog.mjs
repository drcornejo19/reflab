import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WAVE5_CATALOG_FORMAT = "REFLAB_PHASE4B_WAVE5_EFFECTIVE_CANONICAL_CATALOG_V1";
export const WAVE5_CATALOG_POSTGRES_MAJOR = 18;

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const baselineManifest = JSON.parse(readFileSync(resolve(root, "supabase", "baseline", "manifest.json"), "utf8"));
const artifactPath = resolve(directory, "phase4b-wave5-effective-canonical-catalog-pg18.json");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = Object.freeze({
  initdb: join(postgresBin, "initdb.exe"), pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"), psql: join(postgresBin, "psql.exe"),
});

const baseline = Object.freeze({
  version: "202607270000",
  name: "reflab_canonical_baseline",
  classification: "canonical_baseline",
  file: "202607270000_reflab_canonical_baseline.sql",
});

const productionSafeIncrementals = Object.freeze([
  ["202608110001", "canonical_admin_user_access"],
  ["202608130001", "canonical_training_attempts"],
  ["202608150001", "canonical_communication_feedback"],
  ["202608200001", "canonical_coach_rate_limit"],
  ["202608210001", "canonical_institution_invitation_acceptance"],
  ["202608240001", "canonical_institution_catalog_alignment"],
].map(([version, name]) => Object.freeze({
  version,
  name,
  classification: "canonical_production_safe_incremental",
  file: `${version}_${name}.sql`,
})));

export const WAVE5_EFFECTIVE_CANONICAL_GRAPH = Object.freeze({
  version: "202608240001",
  included: Object.freeze([baseline, ...productionSafeIncrementals]),
  excludedClassifications: Object.freeze(["production_adoption", "development_only"]),
  developmentOnly: Object.freeze([
    "202607300001_clerk_identity_links.sql",
    "202608030001_development_identity_resolution.sql",
    "202608110002_development_super_admin_identity_link.sql",
  ]),
});

const bootstrapSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema storage;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table storage.buckets(id text primary key,name text not null unique,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text not null references storage.buckets(id),name text not null,owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable set search_path=pg_catalog
as $function$ select pg_catalog.string_to_array(name,'/'); $function$;
`;

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer(); server.unref(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolvePort(port)); });
  });
}

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const stableBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
const migrationPath = (entry) => resolve(migrationsDirectory, entry.file);
const graphEntry = (entry) => ({
  ...entry,
  sha256: sha256(readFileSync(migrationPath(entry), "utf8")),
});
const checkKey = (row) => `${row.schema}.${row.table}.${row.constraintName}`;
const fkKey = (row) => `${row.sourceSchema}.${row.sourceTable}.${row.constraintName}`;

function checkIdentity(row) {
  return [row.schema, row.table, row.referencedColumns.join(","), row.expressionHash,
    row.validated ? "validated" : "not_valid", row.noInherit ? "no_inherit" : "inheritable"].join("|");
}

function fkIdentity(row) {
  return [row.sourceSchema, row.sourceTable, row.sourceColumns.join(","), row.targetSchema, row.targetTable,
    row.targetColumns.join(","), row.matchType, row.onUpdate, row.onDelete, row.deferrable,
    row.initiallyDeferred, row.validated].join("|");
}

export function assertNoCanonicalCatalogCollisions(catalog) {
  for (const [section, identity] of [["checks", checkIdentity], ["foreignKeys", fkIdentity]]) {
    const seen = new Set();
    for (const row of catalog[section]) {
      const key = identity(row);
      if (seen.has(key)) throw new Error(`Canonical catalog identity collision in ${section}.`);
      seen.add(key);
    }
  }
  return true;
}

async function generateOnce(label) {
  const port = await reservePort();
  const temporaryRoot = mkdtempSync(join(tmpdir(), `reflab-wave5-catalog-${label}-`));
  const data = join(temporaryRoot, "data");
  const log = join(temporaryRoot, "postgres.log");
  const environment = Object.freeze({ SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
    PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: "wave5_catalog", PGUSER: "postgres", PGSSLMODE: "disable" });
  let started = false;
  const run = (binary, args, input, quiet = false) => execFileSync(binary, args, {
    env: environment, input, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    stdio: quiet ? "ignore" : [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  const sql = (statement) => run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], statement).trim();
  const apply = (entry) => run(
    binaries.psql,
    ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-f", migrationPath(entry)],
  );
  try {
    for (const binary of Object.values(binaries)) if (!existsSync(binary)) throw new Error("PostgreSQL 18 binaries are required.");
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", data]);
    run(binaries.pgCtl, ["start", "-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], undefined, true); started = true;
    run(binaries.createdb, ["wave5_catalog"]);
    sql(bootstrapSql);
    apply(baseline);
    for (const migration of productionSafeIncrementals) apply(migration);
    const serverVersionNum = Number(sql("show server_version_num;"));
    const postgresMajor = Math.trunc(serverVersionNum / 10000);
    if (postgresMajor !== WAVE5_CATALOG_POSTGRES_MAJOR) throw new Error("Canonical catalog PostgreSQL major mismatch.");
    const rows = JSON.parse(sql(String.raw`
select pg_catalog.json_build_object(
 'checks',coalesce((select pg_catalog.json_agg(x order by x.schema_name,x.table_name,x.constraint_name,x.expression_hash) from (
  select n.nspname schema_name,c.relname table_name,k.conname constraint_name,
   coalesce((select pg_catalog.json_agg(a.attname order by u.ordinality) from pg_catalog.unnest(k.conkey) with ordinality u(attnum,ordinality) join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.attnum),'[]') referenced_columns,
   pg_catalog.pg_get_expr(k.conbin,k.conrelid,false) catalog_expression,
   pg_catalog.pg_get_constraintdef(k.oid,false) constraint_definition,
   pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.pg_get_expr(k.conbin,k.conrelid,false),'UTF8'),'sha256'),'hex') expression_hash,
   k.convalidated validated,k.connoinherit no_inherit
  from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','reflab_private','reflab_meta') and k.contype='c') x), '[]'),
 'foreignKeys',coalesce((select pg_catalog.json_agg(x order by x.source_schema,x.source_table,x.constraint_name) from (
  select sn.nspname source_schema,sc.relname source_table,k.conname constraint_name,
   (select pg_catalog.json_agg(a.attname order by u.ordinality) from pg_catalog.unnest(k.conkey) with ordinality u(attnum,ordinality) join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.attnum) source_columns,
   tn.nspname target_schema,tc.relname target_table,
   (select pg_catalog.json_agg(a.attname order by u.ordinality) from pg_catalog.unnest(k.confkey) with ordinality u(attnum,ordinality) join pg_catalog.pg_attribute a on a.attrelid=k.confrelid and a.attnum=u.attnum) target_columns,
   case k.confmatchtype when 'f' then 'FULL' when 'p' then 'PARTIAL' else 'SIMPLE' end match_type,
   case k.confupdtype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' else 'NO ACTION' end on_update,
   case k.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' else 'NO ACTION' end on_delete,
   k.condeferrable deferrable,k.condeferred initially_deferred,k.convalidated validated,
   pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.concat_ws('|',sn.nspname,sc.relname,array_to_string(k.conkey,','),tn.nspname,tc.relname,array_to_string(k.confkey,','),k.confmatchtype,k.confupdtype,k.confdeltype,k.condeferrable,k.condeferred,k.convalidated),'UTF8'),'sha256'),'hex') structural_hash
  from pg_catalog.pg_constraint k join pg_catalog.pg_class sc on sc.oid=k.conrelid join pg_catalog.pg_namespace sn on sn.oid=sc.relnamespace join pg_catalog.pg_class tc on tc.oid=k.confrelid join pg_catalog.pg_namespace tn on tn.oid=tc.relnamespace
  where sn.nspname in ('public','reflab_private','reflab_meta') and k.contype='f') x), '[]'))::text;
`));
    const allChecks = rows.checks.map((row) => ({ schema: row.schema_name, table: row.table_name, constraintName: row.constraint_name,
      referencedColumns: row.referenced_columns, catalogExpression: row.catalog_expression, constraintDefinition: row.constraint_definition,
      expressionHash: row.expression_hash, validated: row.validated, noInherit: row.no_inherit }));
    const usedChecks = new Set();
    const baselineChecks = baselineManifest.object_inventory.check_constraints.map((contract, index) => {
      const [schema, table] = contract.table.split(".");
      let candidates = allChecks.filter((row) => row.schema === schema && row.table === table);
      if (contract.name) candidates = candidates.filter((row) => row.constraintName === contract.name);
      else {
        const withoutLiterals = contract.expression.replace(/'(?:''|[^'])*'/g, "");
        const possibleColumns = [...new Set(candidates.flatMap((row) => row.referencedColumns))];
        const referenced = possibleColumns.filter((column) => new RegExp(`\\b${column}\\b`, "i").test(withoutLiterals)).sort();
        candidates = candidates.filter((row) => JSON.stringify([...row.referencedColumns].sort()) === JSON.stringify(referenced));
      }
      candidates = candidates.filter((row) => !usedChecks.has(`${row.schema}.${row.table}.${row.constraintName}`));
      if (candidates.length !== 1) throw new Error(`Canonical CHECK mapping is ambiguous: ${contract.table}.${contract.name ?? index}.`);
      const selected = candidates[0];
      usedChecks.add(`${selected.schema}.${selected.table}.${selected.constraintName}`);
      return { ...selected, manifestName: contract.name, manifestIndex: index };
    });
    const incrementalChecks = allChecks.filter((row) => !usedChecks.has(checkKey(row)));
    if (incrementalChecks.length !== 1
        || incrementalChecks[0].constraintName !== "attempts_canonical_payload_hash_check") {
      throw new Error("Effective canonical CHECK provider graph is incomplete or ambiguous.");
    }
    const checks = [...baselineChecks, ...incrementalChecks.map((row) => ({
      ...row,
      manifestName: row.constraintName,
      manifestIndex: null,
    }))].sort((left, right) => checkKey(left).localeCompare(checkKey(right)));
    const expectedForeignKeyNames = new Set(baselineManifest.object_inventory.foreign_keys.map((row) => row.name));
    const allForeignKeys = rows.foreignKeys.map((row) => ({ sourceSchema: row.source_schema, sourceTable: row.source_table,
      constraintName: row.constraint_name, sourceColumns: row.source_columns, targetSchema: row.target_schema,
      targetTable: row.target_table, targetColumns: row.target_columns, matchType: row.match_type,
      onUpdate: row.on_update, onDelete: row.on_delete, deferrable: row.deferrable,
      initiallyDeferred: row.initially_deferred, validated: row.validated, structuralHash: row.structural_hash }));
    const foreignKeys = allForeignKeys.filter((row) => expectedForeignKeyNames.has(row.constraintName));
    if (foreignKeys.length !== baselineManifest.object_inventory.foreign_keys.length
        || foreignKeys.length !== allForeignKeys.length) {
      throw new Error("Physical canonical FK catalog and extracted contract differ.");
    }
    const providerGraph = {
      version: WAVE5_EFFECTIVE_CANONICAL_GRAPH.version,
      included: WAVE5_EFFECTIVE_CANONICAL_GRAPH.included.map(graphEntry),
      excludedClassifications: WAVE5_EFFECTIVE_CANONICAL_GRAPH.excludedClassifications,
      developmentOnly: WAVE5_EFFECTIVE_CANONICAL_GRAPH.developmentOnly,
    };
    const sourceByProvider = new Map(productionSafeIncrementals.map((entry) => [entry.file, readFileSync(migrationPath(entry), "utf8")]));
    const providersFor = (constraintName, baselineProvided) => {
      const providers = baselineProvided ? [baseline.file] : [];
      for (const migration of productionSafeIncrementals) {
        const escapedName = constraintName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\badd\\s+constraint\\s+${escapedName}\\b`, "i").test(sourceByProvider.get(migration.file))) {
          providers.push(migration.file);
        }
      }
      if (providers.length === 0) throw new Error(`Canonical provider is missing for ${constraintName}.`);
      return providers;
    };
    const checksWithProviders = checks.map((row) => {
      const providers = providersFor(row.constraintName, row.manifestIndex !== null);
      return { ...row, providerHistory: providers, finalProvider: providers.at(-1) };
    });
    const foreignKeysWithProviders = foreignKeys.map((row) => ({
      ...row,
      providerHistory: [baseline.file],
      finalProvider: baseline.file,
    }));
    const catalog = {
      format: WAVE5_CATALOG_FORMAT, serverVersionNum, postgresMajor,
      canonicalGraph: providerGraph,
      providerGraphHash: sha256(stableBytes(providerGraph)),
      baselineExtractionCoverage: {
        checks: { physical: baselineChecks.length, extracted: baselineManifest.object_inventory.check_constraints.length, missing: 0, unexpected: 0 },
        foreignKeys: { physical: foreignKeys.length, extracted: baselineManifest.object_inventory.foreign_keys.length, missing: 0, unexpected: 0 },
      },
      checks: checksWithProviders,
      foreignKeys: foreignKeysWithProviders,
    };
    assertNoCanonicalCatalogCollisions(catalog);
    const payload = { ...catalog, fingerprintHash: sha256(stableBytes(catalog)) };
    return stableBytes(payload);
  } finally {
    if (started) run(binaries.pgCtl, ["stop", "-D", data, "-m", "immediate", "-w"], undefined, true);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export async function generateCanonicalCatalogArtifact() {
  const first = await generateOnce("a");
  const second = await generateOnce("b");
  if (first !== second) throw new Error("Canonical catalog regeneration is not deterministic.");
  writeFileSync(artifactPath, first, "utf8");
  return { path: artifactPath, bytes: first.length, fingerprintHash: JSON.parse(first).fingerprintHash };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.stdout.write(`${JSON.stringify(await generateCanonicalCatalogArtifact())}\n`);

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalObjectManifest,
  DEVELOPMENT_PROJECT_REF,
  identityColumns,
  migrationManifest,
  MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION,
  PRODUCTION_PROJECT_REF,
  REQUIRED_IN_PRODUCTION,
  runtimeRpcSignatures,
} from "./manifest.mjs";
import {
  baseInventoryQueries,
  buildIdentityQueries,
  buildSqlBatch,
  compareInventoryWithManifest,
  jsonQuery,
  READ_ONLY_GUARD_QUERY_ID,
  RESULT_FRAME_PREFIX,
  semanticQueries,
} from "./queries.mjs";
import { buildGateReport, connectionCredentialBlockers } from "./gates.mjs";
import { assertReadOnlyBatch, assertReadOnlySql, maskSqlCommentsAndStrings } from "./sql-safety.mjs";
import {
  buildConditionalInventory,
  classifyMigrationHistory,
  executeReadOnlyBatch,
  parseJsonResults,
  PREFLIGHT_MAX_BUFFER_BYTES,
  runProductionPreflight,
} from "./run.mjs";
import {
  authorizeProductionPreflightTarget,
  PRODUCTION_PREFLIGHT_ROLE,
  PRODUCTION_SESSION_POOLER_HOST,
} from "./target.mjs";

const productionEnvironment = {
  ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
  REFLAB_PRODUCTION_PREFLIGHT_PROJECT_REF: PRODUCTION_PROJECT_REF,
  REFLAB_PRODUCTION_PREFLIGHT_DB_URL: `postgresql://${PRODUCTION_PREFLIGHT_ROLE}:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
};

const poolerEnvironment = {
  ...productionEnvironment,
  REFLAB_PRODUCTION_PREFLIGHT_DB_URL: `postgresql://${PRODUCTION_PREFLIGHT_ROLE}.${PRODUCTION_PROJECT_REF}:secret@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`,
};

const resultFrameLine = (query, payload, payloadRowCount = 1) => {
  const envelope = JSON.stringify({ query, payload_row_count: payloadRowCount, payload });
  return `${RESULT_FRAME_PREFIX}\t${query}\t${Buffer.from(envelope, "utf8").toString("base64")}`;
};

const readOnlyGuardLine = (payload = "on") => resultFrameLine(READ_ONLY_GUARD_QUERY_ID, payload);

function hasTopLevelKeyword(sql, keyword) {
  const masked = maskSqlCommentsAndStrings(sql);
  let depth = 0;
  let found = false;
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === "(") {
      depth += 1;
      continue;
    }
    if (masked[index] === ")") {
      depth -= 1;
      assert.ok(depth >= 0, "SQL payload has unbalanced parentheses");
      continue;
    }
    if (depth !== 0) continue;
    const candidate = masked.slice(index, index + keyword.length);
    const previous = masked[index - 1] ?? " ";
    const next = masked[index + keyword.length] ?? " ";
    if (candidate.toLowerCase() === keyword.toLowerCase() && !/[a-z0-9_]/i.test(previous) && !/[a-z0-9_]/i.test(next)) {
      found = true;
    }
  }
  assert.equal(depth, 0, "SQL payload has unbalanced parentheses");
  return found;
}

test("target guard keeps accepting the exact direct Production host", () => {
  const result = authorizeProductionPreflightTarget(productionEnvironment);
  assert.equal(result.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(result.host, `db.${PRODUCTION_PROJECT_REF}.supabase.co`);
  assert.equal(result.connectionEnvironment.PGUSER, PRODUCTION_PREFLIGHT_ROLE);
  assert.equal(result.connectionEnvironment.PGSSLMODE, "require");
});

test("target guard accepts the exact Production IPv4 Session pooler", () => {
  const result = authorizeProductionPreflightTarget(poolerEnvironment);
  assert.equal(result.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(result.host, PRODUCTION_SESSION_POOLER_HOST);
  assert.equal(result.connectionEnvironment.PGPORT, "5432");
  assert.equal(result.connectionEnvironment.PGDATABASE, "postgres");
  assert.equal(result.connectionEnvironment.PGUSER, `${PRODUCTION_PREFLIGHT_ROLE}.${PRODUCTION_PROJECT_REF}`);
  assert.equal(result.connectionEnvironment.PGSSLMODE, "require");
});

test("target guard rejects postgres-prefixed Production hosts", () => {
  const url = `postgresql://${PRODUCTION_PREFLIGHT_ROLE}:secret@postgres.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
  assert.throws(() => authorizeProductionPreflightTarget({ ...productionEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: url }), /allowlisted host/);
});

test("target guard rejects every Development project reference", () => {
  assert.throws(() => authorizeProductionPreflightTarget({ ...poolerEnvironment, UNRELATED_VALUE: DEVELOPMENT_PROJECT_REF }), /Development project reference/);
});

test("target guard rejects another pooler or region", () => {
  const url = poolerEnvironment.REFLAB_PRODUCTION_PREFLIGHT_DB_URL.replace(PRODUCTION_SESSION_POOLER_HOST, "aws-0-us-east-1.pooler.supabase.com");
  assert.throws(() => authorizeProductionPreflightTarget({ ...poolerEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: url }), /allowlisted host/);
});

test("target guard rejects transaction pooler port 6543", () => {
  const url = poolerEnvironment.REFLAB_PRODUCTION_PREFLIGHT_DB_URL.replace(":5432/postgres", ":6543/postgres");
  assert.throws(() => authorizeProductionPreflightTarget({ ...poolerEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: url }), /allowlisted host/);
});

test("target guard rejects a pooler username without the Production project ref", () => {
  const url = poolerEnvironment.REFLAB_PRODUCTION_PREFLIGHT_DB_URL.replace(`${PRODUCTION_PREFLIGHT_ROLE}.${PRODUCTION_PROJECT_REF}`, PRODUCTION_PREFLIGHT_ROLE);
  assert.throws(() => authorizeProductionPreflightTarget({ ...poolerEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: url }), /allowlisted host/);
});

test("target guard rejects a pooler username for another role", () => {
  const url = poolerEnvironment.REFLAB_PRODUCTION_PREFLIGHT_DB_URL.replace(PRODUCTION_PREFLIGHT_ROLE, "another_role");
  assert.throws(() => authorizeProductionPreflightTarget({ ...poolerEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: url }), /allowlisted host/);
});

test("target guard remains fail-closed for missing opt-in and unknown hosts", () => {
  assert.throws(() => authorizeProductionPreflightTarget({}), /opt-in/);
  assert.throws(() => authorizeProductionPreflightTarget({ ...productionEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: `postgresql://${PRODUCTION_PREFLIGHT_ROLE}:secret@example.com:5432/postgres?sslmode=require` }), /allowlisted host/);
});

test("an unauthorized target aborts before psql can be started", () => {
  let spawned = false;
  assert.throws(() => runProductionPreflight({}, {
    spawn() {
      spawned = true;
      throw new Error("must not run");
    },
  }), /opt-in/);
  assert.equal(spawned, false);
});

test("generated SQL is wrapped, time-limited and restricted to the read-only allowlist", () => {
  const sql = buildSqlBatch([...baseInventoryQueries, ...semanticQueries, ...buildIdentityQueries()]);
  const statements = assertReadOnlyBatch(sql);
  assert.match(statements[0], /^begin read only$/i);
  assert.match(statements.at(-1), /^rollback$/i);
  assert.ok(statements.some((statement) => /^show default_transaction_read_only$/i.test(statement)));
  assert.ok(statements.some((statement) => /^show transaction_read_only$/i.test(statement)));
  assert.ok(statements.some((statement) => /^select current_user, session_user$/i.test(statement)));
  assert.ok(statements.findIndex((statement) => /current_setting\(\s*\)/i.test(statement)) < statements.findIndex((statement) => /pg_catalog\.pg_namespace/i.test(statement)));
  assert.match(sql, /statement_timeout = '15s'/);
  assert.match(sql, /lock_timeout = '2s'/);
});

test("jsonQuery wraps every payload form as an independent scalar query", () => {
  const examples = [
    jsonQuery("literal_payload", "pg_catalog.json_build_object('value', 'ok')"),
    jsonQuery(
      "from_payload",
      "pg_catalog.json_build_object('rows', count(*)) from public.example_rows"
    ),
    jsonQuery(
      "join_payload",
      "pg_catalog.json_build_object('rows', count(*)) from public.example_rows a join public.example_links b on b.id = a.id"
    ),
    jsonQuery(
      "subquery_payload",
      "pg_catalog.json_build_object('rows', (select count(*) from public.example_rows))"
    ),
    jsonQuery(
      "cte_payload",
      "coalesce((with sample as (select 1 as value) select pg_catalog.json_agg(value) from sample), '[]'::json)"
    ),
  ];

  for (const query of examples) {
    assert.ok(
      query.sql.includes(`from (select ${query.payloadSql}) payload_rows(payload_value)`),
      `${query.id} is not wrapped as an independent payload query`
    );
    assert.equal(query.sql.includes(`'payload', ${query.payloadSql}`), false);
    assert.match(query.sql, /'payload_row_count', count\(\*\)/i);
    assert.match(query.sql, /'payload', \(pg_catalog\.json_agg\(payload_rows\.payload_value\) -> 0\)/i);
    assert.doesNotThrow(() => assertReadOnlySql(query.sql));
  }
});

test("all current semantic and identity queries use the same scalar payload wrapper", () => {
  const identityQueries = buildIdentityQueries();
  const queries = [...baseInventoryQueries, ...semanticQueries, ...identityQueries];
  for (const query of queries) {
    assert.doesNotThrow(() => assertReadOnlySql(query.sql), `${query.id} is not valid read-only SQL`);
    hasTopLevelKeyword(query.payloadSql, "from");
    assert.ok(
      query.sql.includes(`from (select ${query.payloadSql}) payload_rows(payload_value)`),
      `${query.id} bypasses jsonQuery scalar framing`
    );
    assert.equal(
      query.sql.includes(`'payload', ${query.payloadSql}`),
      false,
      `${query.id} retains the invalid direct payload pattern`
    );
  }

  const topLevelFromSemanticIds = semanticQueries
    .filter((query) => hasTopLevelKeyword(query.payloadSql, "from"))
    .map((query) => query.id);
  assert.deepEqual(topLevelFromSemanticIds, [
    "attempt_semantics",
    "exam_integrity",
    "matches_tenant_integrity",
    "fixture_creator_identity",
  ]);
  assert.ok(identityQueries.every((query) => /\)\s+from\s+/i.test(query.payloadSql)));
});

test("read-only guard is parseable and contains no constant-folding failure expression", () => {
  const sql = buildSqlBatch([]);
  assert.match(sql, /'query', 'read_only_guard',[\s\S]*'payload_row_count', count\(\*\),[\s\S]*'payload', \(pg_catalog\.json_agg\(payload_rows\.payload_value\) -> 0\)/i);
  assert.match(sql, /from \(select pg_catalog\.current_setting\('transaction_read_only'\)\) payload_rows\(payload_value\)/i);
  assert.match(sql, /pg_catalog\.translate\([\s\S]*pg_catalog\.chr\(10\) \|\| pg_catalog\.chr\(13\)/i);
  assert.doesNotMatch(sql, /\bpgcrypto\b|\bdigest\s*\(/i);
  assert.doesNotMatch(sql, /\/\s*0\b|\bcase\b|\braise\b|\bpg_sleep\b/i);

  const accepted = executeReadOnlyBatch(sql, {}, {
    spawn() {
      return { status: 0, stdout: `${readOnlyGuardLine()}\n`, stderr: "" };
    },
  });
  assert.equal(accepted.get(READ_ONLY_GUARD_QUERY_ID), "on");

  for (const payload of ["off", "ON", true, null, undefined]) {
    assert.throws(() => executeReadOnlyBatch(sql, {}, {
      spawn() {
        const stdout = payload === undefined ? "" : `${readOnlyGuardLine(payload)}\n`;
        return { status: 0, stdout, stderr: "" };
      },
    }), /transaction_read_only was not confirmed as on/);
  }
});

test("a failed base read-only gate aborts before the semantic phase", () => {
  let spawnCount = 0;
  assert.throws(() => runProductionPreflight(productionEnvironment, {
    spawn() {
      spawnCount += 1;
      return { status: 0, stdout: `${readOnlyGuardLine("off")}\n`, stderr: "" };
    },
    writeReport() {},
  }), /transaction_read_only was not confirmed as on/);
  assert.equal(spawnCount, 1);
});

test("framed transport preserves multiline, CRLF, quotes, backslashes, Unicode and concatenated results", () => {
  const firstPayload = {
    text: "first line\nsecond line\r\n\"quoted\" \\path árbitro ⚽",
  };
  const secondPayload = ["línea uno", { nested: "雪\\nfin" }];
  const output = [
    "unframed psql noise",
    resultFrameLine("first_payload", firstPayload),
    resultFrameLine("second_payload", secondPayload),
  ].join("\r\n");
  const results = parseJsonResults(`${output}\n`);
  assert.deepEqual(results.get("first_payload"), firstPayload);
  assert.deepEqual(results.get("second_payload"), secondPayload);
});

test("framed transport fails closed unless each payload query returned exactly one row", () => {
  for (const rowCount of [0, 2]) {
    let error;
    assert.throws(() => {
      try {
        parseJsonResults(resultFrameLine("row_count_guard", "SENSITIVE_PAYLOAD", rowCount));
      } catch (caught) {
        error = caught;
        throw caught;
      }
    }, /invalid result frame for query row_count_guard/);
    assert.doesNotMatch(error.message, /SENSITIVE_PAYLOAD/);
  }
});

test("large function inventory is framed, hashed exactly and discarded before reporting", () => {
  const sourceDefinition = `BEGIN\r\n${"x".repeat(2 * 1024 * 1024)}\nRETURN '\"árbitro\\ruta\"';\nEND`;
  const output = [
    readOnlyGuardLine(),
    resultFrameLine("function_inventory", [{ signature: "public.large()", source_definition: sourceDefinition }]),
  ].join("\n");
  const results = parseJsonResults(output);
  const entry = results.get("function_inventory")[0];
  const expectedHash = createHash("sha256").update(sourceDefinition.replace(/\r\n/g, "\n").trim(), "utf8").digest("hex");
  assert.equal(entry.source_hash, expectedHash);
  assert.equal(Object.hasOwn(entry, "source_definition"), false);
});

test("function contract comparison uses the exact internal source hash", () => {
  const expected = canonicalObjectManifest.functions.find((entry) => entry.scope === "shared");
  const actual = {
    signature: expected.signature,
    security: expected.security,
    owner: expected.owner,
    search_path: `search_path=${expected.search_path}`,
    source_hash: expected.sourceHash,
  };
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["function_inventory", [actual]],
  ]);
  const matching = compareInventoryWithManifest(results).functionContractDrift;
  assert.equal(matching.some((entry) => entry.signature === expected.signature), false);

  actual.source_hash = "0".repeat(64);
  const drifted = compareInventoryWithManifest(results).functionContractDrift;
  assert.equal(drifted.some((entry) => entry.signature === expected.signature), true);
});

test("corrupt framing aborts without exposing payload and before semantic execution", () => {
  const sensitiveBody = "SENSITIVE_FUNCTION_BODY_SHOULD_NEVER_APPEAR";
  const truncatedJson = `{"query":"function_inventory","payload":[{"source_definition":"${sensitiveBody}`;
  const corruptFrame = `${RESULT_FRAME_PREFIX}\tfunction_inventory\t${Buffer.from(truncatedJson, "utf8").toString("base64")}`;
  let parseError;
  assert.throws(() => {
    try {
      parseJsonResults(corruptFrame);
    } catch (error) {
      parseError = error;
      throw error;
    }
  }, /invalid result frame for query function_inventory/);
  assert.doesNotMatch(parseError.message, new RegExp(sensitiveBody));

  let spawnCount = 0;
  let runError;
  assert.throws(() => {
    try {
      runProductionPreflight(productionEnvironment, {
        spawn() {
          spawnCount += 1;
          return { status: 0, stdout: `${readOnlyGuardLine()}\n${corruptFrame}\n`, stderr: "" };
        },
        writeReport() {},
      });
    } catch (error) {
      runError = error;
      throw error;
    }
  }, /invalid result frame for query function_inventory/);
  assert.doesNotMatch(runError.message, new RegExp(sensitiveBody));
  assert.equal(spawnCount, 1);
});

test("spawnSync uses an explicit buffer and sanitizes overflow failures", () => {
  const sensitiveOutput = "SENSITIVE_TRUNCATED_FUNCTION_OUTPUT";
  let configuredMaxBuffer;
  let overflowError;
  assert.throws(() => {
    try {
      executeReadOnlyBatch(buildSqlBatch([]), {}, {
        spawn(_command, _args, options) {
          configuredMaxBuffer = options.maxBuffer;
          const overflow = new Error(`maxBuffer exceeded: ${sensitiveOutput}`);
          overflow.code = "ENOBUFS";
          return { status: null, error: overflow, stdout: sensitiveOutput, stderr: "" };
        },
      });
    } catch (error) {
      overflowError = error;
      throw error;
    }
  }, /database output exceeded the safe buffer limit/);
  assert.equal(configuredMaxBuffer, PREFLIGHT_MAX_BUFFER_BYTES);
  assert.ok(configuredMaxBuffer >= 16 * 1024 * 1024);
  assert.doesNotMatch(overflowError.message, new RegExp(sensitiveOutput));
});

test("both runner phases independently enforce a read-only transaction before inventory", () => {
  const batches = [];
  const outputs = [
    [
      { query: READ_ONLY_GUARD_QUERY_ID, payload: "on" },
      { query: "catalog_gate", payload: { tables: [], columns: [] } },
      { query: "connection_role_security", payload: { rolname: "preflight_reader", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false } },
      { query: "connection_effective_writes", payload: { schemas_with_create: [], tables_with_dml: [], sequences_with_write: [], tables_owned: [] } },
      { query: "semantic_visibility", payload: [] },
    ].map((entry) => resultFrameLine(entry.query, entry.payload)).join("\n"),
    readOnlyGuardLine(),
  ];
  runProductionPreflight(productionEnvironment, {
    spawn(_command, _arguments, options) {
      batches.push(options.input);
      return { status: 0, stdout: outputs.shift(), stderr: "" };
    },
    writeReport() {},
  });
  assert.equal(batches.length, 2);
  for (const sql of batches) {
    const statements = assertReadOnlyBatch(sql);
    const guardIndex = statements.findIndex((statement) => /current_setting\(\s*\)/i.test(statement));
    const substantiveIndex = statements.findIndex((statement, index) => index > guardIndex && /^select\b/i.test(statement));
    assert.ok(guardIndex >= 0);
    assert.ok(substantiveIndex > guardIndex);
  }
});

test("forbidden SQL is rejected while controlled comments and strings are ignored", () => {
  for (const keyword of ["insert", "update", "delete", "upsert", "merge", "create", "alter", "drop", "truncate", "grant", "revoke", "call", "copy"]) {
    assert.throws(() => assertReadOnlySql(`select 1; ${keyword} unsafe_target`), /Forbidden SQL keyword|not allowlisted/);
  }
  assert.doesNotThrow(() => assertReadOnlySql("select 'INSERT UPDATE DELETE' as harmless /* DROP */ -- GRANT\n"));
  assert.doesNotThrow(() => assertReadOnlySql("select $$ALTER DROP$$ as harmless, 'CaLl CoPy' as text"));
  assert.throws(() => assertReadOnlySql("select 1; /* harmless */ UpDaTe unsafe_target set value = 1"), /Forbidden SQL keyword/);
  assert.throws(() => assertReadOnlySql("with changed as (\n  DELETE from unsafe_target\n) select 1"), /Forbidden SQL keyword/);
  assert.throws(() => assertReadOnlySql("select 1 /* unterminated"), /unterminated/);
  assert.throws(() => assertReadOnlySql("select 'unterminated"), /unterminated/);
  assert.throws(() => assertReadOnlySql("select 1; \\copy x to 'file'"), /meta-commands/);
});

test("P5 detects direct claims, auth.jwt, sub extraction and external-subject fallback", () => {
  const p5 = baseInventoryQueries.find((query) => query.id === "p5_direct_identity_readers").sql;
  assert.doesNotMatch(p5, /pg_catalog\.position\s*\(/i);
  assert.match(p5, /pg_catalog\.strpos\(lower\(pg_catalog\.pg_get_functiondef\(p\.oid\)\), 'request\.jwt\.claims'\) > 0/i);
  assert.match(p5, /pg_catalog\.strpos\(lower\(pg_catalog\.pg_get_functiondef\(p\.oid\)\), 'request\.jwt\.claim\.sub'\) > 0/i);
  assert.match(p5, /request\.jwt\.claims/i);
  assert.match(p5, /auth\[\.\]jwt/i);
  assert.match(p5, /->>''sub''/i);
  assert.match(p5, /request\.jwt\.claim\.sub/i);
  assert.match(p5, /auth\[\.\]uid/i);
  assert.match(p5, /references_identity_links/i);
  assert.match(p5, /external_subject_fallback/i);
  assert.doesNotMatch(p5, /select\s+external_subject\s+as/i);
});

test("optional identity and semantic queries declare existence dependencies", () => {
  for (const query of [...semanticQueries, ...buildIdentityQueries()]) {
    if (query.id === "storage_object_policies") continue;
    assert.ok((query.requires.tables?.length ?? 0) > 0, `${query.id} lacks a table gate`);
  }
  const catalog = { tables: ["public.attempts"], columns: ["public.attempts.user_id"] };
  const conditional = buildConditionalInventory(catalog, []);
  assert.ok(conditional.skipped.some((entry) => entry.query === "attempt_semantics"));
  assert.ok(conditional.skipped.every((entry) => entry.status.startsWith("BLOCKER_")));
});

test("semantic queries fail closed when visibility is unknown or RLS applies", () => {
  const catalog = {
    tables: ["public.attempts", "public.exam_results"],
    columns: [
      "public.attempts.user_id",
      "public.attempts.exam_result_id",
      "public.attempts.source_item_type",
      "public.attempts.score",
      "public.exam_results.id",
      "public.exam_results.user_id",
    ],
  };
  const unknown = buildConditionalInventory(catalog, []);
  assert.equal(
    unknown.skipped.find((entry) => entry.query === "attempt_semantics")?.status,
    "BLOCKER_SKIPPED_VISIBILITY_UNKNOWN"
  );

  const rlsLimited = buildConditionalInventory(catalog, [
    { table_name: "public.attempts", has_select: true, rls_applies: true },
    { table_name: "public.exam_results", has_select: true, rls_applies: true },
  ]);
  assert.equal(
    rlsLimited.skipped.find((entry) => entry.query === "attempt_semantics")?.status,
    "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN"
  );
  assert.equal(rlsLimited.runnable.some((entry) => entry.id === "attempt_semantics"), false);
});

test("semantic queries run only after complete SELECT and non-RLS visibility is proven", () => {
  const catalog = {
    tables: ["public.attempts", "public.exam_results"],
    columns: [
      "public.attempts.user_id",
      "public.attempts.exam_result_id",
      "public.attempts.source_item_type",
      "public.attempts.score",
      "public.exam_results.id",
      "public.exam_results.user_id",
    ],
  };
  const conditional = buildConditionalInventory(catalog, [
    { table_name: "public.attempts", has_select: true, rls_applies: false },
    { table_name: "public.exam_results", has_select: true, rls_applies: false },
  ]);
  assert.equal(conditional.runnable.some((entry) => entry.id === "attempt_semantics"), true);
});

test("catalog discovery uses pg_catalog and can gate migration history outside app schemas", () => {
  const catalogSql = baseInventoryQueries.find((query) => query.id === "catalog_gate").sql;
  assert.match(catalogSql, /pg_catalog\.pg_attribute/);
  assert.doesNotMatch(catalogSql, /information_schema\.columns/);

  const catalog = {
    tables: ["supabase_migrations.schema_migrations"],
    columns: [
      "supabase_migrations.schema_migrations.version",
      "supabase_migrations.schema_migrations.name",
    ],
  };
  const conditional = buildConditionalInventory(catalog, [{
    table_name: "supabase_migrations.schema_migrations",
    has_select: true,
    rls_applies: false,
  }]);
  assert.equal(conditional.runnable.some((entry) => entry.id === "migration_history"), true);
});

test("trigger, grant and Storage inventories remain separate and complete", () => {
  const ids = new Set(baseInventoryQueries.map((query) => query.id).concat(semanticQueries.map((query) => query.id)));
  for (const id of ["trigger_inventory", "index_inventory", "unique_constraint_inventory", "table_grants", "schema_grants", "routine_grants", "sequence_grants", "role_memberships", "storage_buckets", "storage_object_counts", "storage_object_policies"]) {
    assert.ok(ids.has(id), `Missing ${id}`);
  }
  assert.match(baseInventoryQueries.find((query) => query.id === "trigger_inventory").sql, /enabled_state/);
  assert.match(baseInventoryQueries.find((query) => query.id === "trigger_inventory").sql, /function_executed/);
  assert.match(baseInventoryQueries.find((query) => query.id === "trigger_inventory").sql, /trigger_definition/);
  assert.match(baseInventoryQueries.find((query) => query.id === "trigger_inventory").sql, /timing_and_events/);
  assert.match(baseInventoryQueries.find((query) => query.id === "index_inventory").sql, /constraint_state\.conindid = index_class\.oid/);
  assert.match(baseInventoryQueries.find((query) => query.id === "index_inventory").sql, /predicate/);
  assert.match(baseInventoryQueries.find((query) => query.id === "policy_inventory").sql, /pg_get_expr/);
  assert.match(baseInventoryQueries.find((query) => query.id === "unique_constraint_inventory").sql, /constraint_state\.contype = 'u'/);
  assert.doesNotMatch(baseInventoryQueries.find((query) => query.id === "policy_inventory").sql, /\bcmd, qual, with_check\b/i);
  assert.doesNotMatch(semanticQueries.find((query) => query.id === "storage_object_policies").sql, /\bcmd, qual, with_check\b/i);
  assert.match(baseInventoryQueries.find((query) => query.id === "role_memberships").sql, /with recursive inherited_roles/i);
  for (const id of ["table_grants", "schema_grants", "routine_grants", "sequence_grants"]) {
    assert.doesNotMatch(baseInventoryQueries.find((query) => query.id === id).sql, /and \(acl\.grantee = 0/);
  }
});

test("generated preflight SQL contains no schema-qualified POSITION special syntax", () => {
  const sql = buildSqlBatch([
    ...baseInventoryQueries,
    ...semanticQueries,
    ...buildIdentityQueries(),
  ]);
  assert.doesNotMatch(sql, /pg_catalog[.]position\s*[(]/i);
  assert.match(sql, /pg_catalog[.]strpos\(inherited[.]inheritance_path, ' -> ' \|\| granted[.]rolname\) = 0/i);
});

test("token ownership conflicts always return an integer", () => {
  const query = semanticQueries.find((entry) => entry.id === "notification_integrity").sql;
  assert.match(query, /token_owner_conflicts', coalesce\(\(select count\(\*\)/i);
  assert.match(query, /\), 0\)/);
});

test("canonical manifest separates required and forbidden Production RPC categories", () => {
  assert.deepEqual(canonicalObjectManifest.sanityCounts, {
    tables: canonicalObjectManifest.tables.length,
    functions: canonicalObjectManifest.functions.length,
    policies: canonicalObjectManifest.policies.length,
    triggers: canonicalObjectManifest.triggers.length,
    explicitIndexes: canonicalObjectManifest.explicitIndexes.length,
  });
  assert.ok(canonicalObjectManifest.functions.every((entry) => entry.owner && /^[0-9a-f]{64}$/.test(entry.sourceHash)));
  assert.ok(canonicalObjectManifest.policies.every((entry) =>
    (entry.usingExpressionHash === null || /^[0-9a-f]{64}$/.test(entry.usingExpressionHash)) &&
    (entry.withCheckExpressionHash === null || /^[0-9a-f]{64}$/.test(entry.withCheckExpressionHash))
  ));
  assert.ok(canonicalObjectManifest.policies.every((entry) =>
    entry.schema && entry.table && entry.name && entry.command && entry.mode && entry.roles?.length
  ));
  assert.deepEqual(
    REQUIRED_IN_PRODUCTION.filter((signature) => MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.includes(signature)),
    []
  );
  assert.equal(REQUIRED_IN_PRODUCTION.length, 7);
  assert.equal(MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.length, 3);
  assert.equal(runtimeRpcSignatures.length, 10);
  assert.deepEqual(REQUIRED_IN_PRODUCTION, [
    "public.admin_set_canonical_user_plan(text, text, text, text)",
    "public.admin_set_canonical_global_role(text, text, text, text)",
    "public.submit_canonical_communication_feedback(text, uuid, text, jsonb)",
    "public.submit_referee_exam(text, uuid, uuid, text, jsonb)",
    "public.consume_coach_rate_limit(text, text, integer, integer)",
    "public.submit_canonical_training_attempt(text, uuid, jsonb, integer)",
    "public.accept_canonical_institution_invitation(text, uuid, text[])",
  ]);
  assert.deepEqual(MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION, [
    "public.resolve_development_clerk_identity(text)",
    "public.link_development_clerk_identity(text)",
    "public.link_development_super_admin_clerk_identity(text)",
  ]);
  assert.ok(runtimeRpcSignatures
    .filter((entry) => entry.productionCategory === "REQUIRED_IN_PRODUCTION")
    .every((entry) => !MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.includes(entry.signature)));
});

test("Production canonical objects exclude Development identity-link infrastructure", () => {
  assert.equal(canonicalObjectManifest.tables.includes("reflab_private.user_identity_links"), false);
  assert.equal(Object.hasOwn(canonicalObjectManifest.criticalColumns, "reflab_private.user_identity_links"), false);
  assert.equal(canonicalObjectManifest.rls.some((entry) => entry.table === "reflab_private.user_identity_links"), false);
  assert.equal(canonicalObjectManifest.uniques.some((entry) => entry.table === "reflab_private.user_identity_links"), false);
  assert.equal(canonicalObjectManifest.policies.some((entry) => entry.scope === "development_chain"), false);
  assert.equal(canonicalObjectManifest.policies.some((entry) => entry.table === "user_identity_links"), false);
  assert.equal(canonicalObjectManifest.functions.some((entry) => MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.includes(entry.signature)), false);
});

test("Matches preparations and reviews derive fixture context through appointments", () => {
  for (const table of ["public.match_preparations", "public.post_match_reviews"]) {
    assert.deepEqual(canonicalObjectManifest.criticalColumns[table], ["appointment_id", "user_id"]);
    assert.equal(canonicalObjectManifest.criticalColumns[table].includes("fixture_id"), false);
    assert.deepEqual(identityColumns[table], ["user_id"]);
  }
});

test("appointment-backed Matches columns remain real object blockers without reducing others", () => {
  const allCriticalColumns = Object.entries(canonicalObjectManifest.criticalColumns)
    .flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`));
  const appointmentColumns = [
    "public.match_preparations.appointment_id",
    "public.post_match_reviews.appointment_id",
  ];
  const comparison = compareInventoryWithManifest(new Map([
    ["catalog_gate", {
      tables: canonicalObjectManifest.tables,
      columns: allCriticalColumns.filter((column) => !appointmentColumns.includes(column)),
    }],
  ]));

  assert.deepEqual(comparison.missingCriticalColumns.sort(), appointmentColumns.sort());
  assert.equal(comparison.missingCriticalColumns.some((column) => column.endsWith(".fixture_id")), false);

  const allMissing = compareInventoryWithManifest(new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
  ])).missingCriticalColumns;
  assert.equal(allMissing.length, allCriticalColumns.length);
  assert.ok(allMissing.includes("public.match_officials.fixture_id"));
  assert.ok(allMissing.includes("public.appointments.institution_id"));
});

test("every local identity-link creator remains Development-only and forbidden in Production", () => {
  for (const version of ["202607300001", "202608030001", "202608110002"]) {
    const migration = migrationManifest.find((entry) => entry.version === version);
    assert.equal(migration.classification, "development_only");
    assert.equal(migration.productionAction, "NEVER_EXECUTE_IN_PRODUCTION");
  }
});

test("migration history classifies known and unknown versions without executing them", () => {
  const rows = classifyMigrationHistory([
    { version: "202607270000", name: "reflab_canonical_baseline" },
    { version: "999999999999", name: "unknown_remote_change" },
  ]);
  assert.equal(rows.find((entry) => entry.version === "202607270000").classification, "empty_database_only");
  assert.equal(rows.find((entry) => entry.version === "202607270000").status, "applied");
  assert.equal(rows.find((entry) => entry.version === "202607300001").status, "missing");
  assert.equal(rows.find((entry) => entry.version === "999999999999").classification, "unknown");
  assert.equal(rows.find((entry) => entry.version === "999999999999").gate, "BLOCKER_UNKNOWN_MIGRATION");
});

test("migration manifest covers every local migration and distinguishes adoption safety", () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const localVersions = readdirSync(resolve(repositoryRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, 12))
    .sort();
  assert.deepEqual(migrationManifest.map((entry) => entry.version).sort(), localVersions);
  assert.ok(migrationManifest.some((entry) => entry.classification === "legacy_historical_not_for_replay"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "empty_database_only"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "development_only"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "incremental_requires_adoption"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "production_adoption_bridge"));
  assert.ok(migrationManifest
    .filter((entry) => ["empty_database_only", "development_only"].includes(entry.classification))
    .every((entry) => entry.productionAction === "NEVER_EXECUTE_IN_PRODUCTION"));
  assert.ok(migrationManifest
    .filter((entry) => entry.classification === "incremental_requires_adoption")
    .every((entry) => entry.productionAction === "MANUAL_ADOPTION_AFTER_ALL_GATES"));
  assert.ok(migrationManifest
    .filter((entry) => entry.classification === "production_adoption_bridge")
    .every((entry) => entry.productionAction === "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE"));
});

test("an applied Development migration is a Production blocker", () => {
  const rows = classifyMigrationHistory([
    { version: "202607300001", name: "clerk_identity_links" },
  ]);
  assert.equal(
    rows.find((entry) => entry.version === "202607300001").gate,
    "BLOCKER_DEVELOPMENT_MIGRATION_IN_PRODUCTION"
  );
});

test("policy comparison is scoped by schema and table, not only by policy name", () => {
  const expected = canonicalObjectManifest.policies.find((entry) => entry.scope === "shared");
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["policy_inventory", [{ schema_name: "wrong_schema", table_name: "wrong_table", policy_name: expected.name }]],
  ]);
  const comparison = compareInventoryWithManifest(results);
  assert.ok(comparison.missingPolicies.includes(`${expected.schema}.${expected.table}.${expected.name}`));
});

test("Development RPCs are blockers only when executable by an application role", () => {
  const signature = MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION[0];
  const baseResults = new Map([
    ["catalog_gate", { tables: [], columns: [] }],
    ["function_inventory", [{ signature, security: "DEFINER", search_path: "search_path=pg_catalog" }]],
    ["routine_grants", []],
  ]);
  const nonExecutable = compareInventoryWithManifest(baseResults);
  assert.deepEqual(nonExecutable.developmentRpcInventory, [signature]);
  assert.deepEqual(nonExecutable.executableDevelopmentRpcs, []);

  baseResults.set("routine_grants", [{ signature, grantee: "service_role", privilege: "EXECUTE" }]);
  const executable = compareInventoryWithManifest(baseResults);
  assert.deepEqual(executable.executableDevelopmentRpcs, [signature]);
  assert.deepEqual(executable.forbiddenDevelopmentFunctions, [signature]);

  baseResults.set("routine_grants", [{ signature, grantee: "inherited_app_role", privilege: "EXECUTE" }]);
  baseResults.set("role_memberships", [{ effective_for: "authenticated", granted_role: "inherited_app_role" }]);
  assert.deepEqual(compareInventoryWithManifest(baseResults).executableDevelopmentRpcs, [signature]);
});

test("sanity counts never approve and extra historical objects remain inventory only", () => {
  const results = new Map([
    ["catalog_gate", { tables: ["public.historical_extra"], columns: [] }],
  ]);
  const comparison = compareInventoryWithManifest(results);
  assert.equal(comparison.sanity.approvalCriterion, false);
  assert.deepEqual(comparison.sanity.expected, canonicalObjectManifest.sanityCounts);
  assert.equal(comparison.approvalBasis, "OBJECT_BY_OBJECT");
  assert.ok(comparison.objectBlockers.length > 0);
  assert.equal(comparison.extraHistoricalObjects.disposition, "INVENTORY_ONLY_UNLESS_CONFLICTING");
  assert.deepEqual(comparison.extraHistoricalObjects.tables, ["public.historical_extra"]);
  assert.ok(comparison.missingTables.length > 0);
});

test("identity queries return only aggregates and never raw PII values", () => {
  const sql = buildIdentityQueries().map((query) => query.sql).join("\n");
  assert.doesNotMatch(sql, /json_build_object\([^)]*'external_subject'\s*,\s*l\.external_subject/i);
  assert.doesNotMatch(sql, /json_build_object\([^)]*'token'\s*,\s*t\.token/i);
  assert.doesNotMatch(sql, /\bemail\b|\bfirst_name\b|\blast_name\b|\bstorage_path\b/i);
});

const emptyManifestComparison = () => ({
  rlsContractDrift: [],
  policyContractDrift: [],
  missingPolicies: [],
  functionContractDrift: [],
  identityFallbackBlockers: [],
  missingSharedFunctions: [],
  missingRequiredProductionRpcs: [],
  executableDevelopmentRpcs: [],
  grantBlockers: [],
  missingBuckets: [],
  bucketContractDrift: [],
  objectBlockers: [],
});

const validSemanticResults = () => new Map([
  ["attempt_semantics", { official_orphans: 0, official_owner_mismatches: 0, invalid_communication_feedback: 0 }],
  ["exam_integrity", { results_without_session: 0, session_owner_mismatches: 0, session_submission_mismatches: 0 }],
  ["legacy_access", { user_roles: 0, automatic_default_global_roles: 0, automatic_default_subscriptions: 0, unknown_global_roles: 0 }],
  ["institution_catalog", { permissions: 27, system_roles: 10, system_relations: 87, forbidden_roles: 0 }],
  ["institution_tenant_integrity", { membership_role_mismatches: 0, group_membership_mismatches: 0, permission_override_mismatches: 0 }],
  ["matches_tenant_integrity", { institutional_appointments_without_active_membership: 0 }],
  ["fixture_creator_identity", { creator_refs: 1, user_subject_refs: 1, profile_backed_refs: 1, unresolved_profile_refs: 0 }],
  ["notification_integrity", { token_owner_conflicts: 0, events_without_profile: 0, preferences_without_profile: 0 }],
]);

test("a policy with the canonical name but USING true is a blocker", () => {
  const expected = canonicalObjectManifest.policies.find((entry) =>
    entry.scope === "shared" && entry.usingExpressionHash && entry.name === "clips_authenticated_read"
  );
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["policy_inventory", [{
      schema_name: expected.schema,
      table_name: expected.table,
      policy_name: expected.name,
      permissive: expected.mode,
      roles: expected.roles,
      cmd: expected.command,
      using_expression: "true",
      with_check_expression: null,
    }]],
  ]);
  assert.ok(compareInventoryWithManifest(results).policyContractDrift.some((entry) =>
    entry.policy === `${expected.schema}.${expected.table}.${expected.name}`
  ));
});

test("a sensitive canonical table with RLS disabled is a blocker", () => {
  const expected = canonicalObjectManifest.rls.find((entry) => entry.table === "public.attempts");
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["rls_inventory", [{ schema_name: "public", table_name: "attempts", rls_enabled: false, rls_forced: expected.forced }]],
  ]);
  assert.ok(compareInventoryWithManifest(results).rlsContractDrift.some((entry) => entry.code === "BLOCKER_RLS_DISABLED"));
});

test("an index with the canonical name but different columns or predicate is a blocker", () => {
  const expected = canonicalObjectManifest.explicitIndexes.find((entry) => entry.name === "attempts_canonical_training_submission_unique");
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["index_inventory", [{
      schema_name: "public",
      table_name: "attempts",
      index_name: expected.name,
      unique: true,
      columns: ["submission_id", "user_id"],
      predicate: "exam_result_id is not null",
      index_definition: `CREATE UNIQUE INDEX ${expected.name} ON public.attempts USING btree (submission_id, user_id) WHERE exam_result_id IS NOT NULL`,
    }]],
  ]);
  assert.ok(compareInventoryWithManifest(results).indexContractDrift.some((entry) => entry.index.endsWith(expected.name)));
});

test("a trigger with the canonical name but a different event is a blocker", () => {
  const expected = canonicalObjectManifest.triggers[0];
  const [schema, table] = expected.table.split(".");
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["trigger_inventory", [{
      schema_name: schema,
      table_name: table,
      trigger_name: expected.name,
      enabled_state: "O",
      function_executed: expected.function,
      timing_and_events: "BEFORE INSERT",
      orientation: "ROW",
      trigger_definition: `CREATE TRIGGER ${expected.name} BEFORE INSERT ON ${expected.table} FOR EACH ROW EXECUTE FUNCTION ${expected.function}`,
    }]],
  ]);
  assert.ok(compareInventoryWithManifest(results).triggerContractDrift.some((entry) => entry.trigger.endsWith(expected.name)));
});

test("legacy request_user_id fallback is an explicit blocker", () => {
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["p5_direct_identity_readers", [{ signature: "reflab_private.request_user_id()", external_subject_fallback: true }]],
  ]);
  assert.deepEqual(compareInventoryWithManifest(results).identityFallbackBlockers, [{
    code: "BLOCKER_LEGACY_IDENTITY_FALLBACK",
    signature: "reflab_private.request_user_id()",
  }]);
});

test("the exact baseline request_user_id boundary may return the JWT subject directly", () => {
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["p5_direct_identity_readers", [{
      signature: "reflab_private.request_user_id()",
      reads_sub_claim: true,
      references_identity_links: false,
      external_subject_fallback: false,
    }]],
  ]);
  assert.deepEqual(compareInventoryWithManifest(results).identityFallbackBlockers, []);
});

test("direct JWT identity reads outside request_user_id remain blockers", () => {
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["p5_direct_identity_readers", [{
      signature: "public.unsafe_identity_reader()",
      reads_sub_claim: true,
      references_identity_links: false,
      external_subject_fallback: false,
    }]],
  ]);
  assert.deepEqual(compareInventoryWithManifest(results).identityFallbackBlockers, [{
    code: "BLOCKER_DIRECT_EXTERNAL_IDENTITY_READ",
    signature: "public.unsafe_identity_reader()",
  }]);
});

test("user-prefixed canonical IDs are valid when backed by canonical profiles", () => {
  const results = validSemanticResults();
  results.set("identity_public_attempts_user_id", {
    total_non_null: 37,
    user_subject_ids: 37,
    profile_backed_ids: 37,
    unresolved_profile_refs: 0,
  });
  const gate = buildGateReport({
    results,
    migrationHistory: [],
    manifestComparison: emptyManifestComparison(),
    skipped: [],
  });
  assert.equal(gate.identityBlockers.length, 0);
  assert.equal(gate.overallGate, "PASS");
});

test("missing referee exam sessions remains a real object and semantic blocker", () => {
  const tables = canonicalObjectManifest.tables.filter((table) => table !== "public.referee_exam_sessions");
  const columns = Object.entries(canonicalObjectManifest.criticalColumns)
    .filter(([table]) => table !== "public.referee_exam_sessions")
    .flatMap(([table, names]) => names.map((name) => `${table}.${name}`));
  const comparison = compareInventoryWithManifest(new Map([
    ["catalog_gate", { tables, columns }],
  ]));
  assert.ok(comparison.missingTables.includes("public.referee_exam_sessions"));

  const conditional = buildConditionalInventory({ tables, columns }, []);
  assert.equal(
    conditional.skipped.find((entry) => entry.query === "exam_integrity")?.status,
    "BLOCKER_SKIPPED_MISSING_DEPENDENCY"
  );
});

test("unexpected authenticated UPDATE and PUBLIC EXECUTE are blockers", () => {
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["table_grants", [{ schema_name: "public", object_name: "attempts", grantee: "authenticated", privilege: "UPDATE" }]],
    ["routine_grants", [{ signature: REQUIRED_IN_PRODUCTION[0], grantee: "PUBLIC", privilege: "EXECUTE" }]],
    ["role_memberships", []],
  ]);
  const codes = compareInventoryWithManifest(results).grantBlockers.map((entry) => entry.code);
  assert.ok(codes.includes("BLOCKER_UNEXPECTED_BROWSER_DML"));
  assert.ok(codes.includes("BLOCKER_UNEXPECTED_ROUTINE_EXECUTE"));
  assert.ok(codes.includes("BLOCKER_SENSITIVE_RPC_EXECUTE"));
});

test("superuser and BYPASSRLS connection roles are blockers", () => {
  const results = new Map([
    ["connection_role_security", { rolname: "unsafe", rolsuper: true, rolcreatedb: false, rolcreaterole: false, rolbypassrls: true }],
    ["connection_effective_writes", { schemas_with_create: [], tables_with_dml: [], sequences_with_write: [] }],
  ]);
  const codes = connectionCredentialBlockers(results).map((entry) => entry.code);
  assert.ok(codes.includes("BLOCKER_CONNECTION_SUPERUSER"));
  assert.ok(codes.includes("BLOCKER_CONNECTION_BYPASSRLS"));
});

test("an auditor that owns a product table is rejected before semantic queries", () => {
  const results = new Map([
    ["connection_role_security", { rolname: "owner", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false }],
    ["connection_effective_writes", { schemas_with_create: [], tables_with_dml: [], sequences_with_write: [], tables_owned: ["public.attempts"] }],
  ]);
  assert.ok(connectionCredentialBlockers(results).some((entry) => entry.code === "BLOCKER_CONNECTION_TABLE_OWNER"));
});

test("the psql subprocess environment drops inherited PGOPTIONS and service configuration", () => {
  let spawnedEnvironment;
  executeReadOnlyBatch(buildSqlBatch([]), {
    PGHOST: "db.example.invalid",
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "readonly",
    PGPASSWORD: "secret",
    PGSSLMODE: "require",
  }, {
    processEnvironment: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PGOPTIONS: "-c default_transaction_read_only=off",
      PGSERVICE: "unsafe",
      PGSERVICEFILE: "unsafe.conf",
      PGPASSFILE: "unsafe.pgpass",
    },
    spawn(_command, _args, options) {
      spawnedEnvironment = options.env;
      return { status: 0, stdout: `${readOnlyGuardLine()}\n`, stderr: "" };
    },
  });
  assert.equal(spawnedEnvironment.PGOPTIONS, undefined);
  assert.equal(spawnedEnvironment.PGSERVICE, undefined);
  assert.equal(spawnedEnvironment.PGSERVICEFILE, undefined);
  assert.equal(spawnedEnvironment.PGPASSFILE, undefined);
  assert.equal(spawnedEnvironment.PGUSER, "readonly");
});

test("the report never emits function bodies", () => {
  const outputs = [
    [
      { query: READ_ONLY_GUARD_QUERY_ID, payload: "on" },
      { query: "catalog_gate", payload: { tables: [], columns: [] } },
      { query: "connection_role_security", payload: { rolname: "preflight_reader", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false } },
      { query: "connection_effective_writes", payload: { schemas_with_create: [], tables_with_dml: [], sequences_with_write: [], tables_owned: [] } },
      { query: "semantic_visibility", payload: [] },
      { query: "function_inventory", payload: [{ signature: "public.example()", source_definition: "secret function body" }] },
    ].map((entry) => resultFrameLine(entry.query, entry.payload)).join("\n"),
    readOnlyGuardLine(),
  ];
  let reportText = "";
  runProductionPreflight(productionEnvironment, {
    spawn() {
      return { status: 0, stdout: outputs.shift(), stderr: "" };
    },
    writeReport(value) {
      reportText = value;
    },
  });
  assert.doesNotMatch(reportText, /secret function body|source_definition/i);
});

test("a semantic mismatch makes the final gate BLOCKER", () => {
  const results = validSemanticResults();
  results.get("attempt_semantics").official_orphans = 1;
  const gate = buildGateReport({
    results,
    migrationHistory: [],
    manifestComparison: emptyManifestComparison(),
    skipped: [],
  });
  assert.equal(gate.overallGate, "BLOCKER");
  assert.ok(gate.integrityBlockers.some((entry) => entry.query === "attempt_semantics"));
});

test("a zero semantic payload cannot pass when RLS visibility was not proven", () => {
  const gate = buildGateReport({
    results: validSemanticResults(),
    migrationHistory: [],
    manifestComparison: emptyManifestComparison(),
    skipped: [{
      query: "attempt_semantics",
      status: "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN",
      blockedTables: ["public.attempts", "public.exam_results"],
    }],
  });
  assert.equal(gate.overallGate, "BLOCKER");
  assert.deepEqual(gate.integrityBlockers[0], {
    code: "BLOCKER_SEMANTIC_CHECK_SKIPPED",
    query: "attempt_semantics",
    reason: "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN",
    blockedTables: ["public.attempts", "public.exam_results"],
  });
});

test("an RLS-hidden Storage inventory is unknown, never falsely missing", () => {
  const manifestComparison = emptyManifestComparison();
  manifestComparison.missingBuckets = ["Videos", "institutional-content"];
  const gate = buildGateReport({
    results: validSemanticResults(),
    migrationHistory: [],
    manifestComparison,
    skipped: [{
      query: "storage_buckets",
      status: "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN",
      blockedTables: ["storage.buckets"],
    }],
  });
  assert.deepEqual(gate.storageBlockers, []);
  assert.ok(gate.integrityBlockers.some((entry) =>
    entry.query === "storage_buckets" && entry.reason === "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN"
  ));
  assert.equal(gate.overallGate, "BLOCKER");
});

test("a fully valid synthetic fixture produces overallGate PASS", () => {
  const gate = buildGateReport({
    results: validSemanticResults(),
    migrationHistory: [],
    manifestComparison: emptyManifestComparison(),
    skipped: [],
  });
  assert.equal(gate.overallGate, "PASS");
  for (const name of [
    "targetBlockers", "migrationBlockers", "identityBlockers", "rlsBlockers", "functionBlockers",
    "grantBlockers", "integrityBlockers", "storageBlockers", "objectBlockers",
  ]) assert.deepEqual(gate[name], []);
});

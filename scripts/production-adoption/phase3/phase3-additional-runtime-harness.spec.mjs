import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HARNESS_ROOT, TARGET, PINNED_ARTIFACTS, ADDITIONAL_MIGRATION_SHA, PRE_FORMAT, PRE_OPERATION, DDL_OPERATION,
  PRE_VARIABLES, DDL_VARIABLES, PRE_RUNNER, DDL_RUNNER, PRE_BEGIN, PRE_EXACT, POST_EXACT, hashBytes,
  verifyAdditionalHarnessArtifacts, additionalObservationSql, classifyAdditionalHarnessEvidence, serializeAdditionalHarness } from "./phase3-additional-runtime-pre-contract.mjs";
import { DDL_FORMAT, DDL_BEGIN, ZERO_ACCOUNTING, extractAdditionalDdlBody } from "./phase3-additional-runtime-ddl-contract.mjs";
import { attestAdditionalReadOnly, runProductionAdditionalPre, runAdditionalPreCli } from "./run-production-additional-runtime-service-role-pre.mjs";
import { executeAdditionalAtomic, runProductionAdditionalReconciliation, runAdditionalDdlCli } from "./run-production-additional-runtime-service-role-reconciliation.mjs";
import { ADDITIONAL_MIGRATION_PATH, additionalAccounting, ADDITIONAL_SERVICE_TABLES } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { ADDITIONAL_PRESERVATION_ID, additionalQueries } from "./phase3-additional-runtime-service-role-contract.mjs";
import { additionalFixtureEvidence } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";
import { maskSqlCommentsAndStrings, assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { RESULT_FRAME_PREFIX } from "../../production-preflight/queries.mjs";

const head = "b".repeat(40), password = 'a b"c\\d%:@/?&=single\'quote';
const url = `postgresql://postgres.nagjddldrldwavmfaytc:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const checkout = (path) => readFileSync(resolve(HARNESS_ROOT, path));
const committed = (path) => Buffer.from(checkout(path).toString().replaceAll("\r\n", "\n"));
const git = (args) => args[0] === "rev-parse" ? head : args[0] === "status" ? "" : committed(args[1].slice(41));
const bytes = committed(ADDITIONAL_MIGRATION_PATH), body = extractAdditionalDdlBody(bytes).body;
const environment = (ddl) => ddl ? Object.fromEntries(DDL_VARIABLES.map((key, i) => [key, i < 2 ? "true" : i === 2 ? TARGET.project : i === 3 ? head : i === 4 ? url : ADDITIONAL_MIGRATION_SHA]))
  : Object.fromEntries(PRE_VARIABLES.map((key, i) => [key, i < 3 ? "true" : i === 3 ? TARGET.project : i === 4 ? head : url]));
const deps = (ddl, createSession = () => { throw new Error("UNEXPECTED_CONNECTOR"); }) => ({ argument: ddl ? DDL_OPERATION : PRE_OPERATION,
  git, readCheckout: checkout, readRunnerBytes: () => committed(ddl ? DDL_RUNNER : PRE_RUNNER), createSession });
const evidence = (post, readOnly) => { const e = additionalFixtureEvidence(post); e.set("read_only_guard", readOnly ? "on" : "off"); return e; };
const frame = (e) => [...e].map(([query, payload]) => `${RESULT_FRAME_PREFIX}\t${query}\t${Buffer.from(JSON.stringify({ query, payload_row_count: 1, payload })).toString("base64")}`).join("\n");
function mockSession({ post = false, readOnly = false, failure, commitFailure = false } = {}) {
  let installed = post, closed = 0, rollbacks = 0; const calls = [];
  return { calls, query: async (sql) => {
    calls.push(sql); if (failure?.(sql)) throw new CorePolicySessionFailure("TIMEOUT");
    if (sql === body) installed = true;
    if (sql === "commit;" && commitFailure) throw new CorePolicySessionFailure("PSQL_SESSION_FAILED");
    return sql === additionalObservationSql() ? frame(evidence(installed, readOnly)) : "";
  }, rollback: async () => { rollbacks++; installed = post; }, close: async () => { closed++; },
    observe: () => evidence(installed, readOnly), get closed() { return closed; }, get rollbacks() { return rollbacks; } };
}
const closure = Object.keys(verifyAdditionalHarnessArtifacts(git, head, PRE_RUNNER, committed(PRE_RUNNER), checkout).artifactHashes);
test("approved HEAD bytes pin both runners and full static import closure", () => {
  assert.ok(closure.length > 70); assert.ok(closure.includes("package.json")); assert.ok(closure.includes("supabase/baseline/manifest.json"));
  for (const runner of [PRE_RUNNER, DDL_RUNNER]) assert.equal(verifyAdditionalHarnessArtifacts(git, head, runner, committed(runner), checkout).runnerArtifactExact, true);
});
for (const ddl of [false, true]) {
  const label = ddl ? "DDL" : "PRE", run = ddl ? runProductionAdditionalReconciliation : runProductionAdditionalPre;
  const variables = ddl ? DDL_VARIABLES : PRE_VARIABLES;
  const cases = {
    operation: (e, d) => { d.argument = "--wrong"; },
    wrongHead: (e) => { e[variables[ddl ? 3 : 4]] = "c".repeat(40); },
    malformedHead: (e, d) => { d.git = (a) => a[0] === "rev-parse" ? "not-a-head" : git(a); },
    dirty: (e, d) => { d.git = (a) => a[0] === "status" ? " M local" : git(a); },
    staged: (e, d) => { d.git = (a) => a[0] === "status" ? "M  local" : git(a); },
    untracked: (e, d) => { d.git = (a) => a[0] === "status" ? "?? local" : git(a); },
    runnerBytes: (e, d) => { d.readRunnerBytes = () => Buffer.from("drift"); },
    runnerEol: (e, d) => { d.readRunnerBytes = () => Buffer.from(committed(ddl ? DDL_RUNNER : PRE_RUNNER).toString().replaceAll("\n", "\r\n")); },
    runnerNotBuffer: (e, d) => { d.readRunnerBytes = () => "not-bytes"; },
    foreignDdl: (e) => { e.ALLOW_PRODUCTION_CORE_POLICY_64245_DDL = "false"; },
    oppositeAuthorization: (e) => { e[ddl ? "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT" : "ALLOW_PRODUCTION_DDL"] = "true"; },
    unknownProductionSecret: (e) => { e.REFLAB_PRODUCTION_OTHER_DB_URL = url; },
    wrongProject: (e) => { e[variables[ddl ? 2 : 3]] = "wrong"; },
    unsafeOutputBeforeConnection: (e) => { e[variables[ddl ? 4 : 5]] = url.replace(encodeURIComponent(password), "postgres"); },
  };
  for (const [name, mutate] of Object.entries(cases)) test(`${label} gate ${name}: zero connector/session calls`, async () => {
    let count = 0; const e = environment(ddl), d = deps(ddl, () => { count++; }); mutate(e, d);
    await assert.rejects(run(e, d)); assert.equal(count, 0);
  });
  for (const variable of variables.slice(0, ddl ? 2 : 3)) for (const value of [undefined, "false", "TRUE"]) test(`${label} ${variable}=${String(value)}: zero connection`, async () => {
    let count = 0; const e = environment(ddl); if (value === undefined) delete e[variable]; else e[variable] = value;
    await assert.rejects(run(e, deps(ddl, () => { count++; }))); assert.equal(count, 0);
  });
  for (const key of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGHOSTADDR", "pgpassword", "NODE_OPTIONS", "NODE_PATH", "NODE_TEST_NAME_PATTERN"])
    test(`${label} inherited ${key}: zero connection`, async () => {
      let count = 0; await assert.rejects(run({ ...environment(ddl), [key]: "synthetic" }, deps(ddl, () => { count++; }))); assert.equal(count, 0);
    });
  for (const path of closure) test(`${label} checkout closure drift ${path}: zero connection`, async () => {
    let count = 0; const d = deps(ddl, () => { count++; }); d.readCheckout = (p) => p === path ? Buffer.from("drift") : checkout(p);
    await assert.rejects(run(environment(ddl), d)); assert.equal(count, 0);
  });
  for (const path of Object.keys(PINNED_ARTIFACTS)) test(`${label} committed pin drift ${path}: zero connection`, async () => {
    let count = 0; const d = deps(ddl, () => { count++; }); d.git = (a) => a[0] === "show" && a[1].slice(41) === path ? Buffer.from("drift") : git(a);
    d.readCheckout = (p) => p === path ? Buffer.from("drift") : checkout(p);
    await assert.rejects(run(environment(ddl), d)); assert.equal(count, 0);
  });
  for (const [name, change] of Object.entries({ directHost: (u) => { u.hostname = "db.nagjddldrldwavmfaytc.supabase.co"; },
    pooler: (u) => { u.hostname = "aws-0-sa-east-1.pooler.supabase.com"; }, port: (u) => { u.port = "6543"; },
    database: (u) => { u.pathname = "/wrong"; }, installer: (u) => { u.username = "service_role"; }, project: (u) => { u.username = "postgres.wrong"; },
    ssl: (u) => { u.searchParams.set("sslmode", "disable"); }, hostOverride: (u) => { u.searchParams.set("host", "evil.invalid"); } }))
    test(`${label} target ${name}: zero connection`, async () => {
      let count = 0; const e = environment(ddl), u = new URL(url); change(u); e[variables[ddl ? 4 : 5]] = u.toString();
      await assert.rejects(run(e, deps(ddl, () => { count++; }))); assert.equal(count, 0);
    });
  test(`${label} exact gated target constructs precisely one session`, async () => {
    let count = 0; const s = mockSession({ readOnly: !ddl });
    const r = await run(environment(ddl), deps(ddl, (connection) => { count++; assert.equal(connection.PGHOST, TARGET.host); assert.equal(connection.PGPORT, "5432"); return s; }));
    assert.equal(count, 1); assert.equal(r.runnerArtifactExact, true); assert.equal(r.protectedArtifactsExact, true);
    assert.equal(r.classification, ddl ? "COMMITTED_POST_EXACT" : PRE_EXACT);
  });
}
test("wrong explicit DDL migration hash rejects before session", async () => {
  let count = 0; const e = environment(true); e[DDL_VARIABLES[5]] = "0".repeat(64);
  await assert.rejects(runProductionAdditionalReconciliation(e, deps(true, () => { count++; }))); assert.equal(count, 0);
});
test("observation has SELECT-only statements and no transaction composition", () => {
  assertReadOnlySql(additionalObservationSql());
  assert.doesNotMatch(maskSqlCommentsAndStrings(additionalObservationSql()), /\b(begin|commit|rollback|grant|revoke|notify|create|insert|update|delete)\b/i);
});
test("bounded PRE/DDL transaction configuration and exactly 57 target locks", () => {
  for (const [source, lock, statement] of [[PRE_BEGIN, "2s", "15s"], [DDL_BEGIN, "5s", "60s"]]) {
    for (const text of [`lock_timeout='${lock}'`, `statement_timeout='${statement}'`, "idle_in_transaction_session_timeout='15s'", "transaction_timeout='180s'"]) assert.ok(source.includes(text));
  }
  assert.equal((PRE_BEGIN.match(/begin read only/g) ?? []).length, 1);
  assert.ok(DDL_BEGIN.endsWith(`lock table ${ADDITIONAL_SERVICE_TABLES.map((t) => `public.${t}`).join(", ")} in access exclusive mode;`));
});
test("body is committed bytes minus only verified outer wrapper", () => {
  const r = extractAdditionalDdlBody(bytes); let independent = bytes.toString();
  for (const span of [...r.removed].reverse()) independent = independent.slice(0, span.start) + independent.slice(span.end);
  assert.equal(r.body, independent); assert.equal(r.sqlRevokeStatements, 57); assert.equal(r.sqlGrantStatements, 0);
  assert.equal(hashBytes(bytes), ADDITIONAL_MIGRATION_SHA);
});
for (const suffix of ["\n", "\ncommit;", "\n\\! injected"]) test(`artifact byte drift refuses ${JSON.stringify(suffix)}`, () => assert.throws(() => extractAdditionalDdlBody(Buffer.concat([bytes, Buffer.from(suffix)]))));
for (const post of [false, true]) test(`PRE ${post ? "POST" : "PRE"} recognized, ROLLBACK-only`, async () => {
  const s = mockSession({ readOnly: true }); const r = await attestAdditionalReadOnly(s, { observe: () => evidence(post, true) });
  assert.equal(r.classification, post ? POST_EXACT : PRE_EXACT); assert.equal(r.transaction, "ROLLBACK");
  assert.equal(r.mutationCount, 0); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.approval, "NOT_PERFORMED");
  assert.equal(s.rollbacks, 1); assert.equal(s.closed, 1); assert.doesNotMatch(s.calls.join("\n"), /commit;/);
});
for (const id of ["read_only_guard", ...additionalQueries.map((q) => q.id)]) test(`missing ${id} observation is UNKNOWN`, () => {
  const e = evidence(false, true); e.delete(id); const r = classifyAdditionalHarnessEvidence(e, true);
  assert.equal(r.classification, "UNKNOWN"); assert.equal(r.executablePre, false);
});
for (const readOnly of [false, true]) test(`incorrect ${readOnly ? "read" : "write"} guard fails closed`, () => assert.equal(classifyAdditionalHarnessEvidence(evidence(false, !readOnly), readOnly).classification, "BLOCKER"));
test("PRE database/timeout failure closes and never claims exact", async () => {
  const s = mockSession({ failure: () => true }); const r = await attestAdditionalReadOnly(s);
  assert.equal(r.classification, "UNKNOWN"); assert.equal(s.rollbacks, 1); assert.equal(s.closed, 1);
});
for (const which of ["rollback", "close"]) test(`PRE ${which} uncertainty returns UNKNOWN`, async () => {
  const s = mockSession({ readOnly: true }); s[which] = async () => { throw new Error("synthetic"); };
  assert.equal((await attestAdditionalReadOnly(s, { observe: () => evidence(false, true) })).classification, "UNKNOWN");
});
test("DDL PRE/body/POST once, preservation then acknowledged COMMIT", async () => {
  const s = mockSession(), r = await executeAdditionalAtomic(s, bytes, { observe: s.observe });
  assert.equal(r.classification, "COMMITTED_POST_EXACT"); assert.equal(r.commitOutcome, "ACKNOWLEDGED");
  assert.equal(s.calls.filter((sql) => sql === body).length, 1); assert.equal(r.migrationInvocationCount, 1);
  assert.equal(r.mutationAccounting.effectivePrivilegeEntryRevocations, 332); assert.equal(r.mutationAccounting.effectivePrivilegeEntryGrants, 0);
  assert.equal(r.mutationAccounting.unchangedCells, 124); assert.equal(r.mutationAccounting.sqlRevokeStatements, 57);
  for (const key of Object.keys(ZERO_ACCOUNTING).filter((k) => k.endsWith("Mutations") || k.endsWith("Dml"))) assert.equal(r.mutationAccounting[key], 0);
  assert.equal(r.automaticRetryAuthorized, false); assert.equal(s.rollbacks, 0); assert.equal(s.closed, 1);
});
test("installed POST invokes zero times and refuses reexecution", async () => {
  const s = mockSession({ post: true }), r = await executeAdditionalAtomic(s, bytes, { observe: s.observe });
  assert.equal(r.classification, POST_EXACT); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.migrationResult, "NOT_INVOKED");
  assert.equal(r.reexecution, "REFUSED"); assert.equal(s.calls.filter((sql) => sql === body).length, 0); assert.equal(s.rollbacks, 1);
});
for (const kind of ["BLOCKER", "UNKNOWN"]) test(`non-executable PRE ${kind} invokes zero times`, async () => {
  const s = mockSession(), r = await executeAdditionalAtomic(s, bytes, { observe: s.observe,
    classify: () => ({ classification: kind, executablePre: false, failedChecks: kind === "BLOCKER" ? ["drift"] : [], unknownChecks: kind === "UNKNOWN" ? ["missing"] : [] }) });
  assert.equal(r.migrationInvocationCount, 0); assert.equal(s.rollbacks, 1); assert.equal(s.calls.filter((sql) => sql === body).length, 0);
});
test("partial live state cannot cause repair-by-delta", async () => {
  const s = mockSession(), e = evidence(false, false); inventoryDrift(e);
  const r = await executeAdditionalAtomic(s, bytes, { observe: () => e }); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.classification, "BLOCKER");
});
function inventoryDrift(e) { e.get(SERVICE_FORENSIC_QUERY_ID).effectiveTablePrivileges.find((r) => r.table === "coach_runs" && r.privilege === "MAINTAIN").granted = false; }
for (const stage of ["BEFORE_PRE", "AFTER_PRE", "BEFORE_POST", "BEFORE_COMMIT"]) test(`failure ${stage} rolls back before commit`, async () => {
  const s = mockSession(), r = await executeAdditionalAtomic(s, bytes, { observe: s.observe, checkpoint: (name) => { if (name === stage) throw new CorePolicySessionFailure("TIMEOUT"); } });
  assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.rollbacks, 1); assert.equal(s.calls.includes("commit;"), false); assert.equal(r.automaticRetryAuthorized, false);
});
for (const sql of [DDL_BEGIN, body, additionalObservationSql()]) test(`failure during ${sql === body ? "body" : sql === DDL_BEGIN ? "BEGIN" : "observation"} rolls back`, async () => {
  const s = mockSession({ failure: (q) => q === sql }), r = await executeAdditionalAtomic(s, bytes);
  assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.rollbacks, 1); assert.equal(s.calls.includes("commit;"), false);
});
test("post preservation digest drift prevents commit despite exact ACLs", async () => {
  const s = mockSession(); let calls = 0;
  const r = await executeAdditionalAtomic(s, bytes, { observe: () => { const e = evidence(++calls === 2, false); if (calls === 2) e.set(ADDITIONAL_PRESERVATION_ID, "c".repeat(32)); return e; } });
  assert.equal(r.reason, "PROTECTED_CATALOG_CHANGED"); assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.calls.includes("commit;"), false);
});
test("ambiguous COMMIT never claims rollback or retries", async () => {
  const s = mockSession({ commitFailure: true }), r = await executeAdditionalAtomic(s, bytes, { observe: s.observe });
  assert.equal(r.classification, "UNKNOWN_COMMIT_OUTCOME"); assert.equal(r.transaction, "UNKNOWN"); assert.equal(r.commitOutcome, "UNKNOWN");
  assert.equal(r.automaticRetryAuthorized, false); assert.equal(r.readOnlyForensicRequired, true);
  assert.equal(r.onlyAllowedNextAction, "SEPARATELY_AUTHORIZED_READ_ONLY_POST_FORENSIC"); assert.equal(s.rollbacks, 0);
  assert.equal(s.calls.filter((q) => q === "commit;").length, 1); assert.equal(s.calls.filter((q) => q === body).length, 1);
});
for (const ddl of [false, true]) {
  const cli = ddl ? runAdditionalDdlCli : runAdditionalPreCli;
  test(`${ddl ? "DDL" : "PRE"} valid CLI output succeeds safely`, async () => {
    let output = ""; const s = mockSession({ readOnly: !ddl });
    const code = await cli(environment(ddl), { ...deps(ddl, () => s), write: (text) => { output += text; } });
    assert.equal(code, 0); assert.equal(JSON.parse(output).runnerArtifactExact, true); assert.doesNotMatch(output, /postgresql:\/\//);
  });
  for (const secret of [password, encodeURIComponent(password), url, JSON.stringify(password), { connection: { password, connectionString: url } }])
    test(`${ddl ? "DDL" : "PRE"} unsafe structured output fails closed ${typeof secret === "object" ? "object" : secret === url ? "URL" : secret === password ? "raw" : secret === encodeURIComponent(password) ? "encoded" : "JSON"}`, async () => {
      let output = ""; const result = ddl ? { format: DDL_FORMAT, classification: "BLOCKER", automaticRetryAuthorized: false, productionDdlAuthorized: false }
        : { format: PRE_FORMAT, classification: "BLOCKER", approval: "NOT_PERFORMED", mutationCount: 0, migrationInvocationCount: 0, automaticRetryAuthorized: false, productionDdlAuthorized: false };
      const code = await cli(environment(ddl), { run: async () => ({ ...result, unsafe: secret }), write: (text) => { output += text; } });
      assert.equal(code, 1); assert.doesNotMatch(output, /postgresql:\/\//); assert.equal(output.includes(password), false); assert.equal(output.includes(encodeURIComponent(password)), false);
      if (output) assert.equal(JSON.parse(output).classification, "BLOCKER");
    });
  test(`${ddl ? "DDL" : "PRE"} credential-bearing driver error never reaches output`, async () => {
    const s = mockSession(); s.query = async () => { throw new Error(`${url} ${password}`); };
    const r = ddl ? await executeAdditionalAtomic(s, bytes) : await attestAdditionalReadOnly(s);
    const text = serializeAdditionalHarness(r, environment(ddl), ddl); assert.equal(text.includes(password), false); assert.doesNotMatch(text, /postgresql:\/\//);
  });
}
test("no generic migration or 64253/Phase4 execution path", () => {
  for (const path of [PRE_RUNNER, DDL_RUNNER]) assert.doesNotMatch(checkout(path).toString(), /supabase db push|migration up|readdir|spawnSync|execFileSync/);
  assert.equal(additionalAccounting().statements.length, 57); assert.equal(additionalAccounting().granted.length, 0);
  assert.equal(ADDITIONAL_SERVICE_TABLES.includes("attempts"), false);
});

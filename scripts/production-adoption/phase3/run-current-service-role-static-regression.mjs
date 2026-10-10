import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const historical = "HISTORICAL_PROTECTED";
const groups = Object.freeze({
  HISTORICAL_PROTECTED: 2339,
  SERVICE_ROLE_FORENSIC: 182,
  SECURITY: 20,
  CURRENT_SERVICE_ROLE: 200,
});
const entries = (directory, classification, files, extension = "mjs") => files.map(([name, expectedCount]) => Object.freeze({
  path: `${directory}/${name}.test.${extension}`, expectedCount, classification,
}));

export const regressionInventory = Object.freeze([
  ...entries("scripts/production-adoption/bootstrap", historical, [
    ["phase1-entry-attestation", 28], ["phase1-exam-training-ddl", 32],
    ["phase1-exam-training-entry-attestation", 27], ["phase1-foundation-ddl", 29],
    ["phase1-psychology-notifications-ddl", 13], ["phase1-psychology-notifications-entry-attestation", 30],
    ["phase1-psychology-notifications-privileged-entry-attestation", 25], ["production-role-bootstrap", 20],
    ["psychology-module-reconciliation-evidence", 15], ["psychology-module-reconciliation-privileged-evidence", 26],
    ["psychology-module-slug-reconciliation-ddl", 12],
  ]),
  ...entries("scripts/production-adoption/phase0", historical, [["phase0-evidence", 15]]),
  ...entries("scripts/production-adoption/phase1", historical, [["phase1-bridge", 21]]),
  ...entries("scripts/production-adoption/phase2a", historical, [
    ["phase2a-semantic-audit-ddl", 16], ["phase2a-semantic-audit", 12], ["phase2a-semantic-snapshot-execution", 16],
  ]),
  ...entries("scripts/production-adoption/phase2b", historical, [
    ["phase2b-admin-canonical-access-post-ddl-forensic", 21], ["phase2b-admin-canonical-access-read-only-diagnostic", 44],
    ["phase2b-admin-canonical-access", 52], ["phase2b-canonical-communication-feedback-runner", 25],
    ["phase2b-canonical-communication-feedback", 38], ["phase2b-canonical-runtime-installed-pre-attestation", 45],
    ["phase2b-canonical-runtime-installed-runner", 41], ["phase2b-canonical-runtime-installed", 30],
    ["phase2b-canonical-runtime-prerequisites-read-only-diagnostic", 14], ["phase2b-canonical-runtime-prerequisites", 31],
    ["phase2b-canonical-training-attempts-post-ddl-forensic", 27], ["phase2b-canonical-training-attempts", 57],
    ["phase2b", 16], ["pre-phase2b-adoption-prerequisite", 43], ["pre-phase2b-read-only-diagnostic", 17],
  ]),
  ...entries("scripts/production-adoption/phase3", historical, [
    ["phase3-browser-privilege-baseline-forensic", 139], ["phase3-browser-privilege-ddl", 140],
    ["phase3-browser-privilege-pre-attestation", 166], ["phase3-browser-privilege", 91],
    ["phase3-core-policy-baseline-forensic", 49], ["phase3-core-policy-ddl-runner", 123],
    ["phase3-core-policy-pre-attestation", 71], ["phase3-core-policy-production-baseline", 107],
    ["phase3-core-policy", 98], ["phase3-identity-pre-input", 54],
    ["phase3-identity-security-bridge-pre-attestation", 62], ["phase3-identity-security-bridge-runner", 47],
    ["phase3-role-membership-forensic", 57], ["phase3-security", 23],
  ]),
  ...entries("scripts/production-adoption/phase4", historical, [
    ["phase4-structural", 10], ["phase4b-wave1", 37], ["phase4b-wave2", 10], ["phase4b-wave3", 13],
    ["phase4b-wave4", 14], ["phase4b-wave5", 30], ["pre-cutover-evidence", 21],
  ]),
  ...entries("scripts/production-preflight", historical, [["production-preflight", 68]]),
  ...entries("lib/matches", historical, [["canonicalMatches", 14]], "mts"),
  ...entries("lib/exams", historical, [["canonicalExam", 10], ["canonicalRulesExam", 11]], "mts"),
  ...entries("lib/identity", historical, [["canonicalIdentityFlow", 11], ["canonicalIdentityCleanup", 20]], "mts"),
  ...entries("lib", historical, [["supabaseKeys", 5]], "mts"),
  ...entries("scripts/production-adoption/phase3", "SERVICE_ROLE_FORENSIC", [["phase3-service-role-privilege-forensic", 182]]),
  ...entries("scripts/security", "SECURITY", [
    ["baseline-validation-target", 11], ["canonical-rls-owner", 5], ["isolated-supabase-target", 4],
  ]),
  ...entries("scripts/production-adoption/phase3", "CURRENT_SERVICE_ROLE", [["phase3-current-service-role", 200]]),
].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

export function validateInventory(inventory) {
  assert.equal(inventory.length, 64, "Expected exactly 64 unique test files");
  assert.equal(new Set(inventory.map((item) => item.path)).size, inventory.length, "Duplicate test file");
  assert.deepEqual(inventory, regressionInventory, "Missing, reclassified or changed inventory entry");
  for (const [classification, expected] of Object.entries(groups)) {
    assert.equal(inventory.filter((item) => item.classification === classification)
      .reduce((total, item) => total + item.expectedCount, 0), expected, `Expected ${classification} subtotal`);
  }
  assert.equal(inventory.reduce((total, item) => total + item.expectedCount, 0), 2741);
}

function discover(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? discover(path) : entry.isFile() && entry.name.endsWith(".test.mjs") ? [path] : [];
  });
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function parseTestSummary(output) {
  const result = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...output.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, "gm"))];
    assert.equal(matches.length, 1, `Missing or ambiguous TAP ${key} summary`);
    result[key] = Number(matches[0][1]);
  }
  assert.equal(result.tests, result.pass, "Incomplete passing test count");
  for (const key of ["fail", "cancelled", "skipped", "todo"]) assert.equal(result[key], 0, `Nonzero ${key}`);
  return result;
}

export function runCurrentServiceStaticRegression() {
  assert.equal(process.argv.length, 2, "No filters or additional command arguments are supported");
  validateInventory(regressionInventory);
  const discovered = ["scripts/production-adoption", "scripts/production-preflight", "scripts/security"].flatMap(discover).sort();
  const expected = regressionInventory.map((item) => item.path).filter((path) => path.startsWith("scripts/")).sort();
  assert.deepEqual(discovered, expected, "Discovered static test files differ from the complete explicit inventory");
  const initialHashes = new Map(regressionInventory.map((item) => {
    const bytes = readFileSync(resolve(root, item.path));
    assert.doesNotMatch(bytes.toString("utf8"), /\b(?:test|describe|it)\s*\.\s*only\s*\(/, `Exclusive test in ${item.path}`);
    return [item.path, sha256(bytes)];
  }));
  // Never pass inherited Production credentials, PostgreSQL targets or Node test filters to children.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:PG|ALLOW_PRODUCTION_|REFLAB_PRODUCTION_|NODE_OPTIONS$|NODE_TEST)/i.test(key)));
  const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
  emit({ format: "REFLAB_CURRENT_SERVICE_ROLE_COMPLETE_STATIC_REGRESSION_V1", stage: "INVENTORY_BEFORE_EXECUTION",
    scope: "LOCAL_STATIC_ONLY_NO_DATABASE_OR_PROVIDER_EXECUTION", expectedGroups: groups,
    uniqueTestFiles: 64, expectedUniqueTestCases: 2741,
    inventory: regressionInventory.map((item) => ({ ...item, actualCount: null })) });
  const results = [];
  for (const item of regressionInventory) {
    const flags = item.path.endsWith(".mts") ? ["--conditions=react-server", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"] : [];
    const child = spawnSync(process.execPath, [...flags, "--test", "--test-reporter=tap", item.path], {
      cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.ok(!child.error && !child.signal && child.status === 0, `Static suite failed: ${item.path}`);
    const summary = parseTestSummary(child.stdout);
    assert.equal(summary.tests, item.expectedCount, `Test count drift: ${item.path}`);
    assert.equal(sha256(readFileSync(resolve(root, item.path))), initialHashes.get(item.path), `Test source changed: ${item.path}`);
    const result = { ...item, actualCount: summary.tests, status: "PASS", ...summary };
    results.push(result);
    emit({ stage: "FILE_RESULT", ...result });
  }
  const actualGroups = Object.fromEntries(Object.entries(groups).map(([classification, expectedCount]) => {
    const actualCount = results.filter((item) => item.classification === classification)
      .reduce((total, item) => total + item.actualCount, 0);
    assert.equal(actualCount, expectedCount);
    return [classification, { expectedCount, actualCount, status: "PASS" }];
  }));
  const total = results.reduce((sum, item) => sum + item.actualCount, 0);
  assert.equal(total, 2741);
  const subtotal = (predicate) => results.filter(predicate).reduce((sum, item) => sum + item.actualCount, 0);
  const phase4 = subtotal((item) => item.path.startsWith("scripts/production-adoption/phase4/"));
  const compatibility = subtotal((item) => item.path.startsWith("lib/"));
  assert.equal(phase4, 135);
  assert.equal(compatibility, 71);
  emit({ stage: "COMPLETE", result: "PASS", groups: actualGroups, uniqueTestFiles: results.length,
    uniqueTestCases: total, logicalTotalTestsExecuted: total, aggregateTestReportingTotal: total,
    duplicateTestFileExecutions: 0, historicalProtectedFilesOmitted: 0, filteredPhase4Files: 0,
    filteredCompatibilityFiles: 0, failures: 0, skipped: 0, todo: 0, cancelled: 0, exclusiveTests: 0,
    phase4StaticTests: phase4, compatibilityTests: compatibility, phase4ProvidersExecuted: 0, databaseConnections: 0 });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    runCurrentServiceStaticRegression();
  } catch {
    process.stdout.write(`${JSON.stringify({ result: "BLOCKER", completeCoverageProven: false,
      message: "Local static regression inventory, execution or count validation failed. No database action is authorized." })}\n`);
    process.exitCode = 1;
  }
}

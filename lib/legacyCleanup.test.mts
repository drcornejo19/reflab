import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("Profile, Stats, and Mobile Dashboard consume canonical metrics only", () => {
  const pages = [
    "app/profile/page.tsx",
    "app/stats/page.tsx",
    "app/mobile-dashboard/page.tsx",
  ].map(read);

  for (const source of pages) {
    assert.match(source, /\/api\/performance\/summary/);
    assert.match(source, /\/api\/training\/usage/);
    assert.doesNotMatch(source, /useSupabase|\.from\(["'](?:attempts|exam_results|rules_exam_results)["']\)/);
    assert.doesNotMatch(source, /\.eq\(["']user_id["'],\s*user\.id\)/);
  }
});

test("modern exam and training limits use canonical record boundaries", () => {
  const videoExam = read("lib/exams/canonicalExam.ts");
  const rulesExam = read("lib/exams/canonicalRulesExam.ts");
  const training = read("lib/training/attempts.ts");

  for (const source of [videoExam, rulesExam]) {
    assert.match(source, /\.from\("exam_results"\)/);
    assert.doesNotMatch(source, /rules_exam_results/);
  }
  assert.match(
    training,
    /\.eq\("activity_type",\s*"video_training"\)\s*\.is\("exam_result_id",\s*null\)/
  );
});

test("scheduled weak-topic analysis accepts only attempts linked to official results", () => {
  const source = read("app/api/notifications/scheduled/route.ts");
  const weakTopic = source.slice(
    source.indexOf("async function getWeakTopic"),
    source.indexOf("async function getTrainingStreakDays")
  );

  assert.match(weakTopic, /exam_results!inner\(id,user_id\)/);
  assert.match(weakTopic, /\.eq\("exam_results\.user_id",\s*userId\)/);
  assert.match(weakTopic, /\.not\("exam_result_id",\s*"is",\s*null\)/);
});

test("admin GET routes use canonical read authorization without provisioning", () => {
  const routes = [
    "app/api/admin/radar-audit/route.ts",
    "app/api/admin/psychology/route.ts",
    "app/api/admin/library/route.ts",
    "app/api/admin/institutional-leads/route.ts",
    "app/api/admin/institutional-clips/route.ts",
  ];

  for (const file of routes) {
    const source = read(file);
    const start = source.indexOf("export async function GET");
    const getHandler = source.slice(start, nextHandlerIndex(source, start + 1));
    assert.match(getHandler, /requireSuperAdminReadAccess\(\)/);
    assert.doesNotMatch(getHandler, /requireSuperAdminAccess\(\)/);
  }

  const authorization = read("lib/adminAuthorization.ts");
  assert.match(
    authorization,
    /loadAccessSnapshot\(supabase, userId, \{\s*provisionMissing: false,?\s*\}\)/
  );
});

test("profile PATCH cannot provision legacy access records", () => {
  const route = read("app/api/profile/route.ts");
  const helper = read("lib/profile/getProfile.ts");
  const records = read("lib/reflabUserRecords.ts");

  assert.match(route, /createProfilePatchResponse/);
  assert.match(helper, /updateProfilePayload/);
  assert.match(helper, /provisionMissing: false/);
  assert.match(helper, /\.from\("user_profiles"\)\s*\.update\(/);
  assert.doesNotMatch(
    `${route}\n${helper}\n${records}`,
    /ensureUserRecords|upsertUserRole|upsertUserProfile|\.from\("user_roles"\)|automatic_default/
  );
});

test("dead persistence helpers are removed and legacy reads stay explicitly scoped", () => {
  assert.equal(fs.existsSync(path.join(root, "lib/attemptPersistence.ts")), false);
  assert.equal(
    fs.existsSync(path.join(root, "lib/coach/development-snapshot.ts")),
    false
  );

  const runtimeFiles = collectFiles(["app", "components", "lib"]);
  const rulesConsumers = runtimeFiles.filter((file) =>
    fs.readFileSync(file, "utf8").includes("rules_exam_results")
  );
  assert.deepEqual(
    rulesConsumers.map((file) => path.relative(root, file).replaceAll("\\", "/")),
    [
      "app/admin/radar-audit/page.tsx",
      "app/api/admin/radar-audit/route.ts",
    ]
  );

  const legacyRoleConsumers = runtimeFiles.filter((file) =>
    fs.readFileSync(file, "utf8").includes("user_roles")
  );
  assert.deepEqual(
    legacyRoleConsumers.map((file) => path.relative(root, file).replaceAll("\\", "/")),
    []
  );
});

function nextHandlerIndex(source: string, start: number) {
  const next = source.indexOf("export async function ", start);
  return next === -1 ? source.length : next;
}

function collectFiles(directories: string[]) {
  const files: string[] = [];
  for (const directory of directories) {
    walk(path.join(root, directory), files);
  }
  return files.sort();
}

function walk(directory: string, files: string[]) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
      files.push(absolute);
    }
  }
}

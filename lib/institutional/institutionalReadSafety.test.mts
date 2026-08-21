import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

const institutionalGetRoutes = [
  "app/api/institution/assessments/route.ts",
  "app/api/institution/contents/route.ts",
  "app/api/institution/context/route.ts",
  "app/api/institution/demo/route.ts",
  "app/api/institution/directory/route.ts",
  "app/api/institution/learning/route.ts",
  "app/api/institution/learning/sessions/[sessionId]/route.ts",
  "app/api/institution/metrics/route.ts",
  "app/api/institution/notifications/route.ts",
  "app/api/institution/overview/route.ts",
  "app/api/institution/reports/route.ts",
  "app/api/institution/reports/export/route.ts",
  "app/api/institution/videos/route.ts",
] as const;

const mutationPattern =
  /\.(?:insert|update|upsert|delete)\s*\(|reconcilePendingMemberships|ensureUserRecords|clerkClient\s*\(/;

async function readRepositoryFile(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

function extractExportedGet(source: string) {
  const start = source.indexOf("export async function GET");
  assert.notEqual(start, -1, "route must export GET");

  const remainder = source.slice(start + 1);
  const nextHandler = remainder.search(
    /\nexport async function (?:POST|PUT|PATCH|DELETE)\b/
  );

  return nextHandler === -1
    ? source.slice(start)
    : source.slice(start, start + 1 + nextHandler);
}

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test("all 13 institutional GET handlers are free of direct writes and reconciliation", async () => {
  assert.equal(institutionalGetRoutes.length, 13);

  for (const relativePath of institutionalGetRoutes) {
    const getHandler = extractExportedGet(await readRepositoryFile(relativePath));
    assert.doesNotMatch(getHandler, mutationPattern, relativePath);
  }
});

test("the common institutional access loader is read-only and canonical", async () => {
  const source = await readRepositoryFile("lib/institutional/server.ts");
  const start = source.indexOf("async function loadInstitutionAccess");
  const end = source.indexOf("function normalizeMembership", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const loader = source.slice(start, end);

  assert.doesNotMatch(loader, mutationPattern);
  assert.doesNotMatch(loader, /user_profiles/);
  assert.doesNotMatch(loader, /user_roles/);
  assert.doesNotMatch(loader, /video_admin/);
  assert.doesNotMatch(loader, /automatic_default/);
  assert.match(loader, /\.from\("user_global_roles"\)/);
  assert.match(loader, /\.eq\("user_id", userId\)/);
  assert.match(loader, /isCanonicalInstitutionSuperAdmin/);
});

test("the authenticated root layout cannot trigger institutional reconciliation", async () => {
  const [layout, provider, server] = await Promise.all([
    readRepositoryFile("app/layout.tsx"),
    readRepositoryFile("components/institutional/InstitutionProvider.tsx"),
    readRepositoryFile("lib/institutional/server.ts"),
  ]);

  assert.match(layout, /InstitutionProvider/);
  assert.match(provider, /fetch\("\/api\/institution\/context"/);
  assert.doesNotMatch(provider, mutationPattern);
  assert.doesNotMatch(server, /reconcilePendingMemberships/);
});

test("institutional code has no legacy user_roles or automatic reconciliation", async () => {
  const roots = [
    path.join(repositoryRoot, "app/api/institution"),
    path.join(repositoryRoot, "lib/institutional"),
    path.join(repositoryRoot, "components/institutional"),
  ];
  const files = (
    await Promise.all(roots.map((root) => collectTypeScriptFiles(root)))
  ).flat();

  for (const file of files) {
    if (file.endsWith(".test.mts")) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /["']user_roles["']/, file);
    assert.doesNotMatch(source, /reconcilePendingMemberships/, file);
  }
});

test("existing Clerk invitees are persisted only after canonical resolution", async () => {
  const source = await readRepositoryFile(
    "lib/institutional/directory-server.ts"
  );
  const start = source.indexOf("export async function inviteInstitutionMember");
  const end = source.indexOf("export async function updateInstitutionMember", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const inviteFlow = source.slice(start, end);

  assert.match(inviteFlow, /resolveInstitutionalInviteeIdentity/);
  assert.match(inviteFlow, /identity\.kind === "linked"/);
  assert.match(inviteFlow, /userId = identity\.userId/);
  assert.match(inviteFlow, /userId = `invitation:\$\{crypto\.randomUUID\(\)\}`/);
  assert.doesNotMatch(inviteFlow, /userId = existingUser\.id/);
  assert.doesNotMatch(inviteFlow, /user_id: existingUser\.id/);
  assert.doesNotMatch(inviteFlow, /\.from\("user_profiles"\)/);
});

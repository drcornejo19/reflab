import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationPath = path.join(
  repositoryRoot,
  "supabase/migrations/202608240001_canonical_institution_catalog_alignment.sql"
);

const expectedPermissions = [
  "institution.read",
  "institution.manage",
  "members.read",
  "members.manage",
  "members.invite",
  "roles.read",
  "roles.manage",
  "groups.read",
  "groups.manage",
  "content.read",
  "content.manage",
  "content.publish",
  "assessments.read",
  "assessments.take",
  "assessments.manage",
  "assessments.grade",
  "metrics.read_own",
  "metrics.read_individual",
  "metrics.read_aggregate",
  "reports.read",
  "reports.export",
  "notifications.read",
  "notifications.send",
  "matches.read",
  "matches.manage",
  "audit.read",
  "demo.switch",
] as const;

const expectedRoles = [
  "institution_admin",
  "technical_coordinator",
  "instructor",
  "evaluator",
  "content_manager",
  "student",
  "referee",
  "invited_referee",
  "observer",
  "read_only",
] as const;

const expectedMatrix = {
  institution_admin: expectedPermissions,
  technical_coordinator: [
    "institution.read",
    "members.read",
    "groups.read",
    "groups.manage",
    "content.read",
    "content.manage",
    "assessments.read",
    "assessments.manage",
    "assessments.grade",
    "metrics.read_individual",
    "metrics.read_aggregate",
    "reports.read",
    "notifications.read",
    "notifications.send",
    "matches.read",
    "matches.manage",
  ],
  instructor: [
    "institution.read",
    "members.read",
    "groups.read",
    "content.read",
    "content.manage",
    "assessments.read",
    "assessments.manage",
    "assessments.grade",
    "metrics.read_individual",
    "notifications.read",
  ],
  evaluator: [
    "institution.read",
    "groups.read",
    "assessments.read",
    "assessments.grade",
    "metrics.read_individual",
  ],
  content_manager: [
    "institution.read",
    "content.read",
    "content.manage",
    "content.publish",
  ],
  student: [
    "institution.read",
    "content.read",
    "assessments.read",
    "assessments.take",
    "metrics.read_own",
    "notifications.read",
  ],
  referee: [
    "institution.read",
    "content.read",
    "assessments.read",
    "assessments.take",
    "metrics.read_own",
    "notifications.read",
    "matches.read",
  ],
  invited_referee: [
    "institution.read",
    "content.read",
    "assessments.read",
    "assessments.take",
  ],
  observer: [
    "institution.read",
    "groups.read",
    "metrics.read_aggregate",
    "reports.read",
  ],
  read_only: [
    "institution.read",
    "content.read",
    "assessments.read",
    "notifications.read",
  ],
};

function sorted(values: readonly string[]) {
  return [...values].sort();
}

function extractStrings(source: string) {
  return [...source.matchAll(/"([a-z_]+(?:\.[a-z_]+)*)"/g)].map(
    (match) => match[1]
  );
}

function extractConstArray(source: string, name: string) {
  const match = source.match(
    new RegExp(`(?:export )?const ${name} = \\[([\\s\\S]*?)\\] as const`)
  );
  assert.ok(match, `${name} must be declared as a const array`);
  return extractStrings(match[1]);
}

function extractRolePermissions(source: string, role: string) {
  if (role === "institution_admin") return [...expectedPermissions];
  if (role === "technical_coordinator") {
    return extractConstArray(source, "coordinatorPermissions");
  }
  const match = source.match(
    new RegExp(`\\n  ${role}: \\[([\\s\\S]*?)\\n  \\],`)
  );
  assert.ok(match, `${role} must have an explicit permission array`);
  return extractStrings(match[1]);
}

async function readCatalogSources() {
  const [types, permissions] = await Promise.all([
    readFile(path.join(repositoryRoot, "lib/institutional/types.ts"), "utf8"),
    readFile(
      path.join(repositoryRoot, "lib/institutional/permissions.ts"),
      "utf8"
    ),
  ]);
  return { types, permissions };
}

test("runtime exposes exactly the canonical institution catalog", async () => {
  const { types, permissions } = await readCatalogSources();
  const runtimePermissions = extractConstArray(types, "institutionPermissionKeys");
  const runtimeRoles = extractConstArray(types, "institutionRoleKeys");

  assert.deepEqual(runtimePermissions, expectedPermissions);
  assert.deepEqual(runtimeRoles, expectedRoles);
  assert.equal(runtimePermissions.length, 27);
  assert.equal(runtimeRoles.length, 10);
  assert.equal(
    expectedRoles.reduce(
      (total, role) => total + extractRolePermissions(permissions, role).length,
      0
    ),
    87
  );
});

test("runtime role permissions match the canonical matrix exactly", async () => {
  const { permissions } = await readCatalogSources();
  for (const role of expectedRoles) {
    assert.deepEqual(
      sorted(extractRolePermissions(permissions, role)),
      sorted(expectedMatrix[role]),
      role
    );
  }

  assert.equal(
    extractRolePermissions(permissions, "referee").includes("matches.read"),
    true
  );
  assert.equal(
    extractRolePermissions(permissions, "referee").includes("matches.manage"),
    false
  );
  assert.equal(
    extractRolePermissions(permissions, "technical_coordinator").includes("matches.manage"),
    true
  );
  assert.deepEqual(
    expectedRoles.filter((role) =>
      extractRolePermissions(permissions, role).includes("demo.switch")
    ),
    ["institution_admin"]
  );
});

test("deferred and legacy catalog entries are absent", async () => {
  const { types } = await readCatalogSources();
  const runtimePermissions = extractConstArray(types, "institutionPermissionKeys");
  const runtimeRoles = extractConstArray(types, "institutionRoleKeys");
  const deferredPermissions = [
    "courses.read",
    "courses.manage",
    "attendance.read",
    "attendance.manage",
    "psychology.compliance.read",
    "psychology.detail.read",
    "performance.summary.read",
    "performance.detail.read",
    "privacy.consents.read",
    "licenses.read",
    "licenses.manage",
  ];
  const forbiddenRoles = [
    "physical_trainer",
    "institution_psychologist",
    "super_admin",
    "video_admin",
    "institutional_instructor",
    "institutional_student",
    "individual_referee",
  ];

  for (const permission of deferredPermissions) {
    assert.equal(runtimePermissions.includes(permission), false);
  }
  for (const role of forbiddenRoles) {
    assert.equal(runtimeRoles.includes(role), false);
  }
});

test("migration is data-only and targets only the approved catalog delta", async () => {
  const source = await readFile(migrationPath, "utf8");

  assert.match(source, /\('matches\.read'/);
  assert.match(source, /\('matches\.manage'/);
  assert.match(source, /\('demo\.switch'/);
  assert.match(source, /permission_count <> 27/);
  assert.match(source, /system_role_count <> 10/);
  assert.match(source, /system_relation_count <> 87/);
  assert.match(
    source,
    /role\.role_key = 'instructor'[\s\S]*?'roles\.read'[\s\S]*?'metrics\.read_aggregate'[\s\S]*?'reports\.read'/
  );
  assert.doesNotMatch(
    source,
    /institution_memberships|institution_membership_permission_overrides|user_global_roles|user_roles|automatic_default/
  );
  assert.doesNotMatch(
    source,
    /create\s+(?:table|function|policy|index|trigger)|alter\s+table|grant\s|revoke\s/i
  );
});

test("Matches and directory consume the aligned canonical catalog", async () => {
  const [matches, directory] = await Promise.all([
    readFile(path.join(repositoryRoot, "lib/matches/canonicalActor.ts"), "utf8"),
    readFile(
      path.join(repositoryRoot, "lib/institutional/directory-server.ts"),
      "utf8"
    ),
  ]);

  assert.match(matches, /permissionKeys\.includes\("matches\.read"\)/);
  assert.match(matches, /permissionKeys\.includes\("matches\.manage"\)/);
  assert.match(directory, /isInstitutionRoleKey\(row\.role_key\)/);
  assert.match(directory, /\.from\("institution_roles"\)/);
  assert.doesNotMatch(matches, /user_roles|video_admin/);
});

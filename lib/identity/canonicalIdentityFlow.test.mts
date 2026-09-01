import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CanonicalDataEnvironmentConfigurationError,
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_PROJECT_REF,
  ProductionCanonicalIdentityUnavailableError,
  assertCanonicalIdentityEnvironmentAtStartup,
  validateCanonicalDataEnvironment,
} from "./developmentIdentityEnvironment.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const profileRouteSource = read("app/api/profile/route.ts");
const avatarRouteSource = read("app/api/profile/avatar/route.ts");
const adminUsersRouteSource = read("app/api/admin/users/route.ts");
const adminUsersWriteSource = read("lib/admin/usersWrite.ts");
const adminAuthorizationSource = read("lib/adminAuthorization.ts");
const userRecordsSource = read("lib/reflabUserRecords.ts");
const profileReaderSource = read("lib/profile/getProfile.ts");
const profileReadHelperSource = profileReaderSource.slice(
  profileReaderSource.indexOf("export async function getProfilePayload"),
  profileReaderSource.indexOf("export async function updateProfilePayload")
);
const profilePatchHelperSource = profileReaderSource.slice(
  profileReaderSource.indexOf("export async function updateProfilePayload"),
  profileReaderSource.indexOf("export async function createProfileGetResponse")
);
const avatarUploadSource = read("lib/profile/avatarUpload.ts");
const instrumentationSource = read("instrumentation.ts");
const accessServerSource = read("lib/access/server.ts");
const profileGetSource = profileRouteSource.slice(
  profileRouteSource.indexOf("export async function GET"),
  profileRouteSource.indexOf("export async function PATCH")
);
const profilePatchSource = profileRouteSource.slice(
  profileRouteSource.indexOf("export async function PATCH")
);

function read(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function developmentEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    APP_ENV: "development",
    CLERK_ENV: "development",
    NODE_ENV: "development",
    REFLAB_DATA_ENV: "development",
    SUPABASE_ENV: "development",
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
    ...overrides,
  };
}

function productionEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    REFLAB_DATA_ENV: "production",
    SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
    VERCEL_ENV: "production",
    ...overrides,
  };
}

test("Development identity resolution is mandatory even when the linker endpoint is disabled", () => {
  const policy = assertCanonicalIdentityEnvironmentAtStartup(
    developmentEnvironment()
  );
  assert.equal(policy.dataEnvironment, "development");
  assert.equal(policy.deploymentEnvironment, "local");
  assert.equal(policy.projectRef, DEVELOPMENT_SUPABASE_PROJECT_REF);
});

test("NODE_ENV, APP_ENV, and the linker flag do not select the data identity policy", () => {
  const cases: Array<Partial<NodeJS.ProcessEnv>> = [
    { NODE_ENV: "production" },
    { APP_ENV: "production" },
    { ENABLE_DEVELOPMENT_IDENTITY_LINKER: "true" },
  ];

  for (const overrides of cases) {
    const policy = assertCanonicalIdentityEnvironmentAtStartup(
      developmentEnvironment(overrides)
    );
    assert.equal(policy.dataEnvironment, "development");
  }
});

test("Vercel Preview can use the exact Development data target", () => {
  const policy = assertCanonicalIdentityEnvironmentAtStartup(
    developmentEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    })
  );
  assert.equal(policy.dataEnvironment, "development");
  assert.equal(policy.deploymentEnvironment, "preview");
});

test("missing, unknown, contradictory, and cross-environment targets fail closed", () => {
  const invalidEnvironments = [
    developmentEnvironment({ REFLAB_DATA_ENV: undefined }),
    developmentEnvironment({ REFLAB_DATA_ENV: "staging" }),
    developmentEnvironment({ SUPABASE_PROJECT_REF: "unknown-project" }),
    developmentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL:
        `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
    }),
    productionEnvironment({ VERCEL_ENV: "preview" }),
    developmentEnvironment({ VERCEL_ENV: "production" }),
  ];

  for (const environment of invalidEnvironments) {
    assert.throws(
      () => assertCanonicalIdentityEnvironmentAtStartup(environment),
      CanonicalDataEnvironmentConfigurationError
    );
  }
});

test("configuration errors never expose refs, URLs, or credentials", () => {
  const sensitiveUrl = "https://user:secret@unknown-project.supabase.co";

  assert.throws(
    () =>
      assertCanonicalIdentityEnvironmentAtStartup(
        developmentEnvironment({
          SUPABASE_PROJECT_REF: "unknown-project",
          NEXT_PUBLIC_SUPABASE_URL: sensitiveUrl,
        })
      ),
    (error: unknown) => {
      assert.ok(error instanceof CanonicalDataEnvironmentConfigurationError);
      assert.doesNotMatch(error.message, /unknown-project|secret|https?:/i);
      return true;
    }
  );
});

test("Production target validation is exact but Production identity remains blocked", () => {
  const policy = validateCanonicalDataEnvironment(productionEnvironment());
  assert.equal(policy.dataEnvironment, "production");
  assert.equal(policy.deploymentEnvironment, "production");
  assert.equal(policy.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);

  assert.throws(
    () => assertCanonicalIdentityEnvironmentAtStartup(productionEnvironment()),
    ProductionCanonicalIdentityUnavailableError
  );
});

test("profile GET is read-only and PATCH updates only an existing canonical profile", () => {
  assert.match(profileGetSource, /getProfilePayload\(/);
  assert.doesNotMatch(profileGetSource, /ensureUserRecords/);
  assert.doesNotMatch(
    profileGetSource,
    /\.(?:insert|upsert|update|delete)\s*\(/
  );
  assert.match(profileGetSource, /createProfileGetResponse/);

  assert.match(profileReadHelperSource, /loadAccessSnapshot\([\s\S]*?provisionMissing:\s*false/);
  assert.match(profileReadHelperSource, /\.from\("user_profiles"\)/);
  assert.match(profileReadHelperSource, /\.eq\("user_id", access\.userId\)/);
  assert.doesNotMatch(profileReadHelperSource, /\.from\("user_roles"\)/);
  assert.doesNotMatch(
    profileReadHelperSource,
    /\.(?:insert|upsert|update|delete)\s*\(/
  );
  assert.match(profileReaderSource, /sanitizeProfileGetError/);
  assert.match(profileReaderSource, /status:\s*409/);

  assert.match(profilePatchSource, /createProfilePatchResponse/);
  assert.match(profilePatchSource, /updateProfilePayload/);
  assert.match(profilePatchHelperSource, /provisionMissing:\s*false/);
  assert.match(profilePatchHelperSource, /\.from\("user_profiles"\)[\s\S]*?\.update\(/);
  assert.doesNotMatch(
    `${profilePatchSource}\n${profilePatchHelperSource}`,
    /ensureUserRecords|user_roles|user_subscriptions|user_global_roles|automatic_default|\.insert\(|\.upsert\(/
  );
  assert.match(avatarRouteSource, /uploadCanonicalAvatar\(/);
  assert.doesNotMatch(avatarRouteSource, /ensureUserRecords|user_roles/);
  assert.match(
    avatarUploadSource,
    /loadAccessSnapshot\([\s\S]*?provisionMissing:\s*false/
  );
  assert.match(avatarUploadSource, /\.from\("user_profiles"\)/);
  assert.doesNotMatch(avatarUploadSource, /ensureUserRecords|user_roles/);
});

test("administration resolves canonical identity without provisioning", () => {
  assert.match(adminUsersRouteSource, /requireSuperAdminReadAccess/);
  assert.match(adminUsersRouteSource, /applyCanonicalAdminUserMutation/);
  assert.doesNotMatch(
    adminUsersRouteSource,
    /ensureUserRecords|clerkClient|resolveCanonicalAccessUserId/
  );
  assert.match(
    adminUsersWriteSource,
    /loadCanonicalAccessSnapshot[\s\S]*?provisionMissing:\s*false/
  );
  assert.doesNotMatch(
    adminUsersWriteSource,
    /ensureUserRecords|user_roles|automatic_default/
  );
  assert.match(
    adminAuthorizationSource,
    /authorizeCanonicalAdminUsersRead\(supabase, userId\)/
  );
  assert.doesNotMatch(
    adminAuthorizationSource,
    /\.from\("user_global_roles"\)[\s\S]*?\.eq\("user_id", userId\)/
  );
});

test("legacy profile provisioning helpers are removed", () => {
  assert.doesNotMatch(userRecordsSource, /ensureUserRecords|upsertUserRole|upsertUserProfile|user_roles/);
  assert.doesNotMatch(userRecordsSource, /\.eq\("user_id", clerkUser\.id\)/);
  assert.doesNotMatch(userRecordsSource, /user_id:\s*clerkUser\.id/);
});

test("startup and request-time identity use the same canonical data policy", () => {
  assert.match(instrumentationSource, /NEXT_RUNTIME !== "nodejs"/);
  assert.match(
    instrumentationSource,
    /assertCanonicalIdentityEnvironmentAtStartup\(process\.env\)/
  );
  assert.match(instrumentationSource, /developmentIdentityEnvironment/);
  assert.doesNotMatch(instrumentationSource, /developmentLinker/);
  assert.match(accessServerSource, /requireCanonicalIdentityPolicy\(environment\)/);
  assert.doesNotMatch(accessServerSource, /return externalUserId/);
  assert.doesNotMatch(accessServerSource, /automatic_default|user_roles/);
});

test("the canonical data policy covers every modern identity caller", () => {
  const callers = [
    "lib/profile/getProfile.ts",
    "lib/adminAuthorization.ts",
    "lib/training/attempts.ts",
    "lib/exams/canonicalExam.ts",
    "lib/exams/canonicalRulesExam.ts",
    "lib/coach/security.ts",
    "lib/performance/canonicalSummary.ts",
    "lib/ranking/canonicalRanking.ts",
    "lib/matches/access.ts",
    "app/api/psychology/route.ts",
    "app/api/notifications/preferences/route.ts",
    "lib/institutional/institutionalIdentity.ts",
  ];

  for (const caller of callers) {
    assert.match(
      read(caller),
      /loadAccessSnapshot|requireCanonicalRequestIdentity|resolveCanonicalAccessUserId/
    );
  }
});

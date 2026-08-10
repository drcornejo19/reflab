import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  DevelopmentIdentityLinkerConfigurationError,
  assertCanonicalIdentityEnvironmentAtStartup,
} from "./developmentLinker.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const profileRouteSource = read("app/api/profile/route.ts");
const avatarRouteSource = read("app/api/profile/avatar/route.ts");
const adminUsersRouteSource = read("app/api/admin/users/route.ts");
const adminAuthorizationSource = read("lib/adminAuthorization.ts");
const userRecordsSource = read("lib/reflabUserRecords.ts");
const instrumentationSource = read("instrumentation.ts");

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
    SUPABASE_ENV: "development",
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
    ...overrides,
  };
}

test("Development identity resolution is mandatory even when the linker endpoint is disabled", () => {
  assert.equal(
    assertCanonicalIdentityEnvironmentAtStartup(developmentEnvironment()),
    true
  );
});

test("incomplete or production-mixed Development configuration fails closed", () => {
  assert.throws(
    () =>
      assertCanonicalIdentityEnvironmentAtStartup(
        developmentEnvironment({ CLERK_ENV: undefined })
      ),
    DevelopmentIdentityLinkerConfigurationError
  );
  assert.throws(
    () =>
      assertCanonicalIdentityEnvironmentAtStartup(
        developmentEnvironment({ NODE_ENV: "production" })
      ),
    DevelopmentIdentityLinkerConfigurationError
  );
});

test("profile and avatar resolve access before provisioning legacy records", () => {
  for (const source of [profileRouteSource, avatarRouteSource]) {
    assert.ok(
      source.indexOf("await loadAccessSnapshot(") <
        source.indexOf("await ensureUserRecords(")
    );
    assert.match(source, /ensureUserRecords\([\s\S]*?accessSnapshot\.userId/);
  }

  assert.doesNotMatch(
    profileRouteSource,
    /Promise\.all\([\s\S]{0,300}ensureUserRecords/
  );
});

test("administration resolves Clerk users before provisioning and uses canonical snapshots", () => {
  assert.ok(
    adminUsersRouteSource.indexOf("await loadAccessSnapshot(") <
      adminUsersRouteSource.indexOf("await ensureUserRecords(")
  );
  assert.match(adminUsersRouteSource, /loadCanonicalAccessSnapshot/);
  assert.match(adminUsersRouteSource, /resolveCanonicalAccessUserId/);
  assert.match(adminAuthorizationSource, /loadAccessSnapshot\(supabase, userId\)/);
  assert.doesNotMatch(
    adminAuthorizationSource,
    /\.from\("user_global_roles"\)[\s\S]*?\.eq\("user_id", userId\)/
  );
});

test("ensureUserRecords cannot derive a database identity from Clerk", () => {
  assert.match(
    userRecordsSource,
    /ensureUserRecords\([\s\S]*?canonicalUserId: string,[\s\S]*?clerkUser/
  );
  assert.doesNotMatch(userRecordsSource, /\.eq\("user_id", clerkUser\.id\)/);
  assert.doesNotMatch(userRecordsSource, /user_id:\s*clerkUser\.id/);
});

test("the startup hook validates canonical Development configuration", () => {
  assert.match(instrumentationSource, /NEXT_RUNTIME !== "nodejs"/);
  assert.match(
    instrumentationSource,
    /assertCanonicalIdentityEnvironmentAtStartup/
  );
});

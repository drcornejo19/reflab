import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBaselineValidationTarget,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  SKIPPED_BASELINE_TARGET_MESSAGE,
} from "./baseline-validation-target.mjs";
import {
  createSanitizedSupabaseError,
  resolveLocalSupabaseCliBinary,
  runLocalSupabase,
} from "./preflight-baseline-project.mjs";

test("baseline validation skips without an explicit isolated target", () => {
  assert.deepEqual(evaluateBaselineValidationTarget({}), {
    allowed: false,
    reason: SKIPPED_BASELINE_TARGET_MESSAGE,
  });
});

test("baseline validation blocks the production project reference", () => {
  assert.throws(
    () =>
      evaluateBaselineValidationTarget({
        ALLOW_BASELINE_VALIDATION: "true",
        APP_ENV: "test",
        SUPABASE_ENV: "test",
        SUPABASE_PROJECT_REF: FORBIDDEN_PRODUCTION_PROJECT_REF,
        EXPECTED_TEST_SUPABASE_PROJECT_REF:
          FORBIDDEN_PRODUCTION_PROJECT_REF,
        NEXT_PUBLIC_SUPABASE_URL: `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
      }),
    /production target/
  );
});

test("baseline validation requires an exact positive reference match", () => {
  assert.throws(
    () =>
      evaluateBaselineValidationTarget({
        ALLOW_BASELINE_VALIDATION: "true",
        APP_ENV: "development",
        SUPABASE_ENV: "test",
        SUPABASE_PROJECT_REF: "developmentref",
        EXPECTED_TEST_SUPABASE_PROJECT_REF: "expectedref",
        NEXT_PUBLIC_SUPABASE_URL:
          "https://developmentref.supabase.co",
      }),
    /does not match/
  );
});

test("baseline validation accepts only a matching development target", () => {
  assert.deepEqual(
    evaluateBaselineValidationTarget({
      ALLOW_BASELINE_VALIDATION: "true",
      APP_ENV: "test",
      SUPABASE_ENV: "development",
      NODE_ENV: "test",
      SUPABASE_PROJECT_REF: "developmentref",
      EXPECTED_TEST_SUPABASE_PROJECT_REF: "developmentref",
      NEXT_PUBLIC_SUPABASE_URL:
        "https://developmentref.supabase.co",
    }),
    {
      allowed: true,
      environment: "test",
      projectRef: "developmentref",
      hostname: "developmentref.supabase.co",
    }
  );
});

test("connected validation requires a database URL for the same project", () => {
  assert.throws(
    () =>
      evaluateBaselineValidationTarget(
        {
          ALLOW_BASELINE_VALIDATION: "true",
          APP_ENV: "test",
          SUPABASE_ENV: "development",
          NODE_ENV: "test",
          SUPABASE_PROJECT_REF: "developmentref",
          EXPECTED_TEST_SUPABASE_PROJECT_REF: "developmentref",
          NEXT_PUBLIC_SUPABASE_URL:
            "https://developmentref.supabase.co",
          SUPABASE_DB_URL:
            "postgresql://postgres.otherref:password@pooler.supabase.com:5432/postgres",
          SUPABASE_SERVICE_ROLE_KEY: "synthetic",
        },
        { requireConnectionVariables: true }
      ),
    /database URL/
  );
});

test("Windows preflight resolves the pinned local CLI executable", () => {
  const packageJson =
    "C:\\project\\node_modules\\@supabase\\cli-windows-x64\\package.json";
  const executable = resolveLocalSupabaseCliBinary({
    platform: "win32",
    architecture: "x64",
    resolvePackage: (specifier) => {
      assert.equal(
        specifier,
        "@supabase/cli-windows-x64/package.json"
      );
      return packageJson;
    },
    fileExists: () => true,
  });

  assert.equal(
    executable,
    "C:\\project\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe"
  );
});

test("preflight executes the local CLI directly without npx", () => {
  const executable =
    "C:\\project\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe";
  let invocation;

  const output = runLocalSupabase(
    ["migration", "list", "--db-url", "synthetic"],
    "Migration-history preflight",
    {
      executable,
      environment: {},
      spawn: (command, arguments_, options) => {
        invocation = { command, arguments_, options };
        return { status: 0, stdout: "ok", stderr: "" };
      },
    }
  );

  assert.equal(invocation.command, executable);
  assert.deepEqual(invocation.arguments_, [
    "migration",
    "list",
    "--db-url",
    "synthetic",
  ]);
  assert.equal(invocation.options.windowsHide, true);
  assert.match(output, /ok/);
});

test("preflight reports Windows process errors without exposing secrets", () => {
  const environment = {
    SUPABASE_DB_URL:
      "postgresql://postgres:private-password@db.developmentref.supabase.co:5432/postgres",
    SUPABASE_SERVICE_ROLE_KEY: "private-service-role",
  };
  const error = createSanitizedSupabaseError(
    "Migration-history preflight",
    {
      status: null,
      stdout: environment.SUPABASE_DB_URL,
      stderr: environment.SUPABASE_SERVICE_ROLE_KEY,
      error: { code: "EINVAL" },
    },
    environment
  );

  assert.match(error.message, /process error: EINVAL/);
  assert.doesNotMatch(error.message, /private-password/);
  assert.doesNotMatch(error.message, /private-service-role/);
  assert.doesNotMatch(error.message, /postgresql:\/\//);
});

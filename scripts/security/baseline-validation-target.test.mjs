import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBaselineValidationTarget,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  SKIPPED_BASELINE_TARGET_MESSAGE,
} from "./baseline-validation-target.mjs";

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


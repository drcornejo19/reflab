import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateIsolatedSupabaseTarget,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  SKIPPED_ISOLATED_TARGET_MESSAGE,
} from "./isolated-supabase-target.mjs";

test("security tests skip when no isolated target is authorized", () => {
  assert.deepEqual(evaluateIsolatedSupabaseTarget({}), {
    allowed: false,
    reason: SKIPPED_ISOLATED_TARGET_MESSAGE,
  });
});

test("security tests reject the production project before checking opt-in", () => {
  assert.throws(
    () =>
      evaluateIsolatedSupabaseTarget({
        NEXT_PUBLIC_SUPABASE_URL: `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
      }),
    /production target/
  );
});

test("security tests require an exact positive project match", () => {
  assert.throws(
    () =>
      evaluateIsolatedSupabaseTarget({
        ALLOW_SECURITY_TESTS: "true",
        APP_ENV: "test",
        SUPABASE_ENV: "test",
        EXPECTED_TEST_SUPABASE_PROJECT_REF: "expectedref",
        NEXT_PUBLIC_SUPABASE_URL: "https://differentref.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
      }),
    /does not match/
  );
});

test("security tests accept only an explicitly authorized non-production target", () => {
  assert.deepEqual(
    evaluateIsolatedSupabaseTarget(
      {
        ALLOW_SECURITY_TESTS: "true",
        APP_ENV: "test",
        SUPABASE_ENV: "development",
        EXPECTED_TEST_SUPABASE_PROJECT_REF: "developmentref",
        NEXT_PUBLIC_SUPABASE_URL:
          "https://developmentref.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
      },
      [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ]
    ),
    {
      allowed: true,
      projectRef: "developmentref",
      environment: "test",
    }
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ClerkAuthorizedPartiesConfigurationError,
  resolveClerkAuthorizedParties,
} from "./clerkAuthorizedParties.ts";
import { DEVELOPMENT_SUPABASE_PROJECT_REF } from "../identity/developmentIdentityEnvironment.ts";

const previewOrigin = "https://reflab-preview.example.com";
const proxySource = readFileSync(resolve("proxy.ts"), "utf8");
const instrumentationSource = readFileSync(resolve("instrumentation.ts"), "utf8");

function environment(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return {
    NODE_ENV: "production",
    REFLAB_DATA_ENV: "development",
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    VERCEL_ENV: "preview",
    CLERK_AUTHORIZED_PARTIES: previewOrigin,
    ...overrides,
  };
}

test("a valid Preview origin is passed to Clerk as the exact allowlist", () => {
  const parties = resolveClerkAuthorizedParties(environment());

  assert.deepEqual(parties, [previewOrigin]);
  assert.equal(parties.includes("https://untrusted.example.com"), false);
  assert.match(proxySource, /resolveClerkAuthorizedParties\(process\.env\)/);
  assert.match(proxySource, /authorizedParties:\s*clerkAuthorizedParties/);
});

test("missing authorized parties fail closed on Vercel", () => {
  for (const overrides of [
    { CLERK_AUTHORIZED_PARTIES: undefined },
    {
      CLERK_AUTHORIZED_PARTIES: undefined,
      VERCEL: "1",
      VERCEL_ENV: undefined,
    },
  ]) {
    assert.throws(
      () => resolveClerkAuthorizedParties(environment(overrides)),
      (error: unknown) =>
        error instanceof ClerkAuthorizedPartiesConfigurationError &&
        error.code === "clerk_authorized_parties_missing"
    );
  }
});

test("origins with paths, query strings, or fragments are rejected", () => {
  for (const value of [
    `${previewOrigin}/path`,
    `${previewOrigin}?mode=preview`,
    `${previewOrigin}#fragment`,
  ]) {
    assert.throws(
      () =>
        resolveClerkAuthorizedParties(
          environment({ CLERK_AUTHORIZED_PARTIES: value })
        ),
      ClerkAuthorizedPartiesConfigurationError
    );
  }
});

test("non-local HTTP origins are rejected", () => {
  assert.throws(
    () =>
      resolveClerkAuthorizedParties(
        environment({
          CLERK_AUTHORIZED_PARTIES: "http://preview.example.com",
        })
      ),
    ClerkAuthorizedPartiesConfigurationError
  );
});

test("localhost HTTP is allowed only for explicit local Development origins", () => {
  const localEnvironment = environment({
    NODE_ENV: "development",
    VERCEL_ENV: undefined,
    CLERK_AUTHORIZED_PARTIES: "http://localhost:3001",
  });

  assert.deepEqual(resolveClerkAuthorizedParties(localEnvironment), [
    "http://localhost:3001",
  ]);
  assert.deepEqual(
    resolveClerkAuthorizedParties({
      ...localEnvironment,
      CLERK_AUTHORIZED_PARTIES: undefined,
    }),
    ["http://localhost:3000"]
  );
});

test("multiple origins are normalized and deduplicated", () => {
  assert.deepEqual(
    resolveClerkAuthorizedParties(
      environment({
        CLERK_AUTHORIZED_PARTIES:
          `${previewOrigin}/, https://branch-preview.example.com, ${previewOrigin}`,
      })
    ),
    [previewOrigin, "https://branch-preview.example.com"]
  );
});

test("wildcards, credentials, encoded values, and empty entries are rejected", () => {
  for (const value of [
    "https://*.vercel.app",
    "https://user:password@preview.example.com",
    "https://preview.example.com/%2e%2e",
    `${previewOrigin},,https://branch-preview.example.com`,
  ]) {
    assert.throws(
      () =>
        resolveClerkAuthorizedParties(
          environment({ CLERK_AUTHORIZED_PARTIES: value })
        ),
      ClerkAuthorizedPartiesConfigurationError
    );
  }
});

test("startup and middleware share the same server-side configuration", () => {
  assert.match(
    instrumentationSource,
    /assertClerkAuthorizedPartiesAtStartup\(process\.env\)/
  );
  assert.match(proxySource, /clerkAuthorizedParties/);
  assert.doesNotMatch(
    proxySource,
    /authorizedParties:\s*(?:req|request)\.|authorizedParties:\s*process\.env/
  );
});

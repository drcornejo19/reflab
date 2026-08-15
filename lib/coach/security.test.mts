import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveCanonicalCoachIdentity } from "./canonicalIdentity.ts";

const root = process.cwd();

function adminClient(
  calls: Array<Record<string, unknown>>,
  events: string[] = []
) {
  return {
    rpc: async (functionName: string, parameters: Record<string, unknown>) => {
      events.push("rate-limit");
      calls.push({ functionName, parameters });
      return {
        data: { allowed: true, remaining: 19, retry_after_seconds: 600 },
        error: null,
      };
    },
  };
}

test("Coach resolves the Clerk subject to a canonical identity", async () => {
  const events: string[] = [];
  const client = adminClient([], events);

  const identity = await resolveCanonicalCoachIdentity({
    getAuthenticatedUserId: async () => "user_clerk_subject",
    createAdminClient: () => client,
    loadAccess: async (receivedClient, externalSubject) => {
      assert.equal(receivedClient, client);
      assert.equal(externalSubject, "user_clerk_subject");
      events.push("identity");
      return { userId: "user_dev_referee_a" };
    },
  });

  assert.equal(identity?.userId, "user_dev_referee_a");
  assert.equal(identity?.client, client);
  assert.deepEqual(events, ["identity"]);
});

test("Coach resolves a missing session before creating any database client", async () => {
  let clients = 0;
  let identityReads = 0;

  const identity = await resolveCanonicalCoachIdentity({
    getAuthenticatedUserId: async () => null,
    createAdminClient: () => {
      clients += 1;
      return {};
    },
    loadAccess: async () => {
      identityReads += 1;
      return { userId: "unexpected" };
    },
  });

  assert.equal(identity, null);
  assert.equal(clients, 0);
  assert.equal(identityReads, 0);
});

test("Coach propagates identity_link_required before any downstream write", async () => {
  const expected = new Error("identity_link_required");

  await assert.rejects(
    resolveCanonicalCoachIdentity({
      getAuthenticatedUserId: async () => "user_unlinked_subject",
      createAdminClient: () => ({}),
      loadAccess: async () => {
        throw expected;
      },
    }),
    expected
  );
});

test("every Coach route shares the canonical request contract", () => {
  const routes = [
    "app/api/english-feedback/route.ts",
    "app/api/ai-feedback/route.ts",
    "app/api/var-feedback/route.ts",
    "app/api/ai-exam-analysis/route.ts",
  ];

  for (const route of routes) {
    const source = fs.readFileSync(path.join(root, route), "utf8");
    assert.match(source, /prepareCoachRequest\(request, FEATURE\)/);
    assert.match(source, /userId:\s*context\.userId/);
    assert.match(source, /coachErrorResponse\(error, requestId\)/);
    assert.doesNotMatch(
      source,
      /auth\(\)|ensureUserRecords|user_roles|automatic_default/
    );
  }
});

test("Coach persistence uses only the canonical context identity", () => {
  const security = fs.readFileSync(
    path.join(root, "lib/coach/security.ts"),
    "utf8"
  );
  const gateway = fs.readFileSync(
    path.join(root, "lib/coach/gateway.ts"),
    "utf8"
  );

  assert.match(
    security,
    /loadAccessSnapshot\(supabase, externalSubject,\s*{\s*provisionMissing:\s*false/
  );
  assert.match(
    security,
    /enforceCoachRateLimit\(identity\.client, identity\.userId, feature\)/
  );
  assert.doesNotMatch(
    security,
    /enforceCoachRateLimit\([^,]+, (session\.userId|externalSubject)/
  );

  const errors = fs.readFileSync(path.join(root, "lib/coach/errors.ts"), "utf8");
  assert.match(errors, /error instanceof IdentityLinkRequiredError/);
  assert.match(errors, /error:\s*"identity_link_required"/);
  assert.match(errors, /{ status: 409 }/);
  assert.match(security, /if \(!identity\) throw new CoachUnauthorizedError\(\)/);

  assert.equal((gateway.match(/user_id:\s*request\.userId/g) ?? []).length, 2);
  assert.match(gateway, /insertEvidence\(supabase, runId, request\.evidence\)/);
  assert.match(gateway, /run_id:\s*runId/);
  assert.doesNotMatch(gateway, /user_roles|automatic_default/);
});

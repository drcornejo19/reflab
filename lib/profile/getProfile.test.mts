import assert from "node:assert/strict";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  createProfileGetResponse,
  getProfilePayload,
  sanitizeProfileGetError,
} from "./getProfile.ts";

const linkedAccess: AccessSnapshot = {
  userId: "user_dev_referee_a",
  globalRole: "referee",
  individualPlan: "pro",
  effectiveIndividualPlan: "pro",
  capabilities: ["advanced_individual"],
  sources: ["individual"],
  inheritedFromInstitutionIds: [],
};

const syntheticClerkUser = {
  id: "user_clerk_linked",
  emailAddresses: [
    { id: "email_synthetic", emailAddress: "referee-a@example.invalid" },
  ],
  primaryEmailAddressId: "email_synthetic",
  firstName: "Referee",
  lastName: "A",
  username: "referee-a",
  imageUrl: "",
  createdAt: Date.parse("2026-07-27T00:00:00.000Z"),
  updatedAt: Date.parse("2026-07-27T00:00:00.000Z"),
};

function createReadOnlyProfileClient() {
  const operations: Array<Record<string, unknown>> = [];

  const client = {
    from(table: string) {
      operations.push({ operation: "from", table });
      assert.equal(table, "user_profiles");

      return {
        select(columns: string) {
          operations.push({ operation: "select", table, columns });

          return {
            eq(column: string, userId: string) {
              operations.push({ operation: "eq", table, column, userId });
              assert.equal(column, "user_id");
              assert.equal(userId, "user_dev_referee_a");

              return {
                async maybeSingle() {
                  operations.push({ operation: "maybeSingle", table });
                  return {
                    data: {
                      user_id: "user_dev_referee_a",
                      reflab_name: "Referee A",
                      first_name: "Referee",
                      last_name: "A",
                      ref_card_id: "RF-DEV-A",
                      subscription_plan: "basic",
                      public_profile: true,
                      hide_ranking_name: false,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, operations };
}

test("linked Clerk identity reads RF-DEV-A from canonical records without writes", async () => {
  const fake = createReadOnlyProfileClient();
  const accessCalls: Array<Record<string, unknown>> = [];
  const response = await createProfileGetResponse(() =>
    getProfilePayload(
      fake.client as never,
      "user_clerk_linked",
      syntheticClerkUser as never,
      {
        async loadAccessSnapshot(_client, externalUserId, options) {
          accessCalls.push({ externalUserId, options });
          return linkedAccess;
        },
      }
    )
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.profile.refCardId, "RF-DEV-A");
  assert.equal(payload.profile.role, "individual_referee");
  assert.equal(payload.profile.subscriptionPlan, "pro");
  assert.equal(payload.access.globalRole, "referee");
  assert.equal(payload.access.individualPlan, "pro");
  assert.deepEqual(accessCalls, [
    {
      externalUserId: "user_clerk_linked",
      options: { provisionMissing: false },
    },
  ]);
  assert.deepEqual(
    fake.operations.map((operation) => operation.operation),
    ["from", "select", "eq", "maybeSingle"]
  );
  assert.ok(
    fake.operations.every(
      (operation) => operation.userId !== "user_clerk_linked"
    )
  );
  assert.doesNotMatch(JSON.stringify(payload), /user_dev_referee_b/);
});

test("an unlinked Development identity remains identity_link_required with zero data access", async () => {
  let profileReadAttempted = false;
  const client = {
    from() {
      profileReadAttempted = true;
      throw new Error("Profile access must not run before identity resolution.");
    },
  };

  const response = await createProfileGetResponse(() =>
      getProfilePayload(
        client as never,
        "user_clerk_unlinked",
        syntheticClerkUser as never,
        {
          async loadAccessSnapshot() {
            throw new IdentityLinkRequiredError();
          },
        }
      )
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "identity_link_required" });
  assert.equal(profileReadAttempted, false);
});

test("structured Supabase errors retain safe code and message", () => {
  const result = sanitizeProfileGetError({
    code: "42501",
    message: "permission denied for table user_roles",
    details: "sensitive detail that must not be logged",
  });

  assert.deepEqual(result, {
    code: "42501",
    message: "permission denied for table user_roles",
  });
  assert.doesNotMatch(JSON.stringify(result), /\[object Object\]/);
  assert.doesNotMatch(JSON.stringify(result), /sensitive detail/);
});

test("profile error sanitization redacts bearer tokens and JWTs", () => {
  const jwt = `${["e", "y", "J"].join("")}header.payload.signature`;
  const result = sanitizeProfileGetError({
    message: `Bearer secret-value ${jwt}`,
  });

  assert.equal(result.code, null);
  assert.equal(result.message, "Bearer [redacted] [redacted]");
});

test("profile GET logs structured Supabase errors without object stringification", async () => {
  const logs: unknown[] = [];
  const response = await createProfileGetResponse(
    async () => {
      throw { code: "42501", message: "permission denied" };
    },
    (diagnostic) => logs.push(diagnostic)
  );

  assert.equal(response.status, 500);
  assert.deepEqual(logs, [{ code: "42501", message: "permission denied" }]);
  assert.doesNotMatch(JSON.stringify(logs), /\[object Object\]/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  NotificationTokenOwnershipError,
  registerCanonicalNotificationToken,
  type CanonicalNotificationTokenStore,
} from "../notifications/tokenOwnership.ts";
import {
  requireScheduledJobSecret,
  runScheduledNotificationPlan,
  summarizeScheduledNotificationPlan,
} from "../notifications/scheduled.ts";
import { resolveCanonicalRequestIdentity } from "./canonicalRequestIdentityCore.ts";

const root = process.cwd();
const tokenInput = {
  token: "synthetic-notification-token-for-tests",
  provider: "fcm" as const,
  userAgent: "test",
  lastSeenAt: "2026-08-24T12:00:00.000Z",
};

function read(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function access(userId = "user_dev_referee_a") {
  return {
    userId,
    globalRole: "referee",
    individualPlan: "pro",
    effectiveIndividualPlan: "pro",
    capabilities: [],
    sources: [],
    inheritedFromInstitutionIds: [],
  } as never;
}

test("linked sessions resolve once to the canonical request identity", async () => {
  const supabase = {} as never;
  let receivedSubject = "";
  const result = await resolveCanonicalRequestIdentity("user_clerk_external", {
    createSupabase: () => supabase,
    loadAccess: async (client, externalSubject) => {
      assert.equal(client, supabase);
      receivedSubject = externalSubject;
      return access();
    },
    logError: () => assert.fail("identity resolution should not log"),
  });

  assert.equal(result.response, null);
  assert.equal(result.canonicalUserId, "user_dev_referee_a");
  assert.equal(receivedSubject, "user_clerk_external");
});

test("missing sessions return JSON 401 before creating a database client", async () => {
  let clientsCreated = 0;
  const result = await resolveCanonicalRequestIdentity(null, {
    createSupabase: () => {
      clientsCreated += 1;
      return {} as never;
    },
    loadAccess: async () => assert.fail("access should not load"),
    logError: () => assert.fail("missing sessions should not log"),
  });

  assert.equal(result.response?.status, 401);
  assert.deepEqual(await result.response?.json(), {
    error: "authentication_required",
  });
  assert.equal(clientsCreated, 0);
});

test("unlinked Development sessions return identity_link_required", async () => {
  const result = await resolveCanonicalRequestIdentity("user_unlinked", {
    createSupabase: () => ({} as never),
    loadAccess: async () => {
      throw new IdentityLinkRequiredError();
    },
    logError: () => assert.fail("expected identity errors should not log"),
  });

  assert.equal(result.response?.status, 409);
  assert.deepEqual(await result.response?.json(), {
    error: "identity_link_required",
  });
});

test("the shared resolver is read-only and cannot provision defaults", () => {
  const source = read("lib/identity/canonicalRequestIdentity.ts");
  assert.match(source, /loadAccessSnapshot[\s\S]*provisionMissing: false/);
  assert.doesNotMatch(source, /ensureUserRecords|automatic_default|user_roles/);
});
test("Ref Performance reads and writes only the canonical identity", () => {
  const source = read("app/api/ref-performance/route.ts");
  assert.match(source, /requireCanonicalRequestIdentity\(\)/);
  assert.match(source, /identity\.canonicalUserId/);
  assert.doesNotMatch(source, /auth\(\)|session\.userId|getClerkUserId/);
  assert.doesNotMatch(source, /user_id:\s*(?:userId|externalSubject|clerkSubject)/);
});

test("Ref Performance technical metrics accept only official attempts", () => {
  const source = read("app/api/ref-performance/route.ts");
  assert.match(source, /exam_results!inner\(id,user_id\)/);
  assert.match(source, /\.eq\("exam_results\.user_id", canonicalUserId\)/);
  assert.match(source, /\.not\("exam_result_id", "is", null\)/);
  assert.doesNotMatch(source, /\.is\("exam_result_id", null\)/);
});

test("Psychology persists canonical practice data outside official metrics", () => {
  const psychology = read("app/api/psychology/route.ts");
  const summary = read("lib/performance/canonicalSummary.ts");
  const ranking = read("lib/ranking/canonicalRanking.ts");

  assert.match(psychology, /requireCanonicalRequestIdentity\(\)/);
  assert.match(psychology, /user_id: canonicalUserId/);
  assert.doesNotMatch(psychology, /auth\(\)|session\.userId|getClerkUserId/);
  assert.doesNotMatch(summary, /psychology_/);
  assert.doesNotMatch(ranking, /psychology_/);
});

test("interactive notification routes share canonical identity", () => {
  for (const file of [
    "app/api/notifications/preferences/route.ts",
    "app/api/notifications/register-token/route.ts",
    "app/api/notifications/send/route.ts",
  ]) {
    const source = read(file);
    assert.match(source, /requireCanonicalRequestIdentity\(\)/);
    assert.match(source, /identity\.canonicalUserId/);
    assert.doesNotMatch(source, /auth\(\)|session\.userId/);
  }

  const server = read("lib/notificationServer.ts");
  assert.match(server, /canonicalUserId/g);
  assert.doesNotMatch(server, /user_id:\s*(?:userId|externalSubject|clerkSubject)/);
});

test("a new token is registered for the canonical owner", async () => {
  const inserted: string[] = [];
  const store: CanonicalNotificationTokenStore = {
    loadOwner: async () => null,
    insert: async (canonicalUserId) => {
      inserted.push(canonicalUserId);
      return "created";
    },
    update: async () => assert.fail("new tokens should not update"),
  };

  const result = await registerCanonicalNotificationToken(
    {} as never,
    "user_dev_referee_a",
    tokenInput,
    store
  );

  assert.deepEqual(result, { status: "created" });
  assert.deepEqual(inserted, ["user_dev_referee_a"]);
});

test("replaying a token for the same canonical owner is idempotent", async () => {
  let updates = 0;
  const store: CanonicalNotificationTokenStore = {
    loadOwner: async () => ({ id: "token-id", user_id: "user_dev_referee_a" }),
    insert: async () => assert.fail("existing tokens should not insert"),
    update: async () => {
      updates += 1;
    },
  };

  const result = await registerCanonicalNotificationToken(
    {} as never,
    "user_dev_referee_a",
    tokenInput,
    store
  );

  assert.deepEqual(result, { status: "already_registered" });
  assert.equal(updates, 1);
});

test("a token owned by another canonical user cannot be reassigned", async () => {
  const store: CanonicalNotificationTokenStore = {
    loadOwner: async () => ({ id: "token-id", user_id: "user_dev_referee_b" }),
    insert: async () => assert.fail("foreign tokens should not insert"),
    update: async () => assert.fail("foreign tokens should not update"),
  };

  await assert.rejects(
    registerCanonicalNotificationToken(
      {} as never,
      "user_dev_referee_a",
      tokenInput,
      store
    ),
    NotificationTokenOwnershipError
  );
});

test("a concurrent token insert preserves the winning canonical owner", async () => {
  let reads = 0;
  const store: CanonicalNotificationTokenStore = {
    loadOwner: async () => {
      reads += 1;
      return reads === 1
        ? null
        : { id: "winner", user_id: "user_dev_referee_b" };
    },
    insert: async () => "conflict",
    update: async () => assert.fail("the losing owner cannot update"),
  };

  await assert.rejects(
    registerCanonicalNotificationToken(
      {} as never,
      "user_dev_referee_a",
      tokenInput,
      store
    ),
    NotificationTokenOwnershipError
  );
});

test("scheduled job secrets are required and compared server-side", async () => {
  const missing = requireScheduledJobSecret(
    new Request("http://localhost/api/notifications/scheduled"),
    "job-secret"
  );
  assert.equal(missing?.status, 401);

  const allowed = requireScheduledJobSecret(
    new Request("http://localhost/api/notifications/scheduled", {
      headers: { authorization: "Bearer job-secret" },
    }),
    "job-secret"
  );
  assert.equal(allowed, null);
});

test("scheduled GET is a read-only preview with no sender or mutation", () => {
  const source = read("app/api/notifications/scheduled/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /buildScheduledNotificationPlan/);
  assert.match(source, /writesPlanned: false/);
  assert.doesNotMatch(source, /sendSmartNotificationToUser|runScheduledNotificationPlan|\.insert\(|\.update\(|sendFcmNotification/);
});

test("scheduled POST run is the only route that executes effects", async () => {
  const sent: string[] = [];
  const plan = {
    processed: 1,
    candidates: [
      {
        canonicalUserId: "user_dev_referee_a",
        type: "weekly_progress" as const,
      },
    ],
  };

  const results = await runScheduledNotificationPlan(
    {} as never,
    plan,
    async (_supabase, canonicalUserId) => {
      sent.push(canonicalUserId);
      return { success: true } as never;
    }
  );

  assert.equal(results.length, 1);
  assert.deepEqual(sent, ["user_dev_referee_a"]);
  assert.deepEqual(summarizeScheduledNotificationPlan(plan), {
    processed: 1,
    candidates: 1,
    byType: { weekly_progress: 1 },
  });

  const route = read("app/api/notifications/scheduled/run/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /runScheduledNotificationPlan/);
});

test("weak-topic notifications remain official-only", () => {
  const source = read("lib/notifications/scheduled.ts");
  const weakTopic = source.slice(
    source.indexOf("async function getWeakTopic"),
    source.indexOf("async function getTrainingStreakDays")
  );

  assert.match(weakTopic, /exam_results!inner\(id,user_id\)/);
  assert.match(weakTopic, /\.eq\("exam_results\.user_id", canonicalUserId\)/);
  assert.match(weakTopic, /\.not\("exam_result_id", "is", null\)/);
});

test("activity and streak remain general signals rather than performance", () => {
  const source = read("lib/notifications/scheduled.ts");
  const activity = source.slice(
    source.indexOf("async function getLatestActivityAt"),
    source.indexOf("async function getUpcomingAppointment")
  );
  const streak = source.slice(
    source.indexOf("async function getTrainingStreakDays"),
    source.indexOf("async function hasRecentNotification")
  );

  assert.match(activity, /\["attempts", "exam_results", "performance_checkins"\]/);
  assert.match(streak, /\["attempts", "exam_results", "performance_checkins"\]/);
  assert.doesNotMatch(`${activity}\n${streak}`, /avg_score|score\)|topic/);
});

test("only exact interactive APIs bypass Clerk redirects", () => {
  const proxy = read("proxy.ts");
  const manifest = read("lib/auth/apiAuthBoundary.ts");
  for (const route of [
    "/api/ref-performance",
    "/api/psychology",
    "/api/notifications/preferences",
    "/api/notifications/register-token",
    "/api/notifications/send",
  ]) {
    assert.match(manifest, new RegExp(JSON.stringify(route)));
  }
  assert.match(proxy, /classifyApiAuthPath\(req\.nextUrl\.pathname\)/);
  assert.match(proxy, /apiRoute\?\.category === "self_authorized"/);
  assert.doesNotMatch(proxy, /api\/ref-performance\(\.\*\)|api\/psychology\(\.\*\)/);
});

test("automatic scheduled delivery stays disabled until POST scheduling exists", () => {
  const config = JSON.parse(read("vercel.json")) as { crons?: unknown[] };
  const gate = read("docs/canonical-identity-production-gates.md");

  assert.deepEqual(config.crons, []);
  assert.match(gate, /POST \/api\/notifications\/scheduled\/run/);
  assert.match(gate, /One\s+`psychology_checkins` row contains an unlinked Clerk subject/);
  assert.match(gate, /Production[\s\S]*read-only[\s\S]*transactional data migration/);
});

test("the three cleaned blocks have no runtime Clerk subject persistence", () => {
  const files = [
    "app/api/ref-performance/route.ts",
    "app/api/psychology/route.ts",
    "app/api/notifications/preferences/route.ts",
    "app/api/notifications/register-token/route.ts",
    "app/api/notifications/send/route.ts",
    "lib/notificationServer.ts",
    "lib/notifications/scheduled.ts",
  ];
  const source = files.map(read).join("\n");

  assert.doesNotMatch(source, /user_id:\s*(?:userId|externalSubject|clerkSubject)/);
  assert.doesNotMatch(source, /ensureUserRecords|automatic_default|user_roles/);
});

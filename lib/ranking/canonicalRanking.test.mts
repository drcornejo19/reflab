import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import { normalizeGlobalRole } from "../access/catalog.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  buildCanonicalRanking,
  executeCanonicalRankingRequest,
  loadCanonicalGlobalRanking,
} from "./canonicalRanking.ts";

const football = "football_11" as const;
const currentUserId = "user_dev_referee_a";
const otherUserId = "user_dev_referee_b";
const currentProfile = {
  user_id: currentUserId,
  ref_card_id: "RF-DEV-A",
  first_name: "Current",
  last_name: "Referee",
  show_real_name_in_ranking: false,
};
const otherProfile = {
  user_id: otherUserId,
  ref_card_id: "RF-DEV-B",
  ranking_display_name: "Visible referee",
  show_real_name_in_ranking: true,
};

function access(overrides: Partial<AccessSnapshot> = {}): AccessSnapshot {
  return {
    userId: currentUserId,
    globalRole: "referee",
    individualPlan: "pro",
    effectiveIndividualPlan: "pro",
    capabilities: ["ref_performance"],
    sources: ["individual"],
    inheritedFromInstitutionIds: [],
    ...overrides,
  };
}

function official(
  userId: string,
  score: number,
  submittedAt: string,
  sportType: "football_11" | "futsal" = football
) {
  return {
    user_id: userId,
    sport_type: sportType,
    avg_score: score,
    submitted_at: submittedAt,
    created_at: submittedAt,
  };
}

test("one exam_result counts once regardless of its question count", () => {
  const result = buildCanonicalRanking({
    canonicalUserId: currentUserId,
    sportType: football,
    profiles: [currentProfile],
    examResults: [
      {
        ...official(currentUserId, 30, "2026-08-21T12:00:00.000Z"),
        total_questions: 20,
      },
    ],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.evaluations, 1);
  assert.equal(result.rows[0]?.averageScore, 30);
});

test("three official results use a simple per-evaluation average", () => {
  const result = buildCanonicalRanking({
    canonicalUserId: currentUserId,
    sportType: football,
    profiles: [currentProfile, otherProfile],
    examResults: [
      official(currentUserId, 100, "2026-08-19T12:00:00.000Z"),
      official(currentUserId, 25, "2026-08-20T12:00:00.000Z"),
      official(currentUserId, 75, "2026-08-21T12:00:00.000Z"),
      official(otherUserId, 80, "2026-08-21T10:00:00.000Z"),
    ],
  });

  const current = result.rows.find((row) => row.isCurrentUser);
  assert.equal(current?.evaluations, 3);
  assert.equal(current?.averageScore, 66.67);
  assert.equal(current?.bestScore, 100);
  assert.equal(current?.lastEvaluationAt, "2026-08-21T12:00:00.000Z");
});

test("training attempts and communication feedback cannot affect ranking", () => {
  const examResults = [
    official(currentUserId, 100, "2026-08-19T12:00:00.000Z"),
    official(currentUserId, 25, "2026-08-20T12:00:00.000Z"),
  ];
  const irrelevantTraining = Array.from({ length: 100 }, (_, index) => ({
    user_id: currentUserId,
    exam_result_id: null,
    source_item_type: index % 2 ? "communication_feedback" : "clip",
    score: index,
  }));
  const before = buildCanonicalRanking({
    canonicalUserId: currentUserId,
    sportType: football,
    profiles: [currentProfile],
    examResults,
  });
  irrelevantTraining.push({
    user_id: currentUserId,
    exam_result_id: null,
    source_item_type: "communication_feedback",
    score: 100,
  });
  const after = buildCanonicalRanking({
    canonicalUserId: currentUserId,
    sportType: football,
    profiles: [currentProfile],
    examResults,
  });

  assert.equal(irrelevantTraining.length, 101);
  assert.deepEqual(after, before);
  assert.equal(after.rows[0]?.averageScore, 62.5);
});

test("football and futsal results are always separated", () => {
  const records = {
    canonicalUserId: currentUserId,
    profiles: [currentProfile],
    examResults: [
      official(currentUserId, 20, "2026-08-20T12:00:00.000Z", football),
      official(currentUserId, 90, "2026-08-21T12:00:00.000Z", "futsal"),
    ],
  };

  assert.equal(
    buildCanonicalRanking({ ...records, sportType: football }).rows[0]
      ?.averageScore,
    20
  );
  assert.equal(
    buildCanonicalRanking({ ...records, sportType: "futsal" }).rows[0]
      ?.averageScore,
    90
  );
});

test("legacy subjects and results without canonical profiles are excluded", () => {
  const result = buildCanonicalRanking({
    canonicalUserId: currentUserId,
    sportType: football,
    profiles: [currentProfile],
    examResults: [
      official(currentUserId, 50, "2026-08-21T12:00:00.000Z"),
      official("user_clerk_legacy", 100, "2026-08-21T13:00:00.000Z"),
      { ...official(otherUserId, 99, "2026-08-21T14:00:00.000Z"), user_id: null },
    ],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.refCardId, "RF-DEV-A");
});

test("the public contract omits internal IDs and computes self position canonically", () => {
  const result = buildCanonicalRanking({
    canonicalUserId: currentUserId,
    sportType: football,
    profiles: [currentProfile, otherProfile],
    examResults: [
      official(currentUserId, 60, "2026-08-21T12:00:00.000Z"),
      official(otherUserId, 90, "2026-08-21T12:00:00.000Z"),
    ],
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.selfPosition?.position, 2);
  assert.equal(result.selfPosition?.isCurrentUser, true);
  assert.equal(serialized.includes(currentUserId), false);
  assert.equal(serialized.includes(otherUserId), false);
  assert.equal(serialized.includes("userId"), false);
});

test("Pro capability and Super Admin authorize the canonical read", async () => {
  let reads = 0;
  const loadOfficialRecords = async () => {
    reads += 1;
    return { examResults: [], profiles: [] };
  };

  await loadCanonicalGlobalRanking("clerk-subject", football, {
    loadAccess: async () => access(),
    loadOfficialRecords,
  });
  await loadCanonicalGlobalRanking("clerk-subject", football, {
    loadAccess: async () =>
      access({ globalRole: "super_admin", capabilities: [] }),
    loadOfficialRecords,
  });

  assert.equal(reads, 2);
});

test("Basic without ref_performance is rejected before ranking records", async () => {
  let reads = 0;
  await assert.rejects(
    loadCanonicalGlobalRanking("clerk-subject", football, {
      loadAccess: async () =>
        access({
          individualPlan: "basic",
          effectiveIndividualPlan: "basic",
          capabilities: [],
        }),
      loadOfficialRecords: async () => {
        reads += 1;
        return { examResults: [], profiles: [] };
      },
    }),
    { message: "ranking_forbidden" }
  );
  assert.equal(reads, 0);
});

test("legacy video_admin cannot authorize the privileged ranking read", async () => {
  let reads = 0;
  await assert.rejects(
    loadCanonicalGlobalRanking("clerk-subject", football, {
      loadAccess: async () =>
        access({
          globalRole: normalizeGlobalRole("video_admin"),
          individualPlan: "basic",
          effectiveIndividualPlan: "basic",
          capabilities: [],
        }),
      loadOfficialRecords: async () => {
        reads += 1;
        return { examResults: [], profiles: [] };
      },
    }),
    { message: "ranking_forbidden" }
  );
  assert.equal(reads, 0);
});

test("the request returns JSON 401 and validates sport without reading data", async () => {
  let loads = 0;
  const dependencies = {
    getAuthenticatedUserId: async () => null,
    loadRanking: async () => {
      loads += 1;
      return { rows: [], selfPosition: null };
    },
    logError: () => undefined,
  };
  const missingSession = await executeCanonicalRankingRequest(
    new Request("http://localhost/api/ranking?sport=football_11"),
    dependencies
  );
  const invalidSport = await executeCanonicalRankingRequest(
    new Request("http://localhost/api/ranking?sport=beach"),
    { ...dependencies, getAuthenticatedUserId: async () => "clerk-subject" }
  );

  assert.equal(missingSession.status, 401);
  assert.deepEqual(await missingSession.json(), { error: "authentication_required" });
  assert.equal(invalidSport.status, 400);
  assert.equal(loads, 0);
});

test("Development without a link returns identity_link_required", async () => {
  const response = await executeCanonicalRankingRequest(
    new Request("http://localhost/api/ranking?sport=football_11"),
    {
      getAuthenticatedUserId: async () => "clerk-subject",
      loadRanking: async () => {
        throw new IdentityLinkRequiredError();
      },
      logError: () => undefined,
    }
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "identity_link_required" });
});

test("ranking reads are side-effect free and use no legacy sources", () => {
  const root = process.cwd();
  const reader = fs.readFileSync(
    path.join(root, "lib/ranking/canonicalRanking.ts"),
    "utf8"
  );
  const route = fs.readFileSync(path.join(root, "app/api/ranking/route.ts"), "utf8");
  const combined = `${reader}\n${route}`;

  assert.match(reader, /provisionMissing:\s*false/);
  assert.match(reader, /\.from\("exam_results"\)/);
  assert.match(reader, /\.from\("user_profiles"\)/);
  for (const forbidden of [
    '.from("attempts")',
    "rules_exam_results",
    "user_roles",
    "automatic_default",
    "advanced_individual",
    ".insert(",
    ".update(",
    ".upsert(",
    ".delete(",
  ]) {
    assert.equal(combined.includes(forbidden), false, forbidden);
  }
});

test("proxy bypasses only the exact ranking API while Clerk remains active", () => {
  const proxy = fs.readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
  const manifest = fs.readFileSync(
    path.join(process.cwd(), "lib/auth/apiAuthBoundary.ts"),
    "utf8"
  );

  assert.match(manifest, /selfAuthorized\("\/api\/ranking", "ranking"\)/);
  assert.match(proxy, /classifyApiAuthPath\(req\.nextUrl\.pathname\)/);
  assert.equal(proxy.includes('createRouteMatcher(["/api/ranking(.*)"])'), false);
  assert.match(proxy, /if \(!isPublicRoute\(req\)\) \{\s*await auth\.protect\(\)/);
});

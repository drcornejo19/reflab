import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  executeCanonicalPerformanceSummaryRequest,
  loadCanonicalPerformanceSummary,
  type CanonicalPerformanceDependencies,
} from "./canonicalSummary.ts";
import {
  buildCanonicalPerformanceSummary,
  loadOptionalRanking,
} from "./canonicalSummaryModel.ts";
import {
  buildSportPerformanceDataset,
  getSportRadarData,
  getSportTopicPerformance,
} from "../performanceBySport.ts";

const sportType = "football_11" as const;
const canonicalAccess = {
  userId: "user_dev_referee_a",
  globalRole: "referee" as const,
  individualPlan: "pro" as const,
  effectiveIndividualPlan: "pro" as const,
  capabilities: [],
  sources: ["individual" as const],
  inheritedFromInstitutionIds: [],
};
const examResults = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    user_id: canonicalAccess.userId,
    sport_type: sportType,
    avg_score: 100,
    total_questions: 1,
    submitted_at: "2026-07-30T12:00:00.000Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    user_id: canonicalAccess.userId,
    sport_type: sportType,
    avg_score: 25,
    total_questions: 1,
    submitted_at: "2026-08-14T12:00:00.000Z",
  },
];
const officialAttempts = examResults.map((result, index) => ({
  id: `20000000-0000-4000-8000-00000000000${index + 1}`,
  user_id: canonicalAccess.userId,
  sport_type: sportType,
  exam_result_id: result.id,
  mode: "exam",
  topic: index === 0 ? "Dispute" : "Handball",
  score: result.avg_score,
  is_correct: result.avg_score === 100,
  technical_correct: result.avg_score === 100,
  created_at: result.submitted_at,
}));
const trainingAttempt = {
  id: "30000000-0000-4000-8000-000000000001",
  user_id: canonicalAccess.userId,
  sport_type: sportType,
  exam_result_id: null,
  mode: "training",
  topic: "VAR",
  score: 0,
  is_correct: false,
  created_at: "2026-08-14T13:00:00.000Z",
};

function trainingAttempts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...trainingAttempt,
    id: `training-${index}`,
    score: index % 2 === 0 ? 0 : 100,
  }));
}

test("official average uses exam results and excludes training attempts", () => {
  const base = buildCanonicalPerformanceSummary({
    attempts: [...officialAttempts, ...trainingAttempts(4)],
    examResults,
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });
  const noisyTraining = buildCanonicalPerformanceSummary({
    attempts: [...officialAttempts, ...trainingAttempts(100)],
    examResults,
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });

  assert.equal(base.summary.avgScore, 62.5);
  assert.equal(base.summary.totalEvaluations, 2);
  assert.equal(base.summary.totalTrainings, 0);
  assert.equal(base.summary.totalAttempts, 2);
  assert.equal(base.attempts.length, 2);
  assert.equal(base.history.every((item) => item.source === "exam"), true);
  assert.deepEqual(noisyTraining.summary, base.summary);
  assert.deepEqual(noisyTraining.evolution, base.evolution);
  assert.deepEqual(noisyTraining.topics, base.topics);
  assert.deepEqual(noisyTraining.criteria, base.criteria);
  assert.deepEqual(noisyTraining.radarAxes, base.radarAxes);
});

test("a new official evaluation updates count, average, and evolution", () => {
  const thirdResult = {
    id: "10000000-0000-4000-8000-000000000003",
    user_id: canonicalAccess.userId,
    sport_type: sportType,
    avg_score: 75,
    total_questions: 1,
    submitted_at: "2026-08-15T12:00:00.000Z",
  };
  const result = buildCanonicalPerformanceSummary({
    attempts: [
      ...officialAttempts,
      {
        ...officialAttempts[0],
        id: "20000000-0000-4000-8000-000000000003",
        exam_result_id: thirdResult.id,
        score: 75,
        created_at: thirdResult.submitted_at,
      },
    ],
    examResults: [...examResults, thirdResult],
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });

  assert.equal(result.summary.totalEvaluations, 3);
  assert.equal(result.summary.avgScore, 66.67);
  assert.equal(result.summary.lastScore, 75);
  assert.equal(result.evolution.series.length, 3);
  assert.deepEqual(
    result.evolution.series.map((session) => session.score),
    [100, 25, 75]
  );
  assert.equal(result.evolution.series.at(-1)?.score, 75);
});

test("training without official evaluations remains a clean Sin datos state", () => {
  const result = buildCanonicalPerformanceSummary({
    attempts: [trainingAttempt],
    examResults: [],
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });

  assert.equal(result.summary.hasData, false);
  assert.equal(result.summary.avgScore, null);
  assert.equal(result.summary.status, "Sin datos");
  assert.equal(result.summary.totalAttempts, 0);
  assert.equal(result.summary.totalEvaluations, 0);
  assert.equal(result.history.length, 0);
});

test("an official result without attempts still contributes exactly one evaluation", () => {
  const resultWithoutAttempts = {
    id: "10000000-0000-4000-8000-000000000004",
    user_id: canonicalAccess.userId,
    sport_type: sportType,
    avg_score: 75,
    total_questions: 1,
    submitted_at: "2026-08-16T12:00:00.000Z",
  };
  const result = buildCanonicalPerformanceSummary({
    attempts: officialAttempts,
    examResults: [...examResults, resultWithoutAttempts],
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });

  assert.equal(result.summary.totalEvaluations, 3);
  assert.equal(result.summary.totalAttempts, 2);
  assert.equal(result.summary.avgScore, 66.67);
  assert.equal(result.evolution.series.length, 3);
});

test("foreign results, foreign attempts, and orphan attempts are excluded", () => {
  const foreignResult = {
    ...examResults[0],
    id: "10000000-0000-4000-8000-000000000099",
    user_id: "user_dev_referee_b",
    avg_score: 0,
  };
  const foreignAttemptForOwnResult = {
    ...officialAttempts[0],
    id: "20000000-0000-4000-8000-000000000098",
    user_id: "user_dev_referee_b",
    score: 0,
  };
  const foreignAttemptForForeignResult = {
    ...foreignAttemptForOwnResult,
    id: "20000000-0000-4000-8000-000000000099",
    exam_result_id: foreignResult.id,
  };
  const orphanAttempt = {
    ...officialAttempts[0],
    id: "20000000-0000-4000-8000-000000000097",
    exam_result_id: "10000000-0000-4000-8000-000000000097",
  };
  const result = buildCanonicalPerformanceSummary({
    attempts: [
      ...officialAttempts,
      foreignAttemptForOwnResult,
      foreignAttemptForForeignResult,
      orphanAttempt,
    ],
    examResults: [...examResults, foreignResult],
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });

  assert.equal(result.summary.avgScore, 62.5);
  assert.equal(result.summary.totalEvaluations, 2);
  assert.equal(result.attempts.length, 2);
  assert.equal(
    result.attempts.every(
      (attempt) => attempt.user_id === canonicalAccess.userId
    ),
    true
  );
});

test("official topic snapshots remain eligible without a current clip", () => {
  const historicalAttempt = {
    ...officialAttempts[0],
    topic: "Disputas",
    clip_id: null,
    technical_correct: true,
    disciplinary_correct: true,
  };
  const currentAttempt = {
    ...officialAttempts[1],
    topic: "Dispute",
    clip_id: "d3f00000-0000-4000-8000-000000000001",
    score: 25,
    is_correct: false,
    technical_correct: false,
    restart_correct: false,
    disciplinary_correct: false,
  };
  const result = buildCanonicalPerformanceSummary({
    attempts: [historicalAttempt, currentAttempt],
    examResults,
    sportType,
    canonicalUserId: canonicalAccess.userId,
  });

  assert.equal(result.summary.avgScore, 62.5);
  assert.equal(result.topics.length, 1);
  assert.deepEqual(
    result.topics[0] && {
      topic: result.topics[0].topic,
      attempts: result.topics[0].attempts,
      correct: result.topics[0].correct,
      errors: result.topics[0].errors,
      accuracy: result.topics[0].accuracy,
      avgScore: result.topics[0].avgScore,
      lastScore: result.topics[0].lastScore,
    },
    {
      topic: "Disputas",
      attempts: 2,
      correct: 1,
      errors: 1,
      accuracy: 50,
      avgScore: 62.5,
      lastScore: 25,
    }
  );
  const disputeAxis = result.radarAxes.find((axis) => axis.key === "disputes");
  assert.deepEqual(
    disputeAxis && {
      attempts: disputeAxis.attempts,
      measurements: disputeAxis.measurements,
      accuracy: disputeAxis.accuracy,
    },
    { attempts: 2, measurements: 4, accuracy: 50 }
  );
  assert.equal(
    result.radarAxes
      .filter((axis) => axis.key !== "disputes")
      .every((axis) => axis.attempts === 0 && axis.accuracy === null),
    true
  );
});

test("unknown and orphan official topics never become radar eligible", () => {
  const validResultId = examResults[0].id;
  const dataset = buildSportPerformanceDataset({
    attempts: [
      {
        ...officialAttempts[0],
        topic: "Arbitrary browser topic",
      },
      {
        ...officialAttempts[0],
        id: "orphan-official-attempt",
        exam_result_id: "10000000-0000-4000-8000-000000000097",
        topic: "Dispute",
      },
    ],
    examResults: [],
    rulesExamResults: [],
    clips: [],
    sportType,
    validatedOfficialExamResultIds: new Set([validResultId]),
  });

  assert.equal(dataset.items[0]?.topicValid, false);
  assert.equal(dataset.items[1]?.topicValid, false);
  assert.deepEqual(getSportTopicPerformance(dataset.items, sportType), []);
  assert.equal(
    getSportRadarData(dataset.items, sportType).every(
      (axis) => axis.attempts === 0 && axis.accuracy === null
    ),
    true
  );
});

test("training attempts retain the current clip-backed radar validation", () => {
  const dataset = buildSportPerformanceDataset({
    attempts: [{ ...trainingAttempt, topic: "Dispute" }],
    examResults: [],
    rulesExamResults: [],
    clips: [],
    sportType,
    validatedOfficialExamResultIds: new Set(),
  });

  assert.equal(dataset.items[0]?.topic, "Disputas");
  assert.equal(dataset.items[0]?.topicValid, false);
  assert.deepEqual(getSportTopicPerformance(dataset.items, sportType), []);
});

test("canonical loader resolves the external subject before all reads", async () => {
  const readUserIds: string[] = [];
  const dependencies: CanonicalPerformanceDependencies = {
    loadAccess: async (externalSubject) => {
      assert.equal(externalSubject, "masked-clerk-subject");
      return canonicalAccess;
    },
    loadOfficialRecords: async (userId) => {
      readUserIds.push(userId);
      return { attempts: officialAttempts, examResults };
    },
  };

  const result = await loadCanonicalPerformanceSummary(
    "masked-clerk-subject",
    sportType,
    dependencies
  );
  assert.equal(result.summary.avgScore, 62.5);
  assert.deepEqual(readUserIds, ["user_dev_referee_a"]);
  assert.equal(JSON.stringify(result).includes("masked-clerk-subject"), false);
});

test("summary API is read-only and returns controlled auth errors", async () => {
  let reads = 0;
  const unauthenticated = await executeCanonicalPerformanceSummaryRequest(
    new Request("http://localhost/api/performance/summary"),
    {
      getAuthenticatedUserId: async () => null,
      loadSummary: async () => {
        reads += 1;
        return null;
      },
      logError: () => undefined,
    }
  );
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), {
    error: "authentication_required",
  });
  assert.equal(reads, 0);

  const unlinked = await executeCanonicalPerformanceSummaryRequest(
    new Request("http://localhost/api/performance/summary"),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      loadSummary: async () => {
        throw new IdentityLinkRequiredError();
      },
      logError: () => undefined,
    }
  );
  assert.equal(unlinked.status, 409);
  assert.deepEqual(await unlinked.json(), { error: "identity_link_required" });

  const injectedIdentity = await executeCanonicalPerformanceSummaryRequest(
    new Request(
      "http://localhost/api/performance/summary?user_id=attacker&sportType=football_11"
    ),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      loadSummary: async () => {
        reads += 1;
        return null;
      },
      logError: () => undefined,
    }
  );
  assert.equal(injectedIdentity.status, 400);
  assert.equal(reads, 0);
});

test("ranking failures never fail the official performance model", async () => {
  const timeout = await loadOptionalRanking(
    sportType,
    async (_input, init) => {
      assert.equal(init?.signal instanceof AbortSignal, true);
      throw new DOMException("timed out", "TimeoutError");
    }
  );
  const networkFailure = await loadOptionalRanking(sportType, async () => {
    throw new TypeError("Failed to fetch");
  });
  const redirect = await loadOptionalRanking(
    sportType,
    async () => new Response(null, { status: 307 })
  );
  const unauthorized = await loadOptionalRanking(
    sportType,
    async () => Response.json({ error: "unauthorized" }, { status: 401 })
  );
  const serverFailure = await loadOptionalRanking(
    sportType,
    async () => Response.json({ error: "failed" }, { status: 500 })
  );
  const invalidJson = await loadOptionalRanking(
    sportType,
    async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );

  assert.deepEqual(timeout, { ranking: [], unavailable: true });
  assert.deepEqual(networkFailure, { ranking: [], unavailable: true });
  assert.deepEqual(redirect, { ranking: [], unavailable: true });
  assert.deepEqual(unauthorized, { ranking: [], unavailable: true });
  assert.deepEqual(serverFailure, { ranking: [], unavailable: true });
  assert.deepEqual(invalidJson, { ranking: [], unavailable: true });
});

test("active pages and server reader enforce the canonical read-only contract", () => {
  const root = process.cwd();
  const performancePage = fs.readFileSync(
    path.join(root, "app/performance/page.tsx"),
    "utf8"
  );
  const dashboardPage = fs.readFileSync(
    path.join(root, "app/dashboard/page.tsx"),
    "utf8"
  );
  const serverReader = fs.readFileSync(
    path.join(root, "lib/performance/canonicalSummary.ts"),
    "utf8"
  );
  const combinedPages = `${performancePage}\n${dashboardPage}`;

  assert.equal(combinedPages.includes("useSupabase"), false);
  assert.equal(combinedPages.includes('.from("attempts")'), false);
  assert.equal(combinedPages.includes(".eq(\"user_id\", user.id)"), false);
  assert.equal(combinedPages.includes("currentRanking = ranking.find"), false);
  assert.equal(performancePage.includes("Promise.all"), false);
  assert.equal(
    [performancePage, dashboardPage].every((source) =>
      source.includes("/api/performance/summary")
    ),
    true
  );
  assert.equal(dashboardPage.includes("/api/training/usage"), true);
  assert.match(serverReader, /provisionMissing:\s*false/);
  assert.match(serverReader, /\.not\("exam_result_id",\s*"is",\s*null\)/);
  assert.equal(serverReader.includes('from("user_roles")'), false);
  assert.equal(
    /\.(insert|update|upsert|delete)\s*\(/.test(serverReader),
    false
  );
  assert.equal(serverReader.includes("automatic_default"), false);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import { buildCanonicalPerformanceSummary } from "../performance/canonicalSummaryModel.ts";
import type { RuleQuestion } from "../questionBank.ts";
import {
  CanonicalExamError,
  executeCreateExamSessionRequest,
  executeSubmitExamRequest,
} from "./canonicalExam.ts";
import {
  startCanonicalRulesExam,
  submitCanonicalRulesExam,
  type RulesExamDependencies,
} from "./canonicalRulesExam.ts";

const root = process.cwd();
const sessionId = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const resultId = "33333333-3333-4333-8333-333333333333";
const access: AccessSnapshot = {
  userId: "user_dev_referee_a",
  globalRole: "referee",
  individualPlan: "pro",
  effectiveIndividualPlan: "pro",
  capabilities: [],
  sources: ["individual"],
  inheritedFromInstitutionIds: [],
};

function question(index: number, sportType: "football_11" | "futsal"): RuleQuestion {
  const footballTopic = index <= 17 ? `Regla ${index}` : "VAR";
  const topic = sportType === "futsal" ? (index % 3 === 0 ? "Law 13" : "Law 12") : footballTopic;
  return {
    id: `${sportType}-question-${index}`,
    sport_type: sportType,
    question_mode: "exam",
    topic,
    subtopic: sportType === "futsal" && index % 3 === 0 ? "Accumulated fouls" : "Decision",
    lawReference: topic,
    rule_reference: topic,
    season: sportType === "futsal" ? "2024-25" : "2026/27",
    difficulty: index > 17 ? "Avanzada" : "Media",
    language: "es",
    question: `Pregunta sintetica ${index}`,
    options: ["Respuesta correcta", "Respuesta incorrecta"],
    correct: 0,
    explanation: `Explicacion sintetica ${index}`,
    officialExplanation: `Fundamento oficial ${index}`,
    source_official: "https://example.invalid/rules.pdf",
    source_version: sportType === "futsal" ? "futsal-rules-v1" : "football-rules-v1",
    governing_body: sportType === "futsal" ? "FIFA" : "IFAB",
    is_active: true,
    criterion_tags:
      sportType === "futsal" && index % 3 === 0
        ? ["accumulated_fouls", "restart"]
        : ["technical"],
  };
}

function catalog(sportType: "football_11" | "futsal") {
  const count = sportType === "futsal" ? 12 : 20;
  return Array.from({ length: count }, (_, index) => question(index + 1, sportType));
}

function makeUuid(counter: number) {
  return `40000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

function harness(
  sportType: "football_11" | "futsal" = "football_11",
  overrides: Partial<RulesExamDependencies> = {}
) {
  const created: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<Record<string, unknown>> = [];
  let uuidCounter = 1;
  const sourceVersion = sportType === "futsal" ? "futsal-rules-v1" : "football-rules-v1";
  const manifest = catalog(sportType).slice(0, sportType === "futsal" ? 10 : 20).map((item, index) => ({
    source_item_type: "rule_question" as const,
    source_item_id: String(item.id),
    occurrence_id: makeUuid(index + 10),
    position: index + 1,
    source_version: sourceVersion,
  }));
  const session = {
    id: sessionId,
    user_id: access.userId,
    submission_id: submissionId,
    sport_type: sportType,
    source_version: sourceVersion,
    item_manifest: manifest,
    item_count: manifest.length,
    status: "active",
    expires_at: "2026-08-16T12:00:00.000Z",
  };
  const dependencies: RulesExamDependencies = {
    loadAccess: async () => access,
    countWeeklyExams: async () => 0,
    loadCatalog: async (requestedSport) => catalog(requestedSport),
    loadOpenSession: async () => null,
    createSession: async (input) => {
      created.push(input);
      return {
        ...session,
        submission_id: input.submissionId,
        sport_type: input.sportType,
        source_version: input.sourceVersion,
        item_manifest: input.manifest,
        item_count: input.manifest.length,
        expires_at: input.expiresAt,
      };
    },
    loadSession: async () => session,
    submitRpc: async (parameters) => {
      rpcCalls.push(parameters);
      const attempts = parameters.p_evaluated_attempts as Array<Record<string, unknown>>;
      return {
        exam_result_id: resultId,
        exam_session_id: sessionId,
        submission_id: submissionId,
        avg_score:
          (attempts.filter((attempt) => attempt.is_correct === true).length / attempts.length) * 100,
        correct_count: attempts.filter((attempt) => attempt.is_correct === true).length,
        total_questions: attempts.length,
        idempotent_replay: false,
      };
    },
    randomUuid: () => (uuidCounter++ === 1 ? submissionId : makeUuid(uuidCounter + 100)),
    now: () => new Date("2026-08-15T12:00:00.000Z"),
    ...overrides,
  };
  return { dependencies, created, rpcCalls, session };
}

function answersFor(session: ReturnType<typeof harness>["session"], selectedOption = 0) {
  return session.item_manifest.map((item) => ({
    occurrence_id: item.occurrence_id,
    selected_option: selectedOption,
  }));
}

test("Football and Futsal sessions use canonical identity and expose no answer key", async () => {
  for (const [publicSport, databaseSport, expectedCount] of [
    ["football", "football_11", 20],
    ["futsal", "futsal", 10],
  ] as const) {
    const testHarness = harness(databaseSport);
    const session = await startCanonicalRulesExam(
      "clerk-subject-never-persisted",
      { sportType: publicSport },
      testHarness.dependencies
    );
    assert.equal(session.questions.length, expectedCount);
    assert.equal(testHarness.created[0].userId, "user_dev_referee_a");
    assert.equal(JSON.stringify(testHarness.created).includes("clerk-subject"), false);
    assert.deepEqual(Object.keys(session).sort(), [
      "expiresAt",
      "id",
      "questions",
      "sportType",
      "submissionId",
    ]);
    for (const publicQuestion of session.questions) {
      assert.deepEqual(Object.keys(publicQuestion).sort(), [
        "difficulty",
        "id",
        "lawReference",
        "occurrenceId",
        "options",
        "question",
      ]);
      assert.equal("correct" in publicQuestion, false);
      assert.equal("explanation" in publicQuestion, false);
      assert.equal("officialExplanation" in publicQuestion, false);
      assert.equal("criterion_tags" in publicQuestion, false);
      assert.equal("topic" in publicQuestion, false);
      assert.equal("subtopic" in publicQuestion, false);
    }
    const manifest = testHarness.created[0].manifest as Array<Record<string, unknown>>;
    assert.equal(manifest.every((item) => item.source_item_type === "rule_question"), true);

    const response = await executeCreateExamSessionRequest(
      new Request("http://localhost/api/rules-exams/sessions", {
        method: "POST",
        body: JSON.stringify({ sportType: publicSport }),
      }),
      {
        getAuthenticatedUserId: async () => "masked-subject",
        startExam: async () => session,
        logError: () => undefined,
      }
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { session });
  }
});

test("refresh returns the immutable open-session manifest without creating another session", async () => {
  const testHarness = harness("futsal");
  let creates = 0;
  const result = await startCanonicalRulesExam("subject", { sportType: "futsal" }, {
    ...testHarness.dependencies,
    loadOpenSession: async () => testHarness.session,
    createSession: async () => {
      creates += 1;
      return testHarness.session;
    },
  });
  assert.equal(creates, 0);
  assert.deepEqual(
    result.questions.map((item) => item.occurrenceId),
    testHarness.session.item_manifest.map((item) => item.occurrence_id)
  );
});

test("submit derives identity, score, topics, criteria, and answer key server-side", async () => {
  for (const sportType of ["football_11", "futsal"] as const) {
    const testHarness = harness(sportType);
    const rawAnswers = answersFor(testHarness.session);
    const result = await submitCanonicalRulesExam(
      "raw-clerk-subject",
      sessionId,
      { submission_id: submissionId, answers: rawAnswers },
      testHarness.dependencies
    );
    assert.equal(result.avgScore, 100);
    assert.equal(testHarness.rpcCalls.length, 1);
    assert.equal(testHarness.rpcCalls[0].p_user_id, "user_dev_referee_a");
    const serialized = JSON.stringify(testHarness.rpcCalls[0]);
    assert.equal(serialized.includes("raw-clerk-subject"), false);
    const attempts = testHarness.rpcCalls[0].p_evaluated_attempts as Array<Record<string, unknown>>;
    assert.equal(attempts.every((attempt) => attempt.source_item_type === "rule_question"), true);
    assert.equal(attempts.every((attempt) => attempt.score === 1 && attempt.max_score === 1), true);
    assert.equal(attempts.every((attempt) => attempt.technical_correct === true), true);
    assert.equal(attempts.every((attempt) => typeof attempt.correct_decision === "string"), true);
  }
});

test("client-controlled identity and derived exam fields are rejected", async () => {
  for (const extra of [
    { user_id: "attacker" },
    { canonicalUserId: "attacker" },
    { score: 100 },
    { percentage: 100 },
    { correct_answer: 0 },
    { payload_hash: "a".repeat(64) },
    { exam_result_id: resultId },
  ]) {
    const testHarness = harness();
    await assert.rejects(
      submitCanonicalRulesExam(
        "subject",
        sessionId,
        { submission_id: submissionId, answers: answersFor(testHarness.session), ...extra },
        testHarness.dependencies
      ),
      CanonicalExamError
    );
    assert.equal(testHarness.rpcCalls.length, 0);
  }
});

test("missing, duplicate, foreign, and invalid answers are rejected before persistence", async () => {
  const baseHarness = harness("futsal");
  const validAnswers = answersFor(baseHarness.session);
  const invalidCases = [
    {
      code: "invalid_answer_count",
      answers: validAnswers.slice(0, -1),
    },
    {
      code: "invalid_answer_occurrence",
      answers: [validAnswers[0], ...validAnswers.slice(0, -1)],
    },
    {
      code: "invalid_answer_occurrence",
      answers: [
        { ...validAnswers[0], occurrence_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        ...validAnswers.slice(1),
      ],
    },
    {
      code: "invalid_selected_option",
      answers: [{ ...validAnswers[0], selected_option: 99 }, ...validAnswers.slice(1)],
    },
  ];

  for (const invalidCase of invalidCases) {
    const testHarness = harness("futsal");
    await assert.rejects(
      submitCanonicalRulesExam(
        "subject",
        sessionId,
        { submission_id: submissionId, answers: invalidCase.answers },
        testHarness.dependencies
      ),
      (error: unknown) =>
        error instanceof CanonicalExamError && error.code === invalidCase.code
    );
    assert.equal(testHarness.rpcCalls.length, 0);
  }

  const unansweredHarness = harness("futsal");
  const unanswered = answersFor(unansweredHarness.session).map((answer) => ({
    ...answer,
    selected_option: null,
  }));
  const result = await submitCanonicalRulesExam(
    "subject",
    sessionId,
    { submission_id: submissionId, answers: unanswered },
    unansweredHarness.dependencies
  );
  assert.equal(result.avgScore, 0);
  assert.equal(unansweredHarness.rpcCalls.length, 1);
});

test("unlinked Development identity returns 409 before reads or writes", async () => {
  let calls = 0;
  const response = await executeCreateExamSessionRequest(
    new Request("http://localhost/api/rules-exams/sessions", {
      method: "POST",
      body: JSON.stringify({ sportType: "futsal" }),
    }),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      startExam: async () => {
        throw new IdentityLinkRequiredError();
      },
      logError: () => undefined,
    }
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "identity_link_required" });

  const testHarness = harness("futsal", {
    loadAccess: async () => {
      throw new IdentityLinkRequiredError();
    },
    loadSession: async () => {
      calls += 1;
      return null;
    },
    submitRpc: async () => {
      calls += 1;
      return null;
    },
  });
  await assert.rejects(
    submitCanonicalRulesExam(
      "unlinked",
      sessionId,
      { submission_id: submissionId, answers: answersFor(testHarness.session) },
      testHarness.dependencies
    ),
    IdentityLinkRequiredError
  );
  assert.equal(calls, 0);
});

test("unauthenticated rules submit is 401 JSON", async () => {
  let calls = 0;
  const response = await executeSubmitExamRequest(
    new Request(`http://localhost/api/rules-exams/sessions/${sessionId}/submit`, {
      method: "POST",
      body: "{}",
    }),
    sessionId,
    {
      getAuthenticatedUserId: async () => null,
      submitExam: async () => {
        calls += 1;
        return null;
      },
      logError: () => undefined,
    }
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
  assert.equal(calls, 0);
});

test("same answers replay idempotently while changed answers conflict", async () => {
  const testHarness = harness("futsal");
  let storedHash: string | null = null;
  let storedPayload: unknown = null;
  let resultRows = 0;
  const dependencies: RulesExamDependencies = {
    ...testHarness.dependencies,
    submitRpc: async (parameters) => {
      if (storedHash === null) {
        storedHash = parameters.p_payload_hash;
        storedPayload = parameters.p_evaluated_attempts;
        resultRows += 1;
      } else if (storedHash !== parameters.p_payload_hash) {
        throw { message: "submission_id was already used with different content" };
      }
      return {
        exam_result_id: resultId,
        exam_session_id: sessionId,
        submission_id: submissionId,
        avg_score: 100,
        correct_count: 10,
        total_questions: 10,
        idempotent_replay: storedPayload !== null,
      };
    },
  };
  const sameBody = { submission_id: submissionId, answers: answersFor(testHarness.session) };
  await submitCanonicalRulesExam("subject", sessionId, sameBody, dependencies);
  await submitCanonicalRulesExam("subject", sessionId, sameBody, dependencies);
  assert.equal(resultRows, 1);
  await assert.rejects(
    submitCanonicalRulesExam(
      "subject",
      sessionId,
      { submission_id: submissionId, answers: answersFor(testHarness.session, 1) },
      dependencies
    ),
    (error: unknown) => error instanceof CanonicalExamError && error.code === "submission_conflict"
  );
  assert.equal(resultRows, 1);
});

test("ownership mismatch and a new submission on a submitted session are rejected", async () => {
  const otherOwner = harness("futsal", {
    loadSession: async () => ({ ...harness("futsal").session, user_id: "user_dev_referee_b" }),
  });
  await assert.rejects(
    submitCanonicalRulesExam(
      "subject",
      sessionId,
      { submission_id: submissionId, answers: answersFor(otherOwner.session) },
      otherOwner.dependencies
    ),
    (error: unknown) => error instanceof CanonicalExamError && error.code === "exam_session_not_found"
  );
  assert.equal(otherOwner.rpcCalls.length, 0);

  const submitted = harness("futsal", {
    loadSession: async () => ({
      ...harness("futsal").session,
      status: "submitted",
      submission_id: submissionId,
    }),
  });
  await assert.rejects(
    submitCanonicalRulesExam(
      "subject",
      sessionId,
      {
        submission_id: "99999999-9999-4999-8999-999999999999",
        answers: answersFor(submitted.session),
      },
      submitted.dependencies
    ),
    (error: unknown) => error instanceof CanonicalExamError && error.code === "submission_conflict"
  );
  assert.equal(submitted.rpcCalls.length, 0);
});

test("official rule-question attempts are eligible for canonical performance and training stays separate", () => {
  const examResult = {
    id: resultId,
    user_id: access.userId,
    sport_type: "futsal" as const,
    avg_score: 50,
    total_questions: 2,
    created_at: "2026-08-15T12:00:00.000Z",
  };
  const officialAttempts = [
    {
      id: "attempt-rule-1",
      user_id: access.userId,
      sport_type: "futsal" as const,
      exam_result_id: resultId,
      source_item_type: "rule_question",
      source_item_id: "futsal-question-1",
      source_occurrence_id: makeUuid(501),
      topic: "Disputas",
      score: 100,
      is_correct: true,
      technical_correct: true,
      created_at: "2026-08-15T12:00:00.000Z",
    },
    {
      id: "attempt-rule-2",
      user_id: access.userId,
      sport_type: "futsal" as const,
      exam_result_id: resultId,
      source_item_type: "rule_question",
      source_item_id: "futsal-question-2",
      source_occurrence_id: makeUuid(502),
      topic: "Faltas tacticas",
      score: 0,
      is_correct: false,
      technical_correct: false,
      created_at: "2026-08-15T12:00:00.000Z",
    },
  ];
  const trainingAttempt = {
    ...officialAttempts[0],
    id: "training-attempt",
    exam_result_id: null,
    score: 0,
  };
  const unknownOfficialAttempt = {
    ...officialAttempts[0],
    id: "unknown-official-attempt",
    source_item_id: "retired-rule-question",
    source_occurrence_id: makeUuid(503),
    topic: "Topico arbitrario",
  };
  const orphanOfficialAttempt = {
    ...officialAttempts[0],
    id: "orphan-official-attempt",
    exam_result_id: "99999999-9999-4999-8999-999999999998",
    source_occurrence_id: makeUuid(504),
  };
  const summary = buildCanonicalPerformanceSummary({
    attempts: [
      ...officialAttempts,
      unknownOfficialAttempt,
      orphanOfficialAttempt,
      trainingAttempt,
    ],
    examResults: [examResult],
    sportType: "futsal",
    canonicalUserId: access.userId,
  });
  assert.equal(summary.summary.avgScore, 50);
  assert.equal(summary.summary.totalEvaluations, 1);
  assert.equal(summary.attempts.length, 3);
  assert.equal(summary.topics.find((item) => item.topic === "Disputas")?.attempts, 1);
  assert.equal(summary.topics.find((item) => item.topic === "Faltas tacticas")?.attempts, 1);
  assert.equal(summary.topics.some((item) => item.topic === "Topico arbitrario"), false);
});

test("rules clients and endpoints contain no legacy browser persistence or identity", () => {
  const sharedClient = fs.readFileSync(
    path.join(root, "components/CanonicalRulesExamClient.tsx"),
    "utf8"
  );
  const futsalClient = fs.readFileSync(path.join(root, "components/FutsalRulesExamClient.tsx"), "utf8");
  const footballPage = fs.readFileSync(path.join(root, "app/training/rules-exam/page.tsx"), "utf8");
  const serverHelper = fs.readFileSync(path.join(root, "lib/exams/canonicalRulesExam.ts"), "utf8");
  const combinedClient = `${sharedClient}\n${futsalClient}\n${footballPage}`;
  const activeSources = ["app", "components", "lib"]
    .flatMap((directory) => collectSourceFiles(path.join(root, directory)))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  assert.match(sharedClient, /fetch\("\/api\/rules-exams\/sessions"/);
  assert.match(sharedClient, /\/api\/rules-exams\/sessions\/\$\{session\.id\}\/submit/);
  assert.doesNotMatch(combinedClient, /useUser|user\.id|useSupabase|rulesQuestions|futsalRulesExamQuestions/);
  assert.doesNotMatch(combinedClient, /from\("rules_exam_results"\)|\.insert\(/);
  assert.doesNotMatch(combinedClient, /Math\.random/);
  assert.match(serverHelper, /import "server-only"/);
  assert.match(serverHelper, /provisionMissing: false/);
  assert.match(serverHelper, /source_item_type: "rule_question"/);
  assert.match(serverHelper, /supabase\.rpc\("submit_referee_exam", parameters\)/);
  assert.doesNotMatch(serverHelper, /rules_exam_results|user_roles|automatic_default/);
  assert.doesNotMatch(
    activeSources,
    /from\(\s*["']rules_exam_results["']\s*\)\s*\.(?:insert|update|upsert|delete)/
  );
});

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

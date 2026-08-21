import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CommunicationFeedbackError,
  hashCanonicalCommunicationInput,
  parseCommunicationFeedbackInput,
  submitCanonicalCommunicationFeedback,
  type CommunicationFeedbackDependencies,
} from "./communicationFeedback.ts";

const root = process.cwd();
const submissionId = "81000000-0000-4000-8000-000000000001";
const clipId = "81000000-0000-4000-8000-000000000002";
const attemptId = "81000000-0000-4000-8000-000000000003";
const runId = "81000000-0000-4000-8000-000000000004";

function input(extra: Record<string, unknown> = {}) {
  return {
    submissionId,
    mode: "ifab_english",
    clipId,
    sportType: "football_11",
    answer: "The defender committed a careless challenge.",
    feedbackLanguage: "es",
    hasVoiceRecording: false,
    ...extra,
  };
}

const confidence = {
  label: "high" as const,
  score: 1,
  reasons: ["official_evidence"],
  requiresHumanReview: false,
};

const reference = {
  id: `clip:${clipId}`,
  evidenceType: "clip" as const,
  sourceTable: "clips",
  sourceId: clipId,
  title: "Synthetic communication clip",
  authority: "IFAB",
  sportType: "football_11" as const,
  ruleReference: "Law 12",
  sourceVersion: "2026/27",
  officialUrl: "https://development.invalid/clip",
  isOfficial: true,
  normativeStatus: "current",
  reviewedAt: null,
};

function generated() {
  return {
    runId,
    value: {
      feedback: "Clear technical explanation.",
      scores: {
        terminology: 8,
        clarity: 7,
        precision: 9,
        structure: 6,
        vocabulary: 8,
        grammar: 7,
        global: 8,
        globalLabel: "Solido",
        modelAnswer: "The defender committed a careless challenge.",
      },
      humanReviewReason: null,
    },
    confidence,
    evidence: [reference],
  };
}

function rpcResult(
  parameters: Parameters<CommunicationFeedbackDependencies["persist"]>[0],
  status: "created" | "already_recorded" = "created"
) {
  const feedback = parameters.p_feedback;
  return {
    status,
    attempt_id: attemptId,
    feedback: feedback.feedback,
    criterion_result: {
      scores: feedback.scores,
      global_label: feedback.global_label,
      model_answer: feedback.model_answer,
      human_review_reason: feedback.human_review_reason,
      confidence: feedback.confidence,
      evidence: feedback.evidence,
      coach_run_id: feedback.coach_run_id,
      oral_evaluable: false,
    },
  };
}

function dependencies(
  overrides: Partial<CommunicationFeedbackDependencies> = {}
) {
  const calls: Array<Parameters<CommunicationFeedbackDependencies["persist"]>[0]> = [];
  const value: CommunicationFeedbackDependencies = {
    findExisting: async () => null,
    loadEvidence: async () => [{ reference, facts: { topic: "Disputas" } }],
    generate: async () => generated(),
    persist: async (parameters) => {
      calls.push(parameters);
      return rpcResult(parameters);
    },
    ...overrides,
  };
  return { value, calls };
}

test("communication feedback persists only the canonical user", async () => {
  const harness = dependencies();
  const result = await submitCanonicalCommunicationFeedback(
    "user_dev_referee_a",
    input(),
    harness.value
  );

  assert.equal(result.status, "created");
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].p_user_id, "user_dev_referee_a");
  assert.equal(JSON.stringify(harness.calls[0]).includes("user_clerk_"), false);
  assert.equal("score" in harness.calls[0].p_feedback, false);
  assert.equal("exam_result_id" in harness.calls[0].p_feedback, false);
  assert.equal(harness.calls[0].p_feedback.oral_evaluable, false);
});

test("the browser cannot provide identity, scores, feedback, or derived metadata", async () => {
  for (const extra of [
    { user_id: "attacker" },
    { canonicalUserId: "attacker" },
    { score: 100 },
    { feedback: "forged" },
    { canonical_payload_hash: "forged" },
    { exam_result_id: attemptId },
    { topic: "forged" },
  ]) {
    const harness = dependencies();
    await assert.rejects(
      submitCanonicalCommunicationFeedback(
        "user_dev_referee_a",
        input(extra),
        harness.value
      ),
      CommunicationFeedbackError
    );
    assert.equal(harness.calls.length, 0);
  }
});

test("canonical input hashing is deterministic and semantic changes conflict", () => {
  const first = parseCommunicationFeedbackInput(input());
  const reordered = parseCommunicationFeedbackInput({
    hasVoiceRecording: false,
    feedbackLanguage: "es",
    answer: "The defender committed a careless challenge.",
    sportType: "football_11",
    clipId,
    mode: "ifab_english",
    submissionId,
  });
  assert.equal(
    hashCanonicalCommunicationInput(first),
    hashCanonicalCommunicationInput(reordered)
  );
  assert.notEqual(
    hashCanonicalCommunicationInput(first),
    hashCanonicalCommunicationInput({ ...first, answer: "Different answer" })
  );
});

test("communication input normalizes surrounding spaces and line breaks", () => {
  const padded = parseCommunicationFeedbackInput(
    input({ answer: "  The defender committed a careless challenge.  " })
  );
  const multiline = parseCommunicationFeedbackInput(
    input({ answer: "\n\tThe defender committed a careless challenge.\r\n" })
  );
  const canonical = parseCommunicationFeedbackInput(input());

  assert.equal(padded.answer, canonical.answer);
  assert.equal(multiline.answer, canonical.answer);
  assert.equal(
    hashCanonicalCommunicationInput(padded),
    hashCanonicalCommunicationInput(canonical)
  );
});

test("communication input rejects text containing only whitespace", () => {
  assert.throws(
    () =>
      parseCommunicationFeedbackInput(
        input({ answer: " \n\t ", hasVoiceRecording: true })
      ),
    (error: unknown) =>
      error instanceof CommunicationFeedbackError &&
      error.code === "invalid_communication_feedback" &&
      error.status === 400
  );
});

test("a replay differing only by answer whitespace remains idempotent", async () => {
  const canonical = parseCommunicationFeedbackInput(input());
  let modelCalls = 0;
  let writes = 0;
  const harness = dependencies({
    findExisting: async () => ({
      id: attemptId,
      activity_type: "english_communication_feedback",
      source_item_type: "communication_feedback",
      canonical_payload_hash: hashCanonicalCommunicationInput(canonical),
      feedback: generated().value.feedback,
      criterion_result: rpcResult({
        p_user_id: "user_dev_referee_a",
        p_submission_id: submissionId,
        p_payload_hash: hashCanonicalCommunicationInput(canonical),
        p_feedback: {
          ...generated().value,
          scores: generated().value.scores,
          global_label: generated().value.scores.globalLabel,
          model_answer: generated().value.scores.modelAnswer,
          confidence,
          evidence: [reference],
          coach_run_id: runId,
        },
      }).criterion_result,
    }),
    generate: async () => {
      modelCalls += 1;
      return generated();
    },
    persist: async () => {
      writes += 1;
      return null;
    },
  });

  const result = await submitCanonicalCommunicationFeedback(
    "user_dev_referee_a",
    input({ answer: "  The defender committed a careless challenge.\n" }),
    harness.value
  );

  assert.equal(result.status, "already_recorded");
  assert.equal(modelCalls, 0);
  assert.equal(writes, 0);
});

test("an identical replay returns stored feedback without model or persistence", async () => {
  const parsed = parseCommunicationFeedbackInput(input());
  let evidenceReads = 0;
  let modelCalls = 0;
  let writes = 0;
  const harness = dependencies({
    findExisting: async () => ({
      id: attemptId,
      activity_type: "english_communication_feedback",
      source_item_type: "communication_feedback",
      canonical_payload_hash: hashCanonicalCommunicationInput(parsed),
      feedback: generated().value.feedback,
      criterion_result: rpcResult({
        p_user_id: "user_dev_referee_a",
        p_submission_id: submissionId,
        p_payload_hash: hashCanonicalCommunicationInput(parsed),
        p_feedback: {
          ...generated().value,
          scores: generated().value.scores,
          global_label: generated().value.scores.globalLabel,
          model_answer: generated().value.scores.modelAnswer,
          confidence,
          evidence: [reference],
          coach_run_id: runId,
        },
      }).criterion_result,
    }),
    loadEvidence: async () => {
      evidenceReads += 1;
      return [];
    },
    generate: async () => {
      modelCalls += 1;
      return generated();
    },
    persist: async () => {
      writes += 1;
      return null;
    },
  });

  const result = await submitCanonicalCommunicationFeedback(
    "user_dev_referee_a",
    input(),
    harness.value
  );
  assert.equal(result.status, "already_recorded");
  assert.equal(evidenceReads, 0);
  assert.equal(modelCalls, 0);
  assert.equal(writes, 0);
});

test("the same submission with a different payload is a controlled conflict", async () => {
  const harness = dependencies({
    findExisting: async () => ({
      id: attemptId,
      activity_type: "english_communication_feedback",
      source_item_type: "communication_feedback",
      canonical_payload_hash: "a".repeat(64),
      feedback: "Stored",
      criterion_result: {},
    }),
  });
  await assert.rejects(
    submitCanonicalCommunicationFeedback(
      "user_dev_referee_a",
      input(),
      harness.value
    ),
    (error: unknown) =>
      error instanceof CommunicationFeedbackError &&
      error.code === "submission_conflict" &&
      error.status === 409
  );
  assert.equal(harness.calls.length, 0);
});

test("concurrent identical submissions produce one logical attempt", async () => {
  const stored = new Map<string, ReturnType<typeof rpcResult>>();
  let inserts = 0;
  const harness = dependencies({
    persist: async (parameters) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const current = stored.get(parameters.p_submission_id);
      if (current) return { ...current, status: "already_recorded" };
      inserts += 1;
      const created = rpcResult(parameters);
      stored.set(parameters.p_submission_id, created);
      return created;
    },
  });

  const results = await Promise.all([
    submitCanonicalCommunicationFeedback("user_dev_referee_a", input(), harness.value),
    submitCanonicalCommunicationFeedback("user_dev_referee_a", input(), harness.value),
  ]);
  assert.equal(inserts, 1);
  assert.equal(stored.size, 1);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["already_recorded", "created"]
  );
});

test("a persistence failure returns no successful attempt", async () => {
  let persisted = 0;
  const harness = dependencies({
    persist: async () => {
      persisted += 1;
      throw { code: "23514", message: "private constraint detail" };
    },
  });
  await assert.rejects(
    submitCanonicalCommunicationFeedback(
      "user_dev_referee_a",
      input(),
      harness.value
    ),
    (error: unknown) =>
      error instanceof CommunicationFeedbackError &&
      error.code === "communication_feedback_unavailable" &&
      !error.publicMessage.includes("constraint")
  );
  assert.equal(persisted, 1);
  assert.equal(harness.calls.length, 0);
});

test("unverified audio is persisted as non-evaluable without scores", async () => {
  const harness = dependencies();
  await submitCanonicalCommunicationFeedback(
    "user_dev_referee_a",
    input({ answer: "", hasVoiceRecording: true }),
    harness.value
  );
  const feedback = harness.calls[0].p_feedback;
  assert.equal(feedback.oral_evaluable, false);
  assert.deepEqual(feedback.scores, {
    terminology: null,
    clarity: null,
    precision: null,
    structure: null,
    vocabulary: null,
    grammar: null,
    global: null,
  });
});

test("communication attempts remain training-only and outside official performance", () => {
  const performanceReader = fs.readFileSync(
    path.join(root, "lib/performance/canonicalSummary.ts"),
    "utf8"
  );
  const performanceModel = fs.readFileSync(
    path.join(root, "lib/performance/canonicalSummaryModel.ts"),
    "utf8"
  );
  const migration = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/202608150001_canonical_communication_feedback.sql"
    ),
    "utf8"
  );
  assert.match(performanceReader, /\.not\("exam_result_id",\s*"is",\s*null\)/);
  assert.match(performanceModel, /Boolean\(attempt\.exam_result_id\)/);
  assert.match(migration, /exam_result_id,[\s\S]+?null,/);
  assert.match(migration, /score,[\s\S]+?null,/);
});

test("EnglishExercise uses the canonical endpoint and leaves trivia unchanged", () => {
  const client = fs.readFileSync(
    path.join(root, "components/EnglishExercise.tsx"),
    "utf8"
  );
  const route = fs.readFileSync(
    path.join(root, "app/api/english-feedback/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(client, /insertAttemptSafely|attemptPersistence|user\.id/);
  assert.doesNotMatch(client, /\.from\(["']attempts["']\)/);
  assert.match(client, /submissionId,[\s\S]+?\/api\/english-feedback/);
  assert.match(client, /!currentClip[\s\S]+?return;[\s\S]+?fetch\(["']\/api\/english-feedback["']/);
  assert.match(client, /clipId:\s*currentClip\.id/);
  assert.match(client, /answer:\s*answer\.trim\(\)/);
  assert.match(client, /kind:\s*"ifab_trivia"/);
  assert.match(client, /submitTrainingAttempt/);
  assert.match(route, /prepareCoachRequest\(request, FEATURE\)/);
  assert.match(route, /submitCanonicalCommunicationFeedback/);
  assert.doesNotMatch(route, /auth\(\)|ensureUserRecords|user_roles|automatic_default/);
});

test("Coach authentication remains 401/409 before communication persistence", () => {
  const security = fs.readFileSync(
    path.join(root, "lib/coach/security.ts"),
    "utf8"
  );
  const errors = fs.readFileSync(
    path.join(root, "lib/coach/errors.ts"),
    "utf8"
  );
  assert.match(security, /if \(!identity\) throw new CoachUnauthorizedError\(\)/);
  assert.match(security, /provisionMissing:\s*false/);
  assert.match(errors, /identity_link_required[\s\S]+?{ status: 409 }/);
  assert.match(errors, /"UNAUTHORIZED",\s*401/);
});

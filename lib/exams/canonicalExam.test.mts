import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  CanonicalExamError,
  executeCreateExamSessionRequest,
  executeSubmitExamRequest,
  startCanonicalExam,
  submitCanonicalExam,
  type CanonicalExamDependencies,
} from "./canonicalExam.ts";

const root = process.cwd();
const sessionId = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const clipId = "33333333-3333-4333-8333-333333333333";
const occurrenceId = "44444444-4444-4444-8444-444444444444";
const resultId = "55555555-5555-4555-8555-555555555555";
const access: AccessSnapshot = {
  userId: "user_dev_referee_a",
  globalRole: "referee",
  individualPlan: "pro",
  effectiveIndividualPlan: "pro",
  capabilities: [],
  sources: ["individual"],
  inheritedFromInstitutionIds: [],
};
const clip = {
  id: clipId,
  sport_type: "football_11" as const,
  title: "Synthetic offside exam clip",
  description: "Synthetic evaluation content",
  video_url: "https://development.invalid/video.mp4",
  topic: "Offside",
  subtopic: null,
  sub_type: "interferir_juego",
  module: "campo",
  type: "video",
  category: "evaluation",
  training_type: "exam",
  difficulty: "basic",
  mode: "field",
  correct_foul: true,
  correct_restart: "Tiro libre indirecto",
  correct_discipline: "Sin sancion",
  correct_var: false,
  rule_reference: "Law 11",
  season: "2026/27",
  source_version: "synthetic-v1",
};
const manifest = [{
  source_item_type: "global_clip" as const,
  source_item_id: clipId,
  occurrence_id: occurrenceId,
  position: 1,
  source_version: "synthetic-v1",
}];
const session = {
  id: sessionId,
  user_id: access.userId,
  submission_id: submissionId,
  sport_type: "football_11" as const,
  item_manifest: manifest,
  item_count: 1,
  status: "active",
  expires_at: "2026-08-15T12:00:00.000Z",
};

function answer(overrides: Record<string, unknown> = {}) {
  return {
    occurrence_id: occurrenceId,
    foul: true,
    restart: "Tiro libre indirecto",
    discipline: "Sin sancion",
    offside_reason: "interferir_juego",
    handball_reason: null,
    time_spent_seconds: 12,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return { submission_id: submissionId, answers: [answer()], ...overrides };
}

function harness(overrides: Partial<CanonicalExamDependencies> = {}) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const uuids = [submissionId, occurrenceId];
  const dependencies: CanonicalExamDependencies = {
    loadAccess: async () => access,
    countWeeklyExams: async () => 0,
    listAvailableClips: async () => [clip],
    createSession: async (input) => ({
      ...session,
      submission_id: input.submissionId,
      item_manifest: input.manifest,
      item_count: input.manifest.length,
      expires_at: input.expiresAt,
    }),
    loadSession: async () => session,
    loadExistingResult: async () => null,
    loadClipsByIds: async () => [clip],
    submitRpc: async (parameters) => {
      rpcCalls.push(parameters);
      return {
        exam_result_id: resultId,
        exam_session_id: sessionId,
        submission_id: submissionId,
        avg_score: 100,
        correct_count: 1,
        total_questions: 1,
        idempotent_replay: false,
      };
    },
    randomUuid: () => uuids.shift() ?? occurrenceId,
    now: () => new Date("2026-08-14T12:00:00.000Z"),
    ...overrides,
  };
  return { dependencies, rpcCalls };
}

test("session uses canonical identity and does not expose correct answers", async () => {
  const created: Array<Record<string, unknown>> = [];
  const testHarness = harness({
    createSession: async (input) => {
      created.push(input);
      return { ...session, submission_id: input.submissionId, item_manifest: input.manifest };
    },
  });
  const result = await startCanonicalExam(
    "clerk-subject-never-persisted",
    { sportType: "football_11" },
    testHarness.dependencies
  );
  assert.equal(created[0].userId, "user_dev_referee_a");
  assert.equal(JSON.stringify(created).includes("clerk-subject"), false);
  assert.equal(result.questions.length, 1);
  assert.equal(JSON.stringify(result).includes("correct_restart"), false);
});

test("weekly limit and unlinked identity stop before writes", async () => {
  let writes = 0;
  const limited = harness({
    loadAccess: async () => ({ ...access, individualPlan: "basic", effectiveIndividualPlan: "basic" }),
    countWeeklyExams: async () => 1,
    createSession: async () => {
      writes += 1;
      return session;
    },
  });
  await assert.rejects(
    startCanonicalExam("subject", { sportType: "football_11" }, limited.dependencies),
    (error: unknown) => error instanceof CanonicalExamError && error.code === "weekly_exam_limit_reached"
  );
  assert.equal(writes, 0);

  const response = await executeCreateExamSessionRequest(
    new Request("http://localhost/api/exams/sessions", { method: "POST", body: "{}" }),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      startExam: async () => { throw new IdentityLinkRequiredError(); },
      logError: () => undefined,
    }
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "identity_link_required" });

  let readsOrWrites = 0;
  const unlinked = harness({
    loadAccess: async () => { throw new IdentityLinkRequiredError(); },
    loadSession: async () => { readsOrWrites += 1; return session; },
    submitRpc: async () => { readsOrWrites += 1; return null; },
  });
  await assert.rejects(
    submitCanonicalExam("unlinked", sessionId, body(), unlinked.dependencies),
    IdentityLinkRequiredError
  );
  assert.equal(readsOrWrites, 0);
});

test("unauthenticated submit is 401 JSON and never reaches persistence", async () => {
  let calls = 0;
  const response = await executeSubmitExamRequest(
    new Request(`http://localhost/api/exams/sessions/${sessionId}/submit`, {
      method: "POST",
      body: JSON.stringify(body()),
    }),
    sessionId,
    {
      getAuthenticatedUserId: async () => null,
      submitExam: async () => { calls += 1; return null; },
      logError: () => undefined,
    }
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
  assert.equal(calls, 0);
});

test("submit sends canonical identity and server-derived score to existing RPC", async () => {
  const testHarness = harness();
  await submitCanonicalExam("raw-clerk-subject", sessionId, body(), testHarness.dependencies);
  assert.equal(testHarness.rpcCalls.length, 1);
  assert.equal(testHarness.rpcCalls[0].p_user_id, "user_dev_referee_a");
  assert.equal(JSON.stringify(testHarness.rpcCalls[0]).includes("raw-clerk-subject"), false);
  const evaluated = testHarness.rpcCalls[0].p_evaluated_attempts as Array<Record<string, unknown>>;
  assert.equal(evaluated[0].score, 100);
  assert.equal(evaluated[0].correct_restart, "Tiro libre indirecto");
});

test("client-controlled identity and derived fields are rejected", async () => {
  for (const extra of [
    { user_id: "attacker" },
    { canonicalUserId: "attacker" },
    { score: 100 },
    { correct_answer: "attacker" },
    { exam_result_id: resultId },
    { payload_hash: "a".repeat(64) },
  ]) {
    const testHarness = harness();
    await assert.rejects(
      submitCanonicalExam("subject", sessionId, body(extra), testHarness.dependencies),
      CanonicalExamError
    );
    assert.equal(testHarness.rpcCalls.length, 0);
  }
});

test("same answers replay while changed answers conflict before RPC", async () => {
  const first = harness();
  await submitCanonicalExam("subject", sessionId, body(), first.dependencies);
  const firstCall = first.rpcCalls[0];
  const replay = harness({
    loadExistingResult: async () => ({
      payload_hash: String(firstCall.p_payload_hash),
      details: firstCall.p_evaluated_attempts,
    }),
    submitRpc: async (parameters) => ({
      exam_result_id: resultId,
      exam_session_id: sessionId,
      submission_id: parameters.p_submission_id,
      avg_score: 100,
      correct_count: 1,
      total_questions: 1,
      idempotent_replay: true,
    }),
  });
  const replayed = await submitCanonicalExam("subject", sessionId, body(), replay.dependencies);
  assert.equal(replayed.idempotentReplay, true);

  let conflictRpcCalls = 0;
  const conflict = harness({
    loadExistingResult: async () => ({
      payload_hash: String(firstCall.p_payload_hash),
      details: firstCall.p_evaluated_attempts,
    }),
    submitRpc: async () => { conflictRpcCalls += 1; return null; },
  });
  await assert.rejects(
    submitCanonicalExam(
      "subject",
      sessionId,
      body({ answers: [answer({ offside_reason: "sacar_ventaja" })] }),
      conflict.dependencies
    ),
    (error: unknown) => error instanceof CanonicalExamError && error.code === "submission_conflict"
  );
  assert.equal(conflictRpcCalls, 0);
});

test("ownership mismatch stops before RPC", async () => {
  const testHarness = harness({
    loadSession: async () => ({ ...session, user_id: "user_dev_referee_b" }),
  });
  await assert.rejects(
    submitCanonicalExam("subject", sessionId, body(), testHarness.dependencies),
    (error: unknown) => error instanceof CanonicalExamError && error.code === "exam_session_not_found"
  );
  assert.equal(testHarness.rpcCalls.length, 0);
});

test("technical PostgreSQL details are logged but never returned", async () => {
  const diagnostics: Array<{ code: string; message: string }> = [];
  const response = await executeSubmitExamRequest(
    new Request(`http://localhost/api/exams/sessions/${sessionId}/submit`, {
      method: "POST",
      body: JSON.stringify(body()),
    }),
    sessionId,
    {
      getAuthenticatedUserId: async () => "masked-subject",
      submitExam: async () => { throw { code: "23514", message: "private constraint on attempts" }; },
      logError: (_label, diagnostic) => diagnostics.push(diagnostic),
    }
  );
  assert.equal(response.status, 500);
  const publicBody = JSON.stringify(await response.json());
  assert.equal(publicBody.includes("constraint"), false);
  assert.equal(publicBody.includes("attempts"), false);
  assert.deepEqual(diagnostics, [{ code: "23514", message: "private constraint on attempts" }]);
});

test("ExamClient has no legacy browser-side exam persistence", () => {
  const client = fs.readFileSync(path.join(root, "components/ExamClient.tsx"), "utf8");
  const helper = fs.readFileSync(path.join(root, "lib/exams/canonicalExam.ts"), "utf8");
  const baseline = fs.readFileSync(
    path.join(root, "supabase/migrations/202607270000_reflab_canonical_baseline.sql"),
    "utf8"
  );
  assert.match(client, /fetch\("\/api\/exams\/sessions"/);
  assert.match(client, /\/api\/exams\/sessions\/\$\{session\.id\}\/submit/);
  assert.doesNotMatch(client, /attemptPersistence|from\("exam_results"\)|from\("attempts"\)|user\.id/);
  assert.match(helper, /provisionMissing: false/);
  assert.match(helper, /createSupabaseAdminClient\(\)/);
  assert.match(helper, /supabase\.rpc\("submit_referee_exam", parameters\)/);
  assert.doesNotMatch(helper, /ensureUserRecords|user_roles|automatic_default/);
  assert.match(
    baseline,
    /revoke all on function public\.submit_referee_exam\(text, uuid, uuid, text, jsonb\)\s+from public, anon, authenticated;/
  );
  assert.match(
    baseline,
    /grant execute on function public\.submit_referee_exam\(text, uuid, uuid, text, jsonb\)\s+to service_role;/
  );
});

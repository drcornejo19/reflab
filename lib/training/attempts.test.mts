import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  executeTrainingAttemptRequest,
  executeTrainingUsageRequest,
  getCanonicalTrainingUsage,
  submitCanonicalTrainingAttempt,
  TrainingAttemptError,
  type TrainingAttemptDependencies,
} from "./attempts.ts";

const root = process.cwd();
const canonicalAccess = {
  userId: "user_dev_referee_a",
  globalRole: "referee" as const,
  individualPlan: "pro" as const,
  effectiveIndividualPlan: "pro" as const,
  capabilities: [],
  sources: ["individual" as const],
  inheritedFromInstitutionIds: [],
};
const clip = {
  id: "11111111-1111-4111-8111-111111111111",
  sport_type: "football_11" as const,
  title: "Synthetic field clip",
  topic: "Dispute",
  subtopic: null,
  sub_type: null,
  rule_reference: "Law 12",
  season: "2026/27",
  source_version: "Synthetic",
  difficulty: "basic",
  mode: "field",
  correct_foul: true,
  correct_restart: "Tiro libre directo",
  correct_discipline: "Sin sancion",
  correct_var: false,
  incident_type: null,
  correct_clear_error: null,
  correct_app_status: null,
  correct_var_decision: null,
  explanation: null,
  analysis_answers: null,
};

const varClip = {
  ...clip,
  id: "11111111-1111-4111-8111-111111111112",
  title: "Synthetic VAR clip",
  topic: "VAR",
  mode: "var",
  incident_type: "possible_goal",
  correct_clear_error: "yes",
  correct_app_status: "same_app",
  correct_var_decision: "recommend_ofr",
};

const futsalClip = {
  ...clip,
  id: "11111111-1111-4111-8111-111111111113",
  sport_type: "futsal" as const,
  title: "Synthetic futsal clip",
  topic: "Dispute",
  mode: "training",
  analysis_answers: {
    technical_decision: true,
    restart: "Tiro libre directo",
    disciplinary_action: "Sin sancion",
    infringement_type: "carga_imprudente",
  },
};

function fieldInput(extra: Record<string, unknown> = {}) {
  return {
    kind: "field_clip",
    submissionId: "22222222-2222-4222-8222-222222222222",
    clipId: clip.id,
    answer: {
      foul: true,
      restart: "Tiro libre directo",
      discipline: "Sin sancion",
    },
    ...extra,
  };
}

function varInput(answer: Record<string, unknown> = {}) {
  return {
    kind: "var_clip",
    submissionId: "22222222-2222-4222-8222-222222222223",
    clipId: varClip.id,
    answer: {
      selectedIncident: "possible_goal",
      appStatus: "same_app",
      clearError: "yes",
      varDecision: "recommend_ofr",
      finalDecision: "Anular el gol",
      communication: "Recomiendo OFR por infraccion en la APP previa al gol.",
      ...answer,
    },
    timeSpentSeconds: 84,
  };
}

function futsalInput() {
  return {
    kind: "futsal_video",
    submissionId: "22222222-2222-4222-8222-222222222224",
    clipId: futsalClip.id,
    answers: {
      technical_decision: true,
      restart: "Tiro libre directo",
      disciplinary_action: "Sin sancion",
      infringement_type: "carga_imprudente",
    },
    justification: "Decision reglamentaria",
    timeSpentSeconds: 42,
  };
}

function dependencies(overrides: Partial<TrainingAttemptDependencies> = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const value: TrainingAttemptDependencies = {
    loadAccess: async () => canonicalAccess,
    loadClip: async () => clip,
    submitRpc: async (parameters) => {
      calls.push(parameters);
      return {
        status: "created",
        attempt_id: "33333333-3333-4333-8333-333333333333",
        score: 100,
        weekly_used: 1,
      };
    },
    ...overrides,
  };
  return { value, calls };
}

test("linked Development identity persists only the canonical user", async () => {
  const harness = dependencies();
  const result = await submitCanonicalTrainingAttempt(
    "clerk-subject-never-persisted",
    fieldInput(),
    harness.value
  );

  assert.equal(result.status, "created");
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].p_user_id, "user_dev_referee_a");
  assert.equal(JSON.stringify(harness.calls[0]).includes("clerk-subject"), false);
  assert.equal((harness.calls[0].p_attempt as Record<string, unknown>).score, 100);
  assert.equal(harness.calls[0].p_weekly_limit, 0);
});

test("weekly limit is derived only from the canonical access snapshot", async () => {
  const basicHarness = dependencies({
    loadAccess: async () => ({
      ...canonicalAccess,
      individualPlan: "basic",
      effectiveIndividualPlan: "basic",
      sources: ["basic_default"],
    }),
  });
  await submitCanonicalTrainingAttempt(
    "raw-subject",
    fieldInput(),
    basicHarness.value
  );
  assert.equal(basicHarness.calls[0].p_weekly_limit, 5);

  const institutionalHarness = dependencies({
    loadAccess: async () => ({
      ...canonicalAccess,
      individualPlan: "basic",
      effectiveIndividualPlan: "pro",
      sources: ["basic_default", "institution"],
      inheritedFromInstitutionIds: ["30000000-0000-4000-8000-000000000001"],
    }),
  });
  await submitCanonicalTrainingAttempt(
    "raw-subject",
    fieldInput(),
    institutionalHarness.value
  );
  assert.equal(institutionalHarness.calls[0].p_weekly_limit, 0);
});

test("unlinked Development identity aborts before clip lookup or RPC", async () => {
  let clipReads = 0;
  let writes = 0;
  const harness = dependencies({
    loadAccess: async () => {
      throw new IdentityLinkRequiredError();
    },
    loadClip: async () => {
      clipReads += 1;
      return clip;
    },
    submitRpc: async () => {
      writes += 1;
      return null;
    },
  });

  await assert.rejects(
    submitCanonicalTrainingAttempt("unlinked", fieldInput(), harness.value),
    IdentityLinkRequiredError
  );
  assert.equal(clipReads, 0);
  assert.equal(writes, 0);
});

test("training API returns controlled JSON before any persistence", async () => {
  let submissions = 0;
  const unauthenticated = await executeTrainingAttemptRequest(
    new Request("http://localhost/api/training/attempts", {
      method: "POST",
      body: JSON.stringify(fieldInput()),
    }),
    {
      getAuthenticatedUserId: async () => null,
      submitAttempt: async () => {
        submissions += 1;
        throw new Error("must not run");
      },
      logError: () => undefined,
    }
  );
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), {
    error: "authentication_required",
  });
  assert.equal(submissions, 0);

  const unlinked = await executeTrainingAttemptRequest(
    new Request("http://localhost/api/training/attempts", {
      method: "POST",
      body: JSON.stringify(fieldInput()),
    }),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      submitAttempt: async () => {
        throw new IdentityLinkRequiredError();
      },
      logError: () => undefined,
    }
  );
  assert.equal(unlinked.status, 409);
  assert.deepEqual(await unlinked.json(), { error: "identity_link_required" });

  const diagnostics: Array<{ code: string; message: string }> = [];
  const unexpected = await executeTrainingAttemptRequest(
    new Request("http://localhost/api/training/attempts", {
      method: "POST",
      body: JSON.stringify(fieldInput()),
    }),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      submitAttempt: async () => {
        throw {
          code: "23514",
          message: "violates attempts_private_constraint on public.attempts",
        };
      },
      logError: (_label, diagnostic) => diagnostics.push(diagnostic),
    }
  );
  assert.equal(unexpected.status, 500);
  const unexpectedBody = JSON.stringify(await unexpected.json());
  assert.equal(unexpectedBody.includes("attempts"), false);
  assert.equal(unexpectedBody.includes("constraint"), false);
  assert.deepEqual(diagnostics, [
    {
      code: "23514",
      message: "violates attempts_private_constraint on public.attempts",
    },
  ]);
});

test("training usage API returns identity_link_required without writes", async () => {
  const response = await executeTrainingUsageRequest(
    new Request("http://localhost/api/training/usage?sportType=futsal"),
    {
      getAuthenticatedUserId: async () => "masked-subject",
      loadUsage: async () => {
        throw new IdentityLinkRequiredError();
      },
      logError: () => undefined,
    }
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "identity_link_required" });
});

test("client identity and derived score fields are rejected", async () => {
  for (const extra of [
    { user_id: "attacker" },
    { canonicalUserId: "attacker" },
    { score: 0 },
    { correct_decision: "attacker-controlled" },
    { clip_title: "attacker-controlled" },
    { exam_session_id: "attacker-controlled" },
    { exam_result_id: "attacker-controlled" },
    { canonical_payload_hash: "attacker-controlled" },
    { created_at: "attacker-controlled" },
  ]) {
    const harness = dependencies();
    await assert.rejects(
      submitCanonicalTrainingAttempt("subject", fieldInput(extra), harness.value),
      TrainingAttemptError
    );
    assert.equal(harness.calls.length, 0);
  }
});

test("missing, inactive, or unpublished clips are represented as unavailable", async () => {
  const harness = dependencies({ loadClip: async () => null });
  await assert.rejects(
    submitCanonicalTrainingAttempt("subject", fieldInput(), harness.value),
    (error: unknown) =>
      error instanceof TrainingAttemptError && error.code === "clip_unavailable"
  );
  assert.equal(harness.calls.length, 0);
});

test("server recomputes a manipulated field score from canonical answers", async () => {
  const harness = dependencies();
  await submitCanonicalTrainingAttempt(
    "subject",
    fieldInput({
      answer: {
        foul: false,
        restart: "Seguir el juego",
        discipline: "Roja",
      },
    }),
    harness.value
  );
  assert.equal((harness.calls[0].p_attempt as Record<string, unknown>).score, 25);
});

test("VAR accepts normalized text and persists the canonical values", async () => {
  const harness = dependencies({ loadClip: async () => varClip });
  await submitCanonicalTrainingAttempt("subject", varInput(), harness.value);

  const payload = harness.calls[0].p_attempt as Record<string, unknown>;
  assert.equal(payload.selected_discipline, "Anular el gol");
  assert.equal(payload.score, 100);
});

test("VAR trims surrounding spaces and newlines while preserving internal whitespace", async () => {
  const harness = dependencies({ loadClip: async () => varClip });
  await submitCanonicalTrainingAttempt(
    "subject",
    varInput({
      finalDecision: "  Anular  el gol  ",
      communication:
        "\n  Recomiendo  OFR por infraccion en la APP previa al gol.  \r\n",
    }),
    harness.value
  );

  const payload = harness.calls[0].p_attempt as Record<string, unknown>;
  assert.equal(payload.selected_discipline, "Anular  el gol");
  assert.equal(payload.score, 100);
  assert.equal(JSON.stringify(payload).includes("\n  Recomiendo"), false);
});

test("VAR rejects empty or below-minimum trimmed text and invalid text types", async () => {
  for (const answer of [
    { finalDecision: "" },
    { communication: "" },
    { finalDecision: " \r\n " },
    { communication: " \n " },
    { finalDecision: 42 },
    { communication: false },
  ]) {
    const harness = dependencies({ loadClip: async () => varClip });
    await assert.rejects(
      submitCanonicalTrainingAttempt("subject", varInput(answer), harness.value),
      (error: unknown) =>
        error instanceof TrainingAttemptError &&
        error.code === "invalid_training_attempt" &&
        error.status === 400
    );
    assert.equal(harness.calls.length, 0);
  }
});

test("field football and futsal video attempts keep their existing contracts", async () => {
  const fieldHarness = dependencies();
  await submitCanonicalTrainingAttempt("subject", fieldInput(), fieldHarness.value);
  assert.equal(fieldHarness.calls.length, 1);

  const futsalHarness = dependencies({ loadClip: async () => futsalClip });
  await submitCanonicalTrainingAttempt("subject", futsalInput(), futsalHarness.value);
  assert.equal(futsalHarness.calls.length, 1);
  assert.equal(
    (futsalHarness.calls[0].p_attempt as Record<string, unknown>).score,
    100
  );
});

test("weekly usage is canonical and informative only", async () => {
  const calls: string[] = [];
  const usage = await getCanonicalTrainingUsage("raw-subject", "futsal", {
    loadAccess: async () => canonicalAccess,
    countWeeklyVideoAttempts: async (userId, sportType) => {
      calls.push(userId, sportType);
      return 4;
    },
  });
  assert.deepEqual(usage, { weeklyUsed: 4, weeklyLimit: null });
  assert.deepEqual(calls, ["user_dev_referee_a", "futsal"]);
});

test("database limit and idempotency errors become controlled public errors", async () => {
  for (const [databaseError, expectedCode, expectedStatus] of [
    [
      { code: "P0001", message: "Canonical weekly training limit reached" },
      "weekly_limit_reached",
      429,
    ],
    [{ code: "23505", message: "technical constraint detail" }, "submission_conflict", 409],
  ] as const) {
    const harness = dependencies({
      submitRpc: async () => {
        throw databaseError;
      },
    });
    await assert.rejects(
      submitCanonicalTrainingAttempt("subject", fieldInput(), harness.value),
      (error: unknown) =>
        error instanceof TrainingAttemptError &&
        error.code === expectedCode &&
        error.status === expectedStatus &&
        !error.message.includes("constraint")
    );
  }
});

test("API sources are side-effect-free before the canonical RPC", () => {
  const route = fs.readFileSync(
    path.join(root, "app/api/training/attempts/route.ts"),
    "utf8"
  );
  const usageRoute = fs.readFileSync(
    path.join(root, "app/api/training/usage/route.ts"),
    "utf8"
  );
  const server = fs.readFileSync(path.join(root, "lib/training/attempts.ts"), "utf8");

  for (const source of [route, usageRoute, server]) {
    assert.doesNotMatch(source, /ensureUserRecords|ensureCanonicalAccessRecords/);
    assert.doesNotMatch(source, /user_roles/);
    assert.doesNotMatch(source, /automatic_default/);
  }
  assert.match(server, /provisionMissing:\s*false/);
  assert.match(
    server,
    /\.eq\("activity_type",\s*"video_training"\)\s*\.is\("exam_result_id",\s*null\)/
  );
  assert.doesNotMatch(route, /user_id|canonicalUserId|externalSubject/);
  assert.match(route, /executeTrainingAttemptRequest/);
  assert.match(usageRoute, /executeTrainingUsageRequest/);
  assert.match(server, /authentication_required[\s\S]+status: 401/);
  assert.match(server, /No se pudo guardar el intento\./);
});

test("authorized training components no longer write attempts directly", () => {
  const migrated = [
    "components/ClipExercise.tsx",
    "components/VarExercise.tsx",
    "components/PhysicalTrainingClient.tsx",
    "components/FutsalRulesPracticeClient.tsx",
    "components/FutsalVideoAnalysisClient.tsx",
  ];

  for (const file of migrated) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /insertAttemptSafely/);
    assert.doesNotMatch(source, /\.from\(["']attempts["']\)/);
    assert.match(source, /submitTrainingAttempt/);
  }

  const varExercise = fs.readFileSync(
    path.join(root, "components/VarExercise.tsx"),
    "utf8"
  );
  assert.match(varExercise, /finalDecision:\s*finalDecision\.trim\(\)/);
  assert.match(varExercise, /communication:\s*communication\.trim\(\)/);

  const english = fs.readFileSync(
    path.join(root, "components/EnglishExercise.tsx"),
    "utf8"
  );
  assert.equal(
    english.includes('submitTrainingAttempt({\n        kind: "ifab_trivia"'),
    true
  );
  assert.doesNotMatch(english, /insertAttemptSafely|attemptPersistence/);
  assert.doesNotMatch(english, /\.from\(["']attempts["']\)/);
  assert.match(english, /fetch\(["']\/api\/english-feedback["']/);
});

test("training migration is server-only, transactional, and concurrency-safe", () => {
  const migration = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/202608130001_canonical_training_attempts.sql"
    ),
    "utf8"
  );

  assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
  assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog/);
  assert.match(migration, /owner to reflab_rls_owner/);
  assert.match(migration, /revoke all on function public\.submit_canonical_training_attempt[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.submit_canonical_training_attempt[\s\S]+to service_role/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /expected_weekly_limit/);
  assert.match(migration, /Canonical training subscription is inactive/);
  assert.match(migration, /subscription_record\.status in \('active', 'trialing'\)/);
  assert.match(migration, /institution_subscription_record\.status in \('active', 'trialing'\)/);
  assert.match(migration, /Canonical weekly limit does not match active access records/);
  assert.match(migration, /Canonical weekly training limit reached/);
  assert.match(migration, /attempt\.sport_type = p_attempt->>'sport_type'/);
  assert.match(migration, /canonical_payload_hash/);
  assert.match(migration, /exam_result_id := null/);
  assert.doesNotMatch(migration, /execute\s+format|\buser_roles\b|automatic_default/);
  assert.equal((migration.match(/^create policy training_attempt_/gim) ?? []).length, 15);
});

import "server-only";

import {
  calculateFieldScore,
  FIELD_SCORING_VERSION,
  normalizeDiscipline,
} from "../scoring.ts";
import { triviaItems } from "../communicationContent.ts";
import { futsalRulesPracticeQuestions } from "../futsalRulesQuestions.ts";
import {
  evaluateVideoAnswers,
  normalizeVideoAnswerMap,
} from "../videoAnalysisEngine.ts";
import { getVideoTopicSchema } from "../videoAnalysisSchemas.ts";
import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import {
  physicalTrainingPresets,
  type PhysicalTrainingPresetKey,
} from "./physicalPresets.ts";
import type {
  TrainingAttemptInput,
  TrainingAttemptResult,
} from "./attemptClient.ts";

type CanonicalClip = {
  id: string;
  sport_type: "football_11" | "futsal";
  title: string;
  topic: string;
  subtopic: string | null;
  sub_type: string | null;
  rule_reference: string | null;
  season: string | null;
  source_version: string | null;
  difficulty: string;
  mode: string;
  correct_foul: boolean | null;
  correct_restart: string | null;
  correct_discipline: string | null;
  correct_var: boolean | null;
  incident_type: string | null;
  correct_clear_error: string | null;
  correct_app_status: string | null;
  correct_var_decision: string | null;
  explanation: string | null;
  analysis_answers: Record<string, string | boolean | null> | null;
};

type AttemptPayload = Record<string, unknown>;

export type TrainingAttemptDependencies = {
  loadAccess(externalSubject: string): Promise<AccessSnapshot>;
  loadClip(clipId: string): Promise<CanonicalClip | null>;
  submitRpc(parameters: {
    p_user_id: string;
    p_submission_id: string;
    p_attempt: AttemptPayload;
    p_weekly_limit: number;
  }): Promise<unknown>;
};

export type TrainingUsageDependencies = {
  loadAccess(externalSubject: string): Promise<AccessSnapshot>;
  countWeeklyVideoAttempts(userId: string, sportType: string): Promise<number>;
};

export class TrainingAttemptError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string
  ) {
    super(message);
    this.name = "TrainingAttemptError";
    this.code = code;
    this.status = status;
  }
}

type TrainingRouteDependencies = {
  getAuthenticatedUserId(): Promise<string | null>;
  submitAttempt(
    externalSubject: string,
    body: unknown
  ): Promise<TrainingAttemptResult>;
  loadUsage(
    externalSubject: string,
    sportType: string
  ): Promise<{ weeklyUsed: number; weeklyLimit: number | null }>;
  logError(label: string, diagnostic: { code: string; message: string }): void;
};

export async function executeTrainingAttemptRequest(
  request: Request,
  dependencies: Pick<
    TrainingRouteDependencies,
    "getAuthenticatedUserId" | "submitAttempt" | "logError"
  >
) {
  const userId = await dependencies.getAuthenticatedUserId();
  if (!userId) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 65536) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 65536) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const result = await dependencies.submitAttempt(userId, body);
    return Response.json(
      { result },
      { status: result.status === "created" ? 201 : 200 }
    );
  } catch (error) {
    return trainingErrorResponse(error, dependencies.logError, "attempt");
  }
}

export async function executeTrainingUsageRequest(
  request: Request,
  dependencies: Pick<
    TrainingRouteDependencies,
    "getAuthenticatedUserId" | "loadUsage" | "logError"
  >
) {
  const userId = await dependencies.getAuthenticatedUserId();
  if (!userId) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }

  try {
    const sportType = new URL(request.url).searchParams.get("sportType") ?? "";
    const usage = await dependencies.loadUsage(userId, sportType);
    return Response.json({ usage });
  } catch (error) {
    return trainingErrorResponse(error, dependencies.logError, "usage");
  }
}

export async function submitCanonicalTrainingAttempt(
  externalSubject: string,
  rawInput: unknown,
  dependencies = createTrainingAttemptDependencies()
): Promise<TrainingAttemptResult> {
  const input = parseTrainingAttemptInput(rawInput);
  const access = await dependencies.loadAccess(externalSubject);
  const payload = await buildCanonicalAttemptPayload(input, dependencies);
  const weeklyLimit =
    payload.activity_type === "video_training" &&
    access.effectiveIndividualPlan !== "pro"
      ? 5
      : 0;
  let rawResult: unknown;
  try {
    rawResult = await dependencies.submitRpc({
      p_user_id: access.userId,
      p_submission_id: input.submissionId,
      p_attempt: payload,
      p_weekly_limit: weeklyLimit,
    });
  } catch (error) {
    throw classifyTrainingRpcError(error);
  }

  return parseRpcResult(rawResult, payload.feedback);
}

export async function getCanonicalTrainingUsage(
  externalSubject: string,
  sportType: string,
  dependencies = createTrainingUsageDependencies()
) {
  if (sportType !== "football_11" && sportType !== "futsal") {
    throw new TrainingAttemptError(
      "invalid_sport_type",
      400,
      "La disciplina solicitada no es valida."
    );
  }

  const access = await dependencies.loadAccess(externalSubject);
  const weeklyUsed = await dependencies.countWeeklyVideoAttempts(
    access.userId,
    sportType
  );

  return {
    weeklyUsed,
    weeklyLimit: access.effectiveIndividualPlan === "pro" ? null : 5,
  };
}

function createTrainingAttemptDependencies(): TrainingAttemptDependencies {
  const supabase = createSupabaseAdminClient();

  return {
    loadAccess: (externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, {
        provisionMissing: false,
      }),
    loadClip: async (clipId) => {
      const { data, error } = await supabase
        .from("clips")
        .select(
          "id,sport_type,title,topic,subtopic,sub_type,rule_reference,season,source_version,difficulty,mode,correct_foul,correct_restart,correct_discipline,correct_var,incident_type,correct_clear_error,correct_app_status,correct_var_decision,explanation,analysis_answers"
        )
        .eq("id", clipId)
        .eq("is_active", true)
        .eq("status", "published")
        .maybeSingle();

      if (error) throw error;
      return (data as CanonicalClip | null) ?? null;
    },
    submitRpc: async (parameters) => {
      const { data, error } = await supabase.rpc(
        "submit_canonical_training_attempt",
        parameters
      );

      if (error) throw error;
      return data;
    },
  };
}

function createTrainingUsageDependencies(): TrainingUsageDependencies {
  const supabase = createSupabaseAdminClient();

  return {
    loadAccess: (externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, {
        provisionMissing: false,
      }),
    countWeeklyVideoAttempts: async (userId, sportType) => {
      const weekStart = getCurrentWeekStart();
      const { count, error } = await supabase
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("sport_type", sportType)
        .eq("activity_type", "video_training")
        .is("exam_result_id", null)
        .gte("created_at", weekStart.toISOString());

      if (error) throw error;
      return count ?? 0;
    },
  };
}

async function buildCanonicalAttemptPayload(
  input: TrainingAttemptInput,
  dependencies: Pick<TrainingAttemptDependencies, "loadClip">
): Promise<AttemptPayload> {
  switch (input.kind) {
    case "field_clip":
      return buildFieldClipAttempt(input, await requireClip(input.clipId, dependencies));
    case "var_clip":
      return buildVarClipAttempt(input, await requireClip(input.clipId, dependencies));
    case "futsal_video":
      return buildFutsalVideoAttempt(
        input,
        await requireClip(input.clipId, dependencies)
      );
    case "futsal_rule":
      return buildFutsalRuleAttempt(input);
    case "physical":
      return buildPhysicalAttempt(input);
    case "ifab_trivia":
      return buildTriviaAttempt(input);
  }
}

async function requireClip(
  clipId: string,
  dependencies: Pick<TrainingAttemptDependencies, "loadClip">
) {
  const clip = await dependencies.loadClip(clipId);
  if (!clip) {
    throw new TrainingAttemptError(
      "clip_unavailable",
      404,
      "El clip no existe o no esta disponible."
    );
  }
  return clip;
}

function buildFieldClipAttempt(
  input: Extract<TrainingAttemptInput, { kind: "field_clip" }>,
  clip: CanonicalClip
) {
  if (
    typeof clip.correct_foul !== "boolean" ||
    !clip.correct_restart ||
    !clip.correct_discipline
  ) {
    throw unavailableContract();
  }

  const userAnswer = {
    foul: input.answer.foul,
    restart: input.answer.restart,
    discipline: input.answer.discipline,
  };
  const score = calculateFieldScore(userAnswer, {
    foul: clip.correct_foul,
    restart: clip.correct_restart,
    discipline: clip.correct_discipline,
    var: clip.correct_var,
  });
  const disciplineCorrect =
    normalizeDiscipline(input.answer.discipline) ===
    normalizeDiscipline(clip.correct_discipline);

  return {
    ...clipSource(clip),
    activity_type: clip.topic === "VAR" ? "var_training" : "video_training",
    module: clip.topic === "VAR" ? "var_lab" : "decision",
    mode: clip.topic === "VAR" ? "var" : "training",
    score,
    is_correct: score >= 85,
    foul: input.answer.foul,
    restart: input.answer.restart,
    discipline: input.answer.discipline,
    selected_decision: input.answer.foul ? "Falta" : "No falta",
    correct_decision: clip.correct_foul ? "Falta" : "No falta",
    selected_restart: input.answer.restart,
    correct_restart: clip.correct_restart,
    selected_discipline: input.answer.discipline,
    correct_discipline: clip.correct_discipline,
    technical_correct: input.answer.foul === clip.correct_foul,
    restart_correct: input.answer.restart === clip.correct_restart,
    discipline_correct: disciplineCorrect,
    disciplinary_correct: disciplineCorrect,
    var_correct: null,
    criterion_result: {
      scoring_version: FIELD_SCORING_VERSION,
      technical: input.answer.foul === clip.correct_foul,
      restart: input.answer.restart === clip.correct_restart,
      discipline: disciplineCorrect,
    },
    time_spent_seconds: input.timeSpentSeconds ?? null,
  };
}

function buildVarClipAttempt(
  input: Extract<TrainingAttemptInput, { kind: "var_clip" }>,
  clip: CanonicalClip
) {
  const selectedIncident = requireOneOf(input.answer.selectedIncident, [
    "possible_goal",
    "possible_penalty",
    "possible_red_card",
    "mistaken_identity",
    "possible_offside",
    "app_offence",
    "ball_out",
  ]);
  const appStatus = requireOneOf(input.answer.appStatus, [
    "same_app",
    "new_app",
    "not_relevant",
  ]);
  const clearError = requireOneOf(input.answer.clearError, ["yes", "no", "unclear"]);
  const varDecision = requireOneOf(input.answer.varDecision, [
    "check_complete",
    "recommend_ofr",
    "factual_review",
  ]);
  const suggestedDecision = getSuggestedVarDecision(selectedIncident, clearError);
  const correctVarDecision = [
    "check_complete",
    "recommend_ofr",
    "factual_review",
  ].includes(clip.correct_var_decision ?? "")
    ? clip.correct_var_decision!
    : suggestedDecision;
  const communication = cleanOptionalText(input.answer.communication, 2000) ?? "";
  const finalDecision = cleanOptionalText(input.answer.finalDecision, 500);
  const score = calculateVarScore({
    selectedIncident,
    appStatus,
    clearError,
    varDecision,
    correctVarDecision,
    communication,
    clip,
  });
  const incidentCorrect = compareOptional(selectedIncident, clip.incident_type);
  const appCorrect = compareOptional(appStatus, clip.correct_app_status);
  const clearErrorCorrect = compareOptional(clearError, clip.correct_clear_error);
  const interventionCorrect = varDecision === correctVarDecision;

  return {
    ...clipSource(clip),
    activity_type: "var_training",
    module: "var_lab",
    mode: "var",
    score,
    is_correct: score >= 85,
    selected_decision: translateVarDecision(varDecision),
    correct_decision: translateVarDecision(correctVarDecision),
    selected_restart: translateApp(appStatus),
    correct_restart: clip.correct_app_status
      ? translateApp(clip.correct_app_status)
      : null,
    selected_discipline: finalDecision,
    app_correct: appCorrect,
    ofr_correct:
      varDecision === "recommend_ofr" || correctVarDecision === "recommend_ofr"
        ? interventionCorrect
        : null,
    var_intervention_correct: interventionCorrect,
    factual_vs_interpretative_correct:
      varDecision === "factual_review" || correctVarDecision === "factual_review"
        ? interventionCorrect
        : null,
    final_decision_correct: incidentCorrect ?? clearErrorCorrect,
    protocol_score: score,
    time_spent_seconds: input.timeSpentSeconds ?? null,
    criterion_result: {
      incident_correct: incidentCorrect,
      app_correct: appCorrect,
      clear_error_correct: clearErrorCorrect,
      intervention_correct: interventionCorrect,
    },
    feedback: `Resultado VAR ${score}/100. Decision esperada: ${translateVarDecision(correctVarDecision)}.`,
  };
}

function buildFutsalVideoAttempt(
  input: Extract<TrainingAttemptInput, { kind: "futsal_video" }>,
  clip: CanonicalClip
) {
  if (clip.sport_type !== "futsal") throw unavailableContract();
  const schema = getVideoTopicSchema("futsal", clip.topic);
  if (!schema) throw unavailableContract();
  const answers = normalizeVideoAnswerMap(input.answers);
  const unexpectedAnswers = Object.keys(input.answers).filter(
    (key) => !schema.fields.some((field) => field.key === key)
  );
  if (unexpectedAnswers.length > 0) throw invalidPayload();
  const missingRequired = schema.fields.some(
    (field) => field.required && !hasAnswerValue(answers[field.key])
  );
  if (missingRequired) throw invalidPayload();
  const expected = normalizeVideoAnswerMap(clip.analysis_answers);
  const evaluation = evaluateVideoAnswers(schema, expected, answers);
  const technical = answers.technical_decision;
  const restart = answers.restart;
  const discipline = answers.disciplinary_action;

  return {
    ...clipSource(clip),
    activity_type: "video_training",
    module: "futsal_video_analysis",
    mode: "training",
    score: evaluation.score,
    is_correct: evaluation.score >= 85,
    selected_decision: formatAnswer(technical),
    correct_decision: formatAnswer(expected.technical_decision),
    selected_restart: typeof restart === "string" ? restart : null,
    correct_restart:
      typeof expected.restart === "string" ? expected.restart : null,
    selected_discipline: typeof discipline === "string" ? discipline : null,
    correct_discipline:
      typeof expected.disciplinary_action === "string"
        ? expected.disciplinary_action
        : null,
    foul: typeof technical === "boolean" ? technical : null,
    restart: typeof restart === "string" ? restart : null,
    discipline: typeof discipline === "string" ? discipline : null,
    technical_correct: evaluation.technicalCorrect,
    restart_correct: evaluation.restartCorrect,
    discipline_correct: evaluation.disciplinaryCorrect,
    disciplinary_correct: evaluation.disciplinaryCorrect,
    subtype_correct: evaluation.subtypeCorrect,
    accumulated_foul_correct: evaluation.accumulatedFoulCorrect,
    four_second_correct: evaluation.fourSecondCorrect,
    goalkeeper_correct: evaluation.goalkeeperCorrect,
    criterion_result: {
      responses: answers,
      field_results: evaluation.fieldResults,
      justification: cleanOptionalText(input.justification, 2000),
    },
    feedback: `Videoanalisis futsal: ${evaluation.score}/100`,
    time_spent_seconds: input.timeSpentSeconds ?? null,
  };
}

function buildFutsalRuleAttempt(
  input: Extract<TrainingAttemptInput, { kind: "futsal_rule" }>
) {
  const question = futsalRulesPracticeQuestions.find(
    (candidate) => candidate.id === input.questionId
  );
  if (!question || !Number.isInteger(input.selectedOption)) throw invalidPayload();
  if (input.selectedOption < 0 || input.selectedOption >= question.options.length) {
    throw invalidPayload();
  }
  const correct = input.selectedOption === question.correct;

  return {
    sport_type: "futsal",
    activity_type: "rules_practice",
    source_item_type: "rule_question",
    source_item_id: question.id,
    module: "futsal_rules",
    mode: "training",
    topic: question.topic,
    subtopic: question.subtopic ?? null,
    rule_reference: question.rule_reference,
    season: question.season,
    source_version: question.source_version,
    difficulty: question.difficulty,
    score: correct ? 100 : 0,
    is_correct: correct,
    selected_decision: question.options[input.selectedOption],
    correct_decision: question.options[question.correct],
    technical_correct: correct,
    criterion_result: {
      question_id: question.id,
      selected_option: input.selectedOption,
      correct_option: question.correct,
      source_official: question.source_official,
    },
    feedback: `Trivia futsal: ${correct ? "correcta" : "incorrecta"}`,
  };
}

function buildPhysicalAttempt(
  input: Extract<TrainingAttemptInput, { kind: "physical" }>
) {
  if (!(input.preset in physicalTrainingPresets)) throw invalidPayload();
  const preparation = requireInteger(input.preparation, 1, 600);
  const work = requireInteger(input.work, 1, 600);
  const rest = requireInteger(input.rest, 0, 600);
  const sets = requireInteger(input.sets, 1, 99);
  const preset = physicalTrainingPresets[input.preset as PhysicalTrainingPresetKey];
  const workoutName = `Tabata arbitral - ${preset.title}`;
  const totalDuration = preparation + sets * work + Math.max(0, sets - 1) * rest;

  return {
    sport_type: "football_11",
    activity_type: "physical_training",
    source_item_type: "manual",
    source_item_id: `physical:${input.preset}`,
    module: "referee_preparation",
    mode: "physical_training",
    clip_title: workoutName,
    workout_name: workoutName,
    topic: "Preparacion fisica",
    season: "2026/27",
    source_version: "RefLab football_11 physical training",
    score: null,
    total_duration: totalDuration,
    time_spent_seconds: totalDuration,
    completed_rounds: sets,
    total_rounds: sets,
    completed: true,
    feedback: `Rutina completada: ${workoutName} (${sets} sets)`,
  };
}

function buildTriviaAttempt(
  input: Extract<TrainingAttemptInput, { kind: "ifab_trivia" }>
) {
  const item = triviaItems.find((candidate) => candidate.id === input.itemId);
  if (!item) throw invalidPayload();
  const selectedAnswer = cleanRequiredText(input.selectedAnswer, 1000);
  const correct =
    selectedAnswer === item.answer ||
    (item.mode === "flashcards" && selectedAnswer === "Dominado");
  const score = correct ? 100 : 0;

  return {
    sport_type: "football_11",
    activity_type: "ifab_trivia",
    source_item_type: "rule_question",
    source_item_id: item.id,
    module: "english_referee",
    mode: "ifab_trivia",
    communication_mode: "ifab_trivia",
    topic: "IFAB English Vocabulary",
    clip_title: item.term,
    answer_text: selectedAnswer,
    correct_decision: item.answer,
    difficulty: item.difficulty.toLowerCase(),
    rule_reference: item.reference,
    score,
    is_correct: correct,
    technical_correct: correct,
    vocabulary_score: score,
    mastered_concepts: correct ? [item.term] : [],
    pending_concepts: correct ? [] : [item.term],
    vocabulary_level: correct ? "concept_mastered" : "concept_pending",
    feedback: item.explanation,
  };
}

function clipSource(clip: CanonicalClip) {
  return {
    sport_type: clip.sport_type,
    clip_id: clip.id,
    clip_title: clip.title,
    source_item_type: "global_clip",
    source_item_id: clip.id,
    topic: clip.topic,
    subtopic: clip.subtopic ?? clip.sub_type,
    rule_reference: clip.rule_reference,
    season: clip.season ?? "2026/27",
    source_version: clip.source_version ?? "RefLab canonical training",
    difficulty: clip.difficulty,
  };
}

function parseTrainingAttemptInput(value: unknown): TrainingAttemptInput {
  const record = requireRecord(value);
  assertNoIdentityFields(record);
  const kind = cleanRequiredText(record.kind, 40);
  const submissionId = requireUuid(record.submissionId);

  switch (kind) {
    case "field_clip": {
      assertExactKeys(record, ["kind", "submissionId", "clipId", "answer", "timeSpentSeconds"]);
      const answer = requireRecord(record.answer);
      assertExactKeys(answer, ["foul", "restart", "discipline"]);
      if (typeof answer.foul !== "boolean") throw invalidPayload();
      return {
        kind,
        submissionId,
        clipId: requireUuid(record.clipId),
        answer: {
          foul: answer.foul,
          restart: cleanRequiredText(answer.restart, 200),
          discipline: cleanRequiredText(answer.discipline, 200),
        },
        timeSpentSeconds: optionalInteger(record.timeSpentSeconds, 0, 86400),
      };
    }
    case "var_clip": {
      assertExactKeys(record, ["kind", "submissionId", "clipId", "answer", "timeSpentSeconds"]);
      const answer = requireRecord(record.answer);
      assertExactKeys(answer, [
        "selectedIncident",
        "appStatus",
        "clearError",
        "varDecision",
        "finalDecision",
        "communication",
      ]);
      return {
        kind,
        submissionId,
        clipId: requireUuid(record.clipId),
        answer: {
          selectedIncident: cleanRequiredText(answer.selectedIncident, 80),
          appStatus: cleanRequiredText(answer.appStatus, 80),
          clearError: cleanRequiredText(answer.clearError, 80),
          varDecision: cleanRequiredText(answer.varDecision, 80),
          finalDecision:
            cleanTrimmedOptionalText(answer.finalDecision, 500) ?? undefined,
          communication:
            cleanTrimmedOptionalText(answer.communication, 2000) ?? undefined,
        },
        timeSpentSeconds: optionalInteger(record.timeSpentSeconds, 0, 86400),
      };
    }
    case "futsal_video": {
      assertExactKeys(record, ["kind", "submissionId", "clipId", "answers", "justification", "timeSpentSeconds"]);
      const answers = requireRecord(record.answers);
      assertNoIdentityFields(answers);
      for (const answer of Object.values(answers)) {
        if (typeof answer !== "string" && typeof answer !== "boolean" && answer !== null) {
          throw invalidPayload();
        }
      }
      return {
        kind,
        submissionId,
        clipId: requireUuid(record.clipId),
        answers: answers as Record<string, string | boolean | null>,
        justification: cleanOptionalText(record.justification, 2000) ?? undefined,
        timeSpentSeconds: optionalInteger(record.timeSpentSeconds, 0, 86400),
      };
    }
    case "futsal_rule":
      assertExactKeys(record, ["kind", "submissionId", "questionId", "selectedOption"]);
      return {
        kind,
        submissionId,
        questionId: cleanRequiredText(record.questionId, 120),
        selectedOption: requireInteger(record.selectedOption, 0, 100),
      };
    case "physical":
      assertExactKeys(record, [
        "kind",
        "submissionId",
        "preset",
        "preparation",
        "work",
        "rest",
        "sets",
      ]);
      return {
        kind,
        submissionId,
        preset: cleanRequiredText(record.preset, 80),
        preparation: requireInteger(record.preparation, 1, 600),
        work: requireInteger(record.work, 1, 600),
        rest: requireInteger(record.rest, 0, 600),
        sets: requireInteger(record.sets, 1, 99),
      };
    case "ifab_trivia":
      assertExactKeys(record, ["kind", "submissionId", "itemId", "selectedAnswer"]);
      return {
        kind,
        submissionId,
        itemId: cleanRequiredText(record.itemId, 120),
        selectedAnswer: cleanRequiredText(record.selectedAnswer, 1000),
      };
    default:
      throw invalidPayload();
  }
}

function parseRpcResult(
  value: unknown,
  canonicalFeedback: unknown
): TrainingAttemptResult {
  const record = requireRecord(value);
  if (record.status !== "created" && record.status !== "already_recorded") {
    throw new Error("Canonical training RPC returned an invalid status.");
  }
  if (typeof record.attempt_id !== "string") {
    throw new Error("Canonical training RPC returned an invalid identifier.");
  }
  return {
    status: record.status,
    attemptId: record.attempt_id,
    score: typeof record.score === "number" ? record.score : null,
    weeklyUsed:
      typeof record.weekly_used === "number" ? record.weekly_used : null,
    feedback:
      typeof canonicalFeedback === "string" ? canonicalFeedback : null,
  };
}

function assertNoIdentityFields(record: Record<string, unknown>) {
  const forbidden = new Set([
    "user_id",
    "userId",
    "canonicalUserId",
    "canonical_user_id",
    "clerkUserId",
    "clerk_user_id",
    "externalSubject",
    "external_subject",
    "subject",
    "sub",
  ]);
  if (Object.keys(record).some((key) => forbidden.has(key))) {
    throw new TrainingAttemptError(
      "identity_field_forbidden",
      400,
      "La identidad no puede enviarse desde el cliente."
    );
  }
}

function assertExactKeys(record: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw invalidPayload();
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidPayload();
  }
  return value as Record<string, unknown>;
}

function requireUuid(value: unknown) {
  const text = cleanRequiredText(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw invalidPayload();
  }
  return text;
}

function cleanRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > maxLength) {
    throw invalidPayload();
  }
  return value;
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return cleanRequiredText(value, maxLength);
}

function cleanTrimmedOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalidPayload();

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidPayload();
  return normalized;
}

function requireInteger(value: unknown, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw invalidPayload();
  }
  return value as number;
}

function optionalInteger(value: unknown, min: number, max: number) {
  return value === undefined ? undefined : requireInteger(value, min, max);
}

function requireOneOf(value: string, allowed: string[]) {
  if (!allowed.includes(value)) throw invalidPayload();
  return value;
}

function invalidPayload() {
  return new TrainingAttemptError(
    "invalid_training_attempt",
    400,
    "Los datos del intento no son validos."
  );
}

function classifyTrainingRpcError(error: unknown) {
  if (!error || typeof error !== "object") return error;
  const diagnostic = error as { code?: unknown; message?: unknown };
  const code = typeof diagnostic.code === "string" ? diagnostic.code : "";
  const message =
    typeof diagnostic.message === "string" ? diagnostic.message : "";

  if (code === "23505") {
    return new TrainingAttemptError(
      "submission_conflict",
      409,
      "El identificador de envio ya fue usado con otros datos."
    );
  }
  if (code === "P0001" && message === "Canonical weekly training limit reached") {
    return new TrainingAttemptError(
      "weekly_limit_reached",
      429,
      "Alcanzaste el limite semanal de entrenamiento."
    );
  }
  if (code === "P0002") {
    return new TrainingAttemptError(
      "canonical_training_unavailable",
      409,
      "El intento no puede guardarse con el estado canonico actual."
    );
  }
  if (code === "22023") {
    return invalidPayload();
  }
  if (code === "42501") {
    return new TrainingAttemptError(
      "training_forbidden",
      403,
      "No tenes permiso para guardar este intento."
    );
  }

  return error;
}

function trainingErrorResponse(
  error: unknown,
  logError: TrainingRouteDependencies["logError"],
  operation: "attempt" | "usage"
) {
  if (error instanceof IdentityLinkRequiredError) {
    return Response.json({ error: error.code }, { status: 409 });
  }
  if (error instanceof TrainingAttemptError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  logError(`Canonical training ${operation} failed`, sanitizeError(error));
  return Response.json(
    {
      error:
        operation === "attempt"
          ? "No se pudo guardar el intento."
          : "No se pudo consultar el uso semanal.",
    },
    { status: 500 }
  );
}

function sanitizeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: "unknown", message: "Unknown error" };
  }
  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : "unknown",
    message:
      typeof value.message === "string" ? value.message : "Unexpected error",
  };
}

function unavailableContract() {
  return new TrainingAttemptError(
    "training_contract_unavailable",
    409,
    "El contenido no tiene una regla de correccion canonica."
  );
}

function getCurrentWeekStart(now = new Date()) {
  const date = new Date(now);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}

function hasAnswerValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function formatAnswer(value: unknown) {
  if (typeof value === "boolean") return value ? "Si" : "No";
  return typeof value === "string" ? value : null;
}

function compareOptional(selected: string, expected: string | null) {
  return expected ? selected === expected : null;
}

function getSuggestedVarDecision(selectedIncident: string, clearError: string) {
  if (clearError === "no") return "check_complete";
  if (selectedIncident === "possible_offside" || selectedIncident === "ball_out") {
    return "factual_review";
  }
  if (["possible_penalty", "possible_red_card", "app_offence", "possible_goal"].includes(selectedIncident)) {
    return "recommend_ofr";
  }
  return "check_complete";
}

function calculateVarScore({
  selectedIncident,
  appStatus,
  clearError,
  varDecision,
  correctVarDecision,
  communication,
  clip,
}: {
  selectedIncident: string;
  appStatus: string;
  clearError: string;
  varDecision: string;
  correctVarDecision: string;
  communication: string;
  clip: CanonicalClip;
}) {
  let score = 0;
  if (!clip.incident_type || selectedIncident === clip.incident_type) score += 15;
  if (!clip.correct_app_status || appStatus === clip.correct_app_status) score += 15;
  if (!clip.correct_clear_error || clearError === clip.correct_clear_error) score += 20;
  if (varDecision === correctVarDecision) score += 30;
  if (communication.trim().length >= 30) score += 20;
  return score;
}

function translateApp(value: string) {
  return {
    same_app: "Misma APP",
    new_app: "Nueva APP",
    not_relevant: "No aplica",
  }[value] ?? value;
}

function translateVarDecision(value: string) {
  return {
    check_complete: "Check complete",
    recommend_ofr: "Recomendar OFR",
    factual_review: "Factual review",
  }[value] ?? value;
}

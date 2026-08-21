import "server-only";

import { createHash } from "node:crypto";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import type {
  CoachCommunicationOutput,
  CoachConfidence,
  CoachEvidence,
  CoachEvidenceReference,
} from "./types.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type CommunicationFeedbackMode =
  | "decision_explanation_es"
  | "ifab_english";

export type CanonicalCommunicationInput = {
  submissionId: string;
  mode: CommunicationFeedbackMode;
  clipId: string;
  sportType: "football_11" | "futsal";
  answer: string | null;
  feedbackLanguage: "es" | "en" | "pt";
  hasVoiceRecording: boolean;
};

export type CanonicalCommunicationResult = {
  status: "created" | "already_recorded";
  attemptId: string;
  feedback: string;
  scores: CoachCommunicationOutput["scores"];
  confidence: CoachConfidence;
  evidence: CoachEvidenceReference[];
  coachRunId: string;
  oralEvaluable: false;
};

type StoredCommunicationAttempt = {
  id: string;
  activity_type: string | null;
  source_item_type: string | null;
  canonical_payload_hash: string | null;
  feedback: string | null;
  criterion_result: unknown;
};

type GeneratedCommunicationFeedback = {
  runId: string;
  value: CoachCommunicationOutput;
  confidence: CoachConfidence;
  evidence: CoachEvidenceReference[];
};

export type CommunicationFeedbackDependencies = {
  findExisting(
    canonicalUserId: string,
    submissionId: string
  ): Promise<StoredCommunicationAttempt | null>;
  loadEvidence(
    clipId: string,
    sportType: CanonicalCommunicationInput["sportType"]
  ): Promise<CoachEvidence[]>;
  generate(
    input: CanonicalCommunicationInput,
    evidence: CoachEvidence[]
  ): Promise<GeneratedCommunicationFeedback>;
  persist(parameters: {
    p_user_id: string;
    p_submission_id: string;
    p_payload_hash: string;
    p_feedback: Record<string, unknown>;
  }): Promise<unknown>;
};

export class CommunicationFeedbackError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;
  readonly diagnostic: { code: string; message: string } | null;

  constructor(
    code: string,
    status: number,
    publicMessage: string,
    diagnostic: { code: string; message: string } | null = null
  ) {
    super(publicMessage);
    this.name = "CommunicationFeedbackError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    this.diagnostic = diagnostic;
  }
}

export async function submitCanonicalCommunicationFeedback(
  canonicalUserId: string,
  value: unknown,
  dependencies: CommunicationFeedbackDependencies
): Promise<CanonicalCommunicationResult> {
  const input = parseCommunicationFeedbackInput(value);
  const payloadHash = hashCanonicalCommunicationInput(input);
  const existing = await dependencies.findExisting(
    canonicalUserId,
    input.submissionId
  );

  if (existing) {
    return replayStoredCommunication(existing, payloadHash);
  }

  const evidence = await dependencies.loadEvidence(
    input.clipId,
    input.sportType
  );
  if (evidence.length !== 1 || evidence[0].reference.sourceId !== input.clipId) {
    throw new CommunicationFeedbackError(
      "communication_clip_unavailable",
      422,
      "El clip de comunicacion no esta disponible."
    );
  }

  const generated = normalizeGeneratedFeedback(
    input,
    await dependencies.generate(input, evidence)
  );
  let persisted: unknown;
  try {
    persisted = await dependencies.persist({
      p_user_id: canonicalUserId,
      p_submission_id: input.submissionId,
      p_payload_hash: payloadHash,
      p_feedback: buildPersistencePayload(input, generated),
    });
  } catch (error) {
    throw classifyPersistenceError(error);
  }

  return parsePersistedResult(persisted);
}

export function parseCommunicationFeedbackInput(
  value: unknown
): CanonicalCommunicationInput {
  const record = requireRecord(value);
  const allowed = new Set([
    "submissionId",
    "mode",
    "clipId",
    "sportType",
    "answer",
    "feedbackLanguage",
    "hasVoiceRecording",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw invalidRequest();
  }

  const submissionId = requireUuid(record.submissionId);
  const clipId = requireUuid(record.clipId);
  const mode = requireOneOf(record.mode, [
    "decision_explanation_es",
    "ifab_english",
  ]) as CommunicationFeedbackMode;
  const sportType = requireOneOf(record.sportType, [
    "football_11",
    "futsal",
  ]) as CanonicalCommunicationInput["sportType"];
  const feedbackLanguage = requireOneOf(record.feedbackLanguage, [
    "es",
    "en",
    "pt",
  ]) as CanonicalCommunicationInput["feedbackLanguage"];
  const answer = optionalTrimmedText(record.answer, 4_000);
  if (typeof record.hasVoiceRecording !== "boolean") throw invalidRequest();
  if (!answer && !record.hasVoiceRecording) throw invalidRequest();

  return {
    submissionId,
    mode,
    clipId,
    sportType,
    answer,
    feedbackLanguage,
    hasVoiceRecording: record.hasVoiceRecording,
  };
}

export function hashCanonicalCommunicationInput(
  input: CanonicalCommunicationInput
) {
  const canonicalInput = {
    schemaVersion: "communication-feedback-v1",
    mode: input.mode,
    clipId: input.clipId,
    sportType: input.sportType,
    answer: input.answer,
    feedbackLanguage: input.feedbackLanguage,
    hasVoiceRecording: input.hasVoiceRecording,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalInput), "utf8")
    .digest("hex");
}

export function createCommunicationFeedbackDatabaseDependencies(
  supabase: SupabaseAdminClient
) {
  return {
    findExisting: async (canonicalUserId: string, submissionId: string) => {
      const { data, error } = await supabase
        .from("attempts")
        .select(
          "id,activity_type,source_item_type,canonical_payload_hash,feedback,criterion_result"
        )
        .eq("user_id", canonicalUserId)
        .eq("submission_id", submissionId)
        .is("exam_result_id", null)
        .maybeSingle();
      if (error) throw databaseUnavailable(error);
      return (data as StoredCommunicationAttempt | null) ?? null;
    },
    persist: async (parameters: {
      p_user_id: string;
      p_submission_id: string;
      p_payload_hash: string;
      p_feedback: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc(
        "submit_canonical_communication_feedback",
        parameters
      );
      if (error) throw error;
      return data;
    },
  };
}

function normalizeGeneratedFeedback(
  input: CanonicalCommunicationInput,
  generated: GeneratedCommunicationFeedback
): GeneratedCommunicationFeedback {
  if (input.hasVoiceRecording && !input.answer) {
    return {
      ...generated,
      value: {
        ...generated.value,
        scores: {
          terminology: null,
          clarity: null,
          precision: null,
          structure: null,
          vocabulary: null,
          grammar: null,
          global: null,
          globalLabel: null,
          modelAnswer: null,
        },
      },
    };
  }
  return generated;
}

function buildPersistencePayload(
  input: CanonicalCommunicationInput,
  generated: GeneratedCommunicationFeedback
) {
  return {
    sport_type: input.sportType,
    activity_type:
      input.mode === "ifab_english"
        ? "english_communication_feedback"
        : "spanish_communication_feedback",
    clip_id: input.clipId,
    mode: input.mode,
    answer_text: input.answer,
    feedback_language: input.feedbackLanguage,
    has_voice_recording: input.hasVoiceRecording,
    oral_evaluable: false,
    feedback: generated.value.feedback,
    scores: {
      terminology: generated.value.scores.terminology,
      clarity: generated.value.scores.clarity,
      precision: generated.value.scores.precision,
      structure: generated.value.scores.structure,
      vocabulary: generated.value.scores.vocabulary,
      grammar: generated.value.scores.grammar,
      global: generated.value.scores.global,
    },
    global_label: generated.value.scores.globalLabel,
    model_answer: generated.value.scores.modelAnswer,
    human_review_reason: generated.value.humanReviewReason,
    confidence: generated.confidence,
    evidence: generated.evidence,
    coach_run_id: generated.runId,
  };
}

function replayStoredCommunication(
  attempt: StoredCommunicationAttempt,
  payloadHash: string
) {
  if (
    attempt.canonical_payload_hash !== payloadHash ||
    attempt.source_item_type !== "communication_feedback" ||
    ![
      "english_communication_feedback",
      "spanish_communication_feedback",
    ].includes(attempt.activity_type ?? "")
  ) {
    throw submissionConflict();
  }
  return decodeStoredResult(attempt.id, attempt.feedback, attempt.criterion_result);
}

function parsePersistedResult(value: unknown): CanonicalCommunicationResult {
  const record = requireRecord(value);
  if (record.status !== "created" && record.status !== "already_recorded") {
    throw databaseUnavailable({ message: "Invalid communication RPC status" });
  }
  const result = decodeStoredResult(
    requireText(record.attempt_id, 36),
    typeof record.feedback === "string" ? record.feedback : null,
    record.criterion_result
  );
  return { ...result, status: record.status };
}

function decodeStoredResult(
  attemptId: string,
  feedbackValue: string | null,
  criterionValue: unknown
): CanonicalCommunicationResult {
  const criterion = requireRecord(criterionValue);
  const scores = requireRecord(criterion.scores);
  const confidence = requireRecord(criterion.confidence);
  const evidence = Array.isArray(criterion.evidence) ? criterion.evidence : [];
  const feedback = feedbackValue?.trim();
  if (!feedback) throw databaseUnavailable({ message: "Missing stored feedback" });

  return {
    status: "already_recorded",
    attemptId,
    feedback,
    scores: {
      terminology: nullableScore(scores.terminology),
      clarity: nullableScore(scores.clarity),
      precision: nullableScore(scores.precision),
      structure: nullableScore(scores.structure),
      vocabulary: nullableScore(scores.vocabulary),
      grammar: nullableScore(scores.grammar),
      global: nullableScore(scores.global),
      globalLabel: nullableText(criterion.global_label),
      modelAnswer: nullableText(criterion.model_answer),
    },
    confidence: {
      label: requireOneOf(confidence.label, [
        "high",
        "medium",
        "human_review",
      ]) as CoachConfidence["label"],
      score: requireFiniteNumber(confidence.score, 0, 1),
      reasons: Array.isArray(confidence.reasons)
        ? confidence.reasons.filter((item): item is string => typeof item === "string")
        : [],
      requiresHumanReview: confidence.requiresHumanReview === true,
    },
    evidence: evidence as CoachEvidenceReference[],
    coachRunId: requireText(criterion.coach_run_id, 36),
    oralEvaluable: false,
  };
}

function classifyPersistenceError(error: unknown) {
  const diagnostic = sanitizeDiagnostic(error);
  if (diagnostic.code === "23505") return submissionConflict();
  if (diagnostic.code === "22023") return invalidRequest();
  if (diagnostic.code === "P0002") {
    return new CommunicationFeedbackError(
      "canonical_communication_unavailable",
      409,
      "El feedback no puede guardarse con el estado canonico actual."
    );
  }
  if (diagnostic.code === "42501") {
    return new CommunicationFeedbackError(
      "communication_feedback_forbidden",
      403,
      "No tenes permiso para guardar este feedback."
    );
  }
  return databaseUnavailable(diagnostic);
}

function submissionConflict() {
  return new CommunicationFeedbackError(
    "submission_conflict",
    409,
    "El identificador de envio ya fue usado con otros datos."
  );
}

function invalidRequest() {
  return new CommunicationFeedbackError(
    "invalid_communication_feedback",
    400,
    "Los datos del feedback no son validos."
  );
}

function databaseUnavailable(error: unknown) {
  return new CommunicationFeedbackError(
    "communication_feedback_unavailable",
    500,
    "No se pudo guardar el feedback de comunicacion.",
    sanitizeDiagnostic(error)
  );
}

function sanitizeDiagnostic(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: "unknown", message: "Unknown communication error" };
  }
  const record = error as { code?: unknown; message?: unknown };
  return {
    code: typeof record.code === "string" ? record.code : "unknown",
    message:
      typeof record.message === "string"
        ? record.message
        : "Unexpected communication error",
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest();
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, maxLength: number) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > maxLength
  ) {
    throw invalidRequest();
  }
  return value;
}

function optionalTrimmedText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw invalidRequest();

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidRequest();
  return normalized;
}

function requireUuid(value: unknown) {
  const text = requireText(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw invalidRequest();
  }
  return text;
}

function requireOneOf(value: unknown, allowed: string[]) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw invalidRequest();
  }
  return value;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableScore(value: unknown) {
  if (value === null) return null;
  return requireFiniteNumber(value, 0, 10);
}

function requireFiniteNumber(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw invalidRequest();
  }
  return value;
}

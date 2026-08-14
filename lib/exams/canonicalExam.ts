import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { IdentityLinkRequiredError, loadAccessSnapshot } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import { calculateScore, normalizeDiscipline } from "../scoring.ts";
import { DEFAULT_SPORT_TYPE } from "../sports.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import { FREE_WEEKLY_EXAM_LIMIT, getCurrentWeekStart } from "../subscription.ts";

const QUESTION_COUNT = 10;
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 64 * 1024;
const SOURCE_VERSION = "reflab-canonical-video-exam-v1";
const SEASON = "2026/27";

type SportType = "football_11" | "futsal";

type CanonicalExamClip = {
  id: string;
  sport_type: SportType;
  title: string;
  description: string | null;
  video_url: string;
  topic: string;
  subtopic: string | null;
  sub_type: string | null;
  module: string | null;
  type: string | null;
  category: string | null;
  training_type: string | null;
  difficulty: string;
  mode: string;
  correct_foul: boolean | null;
  correct_restart: string | null;
  correct_discipline: string | null;
  correct_var: boolean | null;
  rule_reference: string | null;
  season: string | null;
  source_version: string | null;
};

type ExamManifestItem = {
  source_item_type: "global_clip";
  source_item_id: string;
  occurrence_id: string;
  position: number;
  source_version: string | null;
};

type ExamSessionRecord = {
  id: string;
  user_id: string;
  submission_id: string;
  sport_type: SportType;
  item_manifest: ExamManifestItem[];
  item_count: number;
  status: string;
  expires_at: string;
};

type ExistingExamResult = { payload_hash: string; details: unknown };

type UserExamAnswer = {
  occurrenceId: string;
  foul: boolean;
  restart: string;
  discipline: string;
  offsideReason: string | null;
  handballReason: string | null;
  timeSpentSeconds: number | null;
};

type EvaluatedAttempt = Record<string, unknown> & {
  occurrence_id: string;
  source_item_type: "global_clip";
  source_item_id: string;
  selected_decision: string;
  selected_restart: string;
  selected_discipline: string;
  score: number;
  max_score: number;
  is_correct: boolean;
};

export type ExamSessionQuestion = {
  occurrenceId: string;
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  topic: string;
  difficulty: string;
};

export type CanonicalExamDependencies = {
  loadAccess(externalSubject: string): Promise<AccessSnapshot>;
  countWeeklyExams(userId: string, weekStart: Date): Promise<number>;
  listAvailableClips(sportType: SportType): Promise<CanonicalExamClip[]>;
  createSession(input: {
    userId: string;
    submissionId: string;
    sportType: SportType;
    manifest: ExamManifestItem[];
    manifestHash: string;
    expiresAt: string;
  }): Promise<ExamSessionRecord>;
  loadSession(sessionId: string): Promise<ExamSessionRecord | null>;
  loadExistingResult(sessionId: string): Promise<ExistingExamResult | null>;
  loadClipsByIds(ids: string[]): Promise<CanonicalExamClip[]>;
  submitRpc(parameters: {
    p_user_id: string;
    p_exam_session_id: string;
    p_submission_id: string;
    p_payload_hash: string;
    p_evaluated_attempts: EvaluatedAttempt[];
  }): Promise<unknown>;
  randomUuid(): string;
  now(): Date;
};

type ExamRouteDependencies = {
  getAuthenticatedUserId(): Promise<string | null>;
  startExam(externalSubject: string, body: unknown): Promise<unknown>;
  submitExam(externalSubject: string, sessionId: string, body: unknown): Promise<unknown>;
  logError(label: string, diagnostic: { code: string; message: string }): void;
};

export class CanonicalExamError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "CanonicalExamError";
    this.code = code;
    this.status = status;
  }
}

export async function executeCreateExamSessionRequest(
  request: Request,
  dependencies: Pick<ExamRouteDependencies, "getAuthenticatedUserId" | "startExam" | "logError">
) {
  const externalSubject = await dependencies.getAuthenticatedUserId();
  if (!externalSubject) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  try {
    const session = await dependencies.startExam(externalSubject, await readJsonBody(request));
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return examErrorResponse(error, dependencies.logError, "session_start");
  }
}

export async function executeSubmitExamRequest(
  request: Request,
  sessionId: string,
  dependencies: Pick<ExamRouteDependencies, "getAuthenticatedUserId" | "submitExam" | "logError">
) {
  const externalSubject = await dependencies.getAuthenticatedUserId();
  if (!externalSubject) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  try {
    const result = await dependencies.submitExam(
      externalSubject,
      sessionId,
      await readJsonBody(request)
    );
    return Response.json({ result });
  } catch (error) {
    return examErrorResponse(error, dependencies.logError, "session_submit");
  }
}

export async function startCanonicalExam(
  externalSubject: string,
  rawInput: unknown,
  dependencies = createCanonicalExamDependencies()
) {
  const { sportType } = parseStartInput(rawInput);
  const access = await dependencies.loadAccess(externalSubject);
  if (access.effectiveIndividualPlan !== "pro") {
    const used = await dependencies.countWeeklyExams(
      access.userId,
      getCurrentWeekStart(dependencies.now())
    );
    if (used >= FREE_WEEKLY_EXAM_LIMIT) {
      throw new CanonicalExamError(
        "weekly_exam_limit_reached",
        403,
        "Ya usaste tu evaluacion semanal disponible."
      );
    }
  }

  const availableClips = (await dependencies.listAvailableClips(sportType))
    .filter(hasCanonicalExamContract)
    .filter((clip) => !isExamEnglishClip(clip));
  if (availableClips.length === 0) {
    throw new CanonicalExamError(
      "exam_content_unavailable",
      503,
      "No hay clips publicados disponibles para iniciar la evaluacion."
    );
  }

  const submissionId = dependencies.randomUuid();
  const selectedClips = selectExamClips(availableClips, submissionId);
  const manifest = selectedClips.map((clip, index) => ({
    source_item_type: "global_clip" as const,
    source_item_id: clip.id,
    occurrence_id: dependencies.randomUuid(),
    position: index + 1,
    source_version: clip.source_version,
  }));
  const expiresAt = new Date(
    dependencies.now().getTime() + SESSION_DURATION_MS
  ).toISOString();
  const session = await dependencies.createSession({
    userId: access.userId,
    submissionId,
    sportType,
    manifest,
    manifestHash: sha256CanonicalJson(manifest),
    expiresAt,
  });

  return {
    id: session.id,
    submissionId,
    sportType,
    expiresAt: session.expires_at,
    questions: manifest.map((item, index) => toPublicQuestion(selectedClips[index], item)),
  };
}

export async function submitCanonicalExam(
  externalSubject: string,
  sessionId: string,
  rawInput: unknown,
  dependencies = createCanonicalExamDependencies()
) {
  requireUuid(sessionId, "invalid_session_id");
  const input = parseSubmitInput(rawInput);
  const access = await dependencies.loadAccess(externalSubject);
  const session = await dependencies.loadSession(sessionId);
  if (!session || session.user_id !== access.userId) {
    throw new CanonicalExamError(
      "exam_session_not_found",
      404,
      "La sesion de evaluacion no existe."
    );
  }
  if (session.submission_id !== input.submissionId) {
    throw new CanonicalExamError(
      "submission_conflict",
      409,
      "La entrega no corresponde a esta sesion."
    );
  }

  const existing = await dependencies.loadExistingResult(session.id);
  let evaluatedAttempts: EvaluatedAttempt[];
  let payloadHash: string;
  if (existing) {
    evaluatedAttempts = parseStoredEvaluatedAttempts(existing.details);
    if (!answersMatchStoredResult(input.answers, evaluatedAttempts)) {
      throw new CanonicalExamError(
        "submission_conflict",
        409,
        "La entrega ya fue utilizada con respuestas diferentes."
      );
    }
    payloadHash = existing.payload_hash;
  } else {
    if (!["created", "active"].includes(session.status)) {
      throw new CanonicalExamError(
        "exam_session_closed",
        409,
        "La sesion de evaluacion ya no admite entregas."
      );
    }
    if (new Date(session.expires_at).getTime() <= dependencies.now().getTime()) {
      throw new CanonicalExamError(
        "exam_session_expired",
        409,
        "La sesion de evaluacion vencio."
      );
    }
    validateAnswerSet(input.answers, session.item_manifest);
    const clips = await dependencies.loadClipsByIds(
      session.item_manifest.map((item) => item.source_item_id)
    );
    evaluatedAttempts = evaluateAnswers(input.answers, session.item_manifest, clips);
    payloadHash = sha256CanonicalJson(evaluatedAttempts);
  }

  let rawResult: unknown;
  try {
    rawResult = await dependencies.submitRpc({
      p_user_id: access.userId,
      p_exam_session_id: session.id,
      p_submission_id: input.submissionId,
      p_payload_hash: payloadHash,
      p_evaluated_attempts: evaluatedAttempts,
    });
  } catch (error) {
    throw classifyRpcError(error);
  }
  return {
    ...parseRpcResult(rawResult),
    attempts: evaluatedAttempts.map(toPublicEvaluatedAttempt),
  };
}

function createCanonicalExamDependencies(): CanonicalExamDependencies {
  const supabase = createSupabaseAdminClient();
  const clipColumns =
    "id,sport_type,title,description,video_url,topic,subtopic,sub_type,module,type,category,training_type,difficulty,mode,correct_foul,correct_restart,correct_discipline,correct_var,rule_reference,season,source_version";
  return {
    loadAccess: (externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, { provisionMissing: false }),
    countWeeklyExams: async (userId, weekStart) => {
      const [videoExams, rulesExams] = await Promise.all([
        supabase
          .from("exam_results")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", weekStart.toISOString()),
        supabase
          .from("rules_exam_results")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", weekStart.toISOString()),
      ]);
      if (videoExams.error) throw videoExams.error;
      if (rulesExams.error) throw rulesExams.error;
      return (videoExams.count ?? 0) + (rulesExams.count ?? 0);
    },
    listAvailableClips: async (sportType) => {
      const { data, error } = await supabase
        .from("clips")
        .select(clipColumns)
        .eq("sport_type", sportType)
        .eq("is_active", true)
        .eq("status", "published")
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CanonicalExamClip[];
    },
    createSession: async (input) => {
      const { data, error } = await supabase
        .from("referee_exam_sessions")
        .insert({
          user_id: input.userId,
          submission_id: input.submissionId,
          context_type: "individual",
          sport_type: input.sportType,
          activity_type: "referee_exam",
          season: SEASON,
          source_version: SOURCE_VERSION,
          item_manifest: input.manifest,
          manifest_hash: input.manifestHash,
          item_count: input.manifest.length,
          status: "active",
          expires_at: input.expiresAt,
        })
        .select("id,user_id,submission_id,sport_type,item_manifest,item_count,status,expires_at")
        .single();
      if (error) throw error;
      return data as ExamSessionRecord;
    },
    loadSession: async (sessionId) => {
      const { data, error } = await supabase
        .from("referee_exam_sessions")
        .select("id,user_id,submission_id,sport_type,item_manifest,item_count,status,expires_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return (data as ExamSessionRecord | null) ?? null;
    },
    loadExistingResult: async (sessionId) => {
      const { data, error } = await supabase
        .from("exam_results")
        .select("payload_hash,details")
        .eq("exam_session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return (data as ExistingExamResult | null) ?? null;
    },
    loadClipsByIds: async (ids) => {
      const { data, error } = await supabase
        .from("clips")
        .select(clipColumns)
        .in("id", ids)
        .eq("is_active", true)
        .eq("status", "published");
      if (error) throw error;
      return (data ?? []) as CanonicalExamClip[];
    },
    submitRpc: async (parameters) => {
      const { data, error } = await supabase.rpc("submit_referee_exam", parameters);
      if (error) throw error;
      return data;
    },
    randomUuid: randomUUID,
    now: () => new Date(),
  };
}

function parseStartInput(value: unknown) {
  const body = requirePlainObject(value, "invalid_exam_request");
  rejectUnexpectedKeys(body, ["sportType"]);
  const sportType = body.sportType ?? DEFAULT_SPORT_TYPE;
  if (sportType !== "football_11" && sportType !== "futsal") {
    throw invalidRequest("invalid_sport_type");
  }
  return { sportType } as { sportType: SportType };
}

function parseSubmitInput(value: unknown) {
  const body = requirePlainObject(value, "invalid_exam_submission");
  rejectUnexpectedKeys(body, ["submission_id", "answers"]);
  const submissionId = requireUuid(body.submission_id, "invalid_submission_id");
  if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 100) {
    throw invalidRequest("invalid_answers");
  }
  return { submissionId, answers: body.answers.map(parseAnswer) };
}

function parseAnswer(value: unknown): UserExamAnswer {
  const answer = requirePlainObject(value, "invalid_answer");
  rejectUnexpectedKeys(answer, [
    "occurrence_id",
    "foul",
    "restart",
    "discipline",
    "offside_reason",
    "handball_reason",
    "time_spent_seconds",
  ]);
  if (typeof answer.foul !== "boolean") throw invalidRequest("invalid_answer");
  return {
    occurrenceId: requireUuid(answer.occurrence_id, "invalid_answer"),
    foul: answer.foul,
    restart: requiredText(answer.restart, 100),
    discipline: requiredText(answer.discipline, 100),
    offsideReason: optionalText(answer.offside_reason, 100),
    handballReason: optionalText(answer.handball_reason, 100),
    timeSpentSeconds: optionalInteger(answer.time_spent_seconds, 0, 86400),
  };
}

function validateAnswerSet(answers: UserExamAnswer[], manifest: ExamManifestItem[]) {
  if (answers.length !== manifest.length) throw invalidRequest("invalid_answers");
  const answerIds = new Set(answers.map((answer) => answer.occurrenceId));
  if (answerIds.size !== answers.length) throw invalidRequest("invalid_answers");
  if (manifest.some((item) => !answerIds.has(item.occurrence_id))) {
    throw invalidRequest("invalid_answers");
  }
}

function evaluateAnswers(
  answers: UserExamAnswer[],
  manifest: ExamManifestItem[],
  clips: CanonicalExamClip[]
) {
  const answerMap = new Map(answers.map((answer) => [answer.occurrenceId, answer]));
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));
  if (clipMap.size !== manifest.length) throw unavailableContent();
  return manifest.map((item) => {
    const answer = answerMap.get(item.occurrence_id);
    const clip = clipMap.get(item.source_item_id);
    if (!answer || !clip || !hasCanonicalExamContract(clip)) throw unavailableContent();
    return evaluateAnswer(answer, item, clip);
  });
}

function evaluateAnswer(
  answer: UserExamAnswer,
  manifest: ExamManifestItem,
  clip: CanonicalExamClip
): EvaluatedAttempt {
  const technicalCorrect = answer.foul === clip.correct_foul;
  const restartCorrect = answer.restart === clip.correct_restart;
  const disciplinaryCorrect =
    normalizeDiscipline(answer.discipline) === normalizeDiscipline(clip.correct_discipline);
  const subtypeCorrect = getSubtypeCorrect(answer, clip);
  let score = calculateScore(
    { foul: answer.foul, restart: answer.restart, discipline: answer.discipline, var: clip.correct_var },
    { foul: clip.correct_foul, restart: clip.correct_restart, discipline: clip.correct_discipline, var: clip.correct_var }
  );
  if (subtypeCorrect === false) score = Math.max(0, score - 20);
  return {
    occurrence_id: manifest.occurrence_id,
    source_item_type: "global_clip",
    source_item_id: clip.id,
    clip_title: clip.title,
    topic: clip.topic,
    subtopic: clip.subtopic ?? clip.sub_type,
    rule_reference: clip.rule_reference,
    difficulty: clip.difficulty,
    selected_decision: decisionLabel(answer.foul),
    correct_decision: decisionLabel(clip.correct_foul),
    selected_restart: answer.restart,
    correct_restart: clip.correct_restart,
    selected_discipline: answer.discipline,
    correct_discipline: clip.correct_discipline,
    score,
    max_score: 100,
    is_correct: score >= 85,
    technical_correct: technicalCorrect,
    restart_correct: restartCorrect,
    disciplinary_correct: disciplinaryCorrect,
    subtype_correct: subtypeCorrect,
    criterion_result: {
      selected_subtype: answer.offsideReason ?? answer.handballReason,
      technical: technicalCorrect,
      restart: restartCorrect,
      discipline: disciplinaryCorrect,
      subtype: subtypeCorrect,
    },
    feedback: `Examen arbitral: ${score}/100`,
    time_spent_seconds: answer.timeSpentSeconds,
  };
}

function getSubtypeCorrect(answer: UserExamAnswer, clip: CanonicalExamClip) {
  if (!answer.foul) return null;
  if (clip.topic === "Offside") return answer.offsideReason === clip.sub_type;
  if (clip.topic === "Handball") return answer.handballReason === clip.sub_type;
  return null;
}

function answersMatchStoredResult(answers: UserExamAnswer[], stored: EvaluatedAttempt[]) {
  if (answers.length !== stored.length) return false;
  const answerMap = new Map(answers.map((answer) => [answer.occurrenceId, answer]));
  return stored.every((attempt) => {
    const answer = answerMap.get(attempt.occurrence_id);
    const criteria = isPlainObject(attempt.criterion_result)
      ? attempt.criterion_result
      : {};
    return Boolean(
      answer &&
        attempt.selected_decision === decisionLabel(answer.foul) &&
        attempt.selected_restart === answer.restart &&
        attempt.selected_discipline === answer.discipline &&
        normalizeNullableString(criteria.selected_subtype) ===
          (answer.offsideReason ?? answer.handballReason) &&
        normalizeNullableInteger(attempt.time_spent_seconds) === answer.timeSpentSeconds
    );
  });
}

function parseStoredEvaluatedAttempts(value: unknown): EvaluatedAttempt[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CanonicalExamError("stored_exam_invalid", 500, "No se pudo recuperar la entrega guardada.");
  }
  return value as EvaluatedAttempt[];
}

function parseRpcResult(value: unknown) {
  const result = requirePlainObject(value, "invalid_rpc_result");
  const avgScore = Number(result.avg_score);
  const correctCount = Number(result.correct_count);
  const totalQuestions = Number(result.total_questions);
  if (![avgScore, correctCount, totalQuestions].every(Number.isFinite)) {
    throw new CanonicalExamError("invalid_rpc_result", 500, "No se pudo confirmar la evaluacion.");
  }
  return {
    examResultId: requireUuid(result.exam_result_id, "invalid_rpc_result"),
    examSessionId: requireUuid(result.exam_session_id, "invalid_rpc_result"),
    submissionId: requireUuid(result.submission_id, "invalid_rpc_result"),
    avgScore,
    correctCount,
    totalQuestions,
    idempotentReplay: result.idempotent_replay === true,
  };
}

function toPublicEvaluatedAttempt(attempt: EvaluatedAttempt) {
  return {
    occurrenceId: attempt.occurrence_id,
    clipId: attempt.source_item_id,
    clipTitle: String(attempt.clip_title ?? "Clip de evaluacion"),
    topic: String(attempt.topic ?? ""),
    difficulty: String(attempt.difficulty ?? ""),
    selectedDecision: attempt.selected_decision,
    selectedRestart: attempt.selected_restart,
    selectedDiscipline: attempt.selected_discipline,
    score: Number(attempt.score),
    isCorrect: attempt.is_correct === true,
  };
}

function toPublicQuestion(clip: CanonicalExamClip, manifest: ExamManifestItem): ExamSessionQuestion {
  return {
    occurrenceId: manifest.occurrence_id,
    id: clip.id,
    title: clip.title,
    description: clip.description,
    videoUrl: clip.video_url,
    topic: clip.topic,
    difficulty: clip.difficulty,
  };
}

function selectExamClips(clips: CanonicalExamClip[], seed: string) {
  const rank = (clip: CanonicalExamClip) =>
    createHash("sha256").update(`${seed}:${clip.id}`).digest("hex");
  return [...clips]
    .sort((left, right) => rank(left).localeCompare(rank(right)))
    .slice(0, QUESTION_COUNT);
}

function hasCanonicalExamContract(clip: CanonicalExamClip) {
  return (
    typeof clip.correct_foul === "boolean" &&
    Boolean(clip.correct_restart?.trim()) &&
    Boolean(clip.correct_discipline?.trim())
  );
}

function isExamEnglishClip(clip: CanonicalExamClip) {
  const value = [
    clip.mode,
    clip.module,
    clip.type,
    clip.category,
    clip.training_type,
    clip.topic,
    clip.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["english", "ingles", "modo ingles", "modulo ingles"].some((term) =>
    value.includes(term)
  );
}

export function canonicalJsonText(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJsonText).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJsonText(entryValue)}`)
      .join(",")}}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidRequest("invalid_number");
    return String(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  throw invalidRequest("invalid_json_value");
}

export function sha256CanonicalJson(value: unknown) {
  return createHash("sha256").update(canonicalJsonText(value), "utf8").digest("hex");
}

async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new CanonicalExamError("payload_too_large", 413, "La solicitud es demasiado grande.");
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    throw new CanonicalExamError("payload_too_large", 413, "La solicitud es demasiado grande.");
  }
  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    throw invalidRequest("invalid_json");
  }
}

function examErrorResponse(
  error: unknown,
  logError: ExamRouteDependencies["logError"],
  operation: string
) {
  if (error instanceof IdentityLinkRequiredError) {
    return Response.json({ error: "identity_link_required" }, { status: 409 });
  }
  if (error instanceof CanonicalExamError) {
    if (error.status >= 500) logError(`Canonical exam ${operation} failed`, sanitizeError(error));
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  logError(`Canonical exam ${operation} failed`, sanitizeError(error));
  return Response.json(
    { error: "exam_operation_failed", message: "No se pudo completar la evaluacion." },
    { status: 500 }
  );
}

function classifyRpcError(error: unknown) {
  const message = readErrorField(error, "message").toLowerCase();
  if (message.includes("already used with different content")) {
    return new CanonicalExamError("submission_conflict", 409, "La entrega ya fue utilizada con contenido diferente.");
  }
  if (message.includes("expired")) {
    return new CanonicalExamError("exam_session_expired", 409, "La sesion de evaluacion vencio.");
  }
  if (message.includes("not found") || message.includes("does not belong")) {
    return new CanonicalExamError("exam_session_not_found", 404, "La sesion de evaluacion no existe.");
  }
  return new CanonicalExamError("exam_submit_failed", 500, "No se pudo guardar la evaluacion.");
}

function sanitizeError(error: unknown) {
  return {
    code: sanitizeDiagnostic(readErrorField(error, "code")) || "exam_error",
    message: sanitizeDiagnostic(readErrorField(error, "message")) || "unknown error",
  };
}

function sanitizeDiagnostic(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 180);
}

function readErrorField(error: unknown, field: "code" | "message") {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

function rejectUnexpectedKeys(value: Record<string, unknown>, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalidRequest("unexpected_field");
}

function requirePlainObject(value: unknown, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRequest(code);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") throw invalidRequest("invalid_answer");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidRequest("invalid_answer");
  return normalized;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, maxLength);
}

function optionalInteger(value: unknown, minimum: number, maximum: number) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw invalidRequest("invalid_answer");
  }
  return Number(value);
}

function requireUuid(value: unknown, code: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw invalidRequest(code);
  }
  return value.toLowerCase();
}

function normalizeNullableInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidRequest(code: string) {
  return new CanonicalExamError(code, 400, "La solicitud de evaluacion no es valida.");
}

function unavailableContent() {
  return new CanonicalExamError(
    "exam_content_unavailable",
    409,
    "El contenido de la evaluacion ya no esta disponible."
  );
}

function decisionLabel(value: boolean | null) {
  if (value === true) return "Infraccion";
  if (value === false) return "No infraccion";
  return "Sin respuesta";
}

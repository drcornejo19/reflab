import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { loadAccessSnapshot } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import { futsalRulesExamQuestions } from "../futsalRulesQuestions.ts";
import type { RuleQuestion } from "../questionBank.ts";
import { rulesQuestions } from "../rulesQuestions.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import { FREE_WEEKLY_EXAM_LIMIT, getCurrentWeekStart } from "../subscription.ts";
import { CanonicalExamError, sha256CanonicalJson } from "./canonicalExam.ts";

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const FOOTBALL_QUESTION_COUNT = 20;
const FUTSAL_QUESTION_COUNT = 10;

export type RulesExamSport = "football" | "futsal";
type DatabaseSport = "football_11" | "futsal";

type RulesExamManifestItem = {
  source_item_type: "rule_question";
  source_item_id: string;
  occurrence_id: string;
  position: number;
  source_version: string;
};

type RulesExamSessionRecord = {
  id: string;
  user_id: string;
  submission_id: string;
  sport_type: DatabaseSport;
  source_version: string | null;
  item_manifest: RulesExamManifestItem[];
  item_count: number;
  status: string;
  expires_at: string;
};

type RulesExamAnswer = {
  occurrenceId: string;
  selectedOption: number | null;
};

type EvaluatedRulesAttempt = Record<string, unknown> & {
  occurrence_id: string;
  source_item_type: "rule_question";
  source_item_id: string;
  score: number;
  max_score: number;
  is_correct: boolean;
};

export type RulesExamDependencies = {
  loadAccess(externalSubject: string): Promise<AccessSnapshot>;
  countWeeklyExams(userId: string, weekStart: Date): Promise<number>;
  loadCatalog(sportType: DatabaseSport): Promise<RuleQuestion[]>;
  loadOpenSession(
    userId: string,
    sportType: DatabaseSport,
    sourceVersion: string,
    now: Date
  ): Promise<RulesExamSessionRecord | null>;
  createSession(input: {
    userId: string;
    submissionId: string;
    sportType: DatabaseSport;
    sourceVersion: string;
    manifest: RulesExamManifestItem[];
    manifestHash: string;
    expiresAt: string;
  }): Promise<RulesExamSessionRecord>;
  loadSession(sessionId: string): Promise<RulesExamSessionRecord | null>;
  submitRpc(parameters: {
    p_user_id: string;
    p_exam_session_id: string;
    p_submission_id: string;
    p_payload_hash: string;
    p_evaluated_attempts: EvaluatedRulesAttempt[];
  }): Promise<unknown>;
  randomUuid(): string;
  now(): Date;
};

export async function startCanonicalRulesExam(
  externalSubject: string,
  rawInput: unknown,
  dependencies = createCanonicalRulesExamDependencies()
) {
  const requestedSport = parseStartInput(rawInput);
  const sportType = toDatabaseSport(requestedSport);
  const access = await dependencies.loadAccess(externalSubject);
  const catalog = validateCatalog(await dependencies.loadCatalog(sportType), sportType);
  const sourceVersion = requireSingleSourceVersion(catalog);
  const now = dependencies.now();

  const openSession = await dependencies.loadOpenSession(
    access.userId,
    sportType,
    sourceVersion,
    now
  );
  if (openSession) {
    return toPublicSession(openSession, catalog);
  }

  if (access.effectiveIndividualPlan !== "pro") {
    const used = await dependencies.countWeeklyExams(
      access.userId,
      getCurrentWeekStart(now)
    );
    if (used >= FREE_WEEKLY_EXAM_LIMIT) {
      throw new CanonicalExamError(
        "weekly_exam_limit_reached",
        403,
        "Ya usaste tu evaluacion semanal disponible."
      );
    }
  }

  const submissionId = dependencies.randomUuid();
  const selected = selectRulesQuestions(catalog, sportType, submissionId);
  const manifest = selected.map((question, index) => ({
    source_item_type: "rule_question" as const,
    source_item_id: String(question.id),
    occurrence_id: dependencies.randomUuid(),
    position: index + 1,
    source_version: question.source_version,
  }));
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
  const session = await dependencies.createSession({
    userId: access.userId,
    submissionId,
    sportType,
    sourceVersion,
    manifest,
    manifestHash: sha256CanonicalJson(manifest),
    expiresAt,
  });

  return toPublicSession(session, catalog);
}

export async function submitCanonicalRulesExam(
  externalSubject: string,
  sessionId: string,
  rawInput: unknown,
  dependencies = createCanonicalRulesExamDependencies()
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
  if (!["created", "active", "submitted"].includes(session.status)) {
    throw new CanonicalExamError(
      "exam_session_closed",
      409,
      "La sesion de evaluacion ya no admite entregas."
    );
  }
  if (
    session.status !== "submitted" &&
    new Date(session.expires_at).getTime() <= dependencies.now().getTime()
  ) {
    throw new CanonicalExamError(
      "exam_session_expired",
      409,
      "La sesion de evaluacion vencio."
    );
  }

  const catalog = validateCatalog(
    await dependencies.loadCatalog(session.sport_type),
    session.sport_type
  );
  const manifest = validateManifest(session, catalog);
  const answers = validateAnswerSet(input.answers, manifest, catalog);
  const evaluatedAttempts = evaluateRulesAnswers(manifest, answers, catalog, session.sport_type);
  const payloadHash = sha256CanonicalJson(evaluatedAttempts);

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

function createCanonicalRulesExamDependencies(): RulesExamDependencies {
  const supabase = createSupabaseAdminClient();
  const sessionColumns =
    "id,user_id,submission_id,sport_type,source_version,item_manifest,item_count,status,expires_at";

  return {
    loadAccess: (externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, { provisionMissing: false }),
    countWeeklyExams: async (userId, weekStart) => {
      const { count, error } = await supabase
        .from("exam_results")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", weekStart.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    loadCatalog: async (sportType) => getServerRulesCatalog(sportType),
    loadOpenSession: async (userId, sportType, sourceVersion, now) => {
      const { data, error } = await supabase
        .from("referee_exam_sessions")
        .select(sessionColumns)
        .eq("user_id", userId)
        .eq("sport_type", sportType)
        .eq("activity_type", "referee_exam")
        .eq("source_version", sourceVersion)
        .in("status", ["created", "active"])
        .gt("expires_at", now.toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const session = data as RulesExamSessionRecord;
      return isRulesManifest(session.item_manifest) ? session : null;
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
          season: seasonForSport(input.sportType),
          source_version: input.sourceVersion,
          item_manifest: input.manifest,
          manifest_hash: input.manifestHash,
          item_count: input.manifest.length,
          status: "active",
          expires_at: input.expiresAt,
        })
        .select(sessionColumns)
        .single();
      if (error) throw error;
      return data as RulesExamSessionRecord;
    },
    loadSession: async (id) => {
      const { data, error } = await supabase
        .from("referee_exam_sessions")
        .select(sessionColumns)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as RulesExamSessionRecord | null) ?? null;
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

function getServerRulesCatalog(sportType: DatabaseSport): RuleQuestion[] {
  if (sportType === "futsal") return futsalRulesExamQuestions;
  return rulesQuestions.map((question) => ({ ...question, question_mode: "exam" }));
}

function validateCatalog(catalog: RuleQuestion[], sportType: DatabaseSport) {
  const valid = catalog.filter(
    (question) =>
      question.sport_type === sportType &&
      question.question_mode === "exam" &&
      question.is_active !== false &&
      typeof question.correct === "number" &&
      question.correct >= 0 &&
      question.correct < question.options.length
  );
  const ids = new Set(valid.map((question) => String(question.id)));
  if (valid.length === 0 || ids.size !== valid.length) {
    throw new CanonicalExamError(
      "exam_content_unavailable",
      503,
      "El catalogo de reglas no esta disponible."
    );
  }
  return valid;
}

function requireSingleSourceVersion(catalog: RuleQuestion[]) {
  const versions = new Set(catalog.map((question) => question.source_version.trim()));
  if (versions.size !== 1 || versions.has("")) {
    throw new CanonicalExamError(
      "exam_content_unavailable",
      503,
      "El catalogo de reglas no tiene una version valida."
    );
  }
  return [...versions][0];
}

function selectRulesQuestions(
  catalog: RuleQuestion[],
  sportType: DatabaseSport,
  seed: string
) {
  const ranked = (questions: RuleQuestion[]) =>
    [...questions].sort((left, right) => rankQuestion(seed, left).localeCompare(rankQuestion(seed, right)));
  const limit = sportType === "futsal" ? FUTSAL_QUESTION_COUNT : FOOTBALL_QUESTION_COUNT;

  if (sportType === "futsal") return ranked(catalog).slice(0, limit);

  const selected: RuleQuestion[] = [];
  for (let law = 1; law <= 17; law += 1) {
    const candidate = ranked(catalog.filter((question) => question.topic === `Regla ${law}`))[0];
    if (candidate) selected.push(candidate);
  }
  const selectedIds = new Set(selected.map((question) => String(question.id)));
  const advanced = ranked(
    catalog.filter(
      (question) =>
        !selectedIds.has(String(question.id)) &&
        (question.topic === "VAR" || question.difficulty === "Avanzada")
    )
  );
  selected.push(...advanced.slice(0, Math.max(0, limit - selected.length)));
  selectedIds.clear();
  selected.forEach((question) => selectedIds.add(String(question.id)));
  if (selected.length < limit) {
    selected.push(
      ...ranked(catalog.filter((question) => !selectedIds.has(String(question.id)))).slice(
        0,
        limit - selected.length
      )
    );
  }
  if (selected.length !== limit) {
    throw new CanonicalExamError(
      "exam_content_unavailable",
      503,
      "No hay suficientes preguntas para iniciar la evaluacion."
    );
  }
  return ranked(selected);
}

function rankQuestion(seed: string, question: RuleQuestion) {
  return createHash("sha256").update(`${seed}:${question.id}`).digest("hex");
}

function toPublicSession(session: RulesExamSessionRecord, catalog: RuleQuestion[]) {
  const manifest = validateManifest(session, catalog);
  const questionMap = new Map(catalog.map((question) => [String(question.id), question]));
  return {
    id: session.id,
    submissionId: session.submission_id,
    sportType: toPublicSport(session.sport_type),
    expiresAt: session.expires_at,
    questions: manifest.map((item) => {
      const question = questionMap.get(item.source_item_id)!;
      return {
        occurrenceId: item.occurrence_id,
        id: item.source_item_id,
        question: question.question,
        options: [...question.options],
        lawReference: question.lawReference,
        difficulty: question.difficulty,
      };
    }),
  };
}

function validateManifest(session: RulesExamSessionRecord, catalog: RuleQuestion[]) {
  if (!isRulesManifest(session.item_manifest) || session.item_manifest.length !== session.item_count) {
    throw new CanonicalExamError(
      "invalid_exam_manifest",
      409,
      "La sesion no contiene un manifest de reglas valido."
    );
  }
  const questionMap = new Map(catalog.map((question) => [String(question.id), question]));
  const occurrences = new Set<string>();
  const sources = new Set<string>();
  for (const item of session.item_manifest) {
    const question = questionMap.get(item.source_item_id);
    if (
      !question ||
      item.source_version !== question.source_version ||
      occurrences.has(item.occurrence_id) ||
      sources.has(item.source_item_id)
    ) {
      throw new CanonicalExamError(
        "invalid_exam_manifest",
        409,
        "La sesion no coincide con el catalogo de reglas."
      );
    }
    requireUuid(item.occurrence_id, "invalid_exam_manifest");
    occurrences.add(item.occurrence_id);
    sources.add(item.source_item_id);
  }
  return [...session.item_manifest].sort((left, right) => left.position - right.position);
}

function isRulesManifest(value: unknown): value is RulesExamManifestItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        isPlainObject(item) &&
        item.source_item_type === "rule_question" &&
        typeof item.source_item_id === "string" &&
        typeof item.occurrence_id === "string" &&
        Number.isInteger(item.position) &&
        typeof item.source_version === "string"
    )
  );
}

function validateAnswerSet(
  answers: RulesExamAnswer[],
  manifest: RulesExamManifestItem[],
  catalog: RuleQuestion[]
) {
  if (answers.length !== manifest.length) {
    throw invalidRequest("invalid_answer_count");
  }
  const manifestByOccurrence = new Map(manifest.map((item) => [item.occurrence_id, item]));
  const questionMap = new Map(catalog.map((question) => [String(question.id), question]));
  const seen = new Set<string>();
  for (const answer of answers) {
    const item = manifestByOccurrence.get(answer.occurrenceId);
    const question = item ? questionMap.get(item.source_item_id) : undefined;
    if (!item || !question || seen.has(answer.occurrenceId)) {
      throw invalidRequest("invalid_answer_occurrence");
    }
    if (
      answer.selectedOption !== null &&
      (!Number.isInteger(answer.selectedOption) ||
        answer.selectedOption < 0 ||
        answer.selectedOption >= question.options.length)
    ) {
      throw invalidRequest("invalid_selected_option");
    }
    seen.add(answer.occurrenceId);
  }
  return new Map(answers.map((answer) => [answer.occurrenceId, answer]));
}

function evaluateRulesAnswers(
  manifest: RulesExamManifestItem[],
  answers: Map<string, RulesExamAnswer>,
  catalog: RuleQuestion[],
  sportType: DatabaseSport
) {
  const questionMap = new Map(catalog.map((question) => [String(question.id), question]));
  return manifest.map((item) => {
    const question = questionMap.get(item.source_item_id)!;
    const answer = answers.get(item.occurrence_id)!;
    const selectedOption = answer.selectedOption;
    const isCorrect = selectedOption === question.correct;
    const criteria = criterionFields(question, sportType, isCorrect);
    return {
      occurrence_id: item.occurrence_id,
      source_item_type: "rule_question" as const,
      source_item_id: item.source_item_id,
      clip_title: question.question,
      topic: canonicalTopic(question, sportType),
      subtopic: question.subtopic ?? null,
      rule_reference: question.rule_reference,
      difficulty: question.difficulty,
      selected_decision:
        selectedOption === null ? "Sin responder" : question.options[selectedOption],
      correct_decision: question.options[question.correct],
      score: isCorrect ? 1 : 0,
      max_score: 1,
      is_correct: isCorrect,
      ...criteria,
      criterion_result: criteria,
      feedback: question.officialExplanation ?? question.explanation,
    } satisfies EvaluatedRulesAttempt;
  });
}

function canonicalTopic(question: RuleQuestion, sportType: DatabaseSport) {
  const text = normalizeText(
    [question.topic, question.subtopic, question.question, question.rule_reference, ...(question.criterion_tags ?? [])].join(" ")
  );
  if (sportType === "football_11") {
    if (text.includes("var")) return "VAR";
    if (text.includes("regla 11") || text.includes("offside") || text.includes("fuera de juego")) {
      return "Fuera de juego";
    }
    if (text.includes("mano") || text.includes("handball") || text.includes("brazo")) return "Manos";
    if (text.includes("dogso") || text.includes("spa") || text.includes("falta tactica")) {
      return "Faltas tacticas";
    }
    return "Disputas";
  }
  if (text.includes("accumulated foul") || text.includes("falta acumulada")) {
    return "Faltas tacticas";
  }
  return "Disputas";
}

function criterionFields(question: RuleQuestion, sportType: DatabaseSport, value: boolean) {
  const text = normalizeText(
    [question.topic, question.subtopic, question.question, question.rule_reference, ...(question.criterion_tags ?? [])].join(" ")
  );
  const fields: Record<string, boolean> = { technical_correct: value };
  if (/restart|saque|tiro libre|balon a tierra|kick in|goal clearance/.test(text)) {
    fields.restart_correct = value;
  }
  if (/disciplin|tarjeta|amonest|expulsion|roja|dogso|spa/.test(text)) {
    fields.disciplinary_correct = value;
  }
  if (sportType === "football_11" && canonicalTopic(question, sportType) === "Fuera de juego") {
    fields.subtype_correct = value;
  }
  if (/accumulated foul|falta acumulada/.test(text)) fields.accumulated_foul_correct = value;
  if (/four second|cuatro segundo/.test(text)) fields.four_second_correct = value;
  if (/goalkeeper|guardameta/.test(text)) fields.goalkeeper_correct = value;
  if (sportType === "football_11" && canonicalTopic(question, sportType) === "VAR") {
    fields.var_correct = value;
  }
  return fields;
}

function toPublicEvaluatedAttempt(attempt: EvaluatedRulesAttempt) {
  return {
    occurrenceId: String(attempt.occurrence_id),
    questionId: String(attempt.source_item_id),
    question: String(attempt.clip_title ?? "Pregunta de reglas"),
    topic: String(attempt.topic ?? ""),
    subtopic: typeof attempt.subtopic === "string" ? attempt.subtopic : null,
    lawReference: String(attempt.rule_reference ?? ""),
    difficulty: String(attempt.difficulty ?? ""),
    selectedText: String(attempt.selected_decision ?? "Sin responder"),
    correctText: String(attempt.correct_decision ?? ""),
    explanation: String(attempt.feedback ?? ""),
    score: Number(attempt.score) * 100,
    isCorrect: attempt.is_correct === true,
  };
}

function parseStartInput(value: unknown): RulesExamSport {
  const body = requirePlainObject(value);
  rejectUnexpectedKeys(body, ["sportType"]);
  if (body.sportType !== "football" && body.sportType !== "futsal") {
    throw invalidRequest("invalid_sport_type");
  }
  return body.sportType;
}

function parseSubmitInput(value: unknown) {
  const body = requirePlainObject(value);
  rejectUnexpectedKeys(body, ["submission_id", "answers"]);
  const submissionId = requireUuid(body.submission_id, "invalid_submission_id");
  if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 100) {
    throw invalidRequest("invalid_answers");
  }
  const answers = body.answers.map((rawAnswer) => {
    const answer = requirePlainObject(rawAnswer);
    rejectUnexpectedKeys(answer, ["occurrence_id", "selected_option"]);
    return {
      occurrenceId: requireUuid(answer.occurrence_id, "invalid_occurrence_id"),
      selectedOption:
        answer.selected_option === null
          ? null
          : requireInteger(answer.selected_option, "invalid_selected_option"),
    } satisfies RulesExamAnswer;
  });
  return { submissionId, answers };
}

function parseRpcResult(value: unknown) {
  const result = requirePlainObject(value);
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

function classifyRpcError(error: unknown) {
  const message = readErrorField(error, "message").toLowerCase();
  if (message.includes("already used with different content")) {
    return new CanonicalExamError(
      "submission_conflict",
      409,
      "La entrega ya fue utilizada con respuestas diferentes."
    );
  }
  if (message.includes("expired")) {
    return new CanonicalExamError("exam_session_expired", 409, "La sesion de evaluacion vencio.");
  }
  if (message.includes("not open") || message.includes("does not match")) {
    return new CanonicalExamError("exam_session_closed", 409, "La sesion ya fue enviada.");
  }
  if (message.includes("not found") || message.includes("does not belong")) {
    return new CanonicalExamError("exam_session_not_found", 404, "La sesion de evaluacion no existe.");
  }
  return new CanonicalExamError("exam_submit_failed", 500, "No se pudo guardar la evaluacion.");
}

function seasonForSport(sportType: DatabaseSport) {
  return sportType === "futsal" ? "2024-25" : "2026/27";
}

function toDatabaseSport(sportType: RulesExamSport): DatabaseSport {
  return sportType === "football" ? "football_11" : "futsal";
}

function toPublicSport(sportType: DatabaseSport): RulesExamSport {
  return sportType === "football_11" ? "football" : "futsal";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function requirePlainObject(value: unknown) {
  if (!isPlainObject(value)) throw invalidRequest("invalid_request");
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw invalidRequest("unexpected_field");
  }
}

function requireUuid(value: unknown, code: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw invalidRequest(code);
  }
  return value;
}

function requireInteger(value: unknown, code: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw invalidRequest(code);
  return value;
}

function invalidRequest(code: string) {
  return new CanonicalExamError(code, 400, "La solicitud de evaluacion no es valida.");
}

function readErrorField(error: unknown, field: "code" | "message") {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

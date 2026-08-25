import "server-only";

import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import {
  normalizeClipDecision,
  validateClipDecision,
  type ClipDecisionPayload,
  type ClipRecord,
} from "../clips.ts";
import {
  getGoverningBodyForSport,
  isSportType,
  isTopicAllowedForSport,
  type SportType,
} from "../sports.ts";
import { getVideoTopicSchema } from "../videoAnalysisSchemas.ts";
import type { TrainingMode } from "../types.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const clipModes = ["field", "var", "english", "exam", "training"] as const;
const clipDifficulties = ["basic", "intermediate", "advanced", "elite"] as const;
const clipStatuses = ["draft", "published", "archived"] as const;
const clipLanguages = ["es", "en", "pt", "multi"] as const;
const normativeStatuses = ["vigente", "proxima_actualizacion", "archivado"] as const;
const englishTopics = new Set([
  "Communication",
  "foul_explanation",
  "disciplinary",
  "var_communication",
  "team_management",
  "offside_communication",
  "penalty_incident",
  "report_language",
  "DOGSO",
  "SPA",
  "Handball",
  "Offside",
]);

const mutableFields = new Set([
  "sport_type",
  "title",
  "description",
  "video_url",
  "topic",
  "subtopic",
  "sub_type",
  "decision_detail",
  "category",
  "module",
  "type",
  "training_type",
  "difficulty",
  "mode",
  "correct_foul",
  "correct_restart",
  "correct_discipline",
  "correct_var",
  "incident_type",
  "correct_clear_error",
  "correct_app_status",
  "correct_var_decision",
  "explanation",
  "rule_reference",
  "season",
  "source_version",
  "source_official",
  "governing_body",
  "technical_resolution",
  "disciplinary_resolution",
  "normative_status",
  "language",
  "reviewed_at",
  "analysis_answers",
  "is_active",
  "status",
]);

const clipSelect = "*";

export type AdminClipFilters = {
  sportType?: SportType;
  mode?: TrainingMode;
  status?: (typeof clipStatuses)[number];
  isActive?: boolean;
  topic?: string;
  limit: number;
};

export type AdminClipMutation = ClipDecisionPayload & {
  category?: string | null;
  module?: string | null;
  type?: string | null;
  training_type?: string | null;
  incident_type?: string | null;
  correct_clear_error?: "yes" | "no" | "unclear" | null;
  correct_app_status?: "same_app" | "new_app" | "not_relevant" | null;
  correct_var_decision?: "check_complete" | "recommend_ofr" | "factual_review" | null;
  is_active: boolean;
  status: (typeof clipStatuses)[number];
};

export class AdminClipError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message);
    this.name = "AdminClipError";
    this.status = status;
    this.code = code;
  }
}

export function parseAdminClipFilters(url: string): AdminClipFilters {
  const params = new URL(url).searchParams;
  const allowed = new Set(["sport", "mode", "status", "isActive", "topic", "limit"]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) invalid(`Filtro no permitido: ${key}.`);
  }

  const sport = params.get("sport");
  if (sport !== null && !isSportType(sport)) invalid("Disciplina invalida.");
  const mode = params.get("mode");
  if (mode !== null && !includes(clipModes, mode)) invalid("Modo invalido.");
  const status = params.get("status");
  if (status !== null && !includes(clipStatuses, status)) invalid("Estado invalido.");
  const active = params.get("isActive");
  if (active !== null && active !== "true" && active !== "false") {
    invalid("Filtro de actividad invalido.");
  }
  const topic = params.get("topic");
  if (topic !== null && (topic.trim().length === 0 || topic.length > 100)) {
    invalid("Topico invalido.");
  }
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 200 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) invalid("Limite invalido.");

  return stripUndefined({
    sportType: sport ?? undefined,
    mode: mode ?? undefined,
    status: status ?? undefined,
    isActive: active === null ? undefined : active === "true",
    topic: topic?.trim() || undefined,
    limit,
  }) as AdminClipFilters;
}

export function parseAdminClipCreate(input: unknown): AdminClipMutation {
  const object = parseObject(input);
  rejectUnknownFields(object);
  return normalizeAndValidateMutation(object, null);
}

export function parseAdminClipPatch(
  input: unknown,
  existing: ClipRecord
): AdminClipMutation {
  const object = parseObject(input);
  rejectUnknownFields(object);
  if (Object.keys(object).length === 0) invalid("No hay cambios para aplicar.");
  return normalizeAndValidateMutation(object, existing);
}

export async function listAdminClips(
  supabase: SupabaseAdminClient,
  filters: AdminClipFilters
) {
  let query = supabase
    .from("clips")
    .select(clipSelect)
    .order("created_at", { ascending: false });

  if (filters.sportType) query = query.eq("sport_type", filters.sportType);
  if (filters.mode) query = query.eq("mode", filters.mode);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.isActive !== undefined) query = query.eq("is_active", filters.isActive);
  if (filters.topic) query = query.eq("topic", filters.topic);

  const { data, error } = await query.limit(filters.limit);
  if (error) unavailable("No se pudieron cargar los clips.", error);
  return (data ?? []) as ClipRecord[];
}

export async function createAdminClip(
  supabase: SupabaseAdminClient,
  actorUserId: string,
  input: unknown
) {
  const payload = parseAdminClipCreate(input);
  const { data, error } = await supabase
    .from("clips")
    .insert(payload)
    .select(clipSelect)
    .single();
  if (error || !data) unavailable("No se pudo crear el clip.", error);

  await recordClipAudit(supabase, actorUserId, "clip.created", null, data as ClipRecord);
  return data as ClipRecord;
}

export async function updateAdminClip(
  supabase: SupabaseAdminClient,
  actorUserId: string,
  clipId: string,
  input: unknown
) {
  assertUuid(clipId, "Clip invalido.");
  const existing = await loadAdminClip(supabase, clipId);
  const payload = parseAdminClipPatch(input, existing);
  const { data, error } = await supabase
    .from("clips")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", clipId)
    .select(clipSelect)
    .single();
  if (error || !data) unavailable("No se pudo actualizar el clip.", error);

  await recordClipAudit(
    supabase,
    actorUserId,
    "clip.updated",
    existing,
    data as ClipRecord
  );
  return data as ClipRecord;
}

export async function deactivateAdminClip(
  supabase: SupabaseAdminClient,
  actorUserId: string,
  clipId: string
) {
  assertUuid(clipId, "Clip invalido.");
  const existing = await loadAdminClip(supabase, clipId);
  const { data, error } = await supabase
    .from("clips")
    .update({ is_active: false, status: "archived", updated_at: new Date().toISOString() })
    .eq("id", clipId)
    .select(clipSelect)
    .single();
  if (error || !data) unavailable("No se pudo desactivar el clip.", error);

  await recordClipAudit(
    supabase,
    actorUserId,
    "clip.deactivated",
    existing,
    data as ClipRecord
  );
  return data as ClipRecord;
}

export function getAdminClipPublicError(error: unknown) {
  if (error instanceof AdminClipError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  return {
    status: 500,
    body: {
      error: "admin_clip_unavailable",
      message: "No se pudo completar la operacion de clips.",
    },
  };
}

async function loadAdminClip(supabase: SupabaseAdminClient, clipId: string) {
  const { data, error } = await supabase
    .from("clips")
    .select(clipSelect)
    .eq("id", clipId)
    .maybeSingle();
  if (error) unavailable("No se pudo cargar el clip.", error);
  if (!data) throw new AdminClipError(404, "clip_not_found", "Clip no encontrado.");
  return data as ClipRecord;
}

function normalizeAndValidateMutation(
  patch: Record<string, unknown>,
  existing: ClipRecord | null
): AdminClipMutation {
  const source = existing ? { ...existing, ...patch } : patch;
  const sportType = requiredEnum(source.sport_type, ["football_11", "futsal"], "Disciplina invalida.");
  const mode = requiredEnum(source.mode, clipModes, "Modo invalido.");
  const status = requiredEnum(
    source.status === undefined && !existing ? "published" : source.status,
    clipStatuses,
    "Estado invalido."
  );
  const isActive = requiredBoolean(
    source.is_active === undefined && !existing ? true : source.is_active,
    "Estado activo invalido."
  );
  const title = requiredString(source.title, "Titulo invalido.", 160);
  const videoUrl = validateVideoUrl(requiredString(source.video_url, "URL de video invalida.", 2048));
  const topic = requiredString(source.topic, "Topico invalido.", 100);
  const difficulty = requiredEnum(source.difficulty, clipDifficulties, "Dificultad invalida.");
  const governingBody =
    optionalString(source.governing_body, "Organismo rector invalido.", 30) ??
    getGoverningBodyForSport(sportType);

  if (mode === "english") {
    if (sportType !== "football_11" || !englishTopics.has(topic)) {
      invalid("El topico de comunicacion no es valido.");
    }
  } else if (!isTopicAllowedForSport(sportType, topic)) {
    invalid("El topico no coincide con la disciplina del clip.");
  }
  if (sportType === "futsal" && (mode === "var" || mode === "english")) {
    invalid("El modo no coincide con Futsal.");
  }
  if (governingBody !== getGoverningBodyForSport(sportType)) {
    invalid("El organismo rector no coincide con la disciplina del clip.");
  }

  const analysisAnswers = optionalAnswerRecord(source.analysis_answers);
  validateAnalysisAnswers(sportType, topic, analysisAnswers);

  const payload = normalizeClipDecision({
    sport_type: sportType,
    title,
    description: optionalString(source.description, "Descripcion invalida.", 4000),
    video_url: videoUrl,
    topic,
    subtopic: optionalString(source.subtopic, "Subtopico invalido.", 160),
    sub_type: optionalString(source.sub_type, "Subtipo invalido.", 160),
    decision_detail: optionalString(source.decision_detail, "Decision invalida.", 1000),
    difficulty,
    mode,
    correct_foul: optionalBoolean(source.correct_foul, "Decision tecnica invalida."),
    correct_restart: optionalString(source.correct_restart, "Reanudacion invalida.", 160),
    correct_discipline: optionalString(source.correct_discipline, "Disciplina invalida.", 160),
    correct_var: optionalBoolean(source.correct_var, "Decision VAR invalida."),
    explanation: optionalString(source.explanation, "Explicacion invalida.", 8000),
    rule_reference: optionalString(source.rule_reference, "Referencia invalida.", 500),
    season: optionalString(source.season, "Temporada invalida.", 80),
    source_version: optionalString(source.source_version, "Version invalida.", 160),
    source_official: optionalString(source.source_official, "Fuente invalida.", 1000),
    governing_body: governingBody,
    technical_resolution: optionalString(source.technical_resolution, "Resolucion tecnica invalida.", 4000),
    disciplinary_resolution: optionalString(source.disciplinary_resolution, "Resolucion disciplinaria invalida.", 4000),
    normative_status: optionalEnum(source.normative_status, normativeStatuses, "Estado normativo invalido."),
    language: optionalEnum(source.language, clipLanguages, "Idioma invalido."),
    reviewed_at: optionalDate(source.reviewed_at),
    analysis_answers: analysisAnswers,
  });

  const validation = validateClipDecision(payload);
  if (!validation.valid) invalid(validation.messages.join(" "));

  return {
    ...payload,
    category: optionalString(source.category, "Categoria invalida.", 160),
    module: optionalString(source.module, "Modulo invalido.", 160),
    type: optionalString(source.type, "Tipo invalido.", 160),
    training_type: optionalString(source.training_type, "Tipo de entrenamiento invalido.", 160),
    incident_type: optionalString(source.incident_type, "Incidente invalido.", 160),
    correct_clear_error: optionalEnum(
      source.correct_clear_error,
      ["yes", "no", "unclear"],
      "Criterio de error claro invalido."
    ),
    correct_app_status: optionalEnum(
      source.correct_app_status,
      ["same_app", "new_app", "not_relevant"],
      "Estado APP invalido."
    ),
    correct_var_decision: optionalEnum(
      source.correct_var_decision,
      ["check_complete", "recommend_ofr", "factual_review"],
      "Decision VAR invalida."
    ),
    is_active: status === "archived" ? false : isActive,
    status,
  };
}

function validateAnalysisAnswers(
  sportType: SportType,
  topic: string,
  answers: Record<string, string | boolean | null> | null
) {
  if (sportType !== "futsal") return;
  const schema = getVideoTopicSchema(sportType, topic);
  if (!schema) invalid("El topico de Futsal no tiene un contrato de respuestas valido.");
  const provided = answers ?? {};
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(provided)) {
    if (!fields.has(key as never)) invalid(`Respuesta de analisis no permitida: ${key}.`);
  }
  for (const field of schema.fields) {
    const value = provided[field.key];
    if (field.required && (value === undefined || value === null || value === "")) {
      invalid(`Falta la respuesta requerida: ${field.key}.`);
    }
    if (value === undefined || value === null || value === "") continue;
    if (field.kind === "text" && typeof value !== "string") {
      invalid(`La respuesta ${field.key} debe ser texto.`);
    }
    if (field.kind !== "text") {
      const allowed = field.options?.map((option) => option.value) ?? [];
      const token = typeof value === "boolean" ? String(value) : value;
      if (typeof token !== "string" || !allowed.includes(token)) {
        invalid(`La respuesta ${field.key} no es valida.`);
      }
    }
  }
}

async function recordClipAudit(
  supabase: SupabaseAdminClient,
  actorUserId: string,
  action: "clip.created" | "clip.updated" | "clip.deactivated",
  before: ClipRecord | null,
  after: ClipRecord
) {
  const { error } = await supabase.from("platform_audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    entity_type: "clip",
    entity_id: after.id,
    before_state: before ? auditState(before) : {},
    after_state: auditState(after),
    metadata: { source: "admin_clips_api" },
  });
  if (error) {
    console.error("[admin.clips.audit]", sanitizeDiagnostic(error));
  }
}

function auditState(clip: ClipRecord) {
  return {
    sport_type: clip.sport_type ?? null,
    title: clip.title,
    topic: clip.topic,
    mode: clip.mode ?? null,
    status: clip.status ?? null,
    is_active: clip.is_active ?? null,
  };
}

function rejectUnknownFields(object: Record<string, unknown>) {
  const unknown = Object.keys(object).filter((key) => !mutableFields.has(key));
  if (unknown.length > 0) invalid(`Campos no permitidos: ${unknown.join(", ")}.`);
}

function parseObject(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid("Body invalido.");
  }
  return input as Record<string, unknown>;
}

function validateVideoUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid("URL de video invalida.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    invalid("La URL de video debe usar HTTP o HTTPS sin credenciales.");
  }
  if (/\0|(?:^|\/)(?:\.\.?)(?:\/|$)/.test(value)) {
    invalid("La URL de video contiene un path no permitido.");
  }
  return url.toString();
}

function requiredString(value: unknown, message: string, max: number) {
  const normalized = optionalString(value, message, max);
  if (!normalized) invalid(message);
  return normalized;
}

function optionalString(value: unknown, message: string, max: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") invalid(message);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)) {
    invalid(message);
  }
  return normalized;
}

function optionalBoolean(value: unknown, message: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") invalid(message);
  return value;
}

function requiredBoolean(value: unknown, message: string) {
  const parsed = optionalBoolean(value, message);
  if (parsed === null) invalid(message);
  return parsed;
}

function requiredEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  message: string
) {
  const parsed = optionalEnum(value, allowed, message);
  if (!parsed) invalid(message);
  return parsed;
}

function optionalEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  message: string
): Value | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !includes(allowed, value)) invalid(message);
  return value;
}

function optionalDate(value: unknown) {
  const normalized = optionalString(value, "Fecha de revision invalida.", 40);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) invalid("Fecha de revision invalida.");
  return new Date(timestamp).toISOString();
}

function optionalAnswerRecord(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    invalid("Respuestas de analisis invalidas.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 40) invalid("Demasiadas respuestas de analisis.");
  const result: Record<string, string | boolean | null> = {};
  for (const [key, entry] of entries) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) invalid("Clave de analisis invalida.");
    if (entry === null || typeof entry === "boolean") result[key] = entry;
    else if (typeof entry === "string" && entry.trim().length <= 1000) result[key] = entry.trim();
    else invalid(`Valor de analisis invalido: ${key}.`);
  }
  return result;
}

function assertUuid(value: string, message: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    invalid(message);
  }
}

function includes<const Value extends string>(allowed: readonly Value[], value: string): value is Value {
  return (allowed as readonly string[]).includes(value);
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

function invalid(message: string): never {
  throw new AdminClipError(400, "invalid_admin_clip", message);
}

function unavailable(message: string, error: unknown): never {
  console.error("[admin.clips]", sanitizeDiagnostic(error));
  throw new AdminClipError(500, "admin_clip_unavailable", message);
}

function sanitizeDiagnostic(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return {
    code: typeof candidate?.code === "string" ? candidate.code.slice(0, 80) : null,
    message:
      typeof candidate?.message === "string"
        ? candidate.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300)
        : "unknown error",
  };
}

import {
  getGoverningBodyForSport,
  isTopicAllowedForSport,
} from "@/lib/sports";
import { parseInstitutionalClipSportType } from "@/lib/institutionalClip";
import {
  institutionalErrorResponse,
  institutionalJson,
} from "@/lib/institutional/http";
import {
  assertInstitutionWriteAllowed,
  requireInstitutionPermission,
} from "@/lib/institutional/server";
import {
  InstitutionalVideoStorageError,
  uploadInstitutionalVideoWithCompensation,
  type InstitutionalVideoFile,
  type InstitutionalVideoUpload,
} from "@/lib/institutional/videoStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clipSelect =
  "id, title, description, match_context, incident_minute, category, topic, subtopic, rule_reference, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at, sport_type, season, source_version, source_official, governing_body, technical_resolution, disciplinary_resolution, normative_status, language, reviewed_at";

export async function GET() {
  try {
    const access = await requireInstitutionPermission("content.read");
    const { data, error } = await access.supabase
      .from("institutional_clips")
      .select(clipSelect)
      .eq("institution_id", access.institutionId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return institutionalJson({ clips: data ?? [] });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudieron cargar los videos institucionales."
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireInstitutionPermission("content.manage");
    assertInstitutionWriteAllowed(access);
    const parsed = (request.headers.get("content-type") ?? "").includes(
      "multipart/form-data"
    )
      ? await readFormPayload(request)
      : { payload: await readJsonPayload(request), file: undefined };
    const validated = validateClipPayload(parsed.payload);

    const persist = (upload?: InstitutionalVideoUpload) =>
      insertInstitutionalClip({
        access,
        validated,
        upload,
      });
    const clip = parsed.file
      ? await uploadInstitutionalVideoWithCompensation({
          storage: access.supabase.storage,
          institutionId: access.institutionId,
          canonicalUserId: access.userId,
          file: parsed.file,
          persist,
          onCleanupFailure(error) {
            console.error("Institutional video cleanup failed.", {
              errorType: error instanceof Error ? error.name : "StorageError",
            });
          },
        })
      : await persist();

    return institutionalJson({ clip });
  } catch (error) {
    if (
      error instanceof InstitutionalClipPayloadError ||
      error instanceof InstitutionalVideoStorageError
    ) {
      return institutionalJson(
        { error: error.message, code: error.code },
        error.status
      );
    }

    return institutionalErrorResponse(
      error,
      "No se pudo procesar el envio del video."
    );
  }
}

type ClipPayload = {
  title: string;
  sport_type?: string;
  description?: string;
  match_context?: string;
  incident_minute?: string;
  category?: string;
  topic?: string;
  subtopic?: string;
  rule_reference?: string;
  correct_decision?: string;
  correct_restart?: string;
  correct_discipline?: string;
  final_expected_answer?: string;
  explanation?: string;
  ifab_var_criteria?: string;
  difficulty?: string;
  mode?: string;
  is_public?: boolean;
  season?: string;
  source_version?: string;
  source_official?: string;
  governing_body?: string;
  technical_resolution?: string;
  disciplinary_resolution?: string;
  normative_status?: string;
  language?: string;
  reviewed_at?: string;
  source_url?: string;
};

type ValidatedClipPayload = {
  payload: ClipPayload;
  sportType: "football_11" | "futsal";
  governingBody: string;
};

async function insertInstitutionalClip(input: {
  access: Awaited<ReturnType<typeof requireInstitutionPermission>>;
  validated: ValidatedClipPayload;
  upload?: InstitutionalVideoUpload;
}) {
  const { access, validated, upload } = input;
  const { payload, sportType, governingBody } = validated;
  const { data, error } = await access.supabase
    .from("institutional_clips")
    .insert({
      institution_id: access.institutionId,
      uploaded_by: access.userId,
      sport_type: sportType,
      source_url: payload.source_url || null,
      storage_path: upload?.storagePath ?? null,
      original_filename: upload?.originalFilename ?? null,
      title: payload.title.trim(),
      description: payload.description || null,
      match_context: payload.match_context || null,
      incident_minute: payload.incident_minute || null,
      category: payload.category || null,
      topic: payload.topic || null,
      subtopic: payload.subtopic || null,
      rule_reference: payload.rule_reference || null,
      correct_decision: payload.correct_decision || null,
      correct_restart: payload.correct_restart || null,
      correct_discipline: payload.correct_discipline || null,
      final_expected_answer: payload.final_expected_answer || null,
      explanation: payload.explanation || null,
      ifab_var_criteria: payload.ifab_var_criteria || null,
      difficulty: payload.difficulty || null,
      mode: payload.mode || "institutional_video",
      is_public: Boolean(payload.is_public),
      status: "uploaded",
      season: payload.season || null,
      source_version: payload.source_version || null,
      source_official: payload.source_official || null,
      governing_body: governingBody,
      technical_resolution: payload.technical_resolution || null,
      disciplinary_resolution: payload.disciplinary_resolution || null,
      normative_status: payload.normative_status || null,
      language: payload.language || null,
      reviewed_at: payload.reviewed_at || null,
    })
    .select(clipSelect)
    .single();

  if (error || !data) {
    throw new InstitutionalVideoStorageError(
      500,
      "institutional_video_persistence_failed",
      "No se pudo guardar el video institucional."
    );
  }
  return data;
}

function validateClipPayload(payload: ClipPayload): ValidatedClipPayload {
  if (!payload.title || payload.title.trim().length < 3) {
    invalidPayload("El titulo del clip es obligatorio.");
  }
  const parsedSportType = parseInstitutionalClipSportType(payload.sport_type);
  if (!parsedSportType.ok) invalidPayload(parsedSportType.error);
  const sportType = parsedSportType.value;
  const governingBody =
    payload.governing_body || getGoverningBodyForSport(sportType);

  if (!isTopicAllowedForSport(sportType, payload.topic)) {
    invalidPayload("El topico no coincide con la disciplina del clip.");
  }
  if (governingBody !== getGoverningBodyForSport(sportType)) {
    invalidPayload("El organismo rector no coincide con la disciplina del clip.");
  }

  return { payload, sportType, governingBody };
}

async function readJsonPayload(request: Request): Promise<ClipPayload> {
  const body = asRecord(await request.json());
  return payloadFrom((key) => body[key]);
}

async function readFormPayload(request: Request): Promise<{
  payload: ClipPayload;
  file?: InstitutionalVideoFile;
}> {
  const form = await request.formData();
  const fileValue = form.get("video_file");
  if (fileValue !== null && !(fileValue instanceof File)) {
    invalidPayload("El archivo de video no es valido.");
  }

  return {
    payload: payloadFrom((key) => form.get(key)),
    file:
      fileValue instanceof File && fileValue.size > 0 ? fileValue : undefined,
  };
}

function payloadFrom(read: (key: string) => unknown): ClipPayload {
  return {
    title: String(read("title") ?? ""),
    sport_type: nullableString(read("sport_type")),
    description: nullableString(read("description")),
    match_context: nullableString(read("match_context")),
    incident_minute: nullableString(read("incident_minute")),
    category: nullableString(read("category")),
    topic: nullableString(read("topic")),
    subtopic: nullableString(read("subtopic")),
    rule_reference: nullableString(read("rule_reference")),
    correct_decision: nullableString(read("correct_decision")),
    correct_restart: nullableString(read("correct_restart")),
    correct_discipline: nullableString(read("correct_discipline")),
    final_expected_answer: nullableString(read("final_expected_answer")),
    explanation: nullableString(read("explanation")),
    ifab_var_criteria: nullableString(read("ifab_var_criteria")),
    difficulty: nullableString(read("difficulty")),
    mode: nullableString(read("mode")),
    is_public: read("is_public") === true || read("is_public") === "true",
    season: nullableString(read("season")),
    source_version: nullableString(read("source_version")),
    source_official: nullableString(read("source_official")),
    governing_body: nullableString(read("governing_body")),
    technical_resolution: nullableString(read("technical_resolution")),
    disciplinary_resolution: nullableString(read("disciplinary_resolution")),
    normative_status: nullableString(read("normative_status")),
    language: nullableString(read("language")),
    reviewed_at: nullableString(read("reviewed_at")),
    source_url: nullableString(read("source_url")),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function invalidPayload(message: string): never {
  throw new InstitutionalClipPayloadError(message);
}

class InstitutionalClipPayloadError extends Error {
  readonly status = 400;
  readonly code = "invalid_institutional_clip";
}

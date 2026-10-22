import "server-only";

import {
  assertInstitutionWriteAllowed,
  InstitutionAccessError,
  requireInstitutionPermission,
  type InstitutionAuthorization,
} from "@/lib/institutional/server";
import {
  removeInstitutionStorageObject,
  writeInstitutionAuditLog,
} from "@/lib/institutional/audit-server";
import {
  INSTITUTIONAL_CONTENT_BUCKET,
  requireInstitutionContentStoragePath,
  requireInstitutionContentUploadPath,
} from "@/lib/institutional/contentStorage";
import {
  isInstitutionContentStatus,
  isInstitutionContentType,
  isInstitutionContentVisibility,
  type InstitutionAssignmentTarget,
  type InstitutionContentMetadata,
  type InstitutionContentRecord,
  type InstitutionContentStatus,
  type InstitutionContentType,
  type InstitutionContentVisibility,
  type InstitutionContentWorkspace,
} from "@/lib/institutional/types";
import { isSportType, type SportType } from "@/lib/sports";

const CONTENT_SELECT =
  "id,institution_id,sport_type,content_type,title,description,author_user_id,topic,subtopic,rule_reference,difficulty,language,valid_from,valid_until,source_name,source_url,storage_path,visibility,status,version,published_at,expires_at,metadata,created_at,updated_at";
const ASSIGNMENT_SELECT =
  "id,content_id,group_id,user_id,available_from,due_at,required";

export type SaveInstitutionContentInput = {
  sportType: SportType;
  contentType: InstitutionContentType;
  title: string;
  description: string | null;
  topic: string | null;
  subtopic: string | null;
  ruleReference: string | null;
  difficulty: string | null;
  language: string;
  validFrom: string | null;
  validUntil: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  storagePath: string | null;
  visibility: InstitutionContentVisibility;
  status: InstitutionContentStatus;
  version: number;
  expiresAt: string | null;
  metadata: InstitutionContentMetadata;
  groupIds: string[];
  userIds: string[];
  availableFrom: string | null;
  dueAt: string | null;
  required: boolean;
};

export async function getInstitutionContentWorkspace(
  explicitInstitutionId?: string | null
): Promise<InstitutionContentWorkspace> {
  const authorization = await requireInstitutionPermission(
    "content.manage",
    explicitInstitutionId
  );
  return loadContentWorkspace(authorization);
}

export async function loadContentWorkspace(
  authorization: InstitutionAuthorization
): Promise<InstitutionContentWorkspace> {
  const { context, supabase } = authorization;
  const institutionId = context.institution.id;
  const canManage = can(authorization, "content.manage");
  const contentQuery = supabase
    .from("institution_contents")
    .select(CONTENT_SELECT)
    .eq("institution_id", institutionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(250);

  if (!canManage) {
    contentQuery.eq("status", "published");
  }

  const { data: contentRows, error: contentError } = await contentQuery;
  if (contentError) throw new InstitutionAccessError(contentError.message);

  const contentIds = (contentRows ?? []).map((row) => String(row.id));
  const assignmentRows = contentIds.length
    ? await fetchRows(
        supabase
          .from("institution_content_assignments")
          .select(ASSIGNMENT_SELECT)
          .eq("institution_id", institutionId)
          .in("content_id", contentIds)
      )
    : [];

  const [groups, members] = canManage
    ? await Promise.all([
        loadGroupTargets(authorization),
        loadMemberTargets(authorization),
      ])
    : [[], []];

  return {
    institution: context.institution,
    capabilities: {
      canManage,
      canPublish: can(authorization, "content.publish"),
    },
    contents: await Promise.all(
      (contentRows ?? []).map((row) =>
        normalizeContentRecord(
          authorization,
          row as UnknownRow,
          assignmentRows.filter(
            (assignment) => String(assignment.content_id) === String(row.id)
          )
        )
      )
    ),
    groups,
    members,
  };
}

export async function createInstitutionContent(
  explicitInstitutionId: string | null,
  input: SaveInstitutionContentInput
) {
  const authorization = await requireInstitutionPermission(
    "content.manage",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  validateContentInput(authorization, input);
  const storagePath = input.storagePath
    ? requireInstitutionContentUploadPath({
        storagePath: input.storagePath,
        institutionId: authorization.context.institution.id,
        canonicalUserId: authorization.userId,
      })
    : null;
  await assertStoragePathIsUnreferenced(authorization, storagePath);

  const now = new Date().toISOString();
  const { data, error } = await authorization.supabase
    .from("institution_contents")
    .insert({
      institution_id: authorization.context.institution.id,
      sport_type: input.sportType,
      content_type: input.contentType,
      title: input.title,
      description: input.description,
      author_user_id: authorization.userId,
      topic: input.topic,
      subtopic: input.subtopic,
      rule_reference: input.ruleReference,
      difficulty: input.difficulty,
      language: input.language,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      source_name: input.sourceName,
      source_url: input.sourceUrl,
      storage_path: storagePath,
      visibility: input.visibility,
      status: input.status,
      version: input.version,
      published_at: input.status === "published" ? now : null,
      expires_at: input.expiresAt,
      metadata: input.metadata,
    })
    .select(CONTENT_SELECT)
    .single();

  if (error || !data) {
    await removeInstitutionStorageObject(authorization.supabase, storagePath);
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo guardar el contenido."
    );
  }

  const assignments = await replaceContentAssignments(
    authorization,
    String(data.id),
    input
  );
  await writeInstitutionAuditLog(authorization, {
    action: "content.created",
    entityType: "institution_content",
    entityId: String(data.id),
    afterState: {
      title: input.title,
      sportType: input.sportType,
      contentType: input.contentType,
      status: input.status,
      visibility: input.visibility,
      groupCount: input.groupIds.length,
      userCount: input.userIds.length,
    },
  });

  return normalizeContentRecord(
    authorization,
    data as UnknownRow,
    assignments
  );
}

export async function updateInstitutionContent(
  contentId: string,
  explicitInstitutionId: string | null,
  input: SaveInstitutionContentInput
) {
  const authorization = await requireInstitutionPermission(
    "content.manage",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  validateContentInput(authorization, input);

  const { data: existing, error: existingError } = await authorization.supabase
    .from("institution_contents")
    .select(CONTENT_SELECT)
    .eq("id", contentId)
    .eq("institution_id", authorization.context.institution.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) throw new InstitutionAccessError(existingError.message);
  if (!existing) {
    throw new InstitutionAccessError("El contenido no existe.", 404);
  }

  const existingStoragePath = nullableText(existing.storage_path);
  const authorizedExistingStoragePath = existingStoragePath
    ? requireInstitutionContentStoragePath(
        existingStoragePath,
        authorization.context.institution.id
      )
    : null;
  const hasNewUpload = Boolean(
    input.storagePath && input.storagePath !== authorizedExistingStoragePath
  );
  const storagePath = hasNewUpload
    ? requireInstitutionContentUploadPath({
        storagePath: input.storagePath as string,
        institutionId: authorization.context.institution.id,
        canonicalUserId: authorization.userId,
      })
    : authorizedExistingStoragePath;
  if (hasNewUpload) {
    await assertStoragePathIsUnreferenced(authorization, storagePath);
  }

  const now = new Date().toISOString();
  const publishedAt =
    input.status === "published"
      ? existing.published_at ?? now
      : input.status === "draft" || input.status === "in_review"
        ? null
        : existing.published_at;
  const { data, error } = await authorization.supabase
    .from("institution_contents")
    .update({
      sport_type: input.sportType,
      content_type: input.contentType,
      title: input.title,
      description: input.description,
      topic: input.topic,
      subtopic: input.subtopic,
      rule_reference: input.ruleReference,
      difficulty: input.difficulty,
      language: input.language,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      source_name: input.sourceName,
      source_url: input.sourceUrl,
      storage_path: storagePath,
      visibility: input.visibility,
      status: input.status,
      version: input.version,
      published_at: publishedAt,
      expires_at: input.expiresAt,
      metadata: input.metadata,
      updated_at: now,
    })
    .eq("id", contentId)
    .eq("institution_id", authorization.context.institution.id)
    .select(CONTENT_SELECT)
    .single();

  if (error || !data) {
    if (hasNewUpload) {
      await removeInstitutionStorageObject(authorization.supabase, storagePath);
    }
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo actualizar el contenido."
    );
  }

  const assignments = await replaceContentAssignments(
    authorization,
    contentId,
    input
  );
  await writeInstitutionAuditLog(authorization, {
    action: "content.updated",
    entityType: "institution_content",
    entityId: contentId,
    beforeState: {
      title: existing.title,
      status: existing.status,
      version: existing.version,
    },
    afterState: {
      title: input.title,
      status: input.status,
      version: input.version,
      groupCount: input.groupIds.length,
      userCount: input.userIds.length,
    },
  });

  return normalizeContentRecord(
    authorization,
    data as UnknownRow,
    assignments
  );
}

export function validateContentInput(
  authorization: InstitutionAuthorization,
  input: SaveInstitutionContentInput
) {
  if (!isSportType(input.sportType)) {
    throw new InstitutionAccessError("Selecciona una disciplina valida.", 400);
  }
  if (
    !authorization.context.institution.enabledSports.includes(input.sportType)
  ) {
    throw new InstitutionAccessError(
      "La disciplina no esta habilitada para esta institucion.",
      400
    );
  }
  if (!isInstitutionContentType(input.contentType)) {
    throw new InstitutionAccessError("Selecciona un tipo de contenido.", 400);
  }
  if (!isInstitutionContentStatus(input.status)) {
    throw new InstitutionAccessError("Selecciona un estado valido.", 400);
  }
  if (!isInstitutionContentVisibility(input.visibility)) {
    throw new InstitutionAccessError("Selecciona una visibilidad valida.", 400);
  }
  if (input.title.length < 3) {
    throw new InstitutionAccessError("Ingresa un titulo valido.", 400);
  }
  if (input.status === "published" && !can(authorization, "content.publish")) {
    throw new InstitutionAccessError(
      "No tenes permiso para publicar contenidos.",
      403
    );
  }
  if (
    input.visibility === "assigned_groups" &&
    !input.groupIds.length &&
    !input.userIds.length
  ) {
    throw new InstitutionAccessError(
      "Asigna al menos un grupo o una persona.",
      400
    );
  }
  if (
    input.validFrom &&
    input.validUntil &&
    input.validUntil < input.validFrom
  ) {
    throw new InstitutionAccessError(
      "La vigencia final debe ser posterior a la inicial.",
      400
    );
  }
  if (
    (input.contentType === "question" || input.contentType === "trivia") &&
    !cleanText(input.metadata.correctAnswer)
  ) {
    throw new InstitutionAccessError(
      "Las preguntas y trivias necesitan una respuesta correcta.",
      400
    );
  }
  if (
    input.sourceUrl &&
    !/^https?:\/\//i.test(input.sourceUrl)
  ) {
    throw new InstitutionAccessError(
      "La URL de fuente debe comenzar con http:// o https://.",
      400
    );
  }
}

async function assertStoragePathIsUnreferenced(
  authorization: InstitutionAuthorization,
  storagePath: string | null
) {
  if (!storagePath) return;
  const { data, error } = await authorization.supabase
    .from("institution_contents")
    .select("id")
    .eq("institution_id", authorization.context.institution.id)
    .eq("storage_path", storagePath)
    .limit(1)
    .maybeSingle();

  if (error) throw new InstitutionAccessError(error.message);
  if (data) {
    throw new InstitutionAccessError(
      "El archivo ya esta asociado a otro contenido.",
      409
    );
  }
}

async function replaceContentAssignments(
  authorization: InstitutionAuthorization,
  contentId: string,
  input: SaveInstitutionContentInput
) {
  const institutionId = authorization.context.institution.id;
  const { error: deleteError } = await authorization.supabase
    .from("institution_content_assignments")
    .delete()
    .eq("institution_id", institutionId)
    .eq("content_id", contentId);

  if (deleteError) throw new InstitutionAccessError(deleteError.message);

  const rows = input.visibility === "assigned_groups" ? [
    ...input.groupIds.map((groupId) => ({
      institution_id: institutionId,
      content_id: contentId,
      group_id: groupId,
      user_id: null,
      assigned_by_user_id: authorization.userId,
      available_from: input.availableFrom,
      due_at: input.dueAt,
      required: input.required,
    })),
    ...input.userIds.map((userId) => ({
      institution_id: institutionId,
      content_id: contentId,
      group_id: null,
      user_id: userId,
      assigned_by_user_id: authorization.userId,
      available_from: input.availableFrom,
      due_at: input.dueAt,
      required: input.required,
    })),
  ] : [];

  if (!rows.length) return [];
  const { data, error } = await authorization.supabase
    .from("institution_content_assignments")
    .insert(rows)
    .select(ASSIGNMENT_SELECT);
  if (error) throw new InstitutionAccessError(error.message);
  return (data ?? []) as UnknownRow[];
}

export async function normalizeContentRecord(
  authorization: InstitutionAuthorization,
  row: UnknownRow,
  assignmentRows: UnknownRow[],
  includeAccessUrl = false
): Promise<InstitutionContentRecord> {
  const firstAssignment = assignmentRows[0];
  const rawStoragePath = nullableText(row.storage_path);
  const storagePath = rawStoragePath
    ? requireInstitutionContentStoragePath(
        rawStoragePath,
        authorization.context.institution.id
      )
    : null;
  let accessUrl: string | null = null;

  if (includeAccessUrl && storagePath) {
    const { data } = await authorization.supabase.storage
      .from(INSTITUTIONAL_CONTENT_BUCKET)
      .createSignedUrl(storagePath, 3600);
    accessUrl = data?.signedUrl ?? null;
  }

  return {
    id: String(row.id),
    institutionId: String(row.institution_id),
    sportType: isSportType(row.sport_type) ? row.sport_type : "football_11",
    contentType: isInstitutionContentType(row.content_type)
      ? row.content_type
      : "document",
    title: String(row.title ?? "Contenido"),
    description: nullableText(row.description),
    authorUserId: String(row.author_user_id ?? ""),
    topic: nullableText(row.topic),
    subtopic: nullableText(row.subtopic),
    ruleReference: nullableText(row.rule_reference),
    difficulty: nullableText(row.difficulty),
    language: String(row.language ?? "es"),
    validFrom: nullableText(row.valid_from),
    validUntil: nullableText(row.valid_until),
    sourceName: nullableText(row.source_name),
    sourceUrl: nullableText(row.source_url),
    storagePath,
    accessUrl,
    visibility: isInstitutionContentVisibility(row.visibility)
      ? row.visibility
      : "institution",
    status: isInstitutionContentStatus(row.status) ? row.status : "draft",
    version: positiveInteger(row.version, 1),
    publishedAt: nullableText(row.published_at),
    expiresAt: nullableText(row.expires_at),
    metadata: asMetadata(row.metadata),
    groupIds: assignmentRows
      .map((assignment) => nullableText(assignment.group_id))
      .filter((value): value is string => Boolean(value)),
    userIds: assignmentRows
      .map((assignment) => nullableText(assignment.user_id))
      .filter((value): value is string => Boolean(value)),
    availableFrom: nullableText(firstAssignment?.available_from),
    dueAt: nullableText(firstAssignment?.due_at),
    required: firstAssignment ? Boolean(firstAssignment.required) : false,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function loadGroupTargets(
  authorization: InstitutionAuthorization
): Promise<InstitutionAssignmentTarget[]> {
  const { data, error } = await authorization.supabase
    .from("institution_groups")
    .select("id,name,sport_type,category,status")
    .eq("institution_id", authorization.context.institution.id)
    .neq("status", "archived")
    .order("name", { ascending: true });
  if (error) throw new InstitutionAccessError(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    detail: [nullableText(row.category), nullableText(row.status)]
      .filter(Boolean)
      .join(" · ") || null,
    sportType: isSportType(row.sport_type) ? row.sport_type : null,
  }));
}

export async function loadMemberTargets(
  authorization: InstitutionAuthorization
): Promise<InstitutionAssignmentTarget[]> {
  const { data: memberships, error } = await authorization.supabase
    .from("institution_memberships")
    .select("user_id,primary_sport,category,status")
    .eq("institution_id", authorization.context.institution.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new InstitutionAccessError(error.message);

  const userIds = (memberships ?? []).map((row) => String(row.user_id));
  const profileRows = userIds.length
    ? await fetchOptionalRows(
        authorization.supabase
          .from("user_profiles")
          .select("user_id,reflab_name,first_name,last_name,email")
          .in("user_id", userIds)
      )
    : [];
  const profiles = new Map(
    profileRows.map((row) => [String(row.user_id), row])
  );

  return (memberships ?? []).map((row) => {
    const userId = String(row.user_id);
    const profile = profiles.get(userId);
    return {
      id: userId,
      name: profile ? displayName(profile, userId) : userId,
      detail:
        [
          profile ? nullableText(profile.email) : null,
          nullableText(row.category),
        ]
          .filter(Boolean)
          .join(" · ") || null,
      sportType: isSportType(row.primary_sport) ? row.primary_sport : null,
    };
  });
}

function can(
  authorization: InstitutionAuthorization,
  permission: "content.manage" | "content.publish"
) {
  if (authorization.context.demoMode) return false;
  return (
    authorization.context.isSuperAdmin ||
    Boolean(
      authorization.context.membership?.permissionKeys.includes(permission)
    )
  );
}

async function fetchRows(
  query: PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>
) {
  const { data, error } = await query;
  if (error) throw new InstitutionAccessError(error.message);
  return (Array.isArray(data) ? data : []) as UnknownRow[];
}

async function fetchOptionalRows(
  query: PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>
) {
  const { data } = await query;
  return (Array.isArray(data) ? data : []) as UnknownRow[];
}

function asMetadata(value: unknown): InstitutionContentMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as InstitutionContentMetadata)
    : {};
}

function displayName(row: UnknownRow, fallback: string) {
  const preferred = nullableText(row.reflab_name);
  if (preferred) return preferred;
  const fullName = [nullableText(row.first_name), nullableText(row.last_name)]
    .filter(Boolean)
    .join(" ");
  return fullName || nullableText(row.email) || fallback;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function positiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

type UnknownRow = Record<string, unknown>;

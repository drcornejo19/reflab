import "server-only";

import {
  assertInstitutionWriteAllowed,
  InstitutionAccessError,
  requireInstitutionPermission,
  type InstitutionAuthorization,
} from "@/lib/institutional/server";
import { requireInstitutionContentStoragePath } from "@/lib/institutional/contentStorage";
import { writeInstitutionAuditLog } from "@/lib/institutional/audit-server";
import {
  loadContentWorkspace,
  loadGroupTargets,
  loadMemberTargets,
} from "@/lib/institutional/content-server";
import {
  isInstitutionAssessmentModality,
  isInstitutionAssessmentStatus,
  isInstitutionContentType,
  type InstitutionAssessmentItemRecord,
  type InstitutionAssessmentModality,
  type InstitutionAssessmentRecord,
  type InstitutionAssessmentStatus,
  type InstitutionAssessmentWorkspace,
  type InstitutionContentRecord,
} from "@/lib/institutional/types";
import { isSportType, type SportType } from "@/lib/sports";

const ASSESSMENT_SELECT =
  "id,institution_id,sport_type,name,description,modality,status,timezone,opens_at,closes_at,duration_minutes,question_count,video_count,attempts_allowed,immediate_feedback,free_navigation,randomize_questions,randomize_videos,minimum_score,penalty_value,allow_review,settings,created_at,updated_at";
const ITEM_SELECT =
  "id,assessment_id,item_type,source_id,item_snapshot,points,sort_order,is_required";
const ASSIGNMENT_SELECT =
  "id,assessment_id,group_id,user_id,opens_at_override,closes_at_override,attempts_override,status";

export type SaveInstitutionAssessmentInput = {
  sportType: SportType;
  name: string;
  description: string | null;
  modality: InstitutionAssessmentModality;
  status: InstitutionAssessmentStatus;
  timezone: string;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  attemptsAllowed: number;
  immediateFeedback: boolean;
  freeNavigation: boolean;
  randomizeQuestions: boolean;
  randomizeVideos: boolean;
  minimumScore: number | null;
  penaltyValue: number | null;
  allowReview: boolean;
  settings: Record<string, unknown>;
  contentIds: string[];
  groupIds: string[];
  userIds: string[];
};

export async function getInstitutionAssessmentWorkspace(
  explicitInstitutionId?: string | null
): Promise<InstitutionAssessmentWorkspace> {
  const authorization = await requireInstitutionPermission(
    "assessments.manage",
    explicitInstitutionId
  );
  const { context, supabase } = authorization;
  const institutionId = context.institution.id;
  const canManage = can(authorization, "assessments.manage");
  const { data: assessmentRows, error } = await supabase
    .from("institution_assessments")
    .select(ASSESSMENT_SELECT)
    .eq("institution_id", institutionId)
    .is("deleted_at", null)
    .order("opens_at", { ascending: false, nullsFirst: false })
    .limit(250);

  if (error) throw new InstitutionAccessError(error.message);
  const assessmentIds = (assessmentRows ?? []).map((row) => String(row.id));
  const [items, assignments, contents, groups, members] = await Promise.all([
    assessmentIds.length
      ? fetchRows(
          supabase
            .from("institution_assessment_items")
            .select(ITEM_SELECT)
            .eq("institution_id", institutionId)
            .in("assessment_id", assessmentIds)
            .order("sort_order", { ascending: true })
        )
      : [],
    assessmentIds.length
      ? fetchRows(
          supabase
            .from("institution_assessment_assignments")
            .select(ASSIGNMENT_SELECT)
            .eq("institution_id", institutionId)
            .in("assessment_id", assessmentIds)
            .neq("status", "cancelled")
        )
      : [],
    canManage
      ? loadPublishedContentRecords(authorization)
      : Promise.resolve([] as InstitutionContentRecord[]),
    canManage ? loadGroupTargets(authorization) : Promise.resolve([]),
    canManage ? loadMemberTargets(authorization) : Promise.resolve([]),
  ]);

  return {
    institution: context.institution,
    capabilities: {
      canManage,
      canGrade: can(authorization, "assessments.grade"),
    },
    assessments: (assessmentRows ?? []).map((row) =>
      normalizeAssessmentRecord(
        row as UnknownRow,
        items.filter(
          (item) => String(item.assessment_id) === String(row.id)
        ),
        assignments.filter(
          (assignment) =>
            String(assignment.assessment_id) === String(row.id)
        )
      )
    ),
    contents,
    groups,
    members,
  };
}

export async function createInstitutionAssessment(
  explicitInstitutionId: string | null,
  input: SaveInstitutionAssessmentInput
) {
  const authorization = await requireInstitutionPermission(
    "assessments.manage",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  const contentRows = await validateAssessmentInput(authorization, input);
  const counts = countAssessmentContents(contentRows);
  const { data, error } = await authorization.supabase
    .from("institution_assessments")
    .insert({
      institution_id: authorization.context.institution.id,
      sport_type: input.sportType,
      name: input.name,
      description: input.description,
      modality: input.modality,
      status: input.status,
      timezone: input.timezone,
      opens_at: input.opensAt,
      closes_at: input.closesAt,
      duration_minutes: input.durationMinutes,
      question_count: counts.questions || null,
      video_count: counts.videos || null,
      attempts_allowed: input.attemptsAllowed,
      immediate_feedback: input.immediateFeedback,
      free_navigation: input.freeNavigation,
      randomize_questions: input.randomizeQuestions,
      randomize_videos: input.randomizeVideos,
      minimum_score: input.minimumScore,
      penalty_value: input.penaltyValue,
      allow_review: input.allowReview,
      settings: input.settings,
      created_by_user_id: authorization.userId,
    })
    .select(ASSESSMENT_SELECT)
    .single();

  if (error || !data) {
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo crear la evaluacion."
    );
  }

  const assessmentId = String(data.id);
  const [items, assignments] = await Promise.all([
    replaceAssessmentItems(authorization, assessmentId, contentRows),
    replaceAssessmentAssignments(authorization, assessmentId, input),
  ]);
  await writeAssessmentHistory(
    authorization,
    assessmentId,
    "assessment.created",
    input
  );
  await writeInstitutionAuditLog(authorization, {
    action: "assessment.created",
    entityType: "institution_assessment",
    entityId: assessmentId,
    afterState: {
      name: input.name,
      status: input.status,
      sportType: input.sportType,
      itemCount: items.length,
      groupCount: input.groupIds.length,
      userCount: input.userIds.length,
    },
  });

  return normalizeAssessmentRecord(
    data as UnknownRow,
    items,
    assignments
  );
}

export async function updateInstitutionAssessment(
  assessmentId: string,
  explicitInstitutionId: string | null,
  input: SaveInstitutionAssessmentInput
) {
  const authorization = await requireInstitutionPermission(
    "assessments.manage",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  const contentRows = await validateAssessmentInput(authorization, input);
  const { data: existing, error: existingError } = await authorization.supabase
    .from("institution_assessments")
    .select(ASSESSMENT_SELECT)
    .eq("id", assessmentId)
    .eq("institution_id", authorization.context.institution.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) throw new InstitutionAccessError(existingError.message);
  if (!existing) {
    throw new InstitutionAccessError("La evaluacion no existe.", 404);
  }

  const [{ data: existingItems, error: itemReadError }, { count: sessionCount, error: sessionCountError }] =
    await Promise.all([
      authorization.supabase
        .from("institution_assessment_items")
        .select(ITEM_SELECT)
        .eq("institution_id", authorization.context.institution.id)
        .eq("assessment_id", assessmentId)
        .order("sort_order", { ascending: true }),
      authorization.supabase
        .from("institution_assessment_sessions")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", authorization.context.institution.id)
        .eq("assessment_id", assessmentId),
    ]);
  if (itemReadError) throw new InstitutionAccessError(itemReadError.message);
  if (sessionCountError) {
    throw new InstitutionAccessError(sessionCountError.message);
  }
  const existingContentIds = (existingItems ?? [])
    .map((item) => String(item.source_id ?? ""))
    .filter(Boolean)
    .sort();
  const nextContentIds = [...new Set(input.contentIds)].sort();
  if (
    (sessionCount ?? 0) > 0 &&
    JSON.stringify(existingContentIds) !== JSON.stringify(nextContentIds)
  ) {
    throw new InstitutionAccessError(
      "No se pueden cambiar las actividades porque la evaluacion ya tiene intentos registrados.",
      409
    );
  }

  const counts = countAssessmentContents(contentRows);
  const { data, error } = await authorization.supabase
    .from("institution_assessments")
    .update({
      sport_type: input.sportType,
      name: input.name,
      description: input.description,
      modality: input.modality,
      status: input.status,
      timezone: input.timezone,
      opens_at: input.opensAt,
      closes_at: input.closesAt,
      duration_minutes: input.durationMinutes,
      question_count: counts.questions || null,
      video_count: counts.videos || null,
      attempts_allowed: input.attemptsAllowed,
      immediate_feedback: input.immediateFeedback,
      free_navigation: input.freeNavigation,
      randomize_questions: input.randomizeQuestions,
      randomize_videos: input.randomizeVideos,
      minimum_score: input.minimumScore,
      penalty_value: input.penaltyValue,
      allow_review: input.allowReview,
      settings: input.settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assessmentId)
    .eq("institution_id", authorization.context.institution.id)
    .select(ASSESSMENT_SELECT)
    .single();

  if (error || !data) {
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo actualizar la evaluacion."
    );
  }

  const [items, assignments] = await Promise.all([
    (sessionCount ?? 0) > 0
      ? Promise.resolve((existingItems ?? []) as UnknownRow[])
      : replaceAssessmentItems(authorization, assessmentId, contentRows),
    replaceAssessmentAssignments(authorization, assessmentId, input),
  ]);
  await writeAssessmentHistory(
    authorization,
    assessmentId,
    "assessment.updated",
    input
  );
  await writeInstitutionAuditLog(authorization, {
    action: "assessment.updated",
    entityType: "institution_assessment",
    entityId: assessmentId,
    beforeState: {
      name: existing.name,
      status: existing.status,
    },
    afterState: {
      name: input.name,
      status: input.status,
      itemCount: items.length,
      groupCount: input.groupIds.length,
      userCount: input.userIds.length,
    },
  });

  return normalizeAssessmentRecord(
    data as UnknownRow,
    items,
    assignments
  );
}

export async function validateAssessmentInput(
  authorization: InstitutionAuthorization,
  input: SaveInstitutionAssessmentInput
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
  if (!isInstitutionAssessmentModality(input.modality)) {
    throw new InstitutionAccessError("Selecciona una modalidad valida.", 400);
  }
  if (!isInstitutionAssessmentStatus(input.status)) {
    throw new InstitutionAccessError("Selecciona un estado valido.", 400);
  }
  if (input.name.length < 3) {
    throw new InstitutionAccessError("Ingresa un nombre valido.", 400);
  }
  if (input.sportType === "futsal" && input.modality === "var") {
    throw new InstitutionAccessError(
      "VAR no esta habilitado para evaluaciones de futsal.",
      400
    );
  }
  if (input.sportType === "football_11" && input.modality === "futsal") {
    throw new InstitutionAccessError(
      "La modalidad Futsal requiere disciplina Futsal.",
      400
    );
  }
  if (
    ["scheduled", "open"].includes(input.status) &&
    (!input.opensAt || !input.closesAt)
  ) {
    throw new InstitutionAccessError(
      "Las evaluaciones programadas necesitan apertura y cierre.",
      400
    );
  }
  if (
    input.opensAt &&
    input.closesAt &&
    new Date(input.closesAt) <= new Date(input.opensAt)
  ) {
    throw new InstitutionAccessError(
      "El cierre debe ser posterior a la apertura.",
      400
    );
  }
  if (!input.contentIds.length) {
    throw new InstitutionAccessError(
      "Selecciona al menos un contenido para la evaluacion.",
      400
    );
  }
  if (!input.groupIds.length && !input.userIds.length) {
    throw new InstitutionAccessError(
      "Asigna la evaluacion a un grupo o una persona.",
      400
    );
  }
  if (input.attemptsAllowed < 1) {
    throw new InstitutionAccessError(
      "La cantidad de intentos debe ser mayor a cero.",
      400
    );
  }

  const { data, error } = await authorization.supabase
    .from("institution_contents")
    .select(CONTENT_SNAPSHOT_SELECT)
    .eq("institution_id", authorization.context.institution.id)
    .eq("sport_type", input.sportType)
    .eq("status", "published")
    .is("deleted_at", null)
    .in("id", input.contentIds);
  if (error) throw new InstitutionAccessError(error.message);
  if ((data ?? []).length !== new Set(input.contentIds).size) {
    throw new InstitutionAccessError(
      "Uno o mas contenidos no estan publicados o no corresponden a la disciplina.",
      400
    );
  }
  return (data ?? []) as UnknownRow[];
}

export function normalizeAssessmentRecord(
  row: UnknownRow,
  itemRows: UnknownRow[],
  assignmentRows: UnknownRow[]
): InstitutionAssessmentRecord {
  return {
    id: String(row.id),
    institutionId: String(row.institution_id),
    sportType: isSportType(row.sport_type) ? row.sport_type : "football_11",
    name: String(row.name ?? "Evaluacion"),
    description: nullableText(row.description),
    modality: isInstitutionAssessmentModality(row.modality)
      ? row.modality
      : "custom",
    status: isInstitutionAssessmentStatus(row.status) ? row.status : "draft",
    timezone: String(row.timezone ?? "America/Argentina/Buenos_Aires"),
    opensAt: nullableText(row.opens_at),
    closesAt: nullableText(row.closes_at),
    durationMinutes: nullableNumber(row.duration_minutes),
    questionCount: nullableNumber(row.question_count),
    videoCount: nullableNumber(row.video_count),
    attemptsAllowed: positiveInteger(row.attempts_allowed, 1),
    immediateFeedback: Boolean(row.immediate_feedback),
    freeNavigation: Boolean(row.free_navigation),
    randomizeQuestions: Boolean(row.randomize_questions),
    randomizeVideos: Boolean(row.randomize_videos),
    minimumScore: nullableNumber(row.minimum_score),
    penaltyValue: nullableNumber(row.penalty_value),
    allowReview: Boolean(row.allow_review),
    settings: asRecord(row.settings),
    items: itemRows.map(normalizeAssessmentItem),
    groupIds: assignmentRows
      .map((assignment) => nullableText(assignment.group_id))
      .filter((value): value is string => Boolean(value)),
    userIds: assignmentRows
      .map((assignment) => nullableText(assignment.user_id))
      .filter((value): value is string => Boolean(value)),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function normalizeAssessmentItem(row: UnknownRow): InstitutionAssessmentItemRecord {
  const snapshot = asRecord(row.item_snapshot);
  return {
    id: String(row.id),
    itemType: isAssessmentItemType(row.item_type)
      ? row.item_type
      : "manual",
    sourceId: nullableText(row.source_id),
    title: String(snapshot.title ?? "Actividad"),
    contentType: isInstitutionContentType(snapshot.contentType)
      ? snapshot.contentType
      : null,
    points: nonNegativeNumber(row.points, 1),
    sortOrder: nonNegativeInteger(row.sort_order, 0),
    isRequired: Boolean(row.is_required),
  };
}

async function loadPublishedContentRecords(
  authorization: InstitutionAuthorization
) {
  const workspace = await loadContentWorkspace(authorization);
  return workspace.contents.filter((content) => content.status === "published");
}

async function replaceAssessmentItems(
  authorization: InstitutionAuthorization,
  assessmentId: string,
  contentRows: UnknownRow[]
) {
  const { error: deleteError } = await authorization.supabase
    .from("institution_assessment_items")
    .delete()
    .eq("institution_id", authorization.context.institution.id)
    .eq("assessment_id", assessmentId);
  if (deleteError) throw new InstitutionAccessError(deleteError.message);

  const rows = contentRows.map((content, index) => ({
    institution_id: authorization.context.institution.id,
    assessment_id: assessmentId,
    item_type: "institution_content",
    source_id: String(content.id),
    item_snapshot: {
      id: String(content.id),
      title: String(content.title),
      description: nullableText(content.description),
      sportType: content.sport_type,
      contentType: content.content_type,
      topic: nullableText(content.topic),
      ruleReference: nullableText(content.rule_reference),
      sourceUrl: nullableText(content.source_url),
      storagePath: contentStoragePath(authorization, content.storage_path),
      metadata: asRecord(content.metadata),
      version: positiveInteger(content.version, 1),
    },
    points: 1,
    sort_order: index,
    is_required: true,
  }));
  const { data, error } = await authorization.supabase
    .from("institution_assessment_items")
    .insert(rows)
    .select(ITEM_SELECT);
  if (error) throw new InstitutionAccessError(error.message);
  return (data ?? []) as UnknownRow[];
}

function contentStoragePath(
  authorization: InstitutionAuthorization,
  value: unknown
) {
  const storagePath = nullableText(value);
  return storagePath
    ? requireInstitutionContentStoragePath(
        storagePath,
        authorization.context.institution.id
      )
    : null;
}

async function replaceAssessmentAssignments(
  authorization: InstitutionAuthorization,
  assessmentId: string,
  input: SaveInstitutionAssessmentInput
) {
  const institutionId = authorization.context.institution.id;
  const { data: existingRows, error: existingError } =
    await authorization.supabase
      .from("institution_assessment_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("institution_id", institutionId)
      .eq("assessment_id", assessmentId)
      .neq("status", "cancelled");
  if (existingError) {
    throw new InstitutionAccessError(existingError.message);
  }
  const targets = new Set([
    ...input.groupIds.map((groupId) => `group:${groupId}`),
    ...input.userIds.map((userId) => `user:${userId}`),
  ]);
  const existingByTarget = new Map(
    (existingRows ?? []).map((row) => [
      row.group_id
        ? `group:${String(row.group_id)}`
        : `user:${String(row.user_id)}`,
      row,
    ])
  );
  const cancelIds = (existingRows ?? [])
    .filter((row) => {
      const key = row.group_id
        ? `group:${String(row.group_id)}`
        : `user:${String(row.user_id)}`;
      return !targets.has(key);
    })
    .map((row) => String(row.id));

  if (cancelIds.length) {
    const { error: cancelError } = await authorization.supabase
      .from("institution_assessment_assignments")
      .update({ status: "cancelled" })
      .eq("institution_id", institutionId)
      .eq("assessment_id", assessmentId)
      .in("id", cancelIds);
    if (cancelError) throw new InstitutionAccessError(cancelError.message);
  }

  const newGroupIds = input.groupIds.filter(
    (groupId) => !existingByTarget.has(`group:${groupId}`)
  );
  const newUserIds = input.userIds.filter(
    (userId) => !existingByTarget.has(`user:${userId}`)
  );
  const rows = [
    ...newGroupIds.map((groupId) => ({
      institution_id: institutionId,
      assessment_id: assessmentId,
      group_id: groupId,
      user_id: null,
      assigned_by_user_id: authorization.userId,
      status: "assigned",
    })),
    ...newUserIds.map((userId) => ({
      institution_id: institutionId,
      assessment_id: assessmentId,
      group_id: null,
      user_id: userId,
      assigned_by_user_id: authorization.userId,
      status: "assigned",
    })),
  ];
  let insertedRows: UnknownRow[] = [];
  if (rows.length) {
    const { data, error } = await authorization.supabase
      .from("institution_assessment_assignments")
      .insert(rows)
      .select(ASSIGNMENT_SELECT);
    if (error) throw new InstitutionAccessError(error.message);
    insertedRows = (data ?? []) as UnknownRow[];
  }
  const keptRows = (existingRows ?? []).filter((row) => {
    const key = row.group_id
      ? `group:${String(row.group_id)}`
      : `user:${String(row.user_id)}`;
    return targets.has(key);
  }) as UnknownRow[];
  return [...keptRows, ...insertedRows];
}

async function writeAssessmentHistory(
  authorization: InstitutionAuthorization,
  assessmentId: string,
  action: string,
  input: SaveInstitutionAssessmentInput
) {
  const { error } = await authorization.supabase
    .from("institution_assessment_history")
    .insert({
      institution_id: authorization.context.institution.id,
      assessment_id: assessmentId,
      actor_user_id: authorization.userId,
      action,
      snapshot: {
        name: input.name,
        status: input.status,
        sportType: input.sportType,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        attemptsAllowed: input.attemptsAllowed,
        contentIds: input.contentIds,
        groupIds: input.groupIds,
        userIds: input.userIds,
      },
    });
  if (error) throw new InstitutionAccessError(error.message);
}

function countAssessmentContents(rows: UnknownRow[]) {
  return rows.reduce<{ questions: number; videos: number }>(
    (counts, row) => {
      if (row.content_type === "video") counts.videos += 1;
      if (row.content_type === "question" || row.content_type === "trivia") {
        counts.questions += 1;
      }
      return counts;
    },
    { questions: 0, videos: 0 }
  );
}

function can(
  authorization: InstitutionAuthorization,
  permission: "assessments.manage" | "assessments.grade"
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

function isAssessmentItemType(
  value: unknown
): value is InstitutionAssessmentItemRecord["itemType"] {
  return [
    "global_clip",
    "institutional_clip",
    "rule_question",
    "institution_content",
    "manual",
  ].includes(String(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

const CONTENT_SNAPSHOT_SELECT =
  "id,sport_type,content_type,title,description,topic,rule_reference,source_url,storage_path,metadata,version";

type UnknownRow = Record<string, unknown>;

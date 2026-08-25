import "server-only";

import {
  assertInstitutionWriteAllowed,
  InstitutionAccessError,
  requireInstitutionPermission,
  type InstitutionAuthorization,
} from "@/lib/institutional/server";
import {
  INSTITUTIONAL_CONTENT_BUCKET,
  requireInstitutionContentStoragePath,
} from "@/lib/institutional/contentStorage";
import {
  normalizeAssessmentRecord,
} from "@/lib/institutional/assessment-server";
import {
  normalizeContentRecord,
} from "@/lib/institutional/content-server";
import { writeInstitutionAuditLog } from "@/lib/institutional/audit-server";
import {
  isInstitutionAssessmentSessionStatus,
  isInstitutionContentType,
  type InstitutionAssessmentSessionRecord,
  type InstitutionLearningAssessment,
  type InstitutionLearningAvailability,
  type InstitutionLearningContent,
  type InstitutionLearningWorkspace,
  type InstitutionSessionItem,
} from "@/lib/institutional/types";
import { isSportType, type SportType } from "@/lib/sports";

const CONTENT_SELECT =
  "id,institution_id,sport_type,content_type,title,description,author_user_id,topic,subtopic,rule_reference,difficulty,language,valid_from,valid_until,source_name,source_url,storage_path,visibility,status,version,published_at,expires_at,metadata,created_at,updated_at";
const CONTENT_ASSIGNMENT_SELECT =
  "id,content_id,group_id,user_id,assigned_by_user_id,available_from,due_at,required";
const ASSESSMENT_SELECT =
  "id,institution_id,sport_type,name,description,modality,status,timezone,opens_at,closes_at,duration_minutes,question_count,video_count,attempts_allowed,immediate_feedback,free_navigation,randomize_questions,randomize_videos,minimum_score,penalty_value,allow_review,settings,created_at,updated_at";
const ASSESSMENT_ASSIGNMENT_SELECT =
  "id,assessment_id,group_id,user_id,opens_at_override,closes_at_override,attempts_override,status";
const ITEM_SELECT =
  "id,assessment_id,item_type,source_id,item_snapshot,points,sort_order,is_required";
const SESSION_SELECT =
  "id,institution_id,assessment_id,assignment_id,group_id,user_id,attempt_number,status,started_at,submitted_at,score,percentage,passed,time_spent_seconds,result_payload,created_at,updated_at";

export async function getInstitutionLearningWorkspace(
  sportType: SportType,
  explicitInstitutionId?: string | null
): Promise<InstitutionLearningWorkspace> {
  const authorization = await requireInstitutionPermission(
    "institution.read",
    explicitInstitutionId
  );
  if (!isSportType(sportType)) {
    throw new InstitutionAccessError("Selecciona una disciplina valida.", 400);
  }
  const membership = authorization.context.membership;
  if (!membership?.id) {
    throw new InstitutionAccessError(
      "Necesitas una membresia institucional activa para acceder a este espacio.",
      403
    );
  }

  const groupIds = await loadParticipantGroupIds(authorization, membership.id);
  const [contents, assessments] = await Promise.all([
    can(authorization, "content.read")
      ? loadLearningContents(authorization, sportType, groupIds)
      : Promise.resolve([]),
    can(authorization, "assessments.read")
      ? loadLearningAssessments(authorization, sportType, groupIds)
      : Promise.resolve([]),
  ]);

  return {
    institution: authorization.context.institution,
    membership,
    contents,
    assessments,
    summary: {
      assignedContents: contents.length,
      availableAssessments: assessments.filter(
        (assessment) => assessment.availability === "available"
      ).length,
      upcomingAssessments: assessments.filter(
        (assessment) => assessment.availability === "upcoming"
      ).length,
      completedAssessments: assessments.filter(
        (assessment) => assessment.availability === "completed"
      ).length,
    },
  };
}

export async function startInstitutionAssessmentSession(
  assignmentId: string,
  explicitInstitutionId?: string | null
) {
  const authorization = await requireInstitutionPermission(
    "assessments.take",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  const membership = authorization.context.membership;
  if (!membership?.id) {
    throw new InstitutionAccessError(
      "Necesitas una membresia institucional activa.",
      403
    );
  }
  const groupIds = await loadParticipantGroupIds(authorization, membership.id);
  const { data: assignment, error: assignmentError } =
    await authorization.supabase
      .from("institution_assessment_assignments")
      .select(ASSESSMENT_ASSIGNMENT_SELECT)
      .eq("id", assignmentId)
      .eq("institution_id", authorization.context.institution.id)
      .neq("status", "cancelled")
      .maybeSingle();

  if (assignmentError) {
    throw new InstitutionAccessError(assignmentError.message);
  }
  if (
    !assignment ||
    !isParticipantAssignment(
      assignment as UnknownRow,
      authorization.userId,
      groupIds
    )
  ) {
    throw new InstitutionAccessError(
      "La evaluacion no esta asignada a tu usuario.",
      403
    );
  }

  const { data: assessment, error: assessmentError } =
    await authorization.supabase
      .from("institution_assessments")
      .select(ASSESSMENT_SELECT)
      .eq("id", assignment.assessment_id)
      .eq("institution_id", authorization.context.institution.id)
      .is("deleted_at", null)
      .maybeSingle();
  if (assessmentError) {
    throw new InstitutionAccessError(assessmentError.message);
  }
  if (!assessment) {
    throw new InstitutionAccessError("La evaluacion no existe.", 404);
  }

  const availability = getAvailability(
    assessment as UnknownRow,
    assignment as UnknownRow,
    [],
    new Date()
  );
  if (availability !== "available") {
    throw new InstitutionAccessError(
      availabilityMessage(availability),
      409
    );
  }

  const { data: sessions, error: sessionsError } = await authorization.supabase
    .from("institution_assessment_sessions")
    .select(SESSION_SELECT)
    .eq("assignment_id", assignmentId)
    .eq("user_id", authorization.userId)
    .order("attempt_number", { ascending: false });
  if (sessionsError) throw new InstitutionAccessError(sessionsError.message);

  const activeSession = (sessions ?? []).find(
    (session) => session.status === "in_progress"
  );
  if (activeSession) {
    return getInstitutionAssessmentSession(
      String(activeSession.id),
      explicitInstitutionId
    );
  }

  const currentAvailability = getAvailability(
    assessment as UnknownRow,
    assignment as UnknownRow,
    (sessions ?? []) as UnknownRow[],
    new Date()
  );
  if (currentAvailability !== "available") {
    throw new InstitutionAccessError(
      availabilityMessage(currentAvailability),
      409
    );
  }

  const attemptsAllowed = positiveInteger(
    assignment.attempts_override ?? assessment.attempts_allowed,
    1
  );
  if ((sessions ?? []).length >= attemptsAllowed) {
    throw new InstitutionAccessError(
      "Ya utilizaste todos los intentos disponibles.",
      409
    );
  }

  const { data: itemRows, error: itemError } = await authorization.supabase
    .from("institution_assessment_items")
    .select(ITEM_SELECT)
    .eq("assessment_id", assessment.id)
    .eq("institution_id", authorization.context.institution.id)
    .order("sort_order", { ascending: true });
  if (itemError) throw new InstitutionAccessError(itemError.message);
  if (!itemRows?.length) {
    throw new InstitutionAccessError(
      "La evaluacion todavia no tiene actividades publicadas.",
      409
    );
  }

  const itemOrder = buildItemOrder(
    itemRows as UnknownRow[],
    Boolean(assessment.randomize_questions),
    Boolean(assessment.randomize_videos)
  );
  const now = new Date().toISOString();
  const { data: session, error } = await authorization.supabase
    .from("institution_assessment_sessions")
    .insert({
      institution_id: authorization.context.institution.id,
      assessment_id: assessment.id,
      assignment_id: assignment.id,
      group_id: assignment.group_id,
      user_id: authorization.userId,
      attempt_number: (sessions ?? []).length + 1,
      status: "in_progress",
      started_at: now,
      result_payload: { itemOrder },
    })
    .select(SESSION_SELECT)
    .single();
  if (error || !session) {
    throw new InstitutionAccessError(
      translateAssessmentDatabaseError(error?.message)
    );
  }

  await writeInstitutionAuditLog(authorization, {
    action: "assessment.session_started",
    entityType: "institution_assessment_session",
    entityId: String(session.id),
    metadata: {
      assessmentId: String(assessment.id),
      assignmentId,
      attemptNumber: session.attempt_number,
    },
  });

  return getInstitutionAssessmentSession(
    String(session.id),
    explicitInstitutionId
  );
}

export async function getInstitutionAssessmentSession(
  sessionId: string,
  explicitInstitutionId?: string | null
): Promise<InstitutionAssessmentSessionRecord> {
  const authorization = await requireInstitutionPermission(
    "assessments.take",
    explicitInstitutionId
  );
  const { session, assessment, items } = await loadSessionBundle(
    authorization,
    sessionId
  );
  return normalizeSessionRecord(authorization, session, assessment, items);
}

export async function submitInstitutionAssessmentSession(
  sessionId: string,
  answers: Record<string, string>,
  explicitInstitutionId?: string | null
) {
  const authorization = await requireInstitutionPermission(
    "assessments.take",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  const { session, assessment, items } = await loadSessionBundle(
    authorization,
    sessionId
  );
  if (session.status !== "in_progress") {
    throw new InstitutionAccessError(
      "Este intento ya fue cerrado y no admite nuevas respuestas.",
      409
    );
  }

  const startedAt = new Date(String(session.started_at));
  const now = new Date();
  const durationMinutes = nullableNumber(assessment.duration_minutes);
  if (
    durationMinutes &&
    now.getTime() > startedAt.getTime() + durationMinutes * 60_000
  ) {
    await authorization.supabase
      .from("institution_assessment_sessions")
      .update({
        status: "expired",
        submitted_at: now.toISOString(),
        time_spent_seconds: Math.max(
          0,
          Math.round((now.getTime() - startedAt.getTime()) / 1000)
        ),
      })
      .eq("id", sessionId)
      .eq("user_id", authorization.userId);
    throw new InstitutionAccessError(
      "El tiempo de la evaluacion finalizo.",
      409
    );
  }

  const normalizedAnswers = normalizeAnswers(answers, items);
  const missingRequired = items.some(
    (item) =>
      Boolean(item.is_required) &&
      !normalizedAnswers[String(item.id)]?.trim()
  );
  if (missingRequired) {
    throw new InstitutionAccessError(
      "Completa todas las actividades obligatorias antes de finalizar.",
      400
    );
  }

  const result = calculateResult(
    items,
    normalizedAnswers,
    nullableNumber(assessment.penalty_value)
  );
  const minimumScore = nullableNumber(assessment.minimum_score);
  const passed =
    result.percentage == null || minimumScore == null
      ? null
      : result.percentage >= minimumScore;
  const timeSpentSeconds = Math.max(
    0,
    Math.round((now.getTime() - startedAt.getTime()) / 1000)
  );
  const previousPayload = asRecord(session.result_payload);
  const { data: updated, error } = await authorization.supabase
    .from("institution_assessment_sessions")
    .update({
      status: "submitted",
      submitted_at: now.toISOString(),
      score: result.score,
      percentage: result.percentage,
      passed,
      time_spent_seconds: timeSpentSeconds,
      result_payload: {
        ...previousPayload,
        answers: normalizedAnswers,
        itemResults: result.itemResults,
      },
      updated_at: now.toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", authorization.userId)
    .eq("status", "in_progress")
    .select(SESSION_SELECT)
    .single();
  if (error || !updated) {
    throw new InstitutionAccessError(
      translateAssessmentDatabaseError(error?.message)
    );
  }

  await writeInstitutionAuditLog(authorization, {
    action: "assessment.session_submitted",
    entityType: "institution_assessment_session",
    entityId: sessionId,
    metadata: {
      assessmentId: String(assessment.id),
      attemptNumber: session.attempt_number,
      percentage: result.percentage,
      passed,
    },
  });
  return normalizeSessionRecord(
    authorization,
    updated as UnknownRow,
    assessment,
    items
  );
}

async function loadLearningContents(
  authorization: InstitutionAuthorization,
  sportType: SportType,
  groupIds: string[]
): Promise<InstitutionLearningContent[]> {
  const now = new Date();
  const institutionId = authorization.context.institution.id;
  const { data: rows, error } = await authorization.supabase
    .from("institution_contents")
    .select(CONTENT_SELECT)
    .eq("institution_id", institutionId)
    .eq("sport_type", sportType)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(250);
  if (error) throw new InstitutionAccessError(error.message);

  const ids = (rows ?? []).map((row) => String(row.id));
  const assignments = ids.length
    ? await fetchRows(
        authorization.supabase
          .from("institution_content_assignments")
          .select(CONTENT_ASSIGNMENT_SELECT)
          .eq("institution_id", institutionId)
          .in("content_id", ids)
      )
    : [];

  const visible: InstitutionLearningContent[] = [];
  for (const row of (rows ?? []) as UnknownRow[]) {
    if (!isContentCurrentlyValid(row, now)) continue;
    const contentAssignments = assignments.filter(
      (assignment) => String(assignment.content_id) === String(row.id)
    );
    const matchingAssignment = pickParticipantAssignment(
      contentAssignments,
      authorization.userId,
      groupIds
    );
    const visibility = String(row.visibility);
    if (visibility === "private") continue;
    if (visibility === "assigned_groups" && !matchingAssignment) continue;
    if (
      matchingAssignment?.available_from &&
      now < new Date(String(matchingAssignment.available_from))
    ) {
      continue;
    }

    const content = await normalizeContentRecord(
      authorization,
      row,
      matchingAssignment ? [matchingAssignment] : [],
      true
    );
    visible.push({
      ...content,
      assignmentId: matchingAssignment
        ? String(matchingAssignment.id)
        : null,
      assignedBy: matchingAssignment?.user_id
        ? "user"
        : matchingAssignment?.group_id
          ? "group"
          : "institution",
    });
  }
  return visible;
}

async function loadLearningAssessments(
  authorization: InstitutionAuthorization,
  sportType: SportType,
  groupIds: string[]
): Promise<InstitutionLearningAssessment[]> {
  const institutionId = authorization.context.institution.id;
  const { data: allAssignments, error } = await authorization.supabase
    .from("institution_assessment_assignments")
    .select(ASSESSMENT_ASSIGNMENT_SELECT)
    .eq("institution_id", institutionId)
    .neq("status", "cancelled")
    .limit(500);
  if (error) throw new InstitutionAccessError(error.message);

  const assignments = ((allAssignments ?? []) as UnknownRow[]).filter(
    (assignment) =>
      isParticipantAssignment(
        assignment,
        authorization.userId,
        groupIds
      )
  );
  const assessmentIds = [
    ...new Set(assignments.map((assignment) => String(assignment.assessment_id))),
  ];
  if (!assessmentIds.length) return [];

  const { data: assessmentRows, error: assessmentError } =
    await authorization.supabase
      .from("institution_assessments")
      .select(ASSESSMENT_SELECT)
      .eq("institution_id", institutionId)
      .eq("sport_type", sportType)
      .is("deleted_at", null)
      .in("id", assessmentIds)
      .in("status", ["scheduled", "open", "closed"])
      .order("opens_at", { ascending: true, nullsFirst: false });
  if (assessmentError) {
    throw new InstitutionAccessError(assessmentError.message);
  }

  const visibleAssessmentIds = (assessmentRows ?? []).map((row) =>
    String(row.id)
  );
  const [items, sessions] = await Promise.all([
    visibleAssessmentIds.length
      ? fetchRows(
          authorization.supabase
            .from("institution_assessment_items")
            .select(ITEM_SELECT)
            .eq("institution_id", institutionId)
            .in("assessment_id", visibleAssessmentIds)
            .order("sort_order", { ascending: true })
        )
      : [],
    visibleAssessmentIds.length
      ? fetchRows(
          authorization.supabase
            .from("institution_assessment_sessions")
            .select(SESSION_SELECT)
            .eq("institution_id", institutionId)
            .eq("user_id", authorization.userId)
            .in("assessment_id", visibleAssessmentIds)
            .order("attempt_number", { ascending: false })
        )
      : [],
  ]);

  return (assessmentRows ?? []).flatMap((row) => {
    const assessmentAssignments = assignments.filter(
      (assignment) =>
        String(assignment.assessment_id) === String(row.id)
    );
    const assignment =
      assessmentAssignments.find(
        (item) => String(item.user_id) === authorization.userId
      ) ?? assessmentAssignments[0];
    if (!assignment) return [];

    const assessmentItems = items.filter(
      (item) => String(item.assessment_id) === String(row.id)
    );
    const assessmentSessions = sessions.filter(
      (session) => String(session.assignment_id) === String(assignment.id)
    );
    const base = normalizeAssessmentRecord(
      row as UnknownRow,
      assessmentItems,
      [assignment]
    );
    const latest = assessmentSessions[0];
    const attemptsAllowed = positiveInteger(
      assignment.attempts_override ?? row.attempts_allowed,
      1
    );
    return [
      {
        ...base,
        assignmentId: String(assignment.id),
        availability: getAvailability(
          row as UnknownRow,
          assignment,
          assessmentSessions,
          new Date()
        ),
        effectiveOpensAt: nullableText(
          assignment.opens_at_override ?? row.opens_at
        ),
        effectiveClosesAt: nullableText(
          assignment.closes_at_override ?? row.closes_at
        ),
        attemptsAllowed,
        attemptsUsed: assessmentSessions.length,
        latestSessionId: latest ? String(latest.id) : null,
        latestSessionStatus:
          latest && isInstitutionAssessmentSessionStatus(latest.status)
            ? latest.status
            : null,
        latestPercentage: latest
          ? nullableNumber(latest.percentage)
          : null,
        passed: latest?.passed == null ? null : Boolean(latest.passed),
      } satisfies InstitutionLearningAssessment,
    ];
  });
}

async function loadSessionBundle(
  authorization: InstitutionAuthorization,
  sessionId: string
) {
  const { data: session, error } = await authorization.supabase
    .from("institution_assessment_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("institution_id", authorization.context.institution.id)
    .eq("user_id", authorization.userId)
    .maybeSingle();
  if (error) throw new InstitutionAccessError(error.message);
  if (!session) {
    throw new InstitutionAccessError("El intento no existe.", 404);
  }

  const [{ data: assessment, error: assessmentError }, { data: items, error: itemError }] =
    await Promise.all([
      authorization.supabase
        .from("institution_assessments")
        .select(ASSESSMENT_SELECT)
        .eq("id", session.assessment_id)
        .eq("institution_id", authorization.context.institution.id)
        .is("deleted_at", null)
        .maybeSingle(),
      authorization.supabase
        .from("institution_assessment_items")
        .select(ITEM_SELECT)
        .eq("assessment_id", session.assessment_id)
        .eq("institution_id", authorization.context.institution.id)
        .order("sort_order", { ascending: true }),
    ]);
  if (assessmentError) {
    throw new InstitutionAccessError(assessmentError.message);
  }
  if (itemError) throw new InstitutionAccessError(itemError.message);
  if (!assessment) {
    throw new InstitutionAccessError("La evaluacion no existe.", 404);
  }
  return {
    session: session as UnknownRow,
    assessment: assessment as UnknownRow,
    items: (items ?? []) as UnknownRow[],
  };
}

async function normalizeSessionRecord(
  authorization: InstitutionAuthorization,
  session: UnknownRow,
  assessment: UnknownRow,
  itemRows: UnknownRow[]
): Promise<InstitutionAssessmentSessionRecord> {
  const resultPayload = asRecord(session.result_payload);
  const answers = asStringRecord(resultPayload.answers);
  const itemOrder = Array.isArray(resultPayload.itemOrder)
    ? resultPayload.itemOrder.map(String)
    : [];
  const orderIndex = new Map(itemOrder.map((id, index) => [id, index]));
  const sortedItems = [...itemRows].sort((left, right) => {
    const leftOrder =
      orderIndex.get(String(left.id)) ?? nonNegativeInteger(left.sort_order, 0);
    const rightOrder =
      orderIndex.get(String(right.id)) ?? nonNegativeInteger(right.sort_order, 0);
    return leftOrder - rightOrder;
  });
  const canReview =
    ["submitted", "graded"].includes(String(session.status)) &&
    (Boolean(assessment.allow_review) ||
      Boolean(assessment.immediate_feedback));
  const items = await Promise.all(
    sortedItems.map((item) =>
      normalizeSessionItem(authorization, item, canReview)
    )
  );
  const normalizedAssessment = normalizeAssessmentRecord(
    assessment,
    itemRows,
    []
  );

  return {
    id: String(session.id),
    institutionId: String(session.institution_id),
    assessmentId: String(session.assessment_id),
    assignmentId: String(session.assignment_id),
    userId: String(session.user_id),
    attemptNumber: positiveInteger(session.attempt_number, 1),
    status: isInstitutionAssessmentSessionStatus(session.status)
      ? session.status
      : "not_started",
    startedAt: nullableText(session.started_at),
    submittedAt: nullableText(session.submitted_at),
    score: nullableNumber(session.score),
    percentage: nullableNumber(session.percentage),
    passed: session.passed == null ? null : Boolean(session.passed),
    timeSpentSeconds: nullableNumber(session.time_spent_seconds),
    assessment: {
      name: normalizedAssessment.name,
      description: normalizedAssessment.description,
      sportType: normalizedAssessment.sportType,
      modality: normalizedAssessment.modality,
      durationMinutes: normalizedAssessment.durationMinutes,
      immediateFeedback: normalizedAssessment.immediateFeedback,
      freeNavigation: normalizedAssessment.freeNavigation,
      minimumScore: normalizedAssessment.minimumScore,
      allowReview: normalizedAssessment.allowReview,
    },
    items,
    answers,
  };
}

async function normalizeSessionItem(
  authorization: InstitutionAuthorization,
  row: UnknownRow,
  canReview: boolean
): Promise<InstitutionSessionItem> {
  const snapshot = asRecord(row.item_snapshot);
  const metadata = asRecord(snapshot.metadata);
  const rawStoragePath = nullableText(snapshot.storagePath);
  const storagePath = rawStoragePath
    ? requireInstitutionContentStoragePath(
        rawStoragePath,
        authorization.context.institution.id
      )
    : null;
  let accessUrl: string | null = null;
  if (storagePath) {
    const { data } = await authorization.supabase.storage
      .from(INSTITUTIONAL_CONTENT_BUCKET)
      .createSignedUrl(storagePath, 3600);
    accessUrl = data?.signedUrl ?? null;
  }
  const options = Array.isArray(metadata.options)
    ? metadata.options
        .map((option) => String(option).trim())
        .filter(Boolean)
    : [];
  const base: InstitutionSessionItem = {
    id: String(row.id),
    title: String(snapshot.title ?? "Actividad"),
    contentType: isInstitutionContentType(snapshot.contentType)
      ? snapshot.contentType
      : null,
    description: nullableText(snapshot.description),
    sourceUrl: nullableText(snapshot.sourceUrl),
    accessUrl,
    prompt: nullableText(metadata.prompt) ?? nullableText(snapshot.description),
    options,
    points: nonNegativeNumber(row.points, 1),
    sortOrder: nonNegativeInteger(row.sort_order, 0),
    isRequired: Boolean(row.is_required),
  };
  if (!canReview) return base;
  return {
    ...base,
    correctAnswer: nullableText(metadata.correctAnswer) ?? undefined,
    explanation: nullableText(metadata.explanation) ?? undefined,
  };
}

function calculateResult(
  items: UnknownRow[],
  answers: Record<string, string>,
  penaltyValue: number | null
) {
  let totalPoints = 0;
  let earnedPoints = 0;
  let wrongCount = 0;
  const itemResults: Record<string, { correct: boolean | null }> = {};

  for (const item of items) {
    const snapshot = asRecord(item.item_snapshot);
    const metadata = asRecord(snapshot.metadata);
    const correctAnswer = nullableText(metadata.correctAnswer);
    if (!correctAnswer) {
      itemResults[String(item.id)] = { correct: null };
      continue;
    }
    const points = nonNegativeNumber(item.points, 1);
    totalPoints += points;
    const correct =
      normalizeComparable(answers[String(item.id)]) ===
      normalizeComparable(correctAnswer);
    if (correct) earnedPoints += points;
    else wrongCount += 1;
    itemResults[String(item.id)] = { correct };
  }

  if (totalPoints === 0) {
    return {
      score: null,
      percentage: null,
      itemResults,
    };
  }
  const penalty = Math.max(0, penaltyValue ?? 0) * wrongCount;
  const score = Math.max(0, earnedPoints - penalty);
  return {
    score: round(score),
    percentage: round(Math.min(100, (score / totalPoints) * 100)),
    itemResults,
  };
}

async function loadParticipantGroupIds(
  authorization: InstitutionAuthorization,
  membershipId: string
) {
  const { data, error } = await authorization.supabase
    .from("institution_group_memberships")
    .select("group_id")
    .eq("institution_id", authorization.context.institution.id)
    .eq("membership_id", membershipId)
    .eq("status", "active");
  if (error) throw new InstitutionAccessError(error.message);
  return (data ?? []).map((row) => String(row.group_id));
}

function pickParticipantAssignment(
  assignments: UnknownRow[],
  userId: string,
  groupIds: string[]
) {
  return (
    assignments.find((assignment) => String(assignment.user_id) === userId) ??
    assignments.find(
      (assignment) =>
        assignment.group_id &&
        groupIds.includes(String(assignment.group_id))
    ) ??
    null
  );
}

function isParticipantAssignment(
  assignment: UnknownRow,
  userId: string,
  groupIds: string[]
) {
  return Boolean(
    String(assignment.user_id ?? "") === userId ||
      (assignment.group_id &&
        groupIds.includes(String(assignment.group_id)))
  );
}

function getAvailability(
  assessment: UnknownRow,
  assignment: UnknownRow,
  sessions: UnknownRow[],
  now: Date
): InstitutionLearningAvailability {
  if (assignment.status === "completed") return "completed";
  const latest = sessions[0];
  if (
    latest &&
    ["submitted", "graded"].includes(String(latest.status))
  ) {
    const attemptsAllowed = positiveInteger(
      assignment.attempts_override ?? assessment.attempts_allowed,
      1
    );
    if (
      latest.passed === true ||
      latest.percentage == null ||
      sessions.length >= attemptsAllowed
    ) {
      return "completed";
    }
  }
  const attemptsAllowed = positiveInteger(
    assignment.attempts_override ?? assessment.attempts_allowed,
    1
  );
  if (sessions.length >= attemptsAllowed) return "attempts_exhausted";
  const opensAt = nullableText(
    assignment.opens_at_override ?? assessment.opens_at
  );
  const closesAt = nullableText(
    assignment.closes_at_override ?? assessment.closes_at
  );
  if (opensAt && now < new Date(opensAt)) return "upcoming";
  if (
    assessment.status === "closed" ||
    (closesAt && now > new Date(closesAt))
  ) {
    return "closed";
  }
  if (!["scheduled", "open"].includes(String(assessment.status))) {
    return "closed";
  }
  return "available";
}

function availabilityMessage(availability: InstitutionLearningAvailability) {
  const messages: Record<InstitutionLearningAvailability, string> = {
    available: "La evaluacion esta disponible.",
    upcoming: "La evaluacion todavia no esta abierta.",
    closed: "La evaluacion ya cerro.",
    completed: "La evaluacion ya fue completada.",
    attempts_exhausted: "Ya utilizaste todos los intentos disponibles.",
  };
  return messages[availability];
}

function isContentCurrentlyValid(row: UnknownRow, now: Date) {
  const validFrom = nullableText(row.valid_from);
  const validUntil = nullableText(row.valid_until);
  const expiresAt = nullableText(row.expires_at);
  if (validFrom && now < new Date(`${validFrom}T00:00:00`)) return false;
  if (validUntil && now > new Date(`${validUntil}T23:59:59`)) return false;
  if (expiresAt && now > new Date(expiresAt)) return false;
  return true;
}

function buildItemOrder(
  rows: UnknownRow[],
  randomizeQuestions: boolean,
  randomizeVideos: boolean
) {
  const questionTypes = new Set(["question", "trivia"]);
  const questionRows = rows.filter((row) => {
    const snapshot = asRecord(row.item_snapshot);
    return questionTypes.has(String(snapshot.contentType));
  });
  const videoRows = rows.filter((row) => {
    const snapshot = asRecord(row.item_snapshot);
    return snapshot.contentType === "video";
  });
  const otherRows = rows.filter(
    (row) => !questionRows.includes(row) && !videoRows.includes(row)
  );
  const orderedQuestions = randomizeQuestions
    ? shuffled(questionRows)
    : questionRows;
  const orderedVideos = randomizeVideos ? shuffled(videoRows) : videoRows;
  return [...orderedQuestions, ...orderedVideos, ...otherRows].map((row) =>
    String(row.id)
  );
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swapIndex = values[0] % (index + 1);
    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }
  return result;
}

function normalizeAnswers(
  answers: Record<string, string>,
  items: UnknownRow[]
) {
  const allowedIds = new Set(items.map((item) => String(item.id)));
  return Object.fromEntries(
    Object.entries(answers)
      .filter(([itemId]) => allowedIds.has(itemId))
      .map(([itemId, value]) => [itemId, String(value).trim().slice(0, 5000)])
  );
}

function translateAssessmentDatabaseError(message?: string) {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("not open yet")) {
    return "La evaluacion todavia no esta abierta.";
  }
  if (normalized.includes("is closed")) {
    return "La evaluacion ya cerro.";
  }
  if (normalized.includes("attempt limit")) {
    return "Ya utilizaste todos los intentos disponibles.";
  }
  if (normalized.includes("not assigned")) {
    return "La evaluacion no esta asignada a tu usuario.";
  }
  return message || "No se pudo iniciar la evaluacion.";
}

function can(
  authorization: InstitutionAuthorization,
  permission: "content.read" | "assessments.read"
) {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      String(item ?? ""),
    ])
  );
}

function normalizeComparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}

type UnknownRow = Record<string, unknown>;

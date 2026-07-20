import "server-only";

import {
  InstitutionAccessError,
  requireInstitutionAnyPermission,
  type InstitutionAuthorization,
} from "@/lib/institutional/server";
import { getEffectiveInstitutionPermissions } from "@/lib/institutional/permissions";
import type {
  InstitutionGroupMetric,
  InstitutionMetricDimension,
  InstitutionMetricsWorkspace,
} from "@/lib/institutional/types";
import type { SportType } from "@/lib/sports";

type MetricsFilters = {
  sportType: SportType;
  institutionId?: string | null;
  groupId?: string | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
};

type UnknownRow = Record<string, unknown>;

const completedStatuses = ["submitted", "graded"];

export async function getInstitutionMetricsWorkspace(
  filters: MetricsFilters
): Promise<InstitutionMetricsWorkspace> {
  const authorization = await requireInstitutionAnyPermission(
    [
      "metrics.read_own",
      "metrics.read_individual",
      "metrics.read_aggregate",
    ],
    filters.institutionId
  );
  const period = normalizePeriod(filters.from, filters.to);
  const permissions = getEffectiveInstitutionPermissions(
    authorization.context
  );
  const canReadAggregate =
    permissions.includes("metrics.read_aggregate");
  const canReadIndividual =
    canReadAggregate || permissions.includes("metrics.read_individual");
  const canExport =
    permissions.includes("reports.export");
  const scope = await resolveMetricScope(
    authorization,
    filters.groupId ?? null,
    filters.userId ?? null,
    canReadAggregate,
    canReadIndividual
  );
  const institutionId = authorization.context.institution.id;

  const [assessmentRows, groupRows, membershipRows] = await Promise.all([
    fetchRows(
      authorization.supabase
        .from("institution_assessments")
        .select("id,name,modality,minimum_score")
        .eq("institution_id", institutionId)
        .eq("sport_type", filters.sportType)
        .is("deleted_at", null)
    ),
    fetchRows(
      authorization.supabase
        .from("institution_groups")
        .select("id,name,sport_type,status")
        .eq("institution_id", institutionId)
        .eq("sport_type", filters.sportType)
        .neq("status", "archived")
        .order("name", { ascending: true })
    ),
    fetchRows(
      authorization.supabase
        .from("institution_memberships")
        .select("id,user_id,status,primary_sport")
        .eq("institution_id", institutionId)
        .eq("status", "active")
    ),
  ]);

  const assessmentIds = assessmentRows.map((row) => String(row.id));
  const visibleGroupRows =
    scope.kind === "own"
      ? []
      : groupRows.filter(
          (row) =>
            scope.groupIds === null || scope.groupIds.includes(String(row.id))
        );
  const allGroupIds = groupRows.map((row) => String(row.id));

  const [itemRows, assignmentRows, groupMembershipRows, loadedSessionRows] =
    await Promise.all([
      assessmentIds.length
        ? fetchRows(
            authorization.supabase
              .from("institution_assessment_items")
              .select("id,assessment_id,item_snapshot")
              .eq("institution_id", institutionId)
              .in("assessment_id", assessmentIds)
          )
        : [],
      assessmentIds.length
        ? fetchRows(
            authorization.supabase
              .from("institution_assessment_assignments")
              .select("id,assessment_id,group_id,user_id,status")
              .eq("institution_id", institutionId)
              .in("assessment_id", assessmentIds)
              .neq("status", "cancelled")
          )
        : [],
      allGroupIds.length
        ? fetchRows(
            authorization.supabase
              .from("institution_group_memberships")
              .select("group_id,membership_id,group_role,status")
              .eq("institution_id", institutionId)
              .eq("status", "active")
              .in("group_id", allGroupIds)
          )
        : [],
      loadSessions(
        authorization,
        assessmentIds,
        period.from,
        period.to,
        scope
      ),
    ]);

  const itemById = new Map(itemRows.map((row) => [String(row.id), row]));
  const membershipById = new Map(
    membershipRows.map((row) => [String(row.id), row])
  );
  const scopedGroupUserIds = new Set(
    groupMembershipRows
      .filter(
        (row) =>
          scope.groupIds !== null &&
          scope.groupIds.includes(String(row.group_id))
      )
      .map((row) => membershipById.get(String(row.membership_id)))
      .filter(Boolean)
      .map((row) => String(row?.user_id))
  );
  const sessionRows =
    scope.groupIds !== null && !scope.userId
      ? loadedSessionRows.filter(
          (row) =>
            scope.groupIds?.includes(String(row.group_id ?? "")) ||
            scopedGroupUserIds.has(String(row.user_id))
        )
      : loadedSessionRows;
  const decisions = collectDecisionMetrics(sessionRows, itemById);
  const topics = aggregateDimensions(decisions, "topic");
  const criteria = aggregateDimensions(decisions, "criterion");
  const percentages = sessionRows
    .map((row) => numberOrNull(row.percentage))
    .filter((value): value is number => value !== null);
  const expectedPairs = buildExpectedPairs(
    assignmentRows,
    groupMembershipRows,
    membershipById,
    scope
  );
  const completedPairs = new Set(
    sessionRows.map(
      (row) => `${String(row.assessment_id)}:${String(row.user_id)}`
    )
  );
  const completedExpectedPairs = new Set(
    [...completedPairs].filter((pair) => expectedPairs.has(pair))
  );
  const passedRows = sessionRows.filter((row) => typeof row.passed === "boolean");
  const averageTime = average(
    sessionRows
      .map((row) => numberOrNull(row.time_spent_seconds))
      .filter((value): value is number => value !== null)
  );
  const warnings: string[] = [];

  if (!sessionRows.length) {
    warnings.push(
      "Sin datos suficientes: no hay evaluaciones completadas para esta disciplina y periodo."
    );
  }
  if (!decisions.length && sessionRows.length) {
    warnings.push(
      "Las sesiones disponibles no contienen respuestas corregibles por topico."
    );
  }
  if (!criteria.length && sessionRows.length) {
    warnings.push(
      "No hay criterios etiquetados en los contenidos; no se calculan promedios tecnicos, disciplinarios ni de reanudacion."
    );
  }

  const strengths = topics
    .filter((item) => item.decisions >= 3 && (item.average ?? 0) >= 75)
    .sort((left, right) => (right.average ?? 0) - (left.average ?? 0))
    .slice(0, 4);
  const criticalTopics = topics
    .filter((item) => item.decisions >= 3 && (item.average ?? 100) < 65)
    .sort((left, right) => (left.average ?? 100) - (right.average ?? 100))
    .slice(0, 4);
  const recommendations = buildRecommendations(
    criticalTopics,
    sessionRows.length,
    expectedPairs.size,
    completedExpectedPairs.size
  );

  return {
    institution: authorization.context.institution,
    sportType: filters.sportType,
    generatedAt: new Date().toISOString(),
    period: {
      from: period.from,
      to: period.to,
      label: `${formatDate(period.from)} al ${formatDate(period.to)}`,
    },
    scope: scope.kind,
    filters: {
      groupId: filters.groupId ?? null,
      userId: scope.userId,
    },
    capabilities: {
      canReadIndividual,
      canReadAggregate,
      canExport,
    },
    summary: {
      average: metricValue(average(percentages), sessionRows.length),
      technicalAverage: criterionMetric(criteria, ["technical", "tecnico"]),
      disciplinaryAverage: criterionMetric(criteria, [
        "disciplinary",
        "disciplinario",
      ]),
      restartAverage: criterionMetric(criteria, ["restart", "reanudacion"]),
      sessions: sessionRows.length,
      decisions: decisions.length,
      activeUsers: new Set(sessionRows.map((row) => String(row.user_id))).size,
      assignedUsers: new Set(
        [...expectedPairs].map((pair) => pair.split(":").slice(1).join(":"))
      ).size,
      completionRate: ratio(completedExpectedPairs.size, expectedPairs.size),
      passRate: ratio(
        passedRows.filter((row) => row.passed === true).length,
        passedRows.length
      ),
      averageResponseSeconds:
        averageTime == null ? null : round(averageTime),
      consistency:
        percentages.length < 2
          ? null
          : round(Math.max(0, 100 - standardDeviation(percentages))),
    },
    topics,
    criteria,
    evolution: buildEvolution(sessionRows),
    groups: buildGroupMetrics(
      visibleGroupRows,
      groupMembershipRows,
      membershipById,
      assignmentRows,
      sessionRows
    ),
    strengths,
    criticalTopics,
    recommendations,
    warnings,
    availableGroups: visibleGroupRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
    })),
  };
}

async function resolveMetricScope(
  authorization: InstitutionAuthorization,
  requestedGroupId: string | null,
  requestedUserId: string | null,
  canReadAggregate: boolean,
  canReadIndividual: boolean
) {
  if (requestedUserId && !canReadIndividual && requestedUserId !== authorization.userId) {
    throw new InstitutionAccessError(
      "No tenes permiso para consultar metricas individuales.",
      403
    );
  }

  if (canReadAggregate) {
    return {
      kind: "institution" as const,
      groupIds: requestedGroupId ? [requestedGroupId] : null,
      userId: requestedUserId,
    };
  }

  if (canReadIndividual && authorization.context.membership?.id) {
    const rows = await fetchRows(
      authorization.supabase
        .from("institution_group_memberships")
        .select("group_id,group_role")
        .eq("institution_id", authorization.context.institution.id)
        .eq("membership_id", authorization.context.membership.id)
        .eq("status", "active")
        .in("group_role", ["instructor", "coordinator"])
    );
    const groupIds = rows.map((row) => String(row.group_id));
    if (requestedGroupId && !groupIds.includes(requestedGroupId)) {
      throw new InstitutionAccessError(
        "Solo podes consultar metricas de tus grupos asignados.",
        403
      );
    }
    if (groupIds.length) {
      return {
        kind: "groups" as const,
        groupIds: requestedGroupId ? [requestedGroupId] : groupIds,
        userId: requestedUserId,
      };
    }
  }

  return {
    kind: "own" as const,
    groupIds: null,
    userId: authorization.userId,
  };
}

async function loadSessions(
  authorization: InstitutionAuthorization,
  assessmentIds: string[],
  from: string,
  to: string,
  scope: {
    kind: "institution" | "groups" | "own";
    groupIds: string[] | null;
    userId: string | null;
  }
) {
  if (!assessmentIds.length) return [];
  let query = authorization.supabase
    .from("institution_assessment_sessions")
    .select(
      "id,assessment_id,assignment_id,group_id,user_id,status,submitted_at,percentage,passed,time_spent_seconds,result_payload"
    )
    .eq("institution_id", authorization.context.institution.id)
    .in("assessment_id", assessmentIds)
    .in("status", completedStatuses)
    .gte("submitted_at", `${from}T00:00:00.000Z`)
    .lte("submitted_at", `${to}T23:59:59.999Z`)
    .order("submitted_at", { ascending: true })
    .limit(5000);

  if (scope.userId) {
    query = query.eq("user_id", scope.userId);
  }
  return fetchRows(query);
}

function collectDecisionMetrics(
  sessions: UnknownRow[],
  itemById: Map<string, UnknownRow>
) {
  const decisions: Array<{
    sessionId: string;
    topic: string | null;
    criterion: string | null;
    correct: boolean;
  }> = [];
  for (const session of sessions) {
    const payload = asRecord(session.result_payload);
    const itemResults = asRecord(payload.itemResults);
    for (const [itemId, rawResult] of Object.entries(itemResults)) {
      const result = asRecord(rawResult);
      if (typeof result.correct !== "boolean") continue;
      const item = itemById.get(itemId);
      if (!item) continue;
      const snapshot = asRecord(item.item_snapshot);
      const metadata = asRecord(snapshot.metadata);
      decisions.push({
        sessionId: String(session.id),
        topic: textOrNull(snapshot.topic),
        criterion:
          textOrNull(metadata.criterion) ??
          textOrNull(metadata.metricCriterion),
        correct: result.correct,
      });
    }
  }
  return decisions;
}

function aggregateDimensions(
  decisions: Array<{
    sessionId: string;
    topic: string | null;
    criterion: string | null;
    correct: boolean;
  }>,
  dimension: "topic" | "criterion"
) {
  const buckets = new Map<
    string,
    { correct: number; total: number; sessions: Set<string> }
  >();
  for (const decision of decisions) {
    const key = decision[dimension]?.trim();
    if (!key) continue;
    const normalized = normalizeKey(key);
    const bucket = buckets.get(normalized) ?? {
      correct: 0,
      total: 0,
      sessions: new Set<string>(),
    };
    bucket.total += 1;
    if (decision.correct) bucket.correct += 1;
    bucket.sessions.add(decision.sessionId);
    buckets.set(normalized, bucket);
  }
  return [...buckets.entries()]
    .map(
      ([key, bucket]) =>
        ({
          key,
          label: titleCase(key),
          average: ratio(bucket.correct, bucket.total),
          decisions: bucket.total,
          sessions: bucket.sessions.size,
        }) satisfies InstitutionMetricDimension
    )
    .sort((left, right) => right.decisions - left.decisions);
}

function buildExpectedPairs(
  assignments: UnknownRow[],
  groupMemberships: UnknownRow[],
  membershipById: Map<string, UnknownRow>,
  scope: {
    kind: "institution" | "groups" | "own";
    groupIds: string[] | null;
    userId: string | null;
  }
) {
  const userIdsByGroup = new Map<string, string[]>();
  for (const row of groupMemberships) {
    if (!["participant", "observer"].includes(String(row.group_role))) continue;
    const member = membershipById.get(String(row.membership_id));
    if (!member) continue;
    const groupId = String(row.group_id);
    const users = userIdsByGroup.get(groupId) ?? [];
    users.push(String(member.user_id));
    userIdsByGroup.set(groupId, users);
  }

  const pairs = new Set<string>();
  for (const assignment of assignments) {
    const assessmentId = String(assignment.assessment_id);
    const directUserId = textOrNull(assignment.user_id);
    if (directUserId) {
      if (!scope.userId || scope.userId === directUserId) {
        pairs.add(`${assessmentId}:${directUserId}`);
      }
      continue;
    }
    const groupId = textOrNull(assignment.group_id);
    if (!groupId) continue;
    if (scope.groupIds !== null && !scope.groupIds.includes(groupId)) continue;
    for (const userId of userIdsByGroup.get(groupId) ?? []) {
      if (!scope.userId || scope.userId === userId) {
        pairs.add(`${assessmentId}:${userId}`);
      }
    }
  }
  return pairs;
}

function buildGroupMetrics(
  groups: UnknownRow[],
  groupMemberships: UnknownRow[],
  membershipById: Map<string, UnknownRow>,
  assignments: UnknownRow[],
  sessions: UnknownRow[]
) {
  return groups.map((group) => {
    const groupId = String(group.id);
    const participants = new Set(
      groupMemberships
        .filter(
          (row) =>
            String(row.group_id) === groupId &&
            row.group_role === "participant"
        )
        .map((row) => membershipById.get(String(row.membership_id)))
        .filter(Boolean)
        .map((row) => String(row?.user_id))
    );
    const groupSessions = sessions.filter(
      (row) =>
        String(row.group_id ?? "") === groupId ||
        participants.has(String(row.user_id))
    );
    const values = groupSessions
      .map((row) => numberOrNull(row.percentage))
      .filter((value): value is number => value !== null);
    const passedRows = groupSessions.filter(
      (row) => typeof row.passed === "boolean"
    );
    const groupAssessmentIds = new Set(
      assignments
        .filter((row) => String(row.group_id ?? "") === groupId)
        .map((row) => String(row.assessment_id))
    );
    const expected = groupAssessmentIds.size * participants.size;
    const completed = new Set(
      groupSessions.map(
        (row) => `${String(row.assessment_id)}:${String(row.user_id)}`
      )
    ).size;
    return {
      id: groupId,
      name: String(group.name),
      participants: participants.size,
      activeUsers: new Set(groupSessions.map((row) => String(row.user_id))).size,
      sessions: groupSessions.length,
      average: average(values),
      dispersion:
        values.length < 2 ? null : round(standardDeviation(values)),
      passRate: ratio(
        passedRows.filter((row) => row.passed === true).length,
        passedRows.length
      ),
      compliance: ratio(completed, expected),
    } satisfies InstitutionGroupMetric;
  });
}

function buildEvolution(sessions: UnknownRow[]) {
  const buckets = new Map<string, number[]>();
  for (const session of sessions) {
    const submittedAt = textOrNull(session.submitted_at);
    const percentage = numberOrNull(session.percentage);
    if (!submittedAt || percentage === null) continue;
    const period = submittedAt.slice(0, 7);
    const values = buckets.get(period) ?? [];
    values.push(percentage);
    buckets.set(period, values);
  }
  return [...buckets.entries()].map(([period, values]) => ({
    period,
    label: formatMonth(period),
    average: average(values),
    sessions: values.length,
  }));
}

function criterionMetric(
  criteria: InstitutionMetricDimension[],
  keyFragments: string[]
) {
  const normalized = keyFragments.map(normalizeKey);
  const matches = criteria.filter((item) =>
    normalized.some((fragment) => item.key.includes(fragment))
  );
  const attempts = matches.reduce((total, item) => total + item.decisions, 0);
  if (!attempts) return metricValue(null, 0);
  const weighted = matches.reduce(
    (total, item) => total + (item.average ?? 0) * item.decisions,
    0
  );
  return metricValue(round(weighted / attempts), attempts);
}

function buildRecommendations(
  criticalTopics: InstitutionMetricDimension[],
  sessions: number,
  expected: number,
  completed: number
) {
  const recommendations: string[] = [];
  for (const topic of criticalTopics.slice(0, 3)) {
    recommendations.push(
      `Reforzar ${topic.label}: ${topic.average}% en ${topic.decisions} respuestas corregidas.`
    );
  }
  if (expected > 0 && completed / expected < 0.6) {
    recommendations.push(
      "Priorizar el cumplimiento de las evaluaciones asignadas antes de agregar nuevas actividades."
    );
  }
  if (!sessions) {
    recommendations.push(
      "Completar evaluaciones institucionales para habilitar un plan basado en evidencia."
    );
  }
  return recommendations;
}

function metricValue(value: number | null, attempts: number) {
  return { value, attempts, available: value !== null };
}

function normalizePeriod(from?: string | null, to?: string | null) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 89);
  const fromDate = parseDate(from) ?? defaultFrom;
  const toDate = parseDate(to) ?? today;
  if (fromDate.getTime() > toDate.getTime()) {
    throw new InstitutionAccessError(
      "La fecha inicial no puede ser posterior a la fecha final.",
      400
    );
  }
  return {
    from: toDateKey(fromDate),
    to: toDateKey(toDate),
  };
}

function parseDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100) : null;
}

function average(values: number[]) {
  return values.length
    ? round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;
}

function standardDeviation(values: number[]) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
}

function titleCase(value: string) {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-15T12:00:00.000Z`));
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

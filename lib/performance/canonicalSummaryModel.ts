import {
  buildSportPerformanceDataset,
  getSportCriterionPerformance,
  getSportModulePerformance,
  getSportPerformanceSummary,
  getSportRadarData,
  getSportTopicPerformance,
  type SportPerformanceSummary,
} from "../performanceBySport.ts";
import {
  formatScore,
  getEvolutionData,
  getRecentHistory,
  type AttemptRecord,
  type ExamResultRecord,
  type PerformanceSession,
  type RankingRow,
} from "../performance.ts";
import type { SportType } from "../sports.ts";

export type CanonicalPerformanceRecords = {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
};

export type CanonicalPerformanceSummaryModel = ReturnType<
  typeof buildCanonicalPerformanceSummary
>;

export function buildCanonicalPerformanceSummary({
  attempts,
  examResults,
  sportType,
  canonicalUserId,
}: CanonicalPerformanceRecords & {
  sportType: SportType;
  canonicalUserId: string | null;
}) {
  const officialExamResults = [...examResults]
    .filter(
      (result) =>
        Boolean(canonicalUserId) &&
        result.user_id === canonicalUserId &&
        result.sport_type === sportType
    )
    .sort(compareCreatedAtDesc);
  const officialResultIds = new Set(
    officialExamResults
      .map((result) => result.id)
      .filter((id): id is string => Boolean(id))
  );
  const officialAttempts = attempts.filter(
    (attempt) =>
      attempt.user_id === canonicalUserId &&
      attempt.sport_type === sportType &&
      Boolean(attempt.exam_result_id) &&
      officialResultIds.has(attempt.exam_result_id as string)
  );
  const sessions = officialExamResults.map(toPerformanceSession);
  const dataset = buildSportPerformanceDataset({
    attempts: officialAttempts,
    examResults: [],
    rulesExamResults: [],
    clips: [],
    sportType,
  });
  const baseSummary = getSportPerformanceSummary(
    dataset.items,
    sessions,
    sportType
  );
  const summary = withOfficialExamTotals(baseSummary, officialExamResults);

  return {
    sportType,
    attempts: officialAttempts,
    examResults: officialExamResults,
    summary,
    evolution: getEvolutionData(sessions),
    topics: getSportTopicPerformance(dataset.items, sportType),
    criteria: getSportCriterionPerformance(dataset.items, sportType),
    radarAxes: getSportRadarData(dataset.items, sportType),
    modules: getSportModulePerformance(dataset.items, sportType),
    history: getRecentHistory(dataset.items, 30),
    warnings: dataset.warnings,
  };
}

export async function loadOptionalRanking(
  sportType: SportType,
  fetcher: typeof fetch = fetch
): Promise<{ ranking: RankingRow[]; unavailable: boolean }> {
  try {
    const response = await fetcher(
      `/api/ranking?sport=${encodeURIComponent(sportType)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok || response.redirected) {
      return { ranking: [], unavailable: true };
    }
    const payload = (await response.json()) as { ranking?: unknown };
    if (!Array.isArray(payload.ranking)) {
      return { ranking: [], unavailable: true };
    }
    return { ranking: payload.ranking as RankingRow[], unavailable: false };
  } catch {
    return { ranking: [], unavailable: true };
  }
}

function toPerformanceSession(result: ExamResultRecord): PerformanceSession {
  return {
    id: result.id ?? "official-exam",
    source: "exam",
    label: "Examen arbitral",
    date: result.submitted_at ?? result.created_at ?? "",
    score: finiteScore(result.avg_score),
    totalItems: Number(result.total_questions ?? 0),
  };
}

function withOfficialExamTotals(
  base: SportPerformanceSummary,
  examResults: ExamResultRecord[]
): SportPerformanceSummary {
  const scores = examResults
    .map((result) => finiteScore(result.avg_score))
    .filter((score): score is number => score !== null);
  const avgScore = average(scores);
  const bestScore = scores.length ? Math.max(...scores) : null;
  const lastScore = scores[0] ?? null;
  const hasData = examResults.length > 0;
  const status = officialStatus(avgScore, examResults.length);
  const sampleNote = !hasData
    ? "Todavia no hay evaluaciones oficiales registradas."
    : examResults.length < 3
      ? "Muestra inicial de evaluaciones oficiales."
      : "Diagnostico calculado exclusivamente con evaluaciones oficiales.";
  const metricValues = new Map<string, { value: string; detail?: string }>([
    ["Promedio general", { value: formatScore(avgScore), detail: sampleNote }],
    [
      "Intentos analizados",
      {
        value: String(base.totalAttempts),
        detail: "Respuestas asociadas a evaluaciones oficiales.",
      },
    ],
    [
      "Entrenamientos",
      {
        value: "0",
        detail: "Los intentos de Entrenamiento no integran este rendimiento.",
      },
    ],
    [
      "Evaluaciones",
      {
        value: String(examResults.length),
        detail: "Evaluaciones oficiales completadas.",
      },
    ],
    ["Mejor score", { value: formatScore(bestScore) }],
    ["Ultimo score", { value: formatScore(lastScore) }],
    ["Estado general", { value: status, detail: sampleNote }],
  ]);

  return {
    ...base,
    hasData,
    avgScore,
    totalTrainings: 0,
    totalEvaluations: examResults.length,
    bestScore,
    lastScore,
    status,
    sampleNote,
    metrics: base.metrics.map((metric) => {
      const replacement = metricValues.get(metric.label);
      return replacement ? { ...metric, ...replacement } : metric;
    }),
  };
}

function finiteScore(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 100
    ) / 100
  );
}

function officialStatus(avgScore: number | null, count: number) {
  if (avgScore === null || count === 0) return "Sin datos";
  if (count < 3) return "Muestra inicial";
  if (avgScore >= 85) return "Rendimiento destacado";
  if (avgScore >= 70) return "Rendimiento competitivo";
  return "Necesita refuerzo";
}

function compareCreatedAtDesc(a: ExamResultRecord, b: ExamResultRecord) {
  const aTime = new Date(a.submitted_at ?? a.created_at ?? 0).getTime();
  const bTime = new Date(b.submitted_at ?? b.created_at ?? 0).getTime();
  return bTime - aTime;
}

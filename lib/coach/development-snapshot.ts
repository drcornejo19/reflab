import "server-only";

import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  buildSportPerformanceDataset,
  getSportCriterionPerformance,
  getSportPerformanceSummary,
  getSportRadarData,
  getSportRecommendedPlan,
  getSportTopicPerformance,
} from "@/lib/performanceBySport";
import type {
  AttemptRecord,
  ExamResultRecord,
  PerformanceClipRecord,
  RulesExamResultRecord,
} from "@/lib/performance";
import type { SportType } from "@/lib/sports";
import { CoachSetupError } from "@/lib/coach/errors";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function getCoachDevelopmentSnapshot(
  supabase: SupabaseAdminClient,
  userId: string,
  sportType: SportType
) {
  const [attemptsRes, examsRes, rulesRes, clipsRes] = await Promise.all([
    supabase
      .from("attempts")
      .select("*")
      .eq("user_id", userId)
      .eq("sport_type", sportType)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("exam_results")
      .select("*")
      .eq("user_id", userId)
      .eq("sport_type", sportType)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("rules_exam_results")
      .select("*")
      .eq("user_id", userId)
      .eq("sport_type", sportType)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("clips").select("*").eq("sport_type", sportType),
  ]);

  const primaryError = attemptsRes.error || examsRes.error || clipsRes.error;
  if (primaryError) {
    throw new CoachSetupError(
      `Development snapshot query failed: ${primaryError.message}`
    );
  }

  const dataset = buildSportPerformanceDataset({
    attempts: (attemptsRes.data ?? []) as AttemptRecord[],
    examResults: (examsRes.data ?? []) as ExamResultRecord[],
    rulesExamResults: rulesRes.error
      ? []
      : ((rulesRes.data ?? []) as RulesExamResultRecord[]),
    clips: (clipsRes.data ?? []) as PerformanceClipRecord[],
    sportType,
  });
  const summary = getSportPerformanceSummary(
    dataset.items,
    dataset.sessions,
    sportType
  );

  return {
    sportType,
    generatedAt: new Date().toISOString(),
    summary,
    topics: getSportTopicPerformance(dataset.items, sportType),
    criteria: getSportCriterionPerformance(dataset.items, sportType),
    radar: getSportRadarData(dataset.items, sportType),
    recommendedPlan: getSportRecommendedPlan(summary, sportType),
    recentHistory: dataset.items.slice(0, 20),
    dataQuality: {
      attempts: summary.totalAttempts,
      warnings: [
        ...dataset.warnings.map((warning) => warning.message),
        ...(rulesRes.error
          ? ["Los resultados de examenes de reglas no estan disponibles."]
          : []),
      ],
      status:
        summary.totalAttempts === 0
          ? "no_data"
          : summary.totalAttempts < 5
            ? "initial_sample"
            : dataset.warnings.length > 0
              ? "review_needed"
              : "traceable",
    },
  };
}

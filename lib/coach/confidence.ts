import type {
  CoachConfidence,
  CoachEvidenceReference,
} from "@/lib/coach/types";

type ConfidenceInput = {
  evidence: CoachEvidenceReference[];
  sampleSize?: number;
  minimumSampleSize?: number;
};

export function calculateCoachConfidence({
  evidence,
  sampleSize = evidence.length,
  minimumSampleSize = 1,
}: ConfidenceInput): CoachConfidence {
  if (evidence.length === 0) {
    return {
      label: "human_review",
      score: 20,
      reasons: ["No existe evidencia verificable asociada a esta devolucion."],
      requiresHumanReview: true,
    };
  }

  const officialCount = evidence.filter((item) => item.isOfficial).length;
  const reviewedCount = evidence.filter((item) => Boolean(item.reviewedAt)).length;
  const versionedCount = evidence.filter((item) => Boolean(item.sourceVersion)).length;
  const referencedCount = evidence.filter((item) => Boolean(item.ruleReference)).length;
  const allOfficial = officialCount === evidence.length;
  const allReviewed = reviewedCount === evidence.length;
  const allVersioned = versionedCount === evidence.length;
  const hasRuleReference = referencedCount > 0;
  const enoughSamples = sampleSize >= minimumSampleSize;

  if (
    allOfficial &&
    allReviewed &&
    allVersioned &&
    hasRuleReference &&
    enoughSamples
  ) {
    return {
      label: "high",
      score: 92,
      reasons: [
        "La evidencia es oficial, versionada y fue revisada.",
        `La muestra disponible cumple el minimo definido (${sampleSize}/${minimumSampleSize}).`,
      ],
      requiresHumanReview: false,
    };
  }

  if (officialCount > 0 && enoughSamples) {
    const reasons = [
      `${officialCount} de ${evidence.length} evidencias tienen fuente oficial identificada.`,
    ];

    if (!allReviewed) reasons.push("Parte de la evidencia no tiene fecha de revision.");
    if (!allVersioned) reasons.push("Parte de la evidencia no tiene version normativa.");
    if (!hasRuleReference) reasons.push("Falta una referencia reglamentaria precisa.");

    return {
      label: "medium",
      score: 65,
      reasons,
      requiresHumanReview: false,
    };
  }

  const reasons = [];
  if (officialCount === 0) reasons.push("No se pudo confirmar una fuente oficial.");
  if (!enoughSamples) {
    reasons.push(
      `La muestra es insuficiente para una conclusion estable (${sampleSize}/${minimumSampleSize}).`
    );
  }

  return {
    label: "human_review",
    score: 35,
    reasons,
    requiresHumanReview: true,
  };
}

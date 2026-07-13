import type {
  VideoFieldDefinition,
  VideoFieldKey,
  VideoTopicSchema,
} from "@/lib/videoAnalysisSchemas";

export type VideoAnswerValue = string | boolean | null;
export type VideoAnswerMap = Partial<Record<VideoFieldKey, VideoAnswerValue>>;

export type VideoFieldResult = {
  key: VideoFieldKey;
  label: string;
  actual: VideoAnswerValue;
  expected: VideoAnswerValue;
  scored: boolean;
  correct: boolean | null;
};

export type VideoEvaluationResult = {
  score: number;
  totalScored: number;
  correctCount: number;
  fieldResults: VideoFieldResult[];
  technicalCorrect: boolean | null;
  restartCorrect: boolean | null;
  disciplinaryCorrect: boolean | null;
  subtypeCorrect: boolean | null;
  accumulatedFoulCorrect: boolean | null;
  fourSecondCorrect: boolean | null;
  goalkeeperCorrect: boolean | null;
};

export function normalizeVideoAnswerMap(value: unknown): VideoAnswerMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).flatMap(
    ([key, rawValue]) => {
      if (
        typeof rawValue !== "string" &&
        typeof rawValue !== "boolean" &&
        rawValue !== null
      ) {
        return [];
      }

      return [[key, rawValue]] as const;
    }
  );

  return Object.fromEntries(entries) as VideoAnswerMap;
}

export function evaluateVideoAnswers(
  schema: VideoTopicSchema,
  expectedAnswers: VideoAnswerMap,
  actualAnswers: VideoAnswerMap
): VideoEvaluationResult {
  const fieldResults = schema.fields.map((field) =>
    evaluateField(field, expectedAnswers[field.key] ?? null, actualAnswers[field.key] ?? null)
  );

  const scoredFields = fieldResults.filter((field) => field.scored);
  const correctCount = scoredFields.filter((field) => field.correct === true).length;
  const score =
    scoredFields.length === 0
      ? 0
      : Math.round((correctCount / scoredFields.length) * 100);

  return {
    score,
    totalScored: scoredFields.length,
    correctCount,
    fieldResults,
    technicalCorrect: getFieldCorrect(fieldResults, "technical_decision"),
    restartCorrect: getFieldCorrect(fieldResults, "restart"),
    disciplinaryCorrect: getFieldCorrect(fieldResults, "disciplinary_action"),
    subtypeCorrect: getFieldCorrect(fieldResults, "infringement_type"),
    accumulatedFoulCorrect: getFieldCorrect(fieldResults, "accumulated_foul"),
    fourSecondCorrect: getFieldCorrect(fieldResults, "four_second"),
    goalkeeperCorrect: getFieldCorrect(fieldResults, "goalkeeper_decision"),
  };
}

function evaluateField(
  field: VideoFieldDefinition,
  expected: VideoAnswerValue,
  actual: VideoAnswerValue
): VideoFieldResult {
  const scored =
    expected !== null &&
    expected !== undefined &&
    field.kind !== "text";

  return {
    key: field.key,
    label: field.label,
    actual,
    expected,
    scored,
    correct: scored ? compareAnswerValues(expected, actual) : null,
  };
}

function compareAnswerValues(
  expected: VideoAnswerValue,
  actual: VideoAnswerValue
) {
  if (typeof expected === "boolean") {
    return expected === actual;
  }

  return normalizeText(expected) === normalizeText(actual);
}

function normalizeText(value: VideoAnswerValue) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getFieldCorrect(
  fields: VideoFieldResult[],
  key: VideoFieldKey
) {
  return fields.find((field) => field.key === key)?.correct ?? null;
}

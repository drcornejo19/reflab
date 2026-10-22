export const FIELD_SCORING_VERSION = "field_applicable_v2";

export type ScoreAnswer = {
  foul?: boolean | null;
  restart?: string | null;
  discipline?: string | null;
  var?: boolean | null;
};

export type FieldScoreAnswer = Pick<
  ScoreAnswer,
  "foul" | "restart" | "discipline"
>;

const scoreWeights = {
  foul: 35,
  restart: 15,
  discipline: 25,
  var: 25,
} as const;

export function calculateFieldScore(
  user: FieldScoreAnswer,
  correct: ScoreAnswer
) {
  return calculateScore(user, correct);
}

export function calculateScore(user: ScoreAnswer, correct: ScoreAnswer) {
  let earned = 0;
  let applicableMax = 0;

  if (isApplicable(user.foul, correct.foul)) {
    applicableMax += scoreWeights.foul;
    if (user.foul === correct.foul) earned += scoreWeights.foul;
  }

  if (isApplicable(user.restart, correct.restart)) {
    applicableMax += scoreWeights.restart;
    if (user.restart === correct.restart) earned += scoreWeights.restart;
  }

  if (isApplicable(user.discipline, correct.discipline)) {
    applicableMax += scoreWeights.discipline;
    if (
      normalizeDiscipline(user.discipline) ===
      normalizeDiscipline(correct.discipline)
    ) {
      earned += scoreWeights.discipline;
    }
  }

  if (isApplicable(user.var, correct.var)) {
    applicableMax += scoreWeights.var;
    if (user.var === correct.var) earned += scoreWeights.var;
  }

  return applicableMax === 0
    ? 0
    : Math.round((earned / applicableMax) * 100);
}

function isApplicable<T>(
  userValue: T | null | undefined,
  correctValue: T | null | undefined
) {
  return (
    userValue !== null &&
    userValue !== undefined &&
    correctValue !== null &&
    correctValue !== undefined
  );
}

export function normalizeDiscipline(value?: string | null) {
  if (!value) return value;

  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (
    normalized === "sin sancion" ||
    normalized === "sin tarjeta" ||
    normalized === "ninguna"
  ) {
    return "none";
  }

  return normalized;
}

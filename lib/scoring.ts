type ScoreAnswer = {
  foul?: boolean | null;
  restart?: string | null;
  discipline?: string | null;
  var?: boolean | null;
};

export function calculateScore(user: ScoreAnswer, correct: ScoreAnswer) {
  let score = 0;

  if (user.foul === correct.foul) score += 35;
  if (user.restart === correct.restart) score += 15;
  if (normalizeDiscipline(user.discipline) === normalizeDiscipline(correct.discipline)) {
    score += 25;
  }
  if (user.var === correct.var) score += 25;

  return score;
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

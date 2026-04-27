export function calculateScore(user: any, correct: any) {
  let score = 0;

  if (user.foul === correct.foul) score += 35;
  if (user.restart === correct.restart) score += 15;
  if (user.discipline === correct.discipline) score += 25;
  if (user.var === correct.var) score += 25;

  return score;
}
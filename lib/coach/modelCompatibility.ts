export type CoachTextVerbosity = "low" | "medium" | "high";

const GPT_4O_MINI_SNAPSHOT = /^gpt-4o-mini-\d{4}-\d{2}-\d{2}$/;

export function resolveCoachTextVerbosity(
  model: string
): CoachTextVerbosity | undefined {
  const normalizedModel = model.trim().toLowerCase();

  if (
    normalizedModel === "gpt-4o-mini" ||
    GPT_4O_MINI_SNAPSHOT.test(normalizedModel)
  ) {
    return "medium";
  }

  // Unknown models use their own default instead of inheriting an incompatible value.
  return undefined;
}

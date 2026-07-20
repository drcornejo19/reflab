import type {
  CoachCommunicationOutput,
  CoachCommunicationScores,
  CoachJsonSchema,
  CoachNarrativeOutput,
} from "@/lib/coach/types";
import { CoachProviderError } from "@/lib/coach/errors";

export const coachNarrativeSchema: CoachJsonSchema<CoachNarrativeOutput> = {
  name: "reflab_coach_narrative",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "strengths",
      "opportunities",
      "explanation",
      "nextAction",
      "humanReviewReason",
    ],
    properties: {
      summary: { type: "string" },
      strengths: {
        type: "array",
        items: { type: "string" },
        maxItems: 4,
      },
      opportunities: {
        type: "array",
        items: { type: "string" },
        maxItems: 4,
      },
      explanation: { type: "string" },
      nextAction: { type: "string" },
      humanReviewReason: { type: ["string", "null"] },
    },
  },
  parse: parseNarrative,
};

export const coachCommunicationSchema: CoachJsonSchema<CoachCommunicationOutput> =
  {
    name: "reflab_coach_communication",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["feedback", "scores", "humanReviewReason"],
      properties: {
        feedback: { type: "string" },
        humanReviewReason: { type: ["string", "null"] },
        scores: {
          type: "object",
          additionalProperties: false,
          required: [
            "terminology",
            "clarity",
            "precision",
            "structure",
            "vocabulary",
            "grammar",
            "global",
            "globalLabel",
            "modelAnswer",
          ],
          properties: {
            terminology: nullableScoreSchema(),
            clarity: nullableScoreSchema(),
            precision: nullableScoreSchema(),
            structure: nullableScoreSchema(),
            vocabulary: nullableScoreSchema(),
            grammar: nullableScoreSchema(),
            global: nullableScoreSchema(),
            globalLabel: { type: ["string", "null"] },
            modelAnswer: { type: ["string", "null"] },
          },
        },
      },
    },
    parse: parseCommunication,
  };

export function formatCoachNarrative(output: CoachNarrativeOutput) {
  const sections = [output.summary];

  if (output.strengths.length > 0) {
    sections.push(`Fortalezas\n${formatList(output.strengths)}`);
  }
  if (output.opportunities.length > 0) {
    sections.push(`Oportunidades de mejora\n${formatList(output.opportunities)}`);
  }

  sections.push(`Por que\n${output.explanation}`);
  sections.push(`Proximo paso\n${output.nextAction}`);

  if (output.humanReviewReason) {
    sections.push(`Revision humana\n${output.humanReviewReason}`);
  }

  return sections.join("\n\n");
}

function parseNarrative(value: unknown): CoachNarrativeOutput {
  const record = objectRecord(value);
  return {
    summary: requiredText(record.summary, "summary"),
    strengths: textArray(record.strengths, "strengths"),
    opportunities: textArray(record.opportunities, "opportunities"),
    explanation: requiredText(record.explanation, "explanation"),
    nextAction: requiredText(record.nextAction, "nextAction"),
    humanReviewReason: nullableText(record.humanReviewReason),
  };
}

function parseCommunication(value: unknown): CoachCommunicationOutput {
  const record = objectRecord(value);
  const scores = objectRecord(record.scores);

  const parsedScores: CoachCommunicationScores = {
    terminology: nullableScore(scores.terminology),
    clarity: nullableScore(scores.clarity),
    precision: nullableScore(scores.precision),
    structure: nullableScore(scores.structure),
    vocabulary: nullableScore(scores.vocabulary),
    grammar: nullableScore(scores.grammar),
    global: nullableScore(scores.global),
    globalLabel: nullableText(scores.globalLabel),
    modelAnswer: nullableText(scores.modelAnswer),
  };

  return {
    feedback: requiredText(record.feedback, "feedback"),
    scores: parsedScores,
    humanReviewReason: nullableText(record.humanReviewReason),
  };
}

function nullableScoreSchema() {
  return {
    type: ["number", "null"],
    minimum: 0,
    maximum: 10,
  };
}

function objectRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoachProviderError("Model returned an invalid object.");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CoachProviderError(`Model output is missing ${field}.`);
  }
  return value.trim();
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new CoachProviderError(`Model output has an invalid ${field} list.`);
  }
  return value.map((item) => item.trim()).filter(Boolean).slice(0, 4);
}

function nullableScore(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CoachProviderError("Model output contains an invalid score.");
  }
  return Math.max(0, Math.min(10, Math.round(value)));
}

function formatList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

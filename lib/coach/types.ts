import type { SportType } from "@/lib/sports";

export type CoachFeature =
  | "technical_feedback"
  | "exam_analysis"
  | "communication_feedback"
  | "var_feedback"
  | "coach_conversation";

export type CoachConfidenceLabel = "high" | "medium" | "human_review";

export type CoachConfidence = {
  label: CoachConfidenceLabel;
  score: number;
  reasons: string[];
  requiresHumanReview: boolean;
};

export type CoachEvidenceReference = {
  id: string;
  evidenceType: "clip" | "attempt" | "exam" | "official_document" | "metric_snapshot";
  sourceTable: string;
  sourceId: string;
  title: string;
  authority: string | null;
  sportType: SportType;
  ruleReference: string | null;
  sourceVersion: string | null;
  officialUrl: string | null;
  isOfficial: boolean;
  normativeStatus: string | null;
  reviewedAt: string | null;
};

export type CoachEvidence = {
  reference: CoachEvidenceReference;
  facts: Record<string, unknown>;
};

export type CoachNarrativeOutput = {
  summary: string;
  strengths: string[];
  opportunities: string[];
  explanation: string;
  nextAction: string;
  humanReviewReason: string | null;
};

export type CoachCommunicationScores = {
  terminology: number | null;
  clarity: number | null;
  precision: number | null;
  structure: number | null;
  vocabulary: number | null;
  grammar: number | null;
  global: number | null;
  globalLabel: string | null;
  modelAnswer: string | null;
};

export type CoachCommunicationOutput = {
  feedback: string;
  scores: CoachCommunicationScores;
  humanReviewReason: string | null;
};

export type CoachJsonSchema<T> = {
  name: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
};

export type CoachModelRequest<T> = {
  userId: string;
  feature: CoachFeature;
  sportType: SportType;
  promptVersion: string;
  instructions: string;
  input: string;
  evidence: CoachEvidence[];
  confidence: CoachConfidence;
  outputSchema: CoachJsonSchema<T>;
  maxOutputTokens?: number;
  institutionId?: string | null;
};

export type CoachModelResult<T> = {
  runId: string;
  value: T;
  confidence: CoachConfidence;
  evidence: CoachEvidenceReference[];
  model: string;
  promptVersion: string;
};

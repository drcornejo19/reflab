import "server-only";

import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { CoachSetupError } from "@/lib/coach/errors";
import type {
  CoachEvidence,
  CoachEvidenceReference,
} from "@/lib/coach/types";
import {
  getGoverningBodyForSport,
  type SportType,
} from "@/lib/sports";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ClipRow = Record<string, unknown> & { id: string };

export async function loadCoachClipEvidence(
  supabase: SupabaseAdminClient,
  clipIds: string[],
  sportType: SportType
): Promise<CoachEvidence[]> {
  const uniqueIds = [...new Set(clipIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    20
  );
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("clips")
    .select("*")
    .in("id", uniqueIds)
    .eq("sport_type", sportType);

  if (error) {
    throw new CoachSetupError(`Coach evidence query failed: ${error.message}`);
  }

  const byId = new Map(
    ((data ?? []) as ClipRow[]).map((row) => [String(row.id), row])
  );

  return uniqueIds
    .map((id) => byId.get(id))
    .filter((row): row is ClipRow => Boolean(row))
    .map((row) => buildClipEvidence(row, sportType));
}

export function serializeEvidenceForPrompt(evidence: CoachEvidence[]) {
  return evidence.map((item) => ({
    reference: {
      title: item.reference.title,
      authority: item.reference.authority,
      sportType: item.reference.sportType,
      ruleReference: item.reference.ruleReference,
      sourceVersion: item.reference.sourceVersion,
      normativeStatus: item.reference.normativeStatus,
      reviewedAt: item.reference.reviewedAt,
    },
    facts: item.facts,
  }));
}

function buildClipEvidence(row: ClipRow, sportType: SportType): CoachEvidence {
  const sourceOfficial = safeHttpsUrl(row.source_official);
  const authority = textValue(row.governing_body);
  const expectedAuthority = getGoverningBodyForSport(sportType);
  const authorityMatches =
    authority?.toLowerCase() === expectedAuthority.toLowerCase();

  const reference: CoachEvidenceReference = {
    id: `clip:${row.id}`,
    evidenceType: "clip",
    sourceTable: "clips",
    sourceId: String(row.id),
    title: textValue(row.title) ?? "Clip arbitral",
    authority,
    sportType,
    ruleReference: textValue(row.rule_reference),
    sourceVersion: textValue(row.source_version) ?? textValue(row.season),
    officialUrl: sourceOfficial,
    isOfficial: Boolean(sourceOfficial && authorityMatches),
    normativeStatus: textValue(row.normative_status),
    reviewedAt: textValue(row.reviewed_at),
  };

  return {
    reference,
    facts: compactRecord({
      topic: textValue(row.topic),
      subtopic: textValue(row.subtopic) ?? textValue(row.sub_type),
      difficulty: textValue(row.difficulty),
      correctFoul: booleanValue(row.correct_foul),
      correctRestart: textValue(row.correct_restart),
      correctDiscipline: textValue(row.correct_discipline),
      correctDecision: textValue(row.correct_decision),
      technicalResolution: textValue(row.technical_resolution),
      disciplinaryResolution: textValue(row.disciplinary_resolution),
      explanation: textValue(row.explanation),
      incidentType: textValue(row.incident_type),
      correctClearError: textValue(row.correct_clear_error),
      correctAppStatus: textValue(row.correct_app_status),
      correctVarDecision: textValue(row.correct_var_decision),
      analysisAnswers: objectValue(row.analysis_answers),
    }),
  };
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function compactRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined)
  );
}

function safeHttpsUrl(value: unknown) {
  const text = textValue(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

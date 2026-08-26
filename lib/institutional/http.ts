import "server-only";

import { NextResponse } from "next/server";
import type { SaveInstitutionAssessmentInput } from "@/lib/institutional/assessment-server";
import type { SaveInstitutionContentInput } from "@/lib/institutional/content-server";
import { InstitutionalContentStorageError } from "@/lib/institutional/contentStorage";
import { InstitutionAccessError } from "@/lib/institutional/server";
import {
  isInstitutionAssessmentModality,
  isInstitutionAssessmentStatus,
  isInstitutionContentStatus,
  isInstitutionContentType,
  isInstitutionContentVisibility,
  type InstitutionContentMetadata,
} from "@/lib/institutional/types";
import { isSportType } from "@/lib/sports";

export function institutionalJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export function institutionalErrorResponse(
  error: unknown,
  fallback: string
) {
  if (error instanceof InstitutionAccessError) {
    return institutionalJson({ error: error.message }, error.status);
  }
  if (error instanceof InstitutionalContentStorageError) {
    return institutionalJson({ error: error.message }, error.status);
  }
  console.error(fallback, error);
  return institutionalJson({ error: fallback }, 500);
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function nullableText(value: unknown) {
  return cleanText(value) || null;
}

export function nullableDate(value: unknown) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function nullableDateTime(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

export function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function positiveInteger(value: unknown, fallback = 1) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseAssessmentInput(
  body: Record<string, unknown>
): SaveInstitutionAssessmentInput {
  if (!isSportType(body.sportType)) {
    throw new InstitutionAccessError("Selecciona una disciplina valida.", 400);
  }
  if (!isInstitutionAssessmentModality(body.modality)) {
    throw new InstitutionAccessError("Selecciona una modalidad valida.", 400);
  }
  if (!isInstitutionAssessmentStatus(body.status)) {
    throw new InstitutionAccessError("Selecciona un estado valido.", 400);
  }
  return {
    sportType: body.sportType,
    name: cleanText(body.name),
    description: nullableText(body.description),
    modality: body.modality,
    status: body.status,
    timezone:
      cleanText(body.timezone) || "America/Argentina/Buenos_Aires",
    opensAt: nullableDateTime(body.opensAt),
    closesAt: nullableDateTime(body.closesAt),
    durationMinutes: nullableNumber(body.durationMinutes),
    attemptsAllowed: positiveInteger(body.attemptsAllowed),
    immediateFeedback: Boolean(body.immediateFeedback),
    freeNavigation: Boolean(body.freeNavigation),
    randomizeQuestions: Boolean(body.randomizeQuestions),
    randomizeVideos: Boolean(body.randomizeVideos),
    minimumScore: nullableNumber(body.minimumScore),
    penaltyValue: nullableNumber(body.penaltyValue),
    allowReview: body.allowReview !== false,
    settings: asRecord(body.settings),
    contentIds: stringArray(body.contentIds),
    groupIds: stringArray(body.groupIds),
    userIds: stringArray(body.userIds),
  };
}

export function parseContentInput(
  body: Record<string, unknown>
): SaveInstitutionContentInput {
  if (!isSportType(body.sportType)) {
    throw new InstitutionAccessError("Selecciona una disciplina valida.", 400);
  }
  if (!isInstitutionContentType(body.contentType)) {
    throw new InstitutionAccessError("Selecciona un tipo de contenido.", 400);
  }
  if (!isInstitutionContentStatus(body.status)) {
    throw new InstitutionAccessError("Selecciona un estado valido.", 400);
  }
  if (!isInstitutionContentVisibility(body.visibility)) {
    throw new InstitutionAccessError("Selecciona una visibilidad valida.", 400);
  }
  const metadata = asRecord(body.metadata) as InstitutionContentMetadata;

  return {
    sportType: body.sportType,
    contentType: body.contentType,
    title: cleanText(body.title),
    description: nullableText(body.description),
    topic: nullableText(body.topic),
    subtopic: nullableText(body.subtopic),
    ruleReference: nullableText(body.ruleReference),
    difficulty: nullableText(body.difficulty),
    language: cleanText(body.language) || "es",
    validFrom: nullableDate(body.validFrom),
    validUntil: nullableDate(body.validUntil),
    sourceName: nullableText(body.sourceName),
    sourceUrl: nullableText(body.sourceUrl),
    storagePath: nullableText(body.storagePath),
    visibility: body.visibility,
    status: body.status,
    version: positiveInteger(body.version),
    expiresAt: nullableDateTime(body.expiresAt),
    metadata,
    groupIds: stringArray(body.groupIds),
    userIds: stringArray(body.userIds),
    availableFrom: nullableDateTime(body.availableFrom),
    dueAt: nullableDateTime(body.dueAt),
    required: body.required !== false,
  };
}

export function assertReportFormat(value: string | null) {
  if (value !== "csv") {
    throw new InstitutionAccessError(
      "El formato solicitado no esta disponible.",
      400
    );
  }
}

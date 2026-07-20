import {
  createInstitutionAssessment,
  getInstitutionAssessmentWorkspace,
  type SaveInstitutionAssessmentInput,
} from "@/lib/institutional/assessment-server";
import {
  asRecord,
  cleanText,
  institutionalErrorResponse,
  institutionalJson,
  nullableDateTime,
  nullableNumber,
  nullableText,
  positiveInteger,
  stringArray,
} from "@/lib/institutional/http";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import {
  isInstitutionAssessmentModality,
  isInstitutionAssessmentStatus,
} from "@/lib/institutional/types";
import { isSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const institutionId = new URL(request.url).searchParams.get("institutionId");
    const workspace = await getInstitutionAssessmentWorkspace(institutionId);
    return institutionalJson({ workspace });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudieron cargar las evaluaciones institucionales."
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireInstitutionUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const assessment = await createInstitutionAssessment(
      nullableText(body.institutionId),
      parseAssessmentInput(body)
    );
    return institutionalJson({ assessment }, 201);
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo crear la evaluacion institucional."
    );
  }
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

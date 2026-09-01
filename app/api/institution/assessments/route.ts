import {
  createInstitutionAssessment,
  getInstitutionAssessmentWorkspace,
} from "@/lib/institutional/assessment-server";
import {
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
  parseAssessmentInput,
} from "@/lib/institutional/http";
import { requireInstitutionUserId } from "@/lib/institutional/server";

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

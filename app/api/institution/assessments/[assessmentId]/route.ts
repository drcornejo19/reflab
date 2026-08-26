import { updateInstitutionAssessment } from "@/lib/institutional/assessment-server";
import {
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
  parseAssessmentInput,
} from "@/lib/institutional/http";
import { requireInstitutionUserId } from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { assessmentId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const assessment = await updateInstitutionAssessment(
      assessmentId,
      nullableText(body.institutionId),
      parseAssessmentInput(body)
    );
    return institutionalJson({ assessment });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo actualizar la evaluacion institucional."
    );
  }
}

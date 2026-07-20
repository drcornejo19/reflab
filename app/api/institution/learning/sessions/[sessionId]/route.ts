import {
  asRecord,
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
} from "@/lib/institutional/http";
import {
  getInstitutionAssessmentSession,
  submitInstitutionAssessmentSession,
} from "@/lib/institutional/learning-server";
import { requireInstitutionUserId } from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const institutionId = new URL(request.url).searchParams.get("institutionId");
    const session = await getInstitutionAssessmentSession(
      sessionId,
      institutionId
    );
    return institutionalJson({ session });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo cargar el intento."
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { sessionId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const rawAnswers = asRecord(body.answers);
    const answers = Object.fromEntries(
      Object.entries(rawAnswers).map(([key, value]) => [
        key,
        String(value ?? ""),
      ])
    );
    const session = await submitInstitutionAssessmentSession(
      sessionId,
      answers,
      nullableText(body.institutionId)
    );
    return institutionalJson({ session });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo finalizar la evaluacion."
    );
  }
}

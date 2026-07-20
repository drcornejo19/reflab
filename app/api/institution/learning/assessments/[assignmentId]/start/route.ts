import {
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
} from "@/lib/institutional/http";
import { startInstitutionAssessmentSession } from "@/lib/institutional/learning-server";
import { requireInstitutionUserId } from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { assignmentId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const session = await startInstitutionAssessmentSession(
      assignmentId,
      nullableText(body.institutionId)
    );
    return institutionalJson({ session }, 201);
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo iniciar la evaluacion."
    );
  }
}

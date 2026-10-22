import { updateInstitutionContent } from "@/lib/institutional/content-server";
import {
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
  parseContentInput,
} from "@/lib/institutional/http";
import { requireInstitutionUserId } from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ contentId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { contentId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const content = await updateInstitutionContent(
      contentId,
      nullableText(body.institutionId),
      parseContentInput(body)
    );
    return institutionalJson({ content });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo actualizar el contenido institucional."
    );
  }
}

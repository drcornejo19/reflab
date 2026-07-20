import {
  institutionalErrorResponse,
  institutionalJson,
} from "@/lib/institutional/http";
import { getInstitutionLearningWorkspace } from "@/lib/institutional/learning-server";
import { isSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const sportType = params.get("sportType");
    if (!isSportType(sportType)) {
      return institutionalJson(
        { error: "Selecciona una disciplina valida." },
        400
      );
    }
    const workspace = await getInstitutionLearningWorkspace(
      sportType,
      params.get("institutionId")
    );
    return institutionalJson({ workspace });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo cargar tu espacio institucional."
    );
  }
}

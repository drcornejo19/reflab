import {
  institutionalErrorResponse,
  institutionalJson,
} from "@/lib/institutional/http";
import { getInstitutionMetricsWorkspace } from "@/lib/institutional/metrics-server";
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
    const workspace = await getInstitutionMetricsWorkspace({
      sportType,
      institutionId: params.get("institutionId"),
      groupId: params.get("groupId"),
      userId: params.get("userId"),
      from: params.get("from"),
      to: params.get("to"),
    });
    return institutionalJson({ workspace });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudieron calcular las metricas institucionales."
    );
  }
}

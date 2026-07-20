import {
  institutionalErrorResponse,
  institutionalJson,
} from "@/lib/institutional/http";
import { getInstitutionMetricsWorkspace } from "@/lib/institutional/metrics-server";
import {
  InstitutionAccessError,
  requireInstitutionPermission,
} from "@/lib/institutional/server";
import { getEffectiveInstitutionPermissions } from "@/lib/institutional/permissions";
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
    const authorization = await requireInstitutionPermission(
      "reports.read",
      params.get("institutionId")
    );
    if (
      !getEffectiveInstitutionPermissions(authorization.context).includes(
        "reports.read"
      )
    ) {
      throw new InstitutionAccessError(
        "El rol simulado no tiene acceso a reportes.",
        403
      );
    }
    const workspace = await getInstitutionMetricsWorkspace({
      sportType,
      institutionId: params.get("institutionId"),
      groupId: params.get("groupId"),
      from: params.get("from"),
      to: params.get("to"),
    });
    return institutionalJson({
      report: {
        generatedAt: new Date().toISOString(),
        title: `Reporte institucional de ${
          sportType === "futsal" ? "Futsal" : "Futbol 11"
        }`,
        workspace,
      },
    });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo generar el reporte institucional."
    );
  }
}

export function assertReportFormat(value: string | null) {
  if (value !== "csv") {
    throw new InstitutionAccessError(
      "El formato solicitado no esta disponible.",
      400
    );
  }
}

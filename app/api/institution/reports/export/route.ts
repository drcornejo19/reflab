import { getInstitutionMetricsWorkspace } from "@/lib/institutional/metrics-server";
import { assertReportFormat } from "@/lib/institutional/http";
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
      throw new InstitutionAccessError(
        "Selecciona una disciplina valida.",
        400
      );
    }
    assertReportFormat(params.get("format"));
    const authorization = await requireInstitutionPermission(
      "reports.export",
      params.get("institutionId")
    );
    if (
      !getEffectiveInstitutionPermissions(authorization.context).includes(
        "reports.export"
      )
    ) {
      throw new InstitutionAccessError(
        "El rol simulado no puede exportar reportes.",
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
    const csv = buildCsv(workspace);
    const filename = `reflab-${slug(workspace.institution.name)}-${sportType}-${workspace.period.from}-${workspace.period.to}.csv`;
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof InstitutionAccessError ? error.status : 500;
    const message =
      error instanceof InstitutionAccessError
        ? error.message
        : "No se pudo exportar el reporte.";
    return Response.json(
      { error: message },
      {
        status,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  }
}

function buildCsv(
  workspace: Awaited<ReturnType<typeof getInstitutionMetricsWorkspace>>
) {
  const rows: Array<Array<string | number | null>> = [
    ["Institucion", workspace.institution.name],
    ["Disciplina", workspace.sportType === "futsal" ? "Futsal" : "Futbol 11"],
    ["Periodo", workspace.period.label],
    ["Generado", workspace.generatedAt],
    [],
    ["Resumen", "Valor", "Intentos"],
    [
      "Promedio general",
      workspace.summary.average.value,
      workspace.summary.average.attempts,
    ],
    ["Evaluaciones completadas", workspace.summary.sessions, null],
    ["Respuestas corregidas", workspace.summary.decisions, null],
    ["Usuarios activos", workspace.summary.activeUsers, null],
    ["Cumplimiento", workspace.summary.completionRate, null],
    ["Tasa de aprobacion", workspace.summary.passRate, null],
    [],
    ["Topico", "Promedio", "Respuestas", "Sesiones"],
    ...workspace.topics.map((item) => [
      item.label,
      item.average,
      item.decisions,
      item.sessions,
    ]),
    [],
    ["Grupo", "Participantes", "Activos", "Sesiones", "Promedio", "Cumplimiento"],
    ...workspace.groups.map((group) => [
      group.name,
      group.participants,
      group.activeUsers,
      group.sessions,
      group.average,
      group.compliance,
    ]),
    [],
    ["Advertencias"],
    ...workspace.warnings.map((warning) => [warning]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: string | number | null) {
  const text = value == null ? "Sin datos" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function slug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "institucion"
  );
}

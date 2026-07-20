import {
  cleanText,
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
} from "@/lib/institutional/http";
import {
  endInstitutionDemoSession,
  getInstitutionDemoWorkspace,
  startInstitutionDemoSession,
} from "@/lib/institutional/demo-server";
import { InstitutionAccessError } from "@/lib/institutional/server";
import { isInstitutionRoleKey } from "@/lib/institutional/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const institutionId = new URL(request.url).searchParams.get("institutionId");
    const workspace = await getInstitutionDemoWorkspace(institutionId);
    return institutionalJson({ workspace });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo cargar el modo demo."
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const simulatedRole = cleanText(body.simulatedRole);
    if (!isInstitutionRoleKey(simulatedRole)) {
      throw new InstitutionAccessError(
        "Selecciona un rol valido para la demostracion.",
        400
      );
    }
    const session = await startInstitutionDemoSession(
      simulatedRole,
      nullableText(body.institutionId)
    );
    return institutionalJson({ session }, 201);
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo iniciar el modo demo."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const session = await endInstitutionDemoSession(
      nullableText(body.institutionId)
    );
    return institutionalJson({ session });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo cerrar el modo demo."
    );
  }
}

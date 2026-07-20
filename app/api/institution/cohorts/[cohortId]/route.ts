import { NextResponse } from "next/server";
import { updateInstitutionCohort } from "@/lib/institutional/directory-server";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import { isInstitutionLifecycleStatus } from "@/lib/institutional/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cohortId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { cohortId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = cleanText(body.institutionId);
    if (!institutionId || !isInstitutionLifecycleStatus(body.status)) {
      return errorResponse("Los datos de la cohorte no son validos.", 400);
    }
    const result = await updateInstitutionCohort(
      institutionId,
      cohortId,
      body.status
    );
    return noStoreJson(result);
  } catch (error) {
    return errorResponse(
      error instanceof InstitutionAccessError
        ? error.message
        : "No se pudo actualizar la cohorte.",
      error instanceof InstitutionAccessError ? error.status : 500
    );
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function errorResponse(error: string, status: number) {
  return noStoreJson({ error }, { status });
}
function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

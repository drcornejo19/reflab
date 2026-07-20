import { NextResponse } from "next/server";
import {
  assignInstitutionGroupMember,
  updateInstitutionGroupMember,
} from "@/lib/institutional/directory-server";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import { isInstitutionGroupRole } from "@/lib/institutional/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { groupId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = cleanText(body.institutionId);
    const membershipId = cleanText(body.membershipId);
    if (!institutionId || !membershipId || !isInstitutionGroupRole(body.groupRole)) {
      return errorResponse("La asignacion no es valida.", 400);
    }
    const result = await assignInstitutionGroupMember(
      institutionId,
      groupId,
      membershipId,
      body.groupRole
    );
    return noStoreJson(result, { status: 201 });
  } catch (error) {
    return institutionalError(error, "No se pudo asignar la persona al grupo.");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { groupId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = cleanText(body.institutionId);
    const assignmentId = cleanText(body.assignmentId);
    const groupRole =
      body.groupRole === undefined
        ? undefined
        : isInstitutionGroupRole(body.groupRole)
          ? body.groupRole
          : null;
    const status =
      body.status === undefined
        ? undefined
        : body.status === "active" ||
            body.status === "completed" ||
            body.status === "removed"
          ? body.status
          : null;
    if (!institutionId || !assignmentId || groupRole === null || status === null) {
      return errorResponse("La actualizacion no es valida.", 400);
    }
    const result = await updateInstitutionGroupMember(
      institutionId,
      groupId,
      assignmentId,
      { groupRole, status }
    );
    return noStoreJson(result);
  } catch (error) {
    return institutionalError(error, "No se pudo actualizar la asignacion.");
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function institutionalError(error: unknown, fallback: string) {
  return errorResponse(
    error instanceof InstitutionAccessError ? error.message : fallback,
    error instanceof InstitutionAccessError ? error.status : 500
  );
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

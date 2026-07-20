import { NextResponse } from "next/server";
import { createInstitutionGroup } from "@/lib/institutional/directory-server";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import {
  isInstitutionGroupType,
  isInstitutionLifecycleStatus,
} from "@/lib/institutional/types";
import { isSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireInstitutionUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = cleanText(body.institutionId);
    const name = cleanText(body.name);
    if (!institutionId) return errorResponse("Falta la institucion.", 400);
    if (name.length < 3) return errorResponse("Ingresa un nombre valido.", 400);
    if (!isSportType(body.sportType)) {
      return errorResponse("Selecciona una disciplina valida.", 400);
    }
    if (!isInstitutionGroupType(body.groupType)) {
      return errorResponse("Selecciona un tipo de grupo valido.", 400);
    }
    if (!isInstitutionLifecycleStatus(body.status)) {
      return errorResponse("Selecciona un estado valido.", 400);
    }

    const group = await createInstitutionGroup(institutionId, {
      name,
      description: nullableText(body.description),
      cohortId: nullableText(body.cohortId),
      groupType: body.groupType,
      sportType: body.sportType,
      category: nullableText(body.category),
      startsOn: nullableDate(body.startsOn),
      endsOn: nullableDate(body.endsOn),
      status: body.status,
    });
    return noStoreJson({ group }, { status: 201 });
  } catch (error) {
    return errorResponse(
      error instanceof InstitutionAccessError
        ? error.message
        : "No se pudo crear el grupo.",
      error instanceof InstitutionAccessError ? error.status : 500
    );
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function nullableText(value: unknown) {
  return cleanText(value) || null;
}
function nullableDate(value: unknown) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

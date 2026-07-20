import { NextResponse } from "next/server";
import {
  createInstitutionForSuperAdmin,
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import { isInstitutionType } from "@/lib/institutional/types";
import { isSportType, type SportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireInstitutionUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name);
    const institutionType = body.institutionType;
    const enabledSports = Array.isArray(body.enabledSports)
      ? body.enabledSports.filter(isSportType)
      : [];

    if (name.length < 3) {
      return errorResponse("El nombre debe tener al menos 3 caracteres.", 400);
    }

    if (!isInstitutionType(institutionType)) {
      return errorResponse("El tipo de institucion no es valido.", 400);
    }

    if (!enabledSports.length) {
      return errorResponse("Selecciona al menos una disciplina.", 400);
    }

    const institution = await createInstitutionForSuperAdmin({
      name,
      institutionType,
      country: nullableText(body.country),
      provinceState: nullableText(body.provinceState),
      city: nullableText(body.city),
      enabledSports: [...new Set(enabledSports)] as SportType[],
    });

    return NextResponse.json({ institution }, { status: 201 });
  } catch (error) {
    const status = error instanceof InstitutionAccessError ? error.status : 500;
    const message =
      error instanceof InstitutionAccessError
        ? error.message
        : "No se pudo crear la institucion.";
    return errorResponse(message, status);
  }
}

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

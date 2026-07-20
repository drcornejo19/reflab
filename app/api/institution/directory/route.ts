import { NextResponse } from "next/server";
import { getInstitutionDirectory } from "@/lib/institutional/directory-server";
import {
  InstitutionAccessError,
  requireInstitutionPermission,
} from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const institutionId = new URL(request.url).searchParams.get("institutionId");
    const access = await requireInstitutionPermission(
      "institution.read",
      institutionId
    );
    const directory = await getInstitutionDirectory(access);
    return noStoreJson({ directory });
  } catch (error) {
    return institutionalError(error, "No se pudo cargar la gestion institucional.");
  }
}

function institutionalError(error: unknown, fallback: string) {
  return noStoreJson(
    {
      error: error instanceof InstitutionAccessError ? error.message : fallback,
    },
    { status: error instanceof InstitutionAccessError ? error.status : 500 }
  );
}

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

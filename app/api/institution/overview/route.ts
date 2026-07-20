import { NextResponse } from "next/server";
import {
  getInstitutionOverview,
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
    const overview = await getInstitutionOverview(access);

    return NextResponse.json(
      { overview },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    const status = error instanceof InstitutionAccessError ? error.status : 500;
    const message =
      error instanceof InstitutionAccessError
        ? error.message
        : "No se pudo cargar el panel institucional.";

    return NextResponse.json(
      { error: message },
      {
        status,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  }
}

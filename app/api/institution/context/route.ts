import { NextResponse } from "next/server";
import {
  ACTIVE_INSTITUTION_COOKIE,
  getInstitutionAccessForCurrentUser,
  getRequestedInstitutionId,
  InstitutionAccessError,
  selectActiveInstitutionContext,
} from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await getInstitutionAccessForCurrentUser();
    const requestedInstitutionId = await getRequestedInstitutionId();
    const activeContext = selectActiveInstitutionContext(
      access.snapshot,
      requestedInstitutionId
    );

    return noStoreJson({
      ...access.snapshot,
      activeInstitutionId: activeContext?.institution.id ?? null,
    });
  } catch (error) {
    return institutionErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { institutionId?: unknown };
    const institutionId =
      typeof body.institutionId === "string" ? body.institutionId.trim() : "";

    if (!institutionId) {
      return noStoreJson(
        { error: "Selecciona una institucion valida." },
        { status: 400 }
      );
    }

    const access = await getInstitutionAccessForCurrentUser();
    const context = access.snapshot.contexts.find(
      (item) => item.institution.id === institutionId
    );

    if (!context) {
      throw new InstitutionAccessError(
        "No tenes acceso a la institucion seleccionada.",
        403
      );
    }

    if (context.membership?.id) {
      const { error } = await access.supabase
        .from("institution_memberships")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", context.membership.id)
        .eq("user_id", access.userId)
        .eq("institution_id", institutionId);

      if (error) throw new InstitutionAccessError(error.message);
    }

    const response = noStoreJson({
      success: true,
      activeInstitutionId: institutionId,
      context,
    });
    response.cookies.set(ACTIVE_INSTITUTION_COOKIE, institutionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    return institutionErrorResponse(error);
  }
}

function institutionErrorResponse(error: unknown) {
  const status = error instanceof InstitutionAccessError ? error.status : 500;
  const message =
    error instanceof InstitutionAccessError
      ? error.message
      : "No se pudo cargar el contexto institucional.";

  return noStoreJson({ error: message }, { status });
}

function noStoreJson(
  body: unknown,
  init?: { status?: number }
) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

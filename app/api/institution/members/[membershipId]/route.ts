import { NextResponse } from "next/server";
import {
  resendInstitutionInvitation,
  updateInstitutionMember,
} from "@/lib/institutional/directory-server";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import {
  isInstitutionMembershipStatus,
  isInstitutionRoleKey,
} from "@/lib/institutional/types";
import { isSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ membershipId: string }> }
) {
  try {
    await requireInstitutionUserId();
    const { membershipId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = cleanText(body.institutionId);
    if (!institutionId) return errorResponse("Falta la institucion.", 400);

    if (body.action === "resend") {
      const redirectUrl = `${new URL(request.url).origin}/sign-up`;
      const result = await resendInstitutionInvitation(
        institutionId,
        membershipId,
        redirectUrl
      );
      return noStoreJson(result);
    }

    const status =
      body.status === undefined
        ? undefined
        : isInstitutionMembershipStatus(body.status)
          ? body.status
          : null;
    const roleKey =
      body.roleKey === undefined
        ? undefined
        : isInstitutionRoleKey(body.roleKey)
          ? body.roleKey
          : null;
    const primarySport =
      body.primarySport === undefined
        ? undefined
        : isSportType(body.primarySport)
          ? body.primarySport
          : null;

    if (status === null || roleKey === null || primarySport === null) {
      return errorResponse("Los datos de la membresia no son validos.", 400);
    }
    const result = await updateInstitutionMember(institutionId, membershipId, {
      status,
      roleKey,
      primarySport,
      category:
        body.category === undefined ? undefined : nullableText(body.category),
    });
    return noStoreJson(result);
  } catch (error) {
    return institutionalError(error, "No se pudo actualizar la membresia.");
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
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

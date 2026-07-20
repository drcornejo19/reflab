import { NextResponse } from "next/server";
import { inviteInstitutionMember } from "@/lib/institutional/directory-server";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import { isInstitutionRoleKey } from "@/lib/institutional/types";
import { isSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireInstitutionUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = cleanText(body.institutionId);
    const entries = Array.isArray(body.members) ? body.members : [body];

    if (!institutionId) return errorResponse("Falta la institucion.", 400);
    if (!entries.length || entries.length > 25) {
      return errorResponse("Podes importar entre 1 y 25 personas por vez.", 400);
    }

    const redirectUrl = `${new URL(request.url).origin}/sign-up`;
    const parsed = entries.map((entry, index) =>
      parseMemberEntry(entry, index, redirectUrl)
    );
    const results: Array<Record<string, unknown>> = [];

    for (const member of parsed) {
      try {
        const result = await inviteInstitutionMember(institutionId, member);
        results.push({ email: member.email, success: true, ...result });
      } catch (error) {
        if (entries.length === 1) throw error;
        results.push({
          email: member.email,
          success: false,
          error:
            error instanceof InstitutionAccessError
              ? error.message
              : "No se pudo procesar la invitacion.",
        });
      }
    }

    const failed = results.filter((result) => !result.success).length;
    return noStoreJson(
      { results, imported: results.length - failed, failed },
      { status: failed ? 207 : 201 }
    );
  } catch (error) {
    const status = error instanceof InstitutionAccessError ? error.status : 500;
    const message =
      error instanceof InstitutionAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo invitar a la persona.";
    return errorResponse(message, status);
  }
}

function parseMemberEntry(entry: unknown, index: number, redirectUrl: string) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new InstitutionAccessError(`Fila ${index + 1}: formato invalido.`, 400);
  }
  const row = entry as Record<string, unknown>;
  const email = cleanText(row.email).toLowerCase();
  const roleKey = row.roleKey;
  const primarySport = row.primarySport;
  if (!email) {
    throw new InstitutionAccessError(`Fila ${index + 1}: falta el correo.`, 400);
  }
  if (!isInstitutionRoleKey(roleKey)) {
    throw new InstitutionAccessError(`Fila ${index + 1}: rol invalido.`, 400);
  }
  if (!isSportType(primarySport)) {
    throw new InstitutionAccessError(
      `Fila ${index + 1}: disciplina invalida.`,
      400
    );
  }
  return {
    email,
    displayName: nullableText(row.displayName),
    roleKey,
    primarySport,
    category: nullableText(row.category),
    redirectUrl,
  };
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
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

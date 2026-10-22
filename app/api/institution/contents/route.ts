import {
  createInstitutionContent,
  getInstitutionContentWorkspace,
} from "@/lib/institutional/content-server";
import {
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
  parseContentInput,
} from "@/lib/institutional/http";
import { requireInstitutionUserId } from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const institutionId = new URL(request.url).searchParams.get("institutionId");
    const workspace = await getInstitutionContentWorkspace(institutionId);
    return institutionalJson({ workspace });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudieron cargar los contenidos institucionales."
    );
  }
}
export async function POST(request: Request) {
  try {
    await requireInstitutionUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = nullableText(body.institutionId);
    const input = parseContentInput(body);
    const content = await createInstitutionContent(institutionId, input);
    return institutionalJson({ content }, 201);
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo crear el contenido institucional."
    );
  }
}

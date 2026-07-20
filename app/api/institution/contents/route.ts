import {
  createInstitutionContent,
  getInstitutionContentWorkspace,
  type SaveInstitutionContentInput,
} from "@/lib/institutional/content-server";
import {
  asRecord,
  cleanText,
  institutionalErrorResponse,
  institutionalJson,
  nullableDate,
  nullableDateTime,
  nullableText,
  positiveInteger,
  stringArray,
} from "@/lib/institutional/http";
import {
  InstitutionAccessError,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import {
  isInstitutionContentStatus,
  isInstitutionContentType,
  isInstitutionContentVisibility,
  type InstitutionContentMetadata,
} from "@/lib/institutional/types";
import { isSportType } from "@/lib/sports";

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

export function parseContentInput(
  body: Record<string, unknown>
): SaveInstitutionContentInput {
  if (!isSportType(body.sportType)) {
    throw new InstitutionAccessError("Selecciona una disciplina valida.", 400);
  }
  if (!isInstitutionContentType(body.contentType)) {
    throw new InstitutionAccessError("Selecciona un tipo de contenido.", 400);
  }
  if (!isInstitutionContentStatus(body.status)) {
    throw new InstitutionAccessError("Selecciona un estado valido.", 400);
  }
  if (!isInstitutionContentVisibility(body.visibility)) {
    throw new InstitutionAccessError("Selecciona una visibilidad valida.", 400);
  }
  const metadata = asRecord(body.metadata) as InstitutionContentMetadata;

  return {
    sportType: body.sportType,
    contentType: body.contentType,
    title: cleanText(body.title),
    description: nullableText(body.description),
    topic: nullableText(body.topic),
    subtopic: nullableText(body.subtopic),
    ruleReference: nullableText(body.ruleReference),
    difficulty: nullableText(body.difficulty),
    language: cleanText(body.language) || "es",
    validFrom: nullableDate(body.validFrom),
    validUntil: nullableDate(body.validUntil),
    sourceName: nullableText(body.sourceName),
    sourceUrl: nullableText(body.sourceUrl),
    storagePath: nullableText(body.storagePath),
    visibility: body.visibility,
    status: body.status,
    version: positiveInteger(body.version),
    expiresAt: nullableDateTime(body.expiresAt),
    metadata,
    groupIds: stringArray(body.groupIds),
    userIds: stringArray(body.userIds),
    availableFrom: nullableDateTime(body.availableFrom),
    dueAt: nullableDateTime(body.dueAt),
    required: body.required !== false,
  };
}

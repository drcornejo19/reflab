import {
  cleanText,
  institutionalErrorResponse,
  institutionalJson,
  nullableText,
} from "@/lib/institutional/http";
import {
  assertInstitutionWriteAllowed,
  requireInstitutionPermission,
  requireInstitutionUserId,
} from "@/lib/institutional/server";
import {
  buildInstitutionContentStoragePath,
  INSTITUTIONAL_CONTENT_BUCKET,
  validateInstitutionContentUpload,
} from "@/lib/institutional/contentStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireInstitutionUserId();
    const body = (await request.json()) as Record<string, unknown>;
    const authorization = await requireInstitutionPermission(
      "content.manage",
      nullableText(body.institutionId)
    );
    assertInstitutionWriteAllowed(authorization);
    const filename = cleanText(body.filename);
    const mimeType = cleanText(body.mimeType).toLowerCase();
    const size = Number(body.size);
    const { extension } = validateInstitutionContentUpload({
      filename,
      mimeType,
      size,
    });
    const path = buildInstitutionContentStoragePath({
      institutionId: authorization.context.institution.id,
      canonicalUserId: authorization.userId,
      objectId: crypto.randomUUID(),
      extension,
    });
    const { data, error } = await authorization.supabase.storage
      .from(INSTITUTIONAL_CONTENT_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo preparar la carga.");
    }
    return institutionalJson({
      bucket: INSTITUTIONAL_CONTENT_BUCKET,
      path,
      token: data.token,
    });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo preparar la carga del archivo."
    );
  }
}

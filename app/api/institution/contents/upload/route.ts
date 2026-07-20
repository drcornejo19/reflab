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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedMimeTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maximumFileSize = 500 * 1024 * 1024;

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

    if (!filename || !allowedMimeTypes.has(mimeType)) {
      return institutionalJson(
        { error: "El tipo de archivo no esta permitido." },
        400
      );
    }
    if (!Number.isFinite(size) || size <= 0 || size > maximumFileSize) {
      return institutionalJson(
        { error: "El archivo supera el limite permitido de 500 MB." },
        400
      );
    }

    const extension = safeExtension(filename, mimeType);
    const path = `${authorization.context.institution.id}/${authorization.userId}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await authorization.supabase.storage
      .from("institutional-content")
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo preparar la carga.");
    }
    return institutionalJson({
      bucket: "institutional-content",
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

function safeExtension(filename: string, mimeType: string) {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const fallbacks: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return fallbacks[mimeType] ?? "bin";
}

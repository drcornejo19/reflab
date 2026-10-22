import "server-only";

export const INSTITUTIONAL_CONTENT_BUCKET = "institutional-content";
export const MAXIMUM_INSTITUTIONAL_CONTENT_SIZE = 500 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

const contentFormats = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type InstitutionContentMimeType = keyof typeof contentFormats;

export class InstitutionalContentStorageError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InstitutionalContentStorageError";
    this.status = status;
    this.code = code;
  }
}

export function validateInstitutionContentUpload(input: {
  filename: string;
  mimeType: string;
  size: number;
}) {
  const mimeType = input.mimeType.toLowerCase() as InstitutionContentMimeType;
  const extension = contentFormats[mimeType];

  if (!input.filename.trim() || !extension) {
    invalid("El tipo de archivo no esta permitido.");
  }
  if (
    !Number.isInteger(input.size) ||
    input.size <= 0 ||
    input.size > MAXIMUM_INSTITUTIONAL_CONTENT_SIZE
  ) {
    invalid("El archivo supera el limite permitido de 500 MB.");
  }

  return { extension, mimeType };
}

export function buildInstitutionContentStoragePath(input: {
  institutionId: string;
  canonicalUserId: string;
  objectId: string;
  extension: string;
}) {
  if (!UUID_PATTERN.test(input.institutionId)) {
    invalid("La institucion autorizada no es valida.");
  }
  if (!CANONICAL_USER_ID_PATTERN.test(input.canonicalUserId)) {
    invalid("La identidad canonica no es valida.");
  }
  if (!UUID_PATTERN.test(input.objectId)) {
    invalid("El identificador del archivo no es valido.");
  }
  if (!Object.values(contentFormats).includes(input.extension as never)) {
    invalid("La extension del archivo no es valida.");
  }

  return `${input.institutionId}/${input.canonicalUserId}/content/${input.objectId}.${input.extension}`;
}

export function requireInstitutionContentStoragePath(
  storagePath: string,
  institutionId: string
) {
  const path = validateLexicalPath(storagePath);
  const [tenantSegment] = path.split("/");

  if (tenantSegment !== institutionId) {
    throw new InstitutionalContentStorageError(
      403,
      "institution_content_tenant_mismatch",
      "El archivo no pertenece a la institucion autorizada."
    );
  }

  return path;
}

export function requireInstitutionContentUploadPath(input: {
  storagePath: string;
  institutionId: string;
  canonicalUserId: string;
}) {
  const path = requireInstitutionContentStoragePath(
    input.storagePath,
    input.institutionId
  );
  const segments = path.split("/");
  const filename = segments[3] ?? "";

  if (
    segments.length !== 4 ||
    segments[1] !== input.canonicalUserId ||
    segments[2] !== "content" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mp4|mov|webm|pdf|mp3|wav|jpg|png|webp)$/i.test(
      filename
    )
  ) {
    invalid("La referencia del archivo no es valida.");
  }

  return path;
}

function validateLexicalPath(storagePath: string) {
  if (
    !storagePath ||
    storagePath !== storagePath.trim() ||
    storagePath.length > 1024 ||
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.includes("%") ||
    storagePath.includes("?") ||
    storagePath.includes("#") ||
    /[\u0000-\u001f\u007f]/.test(storagePath) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(storagePath)
  ) {
    invalid("La referencia del archivo no es valida.");
  }

  const segments = storagePath.split("/");
  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !SAFE_PATH_SEGMENT_PATTERN.test(segment)
    )
  ) {
    invalid("La referencia del archivo no es valida.");
  }

  return storagePath;
}

function invalid(message: string): never {
  throw new InstitutionalContentStorageError(
    400,
    "invalid_institution_content_storage_path",
    message
  );
}

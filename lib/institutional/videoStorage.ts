import "server-only";

export const INSTITUTIONAL_VIDEO_BUCKET = "institutional-content";
export const MAXIMUM_INSTITUTIONAL_VIDEO_SIZE = 100 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const videoFormats = {
  "video/mp4": { extension: "mp4", signature: "isobmff" },
  "video/quicktime": { extension: "mov", signature: "isobmff" },
  "video/webm": { extension: "webm", signature: "webm" },
} as const;

type InstitutionalVideoMimeType = keyof typeof videoFormats;

export type InstitutionalVideoFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type StorageError = { message?: string } | null;

type InstitutionalVideoBucketClient = {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: string; upsert: false }
  ): Promise<{ error: StorageError }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
};

export type InstitutionalVideoStorageClient = {
  from(bucket: string): InstitutionalVideoBucketClient;
};

export type InstitutionalVideoUpload = {
  storagePath: string;
  originalFilename: string;
  mimeType: InstitutionalVideoMimeType;
  size: number;
};

export class InstitutionalVideoStorageError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InstitutionalVideoStorageError";
    this.status = status;
    this.code = code;
  }
}

export async function uploadInstitutionalVideoWithCompensation<T>(input: {
  storage: InstitutionalVideoStorageClient;
  institutionId: string;
  canonicalUserId: string;
  file: InstitutionalVideoFile;
  persist(upload: InstitutionalVideoUpload): Promise<T>;
  objectId?: string;
  onCleanupFailure?: (error: unknown) => void;
}) {
  const validated = await validateInstitutionalVideoFile(input.file);
  const storagePath = buildInstitutionalVideoStoragePath({
    institutionId: input.institutionId,
    canonicalUserId: input.canonicalUserId,
    objectId: input.objectId ?? crypto.randomUUID(),
    extension: validated.extension,
  });
  const bucket = input.storage.from(INSTITUTIONAL_VIDEO_BUCKET);
  const uploadResult = await bucket.upload(storagePath, validated.bytes, {
    contentType: validated.mimeType,
    upsert: false,
  });

  if (uploadResult.error) {
    throw new InstitutionalVideoStorageError(
      500,
      "institutional_video_upload_failed",
      "No se pudo cargar el video institucional."
    );
  }

  try {
    return await input.persist({
      storagePath,
      originalFilename: validated.originalFilename,
      mimeType: validated.mimeType,
      size: validated.bytes.byteLength,
    });
  } catch (error) {
    const cleanupResult = await bucket.remove([storagePath]);
    if (cleanupResult.error) {
      input.onCleanupFailure?.(cleanupResult.error);
    }
    throw error;
  }
}

export function buildInstitutionalVideoStoragePath(input: {
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
  if (!/^(?:mp4|mov|webm)$/.test(input.extension)) {
    invalid("La extension del video no es valida.");
  }

  return `${input.institutionId}/${input.canonicalUserId}/videos/${input.objectId}.${input.extension}`;
}

async function validateInstitutionalVideoFile(file: InstitutionalVideoFile) {
  const mimeType = file.type.toLowerCase() as InstitutionalVideoMimeType;
  const format = videoFormats[mimeType];
  if (!format) {
    invalid("El tipo de video no esta permitido.");
  }
  if (
    !Number.isInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAXIMUM_INSTITUTIONAL_VIDEO_SIZE
  ) {
    invalid("El video supera el limite permitido de 100 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || !hasExpectedSignature(bytes, format.signature)) {
    invalid("El contenido del archivo no coincide con un video permitido.");
  }

  return {
    bytes,
    extension: format.extension,
    mimeType,
    originalFilename: sanitizeOriginalFilename(file.name, format.extension),
  };
}

function hasExpectedSignature(bytes: Uint8Array, signature: "isobmff" | "webm") {
  if (signature === "webm") {
    return (
      bytes.byteLength >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }

  return (
    bytes.byteLength >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function sanitizeOriginalFilename(filename: string, extension: string) {
  const basename = filename.trim().split(/[\\/]/).pop()?.trim() ?? "";
  return (basename || `video.${extension}`).slice(0, 255);
}

function invalid(message: string): never {
  throw new InstitutionalVideoStorageError(
    400,
    "invalid_institutional_video",
    message
  );
}

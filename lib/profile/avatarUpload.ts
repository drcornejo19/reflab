import "server-only";

import type { User as ClerkBackendUser } from "@clerk/backend";
import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "../access/server.ts";
import { toLegacyPlan } from "../access/catalog.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  toClientProfile,
  type UserProfileRow,
  type UserRoleRow,
} from "../reflabUserRecords.ts";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

type AvatarMimeType = "image/png" | "image/jpeg" | "image/webp";

type AvatarFormat = {
  extension: "png" | "jpg" | "webp";
  mimeType: AvatarMimeType;
};

type AvatarUploadDependencies = {
  createObjectId: () => string;
  loadAccessSnapshot: typeof loadAccessSnapshot;
  logCleanupFailure: (diagnostic: SanitizedAvatarError) => void;
  now: () => Date;
  supabaseUrl: () => string | undefined;
};

export type CanonicalAvatarUploadResult = {
  access: AccessSnapshot;
  avatarUrl: string;
  objectPath: string;
  profile: ReturnType<typeof toClientProfile>;
};

export type SanitizedAvatarError = {
  code: string | null;
  message: string;
};

export class AvatarValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AvatarValidationError";
    this.code = code;
  }
}

export class CanonicalProfileRequiredError extends Error {
  readonly code = "canonical_profile_required";

  constructor() {
    super("El perfil canonico debe existir antes de subir un avatar.");
    this.name = "CanonicalProfileRequiredError";
  }
}

class AvatarOperationError extends Error {
  readonly diagnostic: SanitizedAvatarError;
  readonly operationCode: string;

  constructor(operationCode: string, message: string, cause: unknown) {
    super(message);
    this.name = "AvatarOperationError";
    this.operationCode = operationCode;
    this.diagnostic = sanitizeAvatarError(cause, operationCode);
  }
}

const defaultDependencies: AvatarUploadDependencies = {
  createObjectId: () => crypto.randomUUID(),
  loadAccessSnapshot,
  logCleanupFailure: (diagnostic) => {
    console.warn("[profile.avatar.cleanup]", diagnostic);
  },
  now: () => new Date(),
  supabaseUrl: () => process.env.NEXT_PUBLIC_SUPABASE_URL,
};

export async function uploadCanonicalAvatar(
  supabase: SupabaseAdminClient,
  externalUserId: string,
  clerkUser: ClerkBackendUser,
  avatar: File,
  dependencies: AvatarUploadDependencies = defaultDependencies
): Promise<CanonicalAvatarUploadResult> {
  const access = await dependencies.loadAccessSnapshot(
    supabase,
    externalUserId,
    { provisionMissing: false }
  );
  const profileResult = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", access.userId)
    .maybeSingle();

  if (profileResult.error) {
    throw new AvatarOperationError(
      "profile_read_failed",
      "No se pudo leer el perfil canonico.",
      profileResult.error
    );
  }

  const existingProfile = profileResult.data as UserProfileRow | null;
  if (!existingProfile) throw new CanonicalProfileRequiredError();

  const format = await validateAvatarFile(avatar);
  const objectPath = createAvatarObjectPath(
    access.userId,
    dependencies.createObjectId(),
    format.extension
  );
  const storage = supabase.storage.from(AVATAR_BUCKET);
  const uploadResult = await storage.upload(objectPath, avatar, {
    cacheControl: "3600",
    contentType: format.mimeType,
    upsert: false,
  });

  if (uploadResult.error) {
    throw new AvatarOperationError(
      "avatar_upload_failed",
      "No se pudo subir la foto.",
      uploadResult.error
    );
  }

  const publicUrlResult = storage.getPublicUrl(objectPath);
  const avatarUrl = publicUrlResult.data?.publicUrl;
  if (!avatarUrl) {
    await removeUploadedObject(
      storage,
      objectPath,
      dependencies.logCleanupFailure
    );
    throw new AvatarOperationError(
      "avatar_public_url_failed",
      "No se pudo generar la URL publica del avatar.",
      { message: "Storage did not return a public URL." }
    );
  }

  const updateResult = await supabase
    .from("user_profiles")
    .update({
      avatar_url: avatarUrl,
      updated_at: dependencies.now().toISOString(),
    })
    .eq("user_id", access.userId)
    .select("*")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    await removeUploadedObject(
      storage,
      objectPath,
      dependencies.logCleanupFailure
    );
    throw new AvatarOperationError(
      "profile_avatar_update_failed",
      "La foto subio, pero no se pudo actualizar el perfil.",
      updateResult.error ?? { message: "Canonical profile update returned no row." }
    );
  }

  const previousObjectPath = getOwnedAvatarObjectPath(
    existingProfile.avatar_url,
    access.userId,
    dependencies.supabaseUrl()
  );
  if (previousObjectPath && previousObjectPath !== objectPath) {
    await removeUploadedObject(
      storage,
      previousObjectPath,
      dependencies.logCleanupFailure
    );
  }

  const canonicalRole: UserRoleRow = {
    user_id: access.userId,
    role:
      access.globalRole === "super_admin"
        ? "super_admin"
        : "individual_referee",
    subscription_plan: toLegacyPlan(access.effectiveIndividualPlan),
    institution_id: (updateResult.data as UserProfileRow).institution_id ?? null,
  };

  return {
    access,
    avatarUrl,
    objectPath,
    profile: toClientProfile(
      updateResult.data as UserProfileRow,
      canonicalRole,
      clerkUser
    ),
  };
}

export async function createAvatarUploadResponse(
  upload: () => Promise<CanonicalAvatarUploadResult>,
  logError: (diagnostic: SanitizedAvatarError) => void = (diagnostic) => {
    console.error("[profile.avatar]", diagnostic);
  }
) {
  try {
    const result = await upload();
    return Response.json({
      success: true,
      avatarUrl: result.avatarUrl,
      profile: result.profile,
    });
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    if (error instanceof AvatarValidationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    if (error instanceof CanonicalProfileRequiredError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 409 }
      );
    }

    const diagnostic = sanitizeAvatarError(error);
    logError(diagnostic);
    return Response.json(
      {
        error: "No se pudo guardar la foto.",
        code:
          error instanceof AvatarOperationError
            ? error.operationCode
            : diagnostic.code,
      },
      { status: 500 }
    );
  }
}

export async function validateAvatarFile(file: File): Promise<AvatarFormat> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new AvatarValidationError(
      "avatar_too_large",
      "La imagen supera el limite de 5 MB."
    );
  }

  const declaredFormat = formatForMimeType(file.type);
  if (!declaredFormat) {
    throw new AvatarValidationError(
      "avatar_mime_not_allowed",
      "Formato no permitido. Usa PNG, JPG o WebP."
    );
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedFormat = detectAvatarFormat(header);
  if (!detectedFormat) {
    throw new AvatarValidationError(
      "avatar_signature_invalid",
      "La firma del archivo no corresponde a una imagen permitida."
    );
  }

  if (declaredFormat.mimeType !== detectedFormat.mimeType) {
    throw new AvatarValidationError(
      "avatar_mime_mismatch",
      "El tipo declarado no coincide con el contenido de la imagen."
    );
  }

  return detectedFormat;
}

export function createAvatarObjectPath(
  canonicalUserId: string,
  objectId: string,
  extension: AvatarFormat["extension"]
) {
  const normalizedUserId = canonicalUserId.trim();
  if (!normalizedUserId || normalizedUserId.length > 255) {
    throw new Error("Canonical user ID is invalid for avatar storage.");
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(objectId)) {
    throw new Error("Avatar object ID is invalid.");
  }

  return `${encodeURIComponent(normalizedUserId)}/${objectId}.${extension}`;
}

export function getOwnedAvatarObjectPath(
  avatarUrl: string | null | undefined,
  canonicalUserId: string,
  supabaseUrl: string | undefined
) {
  if (!avatarUrl || !supabaseUrl) return null;

  try {
    const candidateUrl = new URL(avatarUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    if (
      candidateUrl.origin !== expectedOrigin ||
      !candidateUrl.pathname.startsWith(marker)
    ) {
      return null;
    }

    const objectPath = decodeURIComponent(candidateUrl.pathname.slice(marker.length));
    const expectedPrefix = `${canonicalUserId}/`;
    if (!objectPath.startsWith(expectedPrefix)) return null;

    const fileName = objectPath.slice(expectedPrefix.length);
    if (
      !fileName ||
      fileName.includes("/") ||
      fileName === "." ||
      fileName === ".." ||
      !/^[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(fileName)
    ) {
      return null;
    }

    return objectPath;
  } catch {
    return null;
  }
}

export function sanitizeAvatarError(
  error: unknown,
  fallbackCode: string | null = null
): SanitizedAvatarError {
  if (error instanceof AvatarOperationError) return error.diagnostic;

  const code = sanitizeErrorCode(readErrorField(error, "code")) ?? fallbackCode;
  const rawMessage =
    error instanceof Error
      ? error.message
      : readErrorField(error, "message") ?? "Error desconocido al guardar el avatar.";

  return {
    code,
    message: rawMessage
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
      .replace(/\buser_[A-Za-z0-9_-]+\b/g, "[redacted-user]")
      .slice(0, 300),
  };
}

function formatForMimeType(mimeType: string): AvatarFormat | null {
  if (mimeType === "image/png") return { extension: "png", mimeType };
  if (mimeType === "image/jpeg") return { extension: "jpg", mimeType };
  if (mimeType === "image/webp") return { extension: "webp", mimeType };
  return null;
}

function detectAvatarFormat(bytes: Uint8Array): AvatarFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

async function removeUploadedObject(
  storage: ReturnType<SupabaseAdminClient["storage"]["from"]>,
  objectPath: string,
  logCleanupFailure: AvatarUploadDependencies["logCleanupFailure"]
) {
  const removalResult = await storage.remove([objectPath]);
  if (removalResult.error) {
    logCleanupFailure(
      sanitizeAvatarError(removalResult.error, "avatar_cleanup_failed")
    );
    return false;
  }
  return true;
}

function readErrorField(error: unknown, field: string) {
  if (typeof error !== "object" || error === null) return null;
  const value = Reflect.get(error, field);
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
}

function sanitizeErrorCode(code: string | null) {
  if (!code) return null;
  const sanitized = code.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return sanitized || null;
}

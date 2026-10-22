import "server-only";

import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { loadAccessSnapshot } from "@/lib/access/server";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createSupabaseAdminClient as createAdminClient } from "@/lib/supabaseAdmin";
import {
  resolveCanonicalCoachIdentity,
  type CoachIdentityDependencies,
} from "@/lib/coach/canonicalIdentity";
import type { CoachFeature } from "@/lib/coach/types";
import {
  CoachRateLimitError,
  CoachSetupError,
  CoachUnauthorizedError,
  CoachValidationError,
} from "@/lib/coach/errors";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type CoachRequestContext = {
  userId: string;
  requestId: string;
  supabase: SupabaseAdminClient;
};

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_SECONDS = 10 * 60;

export async function prepareCoachRequest(
  request: Request,
  feature: CoachFeature,
  dependencies: CoachIdentityDependencies<SupabaseAdminClient> =
    createCoachRequestDependencies()
): Promise<CoachRequestContext> {
  const identity = await resolveCanonicalCoachIdentity(dependencies);
  if (!identity) throw new CoachUnauthorizedError();

  const requestId = normalizeRequestId(request.headers.get("x-request-id"));
  await enforceCoachRateLimit(identity.client, identity.userId, feature);

  return {
    userId: identity.userId,
    requestId,
    supabase: identity.client,
  };
}

function createCoachRequestDependencies(): CoachIdentityDependencies<SupabaseAdminClient> {
  return {
    getAuthenticatedUserId: async () => (await auth()).userId,
    createAdminClient,
    loadAccess: (supabase, externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, {
        provisionMissing: false,
      }),
  };
}

export async function readCoachJson(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new CoachValidationError("La solicitud debe usar contenido JSON.");
  }

  const maxBytes = positiveIntegerFromEnv(
    process.env.COACH_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES
  );
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new CoachValidationError("La solicitud supera el tamano permitido.");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new CoachValidationError("La solicitud supera el tamano permitido.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CoachValidationError("El contenido JSON no es valido.");
  }
}

async function enforceCoachRateLimit(
  supabase: SupabaseAdminClient,
  userId: string,
  feature: CoachFeature
) {
  const requestLimit = positiveIntegerFromEnv(
    process.env.COACH_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT
  );
  const windowSeconds = positiveIntegerFromEnv(
    process.env.COACH_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_RATE_WINDOW_SECONDS
  );

  const { data, error } = await supabase.rpc("consume_coach_rate_limit", {
    p_user_id: userId,
    p_feature: feature,
    p_request_limit: requestLimit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    throw new CoachSetupError(`Coach rate limiter unavailable: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.allowed !== true) {
    const retryAfterSeconds = Math.max(
      1,
      Number(row?.retry_after_seconds ?? windowSeconds)
    );
    throw new CoachRateLimitError(retryAfterSeconds);
  }
}

function normalizeRequestId(value: string | null) {
  if (value && /^[a-zA-Z0-9._:-]{8,100}$/.test(value)) return value;
  return randomUUID();
}

function positiveIntegerFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

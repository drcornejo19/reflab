import "server-only";

import { NextResponse } from "next/server";
import { IdentityLinkRequiredError } from "@/lib/access/server";

export type CoachErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "SETUP_REQUIRED"
  | "EVIDENCE_NOT_FOUND"
  | "MODEL_UNAVAILABLE"
  | "AUDIT_FAILED";

export class CoachError extends Error {
  constructor(
    public readonly code: CoachErrorCode,
    public readonly status: number,
    public readonly publicMessage: string,
    message = publicMessage,
    public readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "CoachError";
  }
}

export class CoachUnauthorizedError extends CoachError {
  constructor() {
    super(
      "UNAUTHORIZED",
      401,
      "Necesitas iniciar sesion para usar RefLab Coach."
    );
  }
}

export class CoachValidationError extends CoachError {
  constructor(publicMessage: string, message = publicMessage) {
    super("INVALID_REQUEST", 400, publicMessage, message);
  }
}

export class CoachRateLimitError extends CoachError {
  constructor(retryAfterSeconds: number) {
    super(
      "RATE_LIMITED",
      429,
      "Alcanzaste temporalmente el limite de RefLab Coach. Intenta nuevamente en unos minutos.",
      "Coach rate limit exceeded.",
      retryAfterSeconds
    );
  }
}

export class CoachSetupError extends CoachError {
  constructor(message: string) {
    super(
      "SETUP_REQUIRED",
      503,
      "RefLab Coach necesita completar su configuracion segura antes de responder.",
      message
    );
  }
}

export class CoachEvidenceError extends CoachError {
  constructor(message: string) {
    super(
      "EVIDENCE_NOT_FOUND",
      422,
      "No pudimos verificar la evidencia necesaria para esta devolucion.",
      message
    );
  }
}

export class CoachProviderError extends CoachError {
  constructor(message: string) {
    super(
      "MODEL_UNAVAILABLE",
      502,
      "RefLab Coach no esta disponible en este momento. Intenta nuevamente mas tarde.",
      message
    );
  }
}

export function coachErrorResponse(error: unknown, requestId?: string) {
  if (error instanceof IdentityLinkRequiredError) {
    return NextResponse.json(
      {
        error: "identity_link_required",
        code: "IDENTITY_LINK_REQUIRED",
        requestId: requestId ?? null,
        setupRequired: false,
        retryAfterSeconds: null,
      },
      { status: 409 }
    );
  }

  const coachError =
    error instanceof CoachError
      ? error
      : new CoachProviderError(
          error instanceof Error ? error.message : "Unknown Coach error."
        );

  console.error("REFLAB_COACH_ERROR", {
    requestId: requestId ?? null,
    code: coachError.code,
    message: coachError.message,
  });

  const headers = new Headers();
  if (coachError.retryAfterSeconds) {
    headers.set("Retry-After", String(coachError.retryAfterSeconds));
  }

  return NextResponse.json(
    {
      error: coachError.publicMessage,
      code: coachError.code,
      requestId: requestId ?? null,
      setupRequired: coachError.code === "SETUP_REQUIRED",
      retryAfterSeconds: coachError.retryAfterSeconds,
    },
    { status: coachError.status, headers }
  );
}

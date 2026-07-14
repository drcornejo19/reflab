import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeSportType } from "@/lib/sports";
import {
  getSportsProviderHealth,
  SportsProviderConfigError,
  SportsProviderRequestError,
} from "@/lib/sports-data/provider";

export async function requireSportsUser() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function parseSportTypeParam(value: string | null) {
  return normalizeSportType(value);
}

export function buildSportsProviderMeta() {
  const health = getSportsProviderHealth();
  return {
    provider: health.provider,
    configured: health.configured,
    missingVariables: health.missingVariables,
  };
}

export function buildSportsErrorResponse(error: unknown) {
  if (error instanceof SportsProviderConfigError) {
    return NextResponse.json(
      {
        error: error.message,
        provider: error.provider,
        missingVariables: error.missingVariables,
      },
      { status: 503 }
    );
  }

  if (error instanceof SportsProviderRequestError) {
    return NextResponse.json(
      {
        error: error.message,
        provider: error.provider,
        retryAfterSeconds: error.retryAfterSeconds ?? null,
      },
      { status: error.statusCode ?? 502 }
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "No se pudo consultar el proveedor deportivo.",
    },
    { status: 500 }
  );
}

export function requiredParam(
  value: string | null,
  field: string
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Falta el parametro ${field}.`);
  }
  return normalized;
}

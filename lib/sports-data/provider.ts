import "server-only";

import { ApiFootballProvider } from "@/lib/sports-data/api-football";
import type {
  SportsApiProviderId,
  SportsDataProvider,
  SportsProviderConfig,
  SportsProviderHealth,
} from "@/lib/sports-data/types";

const supportedSportsProviders = new Set<SportsApiProviderId>([
  "api_football",
  "sportmonks",
  "football_data",
]);

export class SportsProviderConfigError extends Error {
  constructor(
    public readonly provider: SportsApiProviderId,
    public readonly missingVariables: string[]
  ) {
    super(
      missingVariables.length
        ? `Faltan variables de entorno para ${provider}: ${missingVariables.join(", ")}`
        : `La configuracion del proveedor ${provider} no es valida.`
    );
    this.name = "SportsProviderConfigError";
  }
}

export class SportsProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly provider: SportsApiProviderId,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "SportsProviderRequestError";
  }
}

export function getSelectedSportsProviderId(): SportsApiProviderId {
  const envValue = process.env.SPORTS_API_PROVIDER?.trim();
  if (envValue && supportedSportsProviders.has(envValue as SportsApiProviderId)) {
    return envValue as SportsApiProviderId;
  }
  return "api_football";
}

export function getSportsProviderHealth(): SportsProviderHealth {
  const provider = getSelectedSportsProviderId();
  const missingVariables: string[] = [];

  if (!process.env.SPORTS_API_TOKEN?.trim()) {
    missingVariables.push("SPORTS_API_TOKEN");
  }
  if (!process.env.SPORTS_API_BASE_URL?.trim()) {
    missingVariables.push("SPORTS_API_BASE_URL");
  }

  return {
    provider,
    configured: missingVariables.length === 0,
    missingVariables,
  };
}

export function getSportsProviderConfig(): SportsProviderConfig {
  const health = getSportsProviderHealth();
  if (!health.configured) {
    throw new SportsProviderConfigError(health.provider, health.missingVariables);
  }

  return {
    provider: health.provider,
    token: process.env.SPORTS_API_TOKEN!.trim(),
    baseUrl: process.env.SPORTS_API_BASE_URL!.trim().replace(/\/+$/, ""),
  };
}

export function getSportsProvider(): SportsDataProvider {
  const config = getSportsProviderConfig();

  if (config.provider === "api_football") {
    return new ApiFootballProvider(config);
  }

  throw new SportsProviderConfigError(config.provider, [
    "SPORTS_API_PROVIDER (solo api_football esta implementado por ahora)",
  ]);
}

export function tryGetSportsProvider() {
  try {
    return getSportsProvider();
  } catch (error) {
    if (
      error instanceof SportsProviderConfigError ||
      error instanceof SportsProviderRequestError
    ) {
      return null;
    }
    throw error;
  }
}

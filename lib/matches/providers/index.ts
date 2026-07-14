import {
  matchProviderDescriptors,
  type MatchProviderCapability,
  type MatchProviderDescriptor,
  type MatchProviderId,
} from "@/lib/matches/providers/types";

export type MatchProviderReadiness = MatchProviderDescriptor & {
  enabled: boolean;
  readinessLabel: "Listo" | "Configuracion pendiente" | "Manual";
  reason: string;
};

export function getMatchProviderDescriptors() {
  return [...matchProviderDescriptors];
}

export function getMatchProviderDescriptor(providerId: MatchProviderId) {
  return matchProviderDescriptors.find((item) => item.id === providerId) ?? null;
}

export function getProvidersForCapability(
  capability: keyof MatchProviderCapability
) {
  return matchProviderDescriptors.filter((item) =>
    Boolean(item.capabilities[capability])
  );
}

export function getMatchProviderReadiness(): MatchProviderReadiness[] {
  const selectedProvider = process.env.SPORTS_API_PROVIDER?.trim() || "api_football";
  const hasSportsToken = Boolean(process.env.SPORTS_API_TOKEN?.trim());
  const hasSportsBaseUrl = Boolean(process.env.SPORTS_API_BASE_URL?.trim());

  return matchProviderDescriptors.map((descriptor) => {
    if (descriptor.id === "manual_assisted") {
      return {
        ...descriptor,
        enabled: true,
        readinessLabel: "Manual",
        reason: "Disponible sin integracion externa.",
      };
    }

    if (descriptor.id === "institutional") {
      return {
        ...descriptor,
        enabled: true,
        readinessLabel: "Listo",
        reason: "Se alimenta con carga confirmada por la institucion.",
      };
    }

    const enabledForEnvironment =
      descriptor.id === selectedProvider && hasSportsToken && hasSportsBaseUrl;

    return {
      ...descriptor,
      enabled: enabledForEnvironment,
      readinessLabel: enabledForEnvironment ? "Listo" : "Configuracion pendiente",
      reason: enabledForEnvironment
        ? "El proveedor deportivo esta listo para sincronizar datos desde servidor."
        : descriptor.id === selectedProvider
          ? "Faltan SPORTS_API_TOKEN o SPORTS_API_BASE_URL para activar el proveedor seleccionado."
          : "El proveedor no esta seleccionado actualmente en SPORTS_API_PROVIDER.",
    };
  });
}

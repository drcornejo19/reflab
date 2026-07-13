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

    const hasKey =
      descriptor.id === "football_data"
        ? Boolean(process.env.FOOTBALL_DATA_API_KEY)
        : descriptor.id === "sportmonks"
          ? Boolean(process.env.SPORTMONKS_API_KEY)
          : Boolean(process.env.API_FOOTBALL_API_KEY);

    return {
      ...descriptor,
      enabled: hasKey,
      readinessLabel: hasKey ? "Listo" : "Configuracion pendiente",
      reason: hasKey
        ? "El proveedor tiene credenciales configuradas."
        : "Falta aprobacion o credencial para activar este proveedor.",
    };
  });
}

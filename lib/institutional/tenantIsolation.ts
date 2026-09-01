import type {
  InstitutionAccessSnapshot,
  InstitutionContext,
} from "./types.ts";

export class InstitutionTenantAccessError extends Error {
  readonly status = 403;

  constructor() {
    super("No tenes acceso a la institucion seleccionada.");
    this.name = "InstitutionTenantAccessError";
  }
}

export function selectActiveInstitutionContext(
  snapshot: InstitutionAccessSnapshot,
  requestedInstitutionId?: string | null
) {
  if (!snapshot.contexts.length) return null;

  if (requestedInstitutionId !== undefined && requestedInstitutionId !== null) {
    const requestedId = requestedInstitutionId.trim();
    return (
      snapshot.contexts.find(
        (context) => context.institution.id === requestedId
      ) ?? null
    );
  }

  if (snapshot.activeInstitutionId) {
    const activeContext = snapshot.contexts.find(
      (context) => context.institution.id === snapshot.activeInstitutionId
    );
    if (activeContext) return activeContext;
  }

  return snapshot.contexts[0] ?? null;
}

export function requireAuthorizedInstitutionContext(
  snapshot: InstitutionAccessSnapshot,
  requestedInstitutionId?: string | null
): InstitutionContext {
  const context = selectActiveInstitutionContext(
    snapshot,
    requestedInstitutionId
  );
  if (!context) throw new InstitutionTenantAccessError();
  return context;
}

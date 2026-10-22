import "server-only";

import { loadCanonicalAccessSnapshot } from "../access/server.ts";
import type {
  AccessSnapshot,
  GlobalRoleKey,
  IndividualPlanKey,
} from "../access/types.ts";
import type { SystemRole } from "../institutionalRoles.ts";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import {
  isSubscriptionPlan,
  toCanonicalSubscriptionPlan,
  type SubscriptionPlan,
} from "../subscription.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type MutationBody = {
  userId?: unknown;
  role?: unknown;
  subscriptionPlan?: unknown;
  reason?: unknown;
};

export type CanonicalAdminMutation = {
  targetUserId: string;
  role: GlobalRoleKey | null;
  plan: IndividualPlanKey | null;
  reason: string | null;
};

type MutationDependencies = {
  loadTargetAccess: (
    supabase: SupabaseAdminClient,
    userId: string,
    options: { provisionMissing: false }
  ) => Promise<AccessSnapshot>;
};

const defaultDependencies: MutationDependencies = {
  loadTargetAccess: loadCanonicalAccessSnapshot,
};

const editableGlobalRoles = new Set<SystemRole>([
  "super_admin",
  "individual_referee",
]);

export class AdminUsersMutationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AdminUsersMutationError";
    this.code = code;
    this.status = status;
  }
}

export function parseCanonicalAdminUserMutation(
  body: MutationBody
): CanonicalAdminMutation {
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  if (
    !targetUserId ||
    targetUserId !== targetUserId.trim() ||
    targetUserId.length > 255
  ) {
    throw new AdminUsersMutationError(
      "invalid_target_user",
      "Usuario canonico invalido.",
      400
    );
  }

  let role: GlobalRoleKey | null = null;
  if (body.role !== undefined) {
    if (
      typeof body.role !== "string" ||
      !editableGlobalRoles.has(body.role as SystemRole)
    ) {
      throw new AdminUsersMutationError(
        "invalid_global_role",
        "El rol global seleccionado no es valido.",
        400
      );
    }
    role = body.role === "super_admin" ? "super_admin" : "referee";
  }

  let plan: IndividualPlanKey | null = null;
  if (body.subscriptionPlan !== undefined) {
    if (
      typeof body.subscriptionPlan !== "string" ||
      !isSubscriptionPlan(body.subscriptionPlan)
    ) {
      throw new AdminUsersMutationError(
        "invalid_individual_plan",
        "Plan invalido.",
        400
      );
    }
    plan = toCanonicalSubscriptionPlan(
      body.subscriptionPlan as SubscriptionPlan
    );
  }

  if (role === null && plan === null) {
    throw new AdminUsersMutationError(
      "empty_admin_mutation",
      "No hay cambios para guardar.",
      400
    );
  }

  let reason: string | null = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== "string") {
      throw new AdminUsersMutationError(
        "invalid_change_reason",
        "Motivo invalido.",
        400
      );
    }
    reason = body.reason.trim() || null;
    if (reason && reason.length > 500) {
      throw new AdminUsersMutationError(
        "invalid_change_reason",
        "El motivo no puede superar 500 caracteres.",
        400
      );
    }
  }

  return { targetUserId, role, plan, reason };
}

export async function applyCanonicalAdminUserMutation(
  supabase: SupabaseAdminClient,
  actorUserId: string,
  mutation: CanonicalAdminMutation,
  dependencies: MutationDependencies = defaultDependencies
) {
  let current: AccessSnapshot;
  try {
    current = await dependencies.loadTargetAccess(
      supabase,
      mutation.targetUserId,
      { provisionMissing: false }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Canonical access records are missing."
    ) {
      throw new AdminUsersMutationError(
        "canonical_target_not_found",
        "El usuario canonico no existe o esta incompleto.",
        404
      );
    }
    throw error;
  }
  const roleChanged =
    mutation.role !== null && mutation.role !== current.globalRole;
  const planChanged =
    mutation.plan !== null && mutation.plan !== current.individualPlan;

  if (!roleChanged && !planChanged) {
    return { status: "unchanged" as const, access: current };
  }

  if (roleChanged && planChanged) {
    throw new AdminUsersMutationError(
      "multiple_access_changes",
      "Cambia el rol o el plan en una operacion por vez.",
      409
    );
  }

  if (
    roleChanged &&
    mutation.targetUserId === actorUserId &&
    mutation.role !== "super_admin"
  ) {
    throw new AdminUsersMutationError(
      "self_demotion_forbidden",
      "No podes quitarte tu propio acceso Super Admin.",
      409
    );
  }

  if (planChanged) {
    const result = await supabase.rpc("admin_set_canonical_user_plan", {
      p_actor_user_id: actorUserId,
      p_target_user_id: mutation.targetUserId,
      p_plan_key: mutation.plan,
      p_reason: mutation.reason,
    });
    if (result.error) throw result.error;
  } else {
    const result = await supabase.rpc("admin_set_canonical_global_role", {
      p_actor_user_id: actorUserId,
      p_target_user_id: mutation.targetUserId,
      p_role_key: mutation.role,
      p_reason: mutation.reason,
    });
    if (result.error) throw result.error;
  }

  const updated = await dependencies.loadTargetAccess(
    supabase,
    mutation.targetUserId,
    { provisionMissing: false }
  );

  if (planChanged && updated.individualPlan !== mutation.plan) {
    throw new AdminUsersMutationError(
      "plan_persistence_mismatch",
      "La base no confirmo el plan solicitado.",
      500
    );
  }
  if (roleChanged && updated.globalRole !== mutation.role) {
    throw new AdminUsersMutationError(
      "role_persistence_mismatch",
      "La base no confirmo el rol solicitado.",
      500
    );
  }

  return { status: "updated" as const, access: updated };
}

export function sanitizeAdminUsersMutationError(error: unknown) {
  if (error instanceof AdminUsersMutationError) {
    return { code: error.code, message: error.message, status: error.status };
  }

  const record = asRecord(error);
  const code = safeText(record?.code);
  const message = redactSensitiveText(
    error instanceof Error
      ? error.message
      : safeText(record?.message) ?? "Error de escritura administrativa."
  );

  return {
    code,
    message,
    status: statusForDatabaseCode(code),
  };
}

export function publicAdminUsersMutationError(error: unknown) {
  if (error instanceof AdminUsersMutationError) {
    return { error: error.message, status: error.status };
  }

  const diagnostic = sanitizeAdminUsersMutationError(error);
  const publicMessage =
    diagnostic.status === 400
      ? "Los datos enviados no son validos."
      : diagnostic.status === 403
        ? "No tenes permisos para realizar este cambio."
        : diagnostic.status === 404
          ? "El usuario canonico no existe o esta incompleto."
          : diagnostic.status === 503
            ? "La administracion de accesos no esta disponible."
            : "No se pudo guardar el usuario.";

  return { error: publicMessage, status: diagnostic.status };
}

function statusForDatabaseCode(code: string | null) {
  if (code === "22023") return 400;
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "55000") return 503;
  return 500;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redactSensitiveText(value: string) {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .slice(0, 500);
}

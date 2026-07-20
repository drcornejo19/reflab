import "server-only";

import { writeInstitutionAuditLog } from "@/lib/institutional/audit-server";
import {
  defaultInstitutionRolePermissions,
  institutionRoleLabels,
} from "@/lib/institutional/permissions";
import {
  InstitutionAccessError,
  requireInstitutionPermission,
} from "@/lib/institutional/server";
import {
  isInstitutionRoleKey,
  type InstitutionDemoWorkspace,
  type InstitutionRoleKey,
} from "@/lib/institutional/types";

const demoRoles = [
  "student",
  "referee",
  "instructor",
  "technical_coordinator",
  "institution_admin",
] as const satisfies readonly InstitutionRoleKey[];

export async function getInstitutionDemoWorkspace(
  explicitInstitutionId?: string | null
): Promise<InstitutionDemoWorkspace> {
  const authorization = await requireInstitutionPermission(
    "demo.switch",
    explicitInstitutionId
  );
  const { data, error } = await authorization.supabase
    .from("institution_demo_sessions")
    .select("simulated_role_key,expires_at,status")
    .eq("institution_id", authorization.context.institution.id)
    .eq("user_id", authorization.userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new InstitutionAccessError(error.message);
  const simulatedRole =
    data && isInstitutionRoleKey(data.simulated_role_key)
      ? data.simulated_role_key
      : null;

  return {
    institution: authorization.context.institution,
    active: Boolean(simulatedRole),
    simulatedRole,
    expiresAt: data?.expires_at ? String(data.expires_at) : null,
    availableRoles: demoRoles.map((role) => ({
      key: role,
      label: institutionRoleLabels[role],
      permissionCount: defaultInstitutionRolePermissions[role].length,
    })),
  };
}

export async function startInstitutionDemoSession(
  simulatedRole: InstitutionRoleKey,
  explicitInstitutionId?: string | null
) {
  const authorization = await requireInstitutionPermission(
    "demo.switch",
    explicitInstitutionId
  );
  if (!authorization.context.institution.isDemo) {
    throw new InstitutionAccessError(
      "El modo demo solo puede activarse en una institucion identificada como demo.",
      409
    );
  }
  if (!demoRoles.includes(simulatedRole as (typeof demoRoles)[number])) {
    throw new InstitutionAccessError(
      "Selecciona un rol disponible para la demostracion.",
      400
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  await authorization.supabase
    .from("institution_demo_sessions")
    .update({
      status: "ended",
      ended_at: now.toISOString(),
    })
    .eq("institution_id", authorization.context.institution.id)
    .eq("user_id", authorization.userId)
    .eq("status", "active");

  const { data, error } = await authorization.supabase
    .from("institution_demo_sessions")
    .insert({
      institution_id: authorization.context.institution.id,
      user_id: authorization.userId,
      simulated_role_key: simulatedRole,
      status: "active",
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      metadata: {
        source: "institution_demo_panel",
        read_only: true,
      },
    })
    .select("id,simulated_role_key,expires_at")
    .single();
  if (error || !data) {
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo iniciar el modo demo."
    );
  }

  await writeInstitutionAuditLog(authorization, {
    action: "demo.started",
    entityType: "institution_demo_session",
    entityId: String(data.id),
    afterState: {
      simulatedRole,
      expiresAt: data.expires_at,
    },
  });
  return {
    active: true,
    simulatedRole,
    expiresAt: String(data.expires_at),
  };
}

export async function endInstitutionDemoSession(
  explicitInstitutionId?: string | null
) {
  const authorization = await requireInstitutionPermission(
    "demo.switch",
    explicitInstitutionId
  );
  const now = new Date().toISOString();
  const { data, error } = await authorization.supabase
    .from("institution_demo_sessions")
    .update({
      status: "ended",
      ended_at: now,
    })
    .eq("institution_id", authorization.context.institution.id)
    .eq("user_id", authorization.userId)
    .eq("status", "active")
    .select("id");
  if (error) throw new InstitutionAccessError(error.message);

  await writeInstitutionAuditLog(authorization, {
    action: "demo.ended",
    entityType: "institution_demo_session",
    entityId: data?.[0]?.id ? String(data[0].id) : null,
  });
  return { active: false };
}

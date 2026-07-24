import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function requireSuperAdminAccess() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
      userId: null as never,
      usedRecovery: false,
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const roleResult = await supabase
      .from("user_global_roles")
      .select("role_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleResult.error) throw roleResult.error;

    if (roleResult.data?.role_key === "super_admin") {
      return {
        response: null,
        supabase,
        userId,
        usedRecovery: false,
      };
    }

    if (await canUseEmergencyRecovery(userId)) {
      const auditResult = await supabase.from("institution_audit_logs").insert({
        actor_user_id: userId,
        action: "security.super_admin_recovery.used",
        entity_type: "platform_access",
        entity_id: userId,
        target_user_id: userId,
        scope_type: "global",
        metadata: {
          recovery_enabled: true,
          source: "server_environment",
        },
      });

      if (auditResult.error) throw auditResult.error;

      return {
        response: null,
        supabase,
        userId,
        usedRecovery: true,
      };
    }

    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
      userId,
      usedRecovery: false,
    };
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          error: "No se pudo validar el acceso administrativo.",
          technical: getErrorMessage(error),
        },
        { status: 500 }
      ),
      supabase: null as never,
      userId,
      usedRecovery: false,
    };
  }
}

async function canUseEmergencyRecovery(userId: string) {
  if (process.env.REFLAB_SUPER_ADMIN_RECOVERY_ENABLED !== "true") {
    return false;
  }

  const configuredEmails = (
    process.env.REFLAB_SUPER_ADMIN_RECOVERY_EMAILS ?? ""
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (configuredEmails.length === 0) return false;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primaryEmail =
    user.emailAddresses
      .find((email) => email.id === user.primaryEmailAddressId)
      ?.emailAddress.toLowerCase() ??
    user.emailAddresses[0]?.emailAddress.toLowerCase();

  return Boolean(primaryEmail && configuredEmails.includes(primaryEmail));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

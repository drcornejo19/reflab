import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "@/lib/access/server";
import {
  AdminUsersForbiddenError,
  authorizeCanonicalAdminUsersRead,
  sanitizeAdminUsersReadError,
} from "@/lib/admin/usersRead";

export async function requireSuperAdminReadAccess() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
      userId: null as never,
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const access = await authorizeCanonicalAdminUsersRead(supabase, userId);
    return {
      response: null,
      supabase,
      userId: access.userId,
    };
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return {
        response: NextResponse.json({ error: error.code }, { status: 409 }),
        supabase: null as never,
        userId,
      };
    }
    if (error instanceof AdminUsersForbiddenError) {
      return {
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        supabase: null as never,
        userId,
      };
    }

    const diagnostic = sanitizeAdminUsersReadError(error);
    console.error("[admin.users.authorization]", diagnostic);
    return {
      response: NextResponse.json(
        {
          error: "No se pudo validar el acceso administrativo.",
          technical: diagnostic.message,
        },
        { status: 500 }
      ),
      supabase: null as never,
      userId,
    };
  }
}

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
    const accessSnapshot = await loadAccessSnapshot(supabase, userId, {
      provisionMissing: false,
    });
    const canonicalUserId = accessSnapshot.userId;

    if (accessSnapshot.globalRole === "super_admin") {
      return {
        response: null,
        supabase,
        userId: canonicalUserId,
        usedRecovery: false,
      };
    }

    if (await canUseEmergencyRecovery(userId)) {
      const auditResult = await supabase.from("institution_audit_logs").insert({
        actor_user_id: canonicalUserId,
        action: "security.super_admin_recovery.used",
        entity_type: "platform_access",
        entity_id: canonicalUserId,
        target_user_id: canonicalUserId,
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
        userId: canonicalUserId,
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
    if (error instanceof IdentityLinkRequiredError) {
      return {
        response: NextResponse.json(
          { error: error.code },
          { status: 409 }
        ),
        supabase: null as never,
        userId,
        usedRecovery: false,
      };
    }

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

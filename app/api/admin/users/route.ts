import type { User as ClerkBackendUser } from "@clerk/backend";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  requireSuperAdminAccess,
  requireSuperAdminReadAccess,
} from "@/lib/adminAuthorization";
import {
  loadCanonicalAdminUsers,
  sanitizeAdminUsersReadError,
} from "@/lib/admin/usersRead";
import {
  roleLabels,
  type SystemRole,
} from "@/lib/institutionalRoles";
import {
  isSubscriptionPlan,
  planLabels,
  subscriptionPlans,
  toCanonicalSubscriptionPlan,
  type SubscriptionPlan,
} from "@/lib/subscription";
import {
  ensureUserRecords,
} from "@/lib/reflabUserRecords";
import {
  IdentityLinkRequiredError,
  loadCanonicalAccessSnapshot,
  resolveCanonicalAccessUserId,
} from "@/lib/access/server";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const editableGlobalRoles = [
  "super_admin",
  "individual_referee",
] as const satisfies readonly SystemRole[];

export async function GET() {
  const access = await requireSuperAdminReadAccess();
  if (access.response) return access.response;

  try {
    const users = await loadCanonicalAdminUsers(access.supabase);

    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        roleLabel: roleLabels[user.role],
        planLabel: planLabels[user.subscriptionPlan],
      })),
      roles: editableGlobalRoles,
      roleLabels,
      plans: subscriptionPlans,
      planLabels,
    });
  } catch (error) {
    const diagnostic = sanitizeAdminUsersReadError(error);
    console.error("[admin.users.get]", diagnostic);
    return NextResponse.json(
      {
        error: "No se pudieron cargar los usuarios.",
        technical: diagnostic.message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const access = await requireSuperAdminAccess();
  if (access.response) return access.response;

  let body: {
    userId?: string;
    role?: SystemRole;
    subscriptionPlan?: SubscriptionPlan;
    reason?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const targetUserId =
    typeof body.userId === "string" ? body.userId.trim() : "";
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  if (!targetUserId) {
    return NextResponse.json({ error: "Usuario invalido." }, { status: 400 });
  }

  if (
    body.role &&
    !editableGlobalRoles.includes(
      body.role as (typeof editableGlobalRoles)[number]
    )
  ) {
    return NextResponse.json(
      { error: "El rol global seleccionado no es valido." },
      { status: 400 }
    );
  }

  if (body.subscriptionPlan && !isSubscriptionPlan(body.subscriptionPlan)) {
    return NextResponse.json({ error: "Plan invalido." }, { status: 400 });
  }

  if (!body.role && !body.subscriptionPlan) {
    return NextResponse.json(
      { error: "No hay cambios para guardar." },
      { status: 400 }
    );
  }

  try {
    const targetClerkUser = await findClerkUserForCanonicalUserId(
      access.supabase,
      targetUserId
    );

    if (targetClerkUser) {
      await ensureUserRecords(
        access.supabase,
        targetUserId,
        targetClerkUser
      );
    }

    const current = await loadCanonicalAccessSnapshot(
      access.supabase,
      targetUserId
    );
    const requestedPlan = body.subscriptionPlan
      ? toCanonicalSubscriptionPlan(body.subscriptionPlan)
      : current.individualPlan;
    const requestedGlobalRole =
      body.role === "super_admin" ? "super_admin" : "referee";

    if (
      body.role &&
      targetUserId === access.userId &&
      requestedGlobalRole !== "super_admin"
    ) {
      return NextResponse.json(
        {
          error:
            "No podes quitarte tu propio acceso Super Admin desde esta pantalla.",
        },
        { status: 409 }
      );
    }

    if (requestedPlan !== current.individualPlan) {
      const planResult = await access.supabase.rpc("admin_set_user_plan", {
        actor_user_id: access.userId,
        target_user_id: targetUserId,
        new_plan_key: requestedPlan,
        change_reason: reason,
      });

      if (planResult.error) throw planResult.error;
    }

    if (body.role && requestedGlobalRole !== current.globalRole) {
      const roleResult = await access.supabase.rpc("admin_set_global_role", {
        actor_user_id: access.userId,
        target_user_id: targetUserId,
        new_role_key: requestedGlobalRole,
        change_reason: reason,
      });

      if (roleResult.error) throw roleResult.error;
    }

    const updatedAccess = await loadCanonicalAccessSnapshot(
      access.supabase,
      targetUserId
    );

    if (
      body.subscriptionPlan &&
      updatedAccess.individualPlan !== requestedPlan
    ) {
      throw new Error(
        "Supabase no confirmó la persistencia del plan solicitado."
      );
    }

    if (body.role && updatedAccess.globalRole !== requestedGlobalRole) {
      throw new Error(
        "Supabase no confirmó la persistencia del rol solicitado."
      );
    }

    return NextResponse.json({
      success: true,
      access: updatedAccess,
    });
  } catch (error) {
    console.error("Admin user update failed.", error);
    return NextResponse.json(
      {
        error: "No se pudo guardar el usuario.",
        technical: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

async function listClerkUsers() {
  const client = await clerkClient();
  const users: ClerkBackendUser[] = [];
  const limit = 100;
  let offset = 0;
  let totalCount = 0;

  do {
    const page = await client.users.getUserList({
      limit,
      offset,
      orderBy: "-created_at",
    });

    users.push(...page.data);
    totalCount = page.totalCount;
    offset += page.data.length;
  } while (users.length < totalCount && offset > 0);

  return users;
}

async function findClerkUserForCanonicalUserId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  canonicalUserId: string
) {
  const clerkUsers = await listClerkUsers();

  for (const user of clerkUsers) {
    try {
      const resolvedUserId = await resolveCanonicalAccessUserId(
        supabase,
        user.id
      );
      if (resolvedUserId === canonicalUserId) return user;
    } catch (error) {
      if (error instanceof IdentityLinkRequiredError) continue;
      throw error;
    }
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

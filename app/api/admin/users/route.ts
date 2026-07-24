import type { User as ClerkBackendUser } from "@clerk/backend";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireSuperAdminAccess } from "@/lib/adminAuthorization";
import {
  roleLabels,
  type SystemRole,
} from "@/lib/institutionalRoles";
import {
  isSubscriptionPlan,
  normalizeSubscriptionPlan,
  planLabels,
  subscriptionPlans,
  toCanonicalSubscriptionPlan,
  type SubscriptionPlan,
} from "@/lib/subscription";
import {
  ensureUserRecords,
  getClerkFullName,
  getClerkPrimaryEmail,
  getClerkTimestamp,
  resolveReflabName,
  type UserProfileRow,
  type UserRoleRow,
} from "@/lib/reflabUserRecords";
import { loadAccessSnapshot } from "@/lib/access/server";
import type { AccessSnapshot } from "@/lib/access/types";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const editableGlobalRoles = [
  "super_admin",
  "individual_referee",
] as const satisfies readonly SystemRole[];

type AdminUser = {
  userId: string;
  name: string;
  fullName: string;
  email: string;
  clerkUserId: string;
  refCardId: string;
  role: SystemRole;
  roleLabel: string;
  subscriptionPlan: SubscriptionPlan;
  planLabel: string;
  institutionId: string | null;
  avatarUrl: string;
  capabilities: string[];
  inheritedFromInstitutionIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export async function GET() {
  const access = await requireSuperAdminAccess();
  if (access.response) return access.response;

  try {
    const clerkUsers = await listClerkUsers();

    await Promise.all(
      clerkUsers.map(async (user) => {
        await ensureUserRecords(access.supabase, user);
        await loadAccessSnapshot(access.supabase, user.id);
      })
    );

    const { profiles, roles } = await loadSupabaseUserRows(access.supabase);
    const profilesByUser = new Map(
      profiles.map((profile) => [profile.user_id!, profile])
    );
    const rolesByUser = new Map(roles.map((role) => [role.user_id!, role]));
    const clerkUsersById = new Map(clerkUsers.map((user) => [user.id, user]));
    const userIds = Array.from(
      new Set([
        ...clerkUsersById.keys(),
        ...profilesByUser.keys(),
        ...rolesByUser.keys(),
      ])
    );

    const snapshots = await Promise.all(
      userIds.map((userId) =>
        loadAccessSnapshot(access.supabase, userId).then(
          (snapshot) => [userId, snapshot] as const
        )
      )
    );
    const accessByUser = new Map(snapshots);

    const users = userIds
      .map((userId) =>
        buildAdminUser({
          userId,
          clerkUser: clerkUsersById.get(userId) ?? null,
          profile: profilesByUser.get(userId) ?? null,
          roleRow: rolesByUser.get(userId) ?? null,
          accessSnapshot: accessByUser.get(userId)!,
        })
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return NextResponse.json({
      users,
      roles: editableGlobalRoles,
      roleLabels,
      plans: subscriptionPlans,
      planLabels,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los usuarios.",
        technical: getErrorMessage(error),
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
    const client = await clerkClient();
    const targetClerkUser = await client.users
      .getUser(targetUserId)
      .catch(() => null);

    if (targetClerkUser) {
      await ensureUserRecords(access.supabase, targetClerkUser);
    }

    const current = await loadAccessSnapshot(
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

    const updatedAccess = await loadAccessSnapshot(
      access.supabase,
      targetUserId
    );

    return NextResponse.json({
      success: true,
      access: updatedAccess,
    });
  } catch (error) {
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

async function loadSupabaseUserRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  const [profilesResult, rolesResult] = await Promise.all([
    supabase.from("user_profiles").select("*"),
    supabase.from("user_roles").select("*"),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (rolesResult.error) throw rolesResult.error;

  return {
    profiles: ((profilesResult.data ?? []) as UserProfileRow[]).filter(
      (row) => row.user_id
    ),
    roles: ((rolesResult.data ?? []) as UserRoleRow[]).filter(
      (row) => row.user_id
    ),
  };
}

function buildAdminUser({
  userId,
  clerkUser,
  profile,
  roleRow,
  accessSnapshot,
}: {
  userId: string;
  clerkUser: ClerkBackendUser | null;
  profile: UserProfileRow | null;
  roleRow: UserRoleRow | null;
  accessSnapshot: AccessSnapshot;
}): AdminUser {
  const role: SystemRole =
    accessSnapshot.globalRole === "super_admin"
      ? "super_admin"
      : "individual_referee";
  const subscriptionPlan = normalizeSubscriptionPlan(
    accessSnapshot.individualPlan
  );
  const fullName = getClerkFullName(clerkUser);
  const name = resolveReflabName(profile, clerkUser);
  const email =
    getClerkPrimaryEmail(clerkUser) ??
    profile?.email ??
    "Sin email registrado";

  return {
    userId,
    name,
    fullName,
    email,
    clerkUserId: userId,
    refCardId: profile?.ref_card_id || "Pendiente",
    role,
    roleLabel: roleLabels[role],
    subscriptionPlan,
    planLabel: planLabels[subscriptionPlan],
    institutionId: profile?.institution_id ?? roleRow?.institution_id ?? null,
    avatarUrl: profile?.avatar_url ?? clerkUser?.imageUrl ?? "",
    capabilities: accessSnapshot.capabilities,
    inheritedFromInstitutionIds:
      accessSnapshot.inheritedFromInstitutionIds,
    createdAt:
      profile?.created_at ??
      roleRow?.created_at ??
      getClerkTimestamp(clerkUser?.createdAt),
    updatedAt: latestDate(
      profile?.updated_at,
      roleRow?.updated_at,
      getClerkTimestamp(clerkUser?.updatedAt)
    ),
  };
}

function latestDate(...dates: Array<string | null | undefined>) {
  return (
    dates
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

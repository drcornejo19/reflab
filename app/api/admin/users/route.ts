import type { User as ClerkBackendUser } from "@clerk/backend";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isSystemRole,
  normalizeRole,
  roleLabels,
  systemRoles,
  type SystemRole,
} from "@/lib/institutionalRoles";
import {
  isSubscriptionPlan,
  normalizeSubscriptionPlan,
  planLabels,
  subscriptionPlans,
  type SubscriptionPlan,
} from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  ensureUserRecords,
  getClerkFullName,
  getClerkPrimaryEmail,
  getClerkTimestamp,
  isConfiguredSuperAdmin,
  resolveReflabName,
  toClientProfile,
  upsertUserProfile,
  upsertUserRole,
  type UserProfileRow,
  type UserRoleRow,
} from "@/lib/reflabUserRecords";

export const dynamic = "force-dynamic";

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
  createdAt: string | null;
  updatedAt: string | null;
};

export async function GET() {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  try {
    const clerkUsers = await listClerkUsers();

    await Promise.all(
      clerkUsers.map((user) => ensureUserRecords(access.supabase, user))
    );

    const { profiles, roles } = await loadSupabaseUserRows(access.supabase);
    const profilesByUser = new Map(profiles.map((profile) => [profile.user_id!, profile]));
    const rolesByUser = new Map(roles.map((role) => [role.user_id!, role]));
    const clerkUsersById = new Map(clerkUsers.map((user) => [user.id, user]));
    const userIds = Array.from(
      new Set([
        ...clerkUsersById.keys(),
        ...profilesByUser.keys(),
        ...rolesByUser.keys(),
      ])
    );

    const users = userIds
      .map((userId) =>
        buildAdminUser({
          userId,
          clerkUser: clerkUsersById.get(userId) ?? null,
          profile: profilesByUser.get(userId) ?? null,
          roleRow: rolesByUser.get(userId) ?? null,
        })
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return NextResponse.json({
      users,
      roles: systemRoles,
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
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  let body: {
    userId?: string;
    role?: SystemRole;
    subscriptionPlan?: SubscriptionPlan;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "Usuario invalido." }, { status: 400 });
  }

  if (body.role && !isSystemRole(body.role)) {
    return NextResponse.json({ error: "Rol invalido." }, { status: 400 });
  }

  if (body.subscriptionPlan && !isSubscriptionPlan(body.subscriptionPlan)) {
    return NextResponse.json({ error: "Plan invalido." }, { status: 400 });
  }

  try {
    const client = await clerkClient();
    const targetClerkUser = await client.users
      .getUser(userId)
      .catch(() => null);

    if (targetClerkUser) {
      await ensureUserRecords(access.supabase, targetClerkUser);
    }

    const [roleRead, profileRead] = await Promise.all([
      access.supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      access.supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (roleRead.error) throw roleRead.error;
    if (profileRead.error) throw profileRead.error;

    const existingRole = roleRead.data as UserRoleRow | null;
    const existingProfile = profileRead.data as UserProfileRow | null;
    const now = new Date().toISOString();
    const role = body.role
      ? normalizeRole(body.role)
      : normalizeRole(existingRole?.role);
    const subscriptionPlan = body.subscriptionPlan
      ? normalizeSubscriptionPlan(body.subscriptionPlan)
      : normalizeSubscriptionPlan(
          existingRole?.subscription_plan ?? existingProfile?.subscription_plan
        );

    const roleResult = await upsertUserRole(access.supabase, {
      user_id: userId,
      role,
      subscription_plan: subscriptionPlan,
      institution_id: existingRole?.institution_id ?? existingProfile?.institution_id ?? null,
      created_at: existingRole?.created_at ?? now,
      updated_at: now,
    });

    if (roleResult.error) {
      return NextResponse.json(
        {
          error: "No se pudo actualizar el rol o plan del usuario.",
          technical: roleResult.error.message,
        },
        { status: 500 }
      );
    }

    if (body.subscriptionPlan || targetClerkUser || existingProfile) {
      const profileResult = await upsertUserProfile(access.supabase, {
        user_id: userId,
        email: targetClerkUser
          ? getClerkPrimaryEmail(targetClerkUser)
          : existingProfile?.email ?? null,
        reflab_name: existingProfile
          ? existingProfile.reflab_name ?? resolveReflabName(existingProfile, targetClerkUser)
          : targetClerkUser
            ? resolveReflabName(null, targetClerkUser)
            : null,
        first_name: existingProfile?.first_name ?? targetClerkUser?.firstName ?? null,
        last_name: existingProfile?.last_name ?? targetClerkUser?.lastName ?? null,
        avatar_url: existingProfile?.avatar_url ?? targetClerkUser?.imageUrl ?? null,
        ref_card_id:
          existingProfile?.ref_card_id ??
          (targetClerkUser ? toClientProfile(null, roleResult.data, targetClerkUser).refCardId : null),
        subscription_plan: subscriptionPlan,
        created_at: existingProfile?.created_at ?? now,
        updated_at: now,
      });

      if (profileResult.error) {
        return NextResponse.json(
          {
            error: "No se pudo sincronizar el plan del perfil.",
            technical: profileResult.error.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
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

async function requireSuperAdmin() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, subscription_plan")
      .eq("user_id", userId)
      .maybeSingle();

    const role = normalizeRole(data?.role);
    if (!error && role === "super_admin") {
      return { response: null, supabase };
    }

    if (error) throw error;

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);

    if (isConfiguredSuperAdmin(clerkUser)) {
      await ensureUserRecords(supabase, clerkUser);
      return { response: null, supabase };
    }

    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          error: "No se pudo validar el acceso admin.",
          technical: getErrorMessage(error),
        },
        { status: 500 }
      ),
      supabase: null as never,
    };
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

async function loadSupabaseUserRows(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const [profilesRes, rolesRes] = await Promise.all([
    supabase.from("user_profiles").select("*"),
    supabase.from("user_roles").select("*"),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (rolesRes.error) throw rolesRes.error;

  return {
    profiles: ((profilesRes.data ?? []) as UserProfileRow[]).filter((row) => row.user_id),
    roles: ((rolesRes.data ?? []) as UserRoleRow[]).filter((row) => row.user_id),
  };
}

function buildAdminUser({
  userId,
  clerkUser,
  profile,
  roleRow,
}: {
  userId: string;
  clerkUser: ClerkBackendUser | null;
  profile: UserProfileRow | null;
  roleRow: UserRoleRow | null;
}): AdminUser {
  const role = normalizeRole(roleRow?.role);
  const subscriptionPlan = normalizeSubscriptionPlan(
    roleRow?.subscription_plan ?? profile?.subscription_plan
  );
  const fullName = getClerkFullName(clerkUser);
  const name = resolveReflabName(profile, clerkUser);
  const email =
    getClerkPrimaryEmail(clerkUser) ??
    profile?.email ??
    "Sin email registrado";
  const avatarUrl = profile?.avatar_url ?? clerkUser?.imageUrl ?? "";

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
    avatarUrl,
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
  return dates
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

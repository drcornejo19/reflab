import { auth } from "@clerk/nextjs/server";
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

export const dynamic = "force-dynamic";

type UserProfileRow = {
  user_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  ranking_display_name?: string | null;
  ref_card_id?: string | null;
  subscription_plan?: string | null;
  updated_at?: string | null;
};

type UserRoleRow = {
  user_id?: string | null;
  role?: string | null;
  subscription_plan?: string | null;
  updated_at?: string | null;
};

export async function GET() {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  const [profilesRes, rolesRes] = await Promise.all([
    access.supabase.from("user_profiles").select("*"),
    access.supabase.from("user_roles").select("*"),
  ]);

  if (profilesRes.error || rolesRes.error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los usuarios.",
        technical: profilesRes.error?.message || rolesRes.error?.message,
      },
      { status: 500 }
    );
  }

  const profiles = ((profilesRes.data ?? []) as UserProfileRow[]).filter((row) => row.user_id);
  const roles = ((rolesRes.data ?? []) as UserRoleRow[]).filter((row) => row.user_id);
  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id!, profile]));
  const rolesByUser = new Map(roles.map((role) => [role.user_id!, role]));
  const userIds = Array.from(new Set([...profilesByUser.keys(), ...rolesByUser.keys()]));

  const users = userIds
    .map((userId) => {
      const profile = profilesByUser.get(userId);
      const roleRow = rolesByUser.get(userId);
      const role = normalizeRole(roleRow?.role);
      const subscriptionPlan = normalizeSubscriptionPlan(
        profile?.subscription_plan ?? roleRow?.subscription_plan
      );
      const fullName = [profile?.first_name, profile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        userId,
        name:
          profile?.ranking_display_name ||
          fullName ||
          profile?.ref_card_id ||
          "Usuario RefLab",
        email: profile?.email || "Sin email registrado",
        refCardId: profile?.ref_card_id || "Pendiente",
        role,
        roleLabel: roleLabels[role],
        subscriptionPlan,
        planLabel: planLabels[subscriptionPlan],
        updatedAt: profile?.updated_at || roleRow?.updated_at || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return NextResponse.json({
    users,
    roles: systemRoles,
    roleLabels,
    plans: subscriptionPlans,
    planLabels,
  });
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

  const role = body.role ? normalizeRole(body.role) : undefined;
  const subscriptionPlan = body.subscriptionPlan
    ? normalizeSubscriptionPlan(body.subscriptionPlan)
    : undefined;
  const now = new Date().toISOString();

  if (role || subscriptionPlan) {
    const { data: existingRole, error: roleReadError } = await access.supabase
      .from("user_roles")
      .select("id, role, subscription_plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleReadError) {
      return NextResponse.json(
        {
          error: "No se pudo validar el rol actual.",
          technical: roleReadError.message,
        },
        { status: 500 }
      );
    }

    const rolePayload = {
      user_id: userId,
      role: role ?? normalizeRole(existingRole?.role),
      subscription_plan: subscriptionPlan ?? normalizeSubscriptionPlan(existingRole?.subscription_plan),
      updated_at: now,
    };

    const roleResult = existingRole
      ? await access.supabase.from("user_roles").update(rolePayload).eq("user_id", userId)
      : await access.supabase.from("user_roles").insert(rolePayload);

    if (roleResult.error) {
      return NextResponse.json(
        {
          error: "No se pudo actualizar el rol o plan del usuario.",
          technical: roleResult.error.message,
        },
        { status: 500 }
      );
    }
  }

  if (subscriptionPlan) {
    const { data: existingProfile, error: profileReadError } = await access.supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileReadError) {
      return NextResponse.json(
        {
          error: "No se pudo validar el perfil actual.",
          technical: profileReadError.message,
        },
        { status: 500 }
      );
    }

    if (existingProfile) {
      const profileResult = await access.supabase
        .from("user_profiles")
        .update({
          subscription_plan: subscriptionPlan,
          updated_at: now,
        })
        .eq("user_id", userId);

      if (profileResult.error) {
        return NextResponse.json(
          {
            error: "No se pudo actualizar el plan del perfil.",
            technical: profileResult.error.message,
          },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ success: true });
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

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = normalizeRole(data?.role);
  if (error || role !== "super_admin") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { response: null, supabase };
}

import { NextResponse } from "next/server";
import { requireSuperAdminReadAccess } from "@/lib/adminAuthorization";
import {
  loadCanonicalAdminUsers,
  sanitizeAdminUsersReadError,
} from "@/lib/admin/usersRead";
import {
  applyCanonicalAdminUserMutation,
  parseCanonicalAdminUserMutation,
  publicAdminUsersMutationError,
  sanitizeAdminUsersMutationError,
} from "@/lib/admin/usersWrite";
import {
  roleLabels,
  type SystemRole,
} from "@/lib/institutionalRoles";
import { planLabels, subscriptionPlans } from "@/lib/subscription";

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
  const access = await requireSuperAdminReadAccess();
  if (access.response) return access.response;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const mutation = parseCanonicalAdminUserMutation(
      (body ?? {}) as Record<string, unknown>
    );
    const result = await applyCanonicalAdminUserMutation(
      access.supabase,
      access.userId,
      mutation
    );

    return NextResponse.json({
      success: true,
      status: result.status,
      access: result.access,
    });
  } catch (error) {
    const diagnostic = sanitizeAdminUsersMutationError(error);
    const publicError = publicAdminUsersMutationError(error);
    console.error("[admin.users.patch]", {
      code: diagnostic.code,
      message: diagnostic.message,
    });
    return NextResponse.json(
      {
        error: publicError.error,
      },
      { status: publicError.status }
    );
  }
}

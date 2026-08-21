import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { IdentityLinkRequiredError } from "@/lib/access/server";
import {
  institutionPermissionKeys,
  isInstitutionPermissionKey,
  isInstitutionRoleKey,
  isInstitutionType,
  type InstitutionAccessSnapshot,
  type InstitutionContext,
  type InstitutionMembershipRecord,
  type InstitutionMembershipStatus,
  type InstitutionOverview,
  type InstitutionOverviewMember,
  type InstitutionOverviewRole,
  type InstitutionPermissionKey,
  type InstitutionRecord,
  type InstitutionRoleKey,
  type InstitutionType,
} from "@/lib/institutional/types";
import {
  defaultInstitutionRolePermissions,
  institutionRoleLabels,
} from "@/lib/institutional/permissions";
import { isSportType, type SportType } from "@/lib/sports";
import {
  InstitutionTenantAccessError,
  requireAuthorizedInstitutionContext,
  selectActiveInstitutionContext,
} from "@/lib/institutional/tenantIsolation";
import {
  isCanonicalInstitutionSuperAdmin,
  resolveInstitutionalActorUserId,
} from "@/lib/institutional/institutionalIdentity";

export { selectActiveInstitutionContext };

export const ACTIVE_INSTITUTION_COOKIE = "reflab_active_institution";

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type InstitutionAuthorization = {
  userId: string;
  supabase: SupabaseAdminClient;
  snapshot: InstitutionAccessSnapshot;
  context: InstitutionContext;
  institutionId: string;
};

type CreateInstitutionInput = {
  name: string;
  institutionType: InstitutionType;
  country: string | null;
  provinceState: string | null;
  city: string | null;
  enabledSports: SportType[];
};

export class InstitutionAccessError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "InstitutionAccessError";
    this.status = status;
  }
}

export async function getInstitutionAccessForCurrentUser() {
  const supabase = createSupabaseAdminClient();
  const userId = await requireInstitutionUserId(supabase);
  const snapshot = await loadInstitutionAccess(userId, supabase);

  return { userId, supabase, snapshot };
}

export async function requireInstitutionUserId(
  supabase?: SupabaseAdminClient
) {
  const session = await auth();
  if (!session.userId) {
    throw new InstitutionAccessError("Unauthorized", 401);
  }

  try {
    return await resolveInstitutionalActorUserId(
      supabase ?? createSupabaseAdminClient(),
      session.userId
    );
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      throw new InstitutionAccessError(error.code, 409);
    }
    throw error;
  }
}

export async function getRequestedInstitutionId(explicitInstitutionId?: string | null) {
  if (explicitInstitutionId !== undefined && explicitInstitutionId !== null) {
    return explicitInstitutionId.trim();
  }
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_INSTITUTION_COOKIE)?.value.trim() ?? null;
}

export async function requireInstitutionPermission(
  permission: InstitutionPermissionKey,
  explicitInstitutionId?: string | null
): Promise<InstitutionAuthorization> {
  return requireInstitutionAnyPermission([permission], explicitInstitutionId);
}

export async function requireInstitutionAnyPermission(
  permissions: readonly InstitutionPermissionKey[],
  explicitInstitutionId?: string | null
): Promise<InstitutionAuthorization> {
  const access = await getInstitutionAccessForCurrentUser();
  const requestedInstitutionId = await getRequestedInstitutionId(
    explicitInstitutionId
  );
  let context: InstitutionContext;
  try {
    context = requireAuthorizedInstitutionContext(
      access.snapshot,
      requestedInstitutionId
    );
  } catch (error) {
    if (error instanceof InstitutionTenantAccessError) {
      throw new InstitutionAccessError(error.message, error.status);
    }
    throw error;
  }

  if (!context) {
    throw new InstitutionAccessError(
      "No tenes una institucion activa vinculada.",
      403
    );
  }

  const permissionKeys = context.membership?.permissionKeys ?? [];
  if (
    !context.isSuperAdmin &&
    !permissions.some((permission) => permissionKeys.includes(permission))
  ) {
    throw new InstitutionAccessError(
      "No tenes permiso para realizar esta accion institucional.",
      403
    );
  }

  return {
    ...access,
    context,
    institutionId: context.institution.id,
  };
}

export function assertInstitutionWriteAllowed(
  authorization: InstitutionAuthorization
) {
  if (authorization.context.demoMode) {
    throw new InstitutionAccessError(
      "El modo demo es de solo lectura. Sali del modo demo para guardar cambios.",
      409
    );
  }
}

export async function createInstitutionForSuperAdmin(
  input: CreateInstitutionInput
) {
  const access = await getInstitutionAccessForCurrentUser();
  if (!access.snapshot.isSuperAdmin) {
    throw new InstitutionAccessError(
      "Solo un superadmin de RefLab puede crear instituciones.",
      403
    );
  }
  const requestedInstitutionId = await getRequestedInstitutionId();
  const activeContext = selectActiveInstitutionContext(
    access.snapshot,
    requestedInstitutionId
  );
  if (requestedInstitutionId !== null && !activeContext) {
    throw new InstitutionAccessError(
      "No tenes acceso a la institucion seleccionada.",
      403
    );
  }
  if (activeContext?.demoMode) {
    throw new InstitutionAccessError(
      "El modo demo es de solo lectura. Sali del modo demo para crear instituciones.",
      409
    );
  }

  const slugBase = slugify(input.name) || "institucion";
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await access.supabase
    .from("institutions")
    .insert({
      slug,
      name: input.name,
      institution_type: input.institutionType,
      country: input.country,
      province_state: input.provinceState,
      city: input.city,
      status: "active",
      enabled_sports: input.enabledSports,
      created_by_user_id: access.userId,
    })
    .select(INSTITUTION_SELECT)
    .single();

  if (error || !data) {
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo crear la institucion."
    );
  }

  return normalizeInstitution(data as UnknownRow);
}

export async function getInstitutionOverview(
  authorization: InstitutionAuthorization
): Promise<InstitutionOverview> {
  const { context, supabase, userId } = authorization;
  const institutionId = context.institution.id;
  const permissionKeys =
    context.demoMode && context.simulatedRole
      ? [...defaultInstitutionRolePermissions[context.simulatedRole]]
      : context.membership?.permissionKeys ?? [];
  const can = (permission: InstitutionPermissionKey) =>
    context.demoMode
      ? permissionKeys.includes(permission)
      : context.isSuperAdmin || permissionKeys.includes(permission);
  const canReadMembers = can("members.read");
  const canReadRoles = can("roles.read");

  let membershipQuery = supabase
    .from("institution_memberships")
    .select(
      "id,institution_id,user_id,status,primary_sport,category,joined_at,last_active_at,created_at"
    )
    .eq("institution_id", institutionId)
    .neq("status", "revoked")
    .order("created_at", { ascending: true })
    .limit(250);

  if (!canReadMembers) {
    membershipQuery = membershipQuery.eq("user_id", userId);
  }

  const { data: membershipData, error: membershipError } = await membershipQuery;
  if (membershipError) {
    throw new InstitutionAccessError(membershipError.message);
  }

  let membershipRows = (membershipData ?? []) as UnknownRow[];
  const effectiveRoleKeys =
    context.demoMode && context.simulatedRole
      ? [context.simulatedRole]
      : context.membership?.roleKeys ?? [];
  const scopeToAssignedGroups =
    !(context.isSuperAdmin && !context.demoMode) &&
    !effectiveRoleKeys.some((role) =>
      ["institution_admin", "technical_coordinator"].includes(role)
    ) &&
    effectiveRoleKeys.some((role) =>
      ["instructor", "evaluator"].includes(role)
    );
  if (scopeToAssignedGroups && context.membership?.id) {
    const ownGroupRows = await fetchRows(
      supabase
        .from("institution_group_memberships")
        .select("group_id")
        .eq("institution_id", institutionId)
        .eq("membership_id", context.membership.id)
        .eq("status", "active")
        .in("group_role", ["instructor", "coordinator"])
    );
    const groupIds = uniqueStrings(ownGroupRows.map((row) => row.group_id));
    const groupMemberRows = groupIds.length
      ? await fetchRows(
          supabase
            .from("institution_group_memberships")
            .select("membership_id")
            .eq("institution_id", institutionId)
            .eq("status", "active")
            .in("group_id", groupIds)
        )
      : [];
    const visibleMembershipIds = new Set(
      groupMemberRows.map((row) => String(row.membership_id))
    );
    visibleMembershipIds.add(context.membership.id);
    membershipRows = membershipRows.filter((row) =>
      visibleMembershipIds.has(String(row.id))
    );
  }
  const membershipIds = membershipRows.map((row) => String(row.id));
  const userIds = membershipRows.map((row) => String(row.user_id));

  const membershipRoleRows = membershipIds.length
    ? await fetchRows(
        supabase
          .from("institution_membership_roles")
          .select("membership_id,role_id")
          .eq("institution_id", institutionId)
          .in("membership_id", membershipIds)
      )
    : [];

  const assignedRoleIds = uniqueStrings(
    membershipRoleRows.map((row) => row.role_id)
  );
  const roleRows = await loadVisibleRoles(
    supabase,
    institutionId,
    canReadRoles,
    assignedRoleIds
  );
  const roleIds = uniqueStrings(roleRows.map((row) => row.id));
  const rolePermissionRows = roleIds.length
    ? await fetchRows(
        supabase
          .from("institution_role_permissions")
          .select("role_id,permission_id")
          .in("role_id", roleIds)
      )
    : [];

  const profileRows = userIds.length
    ? await fetchOptionalRows(
        supabase
          .from("user_profiles")
          .select("user_id,email,reflab_name,first_name,last_name,avatar_url")
          .in("user_id", userIds)
      )
    : [];

  const rolesById = new Map(roleRows.map((row) => [String(row.id), row]));
  const roleIdsByMembership = groupStrings(
    membershipRoleRows,
    "membership_id",
    "role_id"
  );
  const permissionCountByRole = countByString(rolePermissionRows, "role_id");
  const profilesByUser = new Map(
    profileRows.map((row) => [String(row.user_id), row])
  );

  const members: InstitutionOverviewMember[] = membershipRows.map((row) => {
    const membershipId = String(row.id);
    const memberUserId = String(row.user_id);
    const memberRoles = (roleIdsByMembership.get(membershipId) ?? [])
      .map((roleId) => rolesById.get(roleId))
      .filter((role): role is UnknownRow => Boolean(role));
    const roleKeys = uniqueRoleKeys(memberRoles.map((role) => role.role_key));
    const profile = profilesByUser.get(memberUserId);

    return {
      id: membershipId,
      userId: memberUserId,
      displayName: profile ? getProfileDisplayName(profile, memberUserId) : memberUserId,
      email: profile ? stringOrNull(profile.email) : null,
      avatarUrl: profile ? stringOrNull(profile.avatar_url) : null,
      status: normalizeMembershipStatus(row.status),
      primarySport: normalizeOptionalSport(row.primary_sport),
      category: stringOrNull(row.category),
      roleKeys,
      roleLabels: roleKeys.map((roleKey) => institutionRoleLabels[roleKey]),
      joinedAt: stringOrNull(row.joined_at),
      lastActiveAt: stringOrNull(row.last_active_at),
    };
  });

  const roles: InstitutionOverviewRole[] = roleRows
    .map((row) => {
      const roleKey = isInstitutionRoleKey(row.role_key)
        ? row.role_key
        : null;
      if (!roleKey) return null;

      return {
        id: String(row.id),
        roleKey,
        name: String(row.name ?? institutionRoleLabels[roleKey]),
        description: stringOrNull(row.description),
        isSystem: Boolean(row.is_system),
        isAssignable: Boolean(row.is_assignable),
        permissionCount: permissionCountByRole.get(String(row.id)) ?? 0,
      };
    })
    .filter((role): role is InstitutionOverviewRole => Boolean(role));

  const activeMemberships = members.filter(
    (membership) => membership.status === "active"
  ).length;
  const licenseLimit = context.institution.licenseLimit;

  return {
    institution: context.institution,
    membership: context.membership,
    capabilities: {
      canManageInstitution: can("institution.manage"),
      canReadMembers,
      canManageMembers: can("members.manage"),
      canReadRoles,
      canManageRoles: can("roles.manage"),
    },
    summary: {
      totalMemberships: members.length,
      activeMemberships,
      roleCount: roles.length,
      licensesUsed: activeMemberships,
      licensesAvailable:
        licenseLimit > 0 ? Math.max(licenseLimit - activeMemberships, 0) : null,
    },
    members,
    roles,
  };
}

async function loadInstitutionAccess(
  userId: string,
  supabase: SupabaseAdminClient
): Promise<InstitutionAccessSnapshot> {
  const { data: globalRoleData, error: globalRoleError } = await supabase
    .from("user_global_roles")
    .select("role_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (globalRoleError) {
    throw new InstitutionAccessError(globalRoleError.message);
  }

  const isSuperAdmin = isCanonicalInstitutionSuperAdmin(globalRoleData?.role_key);
  const membershipRows = await fetchRows(
    supabase
      .from("institution_memberships")
      .select(
        "id,institution_id,user_id,status,primary_sport,category,joined_at,last_active_at"
      )
      .eq("user_id", userId)
      .eq("status", "active")
  );

  const membershipInstitutionIds = uniqueStrings(
    membershipRows.map((row) => row.institution_id)
  );
  let institutionRows: UnknownRow[] = [];

  if (isSuperAdmin) {
    institutionRows = await fetchRows(
      supabase
        .from("institutions")
        .select(INSTITUTION_SELECT)
        .is("deleted_at", null)
        .in("status", ["active", "pending"])
        .order("name", { ascending: true })
    );
  } else if (membershipInstitutionIds.length) {
    institutionRows = await fetchRows(
      supabase
        .from("institutions")
        .select(INSTITUTION_SELECT)
        .in("id", membershipInstitutionIds)
        .is("deleted_at", null)
        .in("status", ["active", "pending"])
        .order("name", { ascending: true })
    );
  }

  const membershipIds = membershipRows.map((row) => String(row.id));
  const membershipRoleRows = membershipIds.length
    ? await fetchRows(
        supabase
          .from("institution_membership_roles")
          .select("membership_id,role_id")
          .in("membership_id", membershipIds)
      )
    : [];
  const roleIds = uniqueStrings(membershipRoleRows.map((row) => row.role_id));
  const roleRows = roleIds.length
    ? await fetchRows(
        supabase
          .from("institution_roles")
          .select("id,role_key")
          .in("id", roleIds)
      )
    : [];
  const rolePermissionRows = roleIds.length
    ? await fetchRows(
        supabase
          .from("institution_role_permissions")
          .select("role_id,permission_id")
          .in("role_id", roleIds)
      )
    : [];
  const overrideRows = membershipIds.length
    ? await fetchRows(
        supabase
          .from("institution_membership_permission_overrides")
          .select("membership_id,permission_id,allowed")
          .in("membership_id", membershipIds)
      )
    : [];
  const permissionIds = uniqueStrings([
    ...rolePermissionRows.map((row) => row.permission_id),
    ...overrideRows.map((row) => row.permission_id),
  ]);
  const permissionRows = permissionIds.length
    ? await fetchRows(
        supabase
          .from("institution_permissions")
          .select("id,permission_key")
          .in("id", permissionIds)
      )
    : [];
  const institutionIds = institutionRows.map((row) => String(row.id));
  const demoRows = institutionIds.length
    ? await fetchRows(
        supabase
          .from("institution_demo_sessions")
          .select(
            "id,institution_id,simulated_role_key,status,started_at,expires_at"
          )
          .eq("user_id", userId)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .in("institution_id", institutionIds)
          .order("started_at", { ascending: false })
      )
    : [];

  const rolesById = new Map(roleRows.map((row) => [String(row.id), row]));
  const permissionsById = new Map(
    permissionRows.map((row) => [String(row.id), row.permission_key])
  );
  const roleIdsByMembership = groupStrings(
    membershipRoleRows,
    "membership_id",
    "role_id"
  );
  const permissionIdsByRole = groupStrings(
    rolePermissionRows,
    "role_id",
    "permission_id"
  );
  const membershipByInstitution = new Map(
    membershipRows.map((row) => [String(row.institution_id), row])
  );
  const demoByInstitution = new Map<string, UnknownRow>();
  for (const row of demoRows) {
    const institutionId = String(row.institution_id);
    if (!demoByInstitution.has(institutionId)) {
      demoByInstitution.set(institutionId, row);
    }
  }

  const contexts = institutionRows.map((institutionRow) => {
    const institution = normalizeInstitution(institutionRow);
    const membershipRow = membershipByInstitution.get(institution.id);
    const membership = membershipRow
      ? normalizeMembership(
          membershipRow,
          roleIdsByMembership,
          rolesById,
          permissionIdsByRole,
          permissionsById,
          overrideRows,
          isSuperAdmin
        )
      : null;
    const demoSession = demoByInstitution.get(institution.id);
    const simulatedRole =
      demoSession && isInstitutionRoleKey(demoSession.simulated_role_key)
        ? demoSession.simulated_role_key
        : null;

    return {
      institution,
      membership,
      isSuperAdmin,
      simulatedRole,
      demoMode: Boolean(simulatedRole),
    } satisfies InstitutionContext;
  });

  return {
    activeInstitutionId: null,
    contexts,
    isSuperAdmin,
  };
}

function normalizeMembership(
  row: UnknownRow,
  roleIdsByMembership: Map<string, string[]>,
  rolesById: Map<string, UnknownRow>,
  permissionIdsByRole: Map<string, string[]>,
  permissionsById: Map<string, unknown>,
  overrideRows: UnknownRow[],
  isSuperAdmin: boolean
): InstitutionMembershipRecord {
  const membershipId = String(row.id);
  const roleIds = roleIdsByMembership.get(membershipId) ?? [];
  const roleKeys = uniqueRoleKeys(
    roleIds.map((roleId) => rolesById.get(roleId)?.role_key)
  );
  const permissionKeys = new Set<InstitutionPermissionKey>();

  for (const roleId of roleIds) {
    for (const permissionId of permissionIdsByRole.get(roleId) ?? []) {
      const permissionKey = permissionsById.get(permissionId);
      if (isInstitutionPermissionKey(permissionKey)) {
        permissionKeys.add(permissionKey);
      }
    }
  }

  for (const override of overrideRows) {
    if (String(override.membership_id) !== membershipId) continue;
    const permissionKey = permissionsById.get(String(override.permission_id));
    if (!isInstitutionPermissionKey(permissionKey)) continue;
    if (override.allowed) permissionKeys.add(permissionKey);
    else permissionKeys.delete(permissionKey);
  }

  return {
    id: membershipId,
    institutionId: String(row.institution_id),
    userId: String(row.user_id),
    status: normalizeMembershipStatus(row.status),
    primarySport: normalizeOptionalSport(row.primary_sport),
    category: stringOrNull(row.category),
    roleKeys: isSuperAdmin ? ["institution_admin"] : roleKeys,
    permissionKeys: isSuperAdmin
      ? [...institutionPermissionKeys]
      : [...permissionKeys],
    joinedAt: stringOrNull(row.joined_at),
    lastActiveAt: stringOrNull(row.last_active_at),
  };
}

async function loadVisibleRoles(
  supabase: SupabaseAdminClient,
  institutionId: string,
  canReadRoles: boolean,
  assignedRoleIds: string[]
) {
  if (!canReadRoles) {
    if (!assignedRoleIds.length) return [];
    return fetchRows(
      supabase
        .from("institution_roles")
        .select("id,role_key,name,description,is_system,is_assignable,institution_id")
        .in("id", assignedRoleIds)
    );
  }

  const systemRoles = await fetchRows(
    supabase
      .from("institution_roles")
      .select("id,role_key,name,description,is_system,is_assignable,institution_id")
      .is("institution_id", null)
  );
  const tenantRoles = await fetchRows(
    supabase
      .from("institution_roles")
      .select("id,role_key,name,description,is_system,is_assignable,institution_id")
      .eq("institution_id", institutionId)
  );

  return [...systemRoles, ...tenantRoles];
}

function normalizeInstitution(row: UnknownRow): InstitutionRecord {
  const enabledSports = Array.isArray(row.enabled_sports)
    ? row.enabled_sports.filter(isSportType)
    : [];

  return {
    id: String(row.id),
    slug: String(row.slug ?? row.id),
    name: String(row.name ?? "Institucion"),
    institutionType: isInstitutionType(row.institution_type)
      ? row.institution_type
      : "other",
    status: normalizeInstitutionStatus(row.status),
    country: stringOrNull(row.country),
    provinceState: stringOrNull(row.province_state),
    city: stringOrNull(row.city),
    timezone: String(row.timezone ?? "America/Argentina/Buenos_Aires"),
    logoUrl: stringOrNull(row.logo_url),
    brandColor: String(row.brand_color ?? "#6fc11f"),
    enabledSports: enabledSports.length ? enabledSports : ["football_11"],
    planKey: String(row.plan_key ?? "pilot"),
    licenseLimit: numberOrZero(row.license_limit),
    isDemo: Boolean(row.is_demo),
  };
}

function normalizeInstitutionStatus(value: unknown) {
  if (
    value === "active" ||
    value === "suspended" ||
    value === "archived"
  ) {
    return value;
  }
  return "pending";
}

function normalizeMembershipStatus(value: unknown): InstitutionMembershipStatus {
  if (
    value === "invited" ||
    value === "suspended" ||
    value === "revoked"
  ) {
    return value;
  }
  return "active";
}

function normalizeOptionalSport(value: unknown): SportType | null {
  return isSportType(value) ? value : null;
}

function uniqueRoleKeys(values: unknown[]) {
  return [...new Set(values.filter(isInstitutionRoleKey))] as InstitutionRoleKey[];
}

async function fetchRows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new InstitutionAccessError(error.message);
  return (Array.isArray(data) ? data : []) as UnknownRow[];
}

async function fetchOptionalRows(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>
) {
  const { data } = await query;
  return (Array.isArray(data) ? data : []) as UnknownRow[];
}

function groupStrings(
  rows: UnknownRow[],
  groupKey: string,
  valueKey: string
) {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const group = String(row[groupKey]);
    const value = String(row[valueKey]);
    const current = groups.get(group) ?? [];
    current.push(value);
    groups.set(group, current);
  }
  return groups;
}

function countByString(rows: UnknownRow[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value) => value != null).map(String))];
}

function getProfileDisplayName(profile: UnknownRow, fallback: string) {
  const reflabName = stringOrNull(profile.reflab_name);
  if (reflabName) return reflabName;
  const fullName = [profile.first_name, profile.last_name]
    .map(stringOrNull)
    .filter(Boolean)
    .join(" ");
  return fullName || stringOrNull(profile.email) || fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type UnknownRow = Record<string, unknown>;

const INSTITUTION_SELECT =
  "id,slug,name,institution_type,status,country,province_state,city,timezone,logo_url,brand_color,enabled_sports,plan_key,license_limit,is_demo";

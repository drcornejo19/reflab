import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  getEffectiveInstitutionPermissions,
  institutionRoleLabels,
} from "@/lib/institutional/permissions";
import {
  assertInstitutionWriteAllowed,
  InstitutionAccessError,
  requireInstitutionPermission,
  type InstitutionAuthorization,
} from "@/lib/institutional/server";
import {
  isInstitutionGroupRole,
  isInstitutionGroupType,
  isInstitutionLifecycleStatus,
  isInstitutionMembershipStatus,
  isInstitutionRoleKey,
  type InstitutionCohortRecord,
  type InstitutionDirectory,
  type InstitutionDirectoryMember,
  type InstitutionGroupMembershipStatus,
  type InstitutionGroupRecord,
  type InstitutionGroupRole,
  type InstitutionGroupType,
  type InstitutionLifecycleStatus,
  type InstitutionMembershipStatus,
  type InstitutionOverviewRole,
  type InstitutionPermissionKey,
  type InstitutionRoleKey,
} from "@/lib/institutional/types";
import { isSportType, type SportType } from "@/lib/sports";

export type InviteInstitutionMemberInput = {
  email: string;
  displayName: string | null;
  roleKey: InstitutionRoleKey;
  primarySport: SportType;
  category: string | null;
  redirectUrl?: string;
};

export type UpdateInstitutionMemberInput = {
  status?: InstitutionMembershipStatus;
  roleKey?: InstitutionRoleKey;
  primarySport?: SportType;
  category?: string | null;
};

export type CreateInstitutionCohortInput = {
  name: string;
  sportType: SportType;
  seasonLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: InstitutionLifecycleStatus;
};

export type CreateInstitutionGroupInput = {
  name: string;
  description: string | null;
  cohortId: string | null;
  groupType: InstitutionGroupType;
  sportType: SportType;
  category: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: InstitutionLifecycleStatus;
};

export async function getInstitutionDirectory(
  authorization: InstitutionAuthorization
): Promise<InstitutionDirectory> {
  const { context, supabase, userId } = authorization;
  const institutionId = context.institution.id;
  const effectivePermissions = getEffectiveInstitutionPermissions(context);
  const can = (permission: InstitutionPermissionKey) =>
    effectivePermissions.includes(permission);
  const capabilities = {
    canReadMembers: can("members.read"),
    canInviteMembers: can("members.invite"),
    canManageMembers: can("members.manage"),
    canReadRoles: can("roles.read"),
    canReadGroups: can("groups.read"),
    canManageGroups: can("groups.manage"),
  };

  const shouldLoadRoles =
    capabilities.canReadRoles ||
    capabilities.canReadMembers ||
    capabilities.canInviteMembers ||
    capabilities.canManageMembers;
  const roleRows = shouldLoadRoles
    ? await loadInstitutionRoles(supabase, institutionId)
    : [];
  const roleIds = uniqueStrings(roleRows.map((row) => row.id));
  const rolePermissionRows = roleIds.length
    ? await fetchRows(
        supabase
          .from("institution_role_permissions")
          .select("role_id,permission_id")
          .in("role_id", roleIds)
      )
    : [];
  const permissionCountByRole = countByString(rolePermissionRows, "role_id");
  const roles: InstitutionOverviewRole[] = roleRows
    .map((row) => {
      if (!isInstitutionRoleKey(row.role_key)) return null;
      return {
        id: String(row.id),
        roleKey: row.role_key,
        name: String(row.name ?? institutionRoleLabels[row.role_key]),
        description: stringOrNull(row.description),
        isSystem: Boolean(row.is_system),
        isAssignable: Boolean(row.is_assignable),
        permissionCount: permissionCountByRole.get(String(row.id)) ?? 0,
      };
    })
    .filter((role): role is InstitutionOverviewRole => Boolean(role));

  let membershipRows: UnknownRow[] = [];
  if (capabilities.canReadMembers) {
    membershipRows = await fetchRows(
      supabase
        .from("institution_memberships")
        .select(
          "id,institution_id,user_id,status,primary_sport,category,joined_at,invited_at,suspended_at,last_active_at,metadata,created_at"
        )
        .eq("institution_id", institutionId)
        .neq("status", "revoked")
        .order("created_at", { ascending: true })
        .limit(500)
    );
  } else if (context.membership?.id) {
    membershipRows = await fetchRows(
      supabase
        .from("institution_memberships")
        .select(
          "id,institution_id,user_id,status,primary_sport,category,joined_at,invited_at,suspended_at,last_active_at,metadata,created_at"
        )
        .eq("id", context.membership.id)
        .eq("user_id", userId)
    );
  }

  const membershipIds = uniqueStrings(membershipRows.map((row) => row.id));
  const realUserIds = uniqueStrings(
    membershipRows
      .map((row) => row.user_id)
      .filter((value) => !String(value).startsWith("invitation:"))
  );
  const profileRows = realUserIds.length
    ? await fetchOptionalRows(
        supabase
          .from("user_profiles")
          .select("user_id,email,reflab_name,first_name,last_name,avatar_url")
          .in("user_id", realUserIds)
      )
    : [];
  const membershipRoleRows = membershipIds.length
    ? await fetchRows(
        supabase
          .from("institution_membership_roles")
          .select("membership_id,role_id")
          .eq("institution_id", institutionId)
          .in("membership_id", membershipIds)
      )
    : [];

  const groupRows = capabilities.canReadGroups
    ? await fetchRows(
        supabase
          .from("institution_groups")
          .select(
            "id,institution_id,cohort_id,name,description,group_type,sport_type,category,starts_on,ends_on,status,created_at"
          )
          .eq("institution_id", institutionId)
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(250)
      )
    : [];
  const cohortRows = capabilities.canReadGroups
    ? await fetchRows(
        supabase
          .from("institution_cohorts")
          .select(
            "id,institution_id,name,sport_type,season_label,starts_on,ends_on,status,created_at"
          )
          .eq("institution_id", institutionId)
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(250)
      )
    : [];
  const groupIds = uniqueStrings(groupRows.map((row) => row.id));
  const groupMembershipRows = groupIds.length
    ? await fetchRows(
        supabase
          .from("institution_group_memberships")
          .select(
            "id,group_id,membership_id,group_role,status,joined_at,created_at"
          )
          .eq("institution_id", institutionId)
          .in("group_id", groupIds)
          .neq("status", "removed")
      )
    : [];
  const effectiveRoleKeys = context.demoMode && context.simulatedRole
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
  const assignedGroupIds = new Set(
    groupMembershipRows
      .filter(
        (row) =>
          String(row.membership_id) === String(context.membership?.id ?? "") &&
          ["instructor", "coordinator"].includes(String(row.group_role))
      )
      .map((row) => String(row.group_id))
  );
  const scopedGroupRows = scopeToAssignedGroups
    ? groupRows.filter((row) => assignedGroupIds.has(String(row.id)))
    : groupRows;
  const scopedGroupMembershipRows = scopeToAssignedGroups
    ? groupMembershipRows.filter((row) =>
        assignedGroupIds.has(String(row.group_id))
      )
    : groupMembershipRows;
  const scopedMembershipIds = new Set(
    scopedGroupMembershipRows.map((row) => String(row.membership_id))
  );
  if (context.membership?.id) scopedMembershipIds.add(context.membership.id);
  const visibleMembershipRows = scopeToAssignedGroups
    ? membershipRows.filter((row) => scopedMembershipIds.has(String(row.id)))
    : membershipRows;

  const rolesById = new Map(roleRows.map((row) => [String(row.id), row]));
  const roleIdsByMembership = groupStrings(
    membershipRoleRows,
    "membership_id",
    "role_id"
  );
  const profilesByUser = new Map(
    profileRows.map((row) => [String(row.user_id), row])
  );
  const groupIdsByMembership = groupStrings(
    scopedGroupMembershipRows,
    "membership_id",
    "group_id"
  );

  const members: InstitutionDirectoryMember[] = visibleMembershipRows.map((row) => {
    const membershipId = String(row.id);
    const memberUserId = String(row.user_id);
    const metadata = asRecord(row.metadata);
    const profile = profilesByUser.get(memberUserId);
    const roleKeys = uniqueRoleKeys(
      (roleIdsByMembership.get(membershipId) ?? []).map(
        (roleId) => rolesById.get(roleId)?.role_key
      )
    );
    const invitationEmail = stringOrNull(metadata.email);
    const fallbackName =
      stringOrNull(metadata.display_name) || invitationEmail || memberUserId;

    return {
      id: membershipId,
      userId: memberUserId,
      displayName: profile
        ? getProfileDisplayName(profile, fallbackName)
        : fallbackName,
      email: profile ? stringOrNull(profile.email) : invitationEmail,
      avatarUrl: profile ? stringOrNull(profile.avatar_url) : null,
      status: normalizeMembershipStatus(row.status),
      primarySport: isSportType(row.primary_sport) ? row.primary_sport : null,
      category: stringOrNull(row.category),
      roleKeys,
      roleLabels: roleKeys.map((roleKey) => institutionRoleLabels[roleKey]),
      joinedAt: stringOrNull(row.joined_at),
      lastActiveAt: stringOrNull(row.last_active_at),
      invitationEmail,
      invitationId: stringOrNull(metadata.invitation_id),
      invitedAt: stringOrNull(row.invited_at),
      suspendedAt: stringOrNull(row.suspended_at),
      groupIds: uniqueStrings(groupIdsByMembership.get(membershipId) ?? []),
    };
  });

  const membersById = new Map(members.map((member) => [member.id, member]));
  const groupMembershipsByGroup = groupRowsByKey(
    scopedGroupMembershipRows,
    "group_id"
  );
  const groups: InstitutionGroupRecord[] = scopedGroupRows.map((row) => {
    const groupId = String(row.id);
    const assignmentRows = groupMembershipsByGroup.get(groupId) ?? [];
    const visibleGroupMembers = capabilities.canReadMembers
      ? assignmentRows.map((assignment) => {
          const member = membersById.get(String(assignment.membership_id));
          return {
            id: String(assignment.id),
            groupId,
            membershipId: String(assignment.membership_id),
            displayName: member?.displayName ?? "Miembro institucional",
            email: member?.email ?? null,
            groupRole: normalizeGroupRole(assignment.group_role),
            status: normalizeGroupMembershipStatus(assignment.status),
            joinedAt:
              stringOrNull(assignment.joined_at) ?? new Date(0).toISOString(),
          };
        })
      : [];

    return {
      id: groupId,
      institutionId,
      cohortId: stringOrNull(row.cohort_id),
      name: String(row.name ?? "Grupo"),
      description: stringOrNull(row.description),
      groupType: normalizeGroupType(row.group_type),
      sportType: isSportType(row.sport_type) ? row.sport_type : "football_11",
      category: stringOrNull(row.category),
      startsOn: stringOrNull(row.starts_on),
      endsOn: stringOrNull(row.ends_on),
      status: normalizeLifecycleStatus(row.status),
      participantCount: assignmentRows.filter(
        (assignment) => assignment.group_role === "participant"
      ).length,
      instructorCount: assignmentRows.filter(
        (assignment) =>
          assignment.group_role === "instructor" ||
          assignment.group_role === "coordinator"
      ).length,
      members: visibleGroupMembers,
      createdAt: String(row.created_at ?? new Date(0).toISOString()),
    };
  });

  const groupsByCohort = groupRowsByKey(scopedGroupRows, "cohort_id");
  const visibleCohortIds = new Set(
    scopedGroupRows.map((row) => String(row.cohort_id ?? "")).filter(Boolean)
  );
  const visibleCohortRows = scopeToAssignedGroups
    ? cohortRows.filter((row) => visibleCohortIds.has(String(row.id)))
    : cohortRows;
  const cohorts: InstitutionCohortRecord[] = visibleCohortRows.map((row) => {
    const cohortId = String(row.id);
    const cohortGroups = groupsByCohort.get(cohortId) ?? [];
    const cohortGroupIds = new Set(cohortGroups.map((group) => String(group.id)));
    const participantIds = new Set(
      scopedGroupMembershipRows
        .filter(
          (assignment) =>
            cohortGroupIds.has(String(assignment.group_id)) &&
            assignment.group_role === "participant"
        )
        .map((assignment) => String(assignment.membership_id))
    );

    return {
      id: cohortId,
      institutionId,
      name: String(row.name ?? "Cohorte"),
      sportType: isSportType(row.sport_type) ? row.sport_type : "football_11",
      seasonLabel: stringOrNull(row.season_label),
      startsOn: stringOrNull(row.starts_on),
      endsOn: stringOrNull(row.ends_on),
      status: normalizeLifecycleStatus(row.status),
      groupCount: cohortGroups.length,
      participantCount: participantIds.size,
      createdAt: String(row.created_at ?? new Date(0).toISOString()),
    };
  });

  return {
    institution: context.institution,
    capabilities,
    members,
    roles,
    cohorts,
    groups,
  };
}

export async function inviteInstitutionMember(
  institutionId: string,
  input: InviteInstitutionMemberInput
) {
  const access = await requireInstitutionPermission("members.invite", institutionId);
  assertInstitutionWriteAllowed(access);
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) {
    throw new InstitutionAccessError("Ingresa un correo valido.", 400);
  }
  assertEnabledSport(access, input.primarySport);
  const role = await resolveAssignableRole(access, input.roleKey);
  await assertLicenseAvailable(access);

  const { data: pendingMembership } = await access.supabase
    .from("institution_memberships")
    .select("id,status")
    .eq("institution_id", institutionId)
    .contains("metadata", { email })
    .neq("status", "revoked")
    .limit(1)
    .maybeSingle();

  if (pendingMembership) {
    throw new InstitutionAccessError(
      "Ese correo ya tiene una membresia o invitacion pendiente.",
      409
    );
  }

  const clerk = await clerkClient();
  const existingUsers = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const existingUser = existingUsers.data[0] ?? null;
  const now = new Date().toISOString();
  let userId: string;
  let status: InstitutionMembershipStatus;
  let invitationId: string | null = null;

  if (existingUser) {
    userId = existingUser.id;
    status = "active";
  } else {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      ignoreExisting: true,
      redirectUrl: input.redirectUrl,
      publicMetadata: {
        reflabInstitutionId: institutionId,
        reflabInstitutionRole: input.roleKey,
        reflabSportType: input.primarySport,
      },
    });
    invitationId = invitation.id;
    userId = `invitation:${invitation.id}`;
    status = "invited";
  }

  const { data: existingMembership } = await access.supabase
    .from("institution_memberships")
    .select("id,status")
    .eq("institution_id", institutionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMembership && existingMembership.status !== "revoked") {
    throw new InstitutionAccessError(
      "La persona ya pertenece a esta institucion.",
      409
    );
  }

  const membershipPayload = {
    institution_id: institutionId,
    user_id: userId,
    status,
    primary_sport: input.primarySport,
    category: input.category,
    joined_at: status === "active" ? now : null,
    invited_at: now,
    invited_by_user_id: access.userId,
    suspended_at: null,
    revoked_at: null,
    metadata: {
      email,
      display_name: input.displayName,
      invitation_id: invitationId,
      source: "institution_panel",
    },
  };
  const membershipQuery = existingMembership
    ? access.supabase
        .from("institution_memberships")
        .update(membershipPayload)
        .eq("id", existingMembership.id)
    : access.supabase.from("institution_memberships").insert(membershipPayload);
  const { data: membership, error: membershipError } = await membershipQuery
    .select("id,user_id,status")
    .single();

  if (membershipError || !membership) {
    if (invitationId) {
      try {
        await clerk.invitations.revokeInvitation(invitationId);
      } catch {
        // The database error remains the primary failure to report.
      }
    }
    throw new InstitutionAccessError(
      membershipError?.message ?? "No se pudo crear la membresia."
    );
  }

  try {
    await replaceMembershipRole(
      access,
      membership.id,
      role.id,
      institutionId
    );
  } catch (roleError) {
    await access.supabase
      .from("institution_memberships")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("id", membership.id);
    if (invitationId) {
      try {
        await clerk.invitations.revokeInvitation(invitationId);
      } catch {
        // The role assignment error remains the primary failure to report.
      }
    }
    throw roleError;
  }

  if (existingUser) {
    const { data: profile } = await access.supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (!profile) {
      await access.supabase.from("user_profiles").insert({
        user_id: existingUser.id,
        email,
        reflab_name: input.displayName,
        first_name: existingUser.firstName,
        last_name: existingUser.lastName,
        avatar_url: existingUser.imageUrl,
      });
    }
  }

  await writeAuditLog(access, {
    action: status === "invited" ? "member.invited" : "member.added",
    entityType: "institution_membership",
    entityId: membership.id,
    afterState: {
      email,
      status,
      role_key: input.roleKey,
      primary_sport: input.primarySport,
      category: input.category,
    },
  });

  return {
    id: membership.id,
    userId: membership.user_id,
    status: normalizeMembershipStatus(membership.status),
    invitationSent: status === "invited",
  };
}

export async function updateInstitutionMember(
  institutionId: string,
  membershipId: string,
  input: UpdateInstitutionMemberInput
) {
  const access = await requireInstitutionPermission("members.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  const { data: membership, error } = await access.supabase
    .from("institution_memberships")
    .select("id,user_id,status,primary_sport,category")
    .eq("id", membershipId)
    .eq("institution_id", institutionId)
    .maybeSingle();

  if (error || !membership) {
    throw new InstitutionAccessError("No se encontro la membresia.", 404);
  }
  if (
    membership.user_id === access.userId &&
    !access.context.isSuperAdmin &&
    (input.roleKey || (input.status && input.status !== "active"))
  ) {
    throw new InstitutionAccessError(
      "No podes quitar tu propio acceso administrativo.",
      400
    );
  }
  if (
    input.status === "active" &&
    String(membership.user_id).startsWith("invitation:")
  ) {
    throw new InstitutionAccessError(
      "La invitacion debe ser aceptada antes de activar el acceso.",
      400
    );
  }
  if (input.primarySport) assertEnabledSport(access, input.primarySport);

  const role = input.roleKey
    ? await resolveAssignableRole(access, input.roleKey)
    : null;
  if (role || (input.status && input.status !== "active")) {
    await assertLastAdministratorRemains(
      access,
      membershipId,
      role?.roleKey ?? null,
      input.status ?? normalizeMembershipStatus(membership.status)
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  if (input.status) {
    updates.status = input.status;
    updates.suspended_at = input.status === "suspended" ? now : null;
    updates.revoked_at = input.status === "revoked" ? now : null;
    if (input.status === "active" && membership.status !== "active") {
      updates.joined_at = now;
    }
  }
  if (input.primarySport) updates.primary_sport = input.primarySport;
  if (input.category !== undefined) updates.category = input.category;

  if (Object.keys(updates).length) {
    const { error: updateError } = await access.supabase
      .from("institution_memberships")
      .update(updates)
      .eq("id", membershipId)
      .eq("institution_id", institutionId);
    if (updateError) throw new InstitutionAccessError(updateError.message);
  }

  if (role) {
    await replaceMembershipRole(access, membershipId, role.id, institutionId);
  }

  await writeAuditLog(access, {
    action: "member.updated",
    entityType: "institution_membership",
    entityId: membershipId,
    beforeState: {
      status: membership.status,
      primary_sport: membership.primary_sport,
      category: membership.category,
    },
    afterState: {
      status: input.status ?? membership.status,
      role_key: input.roleKey,
      primary_sport: input.primarySport ?? membership.primary_sport,
      category: input.category === undefined ? membership.category : input.category,
    },
  });

  return { success: true };
}

export async function resendInstitutionInvitation(
  institutionId: string,
  membershipId: string,
  redirectUrl?: string
) {
  const access = await requireInstitutionPermission("members.invite", institutionId);
  assertInstitutionWriteAllowed(access);
  const { data: membership, error } = await access.supabase
    .from("institution_memberships")
    .select("id,user_id,status,metadata")
    .eq("id", membershipId)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (error || !membership) {
    throw new InstitutionAccessError("No se encontro la invitacion.", 404);
  }
  if (membership.status !== "invited") {
    throw new InstitutionAccessError("La membresia ya no esta pendiente.", 400);
  }

  const metadata = asRecord(membership.metadata);
  const email = stringOrNull(metadata.email);
  if (!email) {
    throw new InstitutionAccessError("La invitacion no tiene correo asociado.", 400);
  }

  const clerk = await clerkClient();
  const previousInvitationId = stringOrNull(metadata.invitation_id);
  if (previousInvitationId) {
    try {
      await clerk.invitations.revokeInvitation(previousInvitationId);
    } catch {
      // The previous invitation may already be expired or revoked.
    }
  }
  const invitation = await clerk.invitations.createInvitation({
    emailAddress: email,
    notify: true,
    ignoreExisting: true,
    redirectUrl,
    publicMetadata: {
      reflabInstitutionId: institutionId,
    },
  });

  const { error: updateError } = await access.supabase
    .from("institution_memberships")
    .update({
      user_id: `invitation:${invitation.id}`,
      invited_at: new Date().toISOString(),
      invited_by_user_id: access.userId,
      metadata: { ...metadata, invitation_id: invitation.id },
    })
    .eq("id", membershipId)
    .eq("status", "invited");
  if (updateError) throw new InstitutionAccessError(updateError.message);

  await writeAuditLog(access, {
    action: "member.invitation_resent",
    entityType: "institution_membership",
    entityId: membershipId,
    afterState: { email, invitation_id: invitation.id },
  });

  return { success: true };
}

export async function createInstitutionCohort(
  institutionId: string,
  input: CreateInstitutionCohortInput
) {
  const access = await requireInstitutionPermission("groups.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  assertEnabledSport(access, input.sportType);
  assertDateRange(input.startsOn, input.endsOn);

  const { data, error } = await access.supabase
    .from("institution_cohorts")
    .insert({
      institution_id: institutionId,
      name: input.name,
      sport_type: input.sportType,
      season_label: input.seasonLabel,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: input.status,
      created_by_user_id: access.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo crear la cohorte."
    );
  }
  await writeAuditLog(access, {
    action: "cohort.created",
    entityType: "institution_cohort",
    entityId: data.id,
    afterState: {
      name: input.name,
      sport_type: input.sportType,
      status: input.status,
    },
  });
  return { id: data.id };
}

export async function updateInstitutionCohort(
  institutionId: string,
  cohortId: string,
  status: InstitutionLifecycleStatus
) {
  const access = await requireInstitutionPermission("groups.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  const { error } = await access.supabase
    .from("institution_cohorts")
    .update({ status })
    .eq("id", cohortId)
    .eq("institution_id", institutionId);
  if (error) throw new InstitutionAccessError(error.message);
  await writeAuditLog(access, {
    action: "cohort.status_updated",
    entityType: "institution_cohort",
    entityId: cohortId,
    afterState: { status },
  });
  return { success: true };
}

export async function createInstitutionGroup(
  institutionId: string,
  input: CreateInstitutionGroupInput
) {
  const access = await requireInstitutionPermission("groups.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  assertEnabledSport(access, input.sportType);
  assertDateRange(input.startsOn, input.endsOn);

  if (input.cohortId) {
    const { data: cohort } = await access.supabase
      .from("institution_cohorts")
      .select("id,sport_type")
      .eq("id", input.cohortId)
      .eq("institution_id", institutionId)
      .maybeSingle();
    if (!cohort) {
      throw new InstitutionAccessError("La cohorte seleccionada no existe.", 400);
    }
    if (cohort.sport_type !== input.sportType) {
      throw new InstitutionAccessError(
        "El grupo y la cohorte deben pertenecer a la misma disciplina.",
        400
      );
    }
  }

  const { data, error } = await access.supabase
    .from("institution_groups")
    .insert({
      institution_id: institutionId,
      cohort_id: input.cohortId,
      name: input.name,
      description: input.description,
      group_type: input.groupType,
      sport_type: input.sportType,
      category: input.category,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: input.status,
      created_by_user_id: access.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    const message = error?.message.includes("institution_groups_name_unique")
      ? "Ya existe un grupo con ese nombre."
      : error?.message ?? "No se pudo crear el grupo.";
    throw new InstitutionAccessError(message, error?.code === "23505" ? 409 : 500);
  }
  await writeAuditLog(access, {
    action: "group.created",
    entityType: "institution_group",
    entityId: data.id,
    afterState: {
      name: input.name,
      group_type: input.groupType,
      sport_type: input.sportType,
      cohort_id: input.cohortId,
      status: input.status,
    },
  });
  return { id: data.id };
}

export async function updateInstitutionGroup(
  institutionId: string,
  groupId: string,
  status: InstitutionLifecycleStatus
) {
  const access = await requireInstitutionPermission("groups.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  const { error } = await access.supabase
    .from("institution_groups")
    .update({ status })
    .eq("id", groupId)
    .eq("institution_id", institutionId);
  if (error) throw new InstitutionAccessError(error.message);
  await writeAuditLog(access, {
    action: "group.status_updated",
    entityType: "institution_group",
    entityId: groupId,
    afterState: { status },
  });
  return { success: true };
}

export async function assignInstitutionGroupMember(
  institutionId: string,
  groupId: string,
  membershipId: string,
  groupRole: InstitutionGroupRole
) {
  const access = await requireInstitutionPermission("groups.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  const [{ data: group }, { data: membership }] = await Promise.all([
    access.supabase
      .from("institution_groups")
      .select("id")
      .eq("id", groupId)
      .eq("institution_id", institutionId)
      .maybeSingle(),
    access.supabase
      .from("institution_memberships")
      .select("id,status")
      .eq("id", membershipId)
      .eq("institution_id", institutionId)
      .in("status", ["active", "invited"])
      .maybeSingle(),
  ]);
  if (!group || !membership) {
    throw new InstitutionAccessError(
      "El grupo o la membresia no pertenecen a esta institucion.",
      400
    );
  }

  const { error } = await access.supabase
    .from("institution_group_memberships")
    .upsert(
      {
        institution_id: institutionId,
        group_id: groupId,
        membership_id: membershipId,
        group_role: groupRole,
        status: "active",
        joined_at: new Date().toISOString(),
        removed_at: null,
      },
      { onConflict: "group_id,membership_id" }
    );
  if (error) throw new InstitutionAccessError(error.message);
  await writeAuditLog(access, {
    action: "group.member_assigned",
    entityType: "institution_group_membership",
    entityId: `${groupId}:${membershipId}`,
    afterState: {
      group_id: groupId,
      membership_id: membershipId,
      group_role: groupRole,
      status: "active",
    },
  });
  return { success: true };
}

export async function updateInstitutionGroupMember(
  institutionId: string,
  groupId: string,
  assignmentId: string,
  input: {
    groupRole?: InstitutionGroupRole;
    status?: InstitutionGroupMembershipStatus;
  }
) {
  const access = await requireInstitutionPermission("groups.manage", institutionId);
  assertInstitutionWriteAllowed(access);
  const updates: Record<string, unknown> = {};
  if (input.groupRole) updates.group_role = input.groupRole;
  if (input.status) {
    updates.status = input.status;
    updates.removed_at = input.status === "removed" ? new Date().toISOString() : null;
  }
  const { error } = await access.supabase
    .from("institution_group_memberships")
    .update(updates)
    .eq("id", assignmentId)
    .eq("group_id", groupId)
    .eq("institution_id", institutionId);
  if (error) throw new InstitutionAccessError(error.message);
  await writeAuditLog(access, {
    action:
      input.status === "removed"
        ? "group.member_removed"
        : "group.member_updated",
    entityType: "institution_group_membership",
    entityId: assignmentId,
    afterState: {
      group_id: groupId,
      group_role: input.groupRole,
      status: input.status,
    },
  });
  return { success: true };
}

async function writeAuditLog(
  access: InstitutionAuthorization,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    beforeState?: UnknownRow;
    afterState?: UnknownRow;
  }
) {
  const { error } = await access.supabase.from("institution_audit_logs").insert({
    institution_id: access.context.institution.id,
    actor_user_id: access.userId,
    actor_membership_id: access.context.membership?.id ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
    metadata: { source: "institution_panel" },
  });
  if (error) {
    console.error("Institution audit log failed", {
      action: entry.action,
      entityId: entry.entityId,
      message: error.message,
    });
  }
}

async function resolveAssignableRole(
  access: InstitutionAuthorization,
  roleKey: InstitutionRoleKey
) {
  const institutionId = access.context.institution.id;
  const roles = await fetchRows(
    access.supabase
      .from("institution_roles")
      .select("id,role_key,institution_id,is_assignable")
      .eq("role_key", roleKey)
      .eq("is_assignable", true)
      .or(`institution_id.is.null,institution_id.eq.${institutionId}`)
  );
  const role =
    roles.find((item) => item.institution_id === institutionId) ?? roles[0];
  if (!role || !isInstitutionRoleKey(role.role_key)) {
    throw new InstitutionAccessError("El rol seleccionado no esta disponible.", 400);
  }
  return { id: String(role.id), roleKey: role.role_key };
}

async function replaceMembershipRole(
  access: InstitutionAuthorization,
  membershipId: string,
  roleId: string,
  institutionId: string
) {
  const { error: upsertError } = await access.supabase
    .from("institution_membership_roles")
    .upsert(
      {
        institution_id: institutionId,
        membership_id: membershipId,
        role_id: roleId,
        assigned_by_user_id: access.userId,
      },
      { onConflict: "membership_id,role_id" }
    );
  if (upsertError) throw new InstitutionAccessError(upsertError.message);

  const { error: deleteError } = await access.supabase
    .from("institution_membership_roles")
    .delete()
    .eq("membership_id", membershipId)
    .eq("institution_id", institutionId)
    .neq("role_id", roleId);
  if (deleteError) throw new InstitutionAccessError(deleteError.message);
}

async function assertLastAdministratorRemains(
  access: InstitutionAuthorization,
  targetMembershipId: string,
  nextRoleKey: InstitutionRoleKey | null,
  nextStatus: InstitutionMembershipStatus
) {
  if (access.context.isSuperAdmin) return;
  const roleRows = await fetchRows(
    access.supabase
      .from("institution_roles")
      .select("id")
      .eq("role_key", "institution_admin")
      .or(
        `institution_id.is.null,institution_id.eq.${access.context.institution.id}`
      )
  );
  const adminRoleIds = uniqueStrings(roleRows.map((row) => row.id));
  if (!adminRoleIds.length) return;
  const targetAssignments = await fetchRows(
    access.supabase
      .from("institution_membership_roles")
      .select("membership_id")
      .eq("membership_id", targetMembershipId)
      .in("role_id", adminRoleIds)
  );
  if (!targetAssignments.length) return;
  if (nextRoleKey === "institution_admin" && nextStatus === "active") return;

  const adminAssignments = await fetchRows(
    access.supabase
      .from("institution_membership_roles")
      .select("membership_id")
      .eq("institution_id", access.context.institution.id)
      .in("role_id", adminRoleIds)
  );
  const adminMembershipIds = uniqueStrings(
    adminAssignments.map((row) => row.membership_id)
  );
  const activeAdmins = adminMembershipIds.length
    ? await fetchRows(
        access.supabase
          .from("institution_memberships")
          .select("id")
          .eq("institution_id", access.context.institution.id)
          .eq("status", "active")
          .in("id", adminMembershipIds)
      )
    : [];
  if (activeAdmins.length <= 1) {
    throw new InstitutionAccessError(
      "La institucion debe conservar al menos un administrador activo.",
      400
    );
  }
}

async function assertLicenseAvailable(access: InstitutionAuthorization) {
  const licenseLimit = access.context.institution.licenseLimit;
  if (!licenseLimit) return;
  const { count, error } = await access.supabase
    .from("institution_memberships")
    .select("id", { count: "exact", head: true })
    .eq("institution_id", access.context.institution.id)
    .in("status", ["invited", "active", "suspended"]);
  if (error) throw new InstitutionAccessError(error.message);
  if ((count ?? 0) >= licenseLimit) {
    throw new InstitutionAccessError(
      "La institucion alcanzo el limite de licencias configurado.",
      409
    );
  }
}

function assertEnabledSport(
  access: InstitutionAuthorization,
  sportType: SportType
) {
  if (!access.context.institution.enabledSports.includes(sportType)) {
    throw new InstitutionAccessError(
      "La disciplina no esta habilitada para esta institucion.",
      400
    );
  }
}

function assertDateRange(startsOn: string | null, endsOn: string | null) {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new InstitutionAccessError(
      "La fecha de cierre no puede ser anterior al inicio.",
      400
    );
  }
}

async function loadInstitutionRoles(
  supabase: InstitutionAuthorization["supabase"],
  institutionId: string
) {
  const [systemRoles, tenantRoles] = await Promise.all([
    fetchRows(
      supabase
        .from("institution_roles")
        .select(
          "id,role_key,name,description,is_system,is_assignable,institution_id"
        )
        .is("institution_id", null)
    ),
    fetchRows(
      supabase
        .from("institution_roles")
        .select(
          "id,role_key,name,description,is_system,is_assignable,institution_id"
        )
        .eq("institution_id", institutionId)
    ),
  ]);
  return [...systemRoles, ...tenantRoles];
}

async function fetchRows(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>
) {
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

function normalizeMembershipStatus(value: unknown): InstitutionMembershipStatus {
  return isInstitutionMembershipStatus(value) ? value : "active";
}

function normalizeLifecycleStatus(value: unknown): InstitutionLifecycleStatus {
  return isInstitutionLifecycleStatus(value) ? value : "draft";
}

function normalizeGroupType(value: unknown): InstitutionGroupType {
  return isInstitutionGroupType(value) ? value : "training";
}

function normalizeGroupRole(value: unknown): InstitutionGroupRole {
  return isInstitutionGroupRole(value) ? value : "participant";
}

function normalizeGroupMembershipStatus(
  value: unknown
): InstitutionGroupMembershipStatus {
  return value === "completed" || value === "removed" ? value : "active";
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

function groupStrings(
  rows: UnknownRow[],
  groupKey: string,
  valueKey: string
) {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const group = String(row[groupKey]);
    const value = String(row[valueKey]);
    const values = groups.get(group) ?? [];
    values.push(value);
    groups.set(group, values);
  }
  return groups;
}

function groupRowsByKey(rows: UnknownRow[], key: string) {
  const groups = new Map<string, UnknownRow[]>();
  for (const row of rows) {
    const value = stringOrNull(row[key]);
    if (!value) continue;
    const current = groups.get(value) ?? [];
    current.push(row);
    groups.set(value, current);
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

function uniqueRoleKeys(values: unknown[]) {
  return [...new Set(values.filter(isInstitutionRoleKey))] as InstitutionRoleKey[];
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value) => value != null).map(String))];
}

function asRecord(value: unknown): UnknownRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRow)
    : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type UnknownRow = Record<string, unknown>;

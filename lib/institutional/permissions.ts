import {
  institutionPermissionKeys,
  type InstitutionContext,
  type InstitutionPermissionKey,
  type InstitutionRoleKey,
  type InstitutionType,
} from "@/lib/institutional/types";

export const institutionTypeLabels: Record<InstitutionType, string> = {
  school: "Escuela arbitral",
  league: "Liga",
  association: "Asociacion",
  federation: "Federacion",
  private_academy: "Academia privada",
  other: "Otra institucion",
};

export const institutionRoleLabels: Record<InstitutionRoleKey, string> = {
  institution_admin: "Administrador institucional",
  technical_coordinator: "Coordinador tecnico",
  instructor: "Instructor",
  evaluator: "Evaluador",
  content_manager: "Responsable de contenidos",
  student: "Alumno",
  referee: "Arbitro",
  invited_referee: "Arbitro invitado",
  observer: "Observador",
  read_only: "Solo lectura",
};

export const sensitiveInstitutionPermissions = new Set<InstitutionPermissionKey>([
  "institution.manage",
  "members.manage",
  "members.invite",
  "roles.manage",
  "groups.manage",
  "content.manage",
  "content.publish",
  "assessments.manage",
  "assessments.grade",
  "metrics.read_individual",
  "metrics.read_aggregate",
  "reports.read",
  "reports.export",
  "notifications.send",
  "matches.manage",
  "audit.read",
  "demo.switch",
]);

const coordinatorPermissions = [
  "institution.read",
  "members.read",
  "groups.read",
  "groups.manage",
  "content.read",
  "content.manage",
  "assessments.read",
  "assessments.manage",
  "assessments.grade",
  "metrics.read_individual",
  "metrics.read_aggregate",
  "reports.read",
  "notifications.read",
  "notifications.send",
  "matches.read",
  "matches.manage",
] as const satisfies readonly InstitutionPermissionKey[];

export const defaultInstitutionRolePermissions: Record<
  InstitutionRoleKey,
  readonly InstitutionPermissionKey[]
> = {
  institution_admin: institutionPermissionKeys,
  technical_coordinator: coordinatorPermissions,
  instructor: [
    "institution.read",
    "members.read",
    "groups.read",
    "content.read",
    "content.manage",
    "assessments.read",
    "assessments.manage",
    "assessments.grade",
    "metrics.read_individual",
    "notifications.read",
  ],
  evaluator: [
    "institution.read",
    "groups.read",
    "assessments.read",
    "assessments.grade",
    "metrics.read_individual",
  ],
  content_manager: [
    "institution.read",
    "content.read",
    "content.manage",
    "content.publish",
  ],
  student: [
    "institution.read",
    "content.read",
    "assessments.read",
    "assessments.take",
    "metrics.read_own",
    "notifications.read",
  ],
  referee: [
    "institution.read",
    "content.read",
    "assessments.read",
    "assessments.take",
    "metrics.read_own",
    "notifications.read",
    "matches.read",
  ],
  invited_referee: [
    "institution.read",
    "content.read",
    "assessments.read",
    "assessments.take",
  ],
  observer: [
    "institution.read",
    "groups.read",
    "metrics.read_aggregate",
    "reports.read",
  ],
  read_only: [
    "institution.read",
    "content.read",
    "assessments.read",
    "notifications.read",
  ],
};

export function getEffectiveInstitutionPermissions(
  context: InstitutionContext | null
) {
  if (!context) return [] as InstitutionPermissionKey[];
  if (context.demoMode && context.simulatedRole) {
    return [...defaultInstitutionRolePermissions[context.simulatedRole]];
  }
  if (context.isSuperAdmin) return [...institutionPermissionKeys];
  return [...(context.membership?.permissionKeys ?? [])];
}

export function hasEffectiveInstitutionPermission(
  context: InstitutionContext | null,
  permission: InstitutionPermissionKey
) {
  return getEffectiveInstitutionPermissions(context).includes(permission);
}

export function resolveDefaultInstitutionPermissions(
  roles: readonly InstitutionRoleKey[]
) {
  return Array.from(
    new Set(roles.flatMap((role) => defaultInstitutionRolePermissions[role]))
  );
}

export function hasInstitutionPermission(
  permissions: readonly InstitutionPermissionKey[],
  permission: InstitutionPermissionKey
) {
  return permissions.includes(permission);
}

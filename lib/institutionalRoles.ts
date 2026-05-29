export const systemRoles = [
  "super_admin",
  "institution_admin",
  "institutional_instructor",
  "institutional_student",
  "individual_referee",
] as const;

export type SystemRole = (typeof systemRoles)[number];

export const institutionalRoles = [
  "institution_admin",
  "institutional_instructor",
  "institutional_student",
] as const;

export type InstitutionalRole = (typeof institutionalRoles)[number];

export const roleLabels: Record<SystemRole, string> = {
  super_admin: "Super admin",
  institution_admin: "Administrador institucional",
  institutional_instructor: "Instructor institucional",
  institutional_student: "Alumno institucional",
  individual_referee: "Arbitro individual",
};

export const roleAccess: Record<
  SystemRole,
  {
    canAccessIndividual: boolean;
    canAccessAdmin: boolean;
    canAccessInstitutionAdmin: boolean;
    canAccessInstitutionStudent: boolean;
    canUseIndividualPremium: boolean;
  }
> = {
  super_admin: {
    canAccessIndividual: true,
    canAccessAdmin: true,
    canAccessInstitutionAdmin: true,
    canAccessInstitutionStudent: true,
    canUseIndividualPremium: true,
  },
  individual_referee: {
    canAccessIndividual: true,
    canAccessAdmin: false,
    canAccessInstitutionAdmin: false,
    canAccessInstitutionStudent: false,
    canUseIndividualPremium: true,
  },
  institution_admin: {
    canAccessIndividual: false,
    canAccessAdmin: false,
    canAccessInstitutionAdmin: true,
    canAccessInstitutionStudent: false,
    canUseIndividualPremium: false,
  },
  institutional_instructor: {
    canAccessIndividual: false,
    canAccessAdmin: false,
    canAccessInstitutionAdmin: true,
    canAccessInstitutionStudent: false,
    canUseIndividualPremium: false,
  },
  institutional_student: {
    canAccessIndividual: false,
    canAccessAdmin: false,
    canAccessInstitutionAdmin: false,
    canAccessInstitutionStudent: true,
    canUseIndividualPremium: false,
  },
};

export function normalizeRole(value?: string | null): SystemRole {
  if (value === "super_admin" || value === "video_admin") return "super_admin";
  if (value === "institution_admin") return "institution_admin";
  if (value === "institutional_instructor" || value === "instructor") {
    return "institutional_instructor";
  }
  if (value === "institutional_student") return "institutional_student";
  return "individual_referee";
}

export function isSystemRole(value?: string | null): value is SystemRole {
  return systemRoles.includes(value as SystemRole);
}

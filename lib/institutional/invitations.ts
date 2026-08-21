import "server-only";

import { IdentityLinkRequiredError } from "../access/server.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import { resolveInstitutionalActorUserId } from "./institutionalIdentity.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type UnknownRow = Record<string, unknown>;

export type PendingInstitutionInvitation = {
  id: string;
  institutionId: string;
  institutionName: string;
  primarySport: string | null;
  category: string | null;
  invitedAt: string | null;
};

export type InstitutionInvitationAcceptance = {
  status: "accepted" | "already_accepted";
  institutionId: string;
  membershipId: string;
  invitationMembershipId: string;
  rolesAdded: number;
  groupsAdded: number;
};

type InvitationRequestContext = {
  canonicalUserId: string;
  verifiedEmails: string[];
  supabase: SupabaseAdminClient;
};

export type InvitationDependencies = {
  getAuthenticatedUserId: () => Promise<string | null>;
  createAdminClient: () => SupabaseAdminClient;
  resolveCanonicalUserId: (
    supabase: SupabaseAdminClient,
    clerkSubject: string
  ) => Promise<string>;
  getVerifiedEmails: (clerkSubject: string) => Promise<string[]>;
  listInvitations: (
    supabase: SupabaseAdminClient,
    verifiedEmails: string[]
  ) => Promise<PendingInstitutionInvitation[]>;
  acceptInvitation: (
    supabase: SupabaseAdminClient,
    canonicalUserId: string,
    invitationMembershipId: string,
    verifiedEmails: string[]
  ) => Promise<InstitutionInvitationAcceptance>;
};

type InstitutionIdentityProvider = Pick<
  InvitationDependencies,
  "getAuthenticatedUserId" | "getVerifiedEmails"
>;

export class InstitutionInvitationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InstitutionInvitationError";
    this.code = code;
    this.status = status;
  }
}

export async function executeInstitutionInvitationsGet(
  dependencies: InvitationDependencies
) {
  try {
    const context = await loadInvitationRequestContext(dependencies);
    const invitations = await dependencies.listInvitations(
      context.supabase,
      context.verifiedEmails
    );
    return noStoreJson({ invitations });
  } catch (error) {
    return invitationErrorResponse(error, "institution.invitations.get");
  }
}

export async function executeInstitutionInvitationAcceptPost(
  request: Request,
  invitationMembershipId: string,
  dependencies: InvitationDependencies
) {
  try {
    await assertAcceptRequestShape(request, invitationMembershipId);
    const context = await loadInvitationRequestContext(dependencies);
    const result = await dependencies.acceptInvitation(
      context.supabase,
      context.canonicalUserId,
      invitationMembershipId,
      context.verifiedEmails
    );
    return noStoreJson(result);
  } catch (error) {
    return invitationErrorResponse(error, "institution.invitations.accept");
  }
}

export function normalizeVerifiedEmails(
  emailAddresses: readonly {
    emailAddress?: unknown;
    verification?: { status?: unknown } | null;
  }[]
) {
  return [
    ...new Set(
      emailAddresses
        .filter((entry) => entry.verification?.status === "verified")
        .map((entry) =>
          typeof entry.emailAddress === "string"
            ? entry.emailAddress.trim().toLowerCase()
            : ""
        )
        .filter(Boolean)
    ),
  ].sort();
}

export function filterPendingInstitutionInvitationRows(
  rows: readonly UnknownRow[],
  verifiedEmails: readonly string[]
) {
  const normalizedEmails = new Set(normalizeEmailValues(verifiedEmails));
  return rows.filter((row) => {
    const metadata = asRecord(row.metadata);
    return (
      row.status === "invited" &&
      String(row.user_id ?? "").startsWith("invitation:") &&
      normalizedEmails.has(normalizeEmail(metadata.email))
    );
  });
}

export function createInstitutionInvitationDependencies(
  identityProvider: InstitutionIdentityProvider
): InvitationDependencies {
  return {
    ...identityProvider,
    createAdminClient: createSupabaseAdminClient,
    resolveCanonicalUserId: resolveInstitutionalActorUserId,
    listInvitations: listPendingInstitutionInvitations,
    acceptInvitation: acceptCanonicalInstitutionInvitation,
  };
}

async function loadInvitationRequestContext(
  dependencies: InvitationDependencies
): Promise<InvitationRequestContext> {
  const clerkSubject = await dependencies.getAuthenticatedUserId();
  if (!clerkSubject) {
    throw new InstitutionInvitationError(
      "unauthorized",
      "Inicia sesion para revisar invitaciones.",
      401
    );
  }

  const supabase = dependencies.createAdminClient();
  let canonicalUserId: string;
  try {
    canonicalUserId = await dependencies.resolveCanonicalUserId(
      supabase,
      clerkSubject
    );
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      throw new InstitutionInvitationError(
        error.code,
        error.code,
        409
      );
    }
    throw error;
  }

  const verifiedEmails = normalizeEmailValues(
    await dependencies.getVerifiedEmails(clerkSubject)
  );
  if (verifiedEmails.length === 0) {
    throw new InstitutionInvitationError(
      "verified_email_required",
      "Necesitas un correo verificado para aceptar invitaciones.",
      403
    );
  }

  return { canonicalUserId, verifiedEmails, supabase };
}

async function listPendingInstitutionInvitations(
  supabase: SupabaseAdminClient,
  verifiedEmails: string[]
) {
  const { data, error } = await supabase
    .from("institution_memberships")
    .select(
      "id,institution_id,user_id,status,primary_sport,category,invited_at,metadata"
    )
    .eq("status", "invited")
    .like("user_id", "invitation:%")
    .in("metadata->>email", verifiedEmails)
    .order("invited_at", { ascending: false });

  if (error) throw error;

  const invitationRows = filterPendingInstitutionInvitationRows(
    (data ?? []) as UnknownRow[],
    verifiedEmails
  );
  const institutionIds = [
    ...new Set(invitationRows.map((row) => String(row.institution_id))),
  ];

  const institutionNames = new Map<string, string>();
  if (institutionIds.length > 0) {
    const { data: institutions, error: institutionsError } = await supabase
      .from("institutions")
      .select("id,name")
      .in("id", institutionIds);
    if (institutionsError) throw institutionsError;
    for (const institution of (institutions ?? []) as UnknownRow[]) {
      institutionNames.set(
        String(institution.id),
        String(institution.name ?? "Institucion")
      );
    }
  }

  return invitationRows.map((row) => ({
    id: String(row.id),
    institutionId: String(row.institution_id),
    institutionName:
      institutionNames.get(String(row.institution_id)) ?? "Institucion",
    primarySport: nullableText(row.primary_sport),
    category: nullableText(row.category),
    invitedAt: nullableText(row.invited_at),
  } satisfies PendingInstitutionInvitation));
}

async function acceptCanonicalInstitutionInvitation(
  supabase: SupabaseAdminClient,
  canonicalUserId: string,
  invitationMembershipId: string,
  verifiedEmails: string[]
) {
  const { data, error } = await supabase.rpc(
    "accept_canonical_institution_invitation",
    {
      p_user_id: canonicalUserId,
      p_invitation_membership_id: invitationMembershipId,
      p_verified_emails: normalizeEmailValues(verifiedEmails),
    }
  );
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const record = asRecord(row);
  if (
    (record.status !== "accepted" && record.status !== "already_accepted") ||
    typeof record.institution_id !== "string" ||
    typeof record.membership_id !== "string" ||
    typeof record.invitation_membership_id !== "string"
  ) {
    throw new InstitutionInvitationError(
      "institution_invitation_unavailable",
      "No se pudo confirmar la invitacion.",
      500
    );
  }

  return {
    status: record.status,
    institutionId: record.institution_id,
    membershipId: record.membership_id,
    invitationMembershipId: record.invitation_membership_id,
    rolesAdded: toNonNegativeInteger(record.roles_added),
    groupsAdded: toNonNegativeInteger(record.groups_added),
  } satisfies InstitutionInvitationAcceptance;
}

async function assertAcceptRequestShape(
  request: Request,
  invitationMembershipId: string
) {
  if (new URL(request.url).search !== "") {
    throw new InstitutionInvitationError(
      "invalid_invitation_request",
      "La solicitud de invitacion no es valida.",
      400
    );
  }
  if (!isUuid(invitationMembershipId)) {
    throw new InstitutionInvitationError(
      "invalid_invitation_id",
      "La invitacion no es valida.",
      400
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && contentLength !== "0") {
    throw new InstitutionInvitationError(
      "invalid_invitation_request",
      "La solicitud de invitacion no acepta datos del navegador.",
      400
    );
  }
  if (request.headers.has("content-type")) {
    throw new InstitutionInvitationError(
      "invalid_invitation_request",
      "La solicitud de invitacion no acepta datos del navegador.",
      400
    );
  }
  if ((await request.text()).trim() !== "") {
    throw new InstitutionInvitationError(
      "invalid_invitation_request",
      "La solicitud de invitacion no acepta datos del navegador.",
      400
    );
  }
}

function invitationErrorResponse(error: unknown, callsite: string) {
  if (error instanceof InstitutionInvitationError) {
    return noStoreJson(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const diagnostic = sanitizeDatabaseError(error);
  console.error(`[${callsite}]`, diagnostic);
  const mapped = mapDatabaseError(diagnostic);
  return noStoreJson(
    { error: mapped.message, code: mapped.code },
    { status: mapped.status }
  );
}

function mapDatabaseError(error: { code: string | null; message: string }) {
  if (error.code === "22023") {
    return {
      code: "invalid_invitation_request",
      message: "La solicitud de invitacion no es valida.",
      status: 400,
    };
  }
  if (error.code === "42501") {
    return {
      code: "institution_invitation_forbidden",
      message: "La invitacion no corresponde a tu cuenta.",
      status: 403,
    };
  }
  if (error.code === "P0002") {
    return {
      code: "institution_invitation_not_found",
      message: "No se encontro la invitacion.",
      status: 404,
    };
  }
  if (error.code === "55000") {
    return {
      code: "institution_invitation_conflict",
      message: "La invitacion no puede aceptarse en su estado actual.",
      status: 409,
    };
  }
  return {
    code: "institution_invitation_unavailable",
    message: "No se pudo procesar la invitacion.",
    status: 500,
  };
}

function sanitizeDatabaseError(error: unknown) {
  const record = asRecord(error);
  return {
    code: typeof record.code === "string" ? record.code : null,
    message:
      error instanceof Error
        ? redactSensitiveText(error.message)
        : typeof record.message === "string"
          ? redactSensitiveText(record.message)
          : "Institution invitation request failed.",
  };
}

function redactSensitiveText(value: string) {
  return value
    .replace(/user_[A-Za-z0-9_-]+/g, "[user]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .slice(0, 240);
}

function normalizeEmailValues(values: readonly string[]) {
  return [...new Set(values.map(normalizeEmail).filter(Boolean))].sort();
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function toNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function asRecord(value: unknown): UnknownRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRow)
    : {};
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function noStoreJson(body: unknown, init?: { status?: number }) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

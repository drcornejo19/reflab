import "server-only";

import { createHash } from "node:crypto";
import {
  assertInstitutionWriteAllowed,
  InstitutionAccessError,
  requireInstitutionAnyPermission,
  requireInstitutionPermission,
} from "@/lib/institutional/server";
import { writeInstitutionAuditLog } from "@/lib/institutional/audit-server";
import {
  institutionNotificationChannels,
  institutionNotificationPriorities,
  type InstitutionNotificationCampaign,
  type InstitutionNotificationChannel,
  type InstitutionNotificationPriority,
  type InstitutionNotificationRecipient,
  type InstitutionNotificationWorkspace,
} from "@/lib/institutional/types";

type NotificationTarget =
  | { type: "institution"; id: null }
  | { type: "group"; id: string }
  | { type: "user"; id: string };

export type CreateInstitutionNotificationInput = {
  title: string;
  message: string;
  notificationType: string;
  priority: InstitutionNotificationPriority;
  channels: InstitutionNotificationChannel[];
  scheduledFor: string | null;
  expiresAt: string | null;
  target: NotificationTarget;
};

type UnknownRow = Record<string, unknown>;

const campaignSelect =
  "id,institution_id,title,message,notification_type,priority,channels,scheduled_for,expires_at,status,deduplication_key,created_by_user_id,created_at,updated_at";

export async function getInstitutionNotificationWorkspace(
  explicitInstitutionId?: string | null
): Promise<InstitutionNotificationWorkspace> {
  const authorization = await requireInstitutionAnyPermission(
    ["notifications.read", "notifications.send"],
    explicitInstitutionId
  );
  const institutionId = authorization.context.institution.id;
  const permissionKeys =
    authorization.context.membership?.permissionKeys ?? [];
  const canSend =
    !authorization.context.demoMode &&
    (authorization.context.isSuperAdmin ||
      permissionKeys.includes("notifications.send"));
  const now = new Date().toISOString();

  const [recipientRows, campaignRows, groupRows, membershipRows] =
    await Promise.all([
      fetchRows(
        authorization.supabase
          .from("institution_notification_recipients")
          .select(
            "id,campaign_id,user_id,delivery_status,sent_at,read_at,created_at,updated_at"
          )
          .eq("institution_id", institutionId)
          .eq("user_id", authorization.userId)
          .order("created_at", { ascending: false })
          .limit(100)
      ),
      canSend
        ? fetchRows(
            authorization.supabase
              .from("institution_notification_campaigns")
              .select(campaignSelect)
              .eq("institution_id", institutionId)
              .order("created_at", { ascending: false })
              .limit(100)
          )
        : [],
      canSend
        ? fetchRows(
            authorization.supabase
              .from("institution_groups")
              .select("id,name")
              .eq("institution_id", institutionId)
              .neq("status", "archived")
              .order("name", { ascending: true })
          )
        : [],
      canSend
        ? fetchRows(
            authorization.supabase
              .from("institution_memberships")
              .select("id,user_id,status,metadata")
              .eq("institution_id", institutionId)
              .eq("status", "active")
              .order("created_at", { ascending: true })
              .limit(1000)
          )
        : [],
    ]);

  const inboxCampaignIds = [
    ...new Set(recipientRows.map((row) => String(row.campaign_id))),
  ];
  const inboxCampaignRows = inboxCampaignIds.length
    ? await fetchRows(
        authorization.supabase
          .from("institution_notification_campaigns")
          .select(campaignSelect)
          .eq("institution_id", institutionId)
          .in("id", inboxCampaignIds)
          .neq("status", "cancelled")
      )
    : [];
  const allCampaignRows = canSend
    ? campaignRows
    : inboxCampaignRows;
  const campaignById = new Map(
    allCampaignRows.map((row) => [String(row.id), row])
  );
  const allCampaignIds = canSend
    ? campaignRows.map((row) => String(row.id))
    : [];
  const allRecipientRows =
    canSend && allCampaignIds.length
      ? await fetchRows(
          authorization.supabase
            .from("institution_notification_recipients")
            .select("campaign_id,delivery_status,read_at")
            .eq("institution_id", institutionId)
            .in("campaign_id", allCampaignIds)
        )
      : [];
  const profiles = membershipRows.length
    ? await fetchRows(
        authorization.supabase
          .from("user_profiles")
          .select("user_id,email,reflab_name,first_name,last_name")
          .in(
            "user_id",
            membershipRows.map((row) => String(row.user_id))
          )
      )
    : [];
  const profileByUser = new Map(
    profiles.map((row) => [String(row.user_id), row])
  );

  return {
    institution: authorization.context.institution,
    capabilities: { canSend },
    campaigns: campaignRows.map((row) =>
      normalizeCampaign(
        row,
        allRecipientRows.filter(
          (recipient) => String(recipient.campaign_id) === String(row.id)
        )
      )
    ),
    inbox: recipientRows.flatMap((row) => {
      const campaign = campaignById.get(String(row.campaign_id));
      if (!campaign || !isCampaignVisible(campaign, now)) return [];
      return [normalizeRecipient(row, campaign)];
    }),
    audiences: {
      groups: groupRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
      })),
      members: membershipRows.map((row) => {
        const profile = profileByUser.get(String(row.user_id));
        const metadata = asRecord(row.metadata);
        return {
          userId: String(row.user_id),
          displayName:
            displayName(profile) ??
            textOrNull(metadata.display_name) ??
            textOrNull(metadata.email) ??
            String(row.user_id),
          email:
            textOrNull(profile?.email) ?? textOrNull(metadata.email),
        };
      }),
    },
  };
}

export async function createInstitutionNotification(
  explicitInstitutionId: string | null,
  input: CreateInstitutionNotificationInput
) {
  const authorization = await requireInstitutionPermission(
    "notifications.send",
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  validateInput(input);
  const institutionId = authorization.context.institution.id;
  const recipientUserIds = await resolveRecipientUserIds(
    authorization,
    input.target
  );
  if (!recipientUserIds.length) {
    throw new InstitutionAccessError(
      "No hay destinatarios activos para este aviso.",
      400
    );
  }

  const now = new Date();
  const scheduledFor = input.scheduledFor
    ? new Date(input.scheduledFor)
    : null;
  const scheduled = Boolean(scheduledFor && scheduledFor > now);
  const deduplicationKey = createHash("sha256")
    .update(
      JSON.stringify({
        institutionId,
        title: input.title.trim(),
        message: input.message.trim(),
        target: input.target,
        scheduledFor: scheduledFor?.toISOString().slice(0, 16) ?? "now",
      })
    )
    .digest("hex");

  const { data: campaign, error } = await authorization.supabase
    .from("institution_notification_campaigns")
    .insert({
      institution_id: institutionId,
      title: input.title.trim(),
      message: input.message.trim(),
      notification_type: input.notificationType.trim(),
      priority: input.priority,
      channels: input.channels,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      expires_at: input.expiresAt,
      status: scheduled ? "scheduled" : "sent",
      deduplication_key: deduplicationKey,
      created_by_user_id: authorization.userId,
    })
    .select(campaignSelect)
    .single();
  if (error || !campaign) {
    if (String(error?.message ?? "").toLowerCase().includes("duplicate")) {
      throw new InstitutionAccessError(
        "Este aviso ya fue creado para los mismos destinatarios y horario.",
        409
      );
    }
    throw new InstitutionAccessError(
      error?.message ?? "No se pudo crear la notificacion."
    );
  }

  const { error: recipientError } = await authorization.supabase
    .from("institution_notification_recipients")
    .insert(
      recipientUserIds.map((userId) => ({
        institution_id: institutionId,
        campaign_id: campaign.id,
        user_id: userId,
        delivery_status: scheduled ? "pending" : "sent",
        sent_at: scheduled ? null : now.toISOString(),
      }))
    );
  if (recipientError) {
    await authorization.supabase
      .from("institution_notification_campaigns")
      .delete()
      .eq("id", campaign.id)
      .eq("institution_id", institutionId);
    throw new InstitutionAccessError(recipientError.message);
  }

  await writeInstitutionAuditLog(authorization, {
    action: "notification.created",
    entityType: "institution_notification_campaign",
    entityId: String(campaign.id),
    afterState: {
      title: input.title,
      priority: input.priority,
      status: scheduled ? "scheduled" : "sent",
      recipientCount: recipientUserIds.length,
    },
    metadata: {
      targetType: input.target.type,
      targetId: input.target.id,
      channels: input.channels,
    },
  });

  return normalizeCampaign(campaign as UnknownRow, recipientUserIds.map(() => ({
    delivery_status: scheduled ? "pending" : "sent",
    read_at: null,
  })));
}

export async function markInstitutionNotificationRead(
  recipientId: string,
  explicitInstitutionId?: string | null
) {
  const authorization = await requireInstitutionAnyPermission(
    ["notifications.read", "notifications.send"],
    explicitInstitutionId
  );
  assertInstitutionWriteAllowed(authorization);
  const now = new Date().toISOString();
  const { data, error } = await authorization.supabase
    .from("institution_notification_recipients")
    .update({
      delivery_status: "read",
      read_at: now,
      sent_at: now,
      updated_at: now,
    })
    .eq("id", recipientId)
    .eq("institution_id", authorization.context.institution.id)
    .eq("user_id", authorization.userId)
    .select("id")
    .maybeSingle();
  if (error) throw new InstitutionAccessError(error.message);
  if (!data) {
    throw new InstitutionAccessError("La notificacion no existe.", 404);
  }
  return { success: true };
}

async function resolveRecipientUserIds(
  authorization: Awaited<ReturnType<typeof requireInstitutionPermission>>,
  target: NotificationTarget
) {
  const institutionId = authorization.context.institution.id;
  if (target.type === "institution") {
    const rows = await fetchRows(
      authorization.supabase
        .from("institution_memberships")
        .select("user_id")
        .eq("institution_id", institutionId)
        .eq("status", "active")
    );
    return uniqueUserIds(rows.map((row) => row.user_id));
  }
  if (target.type === "user") {
    const rows = await fetchRows(
      authorization.supabase
        .from("institution_memberships")
        .select("user_id")
        .eq("institution_id", institutionId)
        .eq("user_id", target.id)
        .eq("status", "active")
    );
    return uniqueUserIds(rows.map((row) => row.user_id));
  }

  const groupRows = await fetchRows(
    authorization.supabase
      .from("institution_groups")
      .select("id")
      .eq("id", target.id)
      .eq("institution_id", institutionId)
      .neq("status", "archived")
  );
  if (!groupRows.length) {
    throw new InstitutionAccessError("El grupo seleccionado no existe.", 404);
  }
  const memberships = await fetchRows(
    authorization.supabase
      .from("institution_group_memberships")
      .select("membership_id")
      .eq("institution_id", institutionId)
      .eq("group_id", target.id)
      .eq("status", "active")
  );
  const membershipIds = memberships.map((row) => String(row.membership_id));
  if (!membershipIds.length) return [];
  const users = await fetchRows(
    authorization.supabase
      .from("institution_memberships")
      .select("user_id")
      .eq("institution_id", institutionId)
      .eq("status", "active")
      .in("id", membershipIds)
  );
  return uniqueUserIds(users.map((row) => row.user_id));
}

function validateInput(input: CreateInstitutionNotificationInput) {
  if (input.title.trim().length < 3 || input.title.trim().length > 120) {
    throw new InstitutionAccessError(
      "El titulo debe tener entre 3 y 120 caracteres.",
      400
    );
  }
  if (input.message.trim().length < 3 || input.message.trim().length > 2000) {
    throw new InstitutionAccessError(
      "El mensaje debe tener entre 3 y 2000 caracteres.",
      400
    );
  }
  if (!institutionNotificationPriorities.includes(input.priority)) {
    throw new InstitutionAccessError("Selecciona una prioridad valida.", 400);
  }
  if (
    !input.channels.length ||
    input.channels.some(
      (channel) => !institutionNotificationChannels.includes(channel)
    )
  ) {
    throw new InstitutionAccessError(
      "Selecciona al menos un canal valido.",
      400
    );
  }
  if (input.target.type !== "institution" && !input.target.id.trim()) {
    throw new InstitutionAccessError("Selecciona los destinatarios.", 400);
  }
  if (
    input.scheduledFor &&
    input.expiresAt &&
    new Date(input.expiresAt) <= new Date(input.scheduledFor)
  ) {
    throw new InstitutionAccessError(
      "La expiracion debe ser posterior al envio.",
      400
    );
  }
}

function normalizeCampaign(
  row: UnknownRow,
  recipients: UnknownRow[]
): InstitutionNotificationCampaign {
  return {
    id: String(row.id),
    title: String(row.title),
    message: String(row.message),
    notificationType: String(row.notification_type),
    priority: normalizePriority(row.priority),
    channels: normalizeChannels(row.channels),
    scheduledFor: textOrNull(row.scheduled_for),
    expiresAt: textOrNull(row.expires_at),
    status: normalizeCampaignStatus(row.status),
    recipientCount: recipients.length,
    readCount: recipients.filter(
      (recipient) =>
        recipient.delivery_status === "read" || Boolean(recipient.read_at)
    ).length,
    createdAt: String(row.created_at),
  };
}

function normalizeRecipient(
  row: UnknownRow,
  campaign: UnknownRow
): InstitutionNotificationRecipient {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    title: String(campaign.title),
    message: String(campaign.message),
    notificationType: String(campaign.notification_type),
    priority: normalizePriority(campaign.priority),
    channels: normalizeChannels(campaign.channels),
    scheduledFor: textOrNull(campaign.scheduled_for),
    expiresAt: textOrNull(campaign.expires_at),
    deliveryStatus: normalizeDeliveryStatus(row.delivery_status),
    readAt: textOrNull(row.read_at),
    createdAt: String(row.created_at),
  };
}

function isCampaignVisible(row: UnknownRow, now: string) {
  const scheduledFor = textOrNull(row.scheduled_for);
  const expiresAt = textOrNull(row.expires_at);
  return (!scheduledFor || scheduledFor <= now) && (!expiresAt || expiresAt > now);
}

function normalizePriority(value: unknown): InstitutionNotificationPriority {
  return institutionNotificationPriorities.includes(
    value as InstitutionNotificationPriority
  )
    ? (value as InstitutionNotificationPriority)
    : "normal";
}

function normalizeChannels(value: unknown): InstitutionNotificationChannel[] {
  return Array.isArray(value)
    ? value.filter((item): item is InstitutionNotificationChannel =>
        institutionNotificationChannels.includes(
          item as InstitutionNotificationChannel
        )
      )
    : ["web"];
}

function normalizeCampaignStatus(
  value: unknown
): InstitutionNotificationCampaign["status"] {
  return ["draft", "scheduled", "sending", "sent", "cancelled"].includes(
    String(value)
  )
    ? (value as InstitutionNotificationCampaign["status"])
    : "draft";
}

function normalizeDeliveryStatus(
  value: unknown
): InstitutionNotificationRecipient["deliveryStatus"] {
  return ["pending", "sent", "failed", "read", "dismissed"].includes(
    String(value)
  )
    ? (value as InstitutionNotificationRecipient["deliveryStatus"])
    : "pending";
}

function displayName(row?: UnknownRow) {
  if (!row) return null;
  const firstLast = [textOrNull(row.first_name), textOrNull(row.last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return textOrNull(row.reflab_name) ?? (firstLast || null);
}

function uniqueUserIds(values: unknown[]) {
  return [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter(Boolean)
    ),
  ];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchRows(
  query: PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>
) {
  const { data, error } = await query;
  if (error) throw new InstitutionAccessError(error.message);
  return (Array.isArray(data) ? data : []) as UnknownRow[];
}

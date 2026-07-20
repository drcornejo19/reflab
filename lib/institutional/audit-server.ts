import "server-only";

import type {
  InstitutionAuthorization,
  SupabaseAdminClient,
} from "@/lib/institutional/server";

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export async function writeInstitutionAuditLog(
  authorization: InstitutionAuthorization,
  input: AuditInput
) {
  const { error } = await authorization.supabase
    .from("institution_audit_logs")
    .insert({
      institution_id: authorization.context.institution.id,
      actor_user_id: authorization.userId,
      actor_membership_id: authorization.context.membership?.id ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      metadata: input.metadata ?? {},
    });

  if (error) {
    console.error("Institution audit log failed", {
      action: input.action,
      entityType: input.entityType,
      message: error.message,
    });
  }
}

export async function removeInstitutionStorageObject(
  supabase: SupabaseAdminClient,
  storagePath: string | null | undefined
) {
  if (!storagePath) return;
  const { error } = await supabase.storage
    .from("institutional-content")
    .remove([storagePath]);

  if (error) {
    console.error("Institution storage cleanup failed", {
      storagePath,
      message: error.message,
    });
  }
}

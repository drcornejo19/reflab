import {
  institutionalErrorResponse,
  institutionalJson,
} from "@/lib/institutional/http";
import { markInstitutionNotificationRead } from "@/lib/institutional/notification-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ recipientId: string }> }
) {
  try {
    const { recipientId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      institutionId?: unknown;
    };
    const result = await markInstitutionNotificationRead(
      recipientId,
      typeof body.institutionId === "string" ? body.institutionId : null
    );
    return institutionalJson(result);
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo actualizar la notificacion institucional."
    );
  }
}

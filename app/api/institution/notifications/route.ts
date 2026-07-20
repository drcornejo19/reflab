import {
  asRecord,
  cleanText,
  institutionalErrorResponse,
  institutionalJson,
  nullableDateTime,
  nullableText,
  stringArray,
} from "@/lib/institutional/http";
import {
  createInstitutionNotification,
  getInstitutionNotificationWorkspace,
} from "@/lib/institutional/notification-server";
import {
  institutionNotificationChannels,
  institutionNotificationPriorities,
  type InstitutionNotificationChannel,
  type InstitutionNotificationPriority,
} from "@/lib/institutional/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const institutionId = new URL(request.url).searchParams.get("institutionId");
    const workspace = await getInstitutionNotificationWorkspace(institutionId);
    return institutionalJson({ workspace });
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudieron cargar las notificaciones institucionales."
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const target = asRecord(body.target);
    const priority = institutionNotificationPriorities.includes(
      body.priority as InstitutionNotificationPriority
    )
      ? (body.priority as InstitutionNotificationPriority)
      : "normal";
    const channels = stringArray(body.channels).filter(
      (channel): channel is InstitutionNotificationChannel =>
        institutionNotificationChannels.includes(
          channel as InstitutionNotificationChannel
        )
    );
    const targetType =
      target.type === "group" || target.type === "user"
        ? target.type
        : "institution";
    const campaign = await createInstitutionNotification(
      nullableText(body.institutionId),
      {
        title: cleanText(body.title),
        message: cleanText(body.message),
        notificationType:
          cleanText(body.notificationType) || "institutional_notice",
        priority,
        channels,
        scheduledFor: nullableDateTime(body.scheduledFor),
        expiresAt: nullableDateTime(body.expiresAt),
        target:
          targetType === "institution"
            ? { type: "institution", id: null }
            : {
                type: targetType,
                id: cleanText(target.id),
              },
      }
    );
    return institutionalJson({ campaign }, 201);
  } catch (error) {
    return institutionalErrorResponse(
      error,
      "No se pudo crear la notificacion institucional."
    );
  }
}

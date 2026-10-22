import { NextResponse } from "next/server";
import type { AppointmentUpdatePayload } from "@/lib/matches/api";
import {
  getMatchesAccessError,
  requireMatchesActor,
} from "@/lib/matches/access";
import {
  getAppointmentDetail,
  updateAppointment,
} from "@/lib/matches/server";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const authorization = await requireMatchesActor({
      requestedInstitutionId: new URL(request.url).searchParams.get("institutionId"),
    });
    const detail = await getAppointmentDetail(
      authorization.supabase,
      authorization.actor,
      appointmentId
    );
    return NextResponse.json(detail);
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    return NextResponse.json(
      { error: "No se pudo cargar la ficha del partido." },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  let body: AppointmentUpdatePayload;
  try {
    body = (await request.json()) as AppointmentUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const { appointmentId } = await params;
    const authorization = await requireMatchesActor({
      requestedInstitutionId: new URL(request.url).searchParams.get("institutionId"),
    });
    const { supabase, actor } = authorization;
    const appointment = await updateAppointment(
      supabase,
      actor,
      appointmentId,
      body
    );
    if (body.status) {
      const notificationType =
        body.status === "confirmed"
          ? "appointment_confirmed"
          : body.status === "cancelled" || body.status === "suspended"
            ? "appointment_cancelled"
            : "appointment_updated";

      await sendSmartNotificationToUser(
        supabase,
        appointment.user_id,
        notificationType,
        {
          message:
            body.status === "confirmed"
              ? "Tu designacion fue confirmada. Ya puedes cerrar la preparacion previa."
              : body.status === "cancelled" || body.status === "suspended"
                ? "Tu designacion fue cancelada o suspendida. Revisa la ficha para ver el estado actualizado."
                : "Tu designacion recibio una actualizacion en Mis partidos.",
          actionUrl: `/matches/${appointment.id}`,
        },
        {
          appointmentId: appointment.id,
          fixtureId: appointment.fixture_id,
          sportType: appointment.sport_type,
        }
      );
    }
    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    return NextResponse.json(
      { error: "No se pudo actualizar la designacion." },
      { status: 400 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { AppointmentUpdatePayload } from "@/lib/matches/api";
import {
  getAppointmentDetail,
  getMatchActorContext,
  updateAppointment,
} from "@/lib/matches/server";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { appointmentId } = await params;
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const detail = await getAppointmentDetail(supabase, actor, appointmentId);
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo cargar la ficha del partido.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AppointmentUpdatePayload;
  try {
    body = (await request.json()) as AppointmentUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const { appointmentId } = await params;
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
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
    return NextResponse.json(
      {
        error: "No se pudo actualizar la designacion.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 400 }
    );
  }
}

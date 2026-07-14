import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type {
  FixtureAppointmentPayload,
  ManualAppointmentPayload,
} from "@/lib/matches/api";
import {
  createAppointment,
  createAppointmentFromFixture,
  getMatchActorContext,
  getMatchesSetupIssue,
  isMatchesConflictError,
  listAppointmentsForActor,
} from "@/lib/matches/server";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const scope =
      scopeParam === "institution" || scopeParam === "admin"
        ? scopeParam
        : "self";
    const appointments = await listAppointmentsForActor(supabase, actor, scope);
    return NextResponse.json({ actor, appointments, scope });
  } catch (error) {
    const setupIssue = getMatchesSetupIssue(error);

    return NextResponse.json(
      {
        error: setupIssue
          ? "Falta aplicar la base de datos de Mis partidos."
          : "No se pudieron cargar las designaciones.",
        technical: error instanceof Error ? error.message : "Error desconocido",
        setupRequired: Boolean(setupIssue),
        missingTables: setupIssue?.missingTables ?? [],
        migrationId: setupIssue?.migrationId ?? null,
      },
      { status: setupIssue ? 503 : 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ManualAppointmentPayload | FixtureAppointmentPayload;
  try {
    body = (await request.json()) as ManualAppointmentPayload | FixtureAppointmentPayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const appointment =
      "fixtureId" in body && typeof body.fixtureId === "string"
        ? await createAppointmentFromFixture(supabase, actor, body)
        : await createAppointment(supabase, actor, body as ManualAppointmentPayload);
    await sendSmartNotificationToUser(
      supabase,
      appointment.user_id,
      appointment.status === "confirmed"
        ? "appointment_confirmed"
        : "appointment_registered",
      {
        message:
          appointment.status === "confirmed"
            ? "Tu designacion fue cargada y ya esta confirmada en Mis partidos."
            : "Tu designacion fue cargada en Mis partidos y ya puedes empezar la preparacion.",
        actionUrl: `/matches/${appointment.id}`,
      },
      {
        appointmentId: appointment.id,
        fixtureId: appointment.fixture_id,
        sportType: appointment.sport_type,
      }
    );
    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    if (isMatchesConflictError(error)) {
      return NextResponse.json(
        {
          error: "Ya tienes una designacion activa para esa fecha.",
          technical: error.message,
          conflict: error.conflict,
        },
        { status: 409 }
      );
    }

    const setupIssue = getMatchesSetupIssue(error);

    return NextResponse.json(
      {
        error: setupIssue
          ? "Falta aplicar la base de datos de Mis partidos."
          : "No se pudo registrar la designacion.",
        technical: error instanceof Error ? error.message : "Error desconocido",
        setupRequired: Boolean(setupIssue),
        missingTables: setupIssue?.missingTables ?? [],
        migrationId: setupIssue?.migrationId ?? null,
      },
      { status: setupIssue ? 503 : 400 }
    );
  }
}

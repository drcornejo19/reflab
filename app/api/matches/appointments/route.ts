import { NextResponse } from "next/server";
import type {
  FixtureAppointmentPayload,
  ManualAppointmentPayload,
} from "@/lib/matches/api";
import {
  getMatchesAccessError,
  requireMatchesActor,
} from "@/lib/matches/access";
import {
  createAppointment,
  createAppointmentFromFixture,
  getMatchesSetupIssue,
  isMatchesConflictError,
  listAppointmentsForActor,
} from "@/lib/matches/server";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const scope =
      scopeParam === "institution" || scopeParam === "admin"
        ? scopeParam
        : "self";
    const authorization = await requireMatchesActor({
      requestedInstitutionId: searchParams.get("institutionId"),
      requireInstitutionContext: scope === "institution",
      requireInstitutionPermission:
        scope === "institution" ? "matches.read" : undefined,
    });
    if (scope === "admin" && !authorization.actor.isSuperAdmin) {
      return NextResponse.json({ error: "matches_read_forbidden" }, { status: 403 });
    }
    const appointments = await listAppointmentsForActor(
      authorization.supabase,
      authorization.actor,
      scope
    );
    return NextResponse.json({ actor: authorization.actor, appointments, scope });
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    const setupIssue = getMatchesSetupIssue(error);

    return NextResponse.json(
      {
        error: setupIssue
          ? "Falta aplicar la base de datos de Mis partidos."
          : "No se pudieron cargar las designaciones.",
        setupRequired: Boolean(setupIssue),
        missingTables: setupIssue?.missingTables ?? [],
        migrationId: setupIssue?.migrationId ?? null,
      },
      { status: setupIssue ? 503 : 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: ManualAppointmentPayload | FixtureAppointmentPayload;
  try {
    body = (await request.json()) as ManualAppointmentPayload | FixtureAppointmentPayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    if (containsClientIdentity(body)) {
      return NextResponse.json({ error: "identity_fields_forbidden" }, { status: 400 });
    }
    const institutional = body.sourceType === "institutional";
    const authorization = await requireMatchesActor({
      requestedInstitutionId: body.institutionId,
      requireInstitutionContext: institutional,
      requireInstitutionPermission: institutional ? "matches.manage" : undefined,
    });
    const { supabase, actor } = authorization;
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
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
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

function containsClientIdentity(body: object) {
  const forbidden = new Set([
    "targetUserId",
    "userId",
    "user_id",
    "canonicalUserId",
    "clerkSubject",
    "externalSubject",
  ]);
  return Object.keys(body).some((key) => forbidden.has(key));
}

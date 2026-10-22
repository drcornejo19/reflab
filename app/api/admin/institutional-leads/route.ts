import { NextResponse } from "next/server";
import {
  requireSuperAdminAccess,
  requireSuperAdminReadAccess,
} from "@/lib/adminAuthorization";

export const dynamic = "force-dynamic";

const leadStatuses = [
  "new",
  "contacted",
  "demo_scheduled",
  "pilot",
  "converted",
  "rejected",
] as const;

type LeadStatus = (typeof leadStatuses)[number];

export async function GET() {
  const access = await requireSuperAdminReadAccess();
  if (access.response) return access.response;

  const { data, error } = await access.supabase
    .from("institutional_leads")
    .select(
      "id, full_name, role, institution_name, institution_type, country, city, referee_count, instructor_count, email, whatsapp, interest_areas, message, status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los leads institucionales.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ leads: data ?? [], statuses: leadStatuses });
}

export async function PATCH(request: Request) {
  const access = await requireSuperAdminAccess();
  if (access.response) return access.response;

  let body: { id?: string; status?: LeadStatus };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  if (!body.id || !body.status || !leadStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "Lead o estado comercial invalido." },
      { status: 400 }
    );
  }

  const { data, error } = await access.supabase
    .from("institutional_leads")
    .update({
      status: body.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select(
      "id, full_name, role, institution_name, institution_type, country, city, referee_count, instructor_count, email, whatsapp, interest_areas, message, status, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudo actualizar el estado del lead.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ lead: data });
}

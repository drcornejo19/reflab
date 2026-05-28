import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type LeadPayload = {
  fullName?: string;
  role?: string;
  institutionName?: string;
  institutionType?: string;
  country?: string;
  city?: string;
  refereeCount?: string | number;
  instructorCount?: string | number;
  email?: string;
  whatsapp?: string;
  interestAreas?: string[];
  message?: string;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadPayload;
    const fullName = cleanText(body.fullName);
    const institutionName = cleanText(body.institutionName);
    const email = cleanText(body.email);

    if (!fullName || !institutionName || !email) {
      return NextResponse.json(
        {
          error:
            "Completá nombre, institución y email para enviar la solicitud institucional.",
        },
        { status: 400 }
      );
    }

    const interestAreas = Array.isArray(body.interestAreas)
      ? body.interestAreas
          .map((area) => cleanText(area))
          .filter((area): area is string => Boolean(area))
      : [];

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("institutional_leads").insert({
      full_name: fullName,
      role: cleanText(body.role),
      institution_name: institutionName,
      institution_type: cleanText(body.institutionType),
      country: cleanText(body.country),
      city: cleanText(body.city),
      referee_count: cleanInteger(body.refereeCount),
      instructor_count: cleanInteger(body.instructorCount),
      email,
      whatsapp: cleanText(body.whatsapp),
      interest_areas: interestAreas,
      message: cleanText(body.message),
      status: "new",
    });

    if (error) {
      return NextResponse.json(
        {
          error: "No se pudo guardar la solicitud institucional en Supabase.",
          technical: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        "Solicitud recibida. Nos pondremos en contacto para coordinar una demo institucional.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo procesar la solicitud institucional.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

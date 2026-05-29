import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendInstitutionalLeadEmails,
  type InstitutionalLeadEmailData,
} from "@/lib/institutionalEmails";
import { activeInstitutionTypes, type InstitutionType } from "@/lib/institutionalExperience";

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

function cleanEmail(value: unknown) {
  const email = cleanText(value);
  if (!email || !email.includes("@")) return null;
  return email;
}

function cleanInstitutionType(value: unknown): InstitutionType | null {
  const type = cleanText(value);
  if (!type) return null;
  return activeInstitutionTypes.includes(type as InstitutionType)
    ? (type as InstitutionType)
    : null;
}

function createLeadWriteClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y una clave Supabase valida para guardar leads."
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadPayload;
    const fullName = cleanText(body.fullName);
    const institutionName = cleanText(body.institutionName);
    const email = cleanEmail(body.email);

    if (!fullName || !institutionName || !email) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Completa nombre, institucion y email valido para enviar la solicitud institucional.",
        },
        { status: 400 }
      );
    }

    const createdAt = new Date().toISOString();
    const interestAreas = Array.isArray(body.interestAreas)
      ? body.interestAreas
          .map((area) => cleanText(area))
          .filter((area): area is string => Boolean(area))
      : [];

    const lead: InstitutionalLeadEmailData = {
      fullName,
      role: cleanText(body.role),
      institutionName,
      institutionType: cleanInstitutionType(body.institutionType),
      country: cleanText(body.country),
      city: cleanText(body.city),
      refereeCount: cleanInteger(body.refereeCount),
      instructorCount: cleanInteger(body.instructorCount),
      email,
      whatsapp: cleanText(body.whatsapp),
      interestAreas,
      message: cleanText(body.message),
      createdAt,
    };

    const supabase = createLeadWriteClient();
    const { error } = await supabase.from("institutional_leads").insert({
      full_name: lead.fullName,
      role: lead.role,
      institution_name: lead.institutionName,
      institution_type: lead.institutionType,
      country: lead.country,
      city: lead.city,
      referee_count: lead.refereeCount,
      instructor_count: lead.instructorCount,
      email: lead.email,
      whatsapp: lead.whatsapp,
      interest_areas: lead.interestAreas,
      message: lead.message,
      status: "new",
      created_at: createdAt,
      updated_at: createdAt,
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar la solicitud institucional en Supabase.",
          technical: error.message,
        },
        { status: 500 }
      );
    }

    const emailResults = await sendInstitutionalLeadEmails(lead);
    const failedEmailResults = [
      { type: "internal", result: emailResults.internal },
      { type: "confirmation", result: emailResults.confirmation },
    ].filter(({ result }) => !result.ok);
    const emailErrors = failedEmailResults
      .map(({ type, result }) => `${type}: ${result.error}`)
      .filter(Boolean);

    if (failedEmailResults.length > 0) {
      console.error("Institutional lead emailError", {
        lead: {
          email: lead.email,
          fullName: lead.fullName,
          institutionName: lead.institutionName,
        },
        failures: failedEmailResults,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        "Solicitud recibida. Te enviamos una confirmacion por email y nos pondremos en contacto para coordinar una demo institucional.",
      warning:
        emailErrors.length > 0
          ? `La solicitud se guardo, pero hubo un problema enviando emails: ${emailErrors.join(
              " | "
            )}`
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo procesar la solicitud institucional.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

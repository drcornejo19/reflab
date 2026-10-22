import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  sendInstitutionalLeadEmails,
  type InstitutionalLeadEmailData,
} from "@/lib/institutionalEmails";
import { activeInstitutionTypes, type InstitutionType } from "@/lib/institutionalExperience";

export const dynamic = "force-dynamic";

const publicErrors = {
  insert: "No se pudo guardar la solicitud institucional en Supabase.",
  email: "La solicitud se guardo, pero hubo un problema enviando emails.",
  unexpected: "No se pudo procesar la solicitud institucional.",
} as const;

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

    const supabase = createSupabaseAdminClient();
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
          error: publicErrors.insert,
        },
        { status: 500 }
      );
    }

    const emailResults = await sendInstitutionalLeadEmails(lead);
    const emailFailed = !emailResults.internal.ok || !emailResults.confirmation.ok;

    if (emailFailed) {
      console.error("Institutional lead emailError", {
        operation: "institutional_lead_submission",
        stage: "email",
        code: "EMAIL_DELIVERY_FAILED",
      });
    }

    return NextResponse.json({
      success: true,
      message:
        "Solicitud recibida. Te enviamos una confirmacion por email y nos pondremos en contacto para coordinar una demo institucional.",
      warning: emailFailed ? publicErrors.email : null,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: publicErrors.unexpected,
      },
      { status: 500 }
    );
  }
}

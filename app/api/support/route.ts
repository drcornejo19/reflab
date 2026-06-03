import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getEmailConfig, sendTransactionalEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supportCategories = [
  "Error tecnico",
  "Problema con videos",
  "Problema con evaluaciones",
  "Cuenta y acceso",
  "Licencias institucionales",
  "Sugerencia de mejora",
  "Otro",
] as const;

type SupportPayload = {
  name?: string;
  email?: string;
  category?: string;
  subject?: string;
  message?: string;
};

export async function POST(request: Request) {
  const session = await auth();

  try {
    const body = (await request.json()) as SupportPayload;
    const name = cleanText(body.name);
    const email = cleanEmail(body.email);
    const category = cleanCategory(body.category);
    const subject = cleanText(body.subject);
    const message = cleanText(body.message);

    if (!name || !email || !category || !subject || !message) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Completa nombre, email, tipo de consulta, asunto y mensaje para enviar soporte.",
        },
        { status: 400 }
      );
    }

    const date = new Date().toISOString();
    const { supportEmail } = getEmailConfig();
    const result = await sendTransactionalEmail({
      to: supportEmail,
      subject: `[REFLAB SOPORTE] ${category}`,
      html: buildSupportHtml({
        name,
        email,
        category,
        subject,
        message,
        date,
        userId: session.userId,
      }),
      text: buildSupportText({
        name,
        email,
        category,
        subject,
        message,
        date,
        userId: session.userId,
      }),
    });

    if (!result.ok) {
      console.error("Support emailError", {
        to: supportEmail,
        category,
        subject,
        result,
      });

      return NextResponse.json(
        {
          success: false,
          error: "No se pudo enviar la consulta de soporte.",
          technical: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Tu mensaje fue enviado correctamente. El equipo RefLab se pondra en contacto contigo.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo procesar la consulta de soporte.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value);
  if (!email || !email.includes("@")) return null;
  return email;
}

function cleanCategory(value: unknown) {
  const category = cleanText(value);
  if (!category) return null;
  return supportCategories.includes(category as (typeof supportCategories)[number])
    ? category
    : null;
}

function buildSupportHtml(input: {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  date: string;
  userId?: string | null;
}) {
  const rows = [
    ["Usuario", input.name],
    ["Email", input.email],
    ["Tipo", input.category],
    ["Asunto", input.subject],
    ["Fecha", new Date(input.date).toLocaleString("es-AR")],
    ["User ID", input.userId || "No autenticado"],
    ["Mensaje", input.message],
  ];

  return `
    <div style="margin:0;padding:0;background:#020b14;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
        <div style="border:1px solid #1f2937;background:#071019;border-radius:26px;padding:28px;">
          <div style="font-size:25px;font-weight:900;letter-spacing:-.04em;color:#ffffff;">REF<span style="color:#6fc11f;">LAB</span></div>
          <div style="margin-top:6px;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.28em;">Centro de soporte</div>
          <p style="margin:22px 0;color:#d4d4d8;font-size:15px;line-height:1.6;">Nueva consulta recibida desde la plataforma.</p>
          <table style="width:100%;border-collapse:collapse;">
            ${rows
              .map(
                ([label, value]) => `
                  <tr>
                    <td style="padding:12px;border-bottom:1px solid #1f2937;color:#8b949e;font-size:12px;text-transform:uppercase;letter-spacing:.08em;width:30%;">${escapeHtml(label)}</td>
                    <td style="padding:12px;border-bottom:1px solid #1f2937;color:#ffffff;font-size:14px;font-weight:700;white-space:pre-wrap;">${escapeHtml(value)}</td>
                  </tr>
                `
              )
              .join("")}
          </table>
        </div>
      </div>
    </div>
  `;
}

function buildSupportText(input: {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  date: string;
  userId?: string | null;
}) {
  return [
    "Nueva consulta de soporte - RefLab",
    "",
    `Usuario: ${input.name}`,
    `Email: ${input.email}`,
    `Tipo: ${input.category}`,
    `Asunto: ${input.subject}`,
    `Fecha: ${new Date(input.date).toLocaleString("es-AR")}`,
    `User ID: ${input.userId || "No autenticado"}`,
    "",
    "Mensaje:",
    input.message,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

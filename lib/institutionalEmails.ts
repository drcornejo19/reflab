import { getEmailConfig, sendTransactionalEmail, type EmailResult } from "@/lib/email";
import {
  institutionTypeLabels,
  type InstitutionType,
} from "@/lib/institutionalExperience";

export type InstitutionalLeadEmailData = {
  fullName: string;
  role?: string | null;
  institutionName: string;
  institutionType?: string | null;
  country?: string | null;
  city?: string | null;
  refereeCount?: number | null;
  instructorCount?: number | null;
  email: string;
  whatsapp?: string | null;
  interestAreas: string[];
  message?: string | null;
  createdAt: string;
};

export type InstitutionalEmailResults = {
  internal: EmailResult;
  confirmation: EmailResult;
};

export async function sendInstitutionalLeadEmails(
  lead: InstitutionalLeadEmailData
): Promise<InstitutionalEmailResults> {
  const { institutionalEmail, appUrl } = getEmailConfig();
  const [internal, confirmation] = await Promise.all([
    sendTransactionalEmail({
      to: institutionalEmail,
      subject: "Nueva solicitud de demo institucional - RefLab",
      html: buildInternalLeadHtml(lead, appUrl),
      text: buildInternalLeadText(lead, appUrl),
    }),
    sendTransactionalEmail({
      to: lead.email,
      subject: "Recibimos tu solicitud institucional - RefLab",
      html: buildConfirmationHtml(lead, institutionalEmail, appUrl),
      text: buildConfirmationText(lead, institutionalEmail, appUrl),
    }),
  ]);

  return { internal, confirmation };
}

function buildInternalLeadHtml(lead: InstitutionalLeadEmailData, appUrl: string) {
  const rows = [
    ["Nombre y apellido", lead.fullName],
    ["Cargo / rol", lead.role],
    ["Institucion", lead.institutionName],
    ["Tipo de institucion", formatInstitutionType(lead.institutionType)],
    ["Pais", lead.country],
    ["Ciudad", lead.city],
    ["Cantidad aproximada de arbitros", formatOptionalNumber(lead.refereeCount)],
    ["Cantidad de instructores", formatOptionalNumber(lead.instructorCount)],
    ["Email", lead.email],
    ["WhatsApp", lead.whatsapp],
    ["Areas de interes", lead.interestAreas.join(", ") || "No especificado"],
    ["Mensaje", lead.message],
    ["Fecha de solicitud", formatDate(lead.createdAt)],
  ];

  return layoutEmail(`
    <p style="margin:0 0 18px;color:#d4d4d8;font-size:15px;line-height:1.6;">
      RefLab recibio una nueva solicitud comercial institucional.
    </p>
    <table style="width:100%;border-collapse:collapse;">
      ${rows
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:12px;border-bottom:1px solid #1f2937;color:#8b949e;font-size:12px;text-transform:uppercase;letter-spacing:.08em;width:38%;">${escapeHtml(label || "")}</td>
              <td style="padding:12px;border-bottom:1px solid #1f2937;color:#ffffff;font-size:14px;font-weight:700;">${escapeHtml(value || "No especificado")}</td>
            </tr>
          `
        )
        .join("")}
    </table>
    <p style="margin:22px 0 0;color:#8b949e;font-size:13px;line-height:1.6;">
      Panel admin: <a href="${escapeHtml(appUrl)}/admin/institutional-leads" style="color:#6fc11f;">${escapeHtml(appUrl)}/admin/institutional-leads</a>
    </p>
  `);
}

function buildConfirmationHtml(
  lead: InstitutionalLeadEmailData,
  institutionalEmail: string,
  appUrl: string
) {
  return layoutEmail(`
    <p style="margin:0 0 16px;color:#ffffff;font-size:18px;font-weight:800;">Hola ${escapeHtml(lead.fullName)},</p>
    <p style="margin:0 0 16px;color:#d4d4d8;font-size:15px;line-height:1.7;">
      Gracias por contactarte con RefLab.
    </p>
    <p style="margin:0 0 16px;color:#d4d4d8;font-size:15px;line-height:1.7;">
      Recibimos tu solicitud para conocer la propuesta institucional de RefLab para escuelas, ligas y asociaciones arbitrales.
    </p>
    <p style="margin:0 0 16px;color:#d4d4d8;font-size:15px;line-height:1.7;">
      Nuestro equipo revisara la informacion enviada y se pondra en contacto para coordinar una demo institucional.
    </p>
    <p style="margin:0 0 22px;color:#d4d4d8;font-size:15px;line-height:1.7;">
      RefLab busca digitalizar, medir y profesionalizar la formacion arbitral con experiencias diferenciadas: formacion inicial para escuelas, actualizacion para ligas y entrenamiento tecnico avanzado para asociaciones.
    </p>
    <a href="${escapeHtml(appUrl)}/institutional" style="display:inline-block;background:#6fc11f;color:#020b14;text-decoration:none;font-weight:900;padding:13px 18px;border-radius:14px;">
      Ver RefLab institucional
    </a>
    <p style="margin:26px 0 0;color:#d4d4d8;font-size:15px;line-height:1.7;">
      Saludos,<br/>
      Equipo RefLab<br/>
      <a href="mailto:${escapeHtml(institutionalEmail)}" style="color:#6fc11f;">${escapeHtml(institutionalEmail)}</a>
    </p>
  `);
}

function buildInternalLeadText(lead: InstitutionalLeadEmailData, appUrl: string) {
  return [
    "Nueva solicitud de demo institucional - RefLab",
    "",
    `Nombre y apellido: ${lead.fullName}`,
    `Cargo / rol: ${lead.role || "No especificado"}`,
    `Institucion: ${lead.institutionName}`,
    `Tipo de institucion: ${formatInstitutionType(lead.institutionType)}`,
    `Pais: ${lead.country || "No especificado"}`,
    `Ciudad: ${lead.city || "No especificado"}`,
    `Cantidad aproximada de arbitros: ${formatOptionalNumber(lead.refereeCount)}`,
    `Cantidad de instructores: ${formatOptionalNumber(lead.instructorCount)}`,
    `Email: ${lead.email}`,
    `WhatsApp: ${lead.whatsapp || "No especificado"}`,
    `Areas de interes: ${lead.interestAreas.join(", ") || "No especificado"}`,
    `Mensaje: ${lead.message || "No especificado"}`,
    `Fecha de solicitud: ${formatDate(lead.createdAt)}`,
    "",
    `Panel admin: ${appUrl}/admin/institutional-leads`,
  ].join("\n");
}

function buildConfirmationText(
  lead: InstitutionalLeadEmailData,
  institutionalEmail: string,
  appUrl: string
) {
  return [
    `Hola ${lead.fullName},`,
    "",
    "Gracias por contactarte con RefLab.",
    "",
    "Recibimos tu solicitud para conocer la propuesta institucional de RefLab para escuelas, ligas y asociaciones arbitrales.",
    "",
    "Nuestro equipo revisara la informacion enviada y se pondra en contacto para coordinar una demo institucional.",
    "",
    "RefLab busca digitalizar, medir y profesionalizar la formacion arbitral con experiencias diferenciadas: formacion inicial para escuelas, actualizacion para ligas y entrenamiento tecnico avanzado para asociaciones.",
    "",
    `Ver RefLab institucional: ${appUrl}/institutional`,
    "",
    "Saludos,",
    "Equipo RefLab",
    institutionalEmail,
  ].join("\n");
}

function layoutEmail(content: string) {
  return `
    <div style="margin:0;padding:0;background:#020b14;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
        <div style="border:1px solid #1f2937;background:#071019;border-radius:26px;padding:28px;">
          <div style="margin-bottom:24px;">
            <div style="font-size:25px;font-weight:900;letter-spacing:-.04em;color:#ffffff;">REF<span style="color:#6fc11f;">LAB</span></div>
            <div style="margin-top:6px;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.28em;">Referee Decision Lab</div>
          </div>
          ${content}
        </div>
      </div>
    </div>
  `;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatOptionalNumber(value?: number | null) {
  return typeof value === "number" ? String(value) : "No especificado";
}

function formatInstitutionType(value?: string | null) {
  if (
    value === "school" ||
    value === "league" ||
    value === "association" ||
    value === "federation"
  ) {
    return institutionTypeLabels[value as InstitutionType];
  }

  return value || "No especificado";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
